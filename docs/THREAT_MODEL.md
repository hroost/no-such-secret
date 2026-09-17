# Threat model

This document describes the intended security properties of NoSuchSecret. It is a design guide, not a claim that the software is free of vulnerabilities.

## Assets and trust boundaries

The protected assets are plaintext secrets, file contents, per-secret AES keys, claim capabilities, encrypted payloads, and authenticated user identity. Trust crosses these boundaries:

1. Plaintext exists in the sender and recipient browsers. The browser code and deployed origin must therefore be trusted.
2. The URL fragment contains the AES key and claim capability. Browsers do not include fragments in HTTP requests, but browser extensions, local history, screenshots, clipboard managers, and same-origin JavaScript may expose them.
3. The Worker receives ciphertext and receives the claim only for a reveal. It authenticates internal routes independently of Cloudflare Access edge policy.
4. A Durable Object serializes state changes for one public ID. R2 stores only opaque ciphertext and metadata required for decryption.

## Required security properties

- Encryption uses a fresh browser-generated AES-256-GCM key and nonce for every payload.
- The AES key and plaintext never enter an API request, server-side log, Durable Object, or R2 object.
- Public IDs do not authorize reveal by themselves. Reveal also requires a separate 256-bit claim capability.
- Internal routes require a valid Cloudflare Access JWT with the configured issuer and audience. Edge policy is defense in depth, not the sole authentication check.
- Status checks and page loads do not consume secrets. Reveal is an explicit `POST` operation.
- A valid reveal atomically commits the object to `CONSUMED` before ciphertext is returned. Concurrent attempts produce at most one successful response.
- Incorrect claims and unknown, expired, consumed, or wrong-flow objects use indistinguishable unavailable responses where practical.
- Responses containing application or secret data are not cached, indexed, or sent with referrer information.

## Principal threats and controls

| Threat | Control | Residual risk |
| --- | --- | --- |
| Guessing a link or object ID | High-entropy IDs plus an independent claim | A full URL is a bearer capability and must be protected |
| Replay or concurrent reveal | Durable Object serialization and consume-before-read | A lost successful response makes the secret unrecoverable by design |
| Storage disclosure | Client-side AES-GCM; R2 contains ciphertext only | Traffic size, timing, expiry, and object identifiers remain observable |
| Internal-route bypass | Worker-side JWT signature, issuer, audience, and expiry checks | Access configuration and account administrators remain trusted |
| Cross-flow or audience confusion | Route, object type, and audience checks | New routes must preserve these checks |
| XSS or malicious frontend deployment | Restrictive CSP, no third-party scripts, controlled deployment pipeline | Same-origin code can access plaintext and fragment keys; server-side encryption cannot solve this |
| Leakage through logs, caches, analytics, or referrers | No-store/no-referrer/noindex headers; no telemetry or body logging | Operators must keep platform logging and future integrations constrained |
| Resource exhaustion | Payload limits, expiry alarms, and rate limiting by source/identity and ID | Distributed abuse and platform-level costs are not eliminated |
| Supply-chain compromise | Frozen lockfile, pinned CI actions, dependency review, audit, and secret scanning | Maintainers must review updates and protect publishing/deployment credentials |

## Non-goals

- Protecting a user whose browser, extension, operating system, clipboard, or deployed JavaScript is compromised.
- Recovering a secret after it has been consumed, expired, deleted, or returned in a response that the recipient failed to receive.
- Hiding that an encrypted object exists, its approximate size, or request timing from the Cloudflare account operator.
- Providing multi-recipient access, audit history, sender revocation after reveal, or long-term archival.

Security-sensitive changes should update this document and include tests for the affected invariant. Report vulnerabilities through the private process in [SECURITY.md](../SECURITY.md).
