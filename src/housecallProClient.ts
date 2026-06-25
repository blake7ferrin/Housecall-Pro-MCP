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
  HOUSECALL_PRO_COMPANY_ID: z.string().optional(),
  HOUSECALL_PRO_BASE_URL: z.string().url().default("https://api.housecallpro.com"),
  HOUSECALL_PRO_CUSTOMERS_PATH: z.string().default("/customers"),
  HOUSECALL_PRO_CUSTOMER_PATH: z.string().default("/customers/{customerId}"),
  HOUSECALL_PRO_JOBS_PATH: z.string().default("/jobs"),
  HOUSECALL_PRO_JOB_PATH: z.string().default("/jobs/{jobId}"),
  HOUSECALL_PRO_ESTIMATES_PATH: z.string().default("/estimates"),
  HOUSECALL_PRO_ESTIMATE_PATH: z.string().default("/estimates/{estimateId}"),
  HOUSECALL_PRO_INVOICES_PATH: z.string().default("/invoices"),
  HOUSECALL_PRO_INVOICE_PATH: z.string().default("/invoices/{invoiceId}"),
  HOUSECALL_PRO_JOB_INVOICES_PATH: z.string().default("/jobs/{jobId}/invoices"),
  HOUSECALL_PRO_LEADS_PATH: z.string().default("/leads"),
  HOUSECALL_PRO_OAUTH_CLIENT_ID: z.string().optional(),
  HOUSECALL_PRO_OAUTH_CLIENT_SECRET: z.string().optional(),
  HOUSECALL_PRO_OAUTH_REFRESH_TOKEN: z.string().optional(),
  HOUSECALL_PRO_OAUTH_REDIRECT_URI: z.string().url().optional(),
  HOUSECALL_PRO_RATE_LIMIT_MAX_RETRIES: z.coerce.number().int().nonnegative().default(3),
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  created_at?: string;
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

  const oauthCredentialsPresent = Boolean(
    parsed.HOUSECALL_PRO_OAUTH_CLIENT_ID
      || parsed.HOUSECALL_PRO_OAUTH_CLIENT_SECRET
      || parsed.HOUSECALL_PRO_OAUTH_REFRESH_TOKEN
      || parsed.HOUSECALL_PRO_OAUTH_REDIRECT_URI,
  );

  if (oauthCredentialsPresent) {
    if (
      !parsed.HOUSECALL_PRO_OAUTH_CLIENT_ID
      || !parsed.HOUSECALL_PRO_OAUTH_CLIENT_SECRET
      || !parsed.HOUSECALL_PRO_OAUTH_REFRESH_TOKEN
      || !parsed.HOUSECALL_PRO_OAUTH_REDIRECT_URI
    ) {
      throw new Error(
        "OAuth refresh requires HOUSECALL_PRO_OAUTH_CLIENT_ID, HOUSECALL_PRO_OAUTH_CLIENT_SECRET, HOUSECALL_PRO_OAUTH_REFRESH_TOKEN, and HOUSECALL_PRO_OAUTH_REDIRECT_URI.",
      );
    }
  }

  return {
    apiKey: parsed.HOUSECALL_PRO_API_KEY,
    bearerToken: parsed.HOUSECALL_PRO_BEARER_TOKEN,
    authScheme: parsed.HOUSECALL_PRO_AUTH_SCHEME,
    companyId: parsed.HOUSECALL_PRO_COMPANY_ID,
    oauth: oauthCredentialsPresent
      ? {
        clientId: parsed.HOUSECALL_PRO_OAUTH_CLIENT_ID!,
        clientSecret: parsed.HOUSECALL_PRO_OAUTH_CLIENT_SECRET!,
        refreshToken: parsed.HOUSECALL_PRO_OAUTH_REFRESH_TOKEN!,
        redirectUri: parsed.HOUSECALL_PRO_OAUTH_REDIRECT_URI!,
      }
      : undefined,
    rateLimitMaxRetries: parsed.HOUSECALL_PRO_RATE_LIMIT_MAX_RETRIES,
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
  private bearerToken?: string;
  private oauth?: HousecallProConfig["oauth"];

  constructor(private readonly config: HousecallProConfig) {
    this.bearerToken = config.bearerToken;
    this.oauth = config.oauth ? { ...config.oauth } : undefined;
  }

  private canRefreshOAuth(): boolean {
    return Boolean(this.oauth);
  }

  private async refreshOAuthToken(): Promise<void> {
    if (!this.oauth) {
      throw new Error("OAuth refresh credentials are not configured.");
    }

    const response = await fetch(`${this.config.baseUrl}/oauth/token`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: this.oauth.clientId,
        client_secret: this.oauth.clientSecret,
        grant_type: "refresh_token",
        refresh_token: this.oauth.refreshToken,
        redirect_uri: this.oauth.redirectUri,
      }),
    });

    const body = await parseResponseBody(response);

    if (!response.ok) {
      throw new HousecallProApiError(`Housecall Pro OAuth token refresh failed: ${response.status} ${response.statusText}`, {
        status: response.status,
        statusText: response.statusText,
        body,
      });
    }

    const tokenResponse = body as OAuthTokenResponse;

    if (!tokenResponse.access_token) {
      throw new HousecallProApiError("Housecall Pro OAuth token refresh returned no access_token.", {
        status: response.status,
        statusText: response.statusText,
        body,
      });
    }

    this.bearerToken = tokenResponse.access_token;

    if (tokenResponse.refresh_token) {
      this.oauth = {
        ...this.oauth,
        refreshToken: tokenResponse.refresh_token,
      };
    }
  }

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

    const credential = this.bearerToken ?? this.config.apiKey;

    if (credential) {
      const effectiveScheme = this.config.authScheme === "auto"
        ? (this.bearerToken ? "bearer" : "token")
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

    if (this.config.companyId) {
      headers.set("X-Company-Id", this.config.companyId);
    }

    return headers;
  }

  private async executeRequest<T>(method: string, path: string, options?: {
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

  private async request<T>(method: string, path: string, options?: {
    pathParams?: Record<string, string>;
    query?: QueryParams;
    body?: unknown;
  }, hasRefreshedOAuth = false): Promise<T> {
    let rateLimitAttempt = 0;

    while (true) {
      try {
        return await this.executeRequest<T>(method, path, options);
      } catch (error) {
        if (!(error instanceof HousecallProApiError)) {
          throw error;
        }

        if (error.details.status === 401 && !hasRefreshedOAuth && this.canRefreshOAuth()) {
          await this.refreshOAuthToken();
          return this.request<T>(method, path, options, true);
        }

        if (error.details.status === 429 && rateLimitAttempt < this.config.rateLimitMaxRetries) {
          const delayMs = Math.min(1_000 * (2 ** rateLimitAttempt), 32_000);
          rateLimitAttempt += 1;
          await sleep(delayMs);
          continue;
        }

        throw error;
      }
    }
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

  getInvoicePreview(invoiceId: string) {
    return this.get(`${this.config.invoicePath}/preview`, {
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
