import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // The parsers are pure functions over fixtures and run in milliseconds.
    // Keep this fast so it can gate every push without anyone resenting it.
    testTimeout: 10_000,
    coverage: {
      provider: "v8",
      include: ["lib/data-sources/parsers/**", "lib/security/**"],
      reporter: ["text", "html"],
    },
  },
  resolve: {
    alias: {
     "@": path.resolve(import.meta.dirname),
"server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
    },
  },
});