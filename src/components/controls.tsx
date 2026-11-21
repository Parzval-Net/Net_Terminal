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
            <div id={hintId} className="text-[11.5px] text-muted line-clamp-2 [overflow-wrap:anywhere]" title={hint}>
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
      // Área de clic de 40 x 24 px (el botón); la pista visible de 36 x 20 va dentro y tiene borde de ≥3:1 (bg-field-line).
      className="shrink-0 w-10 h-6 grid place-items-center rounded-full"
    >
      <span className={`relative w-9 h-5 rounded-full transition-colors ${checked ? "bg-accent" : "bg-field-line"}`}>
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-4" : ""
          }`}
        />
      </span>
    </button>
  );
}

/** Alto y tipografía de cada opción: "sm" para barras de herramientas, "lg" para el tipo de un formulario. */
const SEG_SIZE = {
  sm: "px-2.5 h-6 text-[11.5px]",
  md: "px-3 h-7 text-[12.5px]",
  lg: "px-2 h-8 text-[12.5px]",
} as const;

/**
 * Opciones excluyentes en una pastilla (role=radiogroup): flechas mueven y eligen, Tab entra por la
 * elegida. Es el único segmentado de la app (Ajustes, formularios de conexión, botones, Monitoreo).
 *
 * La opción activa no depende solo del color (WCAG 1.4.1 y 1.4.11): lleva fondo de panel, borde
 * --control-border (≥3,4:1 contra el panel y la pista en ambos temas) y texto semibold. El ancho de
 * cada opción se reserva con el texto en semibold, así elegir no mueve a las vecinas.
 */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
  size = "md",
  fill = false,
  className = "",
}: {
  value: T;
  /** Valor y contenido visible de cada opción (texto o ícono más texto). */
  options: readonly (readonly [T, React.ReactNode])[];
  onChange: (v: T) => void;
  /** Nombre del grupo; sin él, toma el título del `Item` que lo contiene. */
  label?: string;
  size?: keyof typeof SEG_SIZE;
  /** Ocupa todo el ancho, con opciones de igual tamaño (tipo de sesión, tipo de botón). */
  fill?: boolean;
  className?: string;
}) {
  const row = useContext(RowContext);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.findIndex(([v]) => v === value);
  const onKeyDown = (e: React.KeyboardEvent) => {
    // Un radiogroup responde a las cuatro flechas: arriba/abajo equivalen a izquierda/derecha.
    const key = e.key === "ArrowDown" ? "ArrowRight" : e.key === "ArrowUp" ? "ArrowLeft" : e.key;
    const to = stepIndex(key, current, options.length, { orientation: "horizontal" });
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
      aria-describedby={label ? undefined : row.hint}
      onKeyDown={onKeyDown}
      className={`${fill ? "grid" : "inline-flex"} gap-0.5 p-0.5 rounded-lg bg-hover ${className}`}
      style={fill ? { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` } : undefined}
    >
      {options.map(([v, content], i) => {
        const on = v === value;
        return (
          <button
            key={String(v)}
            type="button"
            role="radio"
            aria-checked={on}
            // Sin opción elegida, Tab entra por la primera (si no, el grupo quedaría fuera del orden de tabulación).
            tabIndex={on || (current < 0 && i === 0) ? 0 : -1}
            onClick={() => onChange(v)}
            // Con texto simple, .seg-reserve (App.css) reserva el ancho en semibold sin duplicar el texto en el DOM.
            data-label={typeof content === "string" ? content : undefined}
            className={`flex flex-col items-center justify-center min-w-0 rounded-md border whitespace-nowrap ${SEG_SIZE[size]} ${
              typeof content === "string" ? "seg-reserve" : ""
            } ${on ? "bg-panel border-control-line text-fg font-semibold shadow-sm" : "border-transparent text-muted hover:text-fg"}`}
          >
            <span className="flex items-center justify-center gap-1.5 max-w-full">{content}</span>
          </button>
        );
      })}
    </div>
  );
}
