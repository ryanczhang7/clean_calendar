import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Event, Kind } from "../data/rows";
import { blocksAt, parseCss, propertyValue } from "../test/css";
import { installMatchMedia } from "../test/media";
import {
  type ChipCommand,
  type ChipKind,
  chipName,
  EventChip,
} from "./EventChip";

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

// CAL-013 Contract, Block 5 (AC-3, AC-4 at the chip; accessibility.md
// "Delete / Backspace", "Alt+arrows", "Alt+Shift+Down/Up"). With onCommand,
// a mapped key calls onCommand(event, command, the chip button), is
// preventDefault-ed and does NOT propagate (the month grid's arrows and the
// page's shortcuts never see it); any other key, or one with Ctrl or Meta
// held, is left alone. dragProps are spread onto the button. The button
// carries data-event-id={event.id} always (the page's focus hook, Block 8).
// Each "left alone" case is paired with a mapped key in the same render, so
// it cannot pass against a chip that ignores keys altogether.
describe("onCommand, dragProps and data-event-id (CAL-013 Block 5)", () => {
  type OnCommand = (
    event: Event,
    command: ChipCommand,
    chip: HTMLElement,
  ) => void;

  function renderCommanding(
    variant: "chip" | "block" | undefined,
    props: {
      onCommand?: OnCommand;
      dragProps?: {
        onPointerDown?: () => void;
        onClickCapture?: () => void;
      };
      event?: Event;
    } = {},
  ) {
    media = installMatchMedia({ colorScheme: "light", width: 1280 });
    const onParentKey = vi.fn<(key: string) => void>();
    render(
      <MemoryRouter>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: a stand-in for the grid, observed for keys only */}
        <div data-testid="parent" onKeyDown={(e) => onParentKey(e.key)}>
          <EventChip
            event={props.event ?? TIMED}
            kind={LIVE}
            {...(variant === undefined ? {} : { variant, height: 72 })}
            {...(props.onCommand === undefined
              ? {}
              : { onCommand: props.onCommand })}
            {...(props.dragProps === undefined
              ? {}
              : { dragProps: props.dragProps })}
          />
        </div>
      </MemoryRouter>,
    );
    return { onParentKey, chip: screen.getByRole("button") };
  }

  type Keys = { key: string } & Partial<
    Pick<KeyboardEvent, "ctrlKey" | "metaKey" | "shiftKey" | "altKey">
  >;

  /** keydown on the chip; true when it was preventDefault-ed. */
  const press = (chip: HTMLElement, init: Keys) =>
    !fireEvent.keyDown(chip, init);

  it.each([
    ["chip", undefined],
    ["block", "block"],
  ] as const)(
    "the %s's button carries data-event-id = the event's id",
    (_label, variant) => {
      const { chip } = renderCommanding(variant);
      expect(chip).toHaveAttribute("data-event-id", TIMED.id);
    },
  );

  it.each<[string, ChipCommand, Keys]>([
    ["Delete", "delete", { key: "Delete" }],
    ["Backspace", "delete", { key: "Backspace" }],
    ["Alt+ArrowLeft", "left", { key: "ArrowLeft", altKey: true }],
    ["Alt+ArrowRight", "right", { key: "ArrowRight", altKey: true }],
    ["Alt+ArrowUp", "up", { key: "ArrowUp", altKey: true }],
    ["Alt+ArrowDown", "down", { key: "ArrowDown", altKey: true }],
    [
      "Alt+Shift+ArrowDown",
      "lengthen",
      { key: "ArrowDown", altKey: true, shiftKey: true },
    ],
    [
      "Alt+Shift+ArrowUp",
      "shorten",
      { key: "ArrowUp", altKey: true, shiftKey: true },
    ],
  ])(
    "%s calls onCommand(event, %j, the button) once, preventDefaults, and stops at the chip",
    (_label, command, init) => {
      const onCommand = vi.fn<OnCommand>();
      const { chip, onParentKey } = renderCommanding(undefined, { onCommand });
      expect(press(chip, init)).toBe(true);
      expect(onCommand).toHaveBeenCalledTimes(1);
      expect(onCommand).toHaveBeenCalledWith(TIMED, command, chip);
      expect(onParentKey).not.toHaveBeenCalled();
    },
  );

  it("the block variant maps keys the same: Alt+Shift+ArrowDown is lengthen, with the block's button", () => {
    const onCommand = vi.fn<OnCommand>();
    const { chip } = renderCommanding("block", { onCommand });
    expect(
      press(chip, { key: "ArrowDown", altKey: true, shiftKey: true }),
    ).toBe(true);
    expect(onCommand).toHaveBeenCalledWith(TIMED, "lengthen", chip);
  });

  it.each<[string, Keys]>([
    ["ArrowRight without Alt", { key: "ArrowRight" }],
    ["Shift+ArrowDown without Alt", { key: "ArrowDown", shiftKey: true }],
    ["Ctrl+Alt+ArrowRight", { key: "ArrowRight", altKey: true, ctrlKey: true }],
    ["Meta+Alt+ArrowLeft", { key: "ArrowLeft", altKey: true, metaKey: true }],
    ["Ctrl+Delete", { key: "Delete", ctrlKey: true }],
    ["Meta+Backspace", { key: "Backspace", metaKey: true }],
    ["x", { key: "x" }],
    ["Escape", { key: "Escape" }],
  ])(
    "%s is left alone - no command, not prevented, it reaches the parent; Delete then is a command",
    (_label, init) => {
      const onCommand = vi.fn<OnCommand>();
      const { chip, onParentKey } = renderCommanding(undefined, { onCommand });
      expect(press(chip, init)).toBe(false);
      expect(onCommand).not.toHaveBeenCalled();
      expect(onParentKey).toHaveBeenCalledWith(init.key);
      press(chip, { key: "Delete" });
      expect(onCommand).toHaveBeenCalledTimes(1);
    },
  );

  it("without onCommand, Delete is left alone: not prevented, it reaches the parent; with onCommand it is not", () => {
    const { chip, onParentKey } = renderCommanding(undefined);
    expect(press(chip, { key: "Delete" })).toBe(false);
    expect(onParentKey).toHaveBeenCalledWith("Delete");
    cleanupChip();
    const onCommand = vi.fn<OnCommand>();
    const active = renderCommanding(undefined, { onCommand });
    expect(press(active.chip, { key: "Delete" })).toBe(true);
    expect(active.onParentKey).not.toHaveBeenCalled();
  });

  it.each([
    ["chip", undefined],
    ["block", "block"],
  ] as const)(
    "the %s spreads dragProps onto its button: pointerdown and the click's capture reach them",
    (_label, variant) => {
      const onPointerDown = vi.fn();
      const onClickCapture = vi.fn();
      const { chip } = renderCommanding(variant, {
        dragProps: { onPointerDown, onClickCapture },
      });
      fireEvent.pointerDown(chip, { button: 0, clientX: 5, clientY: 5 });
      fireEvent.click(chip);
      expect(onPointerDown).toHaveBeenCalledTimes(1);
      expect(onClickCapture).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ["chip", undefined],
    ["block", "block"],
  ] as const)(
    "the %s's markup is the same with and without onCommand and dragProps, and carries data-event-id",
    (_label, variant) => {
      const { chip: plain } = renderCommanding(variant);
      const without = plain.outerHTML;
      cleanupChip();
      const { chip: active } = renderCommanding(variant, {
        onCommand: vi.fn<OnCommand>(),
        dragProps: { onPointerDown: vi.fn(), onClickCapture: vi.fn() },
      });
      expect(active.outerHTML).toBe(without);
      expect(active).toHaveAttribute("data-event-id", TIMED.id);
    },
  );
});

// CAL-015 AC-1 and AC-5 at the chip, Contract Block 6 (accessibility.md,
// Roles and names; components.md, Event chip states). `event.sync`, set only
// by the cached events store, appends ", saving" / ", not synced" LAST to the
// name, marks the button data-sync, and for "failed" adds an aria-hidden "!"
// badge after the title. Without `sync` the markup is the markup shipped.
describe("the sync marker (CAL-015 AC-1, AC-5, Block 6)", () => {
  const SAVING = { ...TIMED, sync: "saving" as const };
  const FAILED = { ...TIMED, sync: "failed" as const };

  it.each([
    [SAVING, LIVE, "Dentist, Gym, 09:00 to 10:30, saving"],
    [FAILED, LIVE, "Dentist, Gym, 09:00 to 10:30, not synced"],
    [
      { ...ALL_DAY, sync: "saving" as const },
      LIVE,
      "Hotel, Gym, all day, saving",
    ],
    [SAVING, REMOVED, "Dentist, 09:00 to 10:30, kind removed, saving"],
    [FAILED, REMOVED, "Dentist, 09:00 to 10:30, kind removed, not synced"],
  ])("chipName ends with the marker, last: %#", (event, kind, name) => {
    expect(chipName(event, kind)).toBe(name);
  });

  it.each([
    ["chip", undefined],
    ["block", "block"],
  ] as const)(
    'saving: the %s is named "..., saving" and marked data-sync="saving", with no badge',
    (_label, variant) => {
      const chip =
        variant === undefined
          ? renderChip(SAVING, LIVE)
          : renderBlock(SAVING, LIVE, 60);
      expect(chip).toHaveAccessibleName("Dentist, Gym, 09:00 to 10:30, saving");
      expect(chip).toHaveAttribute("data-sync", "saving");
      expect(chip.querySelector("[data-badge]")).toBeNull();
    },
  );

  it.each([
    ["chip", undefined, "09:00 Dentist"],
    ["block", "block", "Dentist"],
  ] as const)(
    'failed: the %s is named "..., not synced", marked data-sync="failed", with an aria-hidden "!" badge after the title',
    (_label, variant, titleText) => {
      const chip =
        variant === undefined
          ? renderChip(FAILED, LIVE)
          : renderBlock(FAILED, LIVE, 60);
      expect(chip).toHaveAccessibleName(
        "Dentist, Gym, 09:00 to 10:30, not synced",
      );
      expect(chip).toHaveAttribute("data-sync", "failed");
      const badges = chip.querySelectorAll('[data-badge="true"]');
      expect(badges).toHaveLength(1);
      const badge = badges[0] as HTMLElement;
      expect(badge.tagName).toBe("SPAN");
      expect(badge).toHaveAttribute("aria-hidden", "true");
      expect(badge.textContent).toBe("!");
      const title = hiddenText(chip, titleText);
      expect(
        title.compareDocumentPosition(badge) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    },
  );

  it.each([
    ["chip", undefined],
    ["block", "block"],
  ] as const)(
    "without sync the %s carries no data-sync and no badge",
    (_label, variant) => {
      const chip =
        variant === undefined
          ? renderChip(TIMED, LIVE)
          : renderBlock(TIMED, LIVE, 60);
      expect(chip).not.toHaveAttribute("data-sync");
      expect(chip.querySelector("[data-badge]")).toBeNull();
      expect(chip).toHaveAccessibleName("Dentist, Gym, 09:00 to 10:30");
    },
  );

  it('EventChip.module.css: .chip[data-sync="saving"] has a 2px dashed outline; .chip[data-sync="failed"] uses the danger colour', () => {
    const css = parseCss(
      readFileSync(join(import.meta.dirname, "EventChip.module.css"), "utf8"),
    );
    const saving = blocksAt(css, '.chip[data-sync="saving"]')
      .map((r) => r.body)
      .join(";");
    expect(propertyValue(saving, "outline")).toMatch(/^2px dashed /);
    const failed = blocksAt(css, '.chip[data-sync="failed"]')
      .map((r) => r.body)
      .join(";");
    expect(failed).toContain("var(--color-danger)");
  });
});

// CAL-024 Contract, Block 6 (AC-4; components.md "Event chip", Recurring;
// accessibility.md's name order). MECHANICAL: ", repeats {freq}" comes after
// the time (or ", kind removed") part and before the sync marker; both
// variants render <svg data-glyph="repeat" aria-hidden="true" width="12"
// height="12"> after the title text when the event recurs, and nothing when
// it does not. The glyph's path is not pinned.

describe("a recurring event's chip (CAL-024 AC-4, Block 6)", () => {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const WEEKLY = ev({ recurrence: { freq: "weekly", until: null, tz } });
  const DAILY = ev({ recurrence: { freq: "daily", until: "2026-11-30", tz } });
  const YEARLY_ALL_DAY = {
    ...ALL_DAY,
    recurrence: { freq: "yearly" as const, until: null, tz },
  };

  it.each([
    [WEEKLY, LIVE, "Dentist, Gym, 09:00 to 10:30, repeats weekly"],
    [DAILY, LIVE, "Dentist, Gym, 09:00 to 10:30, repeats daily"],
    [YEARLY_ALL_DAY, LIVE, "Hotel, Gym, all day, repeats yearly"],
    [WEEKLY, REMOVED, "Dentist, 09:00 to 10:30, kind removed, repeats weekly"],
    [
      { ...WEEKLY, sync: "saving" as const },
      LIVE,
      "Dentist, Gym, 09:00 to 10:30, repeats weekly, saving",
    ],
    [
      { ...YEARLY_ALL_DAY, sync: "failed" as const },
      REMOVED,
      "Hotel, all day, kind removed, repeats yearly, not synced",
    ],
  ])(
    "chipName puts the repeat after the time or kind-removed part and before the sync marker: %#",
    (event, kind, name) => {
      expect(chipName(event, kind)).toBe(name);
    },
  );

  it("an occurrence (occurrenceDate set) is named the same way", () => {
    expect(chipName({ ...WEEKLY, occurrenceDate: "2026-11-18" }, LIVE)).toBe(
      "Dentist, Gym, 09:00 to 10:30, repeats weekly",
    );
  });

  it("a non-recurring event's name has no repeat part", () => {
    expect(chipName(TIMED, LIVE)).toBe("Dentist, Gym, 09:00 to 10:30");
    expect(chipName(TIMED, LIVE)).not.toContain("repeats");
  });

  it.each([
    ["chip", undefined, "09:00 Dentist"],
    ["block", "block", "Dentist"],
  ] as const)(
    'the %s carries one <svg data-glyph="repeat" aria-hidden="true" width="12" height="12"> after the title, and the name says so',
    (_label, variant, titleText) => {
      const chip =
        variant === undefined
          ? renderChip(WEEKLY, LIVE)
          : renderBlock(WEEKLY, LIVE, 60);
      const glyphs = chip.querySelectorAll('[data-glyph="repeat"]');
      expect(glyphs).toHaveLength(1);
      const glyph = glyphs[0] as Element;
      expect(glyph.tagName.toLowerCase()).toBe("svg");
      expect(glyph).toHaveAttribute("aria-hidden", "true");
      expect(glyph).toHaveAttribute("width", "12");
      expect(glyph).toHaveAttribute("height", "12");
      const title = hiddenText(chip, titleText);
      expect(
        title.compareDocumentPosition(glyph) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(chip).toHaveAccessibleName(
        "Dentist, Gym, 09:00 to 10:30, repeats weekly",
      );
    },
  );

  it("an all-day recurring chip carries the glyph too", () => {
    const chip = renderChip(YEARLY_ALL_DAY, LIVE);
    expect(chip.querySelectorAll('svg[data-glyph="repeat"]')).toHaveLength(1);
    expect(chip).toHaveAccessibleName("Hotel, Gym, all day, repeats yearly");
  });

  it.each([
    ["chip", undefined],
    ["block", "block"],
  ] as const)("a non-recurring %s has no repeat glyph", (_label, variant) => {
    const chip =
      variant === undefined
        ? renderChip(TIMED, LIVE)
        : renderBlock(TIMED, LIVE, 60);
    expect(chip.querySelector('[data-glyph="repeat"]')).toBeNull();
  });
});

// CAL-025 Contract, Block 3 (AC-1's entry points), replacing CAL-024 Block
// 11's guard: an occurrence - an Event with occurrenceDate set - is moved and
// deleted from its chip exactly as any other event is. The page decides the
// scope (the edit-scope dialog); the chip only reports the command. So for
// an occurrence chip every mapped key calls onCommand(the occurrence, its
// command, the chip), is preventDefault-ed and does not reach the parent,
// and a pointerdown reaches dragProps. Each case renders the plain event
// first, with the same props, so the two are seen to behave identically.
// Name, glyph and activation are unchanged (the last cases).

describe("an occurrence is moved and deleted from its chip like any event (CAL-025 Block 3)", () => {
  type OnCommand = (
    event: Event,
    command: ChipCommand,
    chip: HTMLElement,
  ) => void;
  type Keys = { key: string } & Partial<
    Pick<KeyboardEvent, "ctrlKey" | "metaKey" | "shiftKey" | "altKey">
  >;

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const SERIES = ev({ recurrence: { freq: "weekly", until: null, tz } });
  const OCCURRENCE: Event = {
    ...SERIES,
    startsAt: new Date(2026, 10, 18, 9, 0),
    endsAt: new Date(2026, 10, 18, 10, 30),
    occurrenceDate: "2026-11-18",
  };

  /** Every handler the chip can take, all spies, around a key-observing parent. */
  function renderWired(event: Event, variant?: "block") {
    media = installMatchMedia({ colorScheme: "light", width: 1280 });
    const user = userEvent.setup();
    const onCommand = vi.fn<OnCommand>();
    const onActivate = vi.fn<(event: Event) => void>();
    const onPointerDown = vi.fn();
    const onClickCapture = vi.fn();
    const onParentKey = vi.fn<(key: string) => void>();
    render(
      <MemoryRouter>
        {/* biome-ignore lint/a11y/noStaticElementInteractions: a stand-in for the grid, observed for keys only */}
        <div data-testid="parent" onKeyDown={(e) => onParentKey(e.key)}>
          <EventChip
            event={event}
            kind={LIVE}
            {...(variant === undefined ? {} : { variant, height: 72 })}
            onActivate={onActivate}
            onCommand={onCommand}
            dragProps={{ onPointerDown, onClickCapture }}
          />
        </div>
      </MemoryRouter>,
    );
    return {
      user,
      onCommand,
      onActivate,
      onPointerDown,
      onClickCapture,
      onParentKey,
      chip: screen.getByRole("button"),
    };
  }

  /** keydown on the chip; true when it was preventDefault-ed. */
  const press = (chip: HTMLElement, init: Keys) =>
    !fireEvent.keyDown(chip, init);

  const MAPPED: [string, ChipCommand, Keys][] = [
    ["Delete", "delete", { key: "Delete" }],
    ["Backspace", "delete", { key: "Backspace" }],
    ["Alt+ArrowLeft", "left", { key: "ArrowLeft", altKey: true }],
    ["Alt+ArrowRight", "right", { key: "ArrowRight", altKey: true }],
    ["Alt+ArrowUp", "up", { key: "ArrowUp", altKey: true }],
    ["Alt+ArrowDown", "down", { key: "ArrowDown", altKey: true }],
    [
      "Alt+Shift+ArrowDown",
      "lengthen",
      { key: "ArrowDown", altKey: true, shiftKey: true },
    ],
    [
      "Alt+Shift+ArrowUp",
      "shorten",
      { key: "ArrowUp", altKey: true, shiftKey: true },
    ],
  ];

  it.each(MAPPED)(
    "%s on an occurrence chip is %j, exactly as on a plain event: onCommand(the occurrence, command, the chip) once, prevented, not seen by the parent",
    (_label, command, init) => {
      const plain = renderWired(TIMED);
      expect(press(plain.chip, init)).toBe(true);
      expect(plain.onCommand).toHaveBeenCalledTimes(1);
      expect(plain.onCommand).toHaveBeenCalledWith(TIMED, command, plain.chip);
      expect(plain.onParentKey).not.toHaveBeenCalled();
      cleanupChip();
      const occurrence = renderWired(OCCURRENCE);
      expect(press(occurrence.chip, init), "occurrence keydown prevented").toBe(
        true,
      );
      expect(occurrence.onCommand).toHaveBeenCalledTimes(1);
      expect(occurrence.onCommand).toHaveBeenCalledWith(
        OCCURRENCE,
        command,
        occurrence.chip,
      );
      // The occurrence itself, occurrenceDate and all - not the series row.
      expect(occurrence.onCommand.mock.calls[0]?.[0]?.occurrenceDate).toBe(
        "2026-11-18",
      );
      expect(occurrence.onParentKey).not.toHaveBeenCalled();
    },
  );

  it("the occurrence block (week/day) deletes and lengthens: onCommand(occurrence, delete) then (occurrence, lengthen)", () => {
    const occurrence = renderWired(OCCURRENCE, "block");
    expect(press(occurrence.chip, { key: "Delete" })).toBe(true);
    expect(
      press(occurrence.chip, {
        key: "ArrowDown",
        altKey: true,
        shiftKey: true,
      }),
    ).toBe(true);
    expect(occurrence.onCommand.mock.calls).toStrictEqual([
      [OCCURRENCE, "delete", occurrence.chip],
      [OCCURRENCE, "lengthen", occurrence.chip],
    ]);
  });

  it("a series row with no occurrenceDate keeps its commands: Delete is still delete", () => {
    const series = renderWired(SERIES);
    expect(press(series.chip, { key: "Delete" })).toBe(true);
    expect(series.onCommand).toHaveBeenCalledWith(
      SERIES,
      "delete",
      series.chip,
    );
  });

  it.each([
    ["chip", undefined],
    ["block", "block"],
  ] as const)(
    "a pointerdown on an occurrence %s reaches dragProps, as on a plain one: a drag can start",
    (_label, variant) => {
      const plain = renderWired(TIMED, variant);
      fireEvent.pointerDown(plain.chip, { button: 0, clientX: 5, clientY: 5 });
      fireEvent.click(plain.chip);
      expect(plain.onPointerDown).toHaveBeenCalledTimes(1);
      expect(plain.onClickCapture).toHaveBeenCalledTimes(1);
      cleanupChip();
      const occurrence = renderWired(OCCURRENCE, variant);
      fireEvent.pointerDown(occurrence.chip, {
        button: 0,
        clientX: 5,
        clientY: 5,
      });
      fireEvent.click(occurrence.chip);
      expect(
        occurrence.onPointerDown,
        "occurrence did not reach dragProps.onPointerDown",
      ).toHaveBeenCalledTimes(1);
      expect(
        occurrence.onClickCapture,
        "occurrence did not reach dragProps.onClickCapture",
      ).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ["chip", undefined],
    ["block", "block"],
  ] as const)(
    "a click on an occurrence %s still opens it: onActivate(the occurrence) once",
    async (_label, variant) => {
      const { user, chip, onActivate } = renderWired(OCCURRENCE, variant);
      await user.click(chip);
      expect(onActivate).toHaveBeenCalledTimes(1);
      expect(onActivate).toHaveBeenCalledWith(OCCURRENCE);
    },
  );

  it.each(["{Enter}", " "])(
    "%j on a focused occurrence chip still calls onActivate(the occurrence), and no command",
    async (key) => {
      const { user, chip, onActivate, onCommand } = renderWired(OCCURRENCE);
      chip.focus();
      await user.keyboard(key);
      expect(onActivate).toHaveBeenCalledTimes(1);
      expect(onActivate).toHaveBeenCalledWith(OCCURRENCE);
      expect(onCommand).not.toHaveBeenCalled();
    },
  );

  it("its name and glyph are unchanged: the occurrence chip reads as the series does, with the repeat glyph", () => {
    const chip = renderWired(OCCURRENCE).chip;
    expect(chip).toHaveAccessibleName(
      "Dentist, Gym, 09:00 to 10:30, repeats weekly",
    );
    expect(chip.querySelectorAll('svg[data-glyph="repeat"]')).toHaveLength(1);
  });
});

// CAL-057 Contract, Block 5 (AC-5; components.md "Event chip", Reminder;
// accessibility.md:99's name order: repeats, then reminder, then the sync
// marker). MECHANICAL: chipName's optional third parameter inserts
// ", reminder {phrase}" after the repeats part and before the sync marker;
// the chip reads ChipRemindersContext (event id -> the live template's
// minutesBefore) with event.id, and when it has a value both variants carry
// one <svg data-glyph="bell" aria-hidden="true" width="12" height="12"> after
// the title and are named with the phrase. The phrases are written out by
// hand from the AC, not computed with reminderPhrase. The glyph's path, and
// its order relative to the repeat glyph, are not pinned.

describe("CAL-057 a chip with a reminder (AC-5, Block 5)", () => {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const WEEKLY = ev({ recurrence: { freq: "weekly", until: null, tz } });

  it.each([
    [30, "Dentist, Gym, 09:00 to 10:30, reminder 30 minutes before"],
    [0, "Dentist, Gym, 09:00 to 10:30, reminder at start time"],
    [1440, "Dentist, Gym, 09:00 to 10:30, reminder 1 day before"],
    [60, "Dentist, Gym, 09:00 to 10:30, reminder 1 hour before"],
    [120, "Dentist, Gym, 09:00 to 10:30, reminder 2 hours before"],
    [5, "Dentist, Gym, 09:00 to 10:30, reminder 5 minutes before"],
  ])("chipName(event, kind, %j) is %j", (minutes, name) => {
    expect(chipName(TIMED, LIVE, minutes)).toBe(name);
  });

  it('an all-day event at -540: "..., all day, reminder at 09:00 on the day"', () => {
    expect(chipName(ALL_DAY, LIVE, -540)).toBe(
      "Hotel, Gym, all day, reminder at 09:00 on the day",
    );
  });

  it.each([
    [
      WEEKLY,
      LIVE,
      "Dentist, Gym, 09:00 to 10:30, repeats weekly, reminder 30 minutes before",
    ],
    [
      { ...WEEKLY, sync: "saving" as const },
      LIVE,
      "Dentist, Gym, 09:00 to 10:30, repeats weekly, reminder 30 minutes before, saving",
    ],
    [
      { ...TIMED, sync: "failed" as const },
      REMOVED,
      "Dentist, 09:00 to 10:30, kind removed, reminder 30 minutes before, not synced",
    ],
  ])(
    "the reminder comes after the repeats part and before the sync marker (accessibility.md:99): %#",
    (event, kind, name) => {
      expect(chipName(event, kind, 30)).toBe(name);
    },
  );

  it("without the third argument the name has no reminder part", () => {
    expect(chipName(TIMED, LIVE)).toBe("Dentist, Gym, 09:00 to 10:30");
    expect(chipName(TIMED, LIVE, undefined)).toBe(
      "Dentist, Gym, 09:00 to 10:30",
    );
  });

  describe("the chip under ChipRemindersContext", () => {
    // Block 5's new module is loaded here rather than at the top of the file:
    // a static import of a module RED cannot write would fail this whole file
    // at import, taking every earlier case down with it - and so would a
    // dynamic import of a literal path, which Vite resolves when it
    // transforms the file (measured in RED: "Failed to resolve import
    // ./chipReminders" for the whole file). The path is held in a constant
    // so it resolves at run time, failing only this block's hook. The type
    // still names the module, so typecheck pins its export. Only these cases
    // need the context; chipName's cases above do not.
    const CHIP_REMINDERS = "./chipReminders";
    let chipReminders: typeof import("./chipReminders");
    beforeAll(async () => {
      chipReminders = await import(/* @vite-ignore */ CHIP_REMINDERS);
    });

    function renderWithReminders(
      event: Event,
      reminders: ReadonlyMap<string, number>,
      variant?: "block",
    ): HTMLElement {
      const { ChipRemindersContext } = chipReminders;
      media = installMatchMedia({ colorScheme: "light", width: 1280 });
      render(
        <MemoryRouter>
          <ChipRemindersContext.Provider value={reminders}>
            <EventChip
              event={event}
              kind={LIVE}
              variant={variant}
              height={60}
            />
          </ChipRemindersContext.Provider>
        </MemoryRouter>,
      );
      const buttons = screen.getAllByRole("button");
      expect(buttons).toHaveLength(1);
      return buttons[0] as HTMLElement;
    }

    it.each([
      ["chip", undefined, "09:00 Dentist"],
      ["block", "block", "Dentist"],
    ] as const)(
      'a live reminder of 30: the %s carries one <svg data-glyph="bell" aria-hidden="true" width="12" height="12"> after the title, and is named ", reminder 30 minutes before"',
      (_label, variant, titleText) => {
        const chip = renderWithReminders(
          TIMED,
          new Map([[TIMED.id, 30]]),
          variant,
        );
        const bells = chip.querySelectorAll('[data-glyph="bell"]');
        expect(bells).toHaveLength(1);
        const bell = bells[0] as Element;
        expect(bell.tagName.toLowerCase()).toBe("svg");
        expect(bell).toHaveAttribute("aria-hidden", "true");
        expect(bell).toHaveAttribute("width", "12");
        expect(bell).toHaveAttribute("height", "12");
        const title = hiddenText(chip, titleText);
        expect(
          title.compareDocumentPosition(bell) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(chip).toHaveAccessibleName(
          "Dentist, Gym, 09:00 to 10:30, reminder 30 minutes before",
        );
      },
    );

    it.each([
      [0, "Dentist, Gym, 09:00 to 10:30, reminder at start time"],
      [1440, "Dentist, Gym, 09:00 to 10:30, reminder 1 day before"],
    ])("a live reminder of %j: the chip is named %j", (minutes, name) => {
      const chip = renderWithReminders(TIMED, new Map([[TIMED.id, minutes]]));
      expect(chip).toHaveAccessibleName(name);
      expect(chip.querySelectorAll('svg[data-glyph="bell"]')).toHaveLength(1);
    });

    it("a recurring event with a reminder carries both glyphs, and the name says repeats then reminder", () => {
      const chip = renderWithReminders(WEEKLY, new Map([[WEEKLY.id, 30]]));
      expect(chip.querySelectorAll('svg[data-glyph="repeat"]')).toHaveLength(1);
      expect(chip.querySelectorAll('svg[data-glyph="bell"]')).toHaveLength(1);
      expect(chip).toHaveAccessibleName(
        "Dentist, Gym, 09:00 to 10:30, repeats weekly, reminder 30 minutes before",
      );
    });

    it("an occurrence reads its series' reminder, keyed by the series id it carries", () => {
      const occurrence: Event = {
        ...WEEKLY,
        startsAt: new Date(2026, 9, 21, 9, 0),
        endsAt: new Date(2026, 9, 21, 10, 30),
        occurrenceDate: "2026-10-21",
      };
      const chip = renderWithReminders(
        occurrence,
        new Map([[WEEKLY.id, 1440]]),
      );
      expect(chip.querySelectorAll('svg[data-glyph="bell"]')).toHaveLength(1);
      expect(chip).toHaveAccessibleName(
        "Dentist, Gym, 09:00 to 10:30, repeats weekly, reminder 1 day before",
      );
    });

    it.each([
      [
        "no entry for this event (another event's reminder)",
        new Map([["10000000-0000-4000-8000-000000000002", 30]]),
      ],
      ["an empty map", new Map<string, number>()],
    ])(
      "%s: no bell, and the name has no reminder part",
      (_label, reminders) => {
        const chip = renderWithReminders(TIMED, reminders);
        expect(chip.querySelector('[data-glyph="bell"]')).toBeNull();
        expect(chip).toHaveAccessibleName("Dentist, Gym, 09:00 to 10:30");
      },
    );
  });
});
