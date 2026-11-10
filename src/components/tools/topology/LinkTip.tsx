import { memo, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { LinkDetail, ageText } from "../../../lib/topoInsights";
import { LEVEL_COLOR, LEVEL_LABEL } from "./topoStyle";
import { bpsEs } from "./topoText";
import type { TipState } from "./topoTypes";

/**
 * Estado de la ficha fuera de React: el puntero cambia de posición decenas de veces por segundo y
 * solo la ficha (LinkTip) debe redibujarse, no la herramienta ni las capas del mapa.
 */
export class TipStore {
  private state: TipState | null = null;
  private subs = new Set<() => void>();
  /** Mientras se arrastra un equipo o el fondo no se muestra la ficha. */
  blocked: () => boolean = () => false;
  subscribe = (f: () => void) => {
    this.subs.add(f);
    return () => {
      this.subs.delete(f);
    };
  };
  get = () => this.state;
  show = (keys: string[], x: number, y: number, focus = false) => {
    if (this.blocked()) return this.hide();
    const s = this.state;
    if (s && s.x === x && s.y === y && s.focus === focus && s.keys.length === keys.length && s.keys.every((k, i) => k === keys[i])) return;
    this.state = { keys, x, y, focus };
    this.subs.forEach((f) => f());
  };
  hide = () => {
    if (!this.state) return;
    this.state = null;
    this.subs.forEach((f) => f());
  };
}

/** Barra de uso de un sentido: su color sigue el estado de ese sentido (gris si es normal). */
function DirBar({ d, approx }: { d: LinkDetail["dirs"][number]; approx?: boolean }) {
  const pct = d.util === undefined ? undefined : Math.round(d.util * 100);
  return (
    <div className="mt-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate">
          <span className="font-semibold">{d.label}</span>
          <span className="text-muted"> {d.from} → {d.to}</span>
        </span>
        <span className="shrink-0 tabular-nums">
          <span className={d.level === "normal" ? "" : "font-semibold"} style={d.level === "normal" ? undefined : { color: `color-mix(in srgb, ${LEVEL_COLOR[d.level]} 55%, var(--text))` }}>
            {pct === undefined ? "?" : `${approx ? "≈" : ""}${pct} %`}
          </span>
          <span className="text-[11px] text-muted"> {bpsEs(d.bps)}</span>
        </span>
      </div>
      <div className="mt-0.5 h-1.5 rounded-full bg-line overflow-hidden" aria-hidden>
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct ?? 0)}%`, background: d.level === "normal" ? "var(--muted)" : LEVEL_COLOR[d.level], opacity: d.level === "normal" ? 0.55 : 1 }} />
      </div>
    </div>
  );
}

/** Cuerpo de la ficha de un enlace (título, interfaces, barras Baja y Sube, hallazgos y fuente). */
function LinkTipBody({ d, now }: { d: LinkDetail; now: number }) {
  const chip = d.level === "normal" ? null : LEVEL_LABEL[d.level];
  const chipColor = d.level === "down" ? "var(--muted)" : LEVEL_COLOR[d.level];
  return (
    <div>
      <div className="flex items-baseline gap-1.5">
        <span className="min-w-0 truncate text-[12px] font-semibold">
          {d.aName} → {d.bName}
        </span>
        <span className="shrink-0 text-[11px] text-muted">{d.proto}</span>
        {chip && (
          <span className="ml-auto shrink-0 rounded-full px-1.5 text-[11px] font-semibold" style={{ background: `color-mix(in srgb, ${chipColor} 18%, var(--panel))`, color: `color-mix(in srgb, ${chipColor} 40%, var(--text))` }}>
            {chip}
          </span>
        )}
        {d.state && <span className="ml-auto shrink-0 text-[11px] text-muted">{d.state === "removed" ? "ya no aparece" : "nuevo"}</span>}
      </div>
      {d.ends.map((e, i) => (
        <p key={i} className="mt-0.5 text-muted [overflow-wrap:anywhere]">
          {e.name && <span className="text-fg">{e.name} </span>}
          <span className="font-mono text-[11px]">{e.text}</span>
        </p>
      ))}
      {d.group && (
        <p className="mt-0.5 text-muted [overflow-wrap:anywhere]">
          <span className="font-medium text-accent">
            {d.group} ×{d.members.length}
          </span>{" "}
          {d.members.map((m) => `${m.aPort}${m.lag ? ` (${m.lag})` : ""}`).join(", ")}
        </p>
      )}
      {d.dirs.length ? (
        <>
          {d.dirs.map((x) => (
            <DirBar key={x.label} d={x} approx={d.approx} />
          ))}
          {d.approx && <p className="mt-0.5 text-[11px] text-muted">≈ velocidad del BW configurado (aproximada)</p>}
          {!d.speed && <p className="mt-0.5 text-[11px] text-muted">Velocidad del enlace desconocida: sin % de uso.</p>}
        </>
      ) : (
        <p className="mt-1.5 text-muted">Sin lectura de tráfico</p>
      )}
      <div className="mt-1.5 space-y-0.5">
        {d.findings.length ? (
          d.findings.map((f, i) => (
            <p key={i} className="flex items-start gap-1.5">
              <span className="mt-[1px] grid h-4 w-4 shrink-0 place-items-center rounded-full text-[11px] font-bold" style={{ background: "var(--warn)", color: "var(--panel)" }} aria-hidden>
                !
              </span>
              <span className="[overflow-wrap:anywhere]">{f.text}</span>
            </p>
          ))
        ) : (
          <p className="text-muted">{d.hasPortData ? "Sin errores" : "Sin datos de interfaz (lee el estado de puertos)"}</p>
        )}
      </div>
      {d.ts && d.source && (
        <p className="mt-1 text-[11px] text-muted">
          {d.source} · {ageText(d.ts, now)}
        </p>
      )}
    </div>
  );
}

/**
 * Ficha propia del enlace: aparece al pasar el mouse sobre el trazo o su píldora, o al enfocarlo con
 * el teclado. Va dentro del mapa (sin salirse de él), no captura el puntero y se oculta con Escape,
 * al mover el mapa o al hacer zoom.
 */
export const LinkTip = memo(function LinkTip({ store, box, detailsFor }: { store: TipStore; box: React.RefObject<HTMLDivElement | null>; detailsFor: (keys: string[]) => LinkDetail[] }) {
  const tip = useSyncExternalStore(store.subscribe, store.get);
  const ref = useRef<HTMLDivElement>(null);
  const keyId = tip?.keys.join("\n") ?? "";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const details = useMemo(() => (tip ? detailsFor(tip.keys) : []), [keyId, detailsFor]);
  useEffect(() => {
    if (!tip) return;
    const hide = () => store.hide();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && store.hide();
    const el = box.current;
    window.addEventListener("keydown", onKey);
    el?.addEventListener("wheel", hide, { passive: true });
    el?.addEventListener("scroll", hide, { capture: true, passive: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      el?.removeEventListener("wheel", hide);
      el?.removeEventListener("scroll", hide, { capture: true });
    };
  }, [!!tip, store, box]);
  useLayoutEffect(() => {
    const el = ref.current;
    const b = box.current;
    if (!tip || !el || !b) return;
    const r = b.getBoundingClientRect();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const m = 6;
    let x = tip.x - r.left + 14;
    let y = tip.y - r.top + 16;
    // Sin espacio a la derecha o abajo, pasa al otro lado del puntero; siempre dentro del mapa.
    if (x + w > r.width - m) x = tip.x - r.left - w - 14;
    if (y + h > r.height - m) y = tip.y - r.top - h - 14;
    x = Math.max(m, Math.min(x, r.width - w - m));
    y = Math.max(m, Math.min(y, r.height - h - m));
    el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }, [tip, details, box]);
  if (!tip || !details.length) return null;
  const now = Date.now();
  return (
    <div
      ref={ref}
      role="tooltip"
      data-link-tip
      className="absolute left-0 top-0 z-30 w-[300px] max-w-[calc(100%-12px)] max-h-[calc(100%-12px)] overflow-hidden pointer-events-none rounded-lg border border-line bg-panel shadow-pop px-3 py-2 text-[11.5px] leading-snug text-fg"
    >
      {details.slice(0, 3).map((d, i) => (
        <div key={d.key} className={i ? "mt-2 border-t border-line pt-2" : ""}>
          <LinkTipBody d={d} now={now} />
        </div>
      ))}
      {details.length > 3 && <p className="mt-2 text-muted">y {details.length - 3} más</p>}
    </div>
  );
});
