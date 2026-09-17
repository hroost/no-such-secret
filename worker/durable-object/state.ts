import type { SecretRecord } from "../../src/shared/contracts";

export function isExpired(record: SecretRecord, now = Date.now()): boolean { return now >= record.expiresAt; }
export function canSubmit(record: SecretRecord, now = Date.now()): boolean { return record.mode === "request" && record.state === "OPEN" && !isExpired(record, now); }
export function canReveal(record: SecretRecord, now = Date.now()): boolean { return record.state === "FILLED" && !isExpired(record, now); }

export function fill(record: SecretRecord, payloadObjectKey: string, encryptedByteLength: number, claimVerifier: string, now = Date.now()): SecretRecord {
  if (!canSubmit(record, now)) throw new Error("Request is not open");
  return { ...record, state: "FILLED", filledAt: now, expiresAt: now + record.ttlSeconds * 1000, payloadObjectKey, encryptedByteLength, claimVerifier };
}

export function consume(record: SecretRecord, now = Date.now()): SecretRecord {
  if (!canReveal(record, now)) throw new Error("Secret is unavailable");
  return { ...record, state: "CONSUMED", consumedAt: now };
}
