import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "jsdom",
          setupFiles: ["src/test/setup.ts"],
          include: ["src/**/*.test.{ts,tsx}", "shared/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "db",
          environment: "node",
          include: ["supabase/tests/**/*.db.test.ts"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["src/**", "shared/**"],
      exclude: [
        "src/main.tsx",
        "src/sw.ts",
        "src/test/**",
        "**/*.test.*",
        // A two-line createClient factory with no branch; every test mocks
        // it whole at this boundary, so it never executes under test (CAL-003).
        "src/lib/supabase.ts",
      ],
      // A floor on the whole project: the gate fails when any one of the
      // four is below 80.00 over the included files.
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
      },
    },
  },
});
