import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          INTERNAL_AUTH_BYPASS: "true",
          PUBLIC_BASE_URL: "https://share.example.test",
        },
      },
    }),
  ],
  test: {
    include: ["test/integration/**/*.test.ts"],
  },
});
