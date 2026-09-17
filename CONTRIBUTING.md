# Contributing

Install Node 22+ and pnpm 11, run `pnpm install`, then use `pnpm run check`, `pnpm run lint`, and `pnpm test` before opening a pull request. Keep changes focused and include tests for behavior changes.

Security-sensitive changes—cryptography, URL fragments, authentication, Durable Object transitions, storage, headers, and logging—must describe the threat model and preserve the invariant that no backend receives an AES key or plaintext. Do not add telemetry, third-party scripts, or real deployment identifiers without an explicit project decision.

By contributing, you agree that your contribution is licensed under the repository's MIT License. No contributor license agreement is required.
