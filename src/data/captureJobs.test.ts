import { HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import {
  installServer,
  onTable,
  pgError,
  preferTokens,
  testClient,
} from "../test/msw";
import { captureJobs, captureJobsRepo } from "./captureJobs";

vi.mock(
  "../lib/supabase",
  async () => (await import("../test/supabase-mock")).supabaseModule,
);

// CAL-020 Contract, Block 6 (AC-5, AC-6; PO decision 5). The job repository
// in the kinds.ts shape: a real supabase-js client at TEST_ORIGIN, MSW
// answering /rest/v1/capture_jobs (src/test/msw.ts). It only ever PATCHes
// `status`; jobs are created by the function (CAL-018). MECHANICAL.

installServer();

const JOB_ID = "0b6c2a7e-3f4d-4c1a-9e2b-7d8f9a0b1c2d";

describe("captureJobs.setStatus (AC-5, AC-6, Block 6)", () => {
  it.each(["confirmed", "discarded"] as const)(
    "%s is one PATCH of {status} on capture_jobs?id=eq.<id>, and nothing else",
    async (status) => {
      const seen = onTable("capture_jobs", () =>
        HttpResponse.json([{ id: JOB_ID, status }]),
      );
      await captureJobsRepo(testClient()).setStatus(JOB_ID, status);

      expect(seen).toHaveLength(1);
      const [req] = seen;
      expect(req?.method).toBe("PATCH");
      expect(req?.url.pathname).toBe("/rest/v1/capture_jobs");
      expect(req?.url.searchParams.get("id")).toBe(`eq.${JOB_ID}`);
      expect(req?.url.searchParams.getAll("id")).toHaveLength(1);
      expect(req?.body).toStrictEqual({ status });
    },
  );

  it("asks for the updated row back, so zero rows can be told from one", async () => {
    const seen = onTable("capture_jobs", () =>
      HttpResponse.json([{ id: JOB_ID, status: "confirmed" }]),
    );
    await captureJobsRepo(testClient()).setStatus(JOB_ID, "confirmed");
    expect(preferTokens(seen[0]?.prefer ?? null)).toContain(
      "return=representation",
    );
  });

  it("one row back is ok with that row's id and status", async () => {
    onTable("capture_jobs", () =>
      HttpResponse.json([{ id: JOB_ID, status: "confirmed" }]),
    );
    await expect(
      captureJobsRepo(testClient()).setStatus(JOB_ID, "confirmed"),
    ).resolves.toStrictEqual({
      status: "ok",
      row: { id: JOB_ID, status: "confirmed" },
    });
  });

  it("zero rows back (no such job, or not the owner's) is conflict", async () => {
    onTable("capture_jobs", () => HttpResponse.json([]));
    await expect(
      captureJobsRepo(testClient()).setStatus(JOB_ID, "discarded"),
    ).resolves.toStrictEqual({ status: "conflict" });
  });

  it("an HTTP refusal is an error carrying PostgREST's code, message and the status", async () => {
    onTable("capture_jobs", () =>
      pgError(403, "42501", "permission denied for table capture_jobs"),
    );
    await expect(
      captureJobsRepo(testClient()).setStatus(JOB_ID, "confirmed"),
    ).resolves.toStrictEqual({
      status: "error",
      code: "42501",
      message: "permission denied for table capture_jobs",
      http: 403,
    });
  });

  it("a rejected fetch is offline, and does not throw", async () => {
    onTable("capture_jobs", () => HttpResponse.error());
    await expect(
      captureJobsRepo(testClient()).setStatus(JOB_ID, "confirmed"),
    ).resolves.toStrictEqual({ status: "offline" });
  });
});

describe("captureJobs, the app's instance (Block 6)", () => {
  it("is bound to the app's client: its PATCH reaches the same capture_jobs endpoint", async () => {
    const seen = onTable("capture_jobs", () =>
      HttpResponse.json([{ id: JOB_ID, status: "discarded" }]),
    );
    await expect(
      captureJobs.setStatus(JOB_ID, "discarded"),
    ).resolves.toStrictEqual({
      status: "ok",
      row: { id: JOB_ID, status: "discarded" },
    });
    expect(seen.map((r) => r.method)).toStrictEqual(["PATCH"]);
  });
});
