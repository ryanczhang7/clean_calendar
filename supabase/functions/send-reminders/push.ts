// The push sender (CAL-028 Contract Block 3). No npm import: index.ts hands
// the real web-push library in, the tests hand in a fake.

import type {
  PushOutcome,
  PushPayload,
  SendDeps,
  Subscription,
} from "./handler.ts";

export type WebPushLike = {
  setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
  sendNotification(
    sub: { endpoint: string; keys: { p256dh: string; auth: string } },
    body: string,
    options?: { TTL?: number },
  ): Promise<{ statusCode: number }>;
};
export type Vapid = { subject: string; publicKey: string; privateKey: string };

/** The push service may hold a reminder ten minutes; after that it is stale. */
export const PUSH_TTL_SECONDS = 600;

export function vapidFromEnv(
  env: (name: string) => string | undefined,
): Vapid | null {
  const subject = env("VAPID_SUBJECT");
  const publicKey = env("VAPID_PUBLIC_KEY");
  const privateKey = env("VAPID_PRIVATE_KEY");
  if (!subject || !publicKey || !privateKey) return null;
  return { subject, publicKey, privateKey };
}

export function createSender(
  webPush: WebPushLike,
  vapid: Vapid,
): NonNullable<SendDeps["sendPush"]> {
  webPush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  return async (
    sub: Subscription,
    payload: PushPayload,
  ): Promise<PushOutcome> => {
    try {
      await webPush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify(payload),
        { TTL: PUSH_TTL_SECONDS },
      );
      return { status: "sent" };
    } catch (err) {
      const e = (typeof err === "object" && err !== null ? err : {}) as {
        statusCode?: unknown;
        message?: unknown;
      };
      const code = typeof e.statusCode === "number" ? e.statusCode : null;
      if (code === 404 || code === 410) return { status: "gone", code };
      return {
        status: "failed",
        code,
        message: String(e.message ?? err),
      };
    }
  };
}
