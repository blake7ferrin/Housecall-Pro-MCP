import { z } from "zod";

import type {
  HousecallProAuthScheme,
  HousecallProConfig,
  HousecallProErrorDetails,
  QueryParams,
  QueryValue,
} from "./types.js";

const configSchema = z.object({
  HOUSECALL_PRO_API_KEY: z.string().optional(),
  HOUSECALL_PRO_BEARER_TOKEN: z.string().optional(),
  HOUSECALL_PRO_AUTH_SCHEME: z
    .enum(["auto", "bearer", "token", "x-api-key", "authorization"] satisfies HousecallProAuthScheme[])
    .default("auto"),
  HOUSECALL_PRO_BASE_URL: z.string().url().default("https://api.housecallpro.com"),
  HOUSECALL_PRO_CUSTOMERS_PATH: z.string().default("/customers"),
  HOUSECALL_PRO_CUSTOMER_PATH: z.string().default("/customers/{customerId}"),
  HOUSECALL_PRO_JOBS_PATH: z.string().default("/jobs"),
  HOUSECALL_PRO_JOB_PATH: z.string().default("/jobs/{jobId}"),
  HOUSECALL_PRO_ESTIMATES_PATH: z.string().default("/estimates"),
  HOUSECALL_PRO_ESTIMATE_PATH: z.string().default("/estimates/{estimateId}"),
  HOUSECALL_PRO_INVOICES_PATH: z.string().default("/invoices"),
  HOUSECALL_PRO_INVOICE_PATH: z.string().default("/api/invoices/{invoiceId}"),
  HOUSECALL_PRO_JOB_INVOICES_PATH: z.string().default("/jobs/{jobId}/invoices"),
  HOUSECALL_PRO_LEADS_PATH: z.string().default("/leads"),
});

function normalizePath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function setQueryParam(searchParams: URLSearchParams, key: string, value: QueryValue) {
  if (value === undefined) {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      searchParams.append(key, String(item));
    }
    return;
  }

  searchParams.set(key, String(value));
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  return response.text();
}

export class HousecallProApiError extends Error {
  details: HousecallProErrorDetails;

  constructor(message: string, details: HousecallProErrorDetails) {
    super(message);
    this.name = "HousecallProApiError";
    this.details = details;
  }
}

export function loadHousecallProConfig(env: NodeJS.ProcessEnv = process.env): HousecallProConfig {
  const parsed = configSchema.parse(env);

  if (!parsed.HOUSECALL_PRO_API_KEY && !parsed.HOUSECALL_PRO_BEARER_TOKEN) {
    throw new Error(
      "Set HOUSECALL_PRO_API_KEY or HOUSECALL_PRO_BEARER_TOKEN before starting the Housecall Pro MCP server.",
    );
  }

  return {
    apiKey: parsed.HOUSECALL_PRO_API_KEY,
    bearerToken: parsed.HOUSECALL_PRO_BEARER_TOKEN,
    authScheme: parsed.HOUSECALL_PRO_AUTH_SCHEME,
    baseUrl: parsed.HOUSECALL_PRO_BASE_URL.replace(/\/+$/, ""),
    customersPath: normalizePath(parsed.HOUSECALL_PRO_CUSTOMERS_PATH),
    customerPath: normalizePath(parsed.HOUSECALL_PRO_CUSTOMER_PATH),
    jobsPath: normalizePath(parsed.HOUSECALL_PRO_JOBS_PATH),
    jobPath: normalizePath(parsed.HOUSECALL_PRO_JOB_PATH),
    estimatesPath: normalizePath(parsed.HOUSECALL_PRO_ESTIMATES_PATH),
    estimatePath: normalizePath(parsed.HOUSECALL_PRO_ESTIMATE_PATH),
    invoicesPath: normalizePath(parsed.HOUSECALL_PRO_INVOICES_PATH),
    invoicePath: normalizePath(parsed.HOUSECALL_PRO_INVOICE_PATH),
    jobInvoicesPath: normalizePath(parsed.HOUSECALL_PRO_JOB_INVOICES_PATH),
    leadsPath: normalizePath(parsed.HOUSECALL_PRO_LEADS_PATH),
  };
}

export class HousecallProClient {
  constructor(private readonly config: HousecallProConfig) {}

  private buildUrl(pathTemplate: string, pathParams: Record<string, string> = {}, query?: QueryParams): URL {
    const resolvedPath = Object.entries(pathParams).reduce((path, [key, value]) => {
      return path.replaceAll(`{${key}}`, encodeURIComponent(value));
    }, pathTemplate);

    const url = new URL(`${this.config.baseUrl}${resolvedPath}`);

    for (const [key, value] of Object.entries(query ?? {})) {
      setQueryParam(url.searchParams, key, value);
    }

    return url;
  }

  private buildHeaders(jsonBody?: unknown): Headers {
    const headers = new Headers({
      Accept: "application/json",
    });

    if (jsonBody !== undefined) {
      headers.set("Content-Type", "application/json");
    }

    const credential = this.config.bearerToken ?? this.config.apiKey;

    if (credential) {
      const effectiveScheme = this.config.authScheme === "auto"
        ? (this.config.bearerToken ? "bearer" : "token")
        : this.config.authScheme;

      switch (effectiveScheme) {
        case "x-api-key":
          headers.set("x-api-key", credential);
          break;
        case "token":
          headers.set("Authorization", `Token ${credential}`);
          break;
        case "authorization":
          headers.set("Authorization", credential);
          break;
        case "bearer":
        default:
          headers.set("Authorization", `Bearer ${credential}`);
          break;
      }
    }

    return headers;
  }

  private async request<T>(method: string, path: string, options?: {
    pathParams?: Record<string, string>;
    query?: QueryParams;
    body?: unknown;
  }): Promise<T> {
    const url = this.buildUrl(path, options?.pathParams, options?.query);
    const response = await fetch(url, {
      method,
      headers: this.buildHeaders(options?.body),
      body: options?.body === undefined ? undefined : JSON.stringify(options.body),
    });

    const body = await parseResponseBody(response);

    if (!response.ok) {
      throw new HousecallProApiError(`Housecall Pro request failed: ${response.status} ${response.statusText}`, {
        status: response.status,
        statusText: response.statusText,
        body,
      });
    }

    return body as T;
  }

  get<T = unknown>(path: string, options?: {
    pathParams?: Record<string, string>;
    query?: QueryParams;
  }) {
    return this.request<T>("GET", path, options);
  }

  post<T = unknown>(path: string, options?: {
    pathParams?: Record<string, string>;
    query?: QueryParams;
    body?: unknown;
  }) {
    return this.request<T>("POST", path, options);
  }

  put<T = unknown>(path: string, options?: {
    pathParams?: Record<string, string>;
    query?: QueryParams;
    body?: unknown;
  }) {
    return this.request<T>("PUT", path, options);
  }

  delete<T = unknown>(path: string, options?: {
    pathParams?: Record<string, string>;
    query?: QueryParams;
    body?: unknown;
  }) {
    return this.request<T>("DELETE", path, options);
  }

  listCustomers(query: QueryParams = {}) {
    return this.get(this.config.customersPath, { query });
  }

  createCustomer(body: Record<string, unknown>) {
    return this.post(this.config.customersPath, {
      body,
    });
  }

  updateCustomer(customerId: string, body: Record<string, unknown>) {
    return this.put(this.config.customerPath, {
      pathParams: { customerId },
      body,
    });
  }

  getCustomer(customerId: string) {
    return this.get(this.config.customerPath, {
      pathParams: { customerId },
    });
  }

  listJobs(query: QueryParams = {}) {
    return this.get(this.config.jobsPath, { query });
  }

  createJob(body: Record<string, unknown>) {
    return this.post(this.config.jobsPath, {
      body,
    });
  }

  getJob(jobId: string) {
    return this.get(this.config.jobPath, {
      pathParams: { jobId },
    });
  }

  listEstimates(query: QueryParams = {}) {
    return this.get(this.config.estimatesPath, { query });
  }

  getEstimate(estimateId: string) {
    return this.get(this.config.estimatePath, {
      pathParams: { estimateId },
    });
  }

  createEstimate(body: Record<string, unknown>) {
    return this.post(this.config.estimatesPath, {
      body,
    });
  }

  listInvoices(query: QueryParams = {}) {
    return this.get(this.config.invoicesPath, { query });
  }

  getInvoice(invoiceId: string) {
    return this.get(this.config.invoicePath, {
      pathParams: { invoiceId },
    });
  }

  getJobInvoices(jobId: string, query: QueryParams = {}) {
    return this.get(this.config.jobInvoicesPath, {
      pathParams: { jobId },
      query,
    });
  }

  createLead(body: Record<string, unknown>) {
    return this.post(this.config.leadsPath, {
      body,
    });
  }
}
