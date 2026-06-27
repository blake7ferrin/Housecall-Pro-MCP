import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { getWebhookEventStore } from "./webhookStore.js";
import { runJsonRequest } from "./mcpHelpers.js";

export function registerWebhookTools(server: McpServer): void {
  const store = getWebhookEventStore();

  server.registerTool(
    "housecall_list_webhook_events",
    {
      title: "List Recent Housecall Pro Webhook Events",
      description:
        "List webhook events received by the HTTP ingress at POST /webhooks/housecall. Requires the HTTP server (npm start).",
      inputSchema: {
        event: z.string().min(1).optional(),
        limit: z.number().int().positive().max(200).optional(),
      },
    },
    async ({ event, limit }) => runJsonRequest(async () => ({
      count: store.count(),
      events: store.list({ event, limit }),
    })),
  );

  server.registerTool(
    "housecall_get_webhook_event",
    {
      title: "Get Housecall Pro Webhook Event",
      description: "Fetch one stored webhook event by ID from the local webhook ingress buffer.",
      inputSchema: {
        eventId: z.string().min(1),
      },
    },
    async ({ eventId }) => runJsonRequest(async () => {
      const record = store.get(eventId);

      if (!record) {
        throw new Error(`Webhook event ${eventId} was not found in the local buffer.`);
      }

      return record;
    }),
  );

  server.registerTool(
    "housecall_clear_webhook_events",
    {
      title: "Clear Stored Housecall Pro Webhook Events",
      description: "Clear the in-memory webhook event buffer. Useful for development and testing.",
      inputSchema: {},
    },
    async () => runJsonRequest(async () => ({
      cleared: store.clear(),
    })),
  );
}
