export const WEBHOOK_EVENT_REFERENCE = {
  patterns: {
    "job.*": "Job lifecycle events",
    "job.appointment.*": "Appointment sub-events",
    "customer.*": "Customer events",
    "estimate.*": "Estimate events",
    "estimate.option.*": "Estimate option events",
    "lead.*": "Lead events",
    "invoice.*": "Invoice events",
    "invoice.payment.*": "Invoice payment events",
    "invoice.refund.*": "Invoice refund events",
    "organization.*": "Application enable/disable events",
  },
  commonPayloadFields: [
    "event",
    "company_id",
    "event_occurred_at",
    "event_created_at",
  ],
  examples: [
    "job.created",
    "job.updated",
    "job.scheduled",
    "job.completed",
    "customer.created",
    "estimate.option.approved",
    "lead.converted",
    "invoice.paid",
    "organization.application_enabled",
  ],
  verification: {
    headers: ["Api-Timestamp", "Api-Signature"],
    algorithm: "HMAC-SHA256",
    signatureBody: "timestamp + '.' + json_payload",
  },
} as const;

export const API_CONVENTIONS_REFERENCE = {
  authentication: {
    apiKey: "Authorization: Token <key>",
    oauth: "Authorization: Bearer <access_token>",
  },
  pagination: {
    defaults: { page: 1, page_size: 10 },
    responseFields: ["page", "page_size", "total_pages", "total_items"],
  },
  multiLocation: {
    header: "X-Company-Id",
    discoveryEndpoint: "GET /company",
  },
  monetaryValues: "Integers in cents (1000 = $10.00)",
  quantityField: "qty_in_hundredths represents quantity x 100",
  dateFormats: {
    timestamps: "ISO-8601 (YYYY-MM-DDTHH:MM:SSZ)",
    dates: "YYYY-MM-DD",
  },
  workStatuses: {
    jobs: [
      "needs scheduling",
      "scheduled",
      "in progress",
      "complete rated",
      "complete unrated",
      "user canceled",
      "pro canceled",
    ],
    estimates: [
      "open",
      "needs scheduling",
      "scheduled",
      "in progress",
      "submitted for signoff",
      "timed out",
      "canceled",
      "deleted",
      "complete unrated",
      "complete rated",
      "created job from estimate",
    ],
  },
  errorHandling: {
    401: "Invalid or expired token — refresh OAuth token if applicable",
    404: "Resource not found",
    422: "Validation error",
    429: "Rate limited — retry with backoff",
  },
} as const;
