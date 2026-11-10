import { useEffect, useId, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Search, Send, Trash2 } from "lucide-react";
import { stepIndex } from "../lib/kbNav";
import { returnTarget } from "../lib/useModal";

interface Entry {
  cmd: string;
  ts: number;
}

interface Props {
  /** Clave del equipo (ver historyKey). */
  historyKey: string;
  /** Nombre de la pestaña dueña del historial: el panel la sigue y reenvía a ella, no a la activa. */
  tabName: string;
  /** false si el panel se abrió desde una pestaña que no es la activa. */
  isActiveTab: boolean;
  connected: boolean;
  /** Reenvía a la pestaña del historial por el mismo camino con control de riesgo que Notas y el catálogo. */
  onResend: (cmd: string) => void;
  onClose: () => void;
  /** A dónde va el foco al cerrar con Esc si no se sabe quién abrió el panel (por ejemplo, desde la paleta): la terminal. */
  focusFallback?: () => void;
}

/**
 * Historial de comandos enviados desde Notas, catálogo y botones para el equipo de UNA pestaña.
 * Se abre desde la barra de estado, el menú de la pestaña, la paleta o el atajo; se lee solo al montarse (sin costo cerrado).
 * El panel pertenece a su pestaña: al cambiar de pestaña activa sigue mostrando la suya (lo dice el título),
 * reenviar va siempre a ella y, si se cierra, el panel se cierra.
 * Teclado (panel emergente, no un modal: sin trampa de foco): al abrirse el foco va al filtro; Abajo/Arriba/Inicio/Fin
 * recorren filtro y entradas, Enter reenvía la enfocada, Esc limpia el filtro y luego cierra devolviendo el foco a quien
 * lo abrió (el botón, o la terminal si fue con atajo) y salir del panel con Tab lo cierra.
 */
export function HistoryMenu({ historyKey, tabName, isActiveTab, connected, onResend, onClose, focusFallback }: Props) {
  const [items, setItems] = useState<Entry[] | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [q, setQ] = useState("");
  /** Entrada con el foco (la única en el orden de Tab). */
  const [cur, setCur] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const noteId = useId();
  const [trigger] = useState(returnTarget);
  const qRef = useRef(q);
  qRef.current = q;
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return items && t ? items.filter((e) => e.cmd.toLowerCase().includes(t)) : items;
  }, [items, q]);
  const given = useRef(false);
  const pressed = useRef(false);

  /** Cierra y devuelve el foco a quien abrió el panel. */
  const closeBack = () => {
    onClose();
    if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    else focusFallback?.();
  };
  const closeBackRef = useRef(closeBack);
  closeBackRef.current = closeBack;

  // Foco inicial: al panel mientras carga y al filtro en cuanto hay entradas.
  useEffect(() => {
    if (items === null || given.current) return;
    given.current = true;
    (items.length ? filterRef.current : box.current)?.focus({ preventScroll: true });
  }, [items]);
  useEffect(() => {
    box.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    invoke<Entry[]>("cmd_history", { key: historyKey })
      .then(setItems)
      .catch(() => setItems([]));
    // El botón del historial en la barra de estado alterna el panel: no lo cierra aquí para que el clic no lo reabra.
    const onDown = (e: MouseEvent) =>
      !box.current?.contains(e.target as Node) && !(e.target as Element).closest?.("[data-history-btn]") && onClose();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || document.querySelector('[role="menu"]')) return;
      // Con texto en el filtro, el primer Esc lo limpia.
      if (qRef.current && document.activeElement === filterRef.current) return;
      e.preventDefault();
      closeBackRef.current();
    };
    // Con Tab el foco puede salir del panel sin pasar por un blur con destino (sale a la ventana y vuelve): al llegar a otro lado, se cierra.
    const onIn = (e: FocusEvent) => {
      const t = e.target as Element | null;
      if (t && !box.current?.contains(t) && !t.closest?.("[data-history-btn]")) onClose();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    document.addEventListener("focusin", onIn);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("focusin", onIn);
    };
  }, [historyKey, onClose]);

  const clear = () => {
    if (!confirmClear) return setConfirmClear(true);
    invoke("cmd_history_clear", { key: historyKey }).catch(() => {});
    setItems([]);
    setConfirmClear(false);
    box.current?.focus({ preventScroll: true });
  };

  const entries = () => Array.from(box.current?.querySelectorAll<HTMLElement>("[data-hentry]") ?? []);
  /** Abajo/Arriba/Inicio/Fin: del filtro a las entradas y de la primera entrada de vuelta al filtro. */
  const onNav = (e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    const list = entries();
    const a = document.activeElement as HTMLElement | null;
    if (a === filterRef.current) {
      if (e.key !== "ArrowDown" || !list.length) return;
      e.preventDefault();
      return list[0].focus();
    }
    const i = a ? list.indexOf(a) : -1;
    if (i < 0) return;
    if (e.key === "ArrowUp" && i === 0 && filterRef.current) {
      e.preventDefault();
      return filterRef.current.focus();
    }
    const to = stepIndex(e.key, i, list.length, { orientation: "vertical", wrap: false });
    if (to < 0) return;
    e.preventDefault();
    list[to].focus();
  };

  return (
    <div
      ref={box}
      role="dialog"
      aria-label={`Historial de comandos enviados de ${tabName}`}
      tabIndex={-1}
      onKeyDown={onNav}
      onMouseDown={() => {
        pressed.current = true;
        window.setTimeout(() => (pressed.current = false), 400);
      }}
      onBlur={(e) => {
        // Panel emergente: al llevar el foco fuera (otro control o, con Tab, más allá del último), se cierra. El botón del
        // historial lo alterna por su cuenta; un clic dentro del panel o el cambio de ventana no cuentan como salir.
        const to = e.relatedTarget as Element | null;
        const root = e.currentTarget;
        if (to) {
          if (!root.contains(to) && !to.closest("[data-history-btn]")) onClose();
        } else if (!pressed.current) {
          window.setTimeout(() => {
            if (document.hasFocus() && !root.contains(document.activeElement) && !(document.activeElement as Element | null)?.closest("[data-history-btn]")) onClose();
          }, 0);
        }
      }}
      className="outline-none fixed bottom-9 right-3 z-40 w-[420px] max-w-[calc(100vw-1.5rem)] bg-panel border border-line rounded-lg shadow-pop text-[12px] text-fg overflow-hidden"
    >
      <div className="flex items-center justify-between gap-2 px-3 h-8 border-b border-line text-muted">
        <span className="min-w-0 truncate" title="Últimos comandos enviados desde Notas, el catálogo y los botones">
          Historial de <b className="font-semibold text-fg">{tabName}</b>
          {!isActiveTab && " (otra pestaña)"}
        </span>
        {!!items?.length && (
          <button
            onClick={clear}
            onMouseLeave={() => setConfirmClear(false)}
            className={`flex items-center gap-1 hover:text-danger ${confirmClear ? "text-danger" : ""}`}
            title="Borrar el historial de este equipo"
          >
            <Trash2 size={12} />
            {confirmClear ? "Confirmar" : "Borrar"}
          </button>
        )}
      </div>
      {/* Sin conexión los comandos no se pueden reenviar: se dice por qué (y no solo en el tooltip). */}
      {!connected && !!items?.length && (
        <p id={noteId} className="px-3 py-1.5 border-b border-line text-[11px] text-warn">
          {tabName} no está conectada: reconecta para reenviar un comando.
        </p>
      )}
      {!!items?.length && (
        <div className="relative px-2 pt-2 pb-1">
          <Search size={13} className="absolute left-4 top-1/2 -translate-y-[40%] text-muted pointer-events-none" />
          <input
            ref={filterRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setCur(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape" && q) {
                e.preventDefault();
                setQ("");
              } else if (e.key === "Enter") {
                e.preventDefault();
                entries()[0]?.focus();
              }
            }}
            placeholder="Filtrar comandos…"
            aria-label="Filtrar el historial por texto"
            className="field !h-7 !pl-7 !text-[12px]"
          />
        </div>
      )}
      <ul className="max-h-[320px] overflow-y-auto p-1">
        {items === null && <li className="px-2 py-3 text-muted">Cargando…</li>}
        {!!items?.length && shown?.length === 0 && <li className="px-2 py-3 text-muted">Sin coincidencias con «{q.trim()}».</li>}
        {items?.length === 0 && (
          <li className="px-2 py-3 text-muted">
            Sin comandos registrados. Se guardan los enviados desde Notas, el catálogo y los botones, nunca lo que
            escribes en la terminal.
          </li>
        )}
        {shown?.map((e, idx) => {
          const lines = e.cmd.split("\n");
          return (
            <li key={e.ts + e.cmd}>
              <button
                data-hentry=""
                // aria-disabled (no disabled): sin conexión la entrada se sigue alcanzando con el teclado y dice por qué no envía.
                aria-disabled={!connected}
                tabIndex={idx === Math.min(cur, shown.length - 1) ? 0 : -1}
                onFocus={() => setCur(idx)}
                aria-describedby={connected ? undefined : noteId}
                title={connected ? `Reenviar a ${tabName}:\n${e.cmd}` : `Conecta ${tabName} para reenviar`}
                onClick={() => {
                  if (!connected) return;
                  onClose();
                  onResend(e.cmd);
                }}
                className={`group w-full flex items-center gap-2 px-2 h-7 rounded-md text-left focus-visible:bg-hover ${
                  connected ? "hover:bg-hover" : "opacity-60"
                }`}
              >
                <span className="flex-1 min-w-0 truncate font-mono">
                  {lines[0]}
                  {lines.length > 1 && <span className="text-muted"> (+{lines.length - 1} líneas)</span>}
                </span>
                <span className="text-[11px] text-muted shrink-0">
                  {new Date(e.ts).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}
                </span>
                {connected && <Send size={12} className="text-accent shrink-0 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" />}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
