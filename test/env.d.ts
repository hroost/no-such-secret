import type { Env as WorkerEnv } from "../worker/types";

declare global {
  namespace Cloudflare {
    // The plugin merges this interface into its test bindings.
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface Env extends WorkerEnv {}
  }
}

export {};
