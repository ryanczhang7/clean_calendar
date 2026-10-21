import {
  type MouseEventHandler,
  type PointerEventHandler,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Event } from "../data/rows";

// CAL-013 Contract, Block 4. Pointer drag for event chips. A primary-button
// pointerdown arms; a pointermove on document at least DRAG_THRESHOLD_PX away
// starts the drag; a pointerup on document drops on the element under the
// pointer (elementFromPoint where it exists, else the pointerup's target),
// via its closest [data-drop-day] / [data-drop-slot]. Escape cancels. After
// a drag, the click the browser fires on the chip is swallowed once.

export type DropTarget =
  | { kind: "day"; day: Date }
  | { kind: "slot"; start: Date };

export const DRAG_THRESHOLD_PX = 4;

type ChipDragProps = {
  onPointerDown?: PointerEventHandler<HTMLElement>;
  onClickCapture?: MouseEventHandler<HTMLElement>;
};

const DROP_SELECTOR = "[data-drop-day], [data-drop-slot]";

/** `yyyy-MM-dd` or `yyyy-MM-dd'T'HH:mm` as a local instant; null if malformed. */
function parseLocal(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(value);
  if (m === null) return null;
  return new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4] ?? 0),
    Number(m[5] ?? 0),
  );
}

function dropTargetAt(e: PointerEvent): DropTarget | null {
  let el: Element | null = null;
  if (typeof document.elementFromPoint === "function") {
    el = document.elementFromPoint(e.clientX, e.clientY);
  }
  if (el === null && e.target instanceof Element) el = e.target;
  const cell = el?.closest(DROP_SELECTOR) ?? null;
  if (cell === null) return null;
  const day = cell.getAttribute("data-drop-day");
  if (day !== null) {
    const parsed = parseLocal(day);
    return parsed === null ? null : { kind: "day", day: parsed };
  }
  const slot = cell.getAttribute("data-drop-slot");
  const parsed = slot === null ? null : parseLocal(slot);
  return parsed === null ? null : { kind: "slot", start: parsed };
}

export function useChipDrag(
  onDrop: ((event: Event, target: DropTarget) => void) | undefined,
): {
  chipProps(event: Event): ChipDragProps;
  dragging: boolean;
} {
  const [dragging, setDragging] = useState(false);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;
  // Removes the document listeners of the drag in progress, if any.
  const cleanup = useRef<(() => void) | null>(null);
  // Set when a drag ends; consumed by the chip's next click, cleared at the
  // next pointerdown so it never outlives the interaction that set it.
  const swallow = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cleanup.current?.();
    };
  }, []);

  const start = useCallback(
    (event: Event, down: ReactPointerEvent<HTMLElement>) => {
      swallow.current = false;
      if (down.button !== 0) return;
      cleanup.current?.();
      const x0 = down.clientX;
      const y0 = down.clientY;
      let started = false;

      const finish = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("keydown", onKey);
        cleanup.current = null;
        if (started && mounted.current) setDragging(false);
      };
      const onMove = (e: PointerEvent) => {
        if (started) return;
        if (
          Math.abs(e.clientX - x0) >= DRAG_THRESHOLD_PX ||
          Math.abs(e.clientY - y0) >= DRAG_THRESHOLD_PX
        ) {
          started = true;
          setDragging(true);
        }
      };
      const onUp = (e: PointerEvent) => {
        const wasDragging = started;
        finish();
        if (!wasDragging) return;
        swallow.current = true;
        const target = dropTargetAt(e);
        if (target !== null) onDropRef.current?.(event, target);
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") finish();
      };

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("keydown", onKey);
      cleanup.current = finish;
    },
    [],
  );

  const onClickCapture = useCallback<MouseEventHandler<HTMLElement>>((e) => {
    if (!swallow.current) return;
    swallow.current = false;
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const enabled = onDrop !== undefined;
  const chipProps = useCallback(
    (event: Event): ChipDragProps =>
      enabled
        ? {
            onPointerDown: (e) => start(event, e),
            onClickCapture,
          }
        : { onPointerDown: undefined, onClickCapture: undefined },
    [enabled, start, onClickCapture],
  );

  return { chipProps, dragging };
}
