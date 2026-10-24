import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { precachedUrls } from "./precache.ts";

// CAL-017 AC-2, Contract Block 2. Reads the build output with node:fs; no
// browser page. It lives under Playwright because the integration gate's
// webServer runs `pnpm build` first, so dist/ is fresh here and never a stale
// build left lying around.

const DIST = join(import.meta.dirname, "..", "dist");

function read(name: string): string {
  const path = join(DIST, name);
  expect(existsSync(path), `dist/${name} is missing from the build`).toBe(true);
  return readFileSync(path, "utf8");
}

test("the build emits the service worker as dist/sw.js", () => {
  expect(existsSync(join(DIST, "sw.js")), "dist/sw.js is missing").toBe(true);
});

test("the build emits manifest.webmanifest with every field of src/pwa/manifest.ts", async () => {
  const built = JSON.parse(read("manifest.webmanifest")) as Record<
    string,
    unknown
  >;
  // A dynamic import, so `playwright test --list` can still load this file
  // while src/pwa/manifest.ts does not exist yet (RED).
  const { manifest } = await import("../src/pwa/manifest.ts");
  const keys = Object.keys(manifest);
  expect(keys.length).toBeGreaterThan(0);
  for (const key of keys) {
    expect(built[key], `manifest.webmanifest "${key}"`).toEqual(
      (manifest as Record<string, unknown>)[key],
    );
  }
});

test("the built index.html links the manifest", () => {
  const html = read("index.html");
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
  const manifestLinks = links.filter((l) => /\brel\s*=\s*"manifest"/i.test(l));
  expect(
    manifestLinks,
    'a <link rel="manifest"> in dist/index.html',
  ).toHaveLength(1);
  expect(manifestLinks[0]).toMatch(/\bhref\s*=\s*"\/manifest\.webmanifest"/);
});

test("sw.js precaches index.html and every emitted JS and CSS asset", () => {
  const sw = read("sw.js");
  const precached = precachedUrls(sw);
  // The expected set comes from the disk, never from sw.js: taking it from
  // the precache manifest would make the check circular.
  const assets = readdirSync(join(DIST, "assets"))
    .filter((name) => name.endsWith(".js") || name.endsWith(".css"))
    .map((name) => `assets/${name}`);
  expect(assets.length, "dist/assets holds no JS or CSS").toBeGreaterThan(0);
  expect(assets.some((a) => a.endsWith(".js"))).toBe(true);
  expect(assets.some((a) => a.endsWith(".css"))).toBe(true);
  const missing = ["index.html", ...assets].filter((u) => !precached.has(u));
  expect(missing, "built files absent from the precache manifest").toEqual([]);
});
