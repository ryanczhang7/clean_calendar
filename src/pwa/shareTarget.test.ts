import { readFileSync } from "node:fs";
import { join } from "node:path";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Inbox, InboxDb, openInbox, type ShareEntry } from "./inbox";
import {
  CAPTURE_FROM_SHARE,
  entryFromForm,
  handleShare,
  isShareRequest,
  SHARE_PATH,
  sharedImage,
  sharedText,
} from "./shareTarget";

// CAL-022 Contract, Block 3. The share handler is a function from a request
// to a Response that the worker calls (Block 4), tested without a worker.
//
// Measured limit (Block 3): under the jsdom project a multipart `Request`
// cannot be built - undici rejects jsdom's File - so the handler is given
// `{ url, formData: async () => form }` with a jsdom FormData, never a
// `new Request(url, { body: formData })`. The platform does the multipart
// parsing in the real worker.
//
// SETTLED: the 303, its Location (absolute, resolved against request.url),
// the join order title, text, url and the "\n\n" separator. MECHANICAL: the
// rest.
//
// Deferred verification 2 targets this file: with `handleShare` answering
// the 303 WITHOUT `inbox.put`, the "stores ..." cases must go red while the
// "answers ... with a 303" cases - which assert ONLY the response - stay
// green. Deferred verification 3: dropping the method check turns the
// "GET /share" negative of isShareRequest red.

const ORIGIN = "https://app.test";
const NOW = new Date("2026-10-27T09:15:00.000Z");

const opened: InboxDb[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

/** A real inbox on its own fake-indexeddb factory. */
function realInbox(name: string): Inbox {
  const db = new InboxDb(`cal-022-share-${name}`, {
    indexedDB: new IDBFactory(),
    IDBKeyRange,
  });
  opened.push(db);
  return openInbox(db);
}

/** An inbox double whose `put` resolves at once. */
function inboxDouble() {
  return {
    put: vi.fn<Inbox["put"]>(async () => {}),
    take: vi.fn<Inbox["take"]>(async () => null),
    count: vi.fn<Inbox["count"]>(async () => 0),
  };
}

function form(fields: Record<string, string | File>): FormData {
  const f = new FormData();
  for (const [name, value] of Object.entries(fields)) f.append(name, value);
  return f;
}

/** What the worker hands the handler: the request's url and its form. */
function shareRequest(fd: FormData, url = `${ORIGIN}/share`) {
  return { url, formData: async () => fd };
}

const PNG_BYTES = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 255, 7];
const png = () =>
  new File([new Uint8Array(PNG_BYTES)], "Screenshot_20261027.png", {
    type: "image/png",
  });

const arrayOf = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)];

describe("the module's constants (Block 3)", () => {
  it('the share path is "/share" and the redirect target "/capture?from=share"', () => {
    expect(SHARE_PATH).toBe("/share");
    expect(CAPTURE_FROM_SHARE).toBe("/capture?from=share");
  });

  it("imports no React, no workbox and nothing of the cache, so the worker and the page can both load it", () => {
    const source = readFileSync(
      join(import.meta.dirname, "shareTarget.ts"),
      "utf8",
    );
    const specifiers = [
      ...source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g),
    ].map((m) => m[1] ?? "");
    expect(specifiers).toContain("./inbox");
    expect(
      specifiers.filter((s) => /^react|workbox|sync\//.test(s)),
    ).toStrictEqual([]);
  });
});

describe("isShareRequest: POST and pathname exactly /share (AC-5, Block 3)", () => {
  it.each([
    ["POST https://app.test/share", "POST", `${ORIGIN}/share`],
    ["POST /share with a query string", "POST", `${ORIGIN}/share?x=1`],
    ["POST /share on another origin", "POST", "http://localhost:5173/share"],
  ])("%s is a share", (_label, method, url) => {
    expect(isShareRequest({ method, url })).toBe(true);
  });

  it.each([
    ["GET /share", "GET", `${ORIGIN}/share`],
    ["POST /share/ (trailing slash)", "POST", `${ORIGIN}/share/`],
    ["POST /capture", "POST", `${ORIGIN}/capture`],
    ["POST /shared", "POST", `${ORIGIN}/shared`],
    ["POST /capture?from=share", "POST", `${ORIGIN}/capture?from=share`],
    ["PUT /share", "PUT", `${ORIGIN}/share`],
    [
      'lower-case "post" /share (the platform normalises)',
      "post",
      `${ORIGIN}/share`,
    ],
  ])("%s is not a share", (_label, method, url) => {
    expect(isShareRequest({ method, url })).toBe(false);
  });
});

describe("sharedText: title, text, url joined by a blank line (AC-2, Block 3)", () => {
  it("text alone is the text", () => {
    expect(sharedText(form({ text: "Dinner at Lupa, 3 Nov" }))).toBe(
      "Dinner at Lupa, 3 Nov",
    );
  });

  it('all three are joined in the order title, text, url with "\\n\\n", whatever order they arrived in', () => {
    const fd = form({
      url: "https://lupa.example/booking/42",
      text: "Table for two, 3 Nov 19:30",
      title: "Your booking at Lupa",
    });
    expect(sharedText(fd)).toBe(
      "Your booking at Lupa\n\nTable for two, 3 Nov 19:30\n\nhttps://lupa.example/booking/42",
    );
  });

  it("each part is trimmed before joining", () => {
    const fd = form({
      title: "  Your booking \n",
      text: "\tTable for two  ",
      url: " https://lupa.example/b ",
    });
    expect(sharedText(fd)).toBe(
      "Your booking\n\nTable for two\n\nhttps://lupa.example/b",
    );
  });

  it("empty and whitespace-only parts are dropped, with no stray separator", () => {
    expect(sharedText(form({ title: "", text: "Dinner", url: "   " }))).toBe(
      "Dinner",
    );
    expect(sharedText(form({ title: "Lupa", text: " \n ", url: "u" }))).toBe(
      "Lupa\n\nu",
    );
  });

  it("missing parts are dropped: title and url only", () => {
    expect(sharedText(form({ title: "Lupa", url: "https://l.example" }))).toBe(
      "Lupa\n\nhttps://l.example",
    );
  });

  it("text inside a part keeps its own line breaks", () => {
    expect(sharedText(form({ text: "Line one\nLine two" }))).toBe(
      "Line one\nLine two",
    );
  });

  it("no text parts at all is the empty string", () => {
    expect(sharedText(form({}))).toBe("");
    expect(sharedText(form({ image: png() }))).toBe("");
  });
});

describe("sharedImage: the image field's bytes, type and name (AC-3, Block 3)", () => {
  it("a shared File gives its bytes byte-for-byte, its MIME type and its name", async () => {
    const image = await sharedImage(form({ image: png() }));
    expect(image).not.toBeNull();
    expect(image?.mime).toBe("image/png");
    expect(image?.name).toBe("Screenshot_20261027.png");
    expect(arrayOf(image?.bytes ?? new ArrayBuffer(0))).toStrictEqual(
      PNG_BYTES,
    );
    expect(Object.prototype.toString.call(image?.bytes)).toBe(
      "[object ArrayBuffer]",
    );
  });

  it("the MIME type is the file's own, not assumed", async () => {
    const jpeg = new File([new Uint8Array([0xff, 0xd8, 0xff])], "a.jpg", {
      type: "image/jpeg",
    });
    expect((await sharedImage(form({ image: jpeg })))?.mime).toBe("image/jpeg");
  });

  it("no image field is no image", async () => {
    expect(await sharedImage(form({ text: "Dinner" }))).toBeNull();
  });

  it("a zero-byte file is no image", async () => {
    const empty = new File([], "empty.png", { type: "image/png" });
    expect(await sharedImage(form({ image: empty }))).toBeNull();
  });

  it("an image field holding a string is no image", async () => {
    expect(await sharedImage(form({ image: "not a file" }))).toBeNull();
  });

  it('a Blob-like from another realm (not instanceof Blob) is accepted, duck-typed; with no name it is called "shared"', async () => {
    // The worker's File is the platform's, not this realm's: the handler
    // must not use instanceof. This one has arrayBuffer, size and type, and
    // no name - a Blob rather than a File.
    const foreign = {
      size: 3,
      type: "image/webp",
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    };
    expect(foreign instanceof Blob).toBe(false);
    const fd = { get: (name: string) => (name === "image" ? foreign : null) };
    const image = await sharedImage(fd as unknown as FormData);
    expect(image).not.toBeNull();
    expect(image?.name).toBe("shared");
    expect(image?.mime).toBe("image/webp");
    expect(arrayOf(image?.bytes ?? new ArrayBuffer(0))).toStrictEqual([
      1, 2, 3,
    ]);
  });
});

describe("entryFromForm (Block 3)", () => {
  it("text and image together, stamped with receivedAt as ISO 8601", async () => {
    const entry = await entryFromForm(
      form({ title: "Lupa", text: "3 Nov", image: png() }),
      NOW,
    );
    expect(entry.text).toBe("Lupa\n\n3 Nov");
    expect(entry.receivedAt).toBe("2026-10-27T09:15:00.000Z");
    expect(entry.image?.mime).toBe("image/png");
    expect(entry.image?.name).toBe("Screenshot_20261027.png");
    expect(arrayOf(entry.image?.bytes ?? new ArrayBuffer(0))).toStrictEqual(
      PNG_BYTES,
    );
    expect("id" in entry).toBe(false);
  });

  it("text alone: image is null", async () => {
    expect(await entryFromForm(form({ text: "Dinner" }), NOW)).toStrictEqual({
      text: "Dinner",
      image: null,
      receivedAt: "2026-10-27T09:15:00.000Z",
    });
  });
});

describe("handleShare answers every share with a 303 to /capture?from=share (AC-2, AC-3)", () => {
  // These assert ONLY the response, so that Deferred verification 2 (the
  // handler skipping inbox.put) leaves them green.
  it("answers a text share with a 303 to https://app.test/capture?from=share", async () => {
    const response = await handleShare(
      shareRequest(form({ text: "Dinner" })),
      inboxDouble(),
      () => NOW,
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://app.test/capture?from=share",
    );
  });

  it("answers an image share with the same 303", async () => {
    const response = await handleShare(
      shareRequest(form({ image: png() })),
      inboxDouble(),
      () => NOW,
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://app.test/capture?from=share",
    );
  });

  it("resolves the Location against the request's own origin", async () => {
    const response = await handleShare(
      shareRequest(
        form({ text: "Dinner" }),
        "http://localhost:5173/share?utm=x",
      ),
      inboxDouble(),
      () => NOW,
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost:5173/capture?from=share",
    );
  });
});

describe("handleShare stores the share in the inbox (AC-2, AC-3)", () => {
  it("stores the joined text as the one inbox entry, stamped with now()", async () => {
    const inbox = realInbox("stores-text");
    const response = await handleShare(
      shareRequest(
        form({
          title: "Your booking",
          text: "Table for two, 3 Nov 19:30",
          url: "https://lupa.example/b/42",
        }),
      ),
      inbox,
      () => NOW,
    );
    expect(response.status).toBe(303);
    expect(await inbox.count()).toBe(1);
    const entry = await inbox.take();
    expect(entry?.text).toBe(
      "Your booking\n\nTable for two, 3 Nov 19:30\n\nhttps://lupa.example/b/42",
    );
    expect(entry?.image).toBeNull();
    expect(entry?.receivedAt).toBe("2026-10-27T09:15:00.000Z");
  });

  it("stores the image's bytes and MIME type as the one inbox entry", async () => {
    const inbox = realInbox("stores-image");
    await handleShare(shareRequest(form({ image: png() })), inbox, () => NOW);
    expect(await inbox.count()).toBe(1);
    const entry = await inbox.take();
    expect(entry?.text).toBe("");
    expect(entry?.image?.mime).toBe("image/png");
    expect(entry?.image?.name).toBe("Screenshot_20261027.png");
    expect(arrayOf(entry?.image?.bytes ?? new ArrayBuffer(0))).toStrictEqual(
      PNG_BYTES,
    );
  });

  it("stores the entry with inbox.put exactly once, with the entry built from the form", async () => {
    const inbox = inboxDouble();
    await handleShare(
      shareRequest(form({ text: " Dinner ", url: "https://l.example" })),
      inbox,
      () => NOW,
    );
    expect(inbox.put).toHaveBeenCalledTimes(1);
    expect(inbox.put.mock.calls[0]?.[0]).toStrictEqual({
      text: "Dinner\n\nhttps://l.example",
      image: null,
      receivedAt: "2026-10-27T09:15:00.000Z",
    } satisfies ShareEntry);
    expect(inbox.take).not.toHaveBeenCalled();
  });

  it("a second share replaces the first: the inbox holds only the newest", async () => {
    const inbox = realInbox("stores-replaces");
    await handleShare(shareRequest(form({ text: "first" })), inbox, () => NOW);
    await handleShare(shareRequest(form({ text: "second" })), inbox, () => NOW);
    expect(await inbox.count()).toBe(1);
    expect((await inbox.take())?.text).toBe("second");
  });

  it("does not answer until the entry is stored", async () => {
    let stored: () => void = () => {};
    const inbox = inboxDouble();
    inbox.put.mockImplementation(
      () =>
        new Promise<void>((done) => {
          stored = done;
        }),
    );
    let answered = false;
    const pending = handleShare(
      shareRequest(form({ text: "Dinner" })),
      inbox,
      () => NOW,
    ).then((r: Response) => {
      answered = true;
      return r;
    });
    await vi.waitFor(() => expect(inbox.put).toHaveBeenCalledTimes(1));
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
    expect(answered).toBe(false);
    stored();
    expect((await pending).status).toBe(303);
  });

  it("with no now(), receivedAt is the current time as ISO 8601", async () => {
    const inbox = inboxDouble();
    const before = Date.now();
    await handleShare(shareRequest(form({ text: "Dinner" })), inbox);
    const after = Date.now();
    const receivedAt = inbox.put.mock.calls[0]?.[0].receivedAt ?? "";
    expect(receivedAt).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
    const at = Date.parse(receivedAt);
    expect(at).toBeGreaterThanOrEqual(before);
    expect(at).toBeLessThanOrEqual(after);
  });
});

describe("an empty share stores nothing and still answers the 303 (PO decision 2)", () => {
  it.each([
    ["no fields at all", () => form({})],
    ["only whitespace text parts", () => form({ title: " ", text: "\n\t" })],
    [
      "a zero-byte image and no text",
      () => form({ image: new File([], "e.png", { type: "image/png" }) }),
    ],
  ])("%s: nothing is put, the answer is the 303", async (_label, build) => {
    const inbox = inboxDouble();
    const response = await handleShare(shareRequest(build()), inbox, () => NOW);
    expect(inbox.put).not.toHaveBeenCalled();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://app.test/capture?from=share",
    );
  });

  it("an empty share leaves a real inbox empty", async () => {
    const inbox = realInbox("empty-share");
    await handleShare(shareRequest(form({})), inbox, () => NOW);
    expect(await inbox.count()).toBe(0);
  });
});
