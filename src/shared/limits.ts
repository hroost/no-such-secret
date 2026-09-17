export const MAX_PLAINTEXT_BYTES = 10 * 1024 * 1024;
export const TTL_OPTIONS = [3600, 86400, 259200, 604800] as const;
export const DEFAULT_TTL_SECONDS = 86400;
export const MAX_CIPHERTEXT_BYTES = MAX_PLAINTEXT_BYTES + 8192;

export function configuredLimits(env: { MAX_PLAINTEXT_BYTES?: string; DEFAULT_TTL_SECONDS?: string; ALLOWED_TTL_SECONDS?: string }) {
  const configuredMaximum = Number(env.MAX_PLAINTEXT_BYTES);
  const maximum = Number.isSafeInteger(configuredMaximum) && configuredMaximum > 0 ? configuredMaximum : MAX_PLAINTEXT_BYTES;
  const allowed = (env.ALLOWED_TTL_SECONDS ?? TTL_OPTIONS.join(","))
    .split(",").map(Number).filter((seconds) => TTL_OPTIONS.includes(seconds as (typeof TTL_OPTIONS)[number]));
  return {
    maxPlaintextBytes: Math.min(maximum, MAX_PLAINTEXT_BYTES),
    defaultTtlSeconds: allowed.includes(Number(env.DEFAULT_TTL_SECONDS)) ? Number(env.DEFAULT_TTL_SECONDS) : DEFAULT_TTL_SECONDS,
    allowedTtlSeconds: allowed.length ? allowed : [...TTL_OPTIONS],
  };
}
