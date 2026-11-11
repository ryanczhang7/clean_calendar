import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installServer, onTable } from "../test/msw";
import {
  COPY,
  CREATED,
  installPushBrowser,
  type Permission,
  type PushBrowser,
  VAPID_KEY,
} from "../test/push";
import { NOT_NOW_KEY, PermissionCard } from "./PermissionCard";

vi.mock(
  "../lib/supabase",
  async () => (await import("../test/supabase-mock")).supabaseModule,
);

// CAL-027 Contract, Block 3 (AC-1, AC-2, AC-3, AC-5, AC-6). The card alone,
// over the REAL pushSubscription module and the fake browser in
// src/test/push.ts. MECHANICAL: every cell of the Block 3 state table, the
// requestPermission call counts (0 on mount, 0 on Not now, 1 per Allow, 0 on
// a second click while busy), `type="button"`, and where focus goes. SETTLED:
// copy is read from voice.md (COPY in src/test/push.ts), not chosen here.
//
// `ready: "pending"` wherever the test is not about the upsert: a worker that
// never becomes ready is exactly the case the card must not wait on.

installServer();

let browser: PushBrowser | null = null;

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  browser?.restore();
  browser = null;
  vi.unstubAllEnvs();
  sessionStorage.clear();
});

function install(
  permission: Permission,
  ready: "resolved" | "pending" = "pending",
): PushBrowser {
  browser = installPushBrowser({ permission, ready, existing: null });
  vi.stubEnv("VITE_VAPID_PUBLIC_KEY", VAPID_KEY);
  return browser;
}

const region = () => screen.getByRole("region", { name: COPY.title });
const allow = () => screen.getByRole("button", { name: COPY.allow });
const notNow = () => screen.getByRole("button", { name: COPY.notNow });

/** The ask, exactly: region, a <p> title (not a heading), the line, two type="button" buttons in order. */
function expectTheAsk(): void {
  const r = region();
  expect(r.tagName).toBe("SECTION");
  const titleId = r.getAttribute("aria-labelledby") ?? "";
  const title = within(r).getByText(COPY.title);
  expect(title.tagName).toBe("P");
  expect(title.id).toBe(titleId);
  expect(within(r).queryAllByRole("heading")).toHaveLength(0);
  expect(within(r).getByText(COPY.line).tagName).toBe("P");
  const buttons = within(r).getAllByRole("button");
  expect(buttons.map((b) => b.textContent)).toStrictEqual([
    COPY.allow,
    COPY.notNow,
  ]);
  for (const b of buttons) expect(b).toHaveAttribute("type", "button");
  expect(within(r).queryByRole("status")).toBeNull();
}

/** A notice in place of the ask: region and title stay, one role=status <p> with `text`, no buttons. */
function expectNotice(text: string): HTMLElement {
  const r = region();
  expect(within(r).getByText(COPY.title).tagName).toBe("P");
  expect(within(r).queryAllByRole("button")).toHaveLength(0);
  expect(within(r).queryByText(COPY.line)).toBeNull();
  const statuses = within(r).getAllByRole("status");
  expect(statuses).toHaveLength(1);
  const status = statuses[0] as HTMLElement;
  expect(status.tagName).toBe("P");
  expect(status).toHaveTextContent(text);
  expect(status.textContent).toBe(text);
  expect(status).toHaveAttribute("tabindex", "-1");
  return status;
}

describe("PermissionCard - the state table at mount (Block 3, AC-1, AC-5)", () => {
  it.each(["form", "settings"] as const)(
    "unsupported (no Notification, service worker or PushManager), placement %s: renders nothing",
    (placement) => {
      const { container } = render(<PermissionCard placement={placement} />);
      expect(container).toBeEmptyDOMElement();
    },
  );

  it.each(["form", "settings"] as const)(
    "default, placement %s: the ask - and mounting it requests nothing",
    (placement) => {
      const b = install("default");
      render(<PermissionCard placement={placement} />);
      expectTheAsk();
      expect(b.requestPermission).not.toHaveBeenCalled();
    },
  );

  it('default, placement form, after "Not now" earlier this session (sessionStorage flag "1"): nothing', () => {
    install("default");
    sessionStorage.setItem("cc.notifications.notNow", "1");
    const { container } = render(<PermissionCard placement="form" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("default, placement settings, with the session flag set: the ask all the same (PO decision 2)", () => {
    install("default");
    sessionStorage.setItem("cc.notifications.notNow", "1");
    render(<PermissionCard placement="settings" />);
    expectTheAsk();
  });

  it("denied at mount, placement form: nothing (no nagging on every sheet)", () => {
    install("denied");
    const { container } = render(<PermissionCard placement="form" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("denied at mount, placement settings: the blocked notice, which does not take focus at mount", () => {
    const b = install("denied");
    render(<PermissionCard placement="settings" />);
    const status = expectNotice(COPY.denied);
    expect(status).not.toHaveFocus();
    expect(b.requestPermission).not.toHaveBeenCalled();
  });

  it("granted, placement form: nothing", () => {
    install("granted");
    const { container } = render(<PermissionCard placement="form" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('granted, placement settings: "Notifications are on for this device." with no buttons', () => {
    const b = install("granted");
    render(<PermissionCard placement="settings" />);
    const status = expectNotice(COPY.allowed);
    expect(status).not.toHaveFocus();
    expect(b.requestPermission).not.toHaveBeenCalled();
  });

  it("NOT_NOW_KEY is the sessionStorage key cc.notifications.notNow", () => {
    expect(NOT_NOW_KEY).toBe("cc.notifications.notNow");
  });
});

describe("PermissionCard - Allow (Block 3, AC-2, AC-3)", () => {
  it("requestPermission is called synchronously from the click handler, before any await: once, right as the click is dispatched", () => {
    const b = install("default");
    render(<PermissionCard placement="form" />);
    expect(b.requestPermission).toHaveBeenCalledTimes(0);
    fireEvent.click(allow());
    expect(b.requestPermission).toHaveBeenCalledTimes(1);
  });

  it('while the request is pending, Allow carries aria-busy="true" and a second click requests nothing', async () => {
    const b = install("default");
    const user = userEvent.setup();
    render(<PermissionCard placement="form" />);
    await user.click(allow());
    expect(allow()).toHaveAttribute("aria-busy", "true");
    await user.click(allow());
    expect(b.requestPermission).toHaveBeenCalledTimes(1);
    expect(b.pending()).toBe(1);
  });

  it.each(["form", "settings"] as const)(
    "answered denied, placement %s: the blocked notice replaces the ask and takes focus (AC-3)",
    async (placement) => {
      const b = install("default");
      const onGone = vi.fn();
      const user = userEvent.setup();
      render(<PermissionCard placement={placement} onGone={onGone} />);
      await user.click(allow());
      await act(async () => {
        b.answer("denied");
      });
      const status = expectNotice(COPY.denied);
      expect(status).toHaveFocus();
      expect(onGone).not.toHaveBeenCalled();
      expect(b.requestPermission).toHaveBeenCalledTimes(1);
    },
  );

  it("answered default (the prompt was closed): the ask again, not busy, and Allow requests again - one request per press", async () => {
    const b = install("default");
    const user = userEvent.setup();
    render(<PermissionCard placement="form" />);
    await user.click(allow());
    await act(async () => {
      b.answer("default");
    });
    expectTheAsk();
    expect(allow()).not.toHaveAttribute("aria-busy", "true");
    await user.click(allow());
    expect(b.requestPermission).toHaveBeenCalledTimes(2);
  });

  it("answered granted, placement form: the card removes itself and calls onGone once - even with a worker that never becomes ready", async () => {
    const b = install("default", "pending");
    const onGone = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <PermissionCard placement="form" onGone={onGone} />,
    );
    await user.click(allow());
    await act(async () => {
      b.answer("granted");
    });
    expect(container).toBeEmptyDOMElement();
    expect(onGone).toHaveBeenCalledTimes(1);
  });

  it('answered granted, placement settings: "Notifications are on for this device." replaces the ask and takes focus; onGone is not called', async () => {
    const b = install("default", "pending");
    const onGone = vi.fn();
    const user = userEvent.setup();
    render(<PermissionCard placement="settings" onGone={onGone} />);
    await user.click(allow());
    await act(async () => {
      b.answer("granted");
    });
    const status = expectNotice(COPY.allowed);
    expect(status).toHaveFocus();
    expect(onGone).not.toHaveBeenCalled();
  });

  it("answered granted: the device subscribes with userVisibleOnly and the VAPID key, and its endpoint, p256dh, auth and user agent are upserted by endpoint (AC-2)", async () => {
    const b = install("default", "resolved");
    const seen = onTable("push_subscriptions", (req) =>
      HttpResponse.json(
        [
          {
            id: "row-1",
            endpoint: (req.body as { endpoint: string }).endpoint,
          },
        ],
        { status: 201 },
      ),
    );
    const user = userEvent.setup();
    render(<PermissionCard placement="form" />);
    expect(b.subscribe).not.toHaveBeenCalled();
    await user.click(allow());
    await act(async () => {
      b.answer("granted");
    });
    await waitFor(() => expect(seen).toHaveLength(1));
    expect(b.subscribe).toHaveBeenCalledTimes(1);
    const options = b.subscribe.mock.calls[0]?.[0];
    expect(options?.userVisibleOnly).toBe(true);
    expect(
      Array.from(options?.applicationServerKey as Uint8Array),
    ).toStrictEqual(Array.from(Buffer.from(VAPID_KEY, "base64url")));
    const req = seen[0];
    expect(req?.method).toBe("POST");
    expect(req?.url.searchParams.get("on_conflict")).toBe("endpoint");
    expect(req?.body).toStrictEqual({
      endpoint: CREATED.endpoint,
      p256dh: "BCreated-p256dh_key",
      auth: "created_auth-2",
      user_agent: navigator.userAgent,
      last_seen_at: expect.any(String),
    });
    expect(b.requestPermission).toHaveBeenCalledTimes(1);
  });
});

describe('PermissionCard - "Not now" (Block 3, AC-6)', () => {
  it('placement form: requests nothing, hides, sets sessionStorage cc.notifications.notNow = "1" and calls onGone once', async () => {
    const b = install("default");
    const onGone = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <PermissionCard placement="form" onGone={onGone} />,
    );
    expectTheAsk();
    await user.click(notNow());
    expect(b.requestPermission).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
    expect(sessionStorage.getItem("cc.notifications.notNow")).toBe("1");
    expect(onGone).toHaveBeenCalledTimes(1);
  });

  it("placement form: a form card mounted later in the same session stays hidden", async () => {
    install("default");
    const user = userEvent.setup();
    const first = render(<PermissionCard placement="form" />);
    await user.click(notNow());
    first.unmount();
    const { container } = render(<PermissionCard placement="form" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("placement settings: requests nothing and hides, then shows the ask again when the page's card next mounts", async () => {
    const b = install("default");
    const onGone = vi.fn();
    const user = userEvent.setup();
    const first = render(
      <PermissionCard placement="settings" onGone={onGone} />,
    );
    await user.click(notNow());
    expect(b.requestPermission).not.toHaveBeenCalled();
    expect(first.container).toBeEmptyDOMElement();
    expect(onGone).toHaveBeenCalledTimes(1);
    first.unmount();
    render(<PermissionCard placement="settings" />);
    expectTheAsk();
  });
});

describe("PermissionCard inside a <form> (Block 3: type=button is load-bearing)", () => {
  it("pressing Allow or Not now never submits the surrounding form - while a submit button in the same form does (the control)", async () => {
    const b = install("default");
    const submit = vi.fn((e: { preventDefault(): void }) => e.preventDefault());
    const user = userEvent.setup();
    render(
      <form onSubmit={submit}>
        <PermissionCard placement="form" />
        <button type="submit">Control</button>
      </form>,
    );
    await user.click(allow());
    await act(async () => {
      b.answer("default");
    });
    await user.click(notNow());
    expect(submit).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Control" }));
    expect(submit).toHaveBeenCalledTimes(1);
  });
});
