import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Kind } from "../data/rows";
import { initialOf, KindList, KindSwatch } from "./KindList";

vi.mock(
  "../lib/supabase",
  async () => (await import("../test/supabase-mock")).supabaseModule,
);

// CAL-007 AC-1, Contract Block 4. The list renders the kinds it is given,
// in the order given: sorting is the store's job (CAL-006). The active
// theme's colour is chosen by CSS from two custom properties (PO decision
// 3), so the test reads the properties, never a computed colour. The chip
// text colours are READ OUT of CAL-006's table (colour.test.ts, PALETTE).

const STAMP = "2026-10-16T08:00:00.000001+00:00";

function kind(
  n: number,
  name: string,
  colorLight: string,
  colorDark: string,
): Kind {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    name,
    colorLight,
    colorDark,
    sortOrder: n,
    isDefault: true,
    deletedAt: null,
    createdAt: STAMP,
    updatedAt: STAMP,
  };
}

// Deliberately not in sortOrder: the list keeps the order it is handed.
const ENTERTAINMENT = kind(2, "Entertainment", "#BD8200", "#F5CC6A");
const MOVIES = kind(1, "Movies", "#7E3FB8", "#CFA8F0");
const NIGHT = kind(3, " movie night", "#0B6E80", "#7AD4E4");
const EMOJI = kind(4, "🎬 Films", "#5147C9", "#B3AEF7");
const KINDS = [ENTERTAINMENT, MOVIES, NIGHT, EMOJI];

function renderList(kinds: Kind[] = KINDS) {
  const onEdit = vi.fn<(kind: Kind) => void>();
  render(<KindList kinds={kinds} onEdit={onEdit} />);
  const list = screen.getByRole("list", { name: "Kinds" });
  return { onEdit, list, rows: within(list).queryAllByRole("listitem") };
}

function swatchOf(row: HTMLElement): HTMLElement {
  const swatch = row.querySelector<HTMLElement>('[aria-hidden="true"]');
  if (swatch === null) throw new Error("the row has no aria-hidden swatch");
  return swatch;
}

describe("the kind list (AC-1, Block 4)", () => {
  it("is a list named Kinds with one row per kind, in the order given", () => {
    const { list, rows } = renderList();
    expect(list.tagName).toBe("UL");
    expect(rows).toHaveLength(4);
    expect(rows.map((row) => row.tagName)).toStrictEqual([
      "LI",
      "LI",
      "LI",
      "LI",
    ]);
    // Whitespace collapsed: whether " movie night" is labelled trimmed or
    // as stored is not constrained.
    const labels = rows.map((row) =>
      (within(row).getByRole("button").getAttribute("aria-label") ?? "")
        .replace(/\s+/g, " ")
        .trim(),
    );
    expect(labels).toStrictEqual([
      "Edit Entertainment",
      "Edit Movies",
      "Edit movie night",
      "Edit 🎬 Films",
    ]);
  });

  it("an empty list renders the list with no rows", () => {
    const { list, rows } = renderList([]);
    expect(list).toBeInTheDocument();
    expect(rows).toHaveLength(0);
    expect(list.querySelectorAll("li")).toHaveLength(0);
  });

  it("each row shows the swatch first, then the name, then the Edit button", () => {
    const { rows } = renderList();
    const row = rows[0] as HTMLElement;
    const swatch = swatchOf(row);
    const name = within(row).getByText("Entertainment");
    const button = within(row).getByRole("button", {
      name: "Edit Entertainment",
    });
    expect(
      swatch.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      name.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(name.tagName).toBe("SPAN");
  });

  it("the swatch is hidden from assistive technology and carries both themes' colours as custom properties", () => {
    const { rows } = renderList();
    const swatch = swatchOf(rows[0] as HTMLElement);
    expect(swatch.tagName).toBe("SPAN");
    expect(swatch.style.getPropertyValue("--swatch-light")).toBe("#BD8200");
    expect(swatch.style.getPropertyValue("--swatch-dark")).toBe("#F5CC6A");
    const movies = swatchOf(rows[1] as HTMLElement);
    expect(movies.style.getPropertyValue("--swatch-light")).toBe("#7E3FB8");
    expect(movies.style.getPropertyValue("--swatch-dark")).toBe("#CFA8F0");
  });

  it("the swatch's text colour per theme is the chip text rule's: dark on Entertainment both ways, white on Movies light and dark on Movies dark", () => {
    const { rows } = renderList();
    const ent = swatchOf(rows[0] as HTMLElement);
    expect(ent.style.getPropertyValue("--swatch-text-light")).toBe("#1B1B1F");
    expect(ent.style.getPropertyValue("--swatch-text-dark")).toBe("#1B1B1F");
    const movies = swatchOf(rows[1] as HTMLElement);
    expect(movies.style.getPropertyValue("--swatch-text-light")).toBe(
      "#FFFFFF",
    );
    expect(movies.style.getPropertyValue("--swatch-text-dark")).toBe("#1B1B1F");
  });

  it("the swatch shows the initial: the first code point of the trimmed name, upper-cased", () => {
    const { rows } = renderList();
    expect(rows.map((row) => swatchOf(row).textContent)).toStrictEqual([
      "E",
      "M",
      "M",
      "🎬",
    ]);
  });

  it("each row shows the kind's name as visible text", () => {
    const { rows } = renderList();
    expect(within(rows[1] as HTMLElement).getByText("Movies")).toBeVisible();
    expect(within(rows[3] as HTMLElement).getByText("🎬 Films")).toBeVisible();
  });

  it('each Edit button reads "Edit", is named "Edit {name}", and is type="button"', () => {
    const { rows } = renderList();
    const button = within(rows[1] as HTMLElement).getByRole("button", {
      name: "Edit Movies",
    });
    expect(button).toHaveTextContent(/^Edit$/);
    expect(button).toHaveAttribute("type", "button");
  });

  it("pressing Edit {name} hands that kind to onEdit, once", async () => {
    const user = userEvent.setup();
    const { onEdit } = renderList();
    await user.click(screen.getByRole("button", { name: "Edit Movies" }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit.mock.calls[0]?.[0]).toBe(MOVIES);
  });

  it("offers no reorder controls: the only buttons are the Edit buttons (out of scope, PO decision 7)", () => {
    const { list } = renderList();
    const buttons = within(list).getAllByRole("button");
    expect(buttons).toHaveLength(4);
    expect(
      buttons.every((b) => b.getAttribute("aria-label")?.startsWith("Edit ")),
    ).toBe(true);
  });
});

// CAL-008 Contract Block 1: the initial and the swatch are exported so the
// legend renders them from the same code (PO decision 6).
describe("the initial and the swatch, exported for the legend (CAL-008 Block 1)", () => {
  it('initialOf is the first code point of the trimmed name, upper-cased, and "" for a blank name', () => {
    expect(
      ["Movies", " movie night", "🎬 Films", "élan", "", "   "].map(initialOf),
    ).toStrictEqual(["M", "M", "🎬", "É", "", ""]);
  });

  it("KindSwatch renders the list's swatch: an aria-hidden span with the initial and both themes' colours and chip text colours", () => {
    const { container } = render(<KindSwatch kind={MOVIES} />);
    const swatch = container.firstElementChild as HTMLElement;
    expect(container.childElementCount).toBe(1);
    expect(swatch.tagName).toBe("SPAN");
    expect(swatch).toHaveAttribute("aria-hidden", "true");
    expect(swatch).toHaveTextContent(/^M$/);
    expect(swatch.style.getPropertyValue("--swatch-light")).toBe("#7E3FB8");
    expect(swatch.style.getPropertyValue("--swatch-dark")).toBe("#CFA8F0");
    expect(swatch.style.getPropertyValue("--swatch-text-light")).toBe(
      "#FFFFFF",
    );
    expect(swatch.style.getPropertyValue("--swatch-text-dark")).toBe("#1B1B1F");
    // The same element KindList's row renders, class included.
    const { rows } = renderList([MOVIES]);
    expect(swatchOf(rows[0] as HTMLElement).outerHTML).toBe(swatch.outerHTML);
  });
});
