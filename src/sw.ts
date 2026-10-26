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
