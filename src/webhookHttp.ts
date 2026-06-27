import type { Request, Response } from "express";

import { getWebhookEventStore } from "./webhookStore.js";
import { verifyHousecallProWebhookSignature } from "./webhookVerification.js";

function parseJsonPayload(rawBody: Buffer): unknown {
  const text = rawBody.toString("utf8");

  if (!text) {
    return {};
  }

  return JSON.parse(text) as unknown;
}

export function createHousecallWebhookHandler() {
  const store = getWebhookEventStore();

  return (req: Request, res: Response) => {
    const signingSecret = process.env.HOUSECALL_PRO_WEBHOOK_SIGNING_SECRET;
    const skipVerification = process.env.HOUSECALL_PRO_WEBHOOK_SKIP_VERIFY === "true";

    if (!Buffer.isBuffer(req.body)) {
      res.status(400).json({ error: "Expected JSON request body." });
      return;
    }

    if (!signingSecret && !skipVerification) {
      res.status(503).json({
        error: "Webhook signing secret is not configured. Set HOUSECALL_PRO_WEBHOOK_SIGNING_SECRET.",
      });
      return;
    }

    const timestamp = req.header("Api-Timestamp") ?? req.header("api-timestamp") ?? "";
    const signature = req.header("Api-Signature") ?? req.header("api-signature") ?? "";

    if (!skipVerification) {
      if (!timestamp || !signature) {
        res.status(401).json({ error: "Missing Api-Timestamp or Api-Signature header." });
        return;
      }

      if (!verifyHousecallProWebhookSignature(timestamp, req.body, signature, signingSecret!)) {
        res.status(401).json({ error: "Invalid webhook signature." });
        return;
      }
    }

    let payload: unknown;

    try {
      payload = parseJsonPayload(req.body);
    } catch {
      res.status(400).json({ error: "Invalid JSON payload." });
      return;
    }

    const record = store.add(payload);

    res.status(200).json({
      ok: true,
      id: record.id,
      event: record.event,
    });
  };
}
