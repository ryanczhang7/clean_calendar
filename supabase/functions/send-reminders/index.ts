// The send-reminders edge function's entry point (CAL-028 Contract Block 4).
// All behaviour is in handler.ts and push.ts, tested there; this is the only
// module that imports the web-push library, and it only wires the runtime in.

// @ts-types="npm:@types/web-push@3.6.4"
import webPush from "web-push";
import { handleSendReminders } from "./handler.ts";
import { createSender, vapidFromEnv } from "./push.ts";

const env = (name: string) => Deno.env.get(name);
const vapid = vapidFromEnv(env);
const sendPush = vapid ? createSender(webPush, vapid) : null;

Deno.serve((req) =>
  handleSendReminders(req, {
    fetch,
    env,
    now: () => new Date(),
    sendPush,
    log: console.error,
  })
);
