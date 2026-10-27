// The screenshot downscaler (CAL-020 Contract, Block 2). The long edge is
// capped at MAX_LONG_EDGE and the encoding at the capture function's limit
// (CAL-019), stepping quality down until it fits. The pixel work is behind
// `DownscaleDeps`, so the order of steps is testable without a canvas.

export const MAX_LONG_EDGE = 2048;
/** The capture function's limit (CAL-019). */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const QUALITY_STEPS = [0.92, 0.8, 0.65, 0.5] as const;

const ACCEPTED = ["image/png", "image/jpeg", "image/webp"] as const;
type AcceptedMime = (typeof ACCEPTED)[number];

/** Pure: the target size. The long edge is capped at `maxEdge`, the aspect kept (rounded), never upscaled. */
export function planDownscale(
  width: number,
  height: number,
  maxEdge: number = MAX_LONG_EDGE,
): { width: number; height: number; scaled: boolean } {
  const long = Math.max(width, height);
  if (long <= maxEdge) return { width, height, scaled: false };
  const ratio = maxEdge / long;
  const scale = (edge: number) =>
    edge === long ? maxEdge : Math.max(1, Math.round(edge * ratio));
  return { width: scale(width), height: scale(height), scaled: true };
}

export type Downscaled = {
  mime: AcceptedMime;
  base64: string;
  bytes: number;
  width: number;
  height: number;
  dataUrl: string;
};

export type DownscaleDeps = {
  /** Decode a file: its pixel size and an opaque handle the encoder accepts. */
  decode(
    file: Blob,
  ): Promise<{ width: number; height: number; source: unknown }>;
  /** Draw `source` at width x height and encode it; `quality` applies to lossy types. */
  encode(
    source: unknown,
    width: number,
    height: number,
    mime: string,
    quality: number,
  ): Promise<Blob>;
};

/** createImageBitmap + canvas. Untested in jsdom, which has neither. */
export const browserDeps: DownscaleDeps = {
  async decode(file) {
    const bitmap = await createImageBitmap(file);
    return { width: bitmap.width, height: bitmap.height, source: bitmap };
  },
  encode(source, width, height, mime, quality) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (context === null) return Promise.reject(new Error("no 2d context"));
    context.drawImage(source as CanvasImageSource, 0, 0, width, height);
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) =>
          blob === null ? reject(new Error("encode failed")) : resolve(blob),
        mime,
        quality,
      );
    });
  },
};

const CHUNK = 0x8000;

/** Standard-alphabet base64, in chunks: a spread of 3 MB overflows the argument limit. */
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function isAccepted(type: string): type is AcceptedMime {
  return (ACCEPTED as readonly string[]).includes(type);
}

/** The encodings to try, in order: own type first; a PNG then falls back to JPEG. */
function attempts(mime: AcceptedMime): Array<[AcceptedMime, number]> {
  const lossy: AcceptedMime = mime === "image/png" ? "image/jpeg" : mime;
  const steps = QUALITY_STEPS.map((q): [AcceptedMime, number] => [lossy, q]);
  return mime === "image/png" ? [[mime, QUALITY_STEPS[0]], ...steps] : steps;
}

export async function downscaleImage(
  file: Blob,
  deps: DownscaleDeps = browserDeps,
): Promise<
  | { status: "ok"; image: Downscaled }
  | { status: "too_large" }
  | { status: "unsupported" }
> {
  if (!isAccepted(file.type)) return { status: "unsupported" };
  const decoded = await deps.decode(file);
  const { width, height } = planDownscale(decoded.width, decoded.height);
  for (const [mime, quality] of attempts(file.type)) {
    const blob = await deps.encode(
      decoded.source,
      width,
      height,
      mime,
      quality,
    );
    if (blob.size <= MAX_IMAGE_BYTES) {
      const base64 = toBase64(new Uint8Array(await blob.arrayBuffer()));
      return {
        status: "ok",
        image: {
          mime,
          base64,
          bytes: blob.size,
          width,
          height,
          dataUrl: `data:${mime};base64,${base64}`,
        },
      };
    }
  }
  return { status: "too_large" };
}
