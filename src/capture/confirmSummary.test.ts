import { describe, expect, it } from "vitest";
import type { EventFormValue } from "../domain/eventForm";
import {
  blankMissing,
  FORM_FIELDS,
  type FieldStates,
  fieldStates,
  firstFocus,
  LOW_CONFIDENCE,
  LOW_HELPER,
  MISSING_HELPER,
  NOTHING_FOUND,
  saveBlockers,
  saveDescription,
  summaryText,
} from "./confirmSummary";

// CAL-021 Contract, Block 1 (AC-1 to AC-6). Pure. SETTLED, read out and not
// calibrated: LOW_CONFIDENCE 0.8 with 0.79 low and 0.80 confident
// (components.md, "Confirm screen"); every string below is voice.md's
// "Confirm screen" copy, written out by hand; total 5; focus order missing
// -> low -> Title; form order Title, Kind, Starts, Ends, Location. The three
// oracle-free criteria carry the titles Deferred verifications 1-3 name:
//   DV1 - `<` mutated to `<=`: "0.80 is confident" goes red, "0.79 is low"
//         stays green;
//   DV2 - blankMissing returning `value`: every "a missing ... is empty" case
//         goes red, "a confident or low field keeps the proposal's value"
//         stays green;
//   DV3 - firstFocus preferring low: "a low field before a later missing
//         one" goes red, "else Title" stays green.

/** Every field confident, with the named ones overridden. */
function states(extra: Partial<FieldStates> = {}): FieldStates {
  return {
    title: "confident",
    kind: "confident",
    start: "confident",
    end: "confident",
    location: "confident",
    ...extra,
  };
}

/** A filled form value, as proposalToFormValue would build it. */
const FULL: EventFormValue = {
  title: "Dinner at Lupa",
  kindId: "00000000-0000-4000-8000-000000000002",
  allDay: false,
  startDate: "2026-11-03",
  startTime: "19:30",
  endDate: "2026-11-03",
  endTime: "20:30",
  location: "Lupa, Via Roma 1",
  notes: "Window table",
  repeat: "none",
  repeatEnds: "never",
  repeatUntil: "",
};

describe("the constants (Block 1; components.md, voice.md)", () => {
  it("the low-confidence threshold is 0.8", () => {
    expect(LOW_CONFIDENCE).toBe(0.8);
  });

  it("the form's five marked fields, in form order: title, kind, start, end, location", () => {
    expect([...FORM_FIELDS]).toStrictEqual([
      "title",
      "kind",
      "start",
      "end",
      "location",
    ]);
  });

  it("the helpers and the nothing-found summary are voice.md's copy, exactly", () => {
    expect(LOW_HELPER).toBe("Not sure about this — check it");
    expect(MISSING_HELPER).toBe("Not found in the text — add it");
    expect(NOTHING_FOUND).toBe(
      "Couldn't find event details. Fill them in, or try a clearer screenshot.",
    );
  });
});

describe("fieldStates: the proposal's state per form field (AC-1, AC-2)", () => {
  it("no confidence entries and nothing missing: every field confident", () => {
    expect(fieldStates({ confidence: {}, missing: [] })).toStrictEqual(
      states(),
    );
  });

  it("0.79 is low", () => {
    expect(
      fieldStates({ confidence: { title: 0.79 }, missing: [] }).title,
    ).toBe("low");
  });

  it("0.80 is confident", () => {
    // Paired with a low field in the same response, so a function that
    // marks nothing cannot pass this case.
    expect(
      fieldStates({ confidence: { title: 0.8, kind: 0.5 }, missing: [] }),
    ).toStrictEqual(states({ kind: "low" }));
  });

  it("AC-1's control in one response: 0.79 marked low and 0.80 left plain", () => {
    expect(
      fieldStates({ confidence: { title: 0.79, kind: 0.8 }, missing: [] }),
    ).toStrictEqual(states({ title: "low" }));
  });

  it("0 is low; 1 and an absent entry are confident", () => {
    expect(
      fieldStates({ confidence: { location: 0, title: 1 }, missing: [] }),
    ).toStrictEqual(states({ location: "low" }));
  });

  it("capture names map to form names: startsAt -> start, endsAt -> end, kind, title, location", () => {
    expect(
      fieldStates({
        confidence: { startsAt: 0.3, endsAt: 0.4 },
        missing: ["kind"],
      }),
    ).toStrictEqual(states({ start: "low", end: "low", kind: "missing" }));
    expect(
      fieldStates({
        confidence: { kind: 0.2 },
        missing: ["startsAt", "endsAt", "title", "location"],
      }),
    ).toStrictEqual({
      title: "missing",
      kind: "low",
      start: "missing",
      end: "missing",
      location: "missing",
    });
  });

  it("missing wins over any confidence the same field carries", () => {
    expect(
      fieldStates({
        confidence: { title: 0.95, endsAt: 0.1 },
        missing: ["title", "endsAt"],
      }),
    ).toStrictEqual(states({ title: "missing", end: "missing" }));
  });
});

describe("summaryText: the role=status line (AC-4, AC-5)", () => {
  it("nothing low and nothing missing: just the count", () => {
    expect(summaryText(states(), false)).toBe("Found 5 of 5 details.");
    expect(summaryText(states(), true)).toBe("Found 5 of 5 details.");
  });

  it('voice.md\'s example: kind low, end missing, timed -> "Found 4 of 5 details. Check the kind and add the end time."', () => {
    expect(summaryText(states({ kind: "low", end: "missing" }), false)).toBe(
      "Found 4 of 5 details. Check the kind and add the end time.",
    );
  });

  it("low only: one Check sentence, nothing missing so 5 of 5", () => {
    expect(summaryText(states({ kind: "low" }), false)).toBe(
      "Found 5 of 5 details. Check the kind.",
    );
  });

  it("missing only: one Add sentence", () => {
    expect(summaryText(states({ end: "missing" }), false)).toBe(
      "Found 4 of 5 details. Add the end time.",
    );
  });

  it('two items join with "and", in form order', () => {
    expect(summaryText(states({ location: "low", title: "low" }), false)).toBe(
      "Found 5 of 5 details. Check the title and the location.",
    );
  });

  it('three items join as "a, b and c", in form order', () => {
    expect(
      summaryText(
        states({ location: "missing", title: "missing", start: "missing" }),
        false,
      ),
    ).toBe(
      "Found 2 of 5 details. Add the title, the start time and the location.",
    );
  });

  it("four missing and one low: 1 of 5, the four joined a, b, c and d", () => {
    expect(
      summaryText(
        {
          title: "missing",
          kind: "low",
          start: "missing",
          end: "missing",
          location: "missing",
        },
        false,
      ),
    ).toBe(
      "Found 1 of 5 details. Check the kind and add the title, the start time, the end time and the location.",
    );
  });

  it('all day: start and end read "the start date" / "the end date"; timed they read "time"', () => {
    const s = states({ start: "low", end: "missing" });
    expect(summaryText(s, true)).toBe(
      "Found 4 of 5 details. Check the start date and add the end date.",
    );
    expect(summaryText(s, false)).toBe(
      "Found 4 of 5 details. Check the start time and add the end time.",
    );
  });

  it("every field missing: the nothing-found sentence exactly, timed or all day (AC-5)", () => {
    const all: FieldStates = {
      title: "missing",
      kind: "missing",
      start: "missing",
      end: "missing",
      location: "missing",
    };
    expect(summaryText(all, false)).toBe(
      "Couldn't find event details. Fill them in, or try a clearer screenshot.",
    );
    expect(summaryText(all, true)).toBe(
      "Couldn't find event details. Fill them in, or try a clearer screenshot.",
    );
  });
});

describe("firstFocus: where focus goes on open (AC-3)", () => {
  it("else Title: nothing low and nothing missing", () => {
    expect(firstFocus(states())).toBe("title");
  });

  it("a low field before a later missing one: focus goes to the missing one", () => {
    expect(firstFocus(states({ title: "low", location: "missing" }))).toBe(
      "location",
    );
  });

  it("the first missing field in form order: start before end", () => {
    expect(firstFocus(states({ end: "missing", start: "missing" }))).toBe(
      "start",
    );
  });

  it("no missing field: the first low one in form order", () => {
    expect(firstFocus(states({ end: "low", kind: "low" }))).toBe("kind");
  });

  it("a single low location is focused rather than Title", () => {
    expect(firstFocus(states({ location: "low" }))).toBe("location");
  });
});

describe("blankMissing: a missing field is empty, never a guess (AC-2)", () => {
  it.each<[string, Partial<FieldStates>, Partial<EventFormValue>]>([
    ["title", { title: "missing" }, { title: "" }],
    ["kind", { kind: "missing" }, { kindId: null }],
    ["start", { start: "missing" }, { startDate: "", startTime: "" }],
    ["end", { end: "missing" }, { endDate: "", endTime: "" }],
    ["location", { location: "missing" }, { location: "" }],
  ])("a missing %s is empty, everything else kept", (_name, state, blank) => {
    expect(blankMissing(FULL, states(state))).toStrictEqual({
      ...FULL,
      ...blank,
    });
  });

  it("a confident or low field keeps the proposal's value", () => {
    expect(blankMissing(FULL, states())).toStrictEqual(FULL);
    expect(
      blankMissing(FULL, states({ title: "low", start: "low", end: "low" })),
    ).toStrictEqual(FULL);
  });

  it("every field missing: all five empty; All day and Notes are never touched", () => {
    expect(
      blankMissing(
        { ...FULL, allDay: true },
        {
          title: "missing",
          kind: "missing",
          start: "missing",
          end: "missing",
          location: "missing",
        },
      ),
    ).toStrictEqual({
      title: "",
      kindId: null,
      allDay: true,
      startDate: "",
      startTime: "",
      endDate: "",
      endTime: "",
      location: "",
      notes: "Window table",
      repeat: "none",
      repeatEnds: "never",
      repeatUntil: "",
    });
  });
});

describe("saveBlockers and saveDescription: Save waits for Title and Start (AC-6)", () => {
  it("a full value blocks nothing, and has no description", () => {
    expect(saveBlockers(FULL)).toStrictEqual([]);
    expect(saveDescription([], false)).toBeNull();
    expect(saveDescription([], true)).toBeNull();
  });

  it("an empty or blank title blocks", () => {
    expect(saveBlockers({ ...FULL, title: "" })).toStrictEqual(["title"]);
    expect(saveBlockers({ ...FULL, title: "   " })).toStrictEqual(["title"]);
  });

  it("an empty start date blocks, timed or all day", () => {
    expect(saveBlockers({ ...FULL, startDate: "" })).toStrictEqual(["start"]);
    expect(
      saveBlockers({ ...FULL, allDay: true, startDate: "" }),
    ).toStrictEqual(["start"]);
  });

  it("an empty start time blocks a timed value only", () => {
    expect(saveBlockers({ ...FULL, startTime: "" })).toStrictEqual(["start"]);
    expect(
      saveBlockers({ ...FULL, allDay: true, startTime: "" }),
    ).toStrictEqual([]);
  });

  it("both, in form order: title then start", () => {
    expect(
      saveBlockers({ ...FULL, startDate: "", startTime: "", title: "" }),
    ).toStrictEqual(["title", "start"]);
  });

  it("an empty end does not block (PO decision 3), while an empty title beside it does", () => {
    expect(saveBlockers({ ...FULL, endDate: "", endTime: "" })).toStrictEqual(
      [],
    );
    expect(
      saveBlockers({ ...FULL, endDate: "", endTime: "", title: "" }),
    ).toStrictEqual(["title"]);
  });

  it('the description: "Add the title to save." and "Add the title and the start time to save."', () => {
    expect(saveDescription(["title"], false)).toBe("Add the title to save.");
    expect(saveDescription(["title", "start"], false)).toBe(
      "Add the title and the start time to save.",
    );
  });

  it('the start alone, timed and all day: "the start time" / "the start date"', () => {
    expect(saveDescription(["start"], false)).toBe(
      "Add the start time to save.",
    );
    expect(saveDescription(["start"], true)).toBe(
      "Add the start date to save.",
    );
  });
});
