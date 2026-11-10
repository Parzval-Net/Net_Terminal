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
      className={`pointer-events-auto max-w-[420px] flex items-start gap-2 pl-2.5 pr-1 py-2 rounded-lg border shadow-pop text-[12px] bg-panel ${
        error ? "border-danger text-danger" : t.kind === "ai" ? "border-accent text-fg" : "border-line text-fg"
      }`}
    >
      <Icon size={14} aria-hidden className={`mt-px shrink-0 ${error ? "" : t.kind === "ai" ? "text-accent" : "text-muted"}`} />
      <span className="flex-1 min-w-0 break-words select-text">{t.text}</span>
      <button
        onClick={() => onClose(t.id)}
        aria-label="Cerrar aviso"
        title="Cerrar aviso"
        className="h-5 w-5 shrink-0 grid place-items-center rounded-md text-muted hover:text-fg hover:bg-hover"
      >
        <X size={12} />
      </button>
    </div>
  );
}

/**
 * Avisos flotantes. Las dos regiones existen siempre (un lector de pantalla solo anuncia
 * cambios en una región que ya estaba en la página): `status` es cortés para los informativos
 * y `alert` interrumpe para los errores. Además del color, cada tipo lleva su ícono.
 */
export function Toasts({ toasts, onClose }: { toasts: ToastItem[]; onClose: (id: number) => void }) {
  return (
    <div className="fixed bottom-16 right-4 z-40 flex flex-col items-end gap-1.5 pointer-events-none">
      <div role="status" aria-live="polite" className="flex flex-col items-end gap-1.5">
        {toasts.filter((t) => t.kind !== "error").map((t) => (
          <Toast key={t.id} t={t} onClose={onClose} />
        ))}
      </div>
      <div role="alert" className="flex flex-col items-end gap-1.5">
        {toasts.filter((t) => t.kind === "error").map((t) => (
          <Toast key={t.id} t={t} onClose={onClose} />
        ))}
      </div>
    </div>
  );
}
