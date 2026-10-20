import { type JSX, useId } from "react";
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

export function EventForm(props: {
  value: EventFormValue;
  onChange: (value: EventFormValue) => void;
  errors: FormErrors;
  kinds: Kind[];
  kindRemoved: boolean;
  /** The id the Title input carries, so the sheet can focus it. */
  titleId: string;
}): JSX.Element {
  const { value, onChange, errors, kinds, kindRemoved, titleId } = props;
  const ids = useId();
  const titleErrorId = `${ids}-title-error`;
  const endErrorId = `${ids}-end-error`;
  const locationId = `${ids}-location`;
  const notesId = `${ids}-notes`;

  const set = (patch: Partial<EventFormValue>) =>
    onChange({ ...value, ...patch });
  const endInvalid = errors.end === undefined ? undefined : "true";
  const endDescribedBy = errors.end === undefined ? undefined : endErrorId;

  return (
    <div className={styles.form}>
      <div className={styles.field}>
        <label htmlFor={titleId} className={styles.label}>
          Title
        </label>
        <input
          id={titleId}
          type="text"
          className={styles.input}
          maxLength={TITLE_MAX}
          value={value.title}
          aria-invalid={errors.title === undefined ? undefined : "true"}
          aria-describedby={
            errors.title === undefined ? undefined : titleErrorId
          }
          onChange={(e) => set({ title: e.target.value })}
        />
        {errors.title === undefined ? null : (
          <p id={titleErrorId} className={styles.error}>
            {errors.title}
          </p>
        )}
      </div>

      <div className={styles.field}>
        <span className={styles.label}>Kind</span>
        <KindPicker
          kinds={kinds}
          value={value.kindId}
          removed={kindRemoved}
          onChange={(kindId) => set({ kindId })}
        />
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
        <fieldset className={styles.group}>
          <legend className={styles.label}>Starts</legend>
          <div className={styles.pair}>
            <input
              type="date"
              aria-label="Start date"
              className={styles.input}
              value={value.startDate}
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
                onChange={(e) =>
                  onChange(moveStart(value, value.startDate, e.target.value))
                }
              />
            )}
          </div>
        </fieldset>
        <fieldset className={styles.group}>
          <legend className={styles.label}>Ends</legend>
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
          {errors.end === undefined ? null : (
            <p id={endErrorId} className={styles.error}>
              {errors.end}
            </p>
          )}
        </fieldset>
      </div>

      <div className={styles.field}>
        <label htmlFor={locationId} className={styles.label}>
          Location
        </label>
        <input
          id={locationId}
          type="text"
          className={styles.input}
          value={value.location}
          onChange={(e) => set({ location: e.target.value })}
        />
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
