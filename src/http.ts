import "dotenv/config";

import { randomUUID } from "node:crypto";

import type { Request, Response, NextFunction } from "express";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { InMemoryEventStore } from "@modelcontextprotocol/sdk/examples/shared/inMemoryEventStore.js";

import { buildMcpServer } from "./mcpServer.js";

function getPort(): number {
  const raw = process.env.PORT ?? process.env.MCP_PORT ?? "3000";
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 3000;
  }
  return parsed;
}

function requireRailwayBearer(req: Request, res: Response, next: NextFunction) {
  const token = process.env.MCP_BEARER_TOKEN;
  if (!token) {
    return next();
  }

  const header = req.header("authorization") ?? "";
  const [scheme, value] = header.split(" ");
  if (scheme?.toLowerCase() === "bearer" && value === token) {
    return next();
  }

  res.status(401).json({ error: "Unauthorized" });
}

// Bind intent must be 0.0.0.0 for public deploys (e.g. Railway). Default "127.0.0.1"
// enables localhost-only Host validation and rejects real hostnames like *.up.railway.app.
const app = createMcpExpressApp({ host: "0.0.0.0" });

app.get("/healthz", (_req: Request, res: Response) => {
  res.status(200).json({ ok: true });
});

// Map to store transports by session ID for stateful Streamable HTTP.
const transports: Record<string, StreamableHTTPServerTransport> = {};

const mcpHandler = async (req: Request, res: Response) => {
  const sessionId = req.header("mcp-session-id") ?? undefined;

  try {
    let transport: StreamableHTTPServerTransport | undefined;

    if (sessionId && transports[sessionId]) {
      transport = transports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      const eventStore = new InMemoryEventStore();
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        eventStore,
        onsessioninitialized: (sid) => {
          transports[sid] = transport!;
        },
      });
      transport.onclose = () => {
        const sid = transport!.sessionId;
        if (sid && transports[sid]) {
          delete transports[sid];
        }
      };

      const server = buildMcpServer();
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    } else {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Bad Request: No valid session ID provided" },
        id: null,
      });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
};

app.post("/mcp", requireRailwayBearer, mcpHandler);

app.get("/mcp", requireRailwayBearer, async (req: Request, res: Response) => {
  const sessionId = req.header("mcp-session-id") ?? undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }

  await transports[sessionId].handleRequest(req, res);
});

app.delete("/mcp", requireRailwayBearer, async (req: Request, res: Response) => {
  const sessionId = req.header("mcp-session-id") ?? undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }

  await transports[sessionId].handleRequest(req, res);
});

const port = getPort();
app.listen(port, (error?: unknown) => {
  if (error) {
    process.stderr.write(`Failed to start HTTP server: ${String(error)}\n`);
    process.exit(1);
  }
  process.stdout.write(`MCP HTTP server listening on :${port}\n`);
});

