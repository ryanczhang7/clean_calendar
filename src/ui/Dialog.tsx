import {
  type JSX,
  type ReactNode,
  type SyntheticEvent,
  useEffect,
  useId,
  useRef,
} from "react";
import styles from "./Dialog.module.css";

// components.md, Dialog: a native <dialog>, opened modal; focus moves to the
// first non-destructive control; Escape closes; focus returns to the opener.
const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function Dialog(props: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
}): JSX.Element {
  const { open, title, onClose, children, actions } = props;
  const titleId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null || !open) return;
    const active = document.activeElement;
    opener.current = active instanceof HTMLElement ? active : null;
    dialog.showModal();
    const first = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].find(
      (el) => el.dataset.variant !== "danger",
    );
    first?.focus();
    return () => {
      dialog.close();
      opener.current?.focus();
      opener.current = null;
    };
  }, [open]);

  // Escape is the dialog's `cancel` event. The parent owns `open`, so the
  // browser's own close is prevented and the effect above closes it once the
  // parent says so - one onClose per Escape.
  const handleCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault();
    onClose();
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={styles.dialog}
      onCancel={handleCancel}
    >
      <h2 id={titleId} className={styles.title}>
        {title}
      </h2>
      <div className={styles.body}>{children}</div>
      {actions === undefined ? null : (
        <div className={styles.actions}>{actions}</div>
      )}
    </dialog>
  );
}
