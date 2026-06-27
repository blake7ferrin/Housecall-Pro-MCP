import { randomUUID } from "node:crypto";

export interface StoredWebhookEvent {
  id: string;
  receivedAt: string;
  event: string;
  companyId?: string;
  eventOccurredAt?: string;
  eventCreatedAt?: string;
  payload: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractWebhookFields(payload: unknown): Pick<
  StoredWebhookEvent,
  "event" | "companyId" | "eventOccurredAt" | "eventCreatedAt"
> {
  if (!isRecord(payload)) {
    return { event: "unknown" };
  }

  return {
    event: typeof payload.event === "string" ? payload.event : "unknown",
    ...(typeof payload.company_id === "string" ? { companyId: payload.company_id } : {}),
    ...(typeof payload.event_occurred_at === "string" ? { eventOccurredAt: payload.event_occurred_at } : {}),
    ...(typeof payload.event_created_at === "string" ? { eventCreatedAt: payload.event_created_at } : {}),
  };
}

export class WebhookEventStore {
  private readonly events: StoredWebhookEvent[] = [];

  constructor(private readonly maxEvents: number) {}

  add(payload: unknown): StoredWebhookEvent {
    const record: StoredWebhookEvent = {
      id: randomUUID(),
      receivedAt: new Date().toISOString(),
      ...extractWebhookFields(payload),
      payload,
    };

    this.events.unshift(record);

    if (this.events.length > this.maxEvents) {
      this.events.length = this.maxEvents;
    }

    return record;
  }

  list(options: { event?: string; limit?: number } = {}): StoredWebhookEvent[] {
    const limit = options.limit ?? 50;
    const filtered = options.event
      ? this.events.filter((record) => record.event === options.event)
      : this.events;

    return filtered.slice(0, limit);
  }

  get(id: string): StoredWebhookEvent | undefined {
    return this.events.find((record) => record.id === id);
  }

  clear(): number {
    const removed = this.events.length;
    this.events.length = 0;
    return removed;
  }

  count(): number {
    return this.events.length;
  }
}

let store: WebhookEventStore | undefined;

export function getWebhookEventStore(): WebhookEventStore {
  if (!store) {
    const maxEvents = Number.parseInt(process.env.HOUSECALL_PRO_WEBHOOK_MAX_EVENTS ?? "500", 10);
    store = new WebhookEventStore(Number.isFinite(maxEvents) && maxEvents > 0 ? maxEvents : 500);
  }

  return store;
}
