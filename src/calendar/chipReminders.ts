import { createContext } from "react";

// CAL-057 Contract, Block 5: event id -> its live reminder template's
// minutesBefore, provided by CalendarPage around the views and read by each
// EventChip with `event.id` (an occurrence carries its series' id). The empty
// default means a chip rendered without a provider has no reminder.

export const ChipRemindersContext = createContext<ReadonlyMap<string, number>>(
  new Map(),
);
