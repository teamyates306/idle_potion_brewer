import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    // Two-speed suite:
    //   logic — pure game-math tests (*.test.ts), node environment, fast.
    //   ui    — component tests (*.test.tsx), jsdom + testing-library, heavy.
    // `npm run test:logic` / `npm run test:ui` select one; `npm test` runs both.
    projects: [
      {
        extends: true,
        test: {
          name: "logic",
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "ui",
          environment: "jsdom",
          include: ["src/**/*.test.tsx"],
          setupFiles: "./src/test-setup.ts",
        },
      },
    ],
  },
});
