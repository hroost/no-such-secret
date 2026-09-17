import { decodeBase64Url } from "../../src/crypto/base64url";
import type { Audience, CreateRequest, Mode, UploadManifest } from "../../src/shared/contracts";
import { MAX_CIPHERTEXT_BYTES } from "../../src/shared/limits";

const own = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).every((key) => keys.includes(key));

export function isId(id: string): boolean { try { return decodeBase64Url(id, 24).byteLength === 24; } catch { return false; } }

export function parseAudience(value: unknown): Audience | null { return value === "internal" || value === "external" ? value : null; }

export function parseRequest(value: unknown, allowedTtls: number[]): CreateRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const audience = parseAudience(input.audience);
  if (!own(input, ["audience", "ttlSeconds"]) || !audience || typeof input.ttlSeconds !== "number" || !Number.isInteger(input.ttlSeconds) || !allowedTtls.includes(input.ttlSeconds)) return null;
  return { audience, ttlSeconds: input.ttlSeconds };
}

export function parseUpload(value: unknown, maxCiphertextBytes = MAX_CIPHERTEXT_BYTES): UploadManifest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (!own(input, ["schemaVersion", "nonce", "claimVerifier", "ciphertext"]) || input.schemaVersion !== 1 || typeof input.nonce !== "string" || typeof input.claimVerifier !== "string" || typeof input.ciphertext !== "string") return null;
  try {
    const nonce = decodeBase64Url(input.nonce, 12);
    const verifier = decodeBase64Url(input.claimVerifier, 32);
    const ciphertext = decodeBase64Url(input.ciphertext);
    if (!nonce || !verifier || ciphertext.byteLength < 24 || ciphertext.byteLength > maxCiphertextBytes) return null;
  } catch { return null; }
  return input as unknown as UploadManifest;
}

export function parseClaim(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (!own(input, ["claim"]) || typeof input.claim !== "string") return null;
  try { decodeBase64Url(input.claim, 32); return input.claim; } catch { return null; }
}

export function exposedStatus(scope: Audience, mode: Mode, status: string): "open" | "filled" | "unavailable" {
  if (scope === "external" && mode === "request") return status === "open" ? "open" : "unavailable";
  return status === "open" || status === "filled" ? status : "unavailable";
}
