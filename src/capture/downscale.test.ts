import { describe, expect, it, type Mock, vi } from "vitest";
import {
  type DownscaleDeps,
  downscaleImage,
  MAX_IMAGE_BYTES,
  MAX_LONG_EDGE,
  planDownscale,
  QUALITY_STEPS,
} from "./downscale";

// CAL-020 Contract, Block 2 (AC-3). SETTLED: the three constants and the plan
// vectors are read out of the Contract, not calibrated. MECHANICAL: the
// step-down order. jsdom has no canvas and no createImageBitmap, so
// `downscaleImage` is driven through a fake `deps`: `decode` reports a pixel
// size, `encode` returns a Blob whose size the test chooses per
// (mime, quality) call and records every call, so the order is observable.
// `browserDeps` (the real canvas pipeline) is not exercised here.

const OVER = MAX_IMAGE_BYTES + 1;
const FITS = 1_000;

type EncodeCall = {
  source: unknown;
  width: number;
  height: number;
  mime: string;
  quality: number;
};

/**
 * A fake pipeline. `size(mime, quality)` is the encoded size for that call;
 * `bytes`, when given, is the content of every encoded Blob instead.
 */
function fakeDeps(opts: {
  width?: number;
  height?: number;
  size?: (mime: string, quality: number) => number;
  bytes?: Uint8Array<ArrayBuffer>;
}): {
  deps: DownscaleDeps;
  calls: EncodeCall[];
  decode: Mock<DownscaleDeps["decode"]>;
} {
  const calls: EncodeCall[] = [];
  const decode = vi.fn<DownscaleDeps["decode"]>(async () => ({
    width: opts.width ?? 4000,
    height: opts.height ?? 3000,
    source: "DECODED-SOURCE",
  }));
  const deps: DownscaleDeps = {
    decode,
    encode: async (source, width, height, mime, quality) => {
      calls.push({ source, width, height, mime, quality });
      if (opts.bytes !== undefined) {
        return new Blob([opts.bytes], { type: mime });
      }
      const n = (opts.size ?? (() => FITS))(mime, quality);
      return new Blob([new Uint8Array(n)], { type: mime });
    },
  };
  return { deps, calls, decode };
}

const file = (type: string, content: BlobPart[] = ["file-bytes"]) =>
  new File(content, "shot", { type });

const steps = (calls: EncodeCall[]) =>
  calls.map((c) => `${c.mime}@${c.quality}`);

describe("the limits (Block 2, settled)", () => {
  it("the long edge is capped at 2048 px", () => {
    expect(MAX_LONG_EDGE).toBe(2048);
  });

  it("the encoded size is capped at the function's 4 MB: 4,194,304 bytes", () => {
    expect(MAX_IMAGE_BYTES).toBe(4_194_304);
  });

  it("lossy quality steps down 0.92, 0.8, 0.65, 0.5", () => {
    expect([...QUALITY_STEPS]).toStrictEqual([0.92, 0.8, 0.65, 0.5]);
  });
});

describe("planDownscale (AC-3, Block 2 vectors)", () => {
  it("4000x3000 -> 2048x1536, scaled", () => {
    expect(planDownscale(4000, 3000)).toStrictEqual({
      width: 2048,
      height: 1536,
      scaled: true,
    });
  });

  it("3000x4000 (portrait) -> 1536x2048, scaled: the LONG edge is capped, whichever it is", () => {
    expect(planDownscale(3000, 4000)).toStrictEqual({
      width: 1536,
      height: 2048,
      scaled: true,
    });
  });

  it("1024x768 is unchanged and not scaled: never upscaled", () => {
    expect(planDownscale(1024, 768)).toStrictEqual({
      width: 1024,
      height: 768,
      scaled: false,
    });
  });

  it("2048x10 (exactly at the cap) is unchanged and not scaled", () => {
    expect(planDownscale(2048, 10)).toStrictEqual({
      width: 2048,
      height: 10,
      scaled: false,
    });
  });

  it("2049x1000 -> 2048x1000: the short edge is rounded (999.51 -> 1000)", () => {
    expect(planDownscale(2049, 1000)).toStrictEqual({
      width: 2048,
      height: 1000,
      scaled: true,
    });
  });

  it("3000x3000 (square) -> 2048x2048", () => {
    expect(planDownscale(3000, 3000)).toStrictEqual({
      width: 2048,
      height: 2048,
      scaled: true,
    });
  });

  it("a sliver 10000x1 keeps a short edge of at least 1 px", () => {
    expect(planDownscale(10_000, 1)).toStrictEqual({
      width: 2048,
      height: 1,
      scaled: true,
    });
  });

  it("maxEdge, when given, replaces the cap: 4000x3000 at 1024 -> 1024x768", () => {
    expect(planDownscale(4000, 3000, 1024)).toStrictEqual({
      width: 1024,
      height: 768,
      scaled: true,
    });
  });
});

describe("what downscaleImage refuses (Block 2)", () => {
  it.each(["image/gif", "image/heic", "image/svg+xml", "text/plain", ""])(
    "a file of type %j is unsupported, and is not even decoded",
    async (type) => {
      const { deps, decode, calls } = fakeDeps({});
      await expect(downscaleImage(file(type), deps)).resolves.toStrictEqual({
        status: "unsupported",
      });
      expect(decode).not.toHaveBeenCalled();
      expect(calls).toHaveLength(0);
    },
  );
});

describe("the first encoding (Block 2)", () => {
  it.each(["image/png", "image/jpeg", "image/webp"])(
    "a %s that fits is encoded once, in its own type at 0.92, at the planned size",
    async (type) => {
      const { deps, calls, decode } = fakeDeps({ width: 4000, height: 3000 });
      const shot = file(type);
      const result = await downscaleImage(shot, deps);
      expect(decode).toHaveBeenCalledTimes(1);
      expect(decode.mock.calls[0]?.[0]).toBe(shot);
      expect(calls).toStrictEqual([
        {
          source: "DECODED-SOURCE",
          width: 2048,
          height: 1536,
          mime: type,
          quality: 0.92,
        },
      ]);
      expect(result).toMatchObject({
        status: "ok",
        image: { mime: type, width: 2048, height: 1536, bytes: FITS },
      });
    },
  );

  it("an image already within 2048 px is encoded at its own size", async () => {
    const { deps, calls } = fakeDeps({ width: 1024, height: 768 });
    await downscaleImage(file("image/png"), deps);
    expect(calls.map((c) => [c.width, c.height])).toStrictEqual([[1024, 768]]);
  });

  it("an encoding of exactly 4,194,304 bytes fits: at most 4 MB, not under it", async () => {
    const { deps, calls } = fakeDeps({ size: () => MAX_IMAGE_BYTES });
    const result = await downscaleImage(file("image/jpeg"), deps);
    expect(calls).toHaveLength(1);
    expect(result).toMatchObject({
      status: "ok",
      image: { bytes: MAX_IMAGE_BYTES },
    });
  });
});

describe("stepping down while over 4 MB (Block 2, mechanical order)", () => {
  it("a PNG over the limit re-encodes as JPEG first, then steps the JPEG down, then is too_large", async () => {
    const { deps, calls } = fakeDeps({ size: () => OVER });
    await expect(
      downscaleImage(file("image/png"), deps),
    ).resolves.toStrictEqual({ status: "too_large" });
    expect(steps(calls)).toStrictEqual([
      "image/png@0.92",
      "image/jpeg@0.92",
      "image/jpeg@0.8",
      "image/jpeg@0.65",
      "image/jpeg@0.5",
    ]);
  });

  it("a JPEG over the limit steps down 0.92, 0.8, 0.65, 0.5, then is too_large", async () => {
    const { deps, calls } = fakeDeps({ size: () => OVER });
    await expect(
      downscaleImage(file("image/jpeg"), deps),
    ).resolves.toStrictEqual({ status: "too_large" });
    expect(steps(calls)).toStrictEqual([
      "image/jpeg@0.92",
      "image/jpeg@0.8",
      "image/jpeg@0.65",
      "image/jpeg@0.5",
    ]);
  });

  it("a WebP over the limit steps down in its own type, then is too_large", async () => {
    const { deps, calls } = fakeDeps({ size: () => OVER });
    await expect(
      downscaleImage(file("image/webp"), deps),
    ).resolves.toStrictEqual({ status: "too_large" });
    expect(steps(calls)).toStrictEqual([
      "image/webp@0.92",
      "image/webp@0.8",
      "image/webp@0.65",
      "image/webp@0.5",
    ]);
  });

  it("a PNG whose JPEG at 0.92 fits stops there, and the result is a JPEG", async () => {
    const { deps, calls } = fakeDeps({
      size: (mime) => (mime === "image/png" ? OVER : 3_000_000),
    });
    const result = await downscaleImage(file("image/png"), deps);
    expect(steps(calls)).toStrictEqual(["image/png@0.92", "image/jpeg@0.92"]);
    expect(result).toMatchObject({
      status: "ok",
      image: { mime: "image/jpeg", bytes: 3_000_000 },
    });
  });

  it("a JPEG that first fits at 0.65 stops at 0.65", async () => {
    const { deps, calls } = fakeDeps({
      size: (_mime, q) => (q > 0.7 ? OVER : MAX_IMAGE_BYTES - 1),
    });
    const result = await downscaleImage(file("image/jpeg"), deps);
    expect(steps(calls)).toStrictEqual([
      "image/jpeg@0.92",
      "image/jpeg@0.8",
      "image/jpeg@0.65",
    ]);
    expect(result).toMatchObject({
      status: "ok",
      image: { mime: "image/jpeg", bytes: MAX_IMAGE_BYTES - 1 },
    });
  });

  it("every step keeps the planned size and the decoded source", async () => {
    const { deps, calls } = fakeDeps({
      width: 3000,
      height: 4000,
      size: () => OVER,
    });
    await downscaleImage(file("image/png"), deps);
    expect(calls).toHaveLength(5);
    for (const call of calls) {
      expect([call.source, call.width, call.height]).toStrictEqual([
        "DECODED-SOURCE",
        1536,
        2048,
      ]);
    }
  });
});

describe("what an ok result carries (Block 2)", () => {
  it("base64 and dataUrl are the ENCODED bytes, not the file's", async () => {
    // 0x89 'P' 'N' 'G' -> standard base64 "iVBORw==".
    const { deps } = fakeDeps({
      bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    });
    const result = await downscaleImage(
      file("image/png", ["not-these-bytes"]),
      deps,
    );
    expect(result).toStrictEqual({
      status: "ok",
      image: {
        mime: "image/png",
        base64: "iVBORw==",
        bytes: 4,
        width: 2048,
        height: 1536,
        dataUrl: "data:image/png;base64,iVBORw==",
      },
    });
  });

  it("base64 is the standard alphabet with padding (+ and /, not - and _)", async () => {
    // 0xfb 0xff 0xbf -> "+/+/"; 0xff -> "/w==".
    const { deps } = fakeDeps({
      bytes: new Uint8Array([0xfb, 0xff, 0xbf, 0xff]),
    });
    const result = await downscaleImage(file("image/jpeg"), deps);
    expect(result).toMatchObject({
      status: "ok",
      image: {
        base64: "+/+//w==",
        dataUrl: "data:image/jpeg;base64,+/+//w==",
      },
    });
  });

  it("a 3 MB encoding round-trips through base64 byte for byte (no argument-count limit)", async () => {
    const bytes = new Uint8Array(3_000_000);
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = (i * 31 + 7) % 256;
    const { deps } = fakeDeps({ bytes });
    const result = await downscaleImage(file("image/jpeg"), deps);
    if (result.status !== "ok")
      throw new Error(`expected ok: ${result.status}`);
    expect(result.image.bytes).toBe(3_000_000);
    expect(result.image.base64).toBe(Buffer.from(bytes).toString("base64"));
  }, 20_000);
});
