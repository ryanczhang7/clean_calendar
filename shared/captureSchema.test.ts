import { describe, expect, test } from "vitest";
import {
  CAPTURE_FIELDS,
  captureResponseSchema,
  confidenceSchema,
  geminiReplySchema,
  missingSchema,
  proposalSchema,
} from "./captureSchema.ts";

// CAL-018 Contract Block 1 (AC-1, AC-2, AC-3). The rejections are MECHANICAL:
// each one is a reply the handler must turn into 502 {error: "unreadable"},
// so each is pinned here against the one schema both runtimes share.

const PROPOSAL = {
  title: "Dentist check-up",
  startsAt: "2026-11-03T09:30:00+00:00",
  endsAt: "2026-11-03T10:00:00+00:00",
  allDay: false,
  location: "12 High Street",
  kindName: "Doctor",
};

const REPLY = {
  proposal: PROPOSAL,
  confidence: {
    title: 0.95,
    startsAt: 0.9,
    endsAt: 0.6,
    location: 0.8,
    kind: 0.7,
  },
  missing: [],
};

const JOB_ID = "3f1c9a52-6b7e-4d2a-9c11-0a5b2e7d8f40";

function withProposal(patch: Record<string, unknown>) {
  return { ...REPLY, proposal: { ...PROPOSAL, ...patch } };
}

describe("the capture vocabulary", () => {
  test("names exactly title, startsAt, endsAt, location and kind, in that order", () => {
    expect([...CAPTURE_FIELDS]).toEqual([
      "title",
      "startsAt",
      "endsAt",
      "location",
      "kind",
    ]);
  });
});

describe("a model reply the schema accepts", () => {
  test("a complete reply with every field and every confidence parses unchanged", () => {
    expect(geminiReplySchema.parse(REPLY)).toEqual(REPLY);
  });

  test("a reply where the model found nothing: null fields, no confidences, everything missing", () => {
    const empty = {
      proposal: {
        title: null,
        startsAt: null,
        endsAt: null,
        allDay: false,
        location: null,
        kindName: null,
      },
      confidence: {},
      missing: ["title", "startsAt", "endsAt", "location", "kind"],
    };
    expect(geminiReplySchema.safeParse(empty).success).toBe(true);
  });

  test("every confidence key is optional: a reply rating only the title parses", () => {
    expect(
      geminiReplySchema.safeParse({ ...REPLY, confidence: { title: 0.5 } })
        .success,
    ).toBe(true);
  });

  test("confidence 0 and confidence 1 are both inside the range", () => {
    expect(confidenceSchema.safeParse({ title: 0, kind: 1 }).success).toBe(
      true,
    );
  });

  test("an all-day event is carried as allDay true", () => {
    expect(
      proposalSchema.safeParse({ ...PROPOSAL, allDay: true }).success,
    ).toBe(true);
  });
});

describe("a model reply the schema rejects (AC-3 -> 502 unreadable)", () => {
  test("a confidence of 1.5 is above the 0..1 range and fails", () => {
    expect(
      geminiReplySchema.safeParse({ ...REPLY, confidence: { title: 1.5 } })
        .success,
    ).toBe(false);
  });

  test("a confidence of -0.1 is below the 0..1 range and fails", () => {
    expect(
      geminiReplySchema.safeParse({ ...REPLY, confidence: { endsAt: -0.1 } })
        .success,
    ).toBe(false);
  });

  test("a confidence that is a string, not a number, fails", () => {
    expect(confidenceSchema.safeParse({ title: "0.9" }).success).toBe(false);
  });

  test("a confidence keyed kindName (the proposal's name, not the vocabulary's) fails", () => {
    expect(confidenceSchema.safeParse({ kindName: 0.5 }).success).toBe(false);
  });

  test("a confidence keyed allDay, which is not a capture field, fails", () => {
    expect(confidenceSchema.safeParse({ allDay: 0.5 }).success).toBe(false);
  });

  test("a proposal missing its location key fails", () => {
    const { location: _dropped, ...rest } = PROPOSAL;
    expect(
      geminiReplySchema.safeParse({ ...REPLY, proposal: rest }).success,
    ).toBe(false);
  });

  test("a proposal missing its kindName key fails", () => {
    const { kindName: _dropped, ...rest } = PROPOSAL;
    expect(proposalSchema.safeParse(rest).success).toBe(false);
  });

  test("a reply missing its missing array fails", () => {
    const { missing: _dropped, ...rest } = REPLY;
    expect(geminiReplySchema.safeParse(rest).success).toBe(false);
  });

  test("a reply missing its confidence object fails", () => {
    const { confidence: _dropped, ...rest } = REPLY;
    expect(geminiReplySchema.safeParse(rest).success).toBe(false);
  });

  test("a reply missing its proposal fails", () => {
    const { proposal: _dropped, ...rest } = REPLY;
    expect(geminiReplySchema.safeParse(rest).success).toBe(false);
  });

  test("a proposal with an extra key fails, because the proposal is strict", () => {
    expect(
      geminiReplySchema.safeParse(withProposal({ notes: "bring card" }))
        .success,
    ).toBe(false);
  });

  test('allDay as the string "true" fails', () => {
    expect(
      geminiReplySchema.safeParse(withProposal({ allDay: "true" })).success,
    ).toBe(false);
  });

  test("allDay as null fails: it is a boolean, never unknown", () => {
    expect(
      proposalSchema.safeParse({ ...PROPOSAL, allDay: null }).success,
    ).toBe(false);
  });

  test("a title that is a number, not a string or null, fails", () => {
    expect(proposalSchema.safeParse({ ...PROPOSAL, title: 42 }).success).toBe(
      false,
    );
  });

  test('missing naming "kindName" instead of "kind" fails', () => {
    expect(missingSchema.safeParse(["kindName"]).success).toBe(false);
  });

  test('missing naming "allDay", which is not a capture field, fails', () => {
    expect(missingSchema.safeParse(["allDay"]).success).toBe(false);
  });

  test("missing as a bare string rather than an array fails", () => {
    expect(
      geminiReplySchema.safeParse({ ...REPLY, missing: "kind" }).success,
    ).toBe(false);
  });
});

describe("the response the function returns to the client", () => {
  test("is the reply plus a uuid jobId", () => {
    const response = { ...REPLY, jobId: JOB_ID };
    expect(captureResponseSchema.parse(response)).toEqual(response);
  });

  test("without a jobId fails", () => {
    expect(captureResponseSchema.safeParse(REPLY).success).toBe(false);
  });

  test("with a jobId that is not a uuid fails", () => {
    expect(
      captureResponseSchema.safeParse({ ...REPLY, jobId: "job-1" }).success,
    ).toBe(false);
  });

  test("still enforces the reply's rules: a confidence of 1.5 fails here too", () => {
    expect(
      captureResponseSchema.safeParse({
        ...REPLY,
        confidence: { kind: 1.5 },
        jobId: JOB_ID,
      }).success,
    ).toBe(false);
  });
});
