import {
  type PushSubscriptionsRepo,
  pushSubscriptions,
} from "../data/pushSubscriptions";

// The browser side of Web Push (CAL-027 Contract, Block 2). No JSX, and it
// never asks for permission: only the card's click handler does (Block 3).

export type PermissionState = "default" | "granted" | "denied" | "unsupported";

/** `unsupported` unless Notification, the service worker and PushManager all exist. */
export function permissionState(): PermissionState {
  if (
    typeof globalThis.Notification === "undefined" ||
    !("serviceWorker" in navigator) ||
    typeof globalThis.PushManager === "undefined"
  ) {
    return "unsupported";
  }
  return Notification.permission;
}

/** An installed PWA on Android: the one device where reminders are reliable with the app closed. */
export function isInstalledAndroidPwa(): boolean {
  if (typeof window.matchMedia !== "function") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches &&
    /Android/i.test(navigator.userAgent)
  );
}

/** Decode an unpadded base64url VAPID public key to the bytes `subscribe` takes.
 *  `Uint8Array<ArrayBuffer>`, not the default `ArrayBufferLike`: that is what
 *  `applicationServerKey` (a BufferSource) accepts. */
export function vapidKeyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

export type RegisterOutcome =
  | { status: "ok" }
  | { status: "skipped"; reason: "unsupported" | "not-granted" | "no-key" }
  | { status: "error" };

/**
 * Re-read this device's subscription, or re-create it if missing, and upsert
 * it by endpoint. Never rejects. The key is read at call time.
 */
export async function registerThisDevice(
  repo: Pick<PushSubscriptionsRepo, "upsert"> = pushSubscriptions,
): Promise<RegisterOutcome> {
  const state = permissionState();
  if (state === "unsupported") return { status: "skipped", reason: state };
  if (state !== "granted") return { status: "skipped", reason: "not-granted" };
  const key: string | undefined = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (key === undefined || key === "") {
    return { status: "skipped", reason: "no-key" };
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKeyBytes(key),
      }));
    const keys = sub.toJSON().keys;
    const p256dh = keys?.p256dh;
    const auth = keys?.auth;
    if (p256dh === undefined || auth === undefined) return { status: "error" };
    const result = await repo.upsert({
      endpoint: sub.endpoint,
      p256dh,
      auth,
      userAgent: navigator.userAgent,
    });
    return result.status === "ok" ? { status: "ok" } : { status: "error" };
  } catch {
    return { status: "error" };
  }
}
