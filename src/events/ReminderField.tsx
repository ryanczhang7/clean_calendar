import { type JSX, useId } from "react";
import {
  REMINDER_OPTIONS,
  type ReminderChoice,
  reminderHelper,
} from "../domain/reminder";
import styles from "./EventForm.module.css";

// CAL-057 Contract, Block 2 (components.md "Event sheet", field 8). Mirrors
// RepeatField: a visible label and a native select named "Reminder". An
// all-day event's "At time" carries a helper the select is described by.

export function ReminderField(props: {
  choice: ReminderChoice;
  allDay: boolean;
  onChange: (choice: ReminderChoice) => void;
}): JSX.Element {
  const { choice, allDay, onChange } = props;
  const ids = useId();
  const selectId = `${ids}-select`;
  const helperId = `${ids}-helper`;
  const helper = reminderHelper(choice, allDay);

  return (
    <div className={styles.field}>
      <label htmlFor={selectId} className={styles.label}>
        Reminder
      </label>
      <select
        id={selectId}
        className={styles.input}
        value={choice}
        aria-describedby={helper === null ? undefined : helperId}
        onChange={(e) => onChange(e.target.value as ReminderChoice)}
      >
        {REMINDER_OPTIONS.map((o) => (
          <option key={o.choice} value={o.choice}>
            {o.label}
          </option>
        ))}
      </select>
      {helper === null ? null : (
        <p id={helperId} className={styles.helper}>
          {helper}
        </p>
      )}
    </div>
  );
}
