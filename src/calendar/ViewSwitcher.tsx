import { type JSX, type KeyboardEvent, useEffect, useRef } from "react";
import type { View } from "./period";
import styles from "./ViewSwitcher.module.css";

// CAL-011 AC-3, Contract Block 4 (components.md, "View switcher"): a
// radiogroup of three <button role="radio"> with a roving tabindex. An arrow
// key chooses the next or previous view, wrapping, and focus follows once
// the parent has re-rendered with the new view.

const VIEWS: readonly { view: View; name: string }[] = [
  { view: "month", name: "Month" },
  { view: "week", name: "Week" },
  { view: "day", name: "Day" },
];

const STEP: Record<string, 1 | -1> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

export function ViewSwitcher(props: {
  view: View;
  onChange: (view: View) => void;
}): JSX.Element {
  const { view, onChange } = props;
  const buttons = useRef(new Map<View, HTMLButtonElement>());
  // The view an arrow key chose: focused once it is the checked one.
  const pending = useRef<View | null>(null);

  useEffect(() => {
    if (pending.current !== view) return;
    pending.current = null;
    buttons.current.get(view)?.focus();
  }, [view]);

  const onKeyDown = (event: KeyboardEvent) => {
    const step = STEP[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const at = VIEWS.findIndex((v) => v.view === view);
    const next = VIEWS[(at + step + VIEWS.length) % VIEWS.length]?.view ?? view;
    pending.current = next;
    onChange(next);
  };

  return (
    <div
      role="radiogroup"
      aria-label="View"
      className={styles.group}
      onKeyDown={onKeyDown}
    >
      {VIEWS.map(({ view: v, name }) => (
        // biome-ignore lint/a11y/useSemanticElements: Contract Block 4 leaves button-vs-input to GREEN; a <button role="radio"> keeps the arrow keys ours (a native group moves the checked radio itself) and is the segmented control of components.md
        <button
          key={v}
          ref={(el) => {
            if (el === null) buttons.current.delete(v);
            else buttons.current.set(v, el);
          }}
          type="button"
          role="radio"
          aria-checked={v === view ? "true" : "false"}
          tabIndex={v === view ? 0 : -1}
          className={styles.option}
          onClick={() => onChange(v)}
        >
          {name}
        </button>
      ))}
    </div>
  );
}
