import type { Inbox, ShareEntry, SharedImage } from "./inbox";

// CAL-022 Contract, Block 3 (architecture.md, "Share target"): the share
// handler, a function from a request to a Response that the service worker
// calls (src/sw.ts). No React, no `self`, no workbox: it type-checks under
// both the DOM and the WebWorker lib, and is unit-tested without a worker.

export const SHARE_PATH = "/share";
export const CAPTURE_FROM_SHARE = "/capture?from=share";

/** POST and pathname exactly "/share" (any origin, any query). */
export function isShareRequest(request: {
  method: string;
  url: string;
}): boolean {
  return (
    request.method === "POST" && new URL(request.url).pathname === SHARE_PATH
  );
}

/** title, text, url: each trimmed, the empty ones dropped, the rest joined by "\n\n" in that order. */
export function sharedText(form: FormData): string {
  return ["title", "text", "url"]
    .map((name) => {
      const value = form.get(name);
      return typeof value === "string" ? value.trim() : "";
    })
    .filter((part) => part !== "")
    .join("\n\n");
}

/** form.get("image") when it is a Blob-like with size > 0: its bytes, type and (File) name; else null. */
export async function sharedImage(form: FormData): Promise<SharedImage | null> {
  const value: unknown = form.get("image");
  // Duck-typed, never instanceof Blob: the worker's File is the platform's,
  // and a test's is jsdom's - two realms.
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as Blob).arrayBuffer !== "function"
  ) {
    return null;
  }
  const blob = value as Blob;
  if (blob.size === 0) return null;
  const name = (value as { name?: unknown }).name;
  return {
    bytes: await blob.arrayBuffer(),
    mime: blob.type,
    name: typeof name === "string" ? name : "shared",
  };
}

export async function entryFromForm(
  form: FormData,
  receivedAt: Date,
): Promise<ShareEntry> {
  return {
    text: sharedText(form),
    image: await sharedImage(form),
    receivedAt: receivedAt.toISOString(),
  };
}

/** Reads the form, stores the entry (unless it carries neither text nor image), answers 303 → CAPTURE_FROM_SHARE resolved against request.url. */
export async function handleShare(
  request: Pick<Request, "url" | "formData">,
  inbox: Inbox,
  now: () => Date = () => new Date(),
): Promise<Response> {
  const entry = await entryFromForm(await request.formData(), now());
  // Awaited: in the worker, respondWith's promise is what keeps it alive
  // until the write lands.
  if (entry.text !== "" || entry.image !== null) await inbox.put(entry);
  return new Response(null, {
    status: 303,
    headers: { Location: new URL(CAPTURE_FROM_SHARE, request.url).href },
  });
}
