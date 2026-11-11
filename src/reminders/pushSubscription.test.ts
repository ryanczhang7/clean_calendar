import { HttpResponse } from "msw";
import { afterEach, describe, expect, it, type Mock, vi } from "vitest";
import type {
  PushSubscriptionInput,
  PushSubscriptionsRepo,
} from "../data/pushSubscriptions";
import type { Result } from "../data/result";
import { installMatchMedia } from "../test/media";
import { installServer, onTable } from "../test/msw";
import {
  ANDROID_UA,
  CREATED,
  DESKTOP_UA,
  EXISTING,
  fakeSubscription,
  installPushBrowser,
  type PushBrowser,
  VAPID_KEY,
} from "../test/push";
import {
  isInstalledAndroidPwa,
  permissionState,
  registerThisDevice,
  vapidKeyBytes,
} from "./pushSubscription";

vi.mock(
  "../lib/supabase",
  async () => (await import("../test/supabase-mock")).supabaseModule,
);

// CAL-027 Contract, Block 2 (AC-2, AC-4, AC-5). The browser side, with no
// JSX: support and permission, the installed-Android test, the VAPID key
// decode, and the register step that re-reads or re-creates the device's
// subscription and upserts it. The browser is src/test/push.ts; the repo is
// a mock except in the one test that pins the default. SETTLED: the key
// decode is compared with Node's own base64url decoder, which shares nothing
// with the implementation. MECHANICAL: the subscribe options and the upsert
// argument are written out whole.

installServer();

let browser: PushBrowser | null = null;
let media: ReturnType<typeof installMatchMedia> | null = null;

afterEach(() => {
  browser?.restore();
  browser = null;
  media?.restore();
  media = null;
  vi.unstubAllEnvs();
});

type Upsert = Mock<
  (input: PushSubscriptionInput) => ReturnType<PushSubscriptionsRepo["upsert"]>
>;

function okRepo(): { upsert: Upsert } {
  return {
    upsert: vi.fn(
      async (
        input: PushSubscriptionInput,
      ): Promise<Result<{ id: string; endpoint: string }>> => ({
        status: "ok",
        row: { id: "row-1", endpoint: input.endpoint },
      }),
    ),
  };
}

/** Node's decoder: the independent oracle for vapidKeyBytes. */
const nodeDecode = (key: string): number[] => [
  ...Buffer.from(key, "base64url"),
];

describe("permissionState (Block 2)", () => {
  it.each(["default", "granted", "denied"] as const)(
    "with Notification, the service worker and PushManager all present, is Notification.permission: %s",
    (permission) => {
      browser = installPushBrowser({ permission });
      expect(permissionState()).toBe(permission);
    },
  );

  it.each(["Notification", "serviceWorker", "PushManager"] as const)(
    'is "unsupported" when only %s is missing, even though permission reads granted',
    (omit) => {
      browser = installPushBrowser({ permission: "granted", omit });
      expect(permissionState()).toBe("unsupported");
    },
  );

  it('is "unsupported" in plain jsdom, which has none of the three - and "default" once they are installed', () => {
    expect(permissionState()).toBe("unsupported");
    browser = installPushBrowser({ permission: "default" });
    expect(permissionState()).toBe("default");
  });
});

describe("isInstalledAndroidPwa (Block 2, AC-5)", () => {
  it.each([
    ["standalone", "an Android", ANDROID_UA, true],
    ["standalone", "a desktop", DESKTOP_UA, false],
    ["browser", "an Android", ANDROID_UA, false],
    ["browser", "a desktop", DESKTOP_UA, false],
  ] as const)(
    "display-mode %s on %s user agent: %s",
    (displayMode, _label, userAgent, expected) => {
      media = installMatchMedia({
        width: 400,
        colorScheme: "light",
        displayMode,
      });
      browser = installPushBrowser({ permission: "default", userAgent });
      expect(isInstalledAndroidPwa()).toBe(expected);
    },
  );

  it("the Android test is case-insensitive (/Android/i)", () => {
    media = installMatchMedia({
      width: 400,
      colorScheme: "light",
      displayMode: "standalone",
    });
    browser = installPushBrowser({
      permission: "default",
      userAgent: "Mozilla/5.0 (Linux; ANDROID 14) Chrome/130",
    });
    expect(isInstalledAndroidPwa()).toBe(true);
  });

  it("is false where matchMedia is missing, even on an Android user agent", () => {
    browser = installPushBrowser({
      permission: "default",
      userAgent: ANDROID_UA,
    });
    expect(typeof window.matchMedia).toBe("undefined");
    expect(isInstalledAndroidPwa()).toBe(false);
  });
});

describe("vapidKeyBytes (Block 2, AC-2) - SETTLED against Node's base64url decoder", () => {
  it("decodes a real-shaped VAPID key containing both '-' and '_' to the same 65 bytes Node does, starting 0x04", () => {
    expect(VAPID_KEY).toHaveLength(87);
    expect(VAPID_KEY).toContain("-");
    expect(VAPID_KEY).toContain("_");
    const bytes = vapidKeyBytes(VAPID_KEY);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes).toHaveLength(65);
    expect(bytes[0]).toBe(0x04);
    expect([...bytes]).toStrictEqual(nodeDecode(VAPID_KEY));
  });

  it.each([
    ["-_8", "needs one '=' of padding"],
    ["-_", "needs two '=' of padding"],
    ["_-A", "starts with '_'"],
    ["AQID", "needs none"],
  ])("decodes %j (%s) as Node does", (key) => {
    expect([...vapidKeyBytes(key)]).toStrictEqual(nodeDecode(key));
  });
});

describe("registerThisDevice - when it does nothing (Block 2, AC-1, AC-4)", () => {
  it('unsupported: resolves {skipped, "unsupported"} and upserts nothing', async () => {
    const repo = okRepo();
    vi.stubEnv("VITE_VAPID_PUBLIC_KEY", VAPID_KEY);
    await expect(registerThisDevice(repo)).resolves.toStrictEqual({
      status: "skipped",
      reason: "unsupported",
    });
    expect(repo.upsert).not.toHaveBeenCalled();
  });

  it.each(["default", "denied"] as const)(
    'permission %s: resolves {skipped, "not-granted"}, touches no subscription and never asks for permission',
    async (permission) => {
      browser = installPushBrowser({ permission, existing: EXISTING });
      vi.stubEnv("VITE_VAPID_PUBLIC_KEY", VAPID_KEY);
      const repo = okRepo();
      await expect(registerThisDevice(repo)).resolves.toStrictEqual({
        status: "skipped",
        reason: "not-granted",
      });
      expect(browser.requestPermission).not.toHaveBeenCalled();
      expect(browser.getSubscription).not.toHaveBeenCalled();
      expect(browser.subscribe).not.toHaveBeenCalled();
      expect(repo.upsert).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["empty", ""],
    ["undefined", undefined],
  ] as const)(
    'granted but VITE_VAPID_PUBLIC_KEY %s: resolves {skipped, "no-key"} and subscribes nothing',
    async (_label, key) => {
      browser = installPushBrowser({ permission: "granted" });
      vi.stubEnv("VITE_VAPID_PUBLIC_KEY", key);
      const repo = okRepo();
      await expect(registerThisDevice(repo)).resolves.toStrictEqual({
        status: "skipped",
        reason: "no-key",
      });
      expect(browser.subscribe).not.toHaveBeenCalled();
      expect(repo.upsert).not.toHaveBeenCalled();
    },
  );
});

describe("registerThisDevice - granted (Block 2, AC-2, AC-4)", () => {
  it("re-reads an existing subscription: no new subscribe, and upserts exactly its endpoint, p256dh, auth and this user agent", async () => {
    browser = installPushBrowser({
      permission: "granted",
      existing: EXISTING,
      userAgent: ANDROID_UA,
    });
    vi.stubEnv("VITE_VAPID_PUBLIC_KEY", VAPID_KEY);
    const repo = okRepo();
    await expect(registerThisDevice(repo)).resolves.toStrictEqual({
      status: "ok",
    });
    expect(browser.getSubscription).toHaveBeenCalledTimes(1);
    expect(browser.subscribe).not.toHaveBeenCalled();
    expect(repo.upsert.mock.calls).toStrictEqual([
      [
        {
          endpoint: "https://push.example.test/send/existing-device",
          p256dh: "BExisting_p256dh-key",
          auth: "existing-auth_1",
          userAgent: ANDROID_UA,
        },
      ],
    ]);
    expect(browser.requestPermission).not.toHaveBeenCalled();
  });

  it("re-creates a missing subscription with exactly {userVisibleOnly: true, applicationServerKey: the decoded VAPID key}, then upserts the new one", async () => {
    browser = installPushBrowser({
      permission: "granted",
      existing: null,
      userAgent: DESKTOP_UA,
    });
    vi.stubEnv("VITE_VAPID_PUBLIC_KEY", VAPID_KEY);
    const repo = okRepo();
    await expect(registerThisDevice(repo)).resolves.toStrictEqual({
      status: "ok",
    });
    expect(browser.subscribe).toHaveBeenCalledTimes(1);
    const options = browser.subscribe.mock.calls[0]?.[0];
    expect(Object.keys(options ?? {}).sort()).toStrictEqual([
      "applicationServerKey",
      "userVisibleOnly",
    ]);
    expect(options?.userVisibleOnly).toBe(true);
    const key = options?.applicationServerKey;
    expect(key).toBeInstanceOf(Uint8Array);
    expect([...(key as Uint8Array)]).toStrictEqual(nodeDecode(VAPID_KEY));
    expect(repo.upsert.mock.calls).toStrictEqual([
      [
        {
          endpoint: CREATED.endpoint,
          p256dh: "BCreated-p256dh_key",
          auth: "created_auth-2",
          userAgent: DESKTOP_UA,
        },
      ],
    ]);
    expect(browser.requestPermission).not.toHaveBeenCalled();
  });

  it("reads the key at call time: the same module, key stubbed after import, subscribes with that key", async () => {
    browser = installPushBrowser({ permission: "granted" });
    const repo = okRepo();
    vi.stubEnv("VITE_VAPID_PUBLIC_KEY", "");
    await expect(registerThisDevice(repo)).resolves.toStrictEqual({
      status: "skipped",
      reason: "no-key",
    });
    vi.stubEnv("VITE_VAPID_PUBLIC_KEY", VAPID_KEY);
    await expect(registerThisDevice(repo)).resolves.toStrictEqual({
      status: "ok",
    });
    expect(browser.subscribe).toHaveBeenCalledTimes(1);
  });

  it("by default upserts through the app's pushSubscriptions repo: one POST to push_subscriptions", async () => {
    browser = installPushBrowser({ permission: "granted", existing: EXISTING });
    vi.stubEnv("VITE_VAPID_PUBLIC_KEY", VAPID_KEY);
    const seen = onTable("push_subscriptions", () =>
      HttpResponse.json([{ id: "row-1", endpoint: EXISTING.endpoint }], {
        status: 201,
      }),
    );
    await expect(registerThisDevice()).resolves.toStrictEqual({ status: "ok" });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.method).toBe("POST");
    expect(seen[0]?.body).toMatchObject({ endpoint: EXISTING.endpoint });
  });
});

describe("registerThisDevice - never rejects (Block 2)", () => {
  it("a subscribe that throws resolves {error}, upserting nothing", async () => {
    browser = installPushBrowser({ permission: "granted", existing: null });
    browser.subscribe.mockRejectedValueOnce(
      new DOMException("Registration failed", "AbortError"),
    );
    vi.stubEnv("VITE_VAPID_PUBLIC_KEY", VAPID_KEY);
    const repo = okRepo();
    await expect(registerThisDevice(repo)).resolves.toStrictEqual({
      status: "error",
    });
    expect(repo.upsert).not.toHaveBeenCalled();
  });

  it.each([
    ["no keys at all", undefined],
    ["no p256dh", { auth: "only-auth" }],
    ["no auth", { p256dh: "only-p256dh" }],
  ] as const)(
    "a subscription with %s resolves {error}, upserting nothing",
    async (_label, keys) => {
      browser = installPushBrowser({
        permission: "granted",
        existing: fakeSubscription("https://push.example.test/send/k", keys),
      });
      vi.stubEnv("VITE_VAPID_PUBLIC_KEY", VAPID_KEY);
      const repo = okRepo();
      await expect(registerThisDevice(repo)).resolves.toStrictEqual({
        status: "error",
      });
      expect(repo.upsert).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["offline", { status: "offline" }],
    [
      "an HTTP error",
      { status: "error", code: "42501", message: "rls", http: 401 },
    ],
    ["conflict", { status: "conflict" }],
  ] as const)(
    "an upsert that is %s resolves {error}",
    async (_label, result) => {
      browser = installPushBrowser({
        permission: "granted",
        existing: EXISTING,
      });
      vi.stubEnv("VITE_VAPID_PUBLIC_KEY", VAPID_KEY);
      const repo = { upsert: vi.fn(async () => result) };
      await expect(registerThisDevice(repo)).resolves.toStrictEqual({
        status: "error",
      });
      expect(repo.upsert).toHaveBeenCalledTimes(1);
    },
  );
});
