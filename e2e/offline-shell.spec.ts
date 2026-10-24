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

test("the built app is installable: the manifest is linked and Chromium reports no installability errors (AC-5)", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/manifest.webmanifest",
  );
  await waitForController(page);

  const cdp = await page.context().newCDPSession(page);
  const { installabilityErrors } = await cdp.send(
    "Page.getInstallabilityErrors",
  );
  expect(installabilityErrors).toEqual([]);
});

test("control: the same installability check on a manifest-less page of the same origin reports errors (AC-5)", async ({
  page,
}) => {
  // Without this, `[]` above could be what the call returns for any page.
  // Same origin and same secure context as the app; the only thing missing is
  // the manifest link (and so the worker).
  await page.route("**/__no_manifest.html", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><html lang=en><title>No manifest</title><h1>No manifest</h1></html>",
    }),
  );
  await page.goto("/__no_manifest.html");
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(0);

  const cdp = await page.context().newCDPSession(page);
  const { installabilityErrors } = await cdp.send(
    "Page.getInstallabilityErrors",
  );
  expect(installabilityErrors.length).toBeGreaterThan(0);
});
