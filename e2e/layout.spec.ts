import type { Page } from "@playwright/test";
import { format } from "date-fns";
import { expect, type SeededKind, seed, test } from "./fixtures/session.ts";

// CAL-031 AC-4 (responsive layout: 375x812 and 1280x800) and AC-6 (reduced
// motion and focus return) - the browser-only checks jsdom cannot see
// (accessibility.md, "What tests assert", Integration). The numbers are
// settled ones (layout.md, components.md "Event sheet", tokens.md Motion),
// read out rather than calibrated.

const PHONE = { width: 375, height: 812 };
const DESKTOP = { width: 1280, height: 800 };
/** layout.md: everything tappable, bottom-nav tabs included. */
const TOUCH = 44;
/** components.md, "Event sheet": the docked desktop panel. */
const PANEL = 400;
/** The bottom sheet is 92 vh tall: 0.92 x 812. */
const SHEET_HEIGHT = 0.92 * PHONE.height;
/** tokens.md Motion: --duration-slow, the sheet's slide. */
const SLOW = "0.28s";

const today = new Date();
const thisMonth = format(today, "yyyy-MM");
const at = (hour: number) =>
  new Date(today.getFullYear(), today.getMonth(), today.getDate(), hour);

const LUNCH = /^Lunch, Restaurant reservations/;

test.beforeAll(async () => {
  await seed.clear();
  const kinds: SeededKind[] = await seed.kinds();
  const restaurant = kinds.find((k) => k.name === "Restaurant reservations");
  if (restaurant === undefined) throw new Error("no Restaurant reservations");
  // One timed event today: a chip in the month cell on the desktop, and a
  // row in the phone's day list for today (the selected day).
  await seed.event({
    title: "Lunch",
    kind_id: restaurant.id,
    starts_at: at(12).toISOString(),
    ends_at: at(13).toISOString(),
  });
});

/** The scrollable width of the page, against the viewport's. */
const scrollWidth = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth);

/** The chip that opens Lunch: the month cell's on the desktop, the day list's on the phone. */
function lunchChip(page: Page) {
  return page.getByRole("button", { name: LUNCH });
}

async function openLunch(page: Page) {
  await page.goto(`/month/${thisMonth}`);
  const chip = lunchChip(page);
  await chip.click();
  const sheet = page.getByRole("dialog", { name: "Edit event: Lunch" });
  await expect(sheet).toBeVisible();
  return { chip, sheet };
}

test.describe("at 375x812", () => {
  test.use({ viewport: PHONE });

  test("the month has no horizontal scroll and every bottom-nav tab is at least 44x44 (AC-4)", async ({
    page,
    owner: _owner,
  }) => {
    await page.goto(`/month/${thisMonth}`);
    await expect(page.getByRole("grid")).toBeVisible();
    await expect(lunchChip(page)).toBeVisible();
    expect(await scrollWidth(page), "document scrollWidth").toBeLessThanOrEqual(
      PHONE.width,
    );

    const nav = page.getByRole("navigation", { name: "Bottom navigation" });
    await expect(nav).toBeVisible();
    const tabs = nav.locator(":scope > a, :scope > button");
    await expect(tabs).toHaveCount(5);
    const small: string[] = [];
    for (const tab of await tabs.all()) {
      const box = await tab.boundingBox();
      const name = (await tab.textContent()) ?? "?";
      if (box === null || box.width < TOUCH || box.height < TOUCH) {
        small.push(`${name}: ${box?.width}x${box?.height}`);
      }
    }
    expect(small, "bottom-nav tabs under 44x44").toEqual([]);
  });

  test("the sheet opens as a bottom sheet: full width, flush with the bottom, 92% of the height, and no horizontal scroll (AC-4)", async ({
    page,
    owner: _owner,
  }) => {
    const { sheet } = await openLunch(page);
    const box = await sheet.boundingBox();
    expect(box, "the sheet's box").not.toBeNull();
    if (box === null) return;
    expect(box.width, "sheet width").toBeCloseTo(PHONE.width, 1);
    expect(box.x, "sheet left edge").toBeCloseTo(0, 1);
    expect(box.y + box.height, "sheet bottom edge").toBeCloseTo(
      PHONE.height,
      1,
    );
    expect(
      Math.abs(box.height - SHEET_HEIGHT),
      `sheet height ${box.height} against 0.92 x 812 = ${SHEET_HEIGHT}`,
    ).toBeLessThanOrEqual(1);
    expect(
      await scrollWidth(page),
      "scrollWidth with the sheet open",
    ).toBeLessThanOrEqual(PHONE.width);
  });
});

test.describe("at 1280x800", () => {
  test.use({ viewport: DESKTOP });

  test("the bottom nav is hidden, and the sheet docks 400px wide at the right edge while the grid shrinks (AC-4)", async ({
    page,
    owner: _owner,
  }) => {
    await page.goto(`/month/${thisMonth}`);
    await expect(page.getByRole("grid")).toBeVisible();
    await expect(
      page.getByRole("navigation", {
        name: "Bottom navigation",
        includeHidden: true,
      }),
    ).toBeHidden();

    const { sheet } = await openLunch(page);
    const box = await sheet.boundingBox();
    expect(box, "the sheet's box").not.toBeNull();
    if (box === null) return;
    expect(box.width, "docked sheet width").toBeCloseTo(PANEL, 1);
    expect(box.x + box.width, "docked sheet right edge").toBeCloseTo(
      DESKTOP.width,
      1,
    );
    const grid = await page.getByRole("grid").boundingBox();
    expect(grid, "the month grid's box").not.toBeNull();
    expect(
      grid?.width ?? Number.POSITIVE_INFINITY,
      "the month grid's width beside the docked sheet",
    ).toBeLessThanOrEqual(DESKTOP.width - PANEL);
  });

  test("opening a chip and pressing Escape leaves focus on that chip (AC-6)", async ({
    page,
    owner: _owner,
  }) => {
    const { chip, sheet } = await openLunch(page);
    await expect(
      sheet.getByRole("button", { name: "Close" }),
      "edit mode opens with focus on Close",
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(
      chip,
      "focus returns to the chip that opened the sheet",
    ).toBeFocused();
  });
});

/** The open sheet's computed transition-duration. */
const transitionOf = (page: Page) =>
  page
    .locator("[data-sheet]")
    .evaluate((el) => getComputedStyle(el).transitionDuration);

test.describe("with reduced motion", () => {
  test.use({ viewport: DESKTOP, reducedMotion: "reduce" });

  test("the sheet opens with a transition-duration of 0s (AC-6)", async ({
    page,
    owner: _owner,
  }) => {
    await openLunch(page);
    expect(await transitionOf(page)).toBe("0s");
  });
});

test.describe("without reduced motion", () => {
  test.use({ viewport: DESKTOP, reducedMotion: "no-preference" });

  test("control: the sheet's transition-duration is --duration-slow, 0.28s, so the reduced-motion 0s is the media query's doing (AC-6)", async ({
    page,
    owner: _owner,
  }) => {
    await openLunch(page);
    expect(await transitionOf(page)).toBe(SLOW);
  });
});
