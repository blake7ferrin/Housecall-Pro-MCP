import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyHousecallProWebhookSignature(
  timestamp: string,
  rawBody: string | Buffer,
  signature: string,
  signingSecret: string,
): boolean {
  const body = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
  const signatureBody = `${timestamp}.${body}`;
  const expected = createHmac("sha256", signingSecret)
    .update(signatureBody)
    .digest("hex");

  try {
    const received = Buffer.from(signature, "utf8");
    const computed = Buffer.from(expected, "utf8");

    if (received.length !== computed.length) {
      return false;
    }

    return timingSafeEqual(received, computed);
  } catch {
    return false;
  }
}
