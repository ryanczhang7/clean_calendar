import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { JSX } from "react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installMatchMedia } from "../test/media";
import { CalendarToolbar } from "./CalendarToolbar";
import { setSelected } from "./selection";

vi.mock(
  "../lib/supabase",
  async () => (await import("../test/supabase-mock")).supabaseModule,
);

// CAL-011 AC-1, AC-2, AC-3, AC-4 and AC-6 (the stored key), Contract Block 9.
// The toolbar under a MemoryRouter beside a location probe, as the shell's
// toolbar slot mounts it: it reads the period from the pathname, so no
// <Routes> are needed. `now` is injected (Wed 14 Oct 2026, mid-afternoon);
// the breakpoint is the installMatchMedia stub; localStorage and the app's
// selection store are reset around every test.

const NOW = new Date(2026, 9, 14, 15, 30);

const d = (year: number, month: number, day: number) =>
  new Date(year, month - 1, day);

let media: ReturnType<typeof installMatchMedia> | null = null;

beforeEach(() => {
  localStorage.clear();
  act(() => setSelected(null));
});

afterEach(() => {
  media?.restore();
  media = null;
  act(() => setSelected(null));
  localStorage.clear();
  vi.restoreAllMocks();
});

function Where(): JSX.Element {
  const { pathname } = useLocation();
  return <p>at {pathname}</p>;
}

function renderToolbar(
  path: string,
  options: { width?: number; withField?: boolean } = {},
) {
  media = installMatchMedia({
    width: options.width ?? 1280,
    colorScheme: "light",
  });
  const user = userEvent.setup();
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <CalendarToolbar now={() => NOW} />
      {options.withField === true && (
        <label>
          Notes
          <input type="text" />
        </label>
      )}
      <Where />
    </MemoryRouter>,
  );
  return { user, ...view };
}

const at = () => screen.getByText(/^at \//).textContent;
const title = () => screen.getByRole("heading", { level: 1 });
const radio = (name: string) =>
  within(screen.getByRole("radiogroup", { name: "View" })).getByRole("radio", {
    name,
  });

describe("the title at each route (AC-1, Block 9)", () => {
  it.each([
    ["/month/2026-10", 1280, "October 2026"],
    ["/month/2027-02", 1280, "February 2027"],
    ["/week/2026-10-14", 1280, "12 – 18 Oct 2026"],
    ["/week/2026-10-12", 1280, "12 – 18 Oct 2026"],
    ["/week/2026-10-14", 768, "12 – 18 Oct 2026"],
    ["/week/2026-10-01", 1280, "28 Sep – 4 Oct 2026"],
    ["/week/2026-10-14", 375, "Tue 13 – Thu 15 Oct"],
    ["/day/2026-10-14", 1280, "Wednesday 14 October 2026"],
    ["/", 1280, "October 2026"],
  ])("%s at %ipx is titled %j, one <h1>", (path, width, text) => {
    renderToolbar(path, { width });
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveAccessibleName(text);
    expect(h1s[0]).toHaveAttribute("tabindex", "-1");
  });

  it("a week URL on a Wednesday is not rewritten (PO decision 2)", () => {
    renderToolbar("/week/2026-10-14");
    expect(at()).toBe("at /week/2026-10-14");
  });

  it("renders the period controls, then the view switcher", () => {
    renderToolbar("/month/2026-10");
    const today = screen.getByRole("button", { name: "Today" });
    const group = screen.getByRole("radiogroup", { name: "View" });
    expect(
      today.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      title().compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe("previous, next and Today move the URL (AC-2, Block 9)", () => {
  it.each([
    ["/month/2026-10", 1280, "Next month", "/month/2026-11", "November 2026"],
    [
      "/month/2026-10",
      1280,
      "Previous month",
      "/month/2026-09",
      "September 2026",
    ],
    ["/month/2026-12", 1280, "Next month", "/month/2027-01", "January 2027"],
    [
      "/week/2026-10-14",
      1280,
      "Next week",
      "/week/2026-10-19",
      "19 – 25 Oct 2026",
    ],
    [
      "/week/2026-10-14",
      1280,
      "Previous week",
      "/week/2026-10-05",
      "5 – 11 Oct 2026",
    ],
    [
      "/week/2026-10-14",
      768,
      "Next week",
      "/week/2026-10-19",
      "19 – 25 Oct 2026",
    ],
    [
      "/week/2026-10-14",
      375,
      "Next day",
      "/week/2026-10-15",
      "Wed 14 – Fri 16 Oct",
    ],
    [
      "/week/2026-10-14",
      375,
      "Previous day",
      "/week/2026-10-13",
      "Mon 12 – Wed 14 Oct",
    ],
    [
      "/day/2026-10-14",
      1280,
      "Next day",
      "/day/2026-10-15",
      "Thursday 15 October 2026",
    ],
    [
      "/day/2026-10-14",
      1280,
      "Previous day",
      "/day/2026-10-13",
      "Tuesday 13 October 2026",
    ],
    [
      "/day/2026-10-14",
      375,
      "Next day",
      "/day/2026-10-15",
      "Thursday 15 October 2026",
    ],
  ])(
    "%s at %ipx: %j goes to %s, titled %j",
    async (path, width, name, to, text) => {
      const { user } = renderToolbar(path, { width });
      await user.click(screen.getByRole("button", { name }));
      expect(at()).toBe(`at ${to}`);
      expect(title()).toHaveAccessibleName(text);
    },
  );

  it("Next month twice from October lands on December: each press reads the new URL", async () => {
    const { user } = renderToolbar("/month/2026-10");
    await user.click(screen.getByRole("button", { name: "Next month" }));
    await user.click(screen.getByRole("button", { name: "Next month" }));
    expect(at()).toBe("at /month/2026-12");
  });

  it.each([
    ["/month/2026-10", 1280, ["Previous month", "Next month"]],
    ["/week/2026-10-14", 1280, ["Previous week", "Next week"]],
    ["/week/2026-10-14", 768, ["Previous week", "Next week"]],
    ["/week/2026-10-14", 375, ["Previous day", "Next day"]],
    ["/day/2026-10-14", 1280, ["Previous day", "Next day"]],
  ] as const)("%s at %ipx names the buttons %j", (path, width, names) => {
    renderToolbar(path, { width });
    for (const name of names) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it.each([
    ["/month/2027-03", 1280, "/month/2026-10"],
    ["/", 1280, "/month/2026-10"],
    ["/week/2026-11-04", 1280, "/week/2026-10-12"],
    ["/week/2026-11-04", 375, "/week/2026-10-14"],
    ["/day/2027-01-01", 1280, "/day/2026-10-14"],
  ])("%s at %ipx: Today goes to %s", async (path, width, to) => {
    const { user } = renderToolbar(path, { width });
    await user.click(screen.getByRole("button", { name: "Today" }));
    expect(at()).toBe(`at ${to}`);
  });
});

describe("the view switcher (AC-3, AC-6, Block 9)", () => {
  it.each([
    ["/month/2026-10", "Month"],
    ["/week/2026-10-14", "Week"],
    ["/day/2026-10-14", "Day"],
    ["/", "Month"],
  ])("on %s, %s is checked and the others are not", (path, name) => {
    renderToolbar(path);
    for (const n of ["Month", "Week", "Day"]) {
      if (n === name) expect(radio(n)).toBeChecked();
      else expect(radio(n)).not.toBeChecked();
    }
  });

  it("with 14 October selected, choosing Week on desktop goes to /week/2026-10-12 (AC-3)", async () => {
    const { user } = renderToolbar("/month/2026-10", { width: 1280 });
    act(() => setSelected(d(2026, 10, 14)));
    await user.click(radio("Week"));
    expect(at()).toBe("at /week/2026-10-12");
    expect(radio("Week")).toBeChecked();
    expect(title()).toHaveAccessibleName("12 – 18 Oct 2026");
  });

  it("with 14 October selected, choosing Week on the phone goes to /week/2026-10-14 (PO decision 3)", async () => {
    const { user } = renderToolbar("/month/2026-10", { width: 375 });
    act(() => setSelected(d(2026, 10, 14)));
    await user.click(radio("Week"));
    expect(at()).toBe("at /week/2026-10-14");
  });

  it.each([
    ["Day", "/month/2026-10", "14 Oct", d(2026, 10, 14), "/day/2026-10-14"],
    ["Month", "/week/2026-10-14", "14 Oct", d(2026, 10, 14), "/month/2026-10"],
    ["Week", "/month/2026-10", "3 Nov", d(2026, 11, 3), "/week/2026-11-02"],
    ["Month", "/day/2026-10-14", "25 Dec", d(2026, 12, 25), "/month/2026-12"],
  ])(
    "choosing %s from %s with %s selected goes to %s",
    async (name, path, _label, selected, to) => {
      const { user } = renderToolbar(path);
      act(() => setSelected(selected));
      await user.click(radio(name));
      expect(at()).toBe(`at ${to}`);
    },
  );

  it.each([
    ["Week", "/month/2026-10", 1280, "/week/2026-09-28"],
    ["Week", "/month/2026-10", 375, "/week/2026-10-01"],
    ["Day", "/week/2026-10-14", 1280, "/day/2026-10-14"],
    ["Month", "/day/2026-12-25", 1280, "/month/2026-12"],
  ])(
    "with nothing selected, choosing %s from %s at %ipx uses the period's own date: %s",
    async (name, path, width, to) => {
      const { user } = renderToolbar(path, { width });
      await user.click(radio(name));
      expect(at()).toBe(`at ${to}`);
    },
  );

  it.each([
    ["Week", "week"],
    ["Day", "day"],
  ])(
    'choosing %s stores "%s" under localStorage cc.view (AC-6)',
    async (name, stored) => {
      const { user } = renderToolbar("/month/2026-10");
      expect(localStorage.getItem("cc.view")).toBeNull();
      await user.click(radio(name));
      expect(localStorage.getItem("cc.view")).toBe(stored);
    },
  );

  it('choosing Month stores "month"', async () => {
    const { user } = renderToolbar("/day/2026-10-14");
    await user.click(radio("Month"));
    expect(localStorage.getItem("cc.view")).toBe("month");
  });

  it("rendering alone stores nothing", () => {
    renderToolbar("/week/2026-10-14");
    expect(localStorage.getItem("cc.view")).toBeNull();
  });

  it("ArrowRight on the checked Month radio switches to the week of the selection, focused, and stores it", async () => {
    const { user } = renderToolbar("/month/2026-10");
    act(() => setSelected(d(2026, 10, 14)));
    radio("Month").focus();
    await user.keyboard("{ArrowRight}");
    expect(at()).toBe("at /week/2026-10-12");
    expect(radio("Week")).toBeChecked();
    expect(radio("Week")).toHaveFocus();
    expect(localStorage.getItem("cc.view")).toBe("week");
  });

  it("ArrowLeft on Month wraps round to Day", async () => {
    const { user } = renderToolbar("/month/2026-10");
    act(() => setSelected(d(2026, 10, 14)));
    radio("Month").focus();
    await user.keyboard("{ArrowLeft}");
    expect(at()).toBe("at /day/2026-10-14");
    expect(radio("Day")).toHaveFocus();
  });
});

describe("the T, M, W and D shortcuts (AC-4, Block 9)", () => {
  it.each([
    ["t", "/month/2027-03", 1280, "/month/2026-10"],
    ["T", "/day/2026-01-01", 1280, "/day/2026-10-14"],
    ["t", "/week/2026-11-04", 1280, "/week/2026-10-12"],
    ["t", "/week/2026-11-04", 375, "/week/2026-10-14"],
  ])(
    "%s on %s at %ipx goes to today's period: %s",
    async (key, path, width, to) => {
      const { user } = renderToolbar(path, { width });
      await user.keyboard(key);
      expect(at()).toBe(`at ${to}`);
    },
  );

  it.each([
    ["w", "/month/2026-10", "/week/2026-10-12", "week"],
    ["W", "/month/2026-10", "/week/2026-10-12", "week"],
    ["d", "/month/2026-10", "/day/2026-10-14", "day"],
    ["D", "/week/2026-10-14", "/day/2026-10-14", "day"],
    ["m", "/week/2026-10-14", "/month/2026-10", "month"],
    ["M", "/day/2026-10-14", "/month/2026-10", "month"],
  ])(
    "%s on %s with 14 October selected goes to %s and stores %j",
    async (key, path, to, stored) => {
      const { user } = renderToolbar(path);
      act(() => setSelected(d(2026, 10, 14)));
      await user.keyboard(key);
      expect(at()).toBe(`at ${to}`);
      expect(localStorage.getItem("cc.view")).toBe(stored);
    },
  );

  it("Control+T does nothing; the bare key then works", async () => {
    const { user } = renderToolbar("/month/2027-03");
    await user.keyboard("{Control>}t{/Control}");
    expect(at()).toBe("at /month/2027-03");
    await user.keyboard("t");
    expect(at()).toBe("at /month/2026-10");
  });

  it("W typed into a text field types and does not switch view", async () => {
    const { user } = renderToolbar("/month/2026-10", { withField: true });
    const field = screen.getByLabelText("Notes");
    await user.click(field);
    await user.keyboard("wdt");
    expect(field).toHaveValue("wdt");
    expect(at()).toBe("at /month/2026-10");
    expect(localStorage.getItem("cc.view")).toBeNull();
  });
});

describe("a calendar path whose date does not parse (Block 9, PO decision 13)", () => {
  it('at /month/2026-13 the <h1> reads today\'s month, "October 2026", with Month checked', () => {
    renderToolbar("/month/2026-13");
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveAccessibleName("October 2026");
    expect(radio("Month")).toBeChecked();
    expect(radio("Week")).not.toBeChecked();
    expect(radio("Day")).not.toBeChecked();
  });
});
describe("off the calendar routes (Block 9)", () => {
  it.each(["/kinds", "/capture", "/settings/notifications", "/welcome"])(
    "on %s it renders nothing: no heading, no buttons, no switcher",
    (path) => {
      renderToolbar(path);
      expect(screen.queryByRole("heading")).toBeNull();
      expect(screen.queryByRole("button")).toBeNull();
      expect(screen.queryByRole("radiogroup")).toBeNull();
    },
  );

  it("on /kinds, T, M, W and D do nothing", async () => {
    const { user } = renderToolbar("/kinds");
    await user.keyboard("tmwd");
    expect(at()).toBe("at /kinds");
    expect(localStorage.getItem("cc.view")).toBeNull();
  });
});

describe("/ shows the stored view (AC-6, Block 9)", () => {
  it.each([
    ["week", "12 – 18 Oct 2026", "Week"],
    ["day", "Wednesday 14 October 2026", "Day"],
    ["month", "October 2026", "Month"],
    ["fortnight", "October 2026", "Month"],
  ])(
    "with cc.view = %j, / is titled %j with %s checked, and stays at /",
    (stored, text, checked) => {
      localStorage.setItem("cc.view", stored);
      renderToolbar("/");
      expect(title()).toHaveAccessibleName(text);
      expect(radio(checked)).toBeChecked();
      expect(at()).toBe("at /");
    },
  );

  it("a localStorage that throws on read reads as month", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    renderToolbar("/");
    expect(title()).toHaveAccessibleName("October 2026");
  });
});
