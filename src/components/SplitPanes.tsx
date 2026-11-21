import { memo } from "react";
import { Radio, X } from "lucide-react";
import type { Tab, TabState } from "../types";
import { tabTitle } from "../types";
import { PANE_HEADER, SplitState, paneRect } from "../lib/split";
import { statusColor } from "./TabBar";
import { useBroadcastTargets } from "./BroadcastTarget";

interface Props {
  split: SplitState;
  tabs: Tab[];
  states: Record<string, TabState>;
  activeId: string | null;
  /** Cambia la pestaña de un panel (si ya está en otro panel, se intercambian). */
  onPick: (pane: number, tabId: string | null) => void;
  onFocus: (tabId: string) => void;
}

/** Velo de los paneles sin foco: atenúa la salida en ambos temas sin taparla (como Windows Terminal e iTerm2). */
const DIM = "color-mix(in srgb, var(--bg) 28%, transparent)";

/**
 * Marcos de la vista dividida: cabecera numerada con selector de pestaña y borde del panel con
 * foco. Las terminales no viven aquí: App las posiciona encima de cada marco, así no se
 * vuelven a montar (y no pierden conexión ni historial) al cambiar de diseño.
 * El panel con foco lleva borde de acento de 2 px y su número relleno; los demás quedan
 * atenuados. Los paneles que reciben la difusión lo dicen con ícono y texto en la cabecera.
 */
export const SplitPanes = memo(function SplitPanes({ split, tabs, states, activeId, onPick, onFocus }: Props) {
  const bc = useBroadcastTargets();
  return (
    <>
      {split.panes.map((id, i) => {
        const [x, y, w, h] = paneRect(split.layout, i).split(",").map(Number);
        const focused = !!id && id === activeId;
        const tab = tabs.find((t) => t.id === id);
        const target = !!id && bc.multi && bc.ids.includes(id);
        const n = i + 1;
        return (
          <div
            key={i}
            role="group"
            aria-label={`Panel ${n}${tab ? `: ${tabTitle(tab)}` : ", vacío"}${focused ? " (con foco)" : ""}`}
            className={`absolute pointer-events-none border ${focused ? "border-accent z-[1]" : "border-line"}`}
            style={{ left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%` }}
          >
            <div
              className={`@container pointer-events-auto flex items-center gap-2 px-2 text-[12px] border-b border-line ${
                target ? "bg-[color-mix(in_srgb,var(--warn)_14%,var(--chrome))]" : focused ? "bg-selected" : "bg-chrome"
              } ${focused ? "text-fg" : "text-muted"}`}
              style={{ height: PANE_HEADER - 1 }}
              onMouseDown={() => id && onFocus(id)}
            >
              {/* Número del panel: relleno de acento en el que tiene el foco (forma y texto, no solo color). */}
              <span
                aria-hidden
                title={`Panel ${n}`}
                className={`shrink-0 grid place-items-center min-w-[18px] h-[18px] px-1 rounded text-[11px] font-semibold tabular-nums ${
                  focused ? "bg-accent text-accent-fg" : "border border-line text-fg"
                }`}
              >
                {n}
              </span>
              {tab && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: statusColor[states[tab.id]?.status ?? "connecting"] }} />}
              <select
                className={`h-6 bg-transparent text-[12px] min-w-0 max-w-[60%] outline-none cursor-pointer ${focused ? "font-medium" : ""}`}
                value={id ?? ""}
                onChange={(e) => onPick(i, e.target.value || null)}
                aria-label={`Pestaña del panel ${n}`}
              >
                <option value="">Panel vacío</option>
                {tabs.map((t) => (
                  <option key={t.id} value={t.id}>
                    {tabTitle(t)}
                  </option>
                ))}
              </select>
              <span className="truncate min-w-0">{tab?.session.host ?? ""}</span>
              <span className="flex-1" />
              {target && (
                <span className="shrink-0 flex items-center gap-1 text-fg font-medium" title="Este panel recibe lo que se envía en difusión">
                  <Radio size={12} aria-hidden className="text-warn" />
                  <span className="hidden @[28rem]:inline">Difusión</span>
                  <span className="sr-only @[28rem]:hidden">Recibe la difusión</span>
                </span>
              )}
              {id && (
                <button
                  className="w-6 min-w-6 h-6 shrink-0 grid place-items-center rounded text-muted hover:text-fg hover:bg-hover"
                  title="Quitar del panel (la pestaña sigue abierta)"
                  aria-label={`Quitar del panel ${n} (la pestaña sigue abierta)`}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => onPick(i, null)}
                >
                  <X size={14} />
                </button>
              )}
            </div>
            {!id && (
              <div className="absolute inset-x-0 bottom-0 grid place-items-center text-[12px] text-muted" style={{ top: PANE_HEADER }}>
                Elige una pestaña en la cabecera del panel {n}
              </div>
            )}
            {/* Velo sobre la terminal de los paneles sin foco; no captura clics (el clic da el foco al panel). */}
            {id && !focused && <div aria-hidden className="absolute inset-x-0 bottom-0" style={{ top: PANE_HEADER - 1, background: DIM }} />}
            {/* Borde de 2 px del panel con foco: encima de la cabecera y de la terminal, sobre el borde de 1 px. */}
            {focused && <div aria-hidden className="absolute border-2 border-accent" style={{ inset: -1 }} />}
          </div>
        );
      })}
    </>
  );
});
