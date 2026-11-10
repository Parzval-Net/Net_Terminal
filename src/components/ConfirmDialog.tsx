import { type ReactNode, useEffect, useId, useRef } from "react";
import { useDragResize } from "../lib/useDragResize";
import { useModal } from "../lib/useModal";

interface Props {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  /** El foco inicial va a Cancelar: para acciones que cortan varias sesiones a la vez. Las acciones `danger` ya lo hacen. */
  defaultCancel?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ title, message, confirmLabel, danger, defaultCancel, onConfirm, onCancel }: Props) {
  const win = useDragResize("confirmWindow", false);
  const descId = useId();
  // Esc y Enter los atiende este diálogo (abajo): el hook solo pone roles, trampa de foco y devolución del foco.
  const modal = useModal({ role: "alertdialog", describedBy: descId });
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  // Una acción destructiva nunca queda a un Enter de distancia: el foco inicial va a Cancelar.
  const cancelFirst = !!defaultCancel || !!danger;
  useEffect(() => {
    // En captura para que Enter/Esc no lleguen a la terminal que está detrás.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" && e.key !== "Enter") return;
      e.preventDefault();
      e.stopPropagation();
      // Enter activa el botón con foco; con el foco en otra parte vale el botón por defecto.
      const focused = document.activeElement;
      const confirm =
        e.key === "Enter" && (focused === confirmRef.current || (focused !== cancelRef.current && !cancelFirst));
      if (confirm) onConfirm();
      else onCancel();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onConfirm, onCancel, cancelFirst]);

  return (
    <div {...modal.overlay} className="fixed inset-0 z-50 grid place-items-center bg-black/25 p-4" onMouseDown={onCancel}>
      <div
        {...win.box}
        {...modal.dialog}
        className="w-[400px] max-w-full bg-panel border border-line rounded-xl shadow-pop p-5"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id={modal.titleId} {...win.handle} className="text-[14px] font-semibold mb-1 select-none">
          {title}
        </h2>
        <div id={descId} className="text-muted mb-5 whitespace-pre-wrap break-words max-h-[55vh] overflow-y-auto font-[inherit]">{message}</div>
        <div className="flex justify-end gap-2">
          <button ref={cancelRef} autoFocus={cancelFirst} onClick={onCancel} className="px-3.5 h-8 rounded-md border border-line hover:bg-hover">
            Cancelar
          </button>
          <button
            autoFocus={!cancelFirst}
            ref={confirmRef}
            onClick={onConfirm}
            className={`px-3.5 h-8 rounded-md font-medium hover:opacity-90 ${danger ? "bg-danger text-danger-fg" : "bg-accent text-accent-fg"}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
