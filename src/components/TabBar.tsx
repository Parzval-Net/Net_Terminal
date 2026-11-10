import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Columns2, LayoutGrid, Lock, Maximize2, Minimize2, Plus, Rows2, X } from "lucide-react";
import { newTabMenuItems } from "./tabMenu";
import { SplitLayout, layoutLabel } from "../lib/split";
import type { TabLayout } from "../lib/settings";
import { MenuItem, layoutItem, splitMenuItems, tabMenuItems } from "./tabMenu";
import { ConnStatus, Tab, TabState, tabTitle } from "../types";
import { ContextMenu } from "./Sidebar";
import { SessionIcon, isQuickSession } from "./SessionIcon";
import { focusLabel, modLabel } from "../lib/platform";
import type { CloseScope } from "../lib/closeAll";
import { useTabDrag } from "../lib/tabDrag";
import { useTabKeys } from "../lib/useTabKeys";

export interface TabBarProps {
  tabs: Tab[];
  states: Record<string, TabState>;
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
  /** Conexión rápida sin guardar y nueva sesión guardada (menú del "+"). */
  onQuickConnect?: () => void;
  onNewSession?: () => void;
  /** Crea un botón de la barra de botones (el menú del "+" y la paleta lo ofrecen aunque la barra esté oculta). */
  onNewButton?: () => void;
  /** Modo foco: solo pestañas y terminal. */
  focusMode?: boolean;
  onToggleFocus?: () => void;
  /** Break, buscar e historial de comandos de una pestaña (menú contextual). */
  onBreak?: (id: string) => void;
  onFind?: (id: string) => void;
  onHistory?: (id: string) => void;
  /** Guarda una pestaña abierta con conexión rápida como sesión. */
  onSaveAs?: (id: string) => void;
  /** Resaltado al vuelo, marcadores y solo lectura de una pestaña (menú contextual). */
  onHighlight?: (id: string) => void;
  onMarkHere?: (id: string) => void;
  onJumpMark?: (id: string, dir: "prev" | "next") => void;
  onMarks?: (id: string) => void;
  onToggleReadOnly?: (id: string) => void;
  /** Con "Sesiones visibles para agentes: solo las marcadas": marca o desmarca la sesión de la pestaña. */
  onToggleAgent?: (id: string) => void;
  agentMarked?: string[];
  /** Cerrar varias pestañas desde el menú contextual (con un solo aviso). */
  onCloseMany?: (scope: CloseScope, id: string) => void;
  onRename: (id: string, title: string | undefined) => void;
  onDuplicate: (id: string) => void;
  onReconnect: (id: string) => void;
  onDisconnect: (id: string) => void;
  onClearScrollback: (id: string) => void;
  onResetTerminal: (id: string) => void;
  onCopyAll: (id: string) => void;
  /** Pestañas con salida nueva sin ver. */
  activity: Set<string>;
  /** Vista dividida activa (null: una sola terminal). */
  split?: SplitLayout | null;
  onSplit?: (layout: SplitLayout | null) => void;
  /** Pestañas con una alerta por palabra clave sin ver. */
  alerted?: Set<string>;
  /** "vertical": las pestañas van en VerticalTabs y esta barra solo deja las acciones globales. */
  tabLayout?: TabLayout;
  onTabLayout?: (layout: TabLayout) => void;
  /** Clic en una pestaña: lleva el foco a su terminal (la pestaña activa no cambia al hacer clic en ella, y el foco podía quedar en el fondo). */
  onFocusTab?: (id: string) => void;
  /** Arrastrar una pestaña: la deja antes o después de `to`. */
  onReorder?: (from: string, to: string, after: boolean) => void;
}

/** Línea que marca dónde caerá la pestaña arrastrada. */
export const dropMark = (side: "left" | "right" | "top" | "bottom") =>
  `after:content-[''] after:absolute after:bg-accent after:pointer-events-none ${
    side === "left" ? "after:left-0 after:top-1 after:bottom-1 after:w-0.5"
    : side === "right" ? "after:right-0 after:top-1 after:bottom-1 after:w-0.5"
    : side === "top" ? "after:top-0 after:left-1 after:right-1 after:h-0.5"
    : "after:bottom-0 after:left-1 after:right-1 after:h-0.5"
  }`;

export const statusColor: Record<ConnStatus, string> = {
  connecting: "var(--warn)",
  connected: "var(--ok)",
  closed: "var(--muted)",
};

/**
 * Color del punto de estado. En la pestaña activa el fondo es el del tema de terminal, que
 * puede ser claro con la interfaz oscura (o al revés): se mezcla con --term-fg para que el
 * punto mantenga >= 3:1 contra ese fondo (WCAG 1.4.11).
 */
export const dotColor = (status: ConnStatus, active: boolean) =>
  active ? `color-mix(in oklab, ${statusColor[status]} 60%, var(--term-fg))` : statusColor[status];

/**
 * Punto de estado que se distingue por forma además de color (WCAG 1.4.1): conectada = círculo lleno,
 * conectando = medio lleno con pulso (solo sin reduced motion), desconectada = anillo vacío.
 * El estado se lee en el nombre accesible de la pestaña (`tabLabel`), por eso es decorativo.
 */
export function StatusDot({ status, active, className = "" }: { status: ConnStatus; active: boolean; className?: string }) {
  const c = dotColor(status, active);
  const style =
    status === "connected"
      ? { background: c, boxShadow: `inset 0 0 0 1.5px ${c}` }
      : status === "connecting"
        ? { background: `linear-gradient(90deg, ${c} 50%, transparent 50%)`, boxShadow: `inset 0 0 0 1.5px ${c}` }
        : { background: "transparent", boxShadow: `inset 0 0 0 1.5px ${c}` };
  return (
    <span
      aria-hidden
      data-status={status}
      className={`w-2 h-2 rounded-full shrink-0 ${status === "connecting" ? "motion-safe:animate-pulse" : ""} ${className}`}
      style={style}
    />
  );
}

/**
 * Botón "cerrar" de una pestaña. La pestaña activa usa el fondo del tema de terminal, así que
 * el color va sobre --term-fg (no sobre --muted, que es de la interfaz: en modo oscuro con un
 * tema claro, o al revés, no contrasta). Siempre visible al enfocar con el teclado.
 */
export const closeBtnClass = (active: boolean) =>
  `hidden group-hover:grid group-focus-within:grid focus-visible:grid w-6 h-6 shrink-0 place-items-center rounded outline-none focus-visible:ring-2 focus-visible:ring-accent ${
    active ? "text-term-fg/70 hover:text-term-fg hover:bg-term-fg/15" : "text-muted hover:text-fg hover:bg-hover"
  }`;

/**
 * Extremo de una pestaña: el punto de estado y, al pasar el mouse o enfocar, el botón de cierre en el mismo lugar.
 * La casilla de 24 x 24 px se reserva siempre: la pestaña no cambia de ancho (ni el título se corre) al pasar el mouse.
 */
export function TabEnd({ status, active, tabIndex, title, onClose }: { status: ConnStatus; active: boolean; tabIndex: number; title: string; onClose: () => void }) {
  return (
    <span className="relative w-6 h-6 shrink-0 grid place-items-center">
      <StatusDot status={status} active={active} className="group-hover:invisible group-focus-within:invisible" />
      <button
        tabIndex={tabIndex}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={onClose}
        title={`Cerrar (${modLabel}W)`}
        aria-label={`Cerrar ${title}`}
        className={`absolute inset-0 ${closeBtnClass(active)}`}
      >
        <X size={12} />
      </button>
    </span>
  );
}

/** Nombre accesible de una pestaña: título, estado de conexión y marcas pendientes (el punto y los símbolos no se leen). */
export const tabLabel = (title: string, status: ConnStatus, marker: "alert" | "activity" | null, readOnly = false) =>
  `${title}, ${status === "connected" ? "conectada" : status === "connecting" ? "conectando" : "desconectada"}${
    readOnly ? ", solo lectura" : ""
  }${marker === "alert" ? ", alerta por palabra clave" : marker === "activity" ? ", salida nueva" : ""}`;

/** Candado de una pestaña en solo lectura: forma además de color; el estado también va en el nombre accesible (tabLabel). */
export function ReadOnlyMark({ className = "", size = 11 }: { className?: string; size?: number }) {
  return (
    <span title="Solo lectura" className={`shrink-0 grid place-items-center ${className}`}>
      <Lock aria-hidden size={size} />
    </span>
  );
}

export const TabBar = memo(function TabBar(props: TabBarProps) {
  const {
  tabs,
  states,
  activeId,
  onSelect,
  onClose,
  onRename,
  activity,
  split = null,
  onSplit,
  alerted,
  tabLayout,
  } = props;
  const vertical = tabLayout === "vertical";
  const [editing, setEditing] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[]; radio?: boolean } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const drag = useTabDrag("data-tab", "x", props.onReorder);
  // Teclado de la lista (flechas, Supr, F2, tecla de menú): el mismo patrón que la barra vertical.
  const ids = useMemo(() => tabs.map((t) => t.id), [tabs]);
  const keys = useTabKeys({
    orientation: "horizontal",
    attr: "data-tab",
    ids,
    onSelect,
    onClose,
    onRename: setEditing,
    onMenu: (id, el) => {
      const t = tabs.find((x) => x.id === id);
      const r = el.getBoundingClientRect();
      if (t) setMenu({ x: r.left, y: r.bottom + 4, items: tabMenuItems(t, states[id], props, () => setEditing(id)) });
    },
  });
  // Un único tab entra en el orden de Tab (tabindex móvil): el activo o, si no hay, el primero.
  const focusId = tabs.some((t) => t.id === activeId) ? activeId : tabs[0]?.id;
  // La pestaña activa siempre visible: con muchas pestañas o la ventana angosta quedaba fuera
  // de la franja (que se desplaza sin barra visible).
  const stripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLElement>(`[data-tab="${activeId}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeId, tabs.length]);

  const commit = (id: string, value: string) => {
    setEditing(null);
    const tab = tabs.find((t) => t.id === id);
    if (!tab) return;
    const v = value.trim();
    onRename(id, v && v !== tab.session.name ? v : undefined);
  };

  // En vertical, las pestañas y sus controles (vista dividida, modo foco) viven en VerticalTabs.
  if (vertical) return null;

  return (
    <div className="@container h-[34px] shrink-0 flex items-end gap-1 px-1.5 bg-chrome border-b border-line">
      <div
        ref={stripRef}
        className="flex-1 min-w-0 self-stretch flex items-end gap-0.5 overflow-x-auto [scrollbar-width:none]"
        onContextMenu={(e) => {
          // Clic derecho en el espacio libre de la barra: alternar horizontal/vertical.
          if (e.target !== e.currentTarget || !props.onTabLayout) return;
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY, items: layoutItem(props) });
        }}
      >
        <div
          ref={keys.listRef}
          role="tablist"
          aria-orientation="horizontal"
          aria-label="Pestañas abiertas"
          onKeyDown={keys.onKeyDown}
          className="flex items-end gap-0.5 shrink-0"
        >
        {!vertical && tabs.map((t) => {
          const active = t.id === activeId;
          const status = states[t.id]?.status ?? "connecting";
          const marker = alerted?.has(t.id) && !active ? "alert" : activity.has(t.id) && !active ? "activity" : null;
          return (
            <div
              key={t.id}
              data-tab={t.id}
              role="tab"
              aria-selected={active}
              aria-label={tabLabel(tabTitle(t), status, marker, t.readOnly)}
              tabIndex={focusId === t.id ? 0 : -1}
              onMouseDown={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  onClose(t.id);
                } else {
                  // El clic no enfoca la pestaña: el foco sigue en la terminal (si quedara en la
                  // pestaña, Supr la cerraría y lo tecleado no llegaría al equipo). El foco por
                  // teclado (Tab y flechas) no cambia.
                  if (editing !== t.id) e.preventDefault();
                  onSelect(t.id);
                  if (editing !== t.id) drag.begin(e, t.id);
                  if (e.button === 0 && editing !== t.id) props.onFocusTab?.(t.id);
                }
              }}
              onDoubleClick={() => setEditing(t.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                onSelect(t.id);
                setMenu({
                  x: e.clientX,
                  y: e.clientY,
                  items: tabMenuItems(t, states[t.id], props, () => setEditing(t.id)),
                });
              }}
              title={`${tabTitle(t)}${t.title ? ` (${t.session.name})` : ""}\nArrastra para mover · doble clic: renombrar · clic derecho: opciones · clic medio: cerrar`}
              className={`group relative flex items-center gap-2 h-7 pl-3 pr-1 min-w-[128px] max-w-[220px] rounded-t-lg text-[12.5px] cursor-default focus-visible:outline-offset-[-2px] ${
                drag.dragId === t.id ? "opacity-50" : ""
              } ${drag.target?.id === t.id ? dropMark(drag.target.after ? "right" : "left") : ""} ${
                active
                  ? "bg-term text-term-fg border border-line border-b-transparent -mb-px"
                  : "text-muted hover:text-fg hover:bg-hover"
              }`}
            >
              <SessionIcon type={t.session.type} size={13} quick={isQuickSession(t.session)} />
              {editing === t.id ? (
                <input
                  autoFocus
                  className="field !h-6 !px-1.5 flex-1 min-w-0 !text-[12px]"
                  defaultValue={tabTitle(t)}
                  onMouseDown={(e) => e.stopPropagation()}
                  onFocus={(e) => e.currentTarget.select()}
                  onBlur={(e) => commit(t.id, e.currentTarget.value)}
                  aria-label="Nuevo nombre de la pestaña"
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") {
                      e.currentTarget.blur();
                      keys.focusTab(t.id);
                    }
                    if (e.key === "Escape") {
                      setEditing(null);
                      keys.focusTab(t.id);
                    }
                  }}
                />
              ) : (
                <span className={`truncate flex-1 ${t.title ? "italic" : ""}`}>{tabTitle(t)}</span>
              )}
              {t.readOnly && <ReadOnlyMark />}
              {alerted?.has(t.id) && !active ? (
                <span aria-hidden className="text-[11px] font-semibold text-danger shrink-0" title="Alerta por palabra clave">
                  ▲
                </span>
              ) : activity.has(t.id) && !active && (
                <span aria-hidden className="text-[11px] font-semibold text-accent shrink-0" title="Salida nueva">
                  ●
                </span>
              )}
              <TabEnd status={status} active={active} tabIndex={focusId === t.id ? 0 : -1} title={tabTitle(t)} onClose={() => onClose(t.id)} />
            </div>
          );
        })}
        </div>
        {menu && <ContextMenu menu={menu} onClose={closeMenu} />}
        {!vertical && (
          <button
            // El menú se cierra con un clic fuera (mousedown): sin esto, un segundo clic en el "+" lo cierra y lo reabre.
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setMenu((m) => (m ? null : { x: r.left, y: r.bottom + 4, items: newTabMenuItems(props) }));
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ x: e.clientX, y: e.clientY, items: newTabMenuItems(props) });
            }}
            title={`Nueva pestaña: terminal local (${modLabel}T), conexión rápida (${modLabel}O) o nueva sesión`}
            aria-label="Nueva pestaña"
            aria-haspopup="menu"
            className="mb-[5px] ml-1 w-7 h-6 shrink-0 grid place-items-center rounded-md text-muted hover:text-fg hover:bg-hover"
          >
            <Plus size={16} />
          </button>
        )}
      </div>
      {onSplit && (
        <button
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setMenu({ x: r.right - 200, y: r.bottom + 4, items: splitMenuItems(split, onSplit), radio: true });
          }}
          title={split ? `Vista dividida: ${layoutLabel[split]}` : "Vista dividida: ver 2 o 4 pestañas a la vez"}
          aria-label="Vista dividida"
          aria-haspopup="menu"
          aria-pressed={!!split}
          className={`mb-[5px] w-7 h-6 shrink-0 grid place-items-center rounded-md hover:bg-hover ${split ? "text-accent" : "text-muted hover:text-fg"}`}
        >
          {split === "rows" ? <Rows2 size={15} /> : split === "grid" ? <LayoutGrid size={15} /> : <Columns2 size={15} />}
        </button>
      )}
      {props.onToggleFocus && (
        <button
          onClick={props.onToggleFocus}
          title={props.focusMode ? `Salir del modo foco (${focusLabel})` : `Modo foco: solo pestañas y terminal (${focusLabel})`}
          aria-label={props.focusMode ? "Salir del modo foco" : "Modo foco"}
          aria-pressed={!!props.focusMode}
          className={`mb-[5px] h-6 shrink-0 flex items-center gap-1.5 rounded-md hover:bg-hover ${
            props.focusMode ? "px-2 text-[12px] text-accent" : "w-7 justify-center text-muted hover:text-fg"
          }`}
        >
          {props.focusMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          {props.focusMode && "Salir del modo foco"}
        </button>
      )}
    </div>
  );
});

