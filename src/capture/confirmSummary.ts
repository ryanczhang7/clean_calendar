import type { CaptureField, CaptureResponse } from "../../shared/captureSchema";
import type { EventFormValue } from "../domain/eventForm";

// CAL-021 Contract, Block 1 (AC-1 to AC-6; components.md "Confirm screen";
// voice.md "Confirm screen"). Pure: the proposal's state per form field, the
// role="status" summary, where focus goes on open, the blanking of missing
// fields, and what still blocks Save.

/** Strictly below is low; 0.8 itself is confident (components.md). */
export const LOW_CONFIDENCE = 0.8;

export type FieldState = "confident" | "low" | "missing";

/** The form's names for the five captured fields, in FORM order. */
export const FORM_FIELDS = [
  "title",
  "kind",
  "start",
  "end",
  "location",
] as const;
export type FormField = (typeof FORM_FIELDS)[number];
export type FieldStates = Record<FormField, FieldState>;

export const LOW_HELPER = "Not sure about this — check it";
export const MISSING_HELPER = "Not found in the text — add it";
export const NOTHING_FOUND =
  "Couldn't find event details. Fill them in, or try a clearer screenshot.";

const CAPTURE_NAME: Record<FormField, CaptureField> = {
  title: "title",
  kind: "kind",
  start: "startsAt",
  end: "endsAt",
  location: "location",
};

/** `missing` is trusted as given; else low iff a confidence is present and below the threshold. */
export function fieldStates(
  response: Pick<CaptureResponse, "confidence" | "missing">,
): FieldStates {
  const stateOf = (field: FormField): FieldState => {
    const name = CAPTURE_NAME[field];
    if (response.missing.includes(name)) return "missing";
    const c = response.confidence[name];
    return c !== undefined && c < LOW_CONFIDENCE ? "low" : "confident";
  };
  return {
    title: stateOf("title"),
    kind: stateOf("kind"),
    start: stateOf("start"),
    end: stateOf("end"),
    location: stateOf("location"),
  };
}

/** The plain name with its article; start and end read "date" when all day. */
function nameOf(field: FormField, allDay: boolean): string {
  switch (field) {
    case "start":
      return allDay ? "the start date" : "the start time";
    case "end":
      return allDay ? "the end date" : "the end time";
    default:
      return `the ${field}`;
  }
}

/** "a", "a and b", "a, b and c". */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

const withState = (states: FieldStates, state: FieldState) =>
  FORM_FIELDS.filter((f) => states[f] === state);

export function summaryText(states: FieldStates, allDay: boolean): string {
  const missing = withState(states, "missing");
  const low = withState(states, "low");
  const found = FORM_FIELDS.length - missing.length;
  if (found === 0) return NOTHING_FOUND;
  const names = (fields: FormField[]) =>
    joinNames(fields.map((f) => nameOf(f, allDay)));
  const count = `Found ${found} of ${FORM_FIELDS.length} details.`;
  if (low.length > 0 && missing.length > 0)
    return `${count} Check ${names(low)} and add ${names(missing)}.`;
  if (low.length > 0) return `${count} Check ${names(low)}.`;
  if (missing.length > 0) return `${count} Add ${names(missing)}.`;
  return count;
}

/** The first missing field in form order, else the first low one, else Title. */
export function firstFocus(states: FieldStates): FormField {
  return (
    withState(states, "missing")[0] ?? withState(states, "low")[0] ?? "title"
  );
}

/** A missing field is empty, never a guess (AC-2); every other field is kept. */
export function blankMissing(
  value: EventFormValue,
  states: FieldStates,
): EventFormValue {
  const blanked = { ...value };
  if (states.title === "missing") blanked.title = "";
  if (states.kind === "missing") blanked.kindId = null;
  if (states.start === "missing")
    Object.assign(blanked, { startDate: "", startTime: "" });
  if (states.end === "missing")
    Object.assign(blanked, { endDate: "", endTime: "" });
  if (states.location === "missing") blanked.location = "";
  return blanked;
}

/** What still blocks Save, in form order: an empty title, an empty start. An empty end does not. */
export function saveBlockers(value: EventFormValue): FormField[] {
  const blockers: FormField[] = [];
  if (value.title.trim() === "") blockers.push("title");
  if (value.startDate === "" || (!value.allDay && value.startTime === ""))
    blockers.push("start");
  return blockers;
}

/** "Add {names} to save.", or null when nothing blocks. */
export function saveDescription(
  blockers: FormField[],
  allDay: boolean,
): string | null {
  if (blockers.length === 0) return null;
  return `Add ${joinNames(blockers.map((f) => nameOf(f, allDay)))} to save.`;
}
