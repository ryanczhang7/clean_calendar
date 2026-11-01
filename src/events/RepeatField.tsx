import { type JSX, useId } from "react";
import {
  type EventFormValue,
  type RepeatFreq,
  repeatHelper,
} from "../domain/eventForm";
import styles from "./EventForm.module.css";

// CAL-024 Contract, Block 2 (components.md "Event sheet", field 7). One
// fieldset "Repeat": the native select, and while the event repeats, the
// helper the select is described by and a nested "Ends" choice, named
// "Repeat ends" because the Starts/Ends fieldset already owns "Ends" (PO
// decision 4). Going back to "Does not repeat" leaves repeatEnds and
// repeatUntil as they are: validate and recurrenceOf ignore them then.

const OPTIONS: readonly (readonly [RepeatFreq, string])[] = [
  ["none", "Does not repeat"],
  ["daily", "Daily"],
  ["weekly", "Weekly"],
  ["yearly", "Yearly"],
];

export function RepeatField(props: {
  value: EventFormValue;
  onChange: (value: EventFormValue) => void;
  /** errors.repeatUntil */
  error: string | undefined;
}): JSX.Element {
  const { value, onChange, error } = props;
  const ids = useId();
  const helperId = `${ids}-helper`;
  const errorId = `${ids}-until-error`;
  const radioName = `${ids}-ends`;
  const set = (patch: Partial<EventFormValue>) =>
    onChange({ ...value, ...patch });
  const repeats = value.repeat !== "none";

  return (
    <fieldset className={styles.group}>
      <legend className={styles.label}>Repeat</legend>
      <select
        aria-label="Repeat"
        className={styles.input}
        value={value.repeat}
        aria-describedby={repeats ? helperId : undefined}
        onChange={(e) => set({ repeat: e.target.value as RepeatFreq })}
      >
        {OPTIONS.map(([freq, text]) => (
          <option key={freq} value={freq}>
            {text}
          </option>
        ))}
      </select>
      {repeats ? (
        <p id={helperId} className={styles.helper}>
          {repeatHelper(value)}
        </p>
      ) : null}
      {repeats ? (
        <fieldset className={styles.group} aria-label="Repeat ends">
          <legend className={styles.label}>Ends</legend>
          <label>
            <input
              type="radio"
              name={radioName}
              value="never"
              checked={value.repeatEnds === "never"}
              onChange={() => set({ repeatEnds: "never" })}
            />{" "}
            Never
          </label>
          <label>
            <input
              type="radio"
              name={radioName}
              value="on"
              checked={value.repeatEnds === "on"}
              onChange={() => set({ repeatEnds: "on" })}
            />{" "}
            On date
          </label>
          {value.repeatEnds === "on" ? (
            <>
              <input
                type="date"
                aria-label="Repeat until"
                className={styles.input}
                value={value.repeatUntil}
                aria-invalid={error === undefined ? undefined : "true"}
                aria-describedby={error === undefined ? undefined : errorId}
                onChange={(e) => set({ repeatUntil: e.target.value })}
              />
              {error === undefined ? null : (
                <p id={errorId} className={styles.error}>
                  {error}
                </p>
              )}
            </>
          ) : null}
        </fieldset>
      ) : null}
    </fieldset>
  );
}
