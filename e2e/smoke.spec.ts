import { format } from "date-fns";
import {
  PROPOSED_DAY_OF_MONTH,
  resetStub,
  stubRequests,
} from "./fixtures/geminiStub.ts";
import {
  expect,
  injectSession,
  ownerSession,
  test,
} from "./fixtures/session.ts";

// CAL-031 AC-1, AC-2 and AC-3: the walking path, against the local stack
// (playwright.config.ts's three webServers and global-setup's db reset). Runs
// as the `smoke` project, listed first, so AC-1 meets the reset database
// before any other spec seeds kinds into it. Not `serial`: a red AC-1 must
// not hide AC-2 and AC-3, so each seeds what it needs itself.

/** docs/wiki/design/kinds-palette.md, in sortOrder: the settled eleven. */
const DEFAULT_KIND_NAMES = [
  "Movies",
  "Entertainment",
  "Flights",
  "Hotel stays",
  "Other travel",
  "Restaurant reservations",
  "Birthdays",
  "Gym",
  "Work / meetings",
  "Appointments",
  "Social / personal",
];

/** kinds-palette.md: Restaurant reservations' and Flights' light colours. */
const RESTAURANT_LIGHT = "rgb(191, 74, 23)"; // #BF4A17
const FLIGHTS_LIGHT = "rgb(11, 110, 128)"; // #0B6E80

const today = () => new Date();
const dayOfThisMonth = (n: number) =>
  new Date(today().getFullYear(), today().getMonth(), n);
const dayKey = (d: Date) => format(d, "yyyy-MM-dd");
const monthTitle = (d: Date) => format(d, "MMMM yyyy");

test.describe("on a fresh database", () => {
  test.use({ onboarded: false });

  test("the walkthrough lists the eleven default kinds, and Done lands on this month with the empty-month card (AC-1)", async ({
    page,
    owner: _owner,
    seed,
  }) => {
    expect(
      await seed.kindCount(),
      "precondition: global-setup's db reset leaves no kinds, so this is the owner's first sign-in",
    ).toBe(0);

    await page.goto("/");
    await expect(page).toHaveURL(/\/welcome$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Your event kinds" }),
    ).toBeVisible();
    const kinds = page.getByRole("list", { name: "Kinds" });
    await expect(kinds.getByRole("listitem")).toHaveCount(11);
    const names = await kinds
      .getByRole("button")
      .evaluateAll((buttons) =>
        buttons.map((b) => b.getAttribute("aria-label")),
      );
    expect(names, "the walkthrough's kinds, in sortOrder").toEqual(
      DEFAULT_KIND_NAMES.map((n) => `Edit ${n}`),
    );

    await page.getByRole("button", { name: "Done, show my calendar" }).click();
    await expect(
      page.getByRole("grid", { name: monthTitle(today()) }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Nothing this month" }),
    ).toBeVisible();
  });
});

test("an all-day event created from a day cell in Restaurant reservations shows its chip on that day in the kind's light colour, and a fresh browser still shows it (AC-2)", async ({
  page,
  owner: _owner,
  seed,
  browser,
  baseURL,
}) => {
  await seed.clear();
  await seed.kinds();
  const day = dayOfThisMonth(10);
  const month = format(day, "yyyy-MM");
  await page.goto(`/month/${month}`);

  const cell = page.locator(`[role="gridcell"][data-day="${dayKey(day)}"]`);
  await cell.click();
  const sheet = page.getByRole("dialog", { name: "New event" });
  await expect(sheet).toBeVisible();
  await sheet.getByLabel("Title").fill("Dinner");
  await sheet.getByRole("button", { name: /^Kind, / }).click();
  await page.getByRole("option", { name: /Restaurant reservations/ }).click();
  await sheet.getByRole("button", { name: "Save", exact: true }).click();
  await expect(sheet).toBeHidden();

  const chip = cell.getByRole("button", {
    name: /Dinner, Restaurant reservations/,
  });
  // Exactly this name: no ", saving" marker, so the outbox drained to Postgres.
  await expect(chip).toHaveAccessibleName(
    /^Dinner, Restaurant reservations, all day$/,
  );
  await expect(chip).toHaveCSS("background-color", RESTAURANT_LIGHT);

  // PO decision 3: IndexedDB survives page.reload(), so the reload that proves
  // persistence is a NEW context, whose month comes from Postgres via sync.
  const fresh = await browser.newContext({ baseURL });
  try {
    await injectSession(fresh, await ownerSession());
    const again = await fresh.newPage();
    await again.goto(`/month/${month}`);
    const chipAgain = again
      .locator(`[role="gridcell"][data-day="${dayKey(day)}"]`)
      .getByRole("button", { name: /Dinner, Restaurant reservations/ });
    await expect(
      chipAgain,
      "the chip in a fresh browser context, read from the server",
    ).toBeVisible();
    await expect(chipAgain).toHaveCSS("background-color", RESTAURANT_LIGHT);
  } finally {
    await fresh.close();
  }
});

test("a stubbed flight proposal with no end marks End missing on the confirm screen, and saving after filling it puts a Flights chip on the proposed day after exactly one assistant request (AC-3)", async ({
  page,
  owner: _owner,
  seed,
}) => {
  await seed.clear();
  await seed.kinds();
  await resetStub();
  expect(
    await stubRequests(),
    "control: the stub's count after /__reset",
  ).toEqual({ count: 0 });

  await page.goto("/capture");
  await page
    .getByLabel("Booking email or text")
    .fill("Your flight to Tokyo (NRT) departs on the 15th at 10:00.");
  await page.getByRole("button", { name: "Propose event" }).click();

  await expect(
    page.getByRole("heading", { level: 1, name: "Check the details" }),
  ).toBeVisible();
  const ends = page.getByRole("group", { name: "Ends" });
  await expect(ends, "the Ends fieldset is marked missing").toHaveAttribute(
    "data-state",
    "missing",
  );
  const endDate = page.getByLabel("End date", { exact: true });
  await expect(endDate).toHaveValue("");
  await expect(endDate).toHaveAccessibleDescription(
    "Not found in the text — add it",
  );
  await expect(
    page.getByRole("status").filter({ hasText: /^Found / }),
  ).toHaveText("Found 4 of 5 details. Add the end time.");

  const day = dayOfThisMonth(PROPOSED_DAY_OF_MONTH);
  await endDate.fill(dayKey(day));
  await page.getByLabel("End time", { exact: true }).fill("12:00");
  await page.getByRole("button", { name: "Save event" }).click();

  const chip = page
    .locator(`[role="gridcell"][data-day="${dayKey(day)}"]`)
    .getByRole("button", { name: /Flight to Tokyo, Flights/ });
  await expect(chip).toHaveAccessibleName(
    /^Flight to Tokyo, Flights, 10:00 to 12:00/,
  );
  // A timed chip carries its kind's colour on the dot (EventChip.tsx).
  await expect(chip.locator('[class*="dot"]')).toHaveCSS(
    "background-color",
    FLIGHTS_LIGHT,
  );
  expect(await stubRequests(), "the assistant was asked exactly once").toEqual({
    count: 1,
  });
});
