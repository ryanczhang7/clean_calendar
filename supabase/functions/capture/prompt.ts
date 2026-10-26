// The capture prompts (CAL-018 Contract Block 3, CAL-019 Block 3). Each
// carries every live kind name verbatim; the wording is ours to change. The
// text prompt carries the shared text between delimiters; the image prompt
// carries no user text at all, because the message is the attached image.

/** The rules both prompts share. */
function rules(kindNames: readonly string[]): string[] {
  const kinds = kindNames.length === 0
    ? "The owner has no event kinds, so kindName must be null."
    : [
      "kindName must be exactly one of these event kinds, or null if none fits:",
      ...kindNames.map((name) => `- ${name}`),
    ].join("\n");
  return [
    "Rules:",
    "- Today's date is not known to you. Do not guess a year, month or day the message does not state or imply.",
    "- Return null for any field the message does not state. Never invent a value.",
    "- startsAt and endsAt are ISO-8601 date-times as written or implied by the message, without inventing a time zone; for an all-day event use the date only and set allDay to true.",
    `- ${kinds}`,
    "- confidence rates each field you filled from 0 to 1, keyed by title, startsAt, endsAt, location and kind.",
    "- missing lists every one of title, startsAt, endsAt, location and kind that you could not find.",
  ];
}

export function buildPrompt(
  text: string,
  kindNames: readonly string[],
): string {
  return [
    "Extract one calendar event from the message below, which the calendar's owner shared from another app (often a booking or confirmation e-mail).",
    "",
    ...rules(kindNames),
    "",
    "Message:",
    "<<<",
    text,
    ">>>",
  ].join("\n");
}

export function buildImagePrompt(kindNames: readonly string[]): string {
  return [
    "Extract one calendar event from the attached image, which the calendar's owner shared from another app. The image is the message: most often a screenshot of a booking or confirmation e-mail. Read the event from what the image shows.",
    "",
    ...rules(kindNames),
    "",
    "Message: the attached image.",
  ].join("\n");
}
