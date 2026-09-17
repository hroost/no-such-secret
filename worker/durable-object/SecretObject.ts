import { DurableObject } from "cloudflare:workers";
import { asArrayBuffer, decodeBase64Url, encodeBase64Url } from "../../src/crypto/base64url";
import type { Audience, SecretRecord, UploadManifest } from "../../src/shared/contracts";
import type { Env } from "../types";
import { canReveal, canSubmit, consume, isExpired } from "./state";

type Operation = "status" | "create-share" | "create-request" | "submit" | "reveal";
type RequestBody = { id?: string; audience?: Audience; ttlSeconds?: number; createdBy?: string; upload?: UploadManifest; claim?: string };

const recordKey = "record";
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
const unavailable = () => json({ error: "unavailable" }, 404);

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let different = 0;
  for (let i = 0; i < left.byteLength; i++) different |= left[i]! ^ right[i]!;
  return different === 0;
}

export class SecretObject extends DurableObject<Env> {
  private readonly ready: Promise<void>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ready = this.ctx.blockConcurrencyWhile(async () => {});
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;
    const url = new URL(request.url);
    const operation = url.pathname.slice(1) as Operation;
    let body: RequestBody = {};
    if (request.method === "POST") {
      try { body = await request.json() as RequestBody; } catch { return unavailable(); }
    }
    if (!["status", "create-share", "create-request", "submit", "reveal"].includes(operation)) return unavailable();
    const record = await this.ctx.storage.get<SecretRecord>(recordKey);
    if (record && await this.expireIfNeeded(record)) return unavailable();
    if (operation === "create-share") return this.createShare(record, body);
    if (operation === "create-request") return this.createRequest(record, body);
    if (!record) return unavailable();
    if (!this.matches(record, operation, url.searchParams.get("mode"), url.searchParams.get("audience"))) return unavailable();
    if (operation === "status") return json({ status: record.state === "OPEN" ? "open" : record.state === "FILLED" ? "filled" : "unavailable" });
    if (operation === "submit") return this.submit(record, body);
    return this.reveal(record, body);
  }

  private matches(record: SecretRecord, operation: Operation, mode: string | null, audience: string | null): boolean {
    if (record.mode !== mode) return false;
    // Requests inherit their submission audience, but their completed payload is always
    // revealed through the Access-protected internal endpoint.
    if (record.mode === "request" && operation === "reveal") return audience === "internal";
    return record.audience === audience;
  }

  private async createShare(existing: SecretRecord | undefined, body: RequestBody): Promise<Response> {
    if (existing || !body.id || !body.audience || !body.ttlSeconds || !body.upload) return unavailable();
    const now = Date.now();
    const record: SecretRecord = { schemaVersion: 1, id: body.id, mode: "share", audience: body.audience, state: "UPLOADING", createdAt: now, expiresAt: now + body.ttlSeconds * 1000, ttlSeconds: body.ttlSeconds, ...(body.createdBy ? { createdBy: body.createdBy } : {}) };
    await this.ctx.storage.put(recordKey, record);
    return this.storeUpload(record, body.upload, true);
  }

  private async createRequest(existing: SecretRecord | undefined, body: RequestBody): Promise<Response> {
    if (existing || !body.id || !body.audience || !body.ttlSeconds) return unavailable();
    const now = Date.now();
    const record: SecretRecord = { schemaVersion: 1, id: body.id, mode: "request", audience: body.audience, state: "OPEN", createdAt: now, expiresAt: now + body.ttlSeconds * 1000, ttlSeconds: body.ttlSeconds, ...(body.createdBy ? { createdBy: body.createdBy } : {}) };
    await this.ctx.storage.put(recordKey, record);
    await this.ctx.storage.setAlarm(record.expiresAt);
    return json({ ok: true }, 201);
  }

  private async submit(record: SecretRecord, body: RequestBody): Promise<Response> {
    if (!canSubmit(record) || !body.upload) return json({ error: "unavailable" }, 409);
    record.state = "UPLOADING";
    await this.ctx.storage.put(recordKey, record);
    return this.storeUpload(record, body.upload, false);
  }

  private async storeUpload(record: SecretRecord, upload: UploadManifest, isShare: boolean): Promise<Response> {
    const objectKey = `payload/${encodeBase64Url(crypto.getRandomValues(new Uint8Array(24)))}`;
    try {
      const ciphertext = decodeBase64Url(upload.ciphertext);
      await this.env.PAYLOADS.put(objectKey, ciphertext, { httpMetadata: { contentType: "application/octet-stream" }, customMetadata: { nonce: upload.nonce } });
      const now = Date.now();
      record.state = "FILLED";
      record.filledAt = now;
      record.expiresAt = isShare ? record.expiresAt : now + record.ttlSeconds * 1000;
      record.payloadObjectKey = objectKey;
      record.encryptedByteLength = ciphertext.byteLength;
      record.claimVerifier = upload.claimVerifier;
      await this.ctx.storage.put(recordKey, record);
      await this.ctx.storage.setAlarm(record.expiresAt);
      return json({ ok: true }, 201);
    } catch {
      if (record.mode === "request") { record.state = "OPEN"; await this.ctx.storage.put(recordKey, record); }
      else await this.ctx.storage.delete(recordKey);
      await this.env.PAYLOADS.delete(objectKey);
      return json({ error: "unavailable" }, 503);
    }
  }

  private async reveal(record: SecretRecord, body: RequestBody): Promise<Response> {
    if (!canReveal(record) || !body.claim || !record.claimVerifier) return unavailable();
    const claimHash = new Uint8Array(await crypto.subtle.digest("SHA-256", asArrayBuffer(decodeBase64Url(body.claim, 32))));
    if (!bytesEqual(claimHash, decodeBase64Url(record.claimVerifier, 32))) return unavailable();
    record = consume(record);
    await this.ctx.storage.put(recordKey, record); // transition precedes any ciphertext read
    let object: R2ObjectBody | null;
    try { object = record.payloadObjectKey ? await this.env.PAYLOADS.get(record.payloadObjectKey) : null; } catch { return unavailable(); }
    if (!object) return unavailable();
    this.ctx.waitUntil(this.env.PAYLOADS.delete(record.payloadObjectKey!));
    return new Response(object.body, { headers: { "Content-Type": "application/octet-stream", "X-Secret-Nonce": object.customMetadata?.nonce ?? "" } });
  }

  private async expireIfNeeded(record: SecretRecord): Promise<boolean> {
    if (!isExpired(record)) return false;
    if (record.payloadObjectKey) await this.env.PAYLOADS.delete(record.payloadObjectKey);
    await this.ctx.storage.delete(recordKey);
    return true;
  }

  async alarm(): Promise<void> {
    const record = await this.ctx.storage.get<SecretRecord>(recordKey);
    if (record) await this.expireIfNeeded(record);
  }
}
