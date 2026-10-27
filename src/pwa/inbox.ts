import Dexie, { type DexieOptions, type Table } from "dexie";

// CAL-022 Contract, Block 2 (architecture.md, "Share target" and "Where state
// lives"): the share inbox. Its own small IndexedDB database, shared by the
// service worker (which puts what was shared) and the capture page (which
// takes it). It never imports src/sync/db.ts, so the worker does not pull the
// cache schema in. It holds AT MOST ONE entry.

export const INBOX_DB_NAME = "clean-calendar-inbox";

/** The shared file as bytes, not a Blob: what round-trips under fake-indexeddb. */
export type SharedImage = { bytes: ArrayBuffer; mime: string; name: string };

export type ShareEntry = {
  id?: number;
  text: string;
  image: SharedImage | null;
  /** ISO 8601. */
  receivedAt: string;
};

export class InboxDb extends Dexie {
  shares!: Table<ShareEntry, number>;

  constructor(name: string = INBOX_DB_NAME, options?: DexieOptions) {
    super(name, options);
    this.version(1).stores({ shares: "++id" });
  }
}

export type Inbox = {
  /** Replace whatever is there: the inbox holds AT MOST ONE entry. */
  put(entry: ShareEntry): Promise<void>;
  /** The entry, and the inbox emptied, in ONE readwrite transaction; null when empty. */
  take(): Promise<ShareEntry | null>;
  count(): Promise<number>;
};

export function openInbox(db: InboxDb = new InboxDb()): Inbox {
  return {
    put: (entry) =>
      db.transaction("rw", db.shares, async () => {
        // A copy without the key, so Dexie neither reuses an old id nor
        // writes the new one back onto the caller's object.
        const { id: _id, ...fields } = entry;
        await db.shares.clear();
        await db.shares.add(fields);
      }),
    take: () =>
      db.transaction("rw", db.shares, async () => {
        const entries = await db.shares.toArray();
        await db.shares.clear();
        return entries.at(-1) ?? null;
      }),
    count: () => db.shares.count(),
  };
}
