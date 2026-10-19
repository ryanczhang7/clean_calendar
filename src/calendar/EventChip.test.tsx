import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

// CAL-010 Contract, Block 2 (PO decisions 2 and 3): the week/day block is a
// variant of the one chip. Same button, same chipName, data-variant="block",
// FILLED like the all-day chip, title then a time line only when the block
// is at least 2 x MIN_BLOCK_HEIGHT = 40px tall. No dot. CAL-009's cases above
// are unchanged.

function renderBlock(
  event: Event,
  kind: ChipKind,
  height: number,
  colorScheme: "light" | "dark" = "light",
) {
  media = installMatchMedia({ colorScheme, width: 1280 });
  render(
    <MemoryRouter>
      <EventChip event={event} kind={kind} variant="block" height={height} />
    </MemoryRouter>,
  );
  const buttons = screen.getAllByRole("button");
  expect(buttons).toHaveLength(1);
  return buttons[0] as HTMLElement;
}

describe('a timed event as variant="block" (CAL-010 Block 2)', () => {
  it('is the same one button, type=button, named by chipName, marked data-variant="block"', () => {
    const chip = renderBlock(TIMED, LIVE, 72);
    expect(chip.tagName).toBe("BUTTON");
    expect(chip).toHaveAttribute("type", "button");
    expect(chip).toHaveAccessibleName("Dentist, Gym, 09:00 to 10:30");
    expect(chip).toHaveAttribute("data-variant", "block");
    expect(chip).not.toHaveAttribute("data-neutral");
  });

  it("is filled with the kind's light colour in the text colour domain/colour chooses, under the light scheme", () => {
    const chip = renderBlock(TIMED, LIVE, 72, "light");
    expect(chip).toHaveStyle({ background: GYM.colorLight, color: WHITE });
  });

  it("is filled with the kind's dark colour in the text colour domain/colour chooses, under the dark scheme", () => {
    const chip = renderBlock(TIMED, LIVE, 72, "dark");
    expect(chip).toHaveStyle({ background: GYM.colorDark, color: DARK_TEXT });
    expect(chip).not.toHaveStyle({ background: GYM.colorLight });
  });

  it("has no dot: the button is the only element carrying an inline background", () => {
    const chip = renderBlock(TIMED, LIVE, 72);
    expect(coloured(chip)).toStrictEqual([]);
  });

  it("shows the kind's initial, then the title, not the month chip's '{HH:mm} {title}'", () => {
    const chip = renderBlock(TIMED, LIVE, 72);
    const initial = within(chip).getByText("Gy");
    const title = within(chip).getByText("Dentist");
    expect(
      initial.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(within(chip).queryByText("09:00 Dentist")).toBeNull();
  });

  it('at 40px tall (2 x MIN_BLOCK_HEIGHT) shows the time line "09:00 – 10:30" after the title', () => {
    const chip = renderBlock(TIMED, LIVE, 40);
    const title = within(chip).getByText("Dentist");
    const time = within(chip).getByText("09:00 – 10:30");
    expect(
      title.compareDocumentPosition(time) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("at 39px tall shows the title on one line and no time", () => {
    const chip = renderBlock(TIMED, LIVE, 39);
    within(chip).getByText("Dentist");
    expect(within(chip).queryByText("09:00 – 10:30")).toBeNull();
    expect(chip.textContent).not.toMatch(/\d\d:\d\d/);
  });

  it('with a removed kind is neutral: data-neutral="true", "?", still data-variant="block", no inline colour', () => {
    const chip = renderBlock(TIMED, REMOVED, 72, "dark");
    expect(chip).toHaveAccessibleName("Dentist, 09:00 to 10:30, kind removed");
    expect(chip).toHaveAttribute("data-neutral", "true");
    expect(chip).toHaveAttribute("data-variant", "block");
    within(chip).getByText("?");
    expect(within(chip).queryByText("Gy")).toBeNull();
    expect(chip.getAttribute("style") ?? "").toBe("");
    expect(coloured(chip)).toStrictEqual([]);
  });
});

describe("the default variant is CAL-009's chip (CAL-010 Block 2)", () => {
  it("with no variant prop renders no data-variant attribute", () => {
    const chip = renderChip(TIMED, LIVE);
    expect(chip).not.toHaveAttribute("data-variant");
  });

  it('with an explicit variant="chip" renders the month chip: no data-variant, the dot, "{HH:mm} {title}"', () => {
    media = installMatchMedia({ colorScheme: "light", width: 1280 });
    render(
      <MemoryRouter>
        <EventChip event={TIMED} kind={LIVE} variant="chip" height={72} />
      </MemoryRouter>,
    );
    const chip = screen.getByRole("button");
    expect(chip).not.toHaveAttribute("data-variant");
    expect(chip.style.background).toBe("");
    expect(coloured(chip)).toHaveLength(1);
    hiddenText(chip, "09:00 Dentist");
  });
});

// CAL-011 Contract, Block 7 (PO decision 9): an optional tabIndex, forwarded
// to the button so the month grid can make its chips -1 (one tab stop);
// absent means no attribute at all, the markup CAL-009 shipped.
describe("the tabIndex prop (CAL-011 Block 7)", () => {
  function renderWith(tabIndex: -1 | 0, variant?: "chip" | "block") {
    media = installMatchMedia({ colorScheme: "light", width: 1280 });
    render(
      <MemoryRouter>
        <EventChip
          event={TIMED}
          kind={LIVE}
          tabIndex={tabIndex}
          {...(variant === undefined ? {} : { variant, height: 72 })}
        />
      </MemoryRouter>,
    );
    return screen.getByRole("button");
  }

  it('tabIndex={-1} puts tabindex="-1" on the chip button', () => {
    expect(renderWith(-1)).toHaveAttribute("tabindex", "-1");
  });

  it('tabIndex={0} puts tabindex="0" on the chip button', () => {
    expect(renderWith(0)).toHaveAttribute("tabindex", "0");
  });

  it("with no tabIndex the button carries no tabindex attribute", () => {
    expect(renderChip(TIMED, LIVE)).not.toHaveAttribute("tabindex");
  });

  it("tabIndex={-1} reaches the block variant's button too", () => {
    expect(renderWith(-1, "block")).toHaveAttribute("tabindex", "-1");
  });
});

// CAL-012 Contract, Block 6 (AC-5): an optional onActivate on the button's
// click - Enter and Space come with the button - that stops the click there,
// so a chip inside a month cell does not also activate the cell. Absent, no
// handler: the click still reaches the cell (CAL-011's select-on-click), and
// the markup is the markup shipped.
describe("onActivate (CAL-012 Block 6)", () => {
  function renderInCell(
    variant: "chip" | "block" | undefined,
    onActivate?: (event: Event) => void,
  ) {
    media = installMatchMedia({ colorScheme: "light", width: 1280 });
    const user = userEvent.setup();
    const onCell = vi.fn();
    render(
      <MemoryRouter>
        {/* biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: a stand-in for the month cell, observed for clicks only */}
        <div data-testid="cell" onClick={onCell}>
          <EventChip
            event={TIMED}
            kind={LIVE}
            {...(variant === undefined ? {} : { variant, height: 72 })}
            {...(onActivate === undefined ? {} : { onActivate })}
          />
        </div>
      </MemoryRouter>,
    );
    return { user, onCell, chip: screen.getByRole("button") };
  }

  it.each([
    ["chip", undefined],
    ["block", "block"],
  ] as const)(
    "a click on the %s calls onActivate once with the event, and does not reach the cell",
    async (_label, variant) => {
      const onActivate = vi.fn<(event: Event) => void>();
      const { user, onCell, chip } = renderInCell(variant, onActivate);
      await user.click(chip);
      expect(onActivate).toHaveBeenCalledTimes(1);
      expect(onActivate).toHaveBeenCalledWith(TIMED);
      expect(onCell).not.toHaveBeenCalled();
    },
  );

  it.each(["{Enter}", " "])(
    "%j on the focused chip calls onActivate",
    async (key) => {
      const onActivate = vi.fn<(event: Event) => void>();
      const { user, chip } = renderInCell(undefined, onActivate);
      chip.focus();
      await user.keyboard(key);
      expect(onActivate).toHaveBeenCalledTimes(1);
      expect(onActivate).toHaveBeenCalledWith(TIMED);
    },
  );

  it("without onActivate a click still reaches the cell", async () => {
    const { user, onCell, chip } = renderInCell(undefined);
    await user.click(chip);
    expect(onCell).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["chip", undefined],
    ["block", "block"],
  ] as const)(
    "the %s's markup is the same with and without onActivate",
    (_label, variant) => {
      const { chip: plain } = renderInCell(variant);
      const without = plain.outerHTML;
      cleanupChip();
      const { chip: active } = renderInCell(variant, vi.fn());
      expect(active.outerHTML).toBe(without);
    },
  );
});

/** Unmount and drop the media stub between two renders in one case. */
function cleanupChip(): void {
  cleanup();
  media?.restore();
  media = null;
}
