import { type JSX, useId } from "react";
import {
  type FieldState,
  type FormField,
  LOW_HELPER,
  MISSING_HELPER,
} from "../capture/confirmSummary";
import type { Kind } from "../data/rows";
import {
  type EventFormValue,
  type FormErrors,
  moveStart,
  setAllDay,
  TITLE_MAX,
} from "../domain/eventForm";
import styles from "./EventForm.module.css";
import { KindPicker } from "./KindPicker";

// CAL-012 Contract, Block 4 (components.md "Event sheet", fields in order).
// Controlled, with no <form> of its own: the sheet owns submit, and the
// capture confirm screen (CAL-020) renders the same fields. A change to the
// start goes through moveStart, so the end keeps the duration (AC-3); the
// time inputs are not rendered while All day is on.
//
// CAL-021 Contract, Block 2 (components.md "Confirm screen"): a field whose
// state is "low" or "missing" carries data-state on its wrapper, a warning
// glyph in its label and a helper every input of the field is described by.
// A state is a warning, never an error: it does not set aria-invalid. With
// no `fieldStates` (the sheet) the markup is what it always was.

type Marked = Exclude<FieldState, "confident">;

/** A 16px triangle-bang; aria-hidden, because the helper carries the meaning. */
function WarningGlyph(): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      data-glyph="warning"
      className={styles.glyph}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      focusable="false"
    >
      <path d="M8 1.5 15 14.5H1Z" fill="currentColor" />
      <path
        d="M8 6v4M8 11.75v.5"
        stroke="var(--color-surface)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** The ids, space-joined; undefined when there are none. */
function joinIds(...list: (string | undefined)[]): string | undefined {
  const present = list.filter((id) => id !== undefined);
  return present.length === 0 ? undefined : present.join(" ");
}

export function EventForm(props: {
  value: EventFormValue;
  onChange: (value: EventFormValue) => void;
  errors: FormErrors;
  kinds: Kind[];
  kindRemoved: boolean;
  /** The id the Title input carries, so the sheet can focus it. */
  titleId: string;
  /** The confirm screen's per-field state (CAL-021); absent, every field is confident. */
  fieldStates?: Partial<Record<FormField, FieldState>>;
}): JSX.Element {
  const { value, onChange, errors, kinds, kindRemoved, titleId, fieldStates } =
    props;
  const ids = useId();
  const titleErrorId = `${ids}-title-error`;
  const endErrorId = `${ids}-end-error`;
  const locationId = `${ids}-location`;
  const notesId = `${ids}-notes`;

  const set = (patch: Partial<EventFormValue>) =>
    onChange({ ...value, ...patch });

  const stateOf = (field: FormField): Marked | undefined => {
    const state = fieldStates?.[field];
    return state === "low" || state === "missing" ? state : undefined;
  };
  const helperIdOf = (field: FormField) =>
    stateOf(field) === undefined ? undefined : `${ids}-${field}-state`;
  const glyph = (field: FormField) =>
    stateOf(field) === undefined ? null : <WarningGlyph />;
  const helper = (field: FormField) => {
    const state = stateOf(field);
    if (state === undefined) return null;
    return (
      <p id={helperIdOf(field)} className={styles.helper}>
        {state === "low" ? LOW_HELPER : MISSING_HELPER}
      </p>
    );
  };

  const titleDescribedBy = joinIds(
    helperIdOf("title"),
    errors.title === undefined ? undefined : titleErrorId,
  );
  const startDescribedBy = helperIdOf("start");
  const endInvalid = errors.end === undefined ? undefined : "true";
  const endDescribedBy = joinIds(
    helperIdOf("end"),
    errors.end === undefined ? undefined : endErrorId,
  );

  return (
    <div className={styles.form}>
      <div className={styles.field} data-state={stateOf("title")}>
        <label htmlFor={titleId} className={styles.label}>
          Title
          {glyph("title")}
        </label>
        <input
          id={titleId}
          type="text"
          className={styles.input}
          maxLength={TITLE_MAX}
          value={value.title}
          aria-invalid={errors.title === undefined ? undefined : "true"}
          aria-describedby={titleDescribedBy}
          onChange={(e) => set({ title: e.target.value })}
        />
        {helper("title")}
        {errors.title === undefined ? null : (
          <p id={titleErrorId} className={styles.error}>
            {errors.title}
          </p>
        )}
      </div>

      <div className={styles.field} data-state={stateOf("kind")}>
        <span className={styles.label}>
          Kind
          {glyph("kind")}
        </span>
        <KindPicker
          kinds={kinds}
          value={value.kindId}
          removed={kindRemoved}
          onChange={(kindId) => set({ kindId })}
          describedBy={helperIdOf("kind")}
        />
        {helper("kind")}
      </div>

      <div className={styles.field}>
        <button
          type="button"
          role="switch"
          aria-checked={value.allDay}
          className={styles.switch}
          onClick={() => onChange(setAllDay(value, !value.allDay))}
        >
          <span className={styles.switchLabel}>All day</span>
          <span aria-hidden="true" className={styles.track}>
            <span className={styles.thumb} />
          </span>
        </button>
      </div>

      <div className={styles.when}>
        <fieldset className={styles.group} data-state={stateOf("start")}>
          <legend className={styles.label}>
            Starts
            {glyph("start")}
          </legend>
          <div className={styles.pair}>
            <input
              type="date"
              aria-label="Start date"
              className={styles.input}
              value={value.startDate}
              aria-describedby={startDescribedBy}
              onChange={(e) =>
                onChange(moveStart(value, e.target.value, value.startTime))
              }
            />
            {value.allDay ? null : (
              <input
                type="time"
                step={900}
                aria-label="Start time"
                className={styles.input}
                value={value.startTime}
                aria-describedby={startDescribedBy}
                onChange={(e) =>
                  onChange(moveStart(value, value.startDate, e.target.value))
                }
              />
            )}
          </div>
          {helper("start")}
        </fieldset>
        <fieldset className={styles.group} data-state={stateOf("end")}>
          <legend className={styles.label}>
            Ends
            {glyph("end")}
          </legend>
          <div className={styles.pair}>
            <input
              type="date"
              aria-label="End date"
              className={styles.input}
              value={value.endDate}
              aria-invalid={endInvalid}
              aria-describedby={endDescribedBy}
              onChange={(e) => set({ endDate: e.target.value })}
            />
            {value.allDay ? null : (
              <input
                type="time"
                step={900}
                aria-label="End time"
                className={styles.input}
                value={value.endTime}
                aria-invalid={endInvalid}
                aria-describedby={endDescribedBy}
                onChange={(e) => set({ endTime: e.target.value })}
              />
            )}
          </div>
          {helper("end")}
          {errors.end === undefined ? null : (
            <p id={endErrorId} className={styles.error}>
              {errors.end}
            </p>
          )}
        </fieldset>
      </div>

      <div className={styles.field} data-state={stateOf("location")}>
        <label htmlFor={locationId} className={styles.label}>
          Location
          {glyph("location")}
        </label>
        <input
          id={locationId}
          type="text"
          className={styles.input}
          value={value.location}
          aria-describedby={helperIdOf("location")}
          onChange={(e) => set({ location: e.target.value })}
        />
        {helper("location")}
      </div>

      <div className={styles.field}>
        <label htmlFor={notesId} className={styles.label}>
          Notes
        </label>
        <textarea
          id={notesId}
          className={styles.textarea}
          rows={4}
          value={value.notes}
          onChange={(e) => set({ notes: e.target.value })}
        />
      </div>
    </div>
  );
}
