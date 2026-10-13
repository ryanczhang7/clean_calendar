import { describe, expect, it } from "vitest";
import { APP_VERSION } from "./version.ts";

describe("APP_VERSION", () => {
  it("is a plain major.minor.patch version", () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
