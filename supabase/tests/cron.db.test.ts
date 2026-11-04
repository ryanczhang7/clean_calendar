// CAL-028 AC-5 (Contract Block 1): the one-minute schedule, inspected through
// direct SQL as `postgres`. Needs a running local stack with the migrations
// applied (`pnpm exec supabase db reset`). Settled values read out of the
// Contract: the job name, `* * * * *`, the function name, the two Vault entry
// names. Nothing is calibrated.
//
// While migration 0005 is absent, pg_cron (and so `cron.job`) may not exist at
// all; the first test checks for the relation in its own query so that it fails
// on "no job named send-reminders" rather than on a missing-relation error.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeSql, type LocalEnv, loadLocalEnv, sql } from "./helpers";

// Budget: every statement here is one local round trip, like the other db
// suites; 30 s covers a cold `supabase status` in beforeAll and the pool's
// close in afterAll.
const BUDGET_MS = 30_000;

const FN = "public.invoke_send_reminders()";
const VAULT_NAMES = ["send_reminders_url", "send_reminders_key"];

let env: LocalEnv;

beforeAll(async () => {
  env = await loadLocalEnv();
}, BUDGET_MS);

afterAll(async () => {
  await closeSql();
}, BUDGET_MS);

type Job = {
  jobname: string;
  schedule: string;
  active: boolean;
  command: string;
};

async function sendRemindersJobs(): Promise<Job[]> {
  const db = sql(env);
  const [present] = await db<{ ok: boolean }[]>`
    select to_regclass('cron.job') is not null as ok`;
  if (!present?.ok) return [];
  return await db<Job[]>`
    select jobname, schedule, active, command
    from cron.job where jobname = 'send-reminders'`;
}

describe("AC-5: one cron job posts to send-reminders every minute", () => {
  it(
    "cron.job holds exactly one active send-reminders job, every minute, calling public.invoke_send_reminders()",
    async () => {
      const jobs = await sendRemindersJobs();
      expect(jobs, "no job named send-reminders in cron.job").toHaveLength(1);
      const [job] = jobs as [Job];
      expect(job.schedule).toBe("* * * * *");
      expect(job.active).toBe(true);
      expect(job.command).toMatch(
        /^\s*select\s+public\.invoke_send_reminders\(\)\s*;?\s*$/i,
      );
    },
    BUDGET_MS,
  );

  it(
    "invoke_send_reminders reads both Vault entries and posts with net.http_post",
    async () => {
      const [row] = await sql(env)<{ def: string | null }[]>`
        select pg_get_functiondef(to_regprocedure(${FN})) as def`;
      const def = row?.def ?? null;
      expect(def, `no function ${FN}`).not.toBeNull();
      expect(def).toContain("vault.decrypted_secrets");
      for (const name of VAULT_NAMES) expect(def).toContain(`'${name}'`);
      expect(def).toContain("net.http_post");
    },
    BUDGET_MS,
  );

  it(
    "invoke_send_reminders is security definer and not executable by public, anon or authenticated",
    async () => {
      const [row] = await sql(env)<
        {
          definer: boolean | null;
          anon: boolean | null;
          authenticated: boolean | null;
          public_: boolean | null;
        }[]
      >`
        select p.prosecdef as definer,
          has_function_privilege('anon', p.oid, 'execute') as anon,
          has_function_privilege('authenticated', p.oid, 'execute')
            as authenticated,
          exists (
            select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
            where a.grantee = 0 and a.privilege_type = 'EXECUTE'
          ) as public_
        from pg_proc p where p.oid = to_regprocedure(${FN})`;
      expect(row, `no function ${FN}`).toBeDefined();
      expect(row?.definer).toBe(true);
      expect(row?.anon, "anon may execute it").toBe(false);
      expect(row?.authenticated, "authenticated may execute it").toBe(false);
      expect(row?.public_, "PUBLIC may execute it").toBe(false);
    },
    BUDGET_MS,
  );

  it(
    "with no Vault entries (the local stack) the job's command runs without error and posts nothing",
    async () => {
      const db = sql(env);
      const [pre] = await db<
        { fn: boolean; queue: boolean; secrets: number }[]
      >`
        select to_regprocedure(${FN}) is not null as fn,
          to_regclass('net.http_request_queue') is not null as queue,
          (select count(*)::int from vault.decrypted_secrets
            where name = any(${VAULT_NAMES})) as secrets`;
      expect(pre?.fn, `no function ${FN}`).toBe(true);
      expect(pre?.queue, "no net.http_request_queue (pg_net)").toBe(true);
      // The precondition the "posts nothing" half rests on.
      expect(pre?.secrets, "a send_reminders_* Vault entry exists").toBe(0);

      const [before] = await db<{ n: number }[]>`
        select count(*)::int as n from net.http_request_queue`;
      await db`select public.invoke_send_reminders()`;
      const [after] = await db<{ n: number }[]>`
        select count(*)::int as n from net.http_request_queue`;
      expect(after?.n, "the job queued an HTTP request").toBe(before?.n);
    },
    BUDGET_MS,
  );
});
