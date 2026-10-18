import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Period } from "./period";
import { PeriodNav } from "./PeriodNav";

// CAL-011 AC-1 and AC-2, Contract Block 3 (components.md, "App shell and top
// bar"). The unit alone with a vi.fn onNavigate: no router. MECHANICAL: the
// names, the order and the paths are Block 1's and Block 3's. Today is Wed
// 14 Oct 2026, mid-afternoon, injected.

const d = (year: number, month: number, day: number) =>
  new Date(year, month - 1, day);

const TODAY = new Date(2026, 9, 14, 15, 30);

function renderNav(period: Period, phone = false) {
  const user = userEvent.setup();
  const onNavigate = vi.fn<(path: string) => void>();
  render(
    <PeriodNav
      period={period}
      phone={phone}
      today={TODAY}
      onNavigate={onNavigate}
    />,
  );
  return { user, onNavigate };
}

const buttonNames = () =>
  screen
    .getAllByRole("button")
    .map((b) => b.getAttribute("aria-label") ?? b.textContent);

describe("the markup (Block 3)", () => {
  it("is Today, previous, next, then the <h1> title, in that DOM order", () => {
    renderNav({ view: "month", date: d(2026, 10, 1) });
    expect(buttonNames()).toStrictEqual([
      "Today",
      "Previous month",
      "Next month",
    ]);
    const h1 = screen.getByRole("heading", { level: 1 });
    const next = screen.getByRole("button", { name: "Next month" });
    expect(
      next.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('the title is one <h1> reading the period, focusable by script (tabindex="-1")', () => {
    renderNav({ view: "month", date: d(2026, 10, 1) });
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveAccessibleName("October 2026");
    expect(h1s[0]).toHaveAttribute("tabindex", "-1");
  });

  it('every button is type="button" and none is disabled', () => {
    renderNav({ view: "month", date: d(2026, 10, 1) });
    for (const b of screen.getAllByRole("button")) {
      expect(b).toHaveAttribute("type", "button");
      expect(b).toBeEnabled();
    }
  });

  it("previous and next are icon-only: the glyphs are hidden from the accessibility tree", () => {
    renderNav({ view: "month", date: d(2026, 10, 1) });
    const previous = screen.getByRole("button", { name: "Previous month" });
    const next = screen.getByRole("button", { name: "Next month" });
    expect(previous.textContent).toContain("‹");
    expect(next.textContent).toContain("›");
    for (const [button, glyph] of [
      [previous, "‹"],
      [next, "›"],
    ] as const) {
      const hidden = button.querySelector('[aria-hidden="true"]');
      expect(hidden).not.toBeNull();
      expect(hidden?.textContent).toBe(glyph);
    }
  });

  it("Today reads Today", () => {
    renderNav({ view: "day", date: d(2026, 10, 14) });
    expect(screen.getByRole("button", { name: "Today" })).toHaveTextContent(
      "Today",
    );
  });
});

type Row = [
  name: string,
  period: Period,
  phone: boolean,
  title: string,
  previous: [name: string, path: string],
  next: [name: string, path: string],
  today: string,
];

const ROWS: Row[] = [
  [
    "month",
    { view: "month", date: d(2026, 10, 1) },
    false,
    "October 2026",
    ["Previous month", "/month/2026-09"],
    ["Next month", "/month/2026-11"],
    "/month/2026-10",
  ],
  [
    "month in another year",
    { view: "month", date: d(2027, 1, 1) },
    false,
    "January 2027",
    ["Previous month", "/month/2026-12"],
    ["Next month", "/month/2027-02"],
    "/month/2026-10",
  ],
  [
    "month on the phone",
    { view: "month", date: d(2026, 10, 1) },
    true,
    "October 2026",
    ["Previous month", "/month/2026-09"],
    ["Next month", "/month/2026-11"],
    "/month/2026-10",
  ],
  [
    "desktop week held at a Wednesday",
    { view: "week", date: d(2026, 10, 14) },
    false,
    "12 – 18 Oct 2026",
    ["Previous week", "/week/2026-10-05"],
    ["Next week", "/week/2026-10-19"],
    "/week/2026-10-12",
  ],
  [
    "desktop week in November",
    { view: "week", date: d(2026, 11, 4) },
    false,
    "2 – 8 Nov 2026",
    ["Previous week", "/week/2026-10-26"],
    ["Next week", "/week/2026-11-09"],
    "/week/2026-10-12",
  ],
  [
    "phone week: moves by a day",
    { view: "week", date: d(2026, 10, 14) },
    true,
    "Tue 13 – Thu 15 Oct",
    ["Previous day", "/week/2026-10-13"],
    ["Next day", "/week/2026-10-15"],
    "/week/2026-10-14",
  ],
  [
    "phone week elsewhere: Today is today's own day",
    { view: "week", date: d(2026, 10, 20) },
    true,
    "Mon 19 – Wed 21 Oct",
    ["Previous day", "/week/2026-10-19"],
    ["Next day", "/week/2026-10-21"],
    "/week/2026-10-14",
  ],
  [
    "day",
    { view: "day", date: d(2026, 10, 14) },
    false,
    "Wednesday 14 October 2026",
    ["Previous day", "/day/2026-10-13"],
    ["Next day", "/day/2026-10-15"],
    "/day/2026-10-14",
  ],
  [
    "day across a year",
    { view: "day", date: d(2027, 1, 1) },
    false,
    "Friday 1 January 2027",
    ["Previous day", "/day/2026-12-31"],
    ["Next day", "/day/2027-01-02"],
    "/day/2026-10-14",
  ],
];

describe("titles, names and where each button goes (AC-1, AC-2, Block 3)", () => {
  it.each(ROWS)("%s: titled %j", (_n, period, phone, title) => {
    renderNav(period, phone);
    expect(screen.getByRole("heading", { level: 1 })).toHaveAccessibleName(
      title,
    );
  });

  it.each(ROWS)(
    "%s: previous is named %j and navigates there, once",
    async (_n, period, phone, _t, [name, path]) => {
      const { user, onNavigate } = renderNav(period, phone);
      await user.click(screen.getByRole("button", { name }));
      expect(onNavigate).toHaveBeenCalledTimes(1);
      expect(onNavigate).toHaveBeenCalledWith(path);
    },
  );

  it.each(ROWS)(
    "%s: next is named %j and navigates there, once",
    async (_n, period, phone, _t, _p, [name, path]) => {
      const { user, onNavigate } = renderNav(period, phone);
      await user.click(screen.getByRole("button", { name }));
      expect(onNavigate).toHaveBeenCalledTimes(1);
      expect(onNavigate).toHaveBeenCalledWith(path);
    },
  );

  it.each(ROWS)(
    "%s: Today navigates to the period holding today",
    async (_n, period, phone, _t, _p, _x, today) => {
      const { user, onNavigate } = renderNav(period, phone);
      await user.click(screen.getByRole("button", { name: "Today" }));
      expect(onNavigate).toHaveBeenCalledTimes(1);
      expect(onNavigate).toHaveBeenCalledWith(today);
    },
  );

  it("does not navigate on render", () => {
    const { onNavigate } = renderNav({ view: "month", date: d(2026, 10, 1) });
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
