import {
  type FormEvent,
  type JSX,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Link, useLocation, useNavigate } from "react-router";
import type { Proposal } from "../../shared/captureSchema";
import { useBreakpoint } from "../calendar/media";
import { periodOf, periodPath, readView } from "../calendar/period";
import { type CaptureJobsRepo, captureJobs } from "../data/captureJobs";
import type { Kind } from "../data/rows";
import {
  type EventFormValue,
  type FormErrors,
  newEventValue,
  toNewEvent,
  validate,
} from "../domain/eventForm";
import { dayKey } from "../domain/monthGrid";
import { EventForm } from "../events/EventForm";
import { SAVE_FAILED } from "../events/EventSheet";
import { type EventActions, eventActions } from "../sync/eventActions";
import { type KindsStore, useKinds } from "../sync/kindsStore";
import { useMaybeToast } from "../ui/Toast";
import type { CaptureHandoff } from "./captureClient";
import styles from "./ConfirmPage.module.css";

// CAL-020 Contract, Block 4 (components.md "Confirm screen"; voice.md
// "Confirm screen"). The proposal arrives in router state from /capture and
// fills CAL-012's EventForm; nothing is saved until "Save event", and the
// original input is shown on request but never stored (AC-6, AC-7).

const HOUR_MS = 60 * 60 * 1000;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

const localMidnight = (m: RegExpExecArray) =>
  new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

/** A proposal's instant; a date-only string is LOCAL midnight of that date (RED amendment). */
function parseInstant(text: string | null): Date | null {
  if (text === null) return null;
  const dateOnly = DATE_ONLY.exec(text);
  const d = dateOnly === null ? new Date(text) : localMidnight(dateOnly);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** `now` rounded up to the next whole hour. */
function nextWholeHour(now: Date): Date {
  const d = new Date(now);
  d.setMinutes(0, 0, 0);
  if (d.getTime() < now.getTime()) d.setHours(d.getHours() + 1);
  return d;
}

const normal = (name: string) => name.trim().toLowerCase();

/** The live kind whose name matches, after trim and lower-case; else null. */
function kindIdFor(name: string | null, kinds: Kind[]): string | null {
  if (name === null) return null;
  const wanted = normal(name);
  const match = kinds.find(
    (k) => k.deletedAt === null && normal(k.name) === wanted,
  );
  return match?.id ?? null;
}

/** Pure: the form's initial value from a proposal. Exported for its tests. */
export function proposalToFormValue(
  proposal: Proposal,
  kinds: Kind[],
  now: Date,
): EventFormValue {
  const kindId = kindIdFor(proposal.kindName, kinds);
  const start = parseInstant(proposal.startsAt) ?? nextWholeHour(now);
  const proposedEnd = parseInstant(proposal.endsAt);
  const end =
    proposedEnd !== null && proposedEnd.getTime() > start.getTime()
      ? proposedEnd
      : new Date(start.getTime() + HOUR_MS);
  return {
    ...newEventValue(start, end, proposal.allDay, kindId),
    title: proposal.title ?? "",
    location: proposal.location ?? "",
  };
}

type Props = {
  actions?: EventActions;
  jobs?: Pick<CaptureJobsRepo, "setStatus">;
  kinds?: KindsStore;
};

function isHandoff(state: unknown): state is CaptureHandoff {
  return (
    typeof state === "object" &&
    state !== null &&
    "response" in state &&
    "source" in state
  );
}

export function ConfirmPage(props: Props = {}): JSX.Element {
  const { state } = useLocation();
  if (!isHandoff(state)) return <NothingToConfirm />;
  return <ConfirmForm {...props} handoff={state} />;
}

/** A reload or a typed URL: nothing is stored, so there is nothing to show (PO decision 3). */
function NothingToConfirm(): JSX.Element {
  return (
    <div className={styles.page}>
      <h1 tabIndex={-1} className={styles.title}>
        Check the details
      </h1>
      <p role="status" className={styles.empty}>
        Nothing to confirm. Start from <Link to="/capture">Capture</Link>.
      </p>
    </div>
  );
}

function ConfirmForm(props: Props & { handoff: CaptureHandoff }): JSX.Element {
  const { handoff, actions = eventActions, jobs = captureJobs } = props;
  const { proposal, jobId } = handoff.response;
  const { source } = handoff;
  const navigate = useNavigate();
  const toast = useMaybeToast();
  const phone = useBreakpoint() === "phone";
  const kinds = useKinds(props.kinds);
  const ids = useId();
  const titleId = `${ids}-title`;
  const sourceId = `${ids}-source`;
  const root = useRef<HTMLFormElement>(null);
  const [value, setValue] = useState(() =>
    proposalToFormValue(proposal, kinds.kinds, new Date()),
  );
  const [errors, setErrors] = useState<FormErrors>({});
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const busyRef = useRef(false);
  // The kinds usually arrive after the first render: the proposal's kind is
  // looked up once they are ready, unless one has been chosen by then.
  const kindApplied = useRef(kinds.status === "ready");

  useEffect(() => {
    if (kindApplied.current || kinds.status !== "ready") return;
    kindApplied.current = true;
    const kindId = kindIdFor(proposal.kindName, kinds.kinds);
    setValue((v) => (v.kindId === null ? { ...v, kindId } : v));
  }, [kinds, proposal.kindName]);

  const saveBlocked = value.title.trim() === "" || busy;

  const begin = (): boolean => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    return true;
  };
  const end = () => {
    busyRef.current = false;
    setBusy(false);
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
    if (saveBlocked || busyRef.current) return;
    const found = validate(value);
    setErrors(found);
    setFailed(false);
    if (found.title !== undefined || found.end !== undefined) {
      focusField(found);
      return;
    }
    const kindId = value.kindId;
    if (kindId === null) {
      // A kind is required, as in the sheet.
      root.current
        ?.querySelector<HTMLElement>('button[aria-haspopup="listbox"]')
        ?.focus();
      return;
    }
    if (!begin()) return;
    const result = await actions.createEvent({
      ...toNewEvent(value, kindId),
      origin: "capture",
      captureJobId: jobId,
    });
    if (result.status !== "ok") {
      end();
      setFailed(true);
      return;
    }
    // The event is the record that matters; a failed status update is
    // ignored (PO decision 5).
    await jobs.setStatus(jobId, "confirmed");
    const row = result.row;
    const state = { focusEventId: row.id };
    navigate(periodPath(periodOf(readView(), row.startsAt, phone)), { state });
    toast?.showToast({
      text: `Added ${row.title}`,
      action: {
        label: "View",
        onClick: () => navigate(`/day/${dayKey(row.startsAt)}`, { state }),
      },
    });
  };

  const discard = async () => {
    if (!begin()) return;
    await jobs.setStatus(jobId, "discarded");
    navigate("/capture", { replace: true });
  };

  return (
    <div className={styles.page}>
      <h1 tabIndex={-1} className={styles.title}>
        Check the details
      </h1>
      <form
        ref={root}
        noValidate
        className={styles.form}
        onSubmit={(e) => void submit(e)}
      >
        {failed ? (
          <p role="alert" className={styles.alert}>
            {SAVE_FAILED}
          </p>
        ) : null}
        <EventForm
          value={value}
          onChange={setValue}
          errors={errors}
          kinds={kinds.kinds}
          kindRemoved={false}
          titleId={titleId}
        />

        <div className={styles.source}>
          <button
            type="button"
            className={styles.toggle}
            aria-expanded={showSource}
            aria-controls={sourceId}
            onClick={() => setShowSource((shown) => !shown)}
          >
            {showSource ? "Hide what was captured" : "Show what was captured"}
          </button>
          <div id={sourceId} hidden={!showSource} className={styles.original}>
            {source.kind === "text" ? (
              <pre className={styles.text}>{source.text}</pre>
            ) : (
              <img
                alt="The screenshot you captured"
                src={source.dataUrl}
                className={styles.image}
              />
            )}
          </div>
        </div>

        <div className={styles.footer}>
          <button
            type="button"
            className={styles.ghost}
            onClick={() => void discard()}
          >
            Discard
          </button>
          <button
            type="submit"
            className={styles.primary}
            aria-disabled={saveBlocked}
          >
            Save event
          </button>
        </div>
      </form>
    </div>
  );
}
