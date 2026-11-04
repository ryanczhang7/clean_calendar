import { defineConfig, devices } from "@playwright/test";
import { STUB_ORIGIN } from "./e2e/fixtures/geminiStub.ts";
import { local, OWNER_EMAIL } from "./e2e/fixtures/session.ts";

// CAL-031 Contract Block 1. `pnpm exec supabase start` (Docker) is the
// operator's prerequisite, never started here. Without it `local()` throws;
// the config then falls back to placeholders so `playwright test --list`
// still loads, and a run fails at the functions runtime instead.
function appEnv(): Record<string, string> {
  try {
    const { url, anonKey } = local();
    return {
      VITE_SUPABASE_URL: url,
      VITE_SUPABASE_ANON_KEY: anonKey,
      // A build-time constant (src/lib/supabase.ts): the address
      // supabase/seed.sql puts in app_config.
      VITE_OWNER_EMAIL: OWNER_EMAIL,
    };
  } catch {
    return {
      VITE_SUPABASE_URL: "http://127.0.0.1:54321",
      VITE_SUPABASE_ANON_KEY: "e2e-placeholder-anon-key",
      VITE_OWNER_EMAIL: OWNER_EMAIL,
    };
  }
}

const chrome = { ...devices["Desktop Chrome"] };

export default defineConfig({
  testDir: "e2e",
  // One local database is shared by every spec (CAL-031 Block 1).
  workers: 1,
  fullyParallel: false,
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: "http://localhost:4173",
  },
  // `smoke` is listed first so that, on one worker, AC-1 meets the database
  // global-setup just reset - before any other spec seeds kinds into it. The
  // smoke spec asserts that precondition itself rather than trusting this.
  projects: [
    { name: "smoke", testMatch: /smoke\.spec\.ts$/, use: chrome },
    { name: "chromium", testIgnore: /smoke\.spec\.ts$/, use: chrome },
  ],
  webServer: [
    {
      name: "gemini-stub",
      command: "node e2e/fixtures/geminiStub.ts",
      url: `${STUB_ORIGIN}/__health`,
      reuseExistingServer: !process.env.CI,
    },
    {
      // `supabase start` already runs an edge runtime that answers
      // /functions/v1/capture with 401 - without GEMINI_API_BASE. So a ready
      // URL here would be "ready" before this command ran (and, with
      // reuseExistingServer, would never run it). Readiness is the CLI's own
      // line instead, printed once the runtime it restarted with this env
      // file is serving; with no `url` the command always runs.
      name: "functions",
      command:
        "pnpm exec supabase functions serve --env-file e2e/fixtures/functions.env",
      wait: {
        stdout: /Serving functions on/,
        stderr: /Serving functions on/,
      },
      timeout: 120_000,
      // The CLI reports a failed start on stdout; without this it is lost.
      stdout: "pipe",
    },
    {
      name: "app",
      // Builds first so the gate never previews a stale or missing dist/.
      command: "pnpm build && pnpm exec vite preview --port 4173",
      url: "http://localhost:4173",
      reuseExistingServer: !process.env.CI,
      // Playwright merges this over process.env, so PATH survives.
      env: appEnv(),
    },
  ],
});
