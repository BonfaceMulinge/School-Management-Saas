import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // Vitest runs outside the Next.js runtime, so the `server-only` guard
      // (used by several server modules) resolves to a harmless stub here.
      "server-only": path.resolve(__dirname, "tests/server-only-stub.ts"),
    },
  },
  test: {
    globals: true,
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup-env.ts"],
    testTimeout: 60000,
    hookTimeout: 120000,
  },
});
