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

type Listener = (event: FakeEvent) => void;
type FakeEvent = { data?: unknown; waitUntil: (p: unknown) => void };

const SW_MODULE = "./sw";

function fakeSelf() {
  const listeners = new Map<string, Listener[]>();
  const injected = [
    { url: "index.html", revision: "abc123" },
    { url: "assets/index-x1.js", revision: null },
  ];
  const self = {
    __WB_MANIFEST: injected,
    skipWaiting: vi.fn(async () => {}),
    addEventListener: vi.fn((type: string, listener: Listener) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    }),
  };
  return {
    self,
    injected,
    /** Deliver one event to every listener of `type`, as the browser would. */
    dispatch(type: string, data?: unknown) {
      for (const l of listeners.get(type) ?? []) {
        l({ data, waitUntil: () => {} });
      }
    },
    types: () => [...listeners.keys()],
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
