/// <reference types="vitest/config" />
import { defineConfig } from "vite";

export default defineConfig({
  // Relative base so the build works at keivanmalhani.github.io/printcheck
  // and on any static host without configuration.
  base: "./",
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
