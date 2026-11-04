import { assertEquals } from "@std/assert";
import {
  createSender,
  PUSH_TTL_SECONDS,
  type Vapid,
  vapidFromEnv,
  type WebPushLike,
} from "./push.ts";

// CAL-028 Contract Block 3: the push sender, over a fake WebPushLike. No npm
// import anywhere on this path, so the suite runs offline. Settled values read
// out of the Contract: TTL 600, gone for 404/410 only, the outcome shapes.

const VAPID: Vapid = {
  subject: "mailto:owner@example.com",
  publicKey: "BPublicKeyTest",
  privateKey: "privateKeyTest",
};
const ENV_FULL: Record<string, string> = {
  VAPID_SUBJECT: VAPID.subject,
  VAPID_PUBLIC_KEY: VAPID.publicKey,
  VAPID_PRIVATE_KEY: VAPID.privateKey,
};

const SUB = {
  id: "sub-a",
  endpoint: "https://push.example.test/sub-a",
  p256dh: "p256dh-a",
  auth: "auth-a",
};
const PAYLOAD = {
  eventId: "evt-1",
  title: "Dentist",
  startsAt: "2026-11-03T09:30:00+00:00",
  allDay: false,
  location: "12 High Street",
};

type SendCall = { sub: unknown; body: string; options: unknown };

function fakeWebPush(answer: () => Promise<{ statusCode: number }>) {
  const vapidCalls: [string, string, string][] = [];
  const sends: SendCall[] = [];
  const webPush: WebPushLike = {
    setVapidDetails(subject: string, publicKey: string, privateKey: string) {
      vapidCalls.push([subject, publicKey, privateKey]);
    },
    sendNotification(sub: unknown, body: string, options?: unknown) {
      sends.push({ sub, body, options });
      return answer();
    },
  };
  return { webPush, vapidCalls, sends };
}

// ---------------------------------------------------------------- vapidFromEnv

Deno.test("vapidFromEnv: all three secrets set gives the VAPID details", () => {
  assertEquals(vapidFromEnv((n: string) => ENV_FULL[n]), VAPID);
});

for (const missing of Object.keys(ENV_FULL)) {
  Deno.test(`vapidFromEnv: ${missing} missing gives null`, () => {
    const env: Record<string, string> = { ...ENV_FULL };
    delete env[missing];
    assertEquals(vapidFromEnv((n: string) => env[n]), null);
  });
  Deno.test(`vapidFromEnv: ${missing} empty gives null`, () => {
    const env: Record<string, string> = { ...ENV_FULL, [missing]: "" };
    assertEquals(vapidFromEnv((n: string) => env[n]), null);
  });
}

Deno.test("vapidFromEnv: nothing set gives null", () => {
  assertEquals(vapidFromEnv(() => undefined), null);
});

// ---------------------------------------------------------------- createSender

Deno.test("PUSH_TTL_SECONDS is 600: a reminder older than ten minutes is stale", () => {
  assertEquals(PUSH_TTL_SECONDS, 600);
});

Deno.test("createSender sets the VAPID details once, however many sends follow", async () => {
  const fake = fakeWebPush(() => Promise.resolve({ statusCode: 201 }));
  const send = createSender(fake.webPush, VAPID);
  await send(SUB, PAYLOAD);
  await send(SUB, PAYLOAD);
  assertEquals(fake.vapidCalls, [
    [VAPID.subject, VAPID.publicKey, VAPID.privateKey],
  ]);
});

Deno.test("a send passes the subscription as {endpoint, keys}, the JSON payload and TTL 600", async () => {
  const fake = fakeWebPush(() => Promise.resolve({ statusCode: 201 }));
  const send = createSender(fake.webPush, VAPID);
  await send(SUB, PAYLOAD);
  assertEquals(fake.sends.length, 1);
  assertEquals(fake.sends[0]!.sub, {
    endpoint: SUB.endpoint,
    keys: { p256dh: SUB.p256dh, auth: SUB.auth },
  });
  assertEquals(fake.sends[0]!.body, JSON.stringify(PAYLOAD));
  assertEquals(JSON.parse(fake.sends[0]!.body), PAYLOAD);
  assertEquals(fake.sends[0]!.options, { TTL: 600 });
});

Deno.test("a send that resolves is sent", async () => {
  const fake = fakeWebPush(() => Promise.resolve({ statusCode: 201 }));
  assertEquals(await createSender(fake.webPush, VAPID)(SUB, PAYLOAD), {
    status: "sent",
  });
});

for (const code of [410, 404] as const) {
  Deno.test(`a send rejected with statusCode ${code} is gone with that code`, async () => {
    const fake = fakeWebPush(() =>
      Promise.reject(
        Object.assign(new Error("Received unexpected response code"), {
          statusCode: code,
          body: "",
        }),
      )
    );
    assertEquals(await createSender(fake.webPush, VAPID)(SUB, PAYLOAD), {
      status: "gone",
      code,
    });
  });
}

Deno.test("a send rejected with statusCode 500 is failed with code 500 and the message", async () => {
  const fake = fakeWebPush(() =>
    Promise.reject({ statusCode: 500, message: "Internal Server Error" })
  );
  assertEquals(await createSender(fake.webPush, VAPID)(SUB, PAYLOAD), {
    status: "failed",
    code: 500,
    message: "Internal Server Error",
  });
});

Deno.test("a send rejected with 413 (not 404/410) is failed, not gone", async () => {
  const fake = fakeWebPush(() =>
    Promise.reject({ statusCode: 413, message: "Payload Too Large" })
  );
  assertEquals(await createSender(fake.webPush, VAPID)(SUB, PAYLOAD), {
    status: "failed",
    code: 413,
    message: "Payload Too Large",
  });
});

Deno.test("a send rejected with a plain Error is failed with code null and its message", async () => {
  const fake = fakeWebPush(() => Promise.reject(new Error("network down")));
  assertEquals(await createSender(fake.webPush, VAPID)(SUB, PAYLOAD), {
    status: "failed",
    code: null,
    message: "network down",
  });
});

Deno.test("a send rejected with a bare string is failed with code null and that string", async () => {
  const fake = fakeWebPush(() => Promise.reject("socket hang up"));
  assertEquals(await createSender(fake.webPush, VAPID)(SUB, PAYLOAD), {
    status: "failed",
    code: null,
    message: "socket hang up",
  });
});

Deno.test("the sender never throws, even when sendNotification throws synchronously", async () => {
  const webPush: WebPushLike = {
    setVapidDetails() {},
    sendNotification() {
      throw new Error("bad subscription");
    },
  };
  assertEquals(await createSender(webPush, VAPID)(SUB, PAYLOAD), {
    status: "failed",
    code: null,
    message: "bad subscription",
  });
});
