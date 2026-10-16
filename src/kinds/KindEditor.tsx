import {
  type CSSProperties,
  type FormEvent,
  type JSX,
  useId,
  useRef,
  useState,
} from "react";
import type { Kind, KindPatch, NewKind } from "../data/rows";
import {
  chipText,
  contrast,
  darkCounterpart,
  nearestPassing,
  SURFACE_DARK,
  SURFACE_FLOOR,
  SURFACE_LIGHT,
  TEXT_FLOOR,
} from "../domain/colour";
import { type KindActions, kindActions } from "../sync/kindActions";
import { Dialog } from "../ui/Dialog";
import { useToast } from "../ui/Toast";
import { DEFAULT_KINDS } from "./defaultKinds";
import styles from "./KindEditor.module.css";

// CAL-007, Contract Block 5 (as amended in RED): the kind editor, used by the
// walkthrough here and by the kinds page in CAL-008. Contrast is checked as
// the colour changes (Save disabled below TEXT_FLOOR); name uniqueness only
// on submit (PO decision 4). Writes go through KindActions.

type Theme = "light" | "dark";
/** One theme's colour as typed, and whether its group is in custom mode. */
type Side = { hex: string; custom: boolean };

const HEX = /^#[0-9A-Fa-f]{6}$/;
const SURFACE: Record<Theme, string> = {
  light: SURFACE_LIGHT,
  dark: SURFACE_DARK,
};
const LABEL: Record<Theme, string> = { light: "Light", dark: "Dark" };

const isHex = (hex: string) => HEX.test(hex);
const paletteHex = (entry: NewKind, theme: Theme) =>
  theme === "light" ? entry.colorLight : entry.colorDark;

/** The palette entry whose colour for `theme` is `hex`, ignoring case. */
function paletteMatch(theme: Theme, hex: string): NewKind | undefined {
  const wanted = hex.toUpperCase();
  return DEFAULT_KINDS.find((e) => paletteHex(e, theme) === wanted);
}

function sideOf(theme: Theme, hex: string): Side {
  return { hex, custom: paletteMatch(theme, hex) === undefined };
}

/** Same name for uniqueness: trimmed, ignoring case (AC-2). */
function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** "Add kind": the first palette pair no live kind uses, else the first. */
function unusedPair(live: Kind[]): NewKind {
  const used = new Set(live.map((k) => k.colorLight.toUpperCase()));
  return (
    DEFAULT_KINDS.find((e) => !used.has(e.colorLight)) ??
    (DEFAULT_KINDS[0] as NewKind)
  );
}

function ColourGroup(props: {
  theme: Theme;
  side: Side;
  onPick: (entry: NewKind) => void;
  onCustom: () => void;
  onHex: (hex: string) => void;
}): JSX.Element {
  const { theme, side, onPick, onCustom, onHex } = props;
  const hexId = useId();
  const errorId = useId();
  const labelId = useId();
  const match = side.custom ? undefined : paletteMatch(theme, side.hex);
  const custom = match === undefined;
  const invalid = !isHex(side.hex);
  const name = `${LABEL[theme]} theme colour`;
  return (
    <div role="radiogroup" aria-labelledby={labelId} className={styles.group}>
      <span id={labelId} className={styles.legend}>
        {name}
      </span>
      <div className={styles.swatches}>
        {DEFAULT_KINDS.map((entry) => (
          // biome-ignore lint/a11y/useSemanticElements: Block 5 pins role="radio" buttons with aria-checked; a native radio cannot show Custom… as checked while its hex matches a palette entry (the custom mode)
          <button
            key={entry.name}
            type="button"
            role="radio"
            aria-checked={entry === match}
            aria-label={entry.name}
            className={styles.swatch}
            style={{ "--swatch": paletteHex(entry, theme) } as CSSProperties}
            onClick={() => onPick(entry)}
          />
        ))}
        {/* biome-ignore lint/a11y/useSemanticElements: as above */}
        <button
          type="button"
          role="radio"
          aria-checked={custom}
          className={styles.customRadio}
          onClick={onCustom}
        >
          Custom…
        </button>
      </div>
      {custom ? (
        <div className={styles.custom}>
          <label htmlFor={hexId}>Hex</label>
          <input
            id={hexId}
            type="text"
            className={styles.hex}
            value={side.hex}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={invalid ? true : undefined}
            aria-describedby={invalid ? errorId : undefined}
            onChange={(e) => onHex(e.target.value)}
          />
          <input
            type="color"
            aria-label="Pick a colour"
            className={styles.picker}
            value={invalid ? "#000000" : side.hex.toLowerCase()}
            onChange={(e) => onHex(e.target.value.toUpperCase())}
          />
          {invalid ? (
            <p id={errorId} className={styles.error}>
              Enter a colour like #BD8200.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ColourPreview(props: {
  theme: Theme;
  hex: string;
  onFix: (hex: string) => void;
}): JSX.Element {
  const { theme, hex, onFix } = props;
  if (!isHex(hex)) {
    return <p data-preview={theme} className={styles.readout} />;
  }
  const text = chipText(hex);
  const surface = contrast(hex, SURFACE[theme]);
  const fix = text.ratio < TEXT_FLOOR ? nearestPassing(hex) : null;
  return (
    <div className={styles.preview}>
      <div
        className={styles.surface}
        style={{ background: SURFACE[theme] }}
        aria-hidden="true"
      >
        <span
          className={styles.chip}
          style={{ background: hex, color: text.text }}
        >
          Aa
        </span>
      </div>
      <p data-preview={theme} className={styles.readout}>
        {`Text contrast ${text.ratio.toFixed(2)}:1 · Against background ${surface.toFixed(2)}:1`}
      </p>
      {fix !== null ? (
        <div className={styles.refusal}>
          <p className={styles.error}>
            {`Text would be hard to read. Try a ${fix.direction} shade.`}
          </p>
          <button
            type="button"
            aria-label={`Fix the ${theme} colour`}
            className={styles.fix}
            onClick={() => onFix(fix.hex)}
          >
            Fix it
          </button>
        </div>
      ) : surface < SURFACE_FLOOR ? (
        <p className={styles.warning}>Low contrast against the background.</p>
      ) : null}
    </div>
  );
}

type EditorProps = {
  open: boolean;
  kind: Kind | null;
  kinds: Kind[];
  onClose: () => void;
  actions?: KindActions;
};

function Editor(props: EditorProps): JSX.Element {
  const { open, kind, onClose, actions = kindActions } = props;
  const { showToast } = useToast();
  const live = props.kinds.filter((k) => k.deletedAt === null);
  const formId = useId();
  const nameId = useId();
  const nameErrorId = useId();
  const nameRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(kind?.name ?? "");
  const [light, setLight] = useState<Side>(() =>
    sideOf("light", kind?.colorLight ?? unusedPair(live).colorLight),
  );
  const [dark, setDark] = useState<Side>(() =>
    sideOf("dark", kind?.colorDark ?? unusedPair(live).colorDark),
  );
  // The dark side follows the light one until it is edited by hand.
  const [darkTouched, setDarkTouched] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const trimmed = name.trim();
  const readable = (hex: string) =>
    isHex(hex) && chipText(hex).ratio >= TEXT_FLOOR;
  const saveDisabled =
    trimmed === "" || !readable(light.hex) || !readable(dark.hex);

  const proposeDark = (hex: string) => {
    if (!darkTouched) setDark(sideOf("dark", hex));
  };
  const pick = (theme: Theme, entry: NewKind) => {
    if (theme === "light") {
      setLight({ hex: entry.colorLight, custom: false });
      proposeDark(entry.colorDark);
    } else {
      setDark({ hex: entry.colorDark, custom: false });
      setDarkTouched(true);
    }
  };
  const chooseCustom = (theme: Theme) => {
    if (theme === "light") {
      setLight({ ...light, custom: true });
    } else {
      setDark({ ...dark, custom: true });
      setDarkTouched(true);
    }
  };
  const editHex = (theme: Theme, hex: string) => {
    if (theme === "light") {
      setLight({ hex, custom: true });
      if (isHex(hex)) proposeDark(darkCounterpart(hex.toUpperCase()));
    } else {
      setDark({ hex, custom: true });
      setDarkTouched(true);
    }
  };

  const save = async () => {
    const clash = live.find(
      (k) => k.id !== kind?.id && sameName(k.name, trimmed),
    );
    if (clash !== undefined) {
      setNameError(`You already have a kind called ${clash.name}.`);
      nameRef.current?.focus();
      return;
    }
    const colorLight = light.hex.toUpperCase();
    const colorDark = dark.hex.toUpperCase();
    setBusy(true);
    setFailed(false);
    let result: Awaited<ReturnType<KindActions["addKind"]>>;
    if (kind === null) {
      const last = Math.max(0, ...live.map((k) => k.sortOrder));
      result = await actions.addKind({
        name: trimmed,
        colorLight,
        colorDark,
        sortOrder: last + 1,
        isDefault: false,
      });
    } else {
      // Only what changed; an unchanged kind still saves an empty patch.
      const patch: KindPatch = {};
      if (trimmed !== kind.name) patch.name = trimmed;
      if (colorLight !== kind.colorLight.toUpperCase()) {
        patch.colorLight = colorLight;
      }
      if (colorDark !== kind.colorDark.toUpperCase()) {
        patch.colorDark = colorDark;
      }
      result = await actions.updateKind(kind, patch);
    }
    setBusy(false);
    // Every other status, conflict included, is the alert strip: v1 has
    // no merge UI.
    if (result.status === "ok") onClose();
    else setFailed(true);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || saveDisabled) return;
    void save();
  };

  const remove = async () => {
    if (kind === null) return;
    const result = await actions.deleteKind(kind);
    setConfirming(false);
    if (result.status === "ok") {
      onClose();
      showToast({
        text: `Deleted the kind ${kind.name}. Its events now show as Kind removed.`,
      });
    } else {
      setFailed(true);
    }
  };

  return (
    <>
      <Dialog
        open={open}
        title={kind === null ? "Add kind" : `Edit ${kind.name}`}
        onClose={onClose}
        actions={
          <>
            {kind !== null ? (
              <button
                type="button"
                data-variant="danger"
                aria-label={`Delete ${kind.name}`}
                className={styles.danger}
                onClick={() => setConfirming(true)}
              >
                {`Delete ${kind.name}`}
              </button>
            ) : null}
            <button type="button" className={styles.button} onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              form={formId}
              className={styles.primary}
              disabled={saveDisabled}
              aria-busy={busy ? true : undefined}
            >
              Save
            </button>
          </>
        }
      >
        <form id={formId} noValidate onSubmit={handleSubmit}>
          {failed ? (
            <div role="alert" className={styles.alert}>
              {"Couldn't save. Try again."}
            </div>
          ) : null}
          <div className={styles.field}>
            <label htmlFor={nameId}>Name</label>
            <input
              ref={nameRef}
              id={nameId}
              type="text"
              className={styles.input}
              maxLength={32}
              autoComplete="off"
              value={name}
              aria-invalid={nameError !== null ? true : undefined}
              aria-describedby={nameError !== null ? nameErrorId : undefined}
              onChange={(e) => {
                setName(e.target.value);
                setNameError(null);
              }}
            />
            {nameError !== null ? (
              <p id={nameErrorId} className={styles.error}>
                {nameError}
              </p>
            ) : null}
          </div>
          {(["light", "dark"] as const).map((theme) => {
            const side = theme === "light" ? light : dark;
            return (
              <div key={theme} className={styles.theme}>
                <ColourGroup
                  theme={theme}
                  side={side}
                  onPick={(entry) => pick(theme, entry)}
                  onCustom={() => chooseCustom(theme)}
                  onHex={(hex) => editHex(theme, hex)}
                />
                <ColourPreview
                  theme={theme}
                  hex={side.hex}
                  onFix={(hex) => editHex(theme, hex)}
                />
              </div>
            );
          })}
        </form>
      </Dialog>
      {confirming && kind !== null ? (
        <Dialog
          open
          title={`Delete the kind ${kind.name}?`}
          onClose={() => setConfirming(false)}
          actions={
            <>
              <button
                type="button"
                className={styles.button}
                onClick={() => setConfirming(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                data-variant="danger"
                className={styles.dangerFilled}
                onClick={() => void remove()}
              >
                Delete
              </button>
            </>
          }
        >
          <p>
            Its events keep their details and show as Kind removed. You can't
            undo this.
          </p>
        </Dialog>
      ) : null}
    </>
  );
}

export function KindEditor(props: EditorProps): JSX.Element {
  // A fresh editor per opening, so nothing typed survives a Cancel.
  const key = props.open ? (props.kind?.id ?? "new") : "closed";
  return <Editor key={key} {...props} />;
}
