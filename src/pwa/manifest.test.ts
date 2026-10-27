import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { type ManifestIcon, manifest } from "./manifest";

// CAL-017 AC-1, Contract Block 1. The colours are SETTLED values read out of
// tokens.css, never hard-coded here, so a token change fails this suite
// instead of leaving the installed app's chrome stale.

const REPO = join(import.meta.dirname, "..", "..");
const TOKENS = readFileSync(
  join(import.meta.dirname, "..", "styles", "tokens.css"),
  "utf8",
);

/** The body of the first block whose selector is exactly `selector`. */
function block(selector: string): string {
  const at = TOKENS.indexOf(`${selector} {`);
  if (at < 0) throw new Error(`tokens.css has no "${selector} {" block`);
  const open = TOKENS.indexOf("{", at);
  const close = TOKENS.indexOf("}", open);
  return TOKENS.slice(open + 1, close);
}

/** One custom property's value in a block; `--a` never matches `--a-b`. */
function token(body: string, name: string): string {
  const m = new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(body);
  if (m?.[1] === undefined) throw new Error(`no ${name} in block`);
  return m[1].trim().toLowerCase();
}

// The light theme is the first `:root {` block (tokens.css line 10); the
// dark overrides live in `@media (prefers-color-scheme: dark)` and
// `:root[data-theme="dark"]`, which `":root {"` does not match.
const LIGHT = block(":root");
const DARK = block(':root[data-theme="dark"]');

/** PNG width and height from the IHDR chunk (bytes 16-23, big-endian). */
function pngSize(path: string): { width: number; height: number } {
  const bytes = readFileSync(path);
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  expect([...bytes.subarray(0, 8)], `${path} is not a PNG`).toEqual(signature);
  expect(bytes.subarray(12, 16).toString("latin1"), `${path} IHDR`).toBe(
    "IHDR",
  );
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe("the web app manifest (AC-1)", () => {
  test('is named "Clean Calendar"', () => {
    expect(manifest.name).toBe("Clean Calendar");
  });

  test("has a launcher short_name of 1 to 12 characters", () => {
    expect(typeof manifest.short_name).toBe("string");
    expect(manifest.short_name.trim().length).toBeGreaterThan(0);
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
  });

  test('starts at "/" and is scoped to "/"', () => {
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
  });

  test("opens standalone, without browser chrome", () => {
    expect(manifest.display).toBe("standalone");
  });

  test("the token parser reads the light theme, not a dark override", () => {
    // Control for the two colour tests below: if the parser picked up a dark
    // block they would compare against the wrong theme and still look settled.
    expect(token(LIGHT, "--color-surface")).toMatch(/^#[0-9a-f]{6}$/);
    expect(token(LIGHT, "--color-surface-raised")).toMatch(/^#[0-9a-f]{6}$/);
    expect(token(LIGHT, "--color-surface")).not.toBe(
      token(DARK, "--color-surface"),
    );
    expect(token(LIGHT, "--color-surface-raised")).not.toBe(
      token(DARK, "--color-surface-raised"),
    );
    expect(token(LIGHT, "--color-surface")).not.toBe(
      token(LIGHT, "--color-surface-raised"),
    );
  });

  test("theme_color is the light --color-surface-raised from tokens.css", () => {
    expect(manifest.theme_color.toLowerCase()).toBe(
      token(LIGHT, "--color-surface-raised"),
    );
  });

  test("background_color is the light --color-surface from tokens.css", () => {
    expect(manifest.background_color.toLowerCase()).toBe(
      token(LIGHT, "--color-surface"),
    );
  });

  test("declares exactly a 192 icon, a 512 icon and a 512 maskable icon", () => {
    const icons: ManifestIcon[] = manifest.icons;
    expect(icons).toEqual([
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ]);
    // toEqual ignores an own key holding undefined; the plain icons must not
    // carry a purpose key at all.
    expect(icons.filter((i) => "purpose" in i)).toHaveLength(1);
  });

  test("every icon file exists under public/ as a PNG of its declared size", () => {
    expect(manifest.icons.length).toBeGreaterThan(0);
    for (const icon of manifest.icons) {
      const path = join(REPO, "public", icon.src);
      expect(existsSync(path), `${path} is missing`).toBe(true);
      const [w, h] = icon.sizes.split("x").map(Number);
      expect(pngSize(path), `${path} dimensions`).toEqual({
        width: w,
        height: h,
      });
    }
  });
});

describe("the manifest declares the Android share target (CAL-022 AC-1)", () => {
  test("share_target is exactly AC-1's POST multipart target at /share, with one image file field", () => {
    expect(manifest.share_target).toStrictEqual({
      action: "/share",
      method: "POST",
      enctype: "multipart/form-data",
      params: {
        title: "title",
        text: "text",
        url: "url",
        files: [{ name: "image", accept: ["image/*"] }],
      },
    });
  });
});
