import { expect, type Page, test } from "@playwright/test";

// CAL-017 AC-3 and AC-5, Contract Block 5. Runs against `vite preview` on
// :4173 (playwright.config.ts webServer, which builds first). No Supabase
// session exists here, so the shell the app renders is the sign-in page.

// How long the first install may take to claim the page. Not measured: no
// Chromium has run this spec yet (see the story's handoff). It is half of
// Playwright's 30 s default test timeout, so a page that never becomes
// controlled fails HERE, with a message naming the cause, rather than as an
// anonymous test timeout.
const CONTROLLER_WAIT_MS = 15_000;

/** Wait until a service worker controls the page (first install claimed it). */
async function waitForController(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            "serviceWorker" in navigator &&
            navigator.serviceWorker.controller !== null,
        ),
      {
        message:
          "a service worker should control the page after the first load " +
          "(precache installed, clientsClaim on activate)",
        timeout: CONTROLLER_WAIT_MS,
      },
    )
    .toBe(true);
}

test("after one online load, an offline reload renders the sign-in shell instead of Chromium's offline error (AC-3)", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await waitForController(page);

  await context.setOffline(true);
  await page.reload();

  await expect(page.getByText("Sign-in needs a connection")).toBeVisible();
});

// AC-5 reads Chromium's OWN parse of the manifest (CDP `Page.getAppManifest`),
// not the raw file: `dist/manifest.webmanifest`'s text is AC-2's business
// (e2e/pwa-build.spec.ts). Shape measured in Chromium 1248 (156.0.8078.4):
// `{ url, errors, data, parsed, manifest }`, where `manifest` holds absolute
// URLs (`startUrl`, `icons[].url`) and enum names (`display: "kStandalone"`).
// `Page.getInstallabilityErrors` was the original mechanism and returns `[]`
// for every page in this browser - see the story's ## Amendments.

/** Chromium's parse of the manifest the current document links. */
async function readAppManifest(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  try {
    return await cdp.send("Page.getAppManifest");
  } finally {
    await cdp.detach();
  }
}

type AppManifest = Awaited<ReturnType<typeof readAppManifest>>;

/**
 * AC-5's assertions, in one place so the controls below can prove each one
 * rejects a page that is not installable. Order matters only for which
 * message a control sees first; every check runs for a passing page.
 */
function expectInstallableManifest(result: AppManifest, origin: string): void {
  expect(result.errors, "Chromium's manifest parse errors").toEqual([]);
  expect(result.url, "manifest URL Chromium resolved").toBe(
    new URL("/manifest.webmanifest", origin).href,
  );
  expect(result.manifest.name, "manifest name as Chromium parsed it").toBe(
    "Clean Calendar",
  );
  expect(
    result.manifest.startUrl,
    "manifest start_url as Chromium resolved it",
  ).toBe(new URL("/", origin).href);
  expect(
    result.manifest.display,
    "manifest display as Chromium parsed it",
  ).toBe("kStandalone");
  expect(
    result.manifest.icons ?? [],
    "manifest icons as Chromium parsed them",
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ sizes: "192x192" }),
      expect.objectContaining({ sizes: "512x512" }),
    ]),
  );
}

test("the built app is installable: index.html links the manifest and Chromium parses it without errors as Clean Calendar, start_url /, standalone, icons 192 and 512 (AC-5)", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/manifest.webmanifest",
  );

  const result = await readAppManifest(page);
  expectInstallableManifest(result, new URL(page.url()).origin);
});

// Negative controls. Each serves a same-origin page through `page.route` (same
// origin and secure context as the app, no dependency on the build) and shows
// that one of AC-5's checks fires on it - so a pass above is not what the call
// returns for any page.

/** Fulfil `path` on the preview origin with a page linking `manifestHref`. */
async function routeProbePage(
  page: Page,
  path: string,
  manifestHref: string | null,
): Promise<void> {
  const link =
    manifestHref === null ? "" : `<link rel="manifest" href="${manifestHref}">`;
  await page.route(`**${path}`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html lang=en><head>${link}<title>Probe</title></head><body><h1>Probe</h1></body></html>`,
    }),
  );
}

test("control: a same-origin page with no manifest link has no manifest URL, so AC-5's check rejects it (AC-5)", async ({
  page,
}) => {
  await routeProbePage(page, "/__no_manifest.html", null);
  await page.goto("/__no_manifest.html");
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(0);

  const result = await readAppManifest(page);
  expect(result.url).toBe("");
  expect(() =>
    expectInstallableManifest(result, new URL(page.url()).origin),
  ).toThrow(/manifest URL Chromium resolved/);
});

test("control: a page linking an unparseable manifest gets a critical parse error, so AC-5's check rejects it (AC-5)", async ({
  page,
}) => {
  await routeProbePage(page, "/__bad_manifest.html", "/manifest.webmanifest");
  await page.route("**/manifest.webmanifest", (route) =>
    route.fulfill({
      contentType: "application/manifest+json",
      body: "{not json",
    }),
  );
  await page.goto("/__bad_manifest.html");

  const result = await readAppManifest(page);
  expect(result.errors).toEqual([
    expect.objectContaining({ critical: 1, message: expect.any(String) }),
  ]);
  expect(() =>
    expectInstallableManifest(result, new URL(page.url()).origin),
  ).toThrow(/Chromium's manifest parse errors/);
});

test("control: a page linking a manifest URL that returns 404 has no errors and the right URL, yet AC-5's check rejects it on the name (AC-5)", async ({
  page,
}) => {
  // Measured: Chromium reports `errors: []` and the full URL for a 404, so
  // `errors` and `url` alone would pass a missing manifest. The parsed fields
  // are what catch it.
  await routeProbePage(
    page,
    "/__missing_manifest.html",
    "/manifest.webmanifest",
  );
  await page.route("**/manifest.webmanifest", (route) =>
    route.fulfill({ status: 404, body: "not found" }),
  );
  await page.goto("/__missing_manifest.html");

  const result = await readAppManifest(page);
  const origin = new URL(page.url()).origin;
  expect(result.errors).toEqual([]);
  expect(result.url).toBe(new URL("/manifest.webmanifest", origin).href);
  expect(() => expectInstallableManifest(result, origin)).toThrow(
    /manifest name as Chromium parsed it/,
  );
});

test("calibration: a page linking a hand-written manifest with Block 1's fields passes AC-5's check, so the check is satisfiable in this browser (AC-5)", async ({
  page,
}) => {
  // Independent of the build: proves the expected values above (absolute
  // startUrl, "kStandalone", sizes strings) are what Chromium reports for a
  // correct manifest, so AC-5 failing on the real app is about the app.
  const manifest = {
    name: "Clean Calendar",
    short_name: "Calendar",
    start_url: "/",
    scope: "/",
    display: "standalone",
    theme_color: "#f6f7f9",
    background_color: "#ffffff",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
  await routeProbePage(page, "/__good_manifest.html", "/manifest.webmanifest");
  await page.route("**/manifest.webmanifest", (route) =>
    route.fulfill({
      contentType: "application/manifest+json",
      body: JSON.stringify(manifest),
    }),
  );
  await page.goto("/__good_manifest.html");

  const result = await readAppManifest(page);
  expectInstallableManifest(result, new URL(page.url()).origin);
});
