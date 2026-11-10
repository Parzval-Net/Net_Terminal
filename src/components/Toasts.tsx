import { useEffect, useRef, useState } from "react";
import { Bot, Info, TriangleAlert, X } from "lucide-react";

export type ToastKind = "info" | "error" | "ai";
export interface ToastItem {
  id: number;
  text: string;
  kind: ToastKind;
}

/** Duración visible: los errores permanecen mucho más (hay que poder leerlos y copiarlos). */
export const toastMs = (kind: ToastKind) => (kind === "error" ? 30000 : 4000);

function Toast({ t, onClose }: { t: ToastItem; onClose: (id: number) => void }) {
  const [paused, setPaused] = useState(false);
  const hovered = useRef(false);
  const focused = useRef(false);
  const sync = () => setPaused(hovered.current || focused.current);

  // El temporizador se reinicia al despausar: el aviso nunca se cierra mientras se lee.
  useEffect(() => {
    if (paused) return;
    const timer = window.setTimeout(() => onClose(t.id), toastMs(t.kind));
    return () => window.clearTimeout(timer);
  }, [paused, t.id, t.kind, onClose]);

  const error = t.kind === "error";
  const Icon = error ? TriangleAlert : t.kind === "ai" ? Bot : Info;
  return (
    <div
      onMouseEnter={() => ((hovered.current = true), sync())}
      onMouseLeave={() => ((hovered.current = false), sync())}
      onFocus={() => ((focused.current = true), sync())}
      onBlur={() => ((focused.current = false), sync())}
      className={`pointer-events-auto max-w-[min(420px,calc(100vw-var(--toast-right,1rem)-4rem))] flex items-start gap-2 pl-2.5 pr-1 py-2 rounded-lg border shadow-pop text-[12px] bg-panel ${
        error ? "border-danger text-danger" : t.kind === "ai" ? "border-accent text-fg" : "border-line text-fg"
      }`}
    >
      <Icon size={14} aria-hidden className={`mt-px shrink-0 ${error ? "" : t.kind === "ai" ? "text-accent" : "text-muted"}`} />
      <span className="flex-1 min-w-0 break-words select-text">{t.text}</span>
      <button
        onClick={() => onClose(t.id)}
        aria-label="Cerrar aviso"
        title="Cerrar aviso"
        className="h-6 w-6 shrink-0 -my-0.5 grid place-items-center rounded-md text-muted hover:text-fg hover:bg-hover"
      >
        <X size={12} />
      </button>
    </div>
  );
}

/** Avisos visibles a la vez: los más recientes (los demás se cuentan y reaparecen al cerrar los otros). */
export const MAX_TOASTS = 3;

/**
 * Avisos flotantes. Las dos regiones existen siempre (un lector de pantalla solo anuncia
 * cambios en una región que ya estaba en la página): `status` es cortés para los informativos
 * y `alert` interrumpe para los errores. Además del color, cada tipo lleva su ícono.
 * Van abajo a la derecha de la terminal, a la izquierda del panel abierto (`rightInset`: ancho del panel de
 * Notas o Comandos): los errores duran 30 s y no deben tapar los botones del panel.
 */
export function Toasts({ toasts, onClose, rightInset = 0 }: { toasts: ToastItem[]; onClose: (id: number) => void; rightInset?: number }) {
  const shown = toasts.slice(-MAX_TOASTS);
  const hidden = toasts.length - shown.length;
  return (
    <div
      style={{ right: rightInset + 16, "--toast-right": `${rightInset + 16}px` } as React.CSSProperties}
      className="fixed bottom-16 z-40 flex flex-col items-end gap-1.5 pointer-events-none"
    >
      <div role="status" aria-live="polite" className="flex flex-col items-end gap-1.5">
        {shown.filter((t) => t.kind !== "error").map((t) => (
          <Toast key={t.id} t={t} onClose={onClose} />
        ))}
      </div>
      <div role="alert" className="flex flex-col items-end gap-1.5">
        {shown.filter((t) => t.kind === "error").map((t) => (
          <Toast key={t.id} t={t} onClose={onClose} />
        ))}
      </div>
      {hidden > 0 && (
        <span className="pointer-events-auto px-2 py-0.5 rounded-md border border-line bg-panel text-[11px] text-muted shadow-pop">
          y {hidden} {hidden === 1 ? "aviso más" : "avisos más"}
        </span>
      )}
    </div>
  );
}
