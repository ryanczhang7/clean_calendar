import { fireEvent, render, renderHook, screen } from "@testing-library/react";
import type { JSX } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Event } from "../data/rows";
import { DRAG_THRESHOLD_PX, type DropTarget, useChipDrag } from "./useChipDrag";

// CAL-013 Contract, Block 4 (AC-2 at the hook). Pointer events are
// dispatched with fireEvent: in this jsdom (30.1.2, measured in RED
// 2026-10-20) PointerEvent exists and fireEvent.pointerDown/Move/Up carry
// clientX/clientY and button into the event; isPrimary defaults to false, so
// "primary" here is button 0. document.elementFromPoint is absent, so a drop
// is a pointerup dispatched on the target cell itself - except in the one
// case that installs elementFromPoint to pin the browser's path.
// MECHANICAL: the threshold is 4 px (3 px is a click), a day target is that
// local midnight, a slot target that local slot start.

type OnDrop = (event: Event, target: DropTarget) => void;

const STAMP = "2026-10-16T08:00:00.000001+00:00";

const SWIM: Event = {
  id: "10000000-0000-4000-8000-000000000001",
  title: "Swim",
  kindId: "00000000-0000-4000-8000-000000000001",
  startsAt: new Date(2026, 9, 15, 7, 0),
  endsAt: new Date(2026, 9, 15, 8, 0),
  allDay: false,
  location: null,
  notes: null,
  recurrence: null,
  origin: "manual",
  captureJobId: null,
  deletedAt: null,
  createdAt: STAMP,
  updatedAt: STAMP,
};

function Harness(props: {
  onDrop: OnDrop | undefined;
  onClick: () => void;
}): JSX.Element {
  const drag = useChipDrag(props.onDrop);
  return (
    <>
      <button
        type="button"
        data-dragging={drag.dragging ? "true" : "false"}
        onClick={props.onClick}
        {...drag.chipProps(SWIM)}
      >
        Swim
      </button>
      <div data-testid="day" data-drop-day="2026-10-16">
        <span data-testid="inside-day">16</span>
      </div>
      <div data-testid="slot" data-drop-slot="2026-10-15T14:00" />
      <div data-testid="nowhere" />
    </>
  );
}

function setup(withDrop = true) {
  const onDrop = vi.fn<OnDrop>();
  const onClick = vi.fn<() => void>();
  const view = render(
    <Harness onDrop={withDrop ? onDrop : undefined} onClick={onClick} />,
  );
  const chip = screen.getByRole("button", { name: "Swim" });
  return { onDrop, onClick, chip, view };
}

const X = 100;
const Y = 200;

/** Arm on the chip at (X, Y) with `button`, then move on document by (dx, dy). */
function pressAndMove(chip: HTMLElement, dx: number, dy: number, button = 0) {
  fireEvent.pointerDown(chip, { clientX: X, clientY: Y, button });
  fireEvent.pointerMove(document, { clientX: X + dx, clientY: Y + dy });
}

function release(target: Element | Document, dx = 40, dy = 0) {
  fireEvent.pointerUp(target, { clientX: X + dx, clientY: Y + dy });
}

const DAY_16 = new Date(2026, 9, 16);
const SLOT_15_14 = new Date(2026, 9, 15, 14, 0);

afterEach(() => {
  Reflect.deleteProperty(document, "elementFromPoint");
});

describe("DRAG_THRESHOLD_PX", () => {
  it("is 4", () => {
    expect(DRAG_THRESHOLD_PX).toBe(4);
  });
});

describe("the threshold: 3 px is a click, 4 px is a drag (Block 4)", () => {
  it("3 px then pointerup on a day cell: no drop, not dragging - and the click that follows reaches the chip", () => {
    const { onDrop, onClick, chip } = setup();
    pressAndMove(chip, 3, 0);
    expect(chip).toHaveAttribute("data-dragging", "false");
    release(screen.getByTestId("day"), 3, 0);
    expect(onDrop).not.toHaveBeenCalled();
    fireEvent.click(chip);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("4 px to the right starts a drag; pointerup on the 16 Oct cell drops there", () => {
    const { onDrop, chip } = setup();
    pressAndMove(chip, 4, 0);
    expect(chip).toHaveAttribute("data-dragging", "true");
    release(screen.getByTestId("day"));
    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(onDrop).toHaveBeenCalledWith(SWIM, { kind: "day", day: DAY_16 });
    expect(chip).toHaveAttribute("data-dragging", "false");
  });

  it("4 px down starts a drag too (the time grid drags vertically)", () => {
    const { onDrop, chip } = setup();
    pressAndMove(chip, 0, 4);
    expect(chip).toHaveAttribute("data-dragging", "true");
    release(screen.getByTestId("slot"));
    expect(onDrop).toHaveBeenCalledWith(SWIM, {
      kind: "slot",
      start: SLOT_15_14,
    });
  });

  // CAL-040 AC-1: the threshold is a distance, so a negative dx or dy counts.
  it("4 px to the left starts a drag too (an event dragged to an earlier day); pointerup on the 16 Oct cell drops there", () => {
    const { onDrop, chip } = setup();
    pressAndMove(chip, -4, 0);
    expect(chip).toHaveAttribute("data-dragging", "true");
    release(screen.getByTestId("day"));
    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(onDrop).toHaveBeenCalledWith(SWIM, { kind: "day", day: DAY_16 });
  });

  it("4 px up starts a drag too (an event dragged to an earlier time); pointerup on the 16 Oct cell drops there", () => {
    const { onDrop, chip } = setup();
    pressAndMove(chip, 0, -4);
    expect(chip).toHaveAttribute("data-dragging", "true");
    release(screen.getByTestId("day"));
    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(onDrop).toHaveBeenCalledWith(SWIM, { kind: "day", day: DAY_16 });
  });

  it.each([
    ["left", -3, 0],
    ["up", 0, -3],
  ])("3 px %s is still a click: not dragging, no drop", (_dir, dx, dy) => {
    const { onDrop, chip } = setup();
    pressAndMove(chip, dx, dy);
    expect(chip).toHaveAttribute("data-dragging", "false");
    release(screen.getByTestId("day"), dx, dy);
    expect(onDrop).not.toHaveBeenCalled();
  });
});

describe("where a drag lands (Block 4)", () => {
  it("a day target is that local midnight, found from an element inside the cell", () => {
    const { onDrop, chip } = setup();
    pressAndMove(chip, 30, 0);
    release(screen.getByTestId("inside-day"));
    expect(onDrop).toHaveBeenCalledTimes(1);
    const target = onDrop.mock.calls[0]?.[1];
    expect(target).toStrictEqual({ kind: "day", day: DAY_16 });
    expect(target?.kind === "day" && target.day.getHours()).toBe(0);
  });

  it("a slot target is that local slot start: 15 Oct 14:00", () => {
    const { onDrop, chip } = setup();
    pressAndMove(chip, 0, 30);
    release(screen.getByTestId("slot"));
    expect(onDrop).toHaveBeenCalledWith(SWIM, {
      kind: "slot",
      start: SLOT_15_14,
    });
  });

  it("a pointerup over nothing droppable cancels: no drop, not dragging", () => {
    const { onDrop, chip } = setup();
    pressAndMove(chip, 30, 0);
    release(screen.getByTestId("nowhere"));
    expect(onDrop).not.toHaveBeenCalled();
    expect(chip).toHaveAttribute("data-dragging", "false");
    // Not vacuous: the same hook drops the next drag.
    pressAndMove(chip, 30, 0);
    release(screen.getByTestId("day"));
    expect(onDrop).toHaveBeenCalledTimes(1);
  });

  it("where document.elementFromPoint exists, it decides - at the pointerup's clientX/clientY", () => {
    const { onDrop, chip } = setup();
    const slot = screen.getByTestId("slot");
    const fromPoint = vi.fn(() => slot);
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: fromPoint,
    });
    pressAndMove(chip, 30, 0);
    release(document.body, 55, 7);
    expect(fromPoint).toHaveBeenCalledWith(X + 55, Y + 7);
    expect(onDrop).toHaveBeenCalledWith(SWIM, {
      kind: "slot",
      start: SLOT_15_14,
    });
  });

  it("where elementFromPoint returns null, the pointerup's own target decides", () => {
    const { onDrop, chip } = setup();
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => null),
    });
    pressAndMove(chip, 30, 0);
    release(screen.getByTestId("day"));
    expect(onDrop).toHaveBeenCalledWith(SWIM, { kind: "day", day: DAY_16 });
  });
});

describe("cancelling and finishing (Block 4)", () => {
  it("Escape during a drag cancels it: the pointerup after it drops nothing", () => {
    const { onDrop, chip } = setup();
    pressAndMove(chip, 30, 0);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(chip).toHaveAttribute("data-dragging", "false");
    release(screen.getByTestId("day"));
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("a non-primary button (right-click, button 2) never drags", () => {
    const { onDrop, chip } = setup();
    pressAndMove(chip, 30, 0, 2);
    expect(chip).toHaveAttribute("data-dragging", "false");
    release(screen.getByTestId("day"));
    expect(onDrop).not.toHaveBeenCalled();
    // Not vacuous: the primary button does.
    pressAndMove(chip, 30, 0, 0);
    release(screen.getByTestId("day"));
    expect(onDrop).toHaveBeenCalledTimes(1);
  });

  it("after a drop the listeners are gone: moving and releasing again drops nothing more", () => {
    const { onDrop, chip } = setup();
    pressAndMove(chip, 30, 0);
    release(screen.getByTestId("day"));
    fireEvent.pointerMove(document, { clientX: X + 80, clientY: Y });
    release(screen.getByTestId("slot"), 80, 0);
    expect(onDrop).toHaveBeenCalledTimes(1);
  });

  it("unmounted mid-drag, a later pointerup on a drop target calls nothing", () => {
    const { onDrop, chip, view } = setup();
    const outside = document.body.appendChild(document.createElement("div"));
    outside.setAttribute("data-drop-day", "2026-10-20");
    try {
      pressAndMove(chip, 30, 0);
      view.unmount();
      release(outside);
      expect(onDrop).not.toHaveBeenCalled();
    } finally {
      outside.remove();
    }
  });

  // CAL-040 AC-2: a press that never became a drag leaves no pointermove
  // listener behind to turn later, buttonless movement into a drag.
  it("after a press released below the threshold, a later 30 px move with no button down does not start a drag, and the next release drops nothing", () => {
    const { onDrop, chip } = setup();
    pressAndMove(chip, 3, 0);
    release(screen.getByTestId("day"), 3, 0);
    expect(onDrop).not.toHaveBeenCalled();
    expect(chip).toHaveAttribute("data-dragging", "false");
    fireEvent.pointerMove(document, { clientX: X + 30, clientY: Y });
    expect(chip).toHaveAttribute("data-dragging", "false");
    release(screen.getByTestId("day"), 30, 0);
    expect(onDrop).not.toHaveBeenCalled();
  });

  // CAL-040 AC-5: only Escape cancels.
  it.each(["Shift", "ArrowRight"])(
    "pressing %s during a drag does not cancel it: still dragging, and the pointerup drops",
    (key) => {
      const { onDrop, chip } = setup();
      pressAndMove(chip, 30, 0);
      fireEvent.keyDown(document, { key });
      expect(chip).toHaveAttribute("data-dragging", "true");
      release(screen.getByTestId("day"));
      expect(onDrop).toHaveBeenCalledTimes(1);
      expect(onDrop).toHaveBeenCalledWith(SWIM, { kind: "day", day: DAY_16 });
    },
  );
});

// CAL-040 AC-3: whichever way a press ends, each of the three listeners it
// put on document is taken off again - by the same type and the same function.
// React registers listeners of its own, so this asserts containment.
describe("whichever way a press ends, document keeps none of its listeners (CAL-040 AC-3)", () => {
  const TYPES = ["pointermove", "pointerup", "keydown"] as const;
  let add: ReturnType<typeof spyAdd> | undefined;
  let remove: ReturnType<typeof spyRemove> | undefined;

  function spyAdd() {
    return vi.spyOn(document, "addEventListener");
  }
  function spyRemove() {
    return vi.spyOn(document, "removeEventListener");
  }

  afterEach(() => {
    add?.mockRestore();
    remove?.mockRestore();
    add = undefined;
    remove = undefined;
  });

  /** Runs `press`, then `end`; checks every listener the press added was removed in kind. */
  function expectAllRemoved(
    press: (chip: HTMLElement) => void,
    end: () => void,
  ) {
    add = spyAdd();
    remove = spyRemove();
    const { chip } = setup();
    const addedBefore = add.mock.calls.length;
    press(chip);
    const added = add.mock.calls.slice(addedBefore);
    end();
    const removed = remove.mock.calls;
    const leaks: string[] = [];
    for (const type of TYPES) {
      const fns = added.filter(([t]) => t === type).map(([, fn]) => fn);
      // Not vacuous: the press did put one of each on document.
      expect(fns, `the press added a ${type} listener`).toHaveLength(1);
      for (const fn of fns) {
        const gone = removed.some(([t, f]) => t === type && f === fn);
        if (!gone) leaks.push(type);
      }
    }
    expect(leaks, "listeners left on document").toStrictEqual([]);
  }

  it("after a drop", () => {
    expectAllRemoved(
      (chip) => pressAndMove(chip, 30, 0),
      () => release(screen.getByTestId("day")),
    );
  });

  it("after Escape mid-drag", () => {
    expectAllRemoved(
      (chip) => pressAndMove(chip, 30, 0),
      () => fireEvent.keyDown(document, { key: "Escape" }),
    );
  });

  it("after a release below the threshold", () => {
    expectAllRemoved(
      (chip) => pressAndMove(chip, 3, 0),
      () => release(screen.getByTestId("day"), 3, 0),
    );
  });
});

describe("the click after a drag is swallowed, and only that one (Block 4, AC-2: the sheet does not open)", () => {
  it("the click the browser fires on the chip after a drop does not reach the chip's onClick", () => {
    const { onDrop, onClick, chip } = setup();
    pressAndMove(chip, 30, 0);
    release(screen.getByTestId("day"));
    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(fireEvent.click(chip)).toBe(false);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("a plain click after that is a click again", () => {
    const { onClick, chip } = setup();
    pressAndMove(chip, 30, 0);
    release(screen.getByTestId("day"));
    fireEvent.click(chip);
    fireEvent.pointerDown(chip, { clientX: X, clientY: Y, button: 0 });
    fireEvent.pointerUp(chip, { clientX: X, clientY: Y });
    fireEvent.click(chip);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("a drop that produced no click on the chip (a browser fires it on the common ancestor) does not eat the next real click", async () => {
    const { onClick, chip } = setup();
    pressAndMove(chip, 30, 0);
    release(screen.getByTestId("day"));
    // The next interaction is a later task: either disarming - at the next
    // pointerdown, or once the drop's task is over - satisfies this.
    await new Promise((done) => setTimeout(done, 0));
    fireEvent.pointerDown(chip, { clientX: X, clientY: Y, button: 0 });
    fireEvent.pointerUp(chip, { clientX: X, clientY: Y });
    fireEvent.click(chip);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  // CAL-040 AC-4: keyboard Enter/Space fire click with no pointer events.
  it("a click on a freshly mounted chip with no pointerdown before it (keyboard Enter) reaches onClick and is not cancelled", () => {
    const { onClick, chip } = setup();
    expect(fireEvent.click(chip)).toBe(true);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("after a drop swallowed its one click, a second click with no pointerdown (keyboard Enter) reaches onClick", () => {
    const { onDrop, onClick, chip } = setup();
    pressAndMove(chip, 30, 0);
    release(screen.getByTestId("day"));
    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(fireEvent.click(chip)).toBe(false);
    expect(onClick).not.toHaveBeenCalled();
    expect(fireEvent.click(chip)).toBe(true);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("without onDrop the chip gets no handlers (Block 4)", () => {
  it("chipProps(event) has onPointerDown and onClickCapture both undefined", () => {
    const { result } = renderHook(() => useChipDrag(undefined));
    const props = result.current.chipProps(SWIM);
    expect(props.onPointerDown).toBeUndefined();
    expect(props.onClickCapture).toBeUndefined();
    expect(result.current.dragging).toBe(false);
  });

  it("with onDrop both are functions", () => {
    const { result } = renderHook(() => useChipDrag(vi.fn<OnDrop>()));
    const props = result.current.chipProps(SWIM);
    expect(typeof props.onPointerDown).toBe("function");
    expect(typeof props.onClickCapture).toBe("function");
  });
});
