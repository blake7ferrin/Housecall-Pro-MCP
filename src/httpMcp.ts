/**
 * MCP over Streamable HTTP (Express) for deployment on Railway, Fly.io, etc.
 * Not for Vercel serverless — use a long-lived Node service.
 *
 * Endpoint: POST/GET/DELETE {MCP_HTTP_PATH} (default /mcp)
 * Health: GET /health
 *
 * Optional: MCP_HTTP_AUTH_TOKEN — require Authorization: Bearer <token>
 */
import "dotenv/config";

import { randomUUID } from "node:crypto";

import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { InMemoryEventStore } from "@modelcontextprotocol/sdk/examples/shared/inMemoryEventStore.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { Request, Response, NextFunction } from "express";

import { createHousecallProMcpServer } from "./mcpServerFactory.js";

const MCP_PATH = (process.env.MCP_HTTP_PATH ?? "/mcp").replace(/\/$/, "") || "/mcp";
const PORT = Number(process.env.PORT ?? "8080");
const BIND_HOST = process.env.MCP_HTTP_HOST ?? "0.0.0.0";
const AUTH_TOKEN = process.env.MCP_HTTP_AUTH_TOKEN?.trim();

const allowedHostsEnv = process.env.MCP_ALLOWED_HOSTS?.trim();
const allowedHosts = allowedHostsEnv
  ? allowedHostsEnv.split(",").map((h) => h.trim()).filter(Boolean)
  : undefined;

function bearerAuth(req: Request, res: Response, next: NextFunction) {
  if (!AUTH_TOKEN) {
    next();
    return;
  }
  const header = req.headers.authorization ?? "";
  const expected = `Bearer ${AUTH_TOKEN}`;
  if (header !== expected) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

async function main() {
  const app = createMcpExpressApp({
    host: BIND_HOST,
    ...(allowedHosts && allowedHosts.length > 0 ? { allowedHosts } : {}),
  });

  app.get("/health", (_req, res) => {
    res.status(200).type("text/plain").send("ok");
  });

  const transports: Record<string, StreamableHTTPServerTransport> = {};

  const mcpPostHandler = async (req: Request, res: Response) => {
    const sessionIdHeader = req.headers["mcp-session-id"];
    const sessionId = typeof sessionIdHeader === "string" ? sessionIdHeader : undefined;

    try {
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports[sessionId]) {
        transport = transports[sessionId];
      } else if (!sessionId && isInitializeRequest(req.body)) {
        const eventStore = new InMemoryEventStore();
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          eventStore,
          onsessioninitialized: (sid) => {
            transports[sid] = transport;
          },
        });
        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && transports[sid]) {
            delete transports[sid];
          }
        };
        const mcpServer = await createHousecallProMcpServer();
        await mcpServer.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      } else {
        res.status(400).json({
          jsonrpc: "2.0",
          error: {
            code: -32_000,
            message: "Bad Request: no valid mcp-session-id or initialize request",
          },
          id: null,
        });
        return;
      }

      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("MCP POST error:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32_603, message: "Internal server error" },
          id: null,
        });
      }
    }
  };

  const mcpGetHandler = async (req: Request, res: Response) => {
    const sessionIdHeader = req.headers["mcp-session-id"];
    const sessionId = typeof sessionIdHeader === "string" ? sessionIdHeader : undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send("Invalid or missing mcp-session-id");
      return;
    }
    await transports[sessionId].handleRequest(req, res);
  };

  const mcpDeleteHandler = async (req: Request, res: Response) => {
    const sessionIdHeader = req.headers["mcp-session-id"];
    const sessionId = typeof sessionIdHeader === "string" ? sessionIdHeader : undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send("Invalid or missing mcp-session-id");
      return;
    }
    try {
      await transports[sessionId].handleRequest(req, res);
    } catch (error) {
      console.error("MCP DELETE error:", error);
      if (!res.headersSent) {
        res.status(500).send("Error processing session termination");
      }
    }
  };

  app.post(MCP_PATH, bearerAuth, mcpPostHandler);
  app.get(MCP_PATH, bearerAuth, mcpGetHandler);
  app.delete(MCP_PATH, bearerAuth, mcpDeleteHandler);

  app.listen(PORT, BIND_HOST, () => {
    process.stdout.write(
      `Housecall Pro MCP (Streamable HTTP) on http://${BIND_HOST}:${PORT}${MCP_PATH}\n` +
        `Health: http://${BIND_HOST}:${PORT}/health\n` +
        `${AUTH_TOKEN ? "Auth: Bearer token required for MCP routes.\n" : "Auth: none (set MCP_HTTP_AUTH_TOKEN in production).\n"}`,
    );
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
