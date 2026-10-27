import { type JSX, useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  type CaptureHandoff,
  type CaptureInput,
  type CaptureSource,
  proposeEvent,
} from "./captureClient";
import styles from "./CapturePage.module.css";
import { downscaleImage } from "./downscale";

// CAL-020 Contract, Block 3 (components.md "Capture screen"; voice.md
// "Capture screen"). A paste box and a screenshot picker; "Propose event"
// sends one of them to the capture function and hands the reply to
// /capture/confirm in router state. Nothing is stored (PO decision 3).

export const WORKING = "Asking the assistant… usually takes a few seconds.";
export const OFFLINE =
  "Capture needs a connection. Your other changes are saved and will sync.";
export const COULDNT_READ = "Couldn't read that. Try pasting the text instead.";
export const TOO_LARGE =
  "That screenshot is too large, even after shrinking it. Try cropping it.";
export const ONLY_IMAGE = "Only the screenshot will be sent.";

type Picked = { file: File; preview: string | null };
type Attempt = { text: string; file: File | null };
type Failure = "read" | "too_large";

function useOnline(): [boolean, (online: boolean) => void] {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return [online, setOnline];
}

/** The picked file as a data URL, for the thumbnail. */
function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function CapturePage(
  props: {
    propose?: typeof proposeEvent;
    downscale?: typeof downscaleImage;
  } = {},
): JSX.Element {
  const { propose = proposeEvent, downscale = downscaleImage } = props;
  const navigate = useNavigate();
  const ids = useId();
  const textId = `${ids}-text`;
  const [text, setText] = useState("");
  const [image, setImage] = useState<Picked | null>(null);
  const [online, setOnline] = useOnline();
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const textBox = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  // Each request's number; Cancel moves it on, so a late reply is ignored.
  const runs = useRef(0);
  const lastAttempt = useRef<Attempt>({ text: "", file: null });

  useEffect(
    () => () => {
      runs.current += 1;
    },
    [],
  );

  const hasContent = text.trim() !== "" || image !== null;
  const blocked = !hasContent || !online || working;

  const run = async (attempt: Attempt) => {
    runs.current += 1;
    const token = runs.current;
    const cancelled = () => token !== runs.current;
    lastAttempt.current = attempt;
    setFailure(null);
    setWorking(true);

    let input: CaptureInput;
    let source: CaptureSource;
    if (attempt.file !== null) {
      const shrunk = await downscale(attempt.file);
      if (cancelled()) return;
      if (shrunk.status !== "ok") {
        setWorking(false);
        setFailure(shrunk.status === "too_large" ? "too_large" : "read");
        return;
      }
      const { base64, mime, dataUrl } = shrunk.image;
      input = { image: base64, mime };
      source = { kind: "image", dataUrl, mime };
    } else {
      input = { text: attempt.text };
      source = { kind: "text", text: attempt.text };
    }

    const outcome = await propose(input);
    if (token !== runs.current) return;
    setWorking(false);
    if (outcome.status === "ok") {
      const handoff: CaptureHandoff = { response: outcome.response, source };
      navigate("/capture/confirm", { state: handoff });
    } else if (outcome.status === "offline") {
      setOnline(false);
    } else {
      setFailure("read");
    }
  };

  const onPropose = () => {
    if (blocked) return;
    void run({ text, file: image?.file ?? null });
  };

  const onCancel = () => {
    runs.current += 1;
    setWorking(false);
  };

  const onPaste = async () => {
    // Read at click time: the clipboard may be replaced after mount.
    const clipboard = navigator.clipboard as Clipboard | undefined;
    if (clipboard?.readText === undefined) {
      textBox.current?.focus();
      return;
    }
    try {
      const pasted = await clipboard.readText();
      setText((current) => current + pasted);
    } catch {
      textBox.current?.focus();
    }
  };

  const pick = (file: File) => {
    setImage({ file, preview: null });
    readDataUrl(file).then(
      (preview) =>
        setImage((current) =>
          current?.file === file ? { file, preview } : current,
        ),
      () => {
        // No thumbnail; the file is still sent.
      },
    );
  };

  const onRemove = () => {
    setImage(null);
    if (fileInput.current !== null) fileInput.current.value = "";
  };

  const showNote = text.trim() !== "" && image !== null;

  return (
    <div className={styles.page}>
      <h1 tabIndex={-1} className={styles.title}>
        Capture
      </h1>

      <div className={styles.field}>
        <div className={styles.labelRow}>
          <label htmlFor={textId} className={styles.label}>
            Booking email or text
          </label>
          <button
            type="button"
            className={styles.ghost}
            disabled={working}
            onClick={() => void onPaste()}
          >
            Paste
          </button>
        </div>
        <textarea
          id={textId}
          ref={textBox}
          rows={8}
          className={styles.textarea}
          placeholder="Paste the confirmation email, or any text with a date in it."
          value={text}
          readOnly={working}
          onChange={(e) => setText(e.target.value)}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.drop}>
          Choose a screenshot
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className={styles.hidden}
            disabled={working}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file !== undefined) pick(file);
            }}
          />
        </label>
        {image === null ? null : (
          <div className={styles.picked}>
            {image.preview === null ? null : (
              <img
                alt="Screenshot preview"
                height={96}
                src={image.preview}
                className={styles.thumb}
              />
            )}
            <button
              type="button"
              className={styles.ghost}
              disabled={working}
              onClick={onRemove}
            >
              Remove screenshot
            </button>
          </div>
        )}
      </div>

      {showNote ? <p className={styles.note}>{ONLY_IMAGE}</p> : null}
      {online ? null : <p className={styles.note}>{OFFLINE}</p>}

      {failure === null ? null : (
        <div role="alert" className={styles.alert}>
          <p className={styles.alertText}>
            {failure === "too_large" ? TOO_LARGE : COULDNT_READ}
          </p>
          <button
            type="button"
            className={styles.ghost}
            onClick={() => void run(lastAttempt.current)}
          >
            Retry
          </button>
        </div>
      )}

      {working ? (
        <div className={styles.working}>
          <p role="status" className={styles.status}>
            {WORKING}
          </p>
          <button type="button" className={styles.ghost} onClick={onCancel}>
            Cancel
          </button>
        </div>
      ) : null}

      <div className={styles.footer}>
        <button
          type="button"
          className={styles.primary}
          aria-disabled={blocked}
          aria-busy={working ? true : undefined}
          onClick={onPropose}
        >
          Propose event
        </button>
      </div>
    </div>
  );
}
