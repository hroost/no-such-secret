import { createExecutionContext, env, reset, SELF, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import worker from "../../worker/index";
import { encodeBase64Url } from "../../src/crypto/base64url";
import { decryptSecret } from "../../src/crypto/decrypt";
import { encryptSecret } from "../../src/crypto/encrypt";
import { parseFragment } from "../../src/crypto/fragment";

const jsonRequest = (path: string, body: unknown) => new Request(`https://share.example.test${path}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

async function createShare(audience: "internal" | "external", text: string) {
  const encrypted = await encryptSecret({ kind: "text" }, new TextEncoder().encode(text));
  const response = await SELF.fetch(jsonRequest("/api/internal/shares", { audience, ttlSeconds: 3600, ...encrypted.upload }));
  expect(response.status).toBe(201);
  const { id } = await response.json<{ id: string }>();
  return { id, encrypted };
}

afterEach(async () => reset());

describe("Worker security boundaries", () => {
  it("rejects internal pages and APIs when Access authentication is absent", async () => {
    const productionEnv = { ...env, INTERNAL_AUTH_BYPASS: "false", CF_ACCESS_AUD: "test-audience", CF_ACCESS_TEAM_DOMAIN: "https://example.cloudflareaccess.com" };

    for (const request of [
      new Request("https://share.example.test/"),
      jsonRequest("/api/internal/requests", { audience: "internal", ttlSeconds: 3600 }),
    ]) {
      const context = createExecutionContext();
      const response = await worker.fetch(request, productionEnv, context);
      await waitOnExecutionContext(context);
      expect(response.status).toBe(403);
      expect(response.headers.get("cache-control")).toContain("no-store");
    }
  });

  it("does not consume a share on GET and permits exactly one concurrent reveal", async () => {
    const { id, encrypted } = await createShare("external", "concurrent reveal");
    const statusPath = `/api/public/shares/${id}/status`;

    expect((await SELF.fetch(`https://share.example.test${statusPath}`)).status).toBe(200);
    expect((await SELF.fetch(`https://share.example.test${statusPath}`)).status).toBe(200);

    const { key, claim } = parseFragment(encrypted.fragment);
    const revealPath = `/api/public/shares/${id}/reveal`;
    const [first, second] = await Promise.all([
      SELF.fetch(jsonRequest(revealPath, { claim: encodeBase64Url(claim) })),
      SELF.fetch(jsonRequest(revealPath, { claim: encodeBase64Url(claim) })),
    ]);
    const responses = [first, second];
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 404]);

    const winner = responses.find(({ status }) => status === 200)!;
    const decrypted = await decryptSecret(key, winner.headers.get("x-secret-nonce")!, new Uint8Array(await winner.arrayBuffer()));
    expect(new TextDecoder().decode(decrypted.content)).toBe("concurrent reveal");
    expect((await SELF.fetch(jsonRequest(revealPath, { claim: encodeBase64Url(claim) }))).status).toBe(404);
    expect((await env.PAYLOADS.list()).objects).toHaveLength(0);
  });

  it("accepts one external request submission and reveals it only internally", async () => {
    const created = await SELF.fetch(jsonRequest("/api/internal/requests", { audience: "external", ttlSeconds: 3600 }));
    expect(created.status).toBe(201);
    const { id } = await created.json<{ id: string }>();
    const first = await encryptSecret({ kind: "text" }, new TextEncoder().encode("first sender"));
    const second = await encryptSecret({ kind: "text" }, new TextEncoder().encode("second sender"));
    const submissionPath = `/api/public/requests/${id}/submit`;

    const submissions = await Promise.all([
      SELF.fetch(jsonRequest(submissionPath, first.upload)),
      SELF.fetch(jsonRequest(submissionPath, second.upload)),
    ]);
    expect(submissions.map(({ status }) => status).sort()).toEqual([201, 409]);

    const publicStatus = await SELF.fetch(`https://share.example.test/api/public/requests/${id}/status`);
    expect(await publicStatus.json()).toEqual({ status: "unavailable" });

    const winner = submissions[0]!.status === 201 ? first : second;
    const fragment = parseFragment(winner.fragment);
    expect((await SELF.fetch(jsonRequest(`/api/public/requests/${id}/reveal`, { claim: encodeBase64Url(fragment.claim) }))).status).toBe(404);

    const revealed = await SELF.fetch(jsonRequest(`/api/internal/requests/${id}/reveal`, { claim: encodeBase64Url(fragment.claim) }));
    expect(revealed.status).toBe(200);
    const decrypted = await decryptSecret(fragment.key, revealed.headers.get("x-secret-nonce")!, new Uint8Array(await revealed.arrayBuffer()));
    expect(new TextDecoder().decode(decrypted.content)).toMatch(/ sender$/);
  });

  it("does not consume a share when the claim is wrong", async () => {
    const { id, encrypted } = await createShare("external", "still available");
    const fragment = parseFragment(encrypted.fragment);
    const wrongClaim = encodeBase64Url(crypto.getRandomValues(new Uint8Array(32)));
    const path = `/api/public/shares/${id}/reveal`;

    expect((await SELF.fetch(jsonRequest(path, { claim: wrongClaim }))).status).toBe(404);
    const response = await SELF.fetch(jsonRequest(path, { claim: encodeBase64Url(fragment.claim) }));
    expect(response.status).toBe(200);
    const result = await decryptSecret(fragment.key, response.headers.get("x-secret-nonce")!, new Uint8Array(await response.arrayBuffer()));
    expect(new TextDecoder().decode(result.content)).toBe("still available");
  });
});
