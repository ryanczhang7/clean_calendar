import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installMatchMedia } from "../test/media";
import {
  ANDROID_UA,
  COPY,
  DESKTOP_UA,
  installPushBrowser,
  type Permission,
  type PushBrowser,
  VAPID_KEY,
} from "../test/push";
import { NotificationsPage } from "./NotificationsPage";

vi.mock(
  "../lib/supabase",
  async () => (await import("../test/supabase-mock")).supabaseModule,
);

// CAL-027 Contract, Block 5 (AC-5, AC-6). /settings/notifications: the <h1>
// (still pinned by routes.test.tsx), the settings card in the state matching
// the current permission, and the addendum on any device that is not an
// installed Android PWA. The worker never becomes ready (`ready: "pending"`),
// so no test here reaches the network. SETTLED: copy from voice.md (COPY).

let browser: PushBrowser | null = null;
let media: ReturnType<typeof installMatchMedia> | null = null;

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  browser?.restore();
  browser = null;
  Reflect.deleteProperty(navigator, "userAgent");
  media?.restore();
  media = null;
  vi.unstubAllEnvs();
  sessionStorage.clear();
});

function setDevice(opts: {
  permission: Permission | "unsupported";
  displayMode: "standalone" | "browser";
  userAgent: string;
}): PushBrowser | null {
  media = installMatchMedia({
    width: 400,
    colorScheme: "light",
    displayMode: opts.displayMode,
  });
  if (opts.permission === "unsupported") {
    // Only the user agent: Notification, the worker and PushManager absent.
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: opts.userAgent,
    });
    // The afterEach deletes this own property again.
    return null;
  }
  browser = installPushBrowser({
    permission: opts.permission,
    ready: "pending",
    userAgent: opts.userAgent,
  });
  vi.stubEnv("VITE_VAPID_PUBLIC_KEY", VAPID_KEY);
  return browser;
}

const PHONE = { displayMode: "standalone", userAgent: ANDROID_UA } as const;
const LAPTOP = { displayMode: "browser", userAgent: DESKTOP_UA } as const;

const h1 = () =>
  screen.getByRole("heading", { level: 1, name: "Notifications" });
const card = () => screen.queryByRole("region", { name: COPY.title });
const addendum = () => screen.queryByText(COPY.addendum);
/** The card, or a failure naming the missing region. */
const theCard = () => screen.getByRole("region", { name: COPY.title });

describe("NotificationsPage - the card per permission (AC-5, Block 5)", () => {
  it("default: one <h1> Notifications, then the ask with both buttons; the page asks nothing by itself", () => {
    const b = setDevice({ permission: "default", ...PHONE });
    render(<NotificationsPage />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(h1()).toHaveAttribute("tabindex", "-1");
    const region = theCard();
    expect(
      within(region)
        .getAllByRole("button")
        .map((x) => x.textContent),
    ).toStrictEqual([COPY.allow, COPY.notNow]);
    expect(within(region).getByText(COPY.line)).toBeVisible();
    expect(
      h1().compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(b?.requestPermission).not.toHaveBeenCalled();
  });

  it("denied: the blocked notice, and no buttons", () => {
    setDevice({ permission: "denied", ...PHONE });
    render(<NotificationsPage />);
    const region = theCard();
    expect(within(region).getByRole("status")).toHaveTextContent(COPY.denied);
    expect(within(region).queryAllByRole("button")).toHaveLength(0);
  });

  it('granted: "Notifications are on for this device." and no buttons', () => {
    setDevice({ permission: "granted", ...PHONE });
    render(<NotificationsPage />);
    const region = theCard();
    expect(within(region).getByRole("status")).toHaveTextContent(COPY.allowed);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("unsupported: the <h1> and no card - where the same page on a supported browser shows the card", () => {
    setDevice({ permission: "unsupported", ...PHONE });
    const first = render(<NotificationsPage />);
    expect(h1()).toBeInTheDocument();
    expect(card()).toBeNull();
    first.unmount();
    media?.restore();
    setDevice({ permission: "default", ...PHONE });
    render(<NotificationsPage />);
    expect(theCard()).toBeInTheDocument();
  });
});

describe("NotificationsPage - the laptop addendum (AC-5, Block 5)", () => {
  it.each([
    ["standalone", "an Android", false],
    ["standalone", "a desktop", true],
    ["browser", "an Android", true],
    ["browser", "a desktop", true],
  ] as const)(
    "display-mode %s on %s user agent: addendum shown = %s",
    (displayMode, label, shown) => {
      const userAgent = label === "an Android" ? ANDROID_UA : DESKTOP_UA;
      setDevice({ permission: "default", displayMode, userAgent });
      render(<NotificationsPage />);
      if (shown) {
        const p = screen.getByText(COPY.addendum);
        expect(p.tagName).toBe("P");
        expect(p.textContent).toBe(COPY.addendum);
        // After the card: h1, card, addendum.
        expect(
          theCard().compareDocumentPosition(p) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
      } else {
        expect(addendum()).toBeNull();
        expect(card()).not.toBeNull();
      }
    },
  );

  it.each(["granted", "denied", "unsupported"] as const)(
    "does not depend on the permission: on a laptop it shows with permission %s too",
    (permission) => {
      setDevice({ permission, ...LAPTOP });
      render(<NotificationsPage />);
      expect(addendum()).not.toBeNull();
    },
  );

  it("is shown where matchMedia is missing, even on an Android user agent", () => {
    browser = installPushBrowser({
      permission: "default",
      ready: "pending",
      userAgent: ANDROID_UA,
    });
    render(<NotificationsPage />);
    expect(addendum()).not.toBeNull();
  });
});

describe("NotificationsPage - Not now and Allow (AC-6, AC-5, Block 5)", () => {
  it('"Not now" requests nothing, hides the card, moves focus to the <h1>, and the ask is back the next time the page opens', async () => {
    const b = setDevice({ permission: "default", ...LAPTOP });
    const user = userEvent.setup();
    const first = render(<NotificationsPage />);
    await user.click(screen.getByRole("button", { name: COPY.notNow }));
    expect(b?.requestPermission).not.toHaveBeenCalled();
    expect(card()).toBeNull();
    expect(h1()).toHaveFocus();
    expect(addendum()).not.toBeNull();
    first.unmount();
    render(<NotificationsPage />);
    expect(
      screen.getByRole("button", { name: COPY.allow }),
    ).toBeInTheDocument();
  });

  it('Allow answered granted: "Notifications are on for this device." replaces the ask and has focus', async () => {
    const b = setDevice({ permission: "default", ...PHONE }) as PushBrowser;
    const user = userEvent.setup();
    render(<NotificationsPage />);
    await user.click(screen.getByRole("button", { name: COPY.allow }));
    await act(async () => {
      b.answer("granted");
    });
    const status = within(theCard()).getByRole("status");
    expect(status).toHaveTextContent(COPY.allowed);
    expect(status).toHaveFocus();
    expect(b.requestPermission).toHaveBeenCalledTimes(1);
  });
});
