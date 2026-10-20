import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type JSX, useState } from "react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, type Mock, vi } from "vitest";
import type { Kind } from "../data/rows";
import { KindPicker } from "./KindPicker";

vi.mock(
  "../lib/supabase",
  async () => (await import("../test/supabase-mock")).supabaseModule,
);

// CAL-012 Contract, Block 3 (AC-4, AC-7; components.md "Kind picker",
// voice.md "Kind removed"). The unit alone in a MemoryRouter (for the
// "Manage kinds…" link) over hand-built kinds. MECHANICAL: the trigger is a
// button named "Kind, {name}" with aria-haspopup="listbox" and
// aria-expanded; the open list is a listbox named "Kind" of one option per
// live kind, named by the kind's name, aria-selected on the chosen one; the
// last row is the link. Keyboard movement is either aria-activedescendant on
// the listbox or real focus on the option (GREEN's choice) - `isActive`
// accepts both and nothing else.

const STAMP = "2026-10-16T08:00:00.000001+00:00";

function kind(n: number, name: string, extra: Partial<Kind> = {}): Kind {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    name,
    colorLight: "#2E7D32",
    colorDark: "#9BD69B",
    sortOrder: n,
    isDefault: true,
    deletedAt: null,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...extra,
  };
}

const GYM = kind(1, "Gym");
const MOVIES = kind(2, "Movies", { colorLight: "#7E3FB8" });
const TRAVEL = kind(3, "Travel", { colorLight: "#BD8200" });
const LIVE = [GYM, MOVIES, TRAVEL];

/** A controlled host: the picker's value follows its onChange. */
function Host(props: {
  initial: string | null;
  removed: boolean;
  onChange: (id: string) => void;
}): JSX.Element {
  const [value, setValue] = useState(props.initial);
  return (
    <>
      <button type="button">Elsewhere</button>
      <KindPicker
        kinds={LIVE}
        value={value}
        removed={props.removed && value === props.initial}
        onChange={(id) => {
          props.onChange(id);
          setValue(id);
        }}
      />
    </>
  );
}

function renderPicker(
  initial: string | null = GYM.id,
  removed = false,
): { user: ReturnType<typeof userEvent.setup>; onChange: Mock } {
  const user = userEvent.setup();
  const onChange = vi.fn<(id: string) => void>();
  render(
    <MemoryRouter>
      <Host initial={initial} removed={removed} onChange={onChange} />
    </MemoryRouter>,
  );
  return { user, onChange };
}

const trigger = (name: string) =>
  screen.getByRole("button", { name: `Kind, ${name}` });
const listbox = () => screen.getByRole("listbox", { name: "Kind" });
const option = (name: string) =>
  within(listbox()).getByRole("option", { name });

/** The option the keyboard is on: focused, or the listbox's activedescendant. */
function isActive(el: HTMLElement): boolean {
  if (document.activeElement === el) return true;
  const id = el.getAttribute("id");
  return id !== null && listbox().getAttribute("aria-activedescendant") === id;
}

describe("the trigger (Block 3)", () => {
  it('is a button named "Kind, Gym", aria-haspopup="listbox", collapsed', () => {
    renderPicker(GYM.id);
    const button = trigger("Gym");
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveAttribute("aria-haspopup", "listbox");
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("shows the chosen kind's swatch (its initial, hidden) and its name", () => {
    renderPicker(MOVIES.id);
    const button = trigger("Movies");
    expect(button).toHaveTextContent("Movies");
    const hidden = button.querySelector('[aria-hidden="true"]');
    expect(hidden).not.toBeNull();
    expect(hidden).toHaveTextContent("M");
  });

  it("is named after whichever live kind is the value", () => {
    renderPicker(TRAVEL.id);
    expect(trigger("Travel")).toBeInTheDocument();
  });
});

describe("the open list (Block 3)", () => {
  it('a click opens the listbox "Kind": aria-expanded true, one option per live kind, in order', async () => {
    const { user } = renderPicker(GYM.id);
    await user.click(trigger("Gym"));
    expect(trigger("Gym")).toHaveAttribute("aria-expanded", "true");
    const options = within(listbox()).getAllByRole("option");
    expect(options).toHaveLength(3);
    expect(options[0]).toHaveAccessibleName("Gym");
    expect(options[1]).toHaveAccessibleName("Movies");
    expect(options[2]).toHaveAccessibleName("Travel");
    expect(options.map((o) => o.getAttribute("aria-selected"))).toStrictEqual([
      "true",
      "false",
      "false",
    ]);
  });

  it("each option carries its kind's swatch, hidden from assistive tech", async () => {
    const { user } = renderPicker(GYM.id);
    await user.click(trigger("Gym"));
    const swatch = option("Movies").querySelector('[aria-hidden="true"]');
    expect(swatch).not.toBeNull();
    expect(swatch).toHaveTextContent("M");
  });

  it("aria-selected marks the current value only", async () => {
    const { user } = renderPicker(MOVIES.id);
    await user.click(trigger("Movies"));
    expect(option("Movies")).toHaveAttribute("aria-selected", "true");
    expect(option("Gym")).toHaveAttribute("aria-selected", "false");
    expect(option("Travel")).toHaveAttribute("aria-selected", "false");
  });

  it('the last row is the link "Manage kinds…" to /kinds, inside the list', async () => {
    const { user } = renderPicker(GYM.id);
    await user.click(trigger("Gym"));
    const link = within(listbox()).getByRole("link", { name: "Manage kinds…" });
    expect(link).toHaveAttribute("href", "/kinds");
    const rows = [...listbox().children];
    expect(rows.at(-1)?.contains(link)).toBe(true);
    expect(rows.at(-1)).toHaveAttribute("role", "presentation");
  });

  it("the listbox is a sibling of the trigger, not inside it", async () => {
    const { user } = renderPicker(GYM.id);
    await user.click(trigger("Gym"));
    expect(trigger("Gym").contains(listbox())).toBe(false);
  });
});

describe("choosing (Block 3)", () => {
  it("clicking Movies calls onChange(Movies) once and closes the list", async () => {
    const { user, onChange } = renderPicker(GYM.id);
    await user.click(trigger("Gym"));
    await user.click(option("Movies"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(MOVIES.id);
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(trigger("Movies")).toHaveAttribute("aria-expanded", "false");
  });

  it("ArrowDown on the trigger opens the list on the chosen option", async () => {
    const { user } = renderPicker(MOVIES.id);
    trigger("Movies").focus();
    await user.keyboard("{ArrowDown}");
    expect(listbox()).toBeInTheDocument();
    expect(isActive(option("Movies"))).toBe(true);
  });

  it("ArrowDown again moves to the next option, and Enter picks it", async () => {
    const { user, onChange } = renderPicker(GYM.id);
    trigger("Gym").focus();
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{ArrowDown}");
    expect(isActive(option("Movies"))).toBe(true);
    expect(isActive(option("Gym"))).toBe(false);
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(MOVIES.id);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("ArrowUp moves back: Gym, down to Travel, up to Movies; Space picks it", async () => {
    const { user, onChange } = renderPicker(GYM.id);
    trigger("Gym").focus();
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(isActive(option("Travel"))).toBe(true);
    await user.keyboard("{ArrowUp}");
    expect(isActive(option("Movies"))).toBe(true);
    await user.keyboard(" ");
    expect(onChange).toHaveBeenCalledWith(MOVIES.id);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("Escape closes the list, focuses the trigger, and changes nothing", async () => {
    const { user, onChange } = renderPicker(GYM.id);
    trigger("Gym").focus();
    await user.keyboard("{ArrowDown}{ArrowDown}");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(trigger("Gym")).toHaveFocus();
    expect(trigger("Gym")).toHaveAttribute("aria-expanded", "false");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("a pointerdown outside closes the list and changes nothing", async () => {
    const { user, onChange } = renderPicker(GYM.id);
    await user.click(trigger("Gym"));
    expect(listbox()).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Elsewhere" }));
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("a pointerdown inside the list does not close it before the click lands", async () => {
    const { user, onChange } = renderPicker(GYM.id);
    await user.click(trigger("Gym"));
    await user.click(option("Travel"));
    expect(onChange).toHaveBeenCalledWith(TRAVEL.id);
  });
});

describe("a removed kind (AC-7, Block 3, voice.md)", () => {
  it('the trigger reads "Kind, Kind removed", with the neutral swatch', () => {
    renderPicker(null, true);
    const button = trigger("Kind removed");
    expect(button).toHaveTextContent("Kind removed");
    const neutral = button.querySelector('[data-neutral="true"]');
    expect(neutral).not.toBeNull();
    expect(neutral).toHaveAttribute("aria-hidden");
    expect(neutral).toHaveTextContent("?");
  });

  it("the list offers the live kinds only, none of them selected", async () => {
    const { user } = renderPicker(null, true);
    await user.click(trigger("Kind removed"));
    const options = within(listbox()).getAllByRole("option");
    expect(options).toHaveLength(3);
    expect(
      within(listbox()).queryByRole("option", { name: /removed/i }),
    ).toBeNull();
    for (const o of options) {
      expect(o).not.toHaveAttribute("aria-selected", "true");
    }
  });

  it("picking a live kind calls onChange with it, and the trigger then names it", async () => {
    const { user, onChange } = renderPicker(null, true);
    await user.click(trigger("Kind removed"));
    await user.click(option("Travel"));
    expect(onChange).toHaveBeenCalledWith(TRAVEL.id);
    expect(trigger("Travel")).toBeInTheDocument();
  });
});
