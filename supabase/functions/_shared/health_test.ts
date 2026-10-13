import { assertEquals } from "@std/assert";
import { APP_VERSION } from "../../../shared/version.ts";
import { health } from "./health.ts";

Deno.test("health reports ok and the shared app version", () => {
  assertEquals(health(), { ok: true, version: APP_VERSION });
});
