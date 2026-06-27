import { strict as assert } from "node:assert";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";

import { verifyHousecallProWebhookSignature } from "./webhookVerification.js";

describe("verifyHousecallProWebhookSignature", () => {
  it("accepts a valid HMAC signature", () => {
    const timestamp = "1677189615";
    const body = "{\"event\":\"job.created\",\"company_id\":\"abc\"}";
    const secret = "test-signing-secret";
    const signature = createHmac("sha256", secret)
      .update(`${timestamp}.${body}`)
      .digest("hex");

    assert.equal(verifyHousecallProWebhookSignature(timestamp, body, signature, secret), true);
  });

  it("rejects an invalid signature", () => {
    assert.equal(verifyHousecallProWebhookSignature(
      "1677189615",
      "{\"event\":\"job.created\"}",
      "invalid",
      "test-signing-secret",
    ), false);
  });
});
