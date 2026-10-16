import type { KindsRepo } from "../data/kinds";
import type { Kind } from "../data/rows";
import { DEFAULT_KINDS } from "./defaultKinds";

// The first-sign-in seed (CAL-006, AC-3/4/5; Contract Block 4). It never
// updates, deletes or inserts a subset, and calls insertMany at most once.

export type SeedOutcome = "seeded" | "existing" | "unavailable";
export type SeedRepo = Pick<KindsRepo, "listAll" | "insertMany">;

const unavailable = () => ({ outcome: "unavailable" as const, kinds: [] });

export async function ensureDefaultKinds(
  repo: SeedRepo,
): Promise<{ outcome: SeedOutcome; kinds: Kind[] }> {
  const read = await repo.listAll();
  if (read.status !== "ok") return unavailable();
  // Any row counts, live or soft-deleted (AC-4): deleting every kind never
  // brings the defaults back.
  if (read.rows.length > 0) return { outcome: "existing", kinds: read.rows };

  const inserted = await repo.insertMany([...DEFAULT_KINDS]);
  if (inserted.status === "ok") {
    return { outcome: "seeded", kinds: inserted.rows };
  }
  // The live-name unique index (CAL-004): another device seeded first (AC-5).
  if (inserted.status === "error" && inserted.code === "23505") {
    const reread = await repo.listAll();
    if (reread.status === "ok") {
      return { outcome: "existing", kinds: reread.rows };
    }
  }
  return unavailable();
}
