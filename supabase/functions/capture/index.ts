// The capture edge function's entry point (CAL-018). All behaviour is in
// handler.ts, tested there; this only wires the real runtime in.

import { handleCapture } from "./handler.ts";

Deno.serve((req) =>
  handleCapture(req, {
    fetch,
    env: (name) => Deno.env.get(name),
    now: () => performance.now(),
  })
);
