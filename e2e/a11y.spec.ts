import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { format } from "date-fns";
import { resetStub } from "./fixtures/geminiStub.ts";
import { expect, type SeededKind, seed, test } from "./fixtures/session.ts";

// CAL-031 AC-5: axe at wcag2a, wcag2aa and wcag21aa on every page
// accessibility.md ("What tests assert", Integration) names, zero violations.
// One test per page, so a violation names its page. The sign-in and
// walkthrough pages come first and seed nothing; the month, week and legend
// share one event in each of the eleven kinds, seeded once below.

const TAGS = ["wcag2a", "wcag2aa", "wcag21aa"];

/** Zero violations, reported as rule id -> the nodes it found, so a failure reads as a bug. */
async function expectNoViolations(page: Page): Promise<void> {
  // Judge the page at rest. Dialog.module.css fades `.dialog[open]` in over
  // --duration-base (180 ms); axe sampling mid-fade computed the Save
  // button's contrast against a part-transparent dialog (color-contrast,
  // flaky). Every page waits the same way; reduced motion is NOT used, since
  // AC-5 holds for the default rendering.
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((a) => a.finished)),
  );
  const { violations } = await new AxeBuilder({ page })
    .withTags(TAGS)
    .analyze();
  expect(
    violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => n.target.join(" ")),
    })),
    "axe violations",
  ).toEqual([]);
}

const today = new Date();
const thisMonth = format(today, "yyyy-MM");
const day = (n: number, hour = 0) =>
  new Date(today.getFullYear(), today.getMonth(), n, hour);
const ELEVEN = 11;

test("sign-in has no axe violations (AC-5)", async ({ page }) => {
  await page.goto("/signin");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expectNoViolations(page);
});

test.describe("before onboarding", () => {
  test.use({ onboarded: false });

  test("the walkthrough has no axe violations (AC-5)", async ({
    page,
    owner: _owner,
  }) => {
    await page.goto("/welcome");
    await expect(
      page.getByRole("list", { name: "Kinds" }).getByRole("listitem"),
    ).toHaveCount(ELEVEN);
    await expectNoViolations(page);
  });
});

test.describe("with one event in each of the eleven kinds", () => {
  let kinds: SeededKind[] = [];

  test.beforeAll(async () => {
    await seed.clear();
    kinds = await seed.kinds();
    expect(kinds, "the eleven default kinds, live").toHaveLength(ELEVEN);
    // All-day events, the 1st to the 11th: an all-day chip is FILLED in its
    // kind's colour, so its text contrast is what axe judges.
    for (const [i, kind] of kinds.entries()) {
      await seed.event({
        title: `${kind.name} event`,
        kind_id: kind.id,
        starts_at: day(i + 1).toISOString(),
        ends_at: day(i + 2).toISOString(),
        all_day: true,
      });
    }
  });

  async function openMonth(page: Page) {
    await page.goto(`/month/${thisMonth}`);
    // Counted by data-event-id, not by name: a chip that lost its name must
    // still reach axe, which is what reports it (button-name).
    await expect(page.getByRole("grid").locator("[data-event-id]")).toHaveCount(
      ELEVEN,
    );
  }

  for (const colorScheme of ["light", "dark"] as const) {
    test(`the month in ${colorScheme} has no axe violations (AC-5)`, async ({
      page,
      owner: _owner,
    }) => {
      await page.emulateMedia({ colorScheme });
      await openMonth(page);
      await expectNoViolations(page);
    });
  }

  test("the week with the sheet open has no axe violations (AC-5)", async ({
    page,
    owner: _owner,
  }) => {
    await page.goto(`/week/${format(day(3), "yyyy-MM-dd")}`);
    await page.getByRole("button", { name: /^Flights event, Flights/ }).click();
    await expect(
      page.getByRole("dialog", { name: "Edit event: Flights event" }),
    ).toBeVisible();
    await expectNoViolations(page);
  });

  test("the legend has no axe violations (AC-5)", async ({
    page,
    owner: _owner,
  }) => {
    await openMonth(page);
    // At the desktop the bottom nav is hidden, so this is the top bar's.
    await page.getByRole("button", { name: "Legend" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectNoViolations(page);
  });
});

test("capture has no axe violations (AC-5)", async ({
  page,
  owner: _owner,
}) => {
  await page.goto("/capture");
  await expect(
    page.getByRole("heading", { level: 1, name: "Capture" }),
  ).toBeVisible();
  await expectNoViolations(page);
});

test("confirm with a missing End has no axe violations (AC-5)", async ({
  page,
  owner: _owner,
}) => {
  await resetStub();
  await page.goto("/capture");
  await page
    .getByLabel("Booking email or text")
    .fill("Your flight to Tokyo (NRT) departs on the 15th at 10:00.");
  await page.getByRole("button", { name: "Propose event" }).click();
  await expect(page.getByRole("group", { name: "Ends" })).toHaveAttribute(
    "data-state",
    "missing",
  );
  await expectNoViolations(page);
});

test("the edit-scope dialog has no axe violations (AC-5)", async ({
  page,
  owner: _owner,
}) => {
  await seed.clear();
  const kinds = await seed.kinds();
  const gym = kinds.find((k) => k.name === "Gym");
  if (gym === undefined) throw new Error("no Gym kind");
  await seed.event({
    title: "Swim",
    kind_id: gym.id,
    starts_at: day(2, 7).toISOString(),
    ends_at: day(2, 8).toISOString(),
    recurrence: {
      freq: "weekly",
      until: null,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  });
  await page.goto(`/month/${thisMonth}`);
  // The second occurrence, a week on: an expanded occurrence, not the row.
  await page
    .locator(`[role="gridcell"][data-day="${format(day(9), "yyyy-MM-dd")}"]`)
    .getByRole("button", { name: /^Swim, Gym/ })
    .click();
  const sheet = page.getByRole("dialog", { name: "Edit event: Swim" });
  await sheet.getByLabel("Title").fill("Swim laps");
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("alertdialog", { name: "Change which events?" }),
  ).toBeVisible();
  await expectNoViolations(page);
});
