import { defineConfig } from "vite";

export default defineConfig({
  test: {
    // Vitest config — test files live in test/ which has its own tsconfig
    // No Node globals leak into web/src
    environment: "node",
  },
});
