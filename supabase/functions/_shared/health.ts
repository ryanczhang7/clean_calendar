import { APP_VERSION } from "../../../shared/version.ts";

export function health(): { ok: true; version: string } {
  return { ok: true, version: APP_VERSION };
}
