import js from "@eslint/js";
import { globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(globalIgnores(["dist/**", "node_modules/**", ".wrangler/**"]), js.configs.recommended, ...tseslint.configs.recommended, {
  languageOptions: { globals: { ...globals.browser, ...globals.worker, ...globals.node } },
});
