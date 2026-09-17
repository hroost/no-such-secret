import type { SecretObject } from "./durable-object/SecretObject";

export type Env = {
  SECRETS: DurableObjectNamespace<SecretObject>;
  PAYLOADS: R2Bucket;
  RATE_LIMITER: RateLimit;
  ASSETS: Fetcher;
  APP_NAME?: string;
  ORGANIZATION_NAME?: string;
  SUPPORT_URL?: string;
  ACCENT_COLOR?: string;
  LOGO_URL?: string;
  FAVICON_URL?: string;
  PUBLIC_BASE_URL?: string;
  MAX_PLAINTEXT_BYTES?: string;
  DEFAULT_TTL_SECONDS?: string;
  ALLOWED_TTL_SECONDS?: string;
  CF_ACCESS_AUD?: string;
  CF_ACCESS_TEAM_DOMAIN?: string;
  INTERNAL_AUTH_BYPASS?: string;
};

export type Identity = { email?: string };
