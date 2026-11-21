import { useState } from "react";
import { Trash2 } from "lucide-react";

interface Props {
  /** Nombre de lo que se elimina, para los nombres accesibles ("Eliminar Pack X"). */
  name: string;
  /** Estado de confirmación (lo guarda quien lo usa: una fila a la vez). */
  asking: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Eliminar en dos pasos dentro de una fila: la papelera pregunta con texto visible
 * ("¿Eliminar?", Cancelar y Eliminar), no solo con color (WCAG 1.4.1). El foco va a Cancelar,
 * así un doble clic o un segundo Enter no elimina, y la pregunta se cierra al salir de ella.
 */
export function InlineConfirm({ name, asking, onAsk, onCancel, onConfirm }: Props) {
  // Al cancelar con Cancelar o Esc el foco vuelve a la papelera (no se pierde en la página).
  const [back, setBack] = useState(false);
  const cancel = () => {
    setBack(true);
    onCancel();
  };
  if (!asking)
    return (
      <button
        autoFocus={back}
        title="Eliminar"
        aria-label={`Eliminar ${name}`}
        onClick={() => {
          setBack(false);
          onAsk();
        }}
        className="w-7 h-7 shrink-0 grid place-items-center rounded-md text-muted hover:text-danger hover:bg-hover"
      >
        <Trash2 size={14} />
      </button>
    );
  return (
    <span
      role="group"
      aria-label={`Confirmar eliminar ${name}`}
      className="shrink-0 flex items-center gap-1 text-[12px]"
      // Un clic no mueve el foco (en WebKit el botón no lo toma y saldría del grupo antes del clic).
      onMouseDown={(e) => e.preventDefault()}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onCancel();
      }}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        // Esc cierra la pregunta, no el diálogo que la contiene.
        e.preventDefault();
        e.stopPropagation();
        cancel();
      }}
    >
      <span className="text-danger font-medium">¿Eliminar?</span>
      <button autoFocus onClick={cancel} className="px-2 h-7 rounded-md border border-line hover:bg-hover">
        Cancelar
      </button>
      <button
        onClick={onConfirm}
        aria-label={`Eliminar ${name}`}
        className="flex items-center gap-1 px-2 h-7 rounded-md bg-danger text-danger-fg font-medium hover:opacity-90"
      >
        <Trash2 size={12} aria-hidden /> Eliminar
      </button>
    </span>
  );
}
