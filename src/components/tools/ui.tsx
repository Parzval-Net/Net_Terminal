import { useId, useState } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Check, ChevronRight, Copy } from "lucide-react";

export function Section({ title, hint, children, right }: { title: string; hint?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-panel">
      <header className="flex items-center justify-between gap-3 px-4 pt-3 pb-2">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold truncate">{title}</h3>
          {hint && <p className="text-[11.5px] text-muted truncate" title={hint}>{hint}</p>}
        </div>
        {right}
      </header>
      <div className="px-4 pb-4">{children}</div>
    </section>
  );
}

/**
 * Sección plegable con el mismo aspecto que Section. El encabezado es un botón (patrón acordeón de
 * WAI-ARIA): aria-expanded, aria-controls y operable con teclado. El contenido queda montado aunque
 * esté plegado, para no perder formularios a medio llenar.
 */
export function Collapsible({
  title,
  summary,
  badge,
  badgeTone,
  open,
  onToggle,
  right,
  children,
}: {
  title: string;
  /** Resumen visible en el encabezado (también con la sección plegada). */
  summary?: string;
  /** Contador junto al título, p. ej. cantidad de sugerencias. */
  badge?: number;
  /** Tono del contador: danger o warn si cuenta problemas (ver CountBadge). */
  badgeTone?: BadgeTone;
  open: boolean;
  onToggle: (open: boolean) => void;
  /** Acciones a la derecha del encabezado (fuera del botón que pliega). */
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  const bodyId = useId();
  return (
    <section className="rounded-xl border border-line bg-panel">
      <header className="flex items-center gap-2 pr-2">
        <h3 className="flex-1 min-w-0">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => onToggle(!open)}
            className="w-full flex items-start gap-2 pl-3 pr-1 py-2.5 text-left rounded-xl hover:bg-hover"
          >
            <ChevronRight size={14} aria-hidden className={`mt-0.5 shrink-0 text-muted transition-transform ${open ? "rotate-90" : ""}`} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                <span className="truncate">{title}</span>
                {badge !== undefined && badge > 0 && <CountBadge n={badge} tone={badgeTone} />}
              </span>
              {summary && (
                <span className="block text-[11.5px] font-normal text-muted truncate" title={summary}>
                  {summary}
                </span>
              )}
            </span>
          </button>
        </h3>
        {right}
      </header>
      <div id={bodyId} hidden={!open} className="px-4 pb-4">
        {children}
      </div>
    </section>
  );
}

/**
 * Tono de un contador. El acento queda para acción, selección y foco: lo que avisa un problema usa
 * danger o warn, y un conteo informativo (filtros, diferencias) usa neutral.
 */
export type BadgeTone = "accent" | "danger" | "warn" | "neutral";

const BADGE_TONE: Record<BadgeTone, string> = {
  accent: "bg-accent text-accent-fg",
  danger: "bg-danger text-danger-fg",
  warn: "bg-warn text-warn-fg",
  // Sin relleno de color: texto principal y borde de control (≥3:1) para que se lea como contador.
  neutral: "bg-hover text-fg ring-1 ring-inset ring-control-line",
};

/** Contador redondo. Texto con contraste AA en ambos temas en todos los tonos (App.css). */
export function CountBadge({ n, tone = "accent" }: { n: number; tone?: BadgeTone }) {
  return (
    <span className={`inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[11px] font-semibold leading-none tabular-nums ${BADGE_TONE[tone]}`}>
      {n}
    </span>
  );
}

export function Btn({
  kind = "default",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { kind?: "default" | "primary" | "danger" | "ghost" }) {
  // Deshabilitado neutro (Fluent 2): fondo gris y texto atenuado, sin el color de la variante. Con
  // opacidad, el primario quedaba celeste y parecía un botón activo de estilo suave.
  const styles = {
    default: "border border-line hover:bg-hover disabled:bg-hover disabled:text-muted disabled:border-transparent",
    primary: "bg-accent text-accent-fg font-medium hover:opacity-90 disabled:bg-hover disabled:text-muted",
    danger: "bg-danger text-danger-fg font-medium hover:opacity-90 disabled:bg-hover disabled:text-muted",
    // Sin fondo propio: un fondo gris lo confundiría con el hover; se atenúa.
    ghost: "text-muted hover:text-fg hover:bg-hover disabled:opacity-40",
  }[kind];
  return (
    <button
      {...props}
      className={`shrink-0 whitespace-nowrap inline-flex items-center justify-center gap-1.5 px-3 h-8 rounded-md text-[12.5px] disabled:pointer-events-none ${styles} ${className}`}
    />
  );
}

export function Label({ text, children, className = "" }: { text: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="block mb-1 text-[11.5px] font-medium text-muted">{text}</span>
      {children}
    </label>
  );
}

/** Selector de la IP de este PC que va en los comandos para el equipo. */
export function IpSelect({ ips, ip, onChange, className = "" }: { ips: { name: string; ip: string; default?: boolean }[]; ip: string; onChange: (ip: string) => void; className?: string }) {
  return (
    <Label text="IP de este PC (para los comandos)" className={className}>
      <select className="field" value={ip} disabled={!ips.length} onChange={(e) => onChange(e.target.value)}>
        {!ips.length && <option value="">Sin interfaces activas</option>}
        {ips.map((i) => (
          <option key={`${i.name}-${i.ip}`} value={i.ip}>
            {i.ip} · {i.name}
            {i.default ? " (ruta por defecto)" : ""}
          </option>
        ))}
      </select>
    </Label>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="inline-flex items-center gap-2 text-[12.5px] cursor-default select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="shrink-0 w-9 h-6 grid place-items-center rounded-full"
      >
        <span className={`relative w-8 h-[18px] rounded-full transition-colors ${checked ? "bg-accent" : "bg-field-line"}`}>
          <span className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-3.5" : ""}`} />
        </span>
      </button>
      {label}
    </label>
  );
}

/** Estado con ícono + texto (nunca solo color). */
export function StatusPill({ state, label }: { state: "up" | "down" | "unknown" | "running" | "stopped"; label: string }) {
  const map = {
    up: ["var(--ok)", "●"],
    running: ["var(--ok)", "●"],
    down: ["var(--danger)", "✕"],
    unknown: ["var(--muted)", "○"],
    stopped: ["var(--muted)", "○"],
  } as const;
  const [color, icon] = map[state];
  return (
    <span className="inline-flex items-center gap-1 px-2 h-5 rounded-full border border-line text-[11px] font-medium whitespace-nowrap shrink-0" style={{ color }}>
      <span aria-hidden>{icon}</span>
      <span className="text-fg">{label}</span>
    </span>
  );
}

export function CopyText({ text, mono = true }: { text: string; mono?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async () => {
        await writeText(text);
        setDone(true);
        window.setTimeout(() => setDone(false), 1500);
      }}
      title="Copiar"
      // Alto mínimo (no fijo): un comando largo pasa a la línea siguiente dentro del botón sin montarse sobre el de abajo.
      className={`group inline-flex items-center gap-1.5 px-2 py-0.5 min-h-6 max-w-full rounded-md bg-hover text-[12px] leading-snug text-left hover:text-fg ${mono ? "font-mono" : ""}`}
    >
      <span className="min-w-0 break-all">{text}</span>
      {done ? <Check size={12} className="shrink-0 text-ok" /> : <Copy size={12} className="shrink-0 text-muted opacity-0 group-hover:opacity-100" />}
    </button>
  );
}

export function Console({ lines, empty = "Sin salida", height = 220 }: { lines: string[]; empty?: string; height?: number }) {
  return (
    <pre
      className="rounded-lg bg-hover p-3 font-mono text-[11.5px] leading-[1.5] overflow-auto whitespace-pre-wrap break-all select-text"
      style={{ height }}
      ref={(el) => {
        if (el) el.scrollTop = el.scrollHeight;
      }}
    >
      {lines.length ? lines.join("\n") : <span className="text-muted">{empty}</span>}
    </pre>
  );
}

export const fmtBytes = (n: number) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n >= 1e3 ? `${(n / 1e3).toFixed(0)} KB` : `${n} B`;

export const fmtMs = (v: number | null | undefined) => (v == null ? "—" : `${v >= 10 ? v.toFixed(0) : v.toFixed(1)} ms`);
