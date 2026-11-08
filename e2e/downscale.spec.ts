import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/session.ts";

// CAL-054: `browserDeps` in src/capture/downscale.ts (createImageBitmap, a 2D
// canvas, toBlob) has no other test - jsdom has neither. PO decision 1: drive
// /capture as the owner, intercept the capture function's request, and decode
// the image it carries in the page. Fixtures are drawn in the page with
// OffscreenCanvas; no binary fixture is committed.
//
// The request body is captureClient.ts's CaptureInput, `{ image, mime }` - it
// carries no `bytes`, width or height, so every size below is read back by
// decoding the posted base64 (see the story's Contract, RED amendment).

/** AC-3: the run must post within this, or the wait - not the 30 s test timeout - fails. */
const SETTLE_MS = 10_000;
/** AC-1: each channel within 8 of the expected value. */
const CHANNEL_TOLERANCE = 8;

type Fill = { x: number; width: number; color: string };
type Fixture = {
  width: number;
  height: number;
  mime: "image/png" | "image/jpeg";
  fills: Fill[];
};
type Posted = { image: string; mime: string };
type Decoded = {
  width: number;
  height: number;
  byteLength: number;
  head: number[];
  tail: number[];
  pixels: Record<string, [number, number, number, number]>;
};

/** Draws `fixture` on an OffscreenCanvas in the page and returns the encoded file. */
async function drawFixture(page: Page, fixture: Fixture): Promise<Buffer> {
  const base64 = await page.evaluate(async (f) => {
    const canvas = new OffscreenCanvas(f.width, f.height);
    const context = canvas.getContext("2d");
    if (context === null) throw new Error("no OffscreenCanvas 2d context");
    for (const fill of f.fills) {
      context.fillStyle = fill.color;
      context.fillRect(fill.x, 0, fill.width, f.height);
    }
    const blob = await canvas.convertToBlob({ type: f.mime, quality: 0.92 });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  }, fixture);
  return Buffer.from(base64, "base64");
}

/** Decodes the posted image in the page: its size, its byte length, and the pixels asked for. */
async function decodePosted(
  page: Page,
  posted: Posted,
  points: Record<string, [number, number]>,
): Promise<Decoded> {
  return page.evaluate(
    async ({ image, mime, points }) => {
      const binary = atob(image);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1)
        bytes[i] = binary.charCodeAt(i);
      const bitmap = await createImageBitmap(new Blob([bytes], { type: mime }));
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext("2d");
      if (context === null) throw new Error("no OffscreenCanvas 2d context");
      context.drawImage(bitmap, 0, 0);
      const pixels: Record<string, [number, number, number, number]> = {};
      for (const [name, [x, y]] of Object.entries(points)) {
        const d = context.getImageData(x, y, 1, 1).data;
        pixels[name] = [d[0] ?? -1, d[1] ?? -1, d[2] ?? -1, d[3] ?? -1];
      }
      return {
        width: bitmap.width,
        height: bitmap.height,
        byteLength: bytes.length,
        head: Array.from(bytes.subarray(0, 2)),
        tail: Array.from(bytes.subarray(bytes.length - 2)),
        pixels,
      };
    },
    { ...posted, points },
  );
}

/**
 * Opens /capture, picks `file`, presses Propose event and returns the body the
 * capture function was sent, with how long it took to arrive. The function is
 * never reached: the route answers the preflight and aborts the POST.
 */
async function proposeScreenshot(
  page: Page,
  file: { name: string; mimeType: string; buffer: Buffer },
): Promise<{ posted: Posted; elapsedMs: number }> {
  await page.route("**/functions/v1/capture", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
          "access-control-allow-methods": "POST, OPTIONS",
        },
      });
      return;
    }
    await route.abort();
  });
  await page.locator('input[type="file"]').setInputFiles(file);
  const request = page.waitForRequest(
    (r) => r.url().includes("/functions/v1/capture") && r.method() === "POST",
    { timeout: SETTLE_MS },
  );
  const started = Date.now();
  await page.getByRole("button", { name: "Propose event" }).click();
  const sent = await request;
  const elapsedMs = Date.now() - started;
  return { posted: sent.postDataJSON() as Posted, elapsedMs };
}

const HALVES: Fixture = {
  width: 3000,
  height: 1000,
  mime: "image/png",
  fills: [
    { x: 0, width: 1500, color: "rgb(255, 0, 0)" },
    { x: 1500, width: 1500, color: "rgb(0, 0, 255)" },
  ],
};

function expectNear(
  actual: [number, number, number, number] | undefined,
  expected: [number, number, number, number],
  what: string,
): void {
  expect(actual, `${what}: a pixel was read`).toBeDefined();
  const off = (actual ?? []).map((c, i) =>
    Math.abs(c - (expected[i] ?? Number.NaN)),
  );
  expect(
    off.every((d) => d <= CHANNEL_TOLERANCE),
    `${what}: RGBA ${JSON.stringify(actual)} is not within ${CHANNEL_TOLERANCE} of ${JSON.stringify(expected)}`,
  ).toBe(true);
}

test.beforeEach(async ({ page, owner: _owner }) => {
  await page.goto("/capture");
  await expect(
    page.getByRole("heading", { level: 1, name: "Capture" }),
  ).toBeVisible();
});

test("a 3000x1000 red|blue PNG screenshot is sent to the assistant shrunk to 2048x683 with its red left half and blue right half still drawn (AC-1)", async ({
  page,
}) => {
  const buffer = await drawFixture(page, HALVES);
  const { posted } = await proposeScreenshot(page, {
    name: "halves.png",
    mimeType: "image/png",
    buffer,
  });

  expect(posted.mime, "a small PNG stays a PNG").toBe("image/png");
  const decoded = await decodePosted(page, posted, {
    left: [100, 340],
    right: [1948, 340],
  });
  expect(
    { width: decoded.width, height: decoded.height },
    "the posted image's decoded size",
  ).toEqual({ width: 2048, height: 683 });
  expectNear(decoded.pixels.left, [255, 0, 0, 255], "pixel (100, 340)");
  expectNear(decoded.pixels.right, [0, 0, 255, 255], "pixel (1948, 340)");
});

test("a 1200x800 JPEG screenshot is sent as image/jpeg at its own 1200x800, and the posted base64 is a whole JPEG (AC-2)", async ({
  page,
}) => {
  const buffer = await drawFixture(page, {
    width: 1200,
    height: 800,
    mime: "image/jpeg",
    fills: [
      { x: 0, width: 400, color: "rgb(200, 40, 40)" },
      { x: 400, width: 400, color: "rgb(40, 200, 40)" },
      { x: 800, width: 400, color: "rgb(40, 40, 200)" },
    ],
  });
  const { posted } = await proposeScreenshot(page, {
    name: "booking.jpg",
    mimeType: "image/jpeg",
    buffer,
  });

  expect(posted.mime, "the posted mime").toBe("image/jpeg");
  const decoded = await decodePosted(page, posted, {});
  expect(
    { width: decoded.width, height: decoded.height },
    "the posted image's decoded size",
  ).toEqual({ width: 1200, height: 800 });
  // No `bytes` in the request (CaptureInput is { image, mime }): the
  // decoded length is the request's own, and it must be a whole JPEG -
  // SOI first, EOI last - no larger than the capture function's limit.
  expect(decoded.byteLength, "decoded length of the posted base64").toBe(
    Buffer.from(posted.image, "base64").length,
  );
  expect(decoded.byteLength).toBeGreaterThan(0);
  expect(decoded.byteLength).toBeLessThanOrEqual(4 * 1024 * 1024);
  expect(decoded.head, "JPEG start-of-image marker").toEqual([0xff, 0xd8]);
  expect(decoded.tail, "JPEG end-of-image marker").toEqual([0xff, 0xd9]);
});

test(`shrinking the 3000x1000 screenshot settles and the request is sent within ${SETTLE_MS} ms of Propose event (AC-3)`, async ({
  page,
}) => {
  const buffer = await drawFixture(page, HALVES);
  const { posted, elapsedMs } = await proposeScreenshot(page, {
    name: "halves.png",
    mimeType: "image/png",
    buffer,
  });
  expect(posted.image.length, "the posted base64 is not empty").toBeGreaterThan(
    0,
  );
  expect(elapsedMs, "ms from Propose event to the request").toBeLessThan(
    SETTLE_MS,
  );
});
