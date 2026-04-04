export type QueryPrimitive = string | number | boolean;

export type QueryValue = QueryPrimitive | QueryPrimitive[] | undefined;

export type QueryParams = Record<string, QueryValue>;

export type HousecallProAuthScheme = "auto" | "bearer" | "token" | "x-api-key" | "authorization";

export interface HousecallProConfig {
  apiKey?: string;
  bearerToken?: string;
  authScheme: HousecallProAuthScheme;
  baseUrl: string;
  customersPath: string;
  customerPath: string;
  jobsPath: string;
  jobPath: string;
  estimatesPath: string;
  estimatePath: string;
  invoicesPath: string;
  invoicePath: string;
  jobInvoicesPath: string;
  leadsPath: string;
}

export interface HousecallProErrorDetails {
  status: number;
  statusText: string;
  body: unknown;
}
