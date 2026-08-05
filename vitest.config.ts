import { defineConfig } from "vitest/config";
import path from "path";

/**
 * Minimal Vitest config: only adds the `@/` path alias used by app/lib imports.
 * Does not change environment, include/exclude, setup, globals, timeouts, or coverage.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
