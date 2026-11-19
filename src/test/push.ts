import { type Mock, vi } from "vitest";

// The browser half of Web Push, faked for jsdom, which has none of it
// (CAL-027 Contract, Blocks 2 and 3; story Context: "`Notification`,
// `navigator.serviceWorker` and `PushManager` are stubbed"). It imports
// nothing from the source tree, so it can be read before the modules it
// serves exist.
//
//   const browser = installPushBrowser({ permission: "default" });
//   ...click Allow...
//   act(() => browser.answer("granted"));
//   browser.restore();                    // in an afterEach - always
//
// What it installs, and nothing more:
//   * `globalThis.Notification`: `permission` reads the current state;
//     `requestPermission()` returns a promise that stays pending until the
//     test calls `answer(p)`, which settles the oldest pending request with
//     `p` and - as a browser does - makes `permission` read `p` from then on;
//   * `globalThis.PushManager`: an empty class (only its presence is read);
//   * `navigator.serviceWorker.ready`: resolves to a registration whose
//     `pushManager` has `getSubscription` and `subscribe`, both mocks - or,
//     with `ready: "pending"`, never resolves, as on a page where no worker
//     is registered;
//   * optionally `navigator.userAgent`, as an own property of `navigator`.
//
// `omit` leaves one of the three out, so "unsupported" can be driven one
// missing piece at a time. `restore()` removes everything it installed, so no
// later test sees a supported browser.

export type Permission = "default" | "granted" | "denied";

/** A real VAPID-shaped key: 87 base64url characters, 65 bytes, first byte
 *  0x04, and it contains both `-` and `_` (the SETTLED vapidKeyBytes case). */
export const VAPID_KEY =
  "BDBVep_E6Q4zWPvv_-wRNluApcrvFDleg6jN8hc8YYar0PUaP2SJrtP4HUJnjLHW-yBFao-02f4jSG2St9wBJks";

/** Key A (CAL-073): a second VAPID-shaped key, 87 characters, 65 bytes,
 *  first byte 0x04, differing from VAPID_KEY in 64 of its 65 bytes. */
export const VAPID_KEY_A =
  "BCN-2TSP6kWg-1axDGfCHXjTLonkP5r1UKsGYbwXcs0og945lO9KpQBbthFsxyJ92DOO6USf-lWwC2bBHHfSLYg";

export type FakeSubscription = {
  endpoint: string;
  /** CAL-073. Absent on `fakeSubscription(...)`: "the engine does not
   *  report the key". */
  options?: { applicationServerKey: ArrayBuffer | null };
  /** CAL-073. Absent on `fakeSubscription(...)`. */
  unsubscribe?: Mock<() => Promise<boolean>>;
  toJSON(): {
    endpoint: string;
    expirationTime: null;
    keys?: { p256dh?: string; auth?: string };
  };
};

export function fakeSubscription(
  endpoint: string,
  keys: { p256dh?: string; auth?: string } | undefined,
): FakeSubscription {
  return {
    endpoint,
    toJSON: () =>
      keys === undefined
        ? { endpoint, expirationTime: null }
        : { endpoint, expirationTime: null, keys: { ...keys } },
  };
}

/**
 * CAL-073 Contract, Block 5: a subscription that reports the key it was made
 * under, as Chrome, Firefox and Safari 16+ do. `applicationServerKey` is the
 * key's bytes (or `null`, "reported as null"); it is stored as a fresh
 * `ArrayBuffer` of exactly that length - a copy, never a view over a larger
 * buffer - which is what a browser hands back. `unsubscribe` is a mock that
 * resolves `true` ("ok"), resolves `false` ("false") or rejects ("reject").
 */
export function subscriptionUnderKey(
  endpoint: string,
  keys: { p256dh?: string; auth?: string } | undefined,
  applicationServerKey: readonly number[] | null,
  unsubscribe: "ok" | "false" | "reject" = "ok",
): FakeSubscription & {
  options: { applicationServerKey: ArrayBuffer | null };
  unsubscribe: Mock<() => Promise<boolean>>;
} {
  const stored =
    applicationServerKey === null
      ? null
      : new Uint8Array(applicationServerKey).buffer;
  return {
    ...fakeSubscription(endpoint, keys),
    options: { applicationServerKey: stored },
    unsubscribe: vi.fn(async () => {
      if (unsubscribe === "reject") {
        throw new DOMException("Unsubscribe failed", "AbortError");
      }
      return unsubscribe === "ok";
    }),
  };
}

export const EXISTING = fakeSubscription(
  "https://push.example.test/send/existing-device",
  { p256dh: "BExisting_p256dh-key", auth: "existing-auth_1" },
);

export const CREATED = fakeSubscription(
  "https://push.example.test/send/created-device",
  { p256dh: "BCreated-p256dh_key", auth: "created_auth-2" },
);

export type PushBrowser = {
  requestPermission: Mock<() => Promise<Permission>>;
  getSubscription: Mock<() => Promise<FakeSubscription | null>>;
  subscribe: Mock<
    (options: PushSubscriptionOptionsInit) => Promise<FakeSubscription>
  >;
  /** Settle the oldest pending requestPermission() with `p`. */
  answer(p: Permission): void;
  /** How many requestPermission() calls have not been answered. */
  pending(): number;
  restore(): void;
};

export function installPushBrowser(opts: {
  permission: Permission;
  /** What getSubscription() resolves to. Default: null (none yet). */
  existing?: FakeSubscription | null;
  /** What subscribe() resolves to. Default: CREATED. */
  created?: FakeSubscription;
  /** Default "resolved". */
  ready?: "resolved" | "pending";
  omit?: "Notification" | "serviceWorker" | "PushManager";
  userAgent?: string;
}): PushBrowser {
  const state = { permission: opts.permission };
  const waiting: Array<(p: Permission) => void> = [];

  const requestPermission: PushBrowser["requestPermission"] = vi.fn(
    () =>
      new Promise<Permission>((resolve) => {
        waiting.push(resolve);
      }),
  );
  const getSubscription: PushBrowser["getSubscription"] = vi.fn(async () =>
    opts.existing === undefined ? null : opts.existing,
  );
  const subscribe: PushBrowser["subscribe"] = vi.fn(
    async () => opts.created ?? CREATED,
  );

  if (opts.omit !== "Notification") {
    // A function, as the real constructor is, so a `typeof Notification`
    // support check sees what a browser would show it.
    const FakeNotification = function Notification(): void {};
    Object.defineProperty(FakeNotification, "permission", {
      configurable: true,
      get: (): Permission => state.permission,
    });
    Object.defineProperty(FakeNotification, "requestPermission", {
      configurable: true,
      value: requestPermission,
    });
    vi.stubGlobal("Notification", FakeNotification);
  }
  if (opts.omit !== "PushManager") {
    vi.stubGlobal("PushManager", class FakePushManager {});
  }
  if (opts.omit !== "serviceWorker") {
    const registration = { pushManager: { getSubscription, subscribe } };
    const ready =
      opts.ready === "pending"
        ? new Promise<never>(() => {})
        : Promise.resolve(registration);
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { ready },
    });
  }
  if (opts.userAgent !== undefined) {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: opts.userAgent,
    });
  }

  return {
    requestPermission,
    getSubscription,
    subscribe,
    answer(p) {
      const next = waiting.shift();
      if (next === undefined) {
        throw new Error("answer(): no requestPermission() is pending");
      }
      state.permission = p;
      next(p);
    },
    pending: () => waiting.length,
    restore() {
      vi.unstubAllGlobals();
      Reflect.deleteProperty(navigator, "serviceWorker");
      Reflect.deleteProperty(navigator, "userAgent");
    },
  };
}

export const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
export const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

/** voice.md, "Notification permission", character for character. */
export const COPY = {
  title: "Get reminders on this device",
  line: "Allow notifications so reminders can reach you when the app is closed.",
  addendum: "Reminders are only reliable on your phone when the app is closed.",
  allow: "Allow notifications",
  notNow: "Not now",
  denied:
    "Notifications are blocked for this site. Turn them on in your browser's site settings to get reminders here.",
  allowed: "Notifications are on for this device.",
} as const;
