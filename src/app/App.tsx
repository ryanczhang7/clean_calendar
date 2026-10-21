import { type JSX, useEffect, useState } from "react";
import { createBrowserRouter, RouterProvider } from "react-router";
import { CacheUnavailable } from "../sync/CacheUnavailable";
import { db } from "../sync/db";
import { routes } from "./routes";

const router = createBrowserRouter(routes);

/**
 * The router at once; the cache is opened in an effect, and if it cannot be
 * opened the router is replaced by the full-page error (CAL-014 AC-6,
 * Block 6). The first render never waits on the open.
 */
export function App(
  props: { cache?: { open(): Promise<unknown> } } = {},
): JSX.Element {
  const cache = props.cache ?? db;
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let live = true;
    cache.open().catch(() => {
      if (live) setUnavailable(true);
    });
    return () => {
      live = false;
    };
  }, [cache]);

  if (unavailable) return <CacheUnavailable />;
  return <RouterProvider router={router} />;
}
