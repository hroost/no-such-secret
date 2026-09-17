import { Hono } from "hono";
import { encodeBase64Url } from "../src/crypto/base64url";
import { configuredLimits } from "../src/shared/limits";
import type { Audience, Mode } from "../src/shared/contracts";
import { SecretObject } from "./durable-object/SecretObject";
import { requireAccess } from "./middleware/access-jwt";
import { secure, unavailable } from "./middleware/headers";
import { exposedStatus, isId, parseClaim, parseRequest, parseUpload } from "./validation/input";
import { readJsonBody } from "./validation/body";
import type { Env, Identity } from "./types";

export { SecretObject };

type Variables = { identity?: Identity };
const app = new Hono<{ Bindings: Env; Variables: Variables }>();

const SMALL_JSON_BYTES = 1024;
const uploadJsonBytes = (maximumCiphertextBytes: number) => Math.ceil(maximumCiphertextBytes * 4 / 3) + 4096;
function randomId(): string { return encodeBase64Url(crypto.getRandomValues(new Uint8Array(24))); }
function doStub(env: Env, id: string) { return env.SECRETS.get(env.SECRETS.idFromName(id)); }
function objectRequest(operation: string, mode: Mode, audience: Audience, payload?: object): Request {
  return new Request(`https://secret-object/${operation}?mode=${mode}&audience=${audience}`, { method: operation === "status" ? "GET" : "POST", ...(payload ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) } : {}) });
}
async function invoke(env: Env, id: string, operation: string, mode: Mode, audience: Audience, payload?: object): Promise<Response> { return doStub(env, id).fetch(objectRequest(operation, mode, audience, payload)); }
async function rateLimit(request: Request, env: Env, key: string): Promise<boolean> {
  const actor = request.headers.get("cf-connecting-ip") ?? "unknown";
  const result = await env.RATE_LIMITER.limit({ key: `${key}:${actor}` });
  return result.success;
}
async function internal(c: { req: { raw: Request }; env: Env; set: (key: "identity", value: Identity) => void }, next: () => Promise<void>) {
  const identity = await requireAccess(c.req.raw, c.env);
  if (!identity) return new Response(null, { status: 403 });
  c.set("identity", identity);
  await next();
}

function label(value: string | undefined, fallback: string, maximumLength: number): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length <= maximumLength ? trimmed : fallback;
}

function optionalLabel(value: string | undefined, maximumLength: number): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length <= maximumLength ? trimmed : undefined;
}

function absoluteHttpUrl(value: string | undefined, fallback: string): string {
  try {
    const parsed = new URL(value ?? fallback);
    return parsed.protocol === "https:" || parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" ? parsed.origin : fallback;
  } catch { return fallback; }
}

function optionalPublicUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? parsed.href : undefined;
  } catch { return value.startsWith("/") && !value.startsWith("//") ? value : undefined; }
}

function optionalAssetPath(value: string | undefined): string | undefined {
  return value?.startsWith("/") && !value.startsWith("//") ? value : undefined;
}

app.get("/api/config", (c) => {
  const limits = configuredLimits(c.env);
  const origin = new URL(c.req.url).origin;
  return c.json({
    appName: label(c.env.APP_NAME, "NoSuchSecret", 80),
    organizationName: optionalLabel(c.env.ORGANIZATION_NAME, 120),
    supportUrl: optionalPublicUrl(c.env.SUPPORT_URL),
    logoUrl: optionalAssetPath(c.env.LOGO_URL),
    faviconUrl: optionalAssetPath(c.env.FAVICON_URL),
    accentColor: /^#[0-9a-fA-F]{6}$/.test(c.env.ACCENT_COLOR ?? "") ? c.env.ACCENT_COLOR : "#1554b9",
    publicBaseUrl: absoluteHttpUrl(c.env.PUBLIC_BASE_URL, origin),
    maxPlaintextBytes: limits.maxPlaintextBytes,
    defaultTtlSeconds: limits.defaultTtlSeconds,
    allowedTtlSeconds: limits.allowedTtlSeconds,
  });
});

app.post("/api/internal/shares", internal, async (c) => {
  if (!await rateLimit(c.req.raw, c.env, `create:${c.get("identity")?.email ?? "unknown"}`)) return c.body(null, 429);
  const limits = configuredLimits(c.env); const parsedBody = await readJsonBody(c.req.raw, uploadJsonBytes(limits.maxPlaintextBytes + 8192));
  if (!parsedBody.ok) return c.body(null, parsedBody.status);
  const input = parsedBody.value;
  const fields = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const request = parseRequest({ audience: fields.audience, ttlSeconds: fields.ttlSeconds }, limits.allowedTtlSeconds); const upload = parseUpload({ schemaVersion: fields.schemaVersion, nonce: fields.nonce, claimVerifier: fields.claimVerifier, ciphertext: fields.ciphertext }, limits.maxPlaintextBytes + 8192);
  if (!request || !upload) return c.body(null, 400);
  const id = randomId();
  const email = c.get("identity")?.email;
  const response = await invoke(c.env, id, "create-share", "share", request.audience, { id, audience: request.audience, ttlSeconds: request.ttlSeconds, upload, ...(email ? { createdBy: email } : {}) });
  if (!response.ok) return new Response(response.body, { status: response.status, headers: response.headers });
  return c.json({ id }, 201);
});

app.post("/api/internal/requests", internal, async (c) => {
  if (!await rateLimit(c.req.raw, c.env, `create:${c.get("identity")?.email ?? "unknown"}`)) return c.body(null, 429);
  const parsedBody = await readJsonBody(c.req.raw, SMALL_JSON_BYTES); if (!parsedBody.ok) return c.body(null, parsedBody.status);
  const limits = configuredLimits(c.env); const request = parseRequest(parsedBody.value, limits.allowedTtlSeconds);
  if (!request) return c.body(null, 400);
  const id = randomId();
  const email = c.get("identity")?.email;
  const response = await invoke(c.env, id, "create-request", "request", request.audience, { id, audience: request.audience, ttlSeconds: request.ttlSeconds, ...(email ? { createdBy: email } : {}) });
  if (!response.ok) return new Response(response.body, { status: response.status, headers: response.headers });
  return c.json({ id }, 201);
});

function status(scope: Audience, mode: Mode) {
  return async (c: { req: { raw: Request; param: (name: string) => string }; env: Env }) => {
    const id = c.req.param("id"); if (!isId(id)) return unavailable();
    if (scope === "external" && !await rateLimit(c.req.raw, c.env, `status:${mode}:${id}`)) return new Response(null, { status: 429 });
    const response = await invoke(c.env, id, "status", mode, scope);
    if (!response.ok) return unavailable();
    const value = await response.json<{ status: string }>();
    return new Response(JSON.stringify({ status: exposedStatus(scope, mode, value.status) }), { headers: { "Content-Type": "application/json" } });
  };
}
function submit(scope: Audience) {
  return async (c: { req: { raw: Request; param: (name: string) => string }; env: Env }) => {
    const limits = configuredLimits(c.env); const parsedBody = await readJsonBody(c.req.raw, uploadJsonBytes(limits.maxPlaintextBytes + 8192));
    if (!parsedBody.ok) return new Response(null, { status: parsedBody.status });
    const id = c.req.param("id"); const upload = parseUpload(parsedBody.value, limits.maxPlaintextBytes + 8192);
    if (!isId(id) || !upload) return new Response(null, { status: 400 });
    if (scope === "external" && !await rateLimit(c.req.raw, c.env, `submit:${id}`)) return new Response(null, { status: 429 });
    return invoke(c.env, id, "submit", "request", scope, { upload });
  };
}
function reveal(scope: Audience, mode: Mode) {
  return async (c: { req: { raw: Request; param: (name: string) => string }; env: Env }) => {
    const parsedBody = await readJsonBody(c.req.raw, SMALL_JSON_BYTES); if (!parsedBody.ok) return new Response(null, { status: parsedBody.status });
    const id = c.req.param("id"); const claim = parseClaim(parsedBody.value);
    if (!isId(id) || !claim) return unavailable();
    if (scope === "external" && !await rateLimit(c.req.raw, c.env, `reveal:${id}`)) return new Response(null, { status: 429 });
    return invoke(c.env, id, "reveal", mode, scope, { claim });
  };
}

app.get("/api/internal/shares/:id/status", internal, status("internal", "share"));
app.get("/api/public/shares/:id/status", status("external", "share"));
app.get("/api/internal/requests/:id/status", internal, status("internal", "request"));
app.get("/api/public/requests/:id/status", status("external", "request"));
app.post("/api/internal/requests/:id/submit", internal, submit("internal"));
app.post("/api/public/requests/:id/submit", submit("external"));
app.post("/api/internal/shares/:id/reveal", internal, reveal("internal", "share"));
app.post("/api/public/shares/:id/reveal", reveal("external", "share"));
app.post("/api/internal/requests/:id/reveal", internal, reveal("internal", "request"));

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    let response: Response;
    if (url.pathname.startsWith("/api/")) response = await app.fetch(request, env, ctx);
    else if (url.pathname === "/" || url.pathname === "/share" || url.pathname === "/request" || url.pathname.startsWith("/internal/")) {
      const identity = await requireAccess(request, env);
      response = identity ? await env.ASSETS.fetch(request) : new Response("Unauthorized", { status: 403 });
    } else response = await env.ASSETS.fetch(request);
    return secure(response);
  }
};
