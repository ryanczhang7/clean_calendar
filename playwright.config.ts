import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  use: {
    baseURL: "http://localhost:4173",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Builds first so the gate never previews a stale or missing dist/.
    command: "pnpm build && pnpm exec vite preview --port 4173",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    // The built app calls createClient at module load and throws
    // "supabaseUrl is required." without these, rendering nothing. No e2e
    // spec reaches Supabase; these are placeholders, not secrets (CAL-017 PO
    // decision 6). Playwright merges this over process.env, so PATH survives.
    env: {
      VITE_SUPABASE_URL: "http://127.0.0.1:54321",
      VITE_SUPABASE_ANON_KEY: "e2e-placeholder-anon-key",
    },
  },
});
