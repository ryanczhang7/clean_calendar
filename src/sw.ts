/// <reference lib="webworker" />
// CAL-017 Contract Block 3: the service worker, compiled by vite-plugin-pwa
// (injectManifest) to dist/sw.js. Checked by tsconfig.sw.json (WebWorker
// lib); excluded from tsconfig.json, whose DOM lib conflicts with it.
import { clientsClaim } from "workbox-core";
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { openInbox } from "./pwa/inbox";
import { openReminder, pushData, showReminder } from "./pwa/pushHandlers";
import { handleShare, isShareRequest } from "./pwa/shareTarget";

declare let self: ServiceWorkerGlobalScope;

// The app shell: index.html and every emitted asset, injected at build time.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Every navigation (/, /signin, /month/...) gets the precached shell, so an
// offline reload renders the app rather than the browser's error page.
registerRoute(new NavigationRoute(createHandlerBoundToURL("index.html")));

// The first install controls the already-open page without a reload.
// Registers its own `activate` listener.
clientsClaim();

// An update waits until the page asks for it (the "Reload" toast, AC-4);
// there is deliberately no skipWaiting() at install.
self.addEventListener("message", (event) => {
  const data: unknown = event.data;
  if (
    typeof data === "object" &&
    data !== null &&
    (data as { type?: unknown }).type === "SKIP_WAITING"
  ) {
    void self.skipWaiting();
  }
});

// CAL-022 Contract, Block 4: the share target. A plain fetch listener rather
// than a workbox route (CAL-017's registerRoute stays the only one); workbox's
// routes are GET-only, so its router never answers POST /share. Anything but
// POST /share is left alone: no respondWith, and the inbox is not opened.
self.addEventListener("fetch", (event) => {
  if (!isShareRequest(event.request)) return;
  event.respondWith(handleShare(event.request, openInbox()));
});

// CAL-028 Contract Block 6: reminders. The push carries the event, and the
// device formats it in its own zone (src/pwa/pushHandlers.ts).
self.addEventListener("push", (event) => {
  event.waitUntil(showReminder(self.registration, pushData(event.data)));
});

// A tap closes the notification and opens the event's day in the app.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url: unknown = (event.notification.data as { url?: unknown } | null)
    ?.url;
  if (typeof url !== "string") return;
  event.waitUntil(openReminder(self.clients, url));
});
