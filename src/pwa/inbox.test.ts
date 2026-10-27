import { readFileSync } from "node:fs";
import { join } from "node:path";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { afterEach, describe, expect, it } from "vitest";
import { INBOX_DB_NAME, InboxDb, openInbox, type ShareEntry } from "./inbox";

// CAL-022 Contract, Block 2. The share inbox: its own small Dexie database,
// holding AT MOST ONE entry. The worker `put`s what was shared; the capture
// page `take`s it - read and cleared in one transaction - so "the inbox is
// empty afterwards" (AC-4) is a property of `take`, not of the page.
// Each case opens its own database on a fresh fake-indexeddb factory, as the
// sync suites do (src/sync/db.test.ts).
//
// Deferred verification 1 targets two cases here by title: "take empties the
// inbox" must go red when take stops clearing, while "take returns the stored
// entry" stays green.

const opened: InboxDb[] = [];

function freshInbox(name: string): InboxDb {
  const db = new InboxDb(`cal-022-${name}`, {
    indexedDB: new IDBFactory(),
    IDBKeyRange,
  });
  opened.push(db);
  return db;
}

afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

/** An ArrayBuffer holding exactly `values`, never a view on a larger one. */
function bytes(values: number[]): ArrayBuffer {
  return new Uint8Array(values).buffer as ArrayBuffer;
}

const PNG_BYTES = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 255, 7];

const TEXT_ENTRY: ShareEntry = {
  text: "Table for two\n\nLupa, 3 Nov 19:30",
  image: null,
  receivedAt: "2026-10-27T09:15:00.000Z",
};

const IMAGE_ENTRY: ShareEntry = {
  text: "",
  image: { bytes: bytes(PNG_BYTES), mime: "image/png", name: "booking.png" },
  receivedAt: "2026-10-27T09:16:00.000Z",
};

/** An entry without the key Dexie assigned, and its bytes as plain numbers. */
function comparable(entry: ShareEntry | null) {
  if (entry === null) return null;
  const { id: _id, image, ...rest } = entry;
  return {
    ...rest,
    image:
      image === null
        ? null
        : {
            mime: image.mime,
            name: image.name,
            bytes: [...new Uint8Array(image.bytes)],
            isArrayBuffer:
              Object.prototype.toString.call(image.bytes) ===
              "[object ArrayBuffer]",
          },
  };
}

describe("the inbox database (Block 2)", () => {
  it('is named "clean-calendar-inbox" by default, its own database and not the cache\'s', () => {
    expect(INBOX_DB_NAME).toBe("clean-calendar-inbox");
    const db = new InboxDb();
    opened.push(db);
    expect(db.name).toBe("clean-calendar-inbox");
    expect(db.name).not.toBe("clean-calendar");
  });

  it('has one table, "shares", keyed by an auto-incremented id, at version 1', () => {
    const db = freshInbox("schema");
    expect(db.verno).toBe(1);
    expect(db.tables.map((t: { name: string }) => t.name)).toStrictEqual([
      "shares",
    ]);
    const key = db.shares.schema.primKey;
    expect(key.keyPath).toBe("id");
    expect(key.auto).toBe(true);
  });

  it("never imports the app's cache schema (src/sync/db.ts), so the worker does not pull it in", () => {
    const source = readFileSync(join(import.meta.dirname, "inbox.ts"), "utf8");
    const specifiers = [
      ...source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g),
    ].map((m) => m[1]);
    expect(specifiers).toContain("dexie");
    expect(specifiers.filter((s) => /sync\//.test(s ?? ""))).toStrictEqual([]);
  });
});

describe("an empty inbox (Block 2)", () => {
  it("counts 0", async () => {
    const inbox = openInbox(freshInbox("empty-count"));
    expect(await inbox.count()).toBe(0);
  });

  it("take on an empty inbox returns null", async () => {
    const inbox = openInbox(freshInbox("empty-take"));
    expect(await inbox.take()).toBeNull();
    expect(await inbox.count()).toBe(0);
  });
});

describe("put stores one entry, replacing what was there (Block 2)", () => {
  it("one put leaves exactly one entry", async () => {
    const inbox = openInbox(freshInbox("put-one"));
    await inbox.put(TEXT_ENTRY);
    expect(await inbox.count()).toBe(1);
  });

  it("two puts in a row leave one entry, and it is the second", async () => {
    const inbox = openInbox(freshInbox("put-replaces"));
    await inbox.put(TEXT_ENTRY);
    await inbox.put(IMAGE_ENTRY);
    expect(await inbox.count()).toBe(1);
    expect(comparable(await inbox.take())).toStrictEqual(
      comparable(IMAGE_ENTRY),
    );
  });
});

describe("take reads the entry and empties the inbox (AC-4, Block 2)", () => {
  it("take returns the stored entry", async () => {
    const inbox = openInbox(freshInbox("take-returns-text"));
    await inbox.put(TEXT_ENTRY);
    expect(comparable(await inbox.take())).toStrictEqual(
      comparable(TEXT_ENTRY),
    );
  });

  it("take returns the stored image's bytes byte-for-byte, as an ArrayBuffer, with its mime and name", async () => {
    const inbox = openInbox(freshInbox("take-returns-image"));
    await inbox.put(IMAGE_ENTRY);
    const got = comparable(await inbox.take());
    expect(got).toStrictEqual({
      text: "",
      receivedAt: "2026-10-27T09:16:00.000Z",
      image: {
        mime: "image/png",
        name: "booking.png",
        bytes: PNG_BYTES,
        isArrayBuffer: true,
      },
    });
  });

  it("take empties the inbox", async () => {
    const inbox = openInbox(freshInbox("take-empties"));
    await inbox.put(TEXT_ENTRY);
    await inbox.take();
    expect(await inbox.count()).toBe(0);
    expect(await inbox.take()).toBeNull();
  });

  it("take empties the inbox as seen from a second connection to the same database (the worker's and the page's)", async () => {
    const factory = new IDBFactory();
    const name = "cal-022-two-connections";
    const page = new InboxDb(name, { indexedDB: factory, IDBKeyRange });
    const worker = new InboxDb(name, { indexedDB: factory, IDBKeyRange });
    opened.push(page, worker);
    await openInbox(worker).put(TEXT_ENTRY);
    expect(comparable(await openInbox(page).take())).toStrictEqual(
      comparable(TEXT_ENTRY),
    );
    expect(await openInbox(worker).count()).toBe(0);
  });

  it("an older database holding two entries: take returns the last one and leaves none", async () => {
    const db = freshInbox("take-two");
    await db.shares.bulkAdd([TEXT_ENTRY, IMAGE_ENTRY]);
    const inbox = openInbox(db);
    expect(await inbox.count()).toBe(2);
    expect(comparable(await inbox.take())).toStrictEqual(
      comparable(IMAGE_ENTRY),
    );
    expect(await inbox.count()).toBe(0);
  });
});

describe("openInbox() with no argument (Block 2, the production path)", () => {
  it('opens "clean-calendar-inbox" on the global indexedDB, and put then take round-trips', async () => {
    const inbox = openInbox();
    try {
      await inbox.put(TEXT_ENTRY);
      const check = new InboxDb();
      opened.push(check);
      expect(await check.shares.count()).toBe(1);
      expect(comparable(await inbox.take())).toStrictEqual(
        comparable(TEXT_ENTRY),
      );
      expect(await check.shares.count()).toBe(0);
    } finally {
      await inbox.take();
    }
  });
});
