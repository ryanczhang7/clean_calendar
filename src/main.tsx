import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { App } from "./app/App";
import { registerServiceWorker, UpdateSignalContext } from "./pwa/registerSW";
import "./styles/global.css";

// CAL-017 Block 4: register the service worker once, at module load; the
// signal reaches AppShell's update prompt through UpdateSignalContext.
const updateSignal = registerServiceWorker(registerSW);

// biome-ignore lint/style/noNonNullAssertion: index.html always carries #root
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <UpdateSignalContext.Provider value={updateSignal}>
      <App />
    </UpdateSignalContext.Provider>
  </StrictMode>,
);
