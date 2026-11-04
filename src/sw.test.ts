import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// CAL-017 Contract Block 3: the service worker's wiring (AC-3) and its half of
// the update flow (AC-4). The seam, as amended into Block 3 by RED:
//
//   * src/sw.ts is an ordinary injectManifest worker. It exports nothing and
//     runs at module load against the global `self`.
//   * This suite installs a fake `self` with vi.stubGlobal, mocks the three
//     workbox modules, and loads a FRESH copy of src/sw.ts per test.
//   * The import specifier is held in a variable, so `tsc -p tsconfig.json`
//     (DOM lib) does not follow it into src/sw.ts, which is checked under
//     tsconfig.sw.json (WebWorker lib) instead.

const wb = vi.hoisted(() => {
  const handler = { kind: "index.html handler" };
  return {
    handler,
    precacheAndRoute: vi.fn(),
    cleanupOutdatedCaches: vi.fn(),
    createHandlerBoundToURL: vi.fn((_url: string) => handler),
    registerRoute: vi.fn(),
    clientsClaim: vi.fn(),
    NavigationRoute: vi.fn(function NavigationRoute(
      this: { handler: unknown },
      handler: unknown,
    ) {
      this.handler = handler;
    }),
  };
});

vi.mock("workbox-precaching", () => ({
  precacheAndRoute: wb.precacheAndRoute,
  cleanupOutdatedCaches: wb.cleanupOutdatedCaches,
  createHandlerBoundToURL: wb.createHandlerBoundToURL,
}));
vi.mock("workbox-routing", () => ({
  registerRoute: wb.registerRoute,
  NavigationRoute: wb.NavigationRoute,
}));
vi.mock("workbox-core", () => ({ clientsClaim: wb.clientsClaim }));

// CAL-022 Contract, Block 4: the worker opens the share inbox only for a
// share. The inbox module is mocked (no IndexedDB in this suite); the share
// handler, ./pwa/shareTarget, is the REAL one.
const box = vi.hoisted(() => {
  const inbox = {
    put: vi.fn(async (_entry: unknown) => {}),
    take: vi.fn(async () => null),
    count: vi.fn(async () => 0),
  };
  return { inbox, openInbox: vi.fn(() => inbox) };
});
vi.mock("./pwa/inbox", () => ({ openInbox: box.openInbox }));

type Listener = (event: FakeEvent) => void;
type FakeEvent = {
  data?: unknown;
  waitUntil: (p: unknown) => void;
  // CAL-022: a fetch event also carries its request and respondWith.
  request?: FakeRequest;
  respondWith?: (r: Promise<Response> | Response) => void;
  // CAL-028: a notificationclick event carries its notification.
  notification?: FakeNotification;
};
type FakeNotification = { data?: unknown; close: () => void };
type FakeWindow = {
  focus: () => Promise<unknown>;
  navigate: (url: string) => Promise<unknown>;
};
type FakeRequest = {
  method: string;
  url: string;
  formData: () => Promise<FormData>;
};

const SW_MODULE = "./sw";

function fakeSelf() {
  const listeners = new Map<string, Listener[]>();
  const injected = [
    { url: "index.html", revision: "abc123" },
    { url: "assets/index-x1.js", revision: null },
  ];
  // CAL-028 Block 6: what the push handlers reach through `self`.
  const windows: FakeWindow[] = [];
  const self = {
    __WB_MANIFEST: injected,
    skipWaiting: vi.fn(async () => {}),
    addEventListener: vi.fn((type: string, listener: Listener) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    }),
    registration: {
      showNotification: vi.fn(
        async (_title: string, _options: unknown): Promise<void> => {},
      ),
    },
    clients: {
      matchAll: vi.fn(async (_options: unknown) => windows),
      openWindow: vi.fn(async (_url: string): Promise<unknown> => null),
    },
  };
  return {
    self,
    injected,
    windows,
    /**
     * Deliver one event of `type` built from `fields`, as the browser would;
     * returns every promise handed to waitUntil, so a test can await them.
     */
    deliver(type: string, fields: Partial<FakeEvent>) {
      const waited: unknown[] = [];
      for (const l of listeners.get(type) ?? []) {
        l({ ...fields, waitUntil: (p: unknown) => waited.push(p) });
      }
      return waited;
    },
    /** Deliver one event to every listener of `type`, as the browser would. */
    dispatch(type: string, data?: unknown) {
      for (const l of listeners.get(type) ?? []) {
        l({ data, waitUntil: () => {} });
      }
    },
    types: () => [...listeners.keys()],
    /** Deliver one fetch event, as the browser would; returns its respondWith. */
    fetch(request: FakeRequest) {
      const respondWith = vi.fn<(r: Promise<Response> | Response) => void>();
      for (const l of listeners.get("fetch") ?? []) {
        l({ request, respondWith, waitUntil: () => {} });
      }
      return respondWith;
    },
  };
}

async function loadWorker() {
  const fake = fakeSelf();
  vi.stubGlobal("self", fake.self);
  await import(/* @vite-ignore */ SW_MODULE);
  return fake;
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the service worker precaches the app shell (AC-3)", () => {
  test("precaches exactly the manifest Workbox injected into self.__WB_MANIFEST", async () => {
    const fake = await loadWorker();
    expect(wb.precacheAndRoute).toHaveBeenCalledTimes(1);
    expect(wb.precacheAndRoute.mock.calls[0]?.[0]).toBe(fake.injected);
  });

  test("removes caches left behind by older Workbox precache versions", async () => {
    await loadWorker();
    expect(wb.cleanupOutdatedCaches).toHaveBeenCalledTimes(1);
  });

  test("answers every navigation with the precached index.html", async () => {
    await loadWorker();
    expect(wb.createHandlerBoundToURL).toHaveBeenCalledWith("index.html");
    expect(wb.NavigationRoute).toHaveBeenCalledTimes(1);
    expect(wb.NavigationRoute.mock.calls[0]?.[0]).toBe(wb.handler);
    expect(wb.registerRoute).toHaveBeenCalledTimes(1);
    const route = wb.registerRoute.mock.calls[0]?.[0];
    expect(route).toBeInstanceOf(wb.NavigationRoute);
    expect((route as { handler: unknown }).handler).toBe(wb.handler);
  });

  test("claims open clients on first activation, so the first load is controlled", async () => {
    await loadWorker();
    expect(wb.clientsClaim).toHaveBeenCalledTimes(1);
  });
});

describe("the service worker activates an update only when asked (AC-4)", () => {
  test('a {type: "SKIP_WAITING"} message makes the waiting worker skip waiting, once', async () => {
    const fake = await loadWorker();
    expect(fake.self.skipWaiting).not.toHaveBeenCalled();
    fake.dispatch("message", { type: "SKIP_WAITING" });
    expect(fake.self.skipWaiting).toHaveBeenCalledTimes(1);
  });

  test.each([
    ["another message type", { type: "other" }],
    ["a null message", null],
    ["an empty message", undefined],
    ["the bare string SKIP_WAITING", "SKIP_WAITING"],
    ["a message with no type", { kind: "SKIP_WAITING" }],
  ])("%s does not make the worker skip waiting", async (_label, data) => {
    const fake = await loadWorker();
    expect(fake.types()).toContain("message");
    fake.dispatch("message", data);
    expect(fake.self.skipWaiting).not.toHaveBeenCalled();
  });

  test("installing a new worker does not skip waiting on its own", async () => {
    const fake = await loadWorker();
    expect(fake.self.skipWaiting).not.toHaveBeenCalled();
    fake.dispatch("install");
    fake.dispatch("activate");
    expect(fake.self.skipWaiting).not.toHaveBeenCalled();
  });
});

describe("the service worker answers the share target, and only it (CAL-022 AC-5, Block 4)", () => {
  function request(method: string, url: string, fields = { text: "Dinner" }) {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    return { method, url, formData: vi.fn(async () => form) };
  }

  // CAL-028 RED: was two toContain checks for "fetch" and "message"; now the
  // exact set, so the two CAL-028 listeners (Block 6) are pinned and nothing
  // else is registered beside them.
  test("adds a fetch listener beside the message listener (and, CAL-028, push and notificationclick)", async () => {
    const fake = await loadWorker();
    expect([...fake.types()].sort()).toEqual(
      ["fetch", "message", "notificationclick", "push"].sort(),
    );
  });

  test("POST /share is answered with a 303 to /capture?from=share, and the share is put in the inbox", async () => {
    const fake = await loadWorker();
    const respondWith = fake.fetch(
      request("POST", "https://app.test/share", { text: "Dinner 3 Nov" }),
    );
    expect(respondWith).toHaveBeenCalledTimes(1);
    const response = await respondWith.mock.calls[0]?.[0];
    expect(response?.status).toBe(303);
    expect(response?.headers.get("location")).toBe(
      "https://app.test/capture?from=share",
    );
    expect(box.openInbox).toHaveBeenCalledTimes(1);
    expect(box.inbox.put).toHaveBeenCalledTimes(1);
    expect(box.inbox.put.mock.calls[0]?.[0]).toMatchObject({
      text: "Dinner 3 Nov",
      image: null,
    });
  });

  test("POST /share does not add a second workbox route", async () => {
    const fake = await loadWorker();
    const respondWith = fake.fetch(request("POST", "https://app.test/share"));
    // Answered by the plain fetch listener, not by a route of its own.
    expect(respondWith).toHaveBeenCalledTimes(1);
    expect(wb.registerRoute).toHaveBeenCalledTimes(1);
  });

  test.each([
    ["GET /share is not answered", "GET", "https://app.test/share"],
    ["POST /capture is not answered", "POST", "https://app.test/capture"],
    ["GET / is not answered", "GET", "https://app.test/"],
    ["POST /share/ is not answered", "POST", "https://app.test/share/"],
    [
      "GET /capture?from=share is not answered",
      "GET",
      "https://app.test/capture?from=share",
    ],
  ])(
    "%s: no respondWith, the inbox is not opened, the form is not read",
    async (_label, method, url) => {
      const fake = await loadWorker();
      // The listener must exist, or "not answered" would hold vacuously.
      expect(fake.types()).toContain("fetch");
      const req = request(method, url);
      const respondWith = fake.fetch(req);
      expect(respondWith).not.toHaveBeenCalled();
      expect(box.openInbox).not.toHaveBeenCalled();
      expect(box.inbox.put).not.toHaveBeenCalled();
      expect(req.formData).not.toHaveBeenCalled();
    },
  );
});

describe("the service worker shows a reminder and opens it on click (CAL-028 AC-6, Block 6)", () => {
  // The REAL ./pwa/pushHandlers computes the expected body and url. Held in a
  // variable for the same reason as SW_MODULE: tsc (DOM lib) does not follow
  // it, and loading it inside the test keeps every other case in this file
  // independent of that module. Its own values are pinned by
  // src/pwa/pushHandlers.test.ts.
  const HANDLERS_MODULE = "./pwa/pushHandlers";
  type Handlers = {
    reminderBody(p: unknown): string;
    reminderUrl(p: unknown): string;
  };
  const handlers = async () =>
    (await import(/* @vite-ignore */ HANDLERS_MODULE)) as Handlers;

  const PAYLOAD = {
    eventId: "evt-1",
    title: "Dentist",
    startsAt: "2026-11-03T05:30:00Z",
    allDay: false,
    location: "12 High Street",
  };
  const URL_ = "/day/2026-11-03?event=evt-1";

  function fakeWindow(log: string[]): FakeWindow {
    return {
      focus: vi.fn(async () => {
        log.push("focus");
      }),
      navigate: vi.fn(async (url: string) => {
        log.push(`navigate ${url}`);
      }),
    };
  }

  test("a push with a reminder payload shows its notification inside waitUntil", async () => {
    const fake = await loadWorker();
    expect(fake.types()).toContain("push");
    const waited = fake.deliver("push", { data: { json: () => PAYLOAD } });
    expect(waited).toHaveLength(1);
    await Promise.all(waited);
    const { reminderBody, reminderUrl } = await handlers();
    const show = fake.self.registration.showNotification;
    expect(show).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledWith("Dentist", {
      body: reminderBody(PAYLOAD),
      data: { url: reminderUrl(PAYLOAD) },
      tag: "evt-1",
    });
  });

  test.each<[string, unknown]>([
    ["no data", undefined],
    [
      "data that is not JSON",
      {
        json: () => {
          throw new SyntaxError("Unexpected token");
        },
      },
    ],
    ["a payload without a title", { json: () => ({ ...PAYLOAD, title: "" }) }],
  ])("a push with %s shows nothing", async (_label, data) => {
    const fake = await loadWorker();
    expect(fake.types()).toContain("push");
    const waited = fake.deliver("push", { data });
    await Promise.all(waited);
    expect(fake.self.registration.showNotification).not.toHaveBeenCalled();
  });

  test("a click closes the notification, focuses the open window and navigates it to the url", async () => {
    const fake = await loadWorker();
    expect(fake.types()).toContain("notificationclick");
    const log: string[] = [];
    const first = fakeWindow(log);
    const second = fakeWindow(log);
    fake.windows.push(first, second);
    const close = vi.fn();
    const waited = fake.deliver("notificationclick", {
      notification: { data: { url: URL_ }, close },
    });
    expect(close).toHaveBeenCalledTimes(1);
    expect(waited).toHaveLength(1);
    await Promise.all(waited);
    expect(fake.self.clients.matchAll).toHaveBeenCalledWith({
      type: "window",
      includeUncontrolled: true,
    });
    expect(log).toEqual(["focus", `navigate ${URL_}`]);
    expect(second.focus).not.toHaveBeenCalled();
    expect(fake.self.clients.openWindow).not.toHaveBeenCalled();
  });

  test("a click with no open window closes the notification and opens one at the url", async () => {
    const fake = await loadWorker();
    expect(fake.types()).toContain("notificationclick");
    const close = vi.fn();
    const waited = fake.deliver("notificationclick", {
      notification: { data: { url: URL_ }, close },
    });
    expect(close).toHaveBeenCalledTimes(1);
    await Promise.all(waited);
    expect(fake.self.clients.openWindow).toHaveBeenCalledTimes(1);
    expect(fake.self.clients.openWindow).toHaveBeenCalledWith(URL_);
  });

  test.each<[string, unknown]>([
    ["no data", undefined],
    ["data without a url", { eventId: "evt-1" }],
    ["a numeric url", { url: 5 }],
  ])(
    "a click on a notification with %s closes it and does nothing else",
    async (_label, data) => {
      const fake = await loadWorker();
      // The listener must exist, or "does nothing" would hold vacuously.
      expect(fake.types()).toContain("notificationclick");
      fake.windows.push(fakeWindow([]));
      const close = vi.fn();
      const waited = fake.deliver("notificationclick", {
        notification: { data, close },
      });
      expect(close).toHaveBeenCalledTimes(1);
      expect(waited).toHaveLength(0);
      expect(fake.self.clients.matchAll).not.toHaveBeenCalled();
      expect(fake.self.clients.openWindow).not.toHaveBeenCalled();
    },
  );
});
