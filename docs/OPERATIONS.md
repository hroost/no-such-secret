# Operations runbook

## Before deployment

- Use separate Worker, R2 bucket, Durable Object namespace, rate-limit namespace, Access application, hostname, and credentials for each environment.
- Keep R2 private and set a lifecycle rule longer than the application's maximum seven-day TTL as defense in depth.
- Verify `INTERNAL_AUTH_BYPASS` is absent or `false`. It is for local development only.
- Review configuration for example domains, account identifiers, secrets, and unexpected third-party origins.
- Run `pnpm install --frozen-lockfile`, `pnpm run check`, `pnpm run lint`, `pnpm test`, `pnpm run build`, and `pnpm exec wrangler deploy --dry-run`.
- Review Durable Object migrations as forward-only changes. Test them in an isolated environment before production.

Deploy with `pnpm run deploy`, then complete the post-deploy checklist in the README using disposable values.

## Routine monitoring

Monitor availability, error rate, rate-limit pressure, Worker and Durable Object exceptions, alarm failures, and unexpected R2 growth. Alerts and dashboards must not record request bodies, query data, claims, URL fragments, plaintext, or decrypted metadata. Restrict access to logs and keep retention short.

Periodically verify that:

- Cloudflare Access protects every internal page and API route and explicitly excludes only the intended public routes.
- The R2 bucket has no public development URL or custom domain.
- expired and consumed payloads are removed;
- dependency, secret-scan, and CI checks are green; and
- no analytics, service worker, third-party script, or permissive CSP has been introduced.

## Incident response

1. Preserve relevant configuration, deploy history, and metadata-only logs. Do not reproduce an incident with a real secret or publish capability URLs.
2. If frontend integrity or deployment credentials may be compromised, disable the public route or Worker, revoke the credentials, and deploy from a reviewed commit. Assume secrets opened during the affected window may be exposed.
3. If Cloudflare Access is misconfigured, deny internal routes at the edge, rotate affected Access/service credentials, and verify Worker-side JWT settings before restoring service.
4. If R2 data is exposed, make the bucket private immediately. Stored payloads are encrypted, but treat associated metadata as disclosed and investigate whether frontend code or capability URLs were also compromised.
5. Publish a scoped advisory through GitHub Security Advisories when users need to take action. Never include live secret URLs or plaintext in an issue, log, or advisory draft.

Content encryption keys are generated per secret and are not held by the service, so there is no server-side content key to rotate.

## Rollback and recovery

Application code can be redeployed from a reviewed earlier commit when its bindings and Durable Object schema remain compatible. Do not roll back or delete a Durable Object class after a forward schema migration without a tested migration plan. Strict consume-before-read semantics mean an interrupted successful reveal is intentionally not recoverable.

## Teardown

Disable routes first, then remove the Access application, Worker, alarms/Durable Objects, and R2 objects/bucket according to the organization's retention policy. Revoke deployment credentials and remove DNS records. Confirm that no bucket public endpoint or stale environment remains reachable.
