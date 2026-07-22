import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: { alias: { "@": resolve(__dirname, "src") } },
  test: {
    environment: "jsdom",
    environmentMatchGlobs: [["**/*.test.js", "node"], ["**/*.dom.test.js", "jsdom"]],
  },
});
