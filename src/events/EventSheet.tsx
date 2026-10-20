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
import type { Event } from "../data/rows";
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
import { type EventActions, eventActions } from "../sync/eventActions";
import type { KindsSnapshot } from "../sync/kindsStore";
import { Dialog } from "../ui/Dialog";
import { EventForm } from "./EventForm";
import styles from "./EventSheet.module.css";

// CAL-012 Contract, Block 5 (components.md "Event sheet"; voice.md;
// accessibility.md). Not a native <dialog>: the docked desktop panel must not
// trap focus, so it is a div with role="dialog" and Escape handled here. The
// nested "Discard changes?" IS the Dialog primitive, which does trap; it is
// rendered as a sibling of the sheet, outside it, so a key pressed in it never
// reaches the sheet's own Escape handler.

export type SheetRequest =
  | {
      mode: "create";
      start: Date;
      end: Date;
      allDay: boolean;
      opener: HTMLElement | null;
    }
  | { mode: "edit"; event: Event; opener: HTMLElement | null };

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
}): JSX.Element | null {
  const { request, kinds, actions = eventActions, onClose, onDelete } = props;
  if (request === null) return null;
  return (
    <OpenSheet
      key={keyOf(request)}
      request={request}
      kinds={kinds}
      actions={actions}
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
  onClose: () => void;
  onDelete: ((event: Event) => void) | undefined;
}): JSX.Element {
  const { kinds, actions, onClose, onDelete } = props;
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
    const target =
      found.title !== undefined
        ? document.getElementById(titleId)
        : root.current?.querySelector<HTMLElement>(
            'input[aria-label="End date"]',
          );
    target?.focus();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving.current) return;
    const found = validate(value);
    setErrors(found);
    setFailed(false);
    if (found.title !== undefined || found.end !== undefined) {
      focusField(found);
      return;
    }
    let kindId: string | null;
    let pending: ReturnType<EventActions["createEvent"]>;
    if (request.mode === "create") {
      kindId = value.kindId;
      // No live kind to choose: nothing can be saved (unreachable after the
      // walkthrough, which seeds the default kinds).
      if (kindId === null) return;
      pending = actions.createEvent(toNewEvent(value, kindId));
    } else {
      const patch = patchOf(request.event, value);
      if (Object.keys(patch).length === 0) {
        onClose();
        return;
      }
      kindId = value.kindId;
      pending = actions.updateEvent(
        request.event.id,
        patch,
        request.event.updatedAt,
      );
    }
    saving.current = true;
    const result = await pending;
    saving.current = false;
    if (result.status !== "ok") {
      setFailed(true);
      return;
    }
    if (kindId !== null) storeLastKind(kindId);
    onClose();
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
    </>
  );
}
