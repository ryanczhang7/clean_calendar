// The capture prompt (CAL-018 Contract Block 3). It carries the shared text
// and every live kind name verbatim; the wording is ours to change.

export function buildPrompt(
  text: string,
  kindNames: readonly string[],
): string {
  const kinds = kindNames.length === 0
    ? "The owner has no event kinds, so kindName must be null."
    : [
      "kindName must be exactly one of these event kinds, or null if none fits:",
      ...kindNames.map((name) => `- ${name}`),
    ].join("\n");
  return [
    "Extract one calendar event from the message below, which the calendar's owner shared from another app (often a booking or confirmation e-mail).",
    "",
    "Rules:",
    "- Today's date is not known to you. Do not guess a year, month or day the message does not state or imply.",
    "- Return null for any field the message does not state. Never invent a value.",
    "- startsAt and endsAt are ISO-8601 date-times as written or implied by the message, without inventing a time zone; for an all-day event use the date only and set allDay to true.",
    `- ${kinds}`,
    "- confidence rates each field you filled from 0 to 1, keyed by title, startsAt, endsAt, location and kind.",
    "- missing lists every one of title, startsAt, endsAt, location and kind that you could not find.",
    "",
    "Message:",
    "<<<",
    text,
    ">>>",
  ].join("\n");
}
