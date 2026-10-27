import {
  type JSX,
  type KeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Link } from "react-router";
import type { Kind } from "../data/rows";
import { KindSwatch } from "../kinds/KindList";
import styles from "./KindPicker.module.css";

// CAL-012 Contract, Block 3 (components.md "Kind picker"; voice.md "Kind
// removed"). A trigger button and, while open, a sibling listbox. Keyboard:
// the listbox takes focus when it opens and marks the active option with
// aria-activedescendant (the ARIA listbox pattern), so Enter and Space land
// on the listbox and never reach the trigger's own click.

export const KIND_REMOVED = "Kind removed";

export function KindPicker(props: {
  /** Live kinds, store order. */
  kinds: Kind[];
  /** The chosen kind's id; null with `removed` means "Kind removed". */
  value: string | null;
  /** The existing event's kind is soft-deleted or unknown (AC-7). */
  removed: boolean;
  onChange: (kindId: string) => void;
  /** An id list for the trigger's aria-describedby (CAL-021: the field's state helper). */
  describedBy?: string;
}): JSX.Element {
  const { kinds, value, removed, onChange, describedBy } = props;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const baseId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);

  const chosen = removed ? undefined : kinds.find((k) => k.id === value);
  const shownName = chosen?.name ?? (removed ? KIND_REMOVED : "");
  const optionId = (index: number) => `${baseId}-option-${index}`;

  const openAt = (index: number) => {
    setActive(Math.max(0, Math.min(index, kinds.length - 1)));
    setOpen(true);
  };
  const chosenIndex = () => {
    const index = kinds.findIndex((k) => k.id === chosen?.id);
    return index < 0 ? 0 : index;
  };
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };
  const choose = (kind: Kind) => {
    onChange(kind.id);
    close(true);
  };

  useEffect(() => {
    if (open) list.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (root.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openAt(chosenIndex());
    }
  };

  const onListKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActive((i) => Math.min(i + 1, kinds.length - 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
      case " ": {
        event.preventDefault();
        const kind = kinds[active];
        if (kind !== undefined) choose(kind);
        break;
      }
      case "Escape":
        // Handled here: the sheet's own Escape must not also see it.
        event.preventDefault();
        event.stopPropagation();
        close(true);
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  };

  return (
    <div ref={root} className={styles.picker}>
      <button
        ref={trigger}
        type="button"
        className={styles.trigger}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Kind, ${shownName}`}
        aria-describedby={describedBy}
        onClick={() => (open ? close(false) : openAt(chosenIndex()))}
        onKeyDown={onTriggerKeyDown}
      >
        {chosen === undefined ? (
          <span
            aria-hidden="true"
            data-neutral="true"
            className={styles.neutral}
          >
            ?
          </span>
        ) : (
          <KindSwatch kind={chosen} />
        )}
        <span className={styles.name}>{shownName}</span>
      </button>
      {open ? (
        <ul
          ref={list}
          // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: Contract Block 3 pins a <ul role="listbox"> of <li role="option"> (components.md, Kind picker)
          role="listbox"
          aria-label="Kind"
          tabIndex={-1}
          aria-activedescendant={
            kinds.length > 0 ? optionId(active) : undefined
          }
          className={styles.list}
          onKeyDown={onListKeyDown}
        >
          {kinds.map((kind, index) => (
            // biome-ignore lint/a11y/useFocusableInteractive lint/a11y/useKeyWithClickEvents: an option is not focusable and has no key handler of its own - the listbox takes focus and owns the keyboard through aria-activedescendant
            <li
              key={kind.id}
              id={optionId(index)}
              // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: as the listbox above
              role="option"
              aria-selected={kind.id === chosen?.id}
              data-active={index === active ? "true" : undefined}
              className={styles.option}
              onClick={() => choose(kind)}
            >
              <KindSwatch kind={kind} />
              <span className={styles.name}>{kind.name}</span>
            </li>
          ))}
          <li role="presentation" className={styles.manage}>
            <Link to="/kinds">Manage kinds…</Link>
          </li>
        </ul>
      ) : null}
    </div>
  );
}
