import { format } from "date-fns";
import {
  type FormEvent,
  type JSX,
  type KeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type { Event, EventPatch } from "../data/rows";
import {
  defaultKindId,
  type EventFormValue,
  type FormErrors,
  newEventValue,
  patchOf,
  readLastKind,
  storeLastKind,
  toNewEvent,
  validate,
  valueFromEvent,
} from "../domain/eventForm";
import { seriesSpan } from "../domain/moveEvent";
import { type EventActions, eventActions } from "../sync/eventActions";
import type { KindsSnapshot } from "../sync/kindsStore";
import {
  type OverrideActions,
  type OverrideFields,
  overrideActions,
} from "../sync/overrideActions";
import { Dialog } from "../ui/Dialog";
import { type EditScope, EditScopeDialog } from "./EditScopeDialog";
import { EventForm } from "./EventForm";
import styles from "./EventSheet.module.css";

// CAL-012 Contract, Block 5 (components.md "Event sheet"; voice.md;
// accessibility.md). Not a native <dialog>: the docked desktop panel must not
// trap focus, so it is a div with role="dialog" and Escape handled here. The
// nested "Discard changes?" IS the Dialog primitive, which does trap; it is
// rendered as a sibling of the sheet, outside it, so a key pressed in it never
// reaches the sheet's own Escape handler.
//
// CAL-025 Contract, Block 4: saving an edit to an OCCURRENCE asks which
// events first, through the edit-scope dialog - rendered as a sibling too.
// "This event only" writes an override of the changed fields; "All events in
// the series" updates the series row, its times moved by the occurrence's
// wall-clock delta (seriesSpan). A repeat-rule change is always the series'
// (PO decision 4).

export type SheetRequest =
  | {
      mode: "create";
      start: Date;
      end: Date;
      allDay: boolean;
      opener: HTMLElement | null;
    }
  | {
      mode: "edit";
      event: Event;
      opener: HTMLElement | null;
      /** The series row when `event` is an occurrence; absent otherwise (Block 6 fills it). */
      series?: Event;
    };

/** The patch's override fields: everything but `recurrence`, verbatim. */
function overrideFieldsOf(patch: EventPatch): OverrideFields {
  const fields: OverrideFields = {};
  if ("title" in patch) fields.title = patch.title;
  if ("kindId" in patch) fields.kindId = patch.kindId;
  if ("startsAt" in patch) fields.startsAt = patch.startsAt;
  if ("endsAt" in patch) fields.endsAt = patch.endsAt;
  if ("allDay" in patch) fields.allDay = patch.allDay;
  if ("location" in patch) fields.location = patch.location;
  if ("notes" in patch) fields.notes = patch.notes;
  return fields;
}

/** The patch for the series row: verbatim, but a time moves by the occurrence's delta. */
function seriesPatchOf(
  series: Event,
  occurrence: Event,
  patch: EventPatch,
): EventPatch {
  if (!("startsAt" in patch) && !("endsAt" in patch)) return patch;
  const span = seriesSpan(series, occurrence, {
    startsAt: patch.startsAt ?? occurrence.startsAt,
    endsAt: patch.endsAt ?? occurrence.endsAt,
  });
  const out: EventPatch = { ...patch };
  if ("startsAt" in patch) out.startsAt = span.startsAt;
  if ("endsAt" in patch) out.endsAt = span.endsAt;
  return out;
}

export const SAVE_FAILED = "Couldn't save. Try again.";

/** One sheet per request: a new request remounts it with a fresh value. */
function keyOf(request: SheetRequest): string {
  return request.mode === "create"
    ? `create:${request.start.getTime()}:${request.end.getTime()}:${request.allDay}`
    : `edit:${request.event.id}:${request.event.updatedAt}`;
}

export function EventSheet(props: {
  /** null → renders nothing. */
  request: SheetRequest | null;
  kinds: KindsSnapshot;
  actions?: EventActions;
  onClose: () => void;
  /** CAL-013 Block 7: edit mode's Delete button; absent → no button. */
  onDelete?: (event: Event) => void;
  /** CAL-025 Block 4: an occurrence's "This event only"; default the app's. */
  overrides?: OverrideActions;
}): JSX.Element | null {
  const {
    request,
    kinds,
    actions = eventActions,
    overrides = overrideActions,
    onClose,
    onDelete,
  } = props;
  if (request === null) return null;
  return (
    <OpenSheet
      key={keyOf(request)}
      request={request}
      kinds={kinds}
      actions={actions}
      overrides={overrides}
      onClose={onClose}
      onDelete={onDelete}
    />
  );
}

function initialOf(
  request: SheetRequest,
  kinds: KindsSnapshot,
): { value: EventFormValue; removed: boolean } {
  if (request.mode === "create") {
    const kindId = defaultKindId(kinds.kinds, readLastKind());
    return {
      value: newEventValue(request.start, request.end, request.allDay, kindId),
      removed: false,
    };
  }
  const kind = kinds.byId(request.event.kindId);
  const removed = kind === undefined || kind.deletedAt !== null;
  const value = valueFromEvent(request.event);
  // A removed kind is shown as "Kind removed" and kept unless a live one is
  // picked: a null kindId never reaches the patch (AC-7).
  return { value: removed ? { ...value, kindId: null } : value, removed };
}

const sameValue = (a: EventFormValue, b: EventFormValue) =>
  (Object.keys(a) as Array<keyof EventFormValue>).every((k) => a[k] === b[k]);

function OpenSheet(props: {
  request: SheetRequest;
  kinds: KindsSnapshot;
  actions: EventActions;
  overrides: OverrideActions;
  onClose: () => void;
  onDelete: ((event: Event) => void) | undefined;
}): JSX.Element {
  const { kinds, actions, overrides, onClose, onDelete } = props;
  // The request this sheet was opened for; a different one remounts it.
  const [request] = useState(props.request);
  const ids = useId();
  const headingId = `${ids}-heading`;
  const titleId = `${ids}-title`;
  const [initial] = useState(() => initialOf(request, kinds));
  const [value, setValue] = useState(initial.value);
  const [errors, setErrors] = useState<FormErrors>({});
  const [failed, setFailed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // CAL-025 Block 4: an occurrence's patch, waiting for the edit-scope answer.
  const [scoping, setScoping] = useState<EventPatch | null>(null);
  const saving = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  const kindRemoved = initial.removed && value.kindId === null;
  const dirty = !sameValue(value, initial.value);

  // Focus on open: Title for a new event, Close for an existing one. On
  // unmount, focus goes back to whatever opened the sheet, if still there.
  useEffect(() => {
    if (request.mode === "create") document.getElementById(titleId)?.focus();
    else closeButton.current?.focus();
    const opener = request.opener;
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, [request, titleId]);

  const requestClose = () => {
    if (dirty) setConfirming(true);
    else onClose();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    event.preventDefault();
    requestClose();
  };

  const focusField = (found: FormErrors) => {
    // Title, else End date, else Repeat until (CAL-024 Block 7).
    const target =
      found.title !== undefined
        ? document.getElementById(titleId)
        : root.current?.querySelector<HTMLElement>(
            found.end !== undefined
              ? 'input[aria-label="End date"]'
              : 'input[aria-label="Repeat until"]',
          );
    target?.focus();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving.current) return;
    const found = validate(value);
    setErrors(found);
    setFailed(false);
    if (Object.keys(found).length > 0) {
      focusField(found);
      return;
    }
    if (request.mode === "create") {
      const kindId = value.kindId;
      // No live kind to choose: nothing can be saved (unreachable after the
      // walkthrough, which seeds the default kinds).
      if (kindId === null) return;
      await commit(() => actions.createEvent(toNewEvent(value, kindId)));
      return;
    }
    const patch = patchOf(request.event, value);
    const keys = Object.keys(patch);
    if (keys.length === 0) {
      onClose();
      return;
    }
    if (request.event.occurrenceDate === undefined) {
      await commit(() =>
        actions.updateEvent(request.event.id, patch, request.event.updatedAt),
      );
      return;
    }
    // CAL-025 Block 4, PO decision 4: the repeat rule alone is the series'.
    if (keys.length === 1 && "recurrence" in patch) {
      await commit(() => writeSeries(patch));
      return;
    }
    setScoping(patch);
  };

  /** One save: a refusal shows SAVE_FAILED; success remembers the kind and closes. */
  const commit = async (write: () => Promise<{ status: string }>) => {
    saving.current = true;
    const result = await write();
    saving.current = false;
    if (result.status !== "ok") {
      setFailed(true);
      return;
    }
    if (value.kindId !== null) storeLastKind(value.kindId);
    onClose();
  };

  // CAL-025 Block 4: an occurrence's writes go to its series row, with the
  // SERIES row's token. An occurrence opened without its series row cannot
  // reach the series: that write is refused as a failed save.
  const writeSeries = (patch: EventPatch): Promise<{ status: string }> => {
    if (request.mode !== "edit" || request.series === undefined) {
      return Promise.resolve({ status: "missing" });
    }
    const { series, event } = request;
    return actions.updateEvent(
      event.id,
      seriesPatchOf(series, event, patch),
      series.updatedAt,
    );
  };

  const confirmScope = async (scope: EditScope) => {
    const patch = scoping;
    setScoping(null);
    if (patch === null || request.mode !== "edit") return;
    const { event } = request;
    const date = event.occurrenceDate;
    if (scope === "series" || date === undefined) {
      await commit(() => writeSeries(patch));
      return;
    }
    await commit(async () => {
      const result = await overrides.setOverride(
        event.id,
        date,
        overrideFieldsOf(patch),
      );
      // PO decision 4: a repeat change rides on the series row as well.
      if (result.status !== "ok" || !("recurrence" in patch)) return result;
      return writeSeries({ recurrence: patch.recurrence });
    });
  };

  const heading =
    request.mode === "create"
      ? "New event"
      : `Edit event: ${request.event.title}`;
  const captured =
    request.mode === "edit" && request.event.origin === "capture"
      ? `Captured from text, ${format(new Date(request.event.createdAt), "d MMM")}`
      : null;

  return (
    <>
      <div
        ref={root}
        role="dialog"
        aria-modal="false"
        aria-labelledby={headingId}
        data-sheet=""
        className={styles.sheet}
        onKeyDown={onKeyDown}
      >
        <header className={styles.header}>
          <button
            ref={closeButton}
            type="button"
            aria-label="Close"
            className={styles.close}
            onClick={requestClose}
          >
            <span aria-hidden="true">×</span>
          </button>
          <div className={styles.heading}>
            <h2 id={headingId} className={styles.title}>
              {heading}
            </h2>
            {captured === null ? null : (
              <p className={styles.captured}>{captured}</p>
            )}
          </div>
          {/* CAL-025 Block 4: an occurrence has Delete too; the page asks which. */}
          {request.mode === "edit" && onDelete !== undefined ? (
            <button
              type="button"
              aria-label={`Delete ${request.event.title}`}
              className={styles.delete}
              onClick={() => {
                // Deleting discards any edit, so nothing is asked (Block 7).
                onDelete(request.event);
                onClose();
              }}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
              </svg>
            </button>
          ) : null}
        </header>
        <form
          noValidate
          className={styles.form}
          onSubmit={(e) => void submit(e)}
        >
          {failed ? (
            <p role="alert" className={styles.alert}>
              {SAVE_FAILED}
            </p>
          ) : null}
          <div className={styles.body}>
            <EventForm
              value={value}
              onChange={setValue}
              errors={errors}
              kinds={kinds.kinds}
              kindRemoved={kindRemoved}
              titleId={titleId}
            />
          </div>
          <footer className={styles.footer}>
            <button
              type="button"
              className={styles.button}
              onClick={requestClose}
            >
              Cancel
            </button>
            <button type="submit" className={styles.primary}>
              Save
            </button>
          </footer>
        </form>
      </div>
      {confirming ? (
        <Dialog
          open
          title="Discard changes?"
          onClose={() => setConfirming(false)}
          actions={
            <>
              <button
                type="button"
                className={styles.button}
                onClick={() => setConfirming(false)}
              >
                Keep editing
              </button>
              <button
                type="button"
                data-variant="danger"
                className={styles.danger}
                onClick={onClose}
              >
                Discard
              </button>
            </>
          }
        >
          <p>You've edited this event.</p>
        </Dialog>
      ) : null}
      <EditScopeDialog
        open={scoping !== null}
        kind="change"
        moving={
          scoping !== null && ("startsAt" in scoping || "endsAt" in scoping)
        }
        onCancel={() => setScoping(null)}
        onConfirm={(scope) => void confirmScope(scope)}
      />
    </>
  );
}
