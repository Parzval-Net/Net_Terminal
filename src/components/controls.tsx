/**
 * Controles de formulario de Ajustes con nombre accesible: la fila (`Item`) da su título y su
 * ayuda a los controles que contiene, así un interruptor o un segmentado se anuncia con el
 * nombre de la opción ("Cursor parpadeante, interruptor, activado") y no como un botón mudo.
 */
import { createContext, isValidElement, useContext, useId, useRef } from "react";
import { stepIndex } from "../lib/kbNav";

const RowContext = createContext<{ label?: string; hint?: string }>({});

/** Fila de ajuste: título, ayuda opcional y el control a la derecha. */
export function Item({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  const id = useId();
  const labelId = `${id}-label`;
  const hintId = hint ? `${id}-hint` : undefined;
  const own = isValidElement(children) && (children.type === Switch || children.type === Segmented);
  return (
    <RowContext.Provider value={{ label: labelId, hint: hintId }}>
      <div className="flex items-center justify-between gap-4 min-h-8">
        <div className="min-w-0">
          <div id={labelId}>{label}</div>
          {hint && (
            <div id={hintId} className="text-[11.5px] text-muted truncate" title={hint}>
              {hint}
            </div>
          )}
        </div>
        {/* Los controles sin nombre propio (listas, campos) heredan el de la fila como grupo. */}
        <div className="shrink-0" role={own ? undefined : "group"} aria-labelledby={own ? undefined : labelId}>
          {children}
        </div>
      </div>
    </RowContext.Provider>
  );
}

/** Interruptor (role=switch). Toma el nombre del `Item` que lo contiene o de `label`. */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  const row = useContext(RowContext);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-labelledby={label ? undefined : row.label}
      aria-describedby={row.hint}
      onClick={() => onChange(!checked)}
      // Pista con borde de ≥3:1 (bg-field-line) y área de clic de ~42x26 px (el before).
      className={`relative shrink-0 w-9 h-5 rounded-full transition-colors before:absolute before:-inset-[3px] before:content-[''] ${checked ? "bg-accent" : "bg-field-line"}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-4" : ""
        }`}
      />
    </button>
  );
}

/** Opciones excluyentes en una pastilla (role=radiogroup): flechas mueven y eligen, Tab entra por la elegida. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
  label?: string;
}) {
  const row = useContext(RowContext);
  const ref = useRef<HTMLDivElement>(null);
  const onKeyDown = (e: React.KeyboardEvent) => {
    // Un radiogroup responde a las cuatro flechas: arriba/abajo equivalen a izquierda/derecha.
    const key = e.key === "ArrowDown" ? "ArrowRight" : e.key === "ArrowUp" ? "ArrowLeft" : e.key;
    const i = options.findIndex(([v]) => v === value);
    const to = stepIndex(key, i, options.length, { orientation: "horizontal" });
    if (to < 0) return;
    e.preventDefault();
    onChange(options[to][0]);
    ref.current?.querySelectorAll<HTMLElement>('[role="radio"]')[to]?.focus();
  };
  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label={label}
      aria-labelledby={label ? undefined : row.label}
      onKeyDown={onKeyDown}
      className="flex p-0.5 rounded-lg bg-hover"
    >
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          tabIndex={value === v ? 0 : -1}
          onClick={() => onChange(v)}
          className={`px-3 h-7 rounded-md text-[12.5px] ${value === v ? "bg-panel shadow-sm text-fg ring-1 ring-line" : "text-muted hover:text-fg"}`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
