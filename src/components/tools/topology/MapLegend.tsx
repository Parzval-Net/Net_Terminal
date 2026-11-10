import { ChevronUp } from "lucide-react";
import { UTIL_HIGH, UTIL_SATURATED } from "../../../lib/topoTraffic";
import { LINK_LEGEND, UTIL_LEGEND, linkDash } from "../../../lib/topology";
import { UTIL_VAR } from "./topoStyle";

/** Muestra de línea para la leyenda (mismo trazo que el diagrama). */
function LegendLine({ dash }: { dash?: string }) {
  return (
    <svg width="34" height="8" aria-hidden className="shrink-0">
      <line x1="2" y1="4" x2="32" y2="4" stroke="var(--muted)" strokeWidth={2} strokeDasharray={dash} strokeLinecap="round" />
    </svg>
  );
}

/** Leyenda del mapa: solo con lo que hay en la vista (las condiciones las calcula TopologyTool). */
export function MapLegend({
  open,
  legendId,
  mw,
  mh,
  hasPhysical,
  legendKinds,
  hasTentative,
  showStatusLegend,
  detail,
  hasTraffic,
  color,
  arrows,
  onToggle,
}: {
  open: boolean;
  legendId: string;
  /** Tamaño de la vista del mapa (px): acota el ancho y el alto de la leyenda abierta. */
  mw: number;
  mh: number;
  hasPhysical: boolean;
  legendKinds: typeof LINK_LEGEND;
  hasTentative: boolean;
  showStatusLegend: boolean;
  detail: boolean;
  hasTraffic: boolean;
  color: boolean;
  arrows: boolean;
  onToggle: () => void;
}) {
  // Plegada es un botón de una línea; abierta no pasa de ~15 % del mapa (42 % del ancho por 28 % del alto) y se desplaza por dentro.
  return (
    <div className="absolute bottom-2 left-2 flex flex-col items-start gap-1.5">
      {open && (
        <div
          id={legendId}
          style={{ maxWidth: Math.max(130, Math.round(mw * 0.42)), maxHeight: Math.max(64, Math.round(mh * 0.28)) }}
          className="flex min-h-0 flex-col gap-1 overflow-y-auto rounded-lg border border-line bg-panel shadow-pop px-3 py-2 text-[11.5px] text-muted"
          aria-label="Leyenda de enlaces"
          role="group"
        >
          {hasPhysical && (
            <span className="inline-flex items-center gap-1.5">
              <LegendLine />
              CDP / LLDP
            </span>
          )}
          {legendKinds.map(([text, s]) => (
            <span key={text} className="inline-flex items-center gap-1.5">
              <LegendLine dash={linkDash(s)} />
              {text}
            </span>
          ))}
          {hasTentative && (
            <span className="inline-flex items-center gap-1.5">
              <svg width="34" height="12" aria-hidden className="shrink-0">
                <rect x="7" y="1" width="20" height="10" rx="3" fill="var(--chrome)" stroke="var(--field-border)" strokeDasharray="4 3" />
              </svg>
              Equipo manual o visto solo por ruteo
            </span>
          )}
          {showStatusLegend && (
            <>
              <span className="mt-1 font-medium text-fg">Estado del enlace (sentido más cargado)</span>
              {(
                [
                  ["Normal (menos de 70 %)", "var(--muted)", 1.5],
                  [`Alto (${Math.round(UTIL_HIGH * 100)} a ${Math.round(UTIL_SATURATED * 100) - 1} %)`, "var(--warn)", 4],
                  [`Saturado (${Math.round(UTIL_SATURATED * 100)} % o más)`, "var(--danger)", 5],
                ] as [string, string, number][]
              ).map(([text, c, w]) => (
                <span key={text} className="inline-flex items-center gap-1.5">
                  <svg width="34" height="8" aria-hidden className="shrink-0">
                    <line x1="2" y1="4" x2="32" y2="4" stroke={c} strokeWidth={w} strokeLinecap="round" />
                  </svg>
                  {text}
                </span>
              ))}
              <span className="inline-flex items-center gap-1.5">
                <svg width="34" height="14" aria-hidden className="shrink-0">
                  <line x1="2" y1="7" x2="22" y2="7" stroke="var(--text)" strokeOpacity={0.65} strokeWidth={2} strokeDasharray="5 5" strokeLinecap="round" />
                  <circle cx="28" cy="7" r="5.5" fill="var(--warn)" stroke="var(--panel)" strokeWidth={1.5} />
                  <text x="28" y="10.5" fontSize="9" fontWeight={800} textAnchor="middle" fill="var(--panel)">
                    !
                  </text>
                </svg>
                Caído (punteado) · ! problema de interfaz
              </span>
            </>
          )}
          {detail && hasTraffic && (
            <>
              {color && <span className="mt-1 font-medium text-fg">Vista detallada: color y grosor por utilización</span>}
              {color && UTIL_LEGEND.map(([text, lv]) => (
                <span key={lv} className="inline-flex items-center gap-1.5">
                  <svg width="34" height="8" aria-hidden className="shrink-0">
                    <line x1="2" y1="4" x2="32" y2="4" stroke={UTIL_VAR[lv]} strokeWidth={lv === "crit" ? 4.5 : lv === "warn" ? 3.5 : 2.5} strokeLinecap="round" />
                  </svg>
                  {text}
                </span>
              ))}
              <span className="inline-flex items-center gap-1.5">
                <svg width="34" height="8" aria-hidden className="shrink-0">
                  <line x1="2" y1="4" x2="32" y2="4" stroke={UTIL_VAR.none} strokeWidth={2.5} strokeLinecap="round" />
                </svg>
                Velocidad desconocida
              </span>
              {arrows && <span className="inline-flex items-center gap-1.5">
                <svg width="34" height="12" aria-hidden className="shrink-0">
                  <line x1="2" y1="6" x2="32" y2="6" stroke="var(--muted)" strokeWidth={1.5} />
                  <polygon points="13,1.5 19,4.5 13,7.5" fill="var(--ok)" />
                  <polygon points="21,4.5 15,7.5 21,10.5" fill="var(--warn)" />
                </svg>
                Una flecha por sentido · rótulo con el % de uso del sentido más cargado (≈: aproximada)
              </span>}
            </>
          )}
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={legendId}
          onClick={onToggle}
          className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md border border-line bg-panel text-[11.5px] text-muted hover:text-fg hover:bg-hover"
        >
          <ChevronUp size={13} aria-hidden className={`transition-transform ${open ? "" : "rotate-180"}`} />
          Leyenda
        </button>
      </div>
    </div>
  );
}
