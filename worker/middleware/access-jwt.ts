import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Identity, Env } from "../types";

const jwksByIssuer = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function jwksFor(issuer: string) {
  let jwks = jwksByIssuer.get(issuer);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    jwksByIssuer.set(issuer, jwks);
  }
  return jwks;
}

export async function requireAccess(request: Request, env: Env): Promise<Identity | null> {
  if (env.INTERNAL_AUTH_BYPASS === "true") return { email: "local-development@example.invalid" };
  if (!env.CF_ACCESS_AUD || !env.CF_ACCESS_TEAM_DOMAIN) return null;
  const assertion = request.headers.get("cf-access-jwt-assertion");
  if (!assertion) return null;
  try {
    const issuer = new URL(env.CF_ACCESS_TEAM_DOMAIN).origin;
    const { payload } = await jwtVerify(assertion, jwksFor(issuer), { issuer, audience: env.CF_ACCESS_AUD, algorithms: ["RS256"] });
    return typeof payload.email === "string" ? { email: payload.email } : {};
  } catch { return null; }
}
