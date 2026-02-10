import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_TIMESTAMP_AGE_MS = 5 * 60 * 1000;

/** Verifies a GitHub webhook HMAC-SHA256 signature (sha256=<hex>). */
export function verifyGitHubSignature(
  body: Buffer,
  signatureHeader: string,
  secret: string,
): boolean {
  if (!signatureHeader.startsWith("sha256=")) return false;
  const signature = signatureHeader.slice("sha256=".length);
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  if (expected.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
}

/** Verifies a Linear webhook HMAC-SHA256 signature and checks timestamp freshness. */
export function verifyWebhookSignature(
  body: string,
  signature: string,
  timestamp: string,
  secret: string,
): boolean {
  const ts = Number(timestamp);
  if (Number.isNaN(ts) || Date.now() - ts > MAX_TIMESTAMP_AGE_MS) {
    return false;
  }

  const expected = createHmac("sha256", secret).update(body).digest("hex");

  if (expected.length !== signature.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
}

/** Buffer-based signature verification for byte-accurate HMAC. */
export function verifyWebhookSignatureBuffer(
  body: Buffer,
  signature: string,
  timestamp: string,
  secret: string,
): boolean {
  const ts = Number(timestamp);
  if (Number.isNaN(ts) || Date.now() - ts > MAX_TIMESTAMP_AGE_MS) {
    return false;
  }

  const expected = createHmac("sha256", secret).update(body).digest("hex");

  if (expected.length !== signature.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
}
