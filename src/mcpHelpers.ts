import {
  HousecallProApiError,
} from "./housecallProClient.js";

export function toJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function formatError(error: unknown): string {
  if (error instanceof HousecallProApiError) {
    return [
      error.message,
      "",
      "Details:",
      toJson(error.details),
    ].join("\n");
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "An unknown error occurred.";
}

export function textResponse(text: string, isError = false) {
  return {
    ...(isError ? { isError: true } : {}),
    content: [
      {
        type: "text" as const,
        text,
      },
    ],
  };
}

export async function runJsonRequest(fn: () => Promise<unknown>) {
  try {
    return textResponse(toJson(await fn()));
  } catch (error) {
    return textResponse(formatError(error), true);
  }
}

export function resourceJsonResponse(uri: string, value: unknown) {
  return {
    contents: [
      {
        uri,
        mimeType: "application/json",
        text: toJson(value),
      },
    ],
  };
}

export function resourceErrorResponse(uri: string, error: unknown) {
  return {
    contents: [
      {
        uri,
        mimeType: "text/plain",
        text: formatError(error),
      },
    ],
  };
}
