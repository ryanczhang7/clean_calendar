import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Event, Kind } from "../data/rows";
import { blocksAt, parseCss, propertyValue } from "../test/css";
import { installMatchMedia } from "../test/media";
import { type ChipKind, chipName, EventChip } from "./EventChip";

vi.mock(
  "../lib/supabase",
  async () => (await import("../test/supabase-mock")).supabaseModule,
);

// CAL-009 AC-3, AC-4 and AC-8 (on the chip), Contract Block 5. MECHANICAL:
// the accessible names are Block 5's table verbatim; the colours are the
// kind's own, chosen by useColorScheme() through the installMatchMedia stub
// (jsdom applies no media query, PO decision 6). jsdom computes no cascade,
// so the chip's colours are asserted as INLINE styles and the neutral rule
// is read out of EventChip.module.css with src/test/css.ts. The all-day text
// colours are READ OUT of CAL-006's table (colour.test.ts, PALETTE): Gym
// light #2E7D32 takes white text, Gym dark #9BD69B takes #1B1B1F.

const STAMP = "2026-10-16T08:00:00.000001+00:00";
const WHITE = "#FFFFFF";
const DARK_TEXT = "#1B1B1F";

const GYM: Kind = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Gym",
  colorLight: "#2E7D32",
  colorDark: "#9BD69B",
  sortOrder: 1,
  isDefault: true,
  deletedAt: null,
  createdAt: STAMP,
  updatedAt: STAMP,
};

const LIVE: ChipKind = { status: "live", kind: GYM, initial: "Gy" };
const REMOVED: ChipKind = { status: "removed" };

function ev(extra: Partial<Event>): Event {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    title: "Dentist",
    kindId: GYM.id,
    startsAt: new Date(2026, 9, 14, 9, 0),
    endsAt: new Date(2026, 9, 14, 10, 30),
    allDay: false,
    location: null,
    notes: null,
    recurrence: null,
    origin: "manual",
    captureJobId: null,
    deletedAt: null,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...extra,
  };
}

const TIMED = ev({});
const ALL_DAY = ev({
  title: "Hotel",
  allDay: true,
  startsAt: new Date(2026, 9, 14),
  endsAt: new Date(2026, 9, 15),
});

let media: ReturnType<typeof installMatchMedia> | null = null;

afterEach(() => {
  media?.restore();
  media = null;
});

function renderChip(
  event: Event,
  kind: ChipKind,
  colorScheme: "light" | "dark" = "light",
) {
  media = installMatchMedia({ colorScheme, width: 1280 });
  render(
    <MemoryRouter>
      <EventChip event={event} kind={kind} />
    </MemoryRouter>,
  );
  const buttons = screen.getAllByRole("button");
  expect(buttons).toHaveLength(1);
  return buttons[0] as HTMLElement;
}

/** Every element inside the chip carrying an inline background. */
function coloured(chip: HTMLElement): HTMLElement[] {
  return [...chip.querySelectorAll<HTMLElement>("*")].filter(
    (el) => el.style.background !== "" || el.style.backgroundColor !== "",
  );
}

/** The element holding `text`, which must sit under aria-hidden inside the chip. */
function hiddenText(chip: HTMLElement, text: string): HTMLElement {
  const el = within(chip).getByText(text);
  const hidden = el.closest('[aria-hidden="true"]');
  expect(hidden, `"${text}" is not inside an aria-hidden element`).not.toBe(
    null,
  );
  expect(chip.contains(hidden)).toBe(true);
  expect(hidden).not.toBe(chip);
  return el;
}

describe("chipName(event, kind) - Block 5's table", () => {
  it('timed, live kind: "{title}, {kind name}, {HH:mm} to {HH:mm}"', () => {
    expect(chipName(TIMED, LIVE)).toBe("Dentist, Gym, 09:00 to 10:30");
  });

  it('all-day, live kind: "{title}, {kind name}, all day"', () => {
    expect(chipName(ALL_DAY, LIVE)).toBe("Hotel, Gym, all day");
  });

  it('timed, removed kind: the kind segment is dropped and the name ends ", kind removed"', () => {
    expect(chipName(TIMED, REMOVED)).toBe(
      "Dentist, 09:00 to 10:30, kind removed",
    );
  });

  it('all-day, removed kind: "{title}, all day, kind removed"', () => {
    expect(chipName(ALL_DAY, REMOVED)).toBe("Hotel, all day, kind removed");
  });

  it("writes times as 24-hour local HH:mm, zero-padded", () => {
    const morning = ev({
      startsAt: new Date(2026, 9, 14, 7, 5),
      endsAt: new Date(2026, 9, 14, 8, 0),
    });
    const evening = ev({
      startsAt: new Date(2026, 9, 14, 14, 30),
      endsAt: new Date(2026, 9, 14, 23, 45),
    });
    expect(chipName(morning, LIVE)).toBe("Dentist, Gym, 07:05 to 08:00");
    expect(chipName(evening, LIVE)).toBe("Dentist, Gym, 14:30 to 23:45");
  });

  it("an event past midnight reads its end's clock time", () => {
    const late = ev({
      title: "Night train",
      startsAt: new Date(2026, 9, 14, 23, 0),
      endsAt: new Date(2026, 9, 15, 1, 0),
    });
    expect(chipName(late, LIVE)).toBe("Night train, Gym, 23:00 to 01:00");
  });
});

describe("a timed event in a live kind (AC-3, Block 5)", () => {
  it("is one button, type=button, named by chipName, marked data-allday=false and not neutral", () => {
    const chip = renderChip(TIMED, LIVE);
    expect(chip).toHaveAccessibleName("Dentist, Gym, 09:00 to 10:30");
    expect(chip.tagName).toBe("BUTTON");
    expect(chip).toHaveAttribute("type", "button");
    expect(chip).toHaveAttribute("data-allday", "false");
    expect(chip).not.toHaveAttribute("data-neutral");
    expect(chip).not.toHaveAttribute("title");
  });

  it("shows the kind's initial and the text '{HH:mm} {title}', both hidden from the accessibility tree", () => {
    const chip = renderChip(TIMED, LIVE);
    hiddenText(chip, "Gy");
    hiddenText(chip, "09:00 Dentist");
  });

  it("carries the colour on a dot in the kind's light colour, and none on the button itself, under the light scheme", () => {
    const chip = renderChip(TIMED, LIVE, "light");
    const dots = coloured(chip);
    expect(dots).toHaveLength(1);
    expect(dots[0]).toHaveStyle({ background: GYM.colorLight });
    expect(dots[0]?.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(chip.style.background).toBe("");
    expect(chip.style.backgroundColor).toBe("");
  });

  it("colours the dot with the kind's dark colour under the dark scheme", () => {
    const chip = renderChip(TIMED, LIVE, "dark");
    const dots = coloured(chip);
    expect(dots).toHaveLength(1);
    expect(dots[0]).toHaveStyle({ background: GYM.colorDark });
    expect(dots[0]).not.toHaveStyle({ background: GYM.colorLight });
  });
});

describe("an all-day event in a live kind (AC-3, Block 5)", () => {
  it('is a button named "..., all day", marked data-allday=true, showing the initial and the title', () => {
    const chip = renderChip(ALL_DAY, LIVE);
    expect(chip).toHaveAccessibleName("Hotel, Gym, all day");
    expect(chip).toHaveAttribute("type", "button");
    expect(chip).toHaveAttribute("data-allday", "true");
    expect(chip).not.toHaveAttribute("data-neutral");
    hiddenText(chip, "Gy");
    hiddenText(chip, "Hotel");
    expect(chip.textContent).not.toMatch(/\d\d:\d\d/);
  });

  it("is filled with the kind's light colour, in the text colour domain/colour chooses, under the light scheme", () => {
    const chip = renderChip(ALL_DAY, LIVE, "light");
    expect(chip).toHaveStyle({ background: GYM.colorLight, color: WHITE });
  });

  it("is filled with the kind's dark colour, in the text colour domain/colour chooses, under the dark scheme", () => {
    const chip = renderChip(ALL_DAY, LIVE, "dark");
    expect(chip).toHaveStyle({ background: GYM.colorDark, color: DARK_TEXT });
    expect(chip).not.toHaveStyle({ background: GYM.colorLight });
  });
});

describe("an event whose kind is removed (AC-4, Block 5)", () => {
  it('a timed chip is marked data-neutral, shows "?", is named "..., kind removed" and carries no inline colour', () => {
    const chip = renderChip(TIMED, REMOVED);
    expect(chip).toHaveAccessibleName("Dentist, 09:00 to 10:30, kind removed");
    expect(chip).toHaveAttribute("data-neutral", "true");
    expect(chip).toHaveAttribute("data-allday", "false");
    hiddenText(chip, "?");
    hiddenText(chip, "09:00 Dentist");
    expect(within(chip).queryByText("Gy")).toBeNull();
    expect(chip.getAttribute("style") ?? "").toBe("");
    expect(coloured(chip)).toStrictEqual([]);
  });

  it('an all-day chip is marked data-neutral, shows "?", is named "..., all day, kind removed" and carries no inline colour', () => {
    const chip = renderChip(ALL_DAY, REMOVED, "dark");
    expect(chip).toHaveAccessibleName("Hotel, all day, kind removed");
    expect(chip).toHaveAttribute("data-neutral", "true");
    expect(chip).toHaveAttribute("data-allday", "true");
    hiddenText(chip, "?");
    expect(chip.getAttribute("style") ?? "").toBe("");
    expect(coloured(chip)).toStrictEqual([]);
  });

  it('EventChip.module.css gives .chip[data-neutral="true"] the background var(--color-chip-neutral), chip text and a dashed border', () => {
    const css = readFileSync(
      join(import.meta.dirname, "EventChip.module.css"),
      "utf8",
    );
    const rules = blocksAt(parseCss(css), '.chip[data-neutral="true"]');
    expect(rules.length).toBeGreaterThan(0);
    const body = rules.map((r) => r.body).join(";");
    expect(propertyValue(body, "background")).toBe("var(--color-chip-neutral)");
    expect(propertyValue(body, "color")).toBe("var(--color-chip-text-light)");
    expect(propertyValue(body, "border")).toMatch(/^1px dashed currentcolor$/i);
  });
});
