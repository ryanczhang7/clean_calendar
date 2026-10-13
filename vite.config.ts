import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The PWA plugin (vite-plugin-pwa, injectManifest with src/sw.ts) is added by
// the story that writes the service worker; CAL-001 only installs it.
export default defineConfig({
  plugins: [react()],
});
