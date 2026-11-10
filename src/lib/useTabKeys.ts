/**
 * Teclado de una lista de pestañas (patrón Tabs de WAI-ARIA con tabindex móvil), común a la barra
 * horizontal y a la vertical: flechas, Inicio/Fin, Enter o Espacio activan, F2 renombra, Supr cierra
 * (y el foco pasa a la vecina) y la tecla de menú o Shift+F10 abren el menú de la pestaña.
 */
import { useCallback, useEffect, useRef } from "react";
import { afterRemoval, stepIndex } from "./kbNav";

interface Options {
  /** Flechas izquierda/derecha (barra horizontal) o arriba/abajo (columna). */
  orientation: "horizontal" | "vertical";
  /** Atributo `data-*` que lleva el id de cada pestaña. */
  attr: string;
  /** Ids de las pestañas, en orden. */
  ids: string[];
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onRename: (id: string) => void;
  /** Abre el menú de la pestaña bajo `el` (tecla de menú o Shift+F10). */
  onMenu: (id: string, el: HTMLElement) => void;
}

export function useTabKeys<T extends HTMLElement = HTMLDivElement>(o: Options) {
  const listRef = useRef<T>(null);
  const opts = useRef(o);
  opts.current = o;
  // Tras cerrar con Supr el foco pasa a la vecina en cuanto la pestaña desaparece. Si el cierre pide confirmación y se cancela,
  // la pestaña sigue ahí: el aviso se descarta al usar de nuevo el teclado en la lista o a los 2 minutos.
  const pending = useRef<{ closed: string; next: string; at: number } | null>(null);

  const tabs = useCallback(() => Array.from(listRef.current?.querySelectorAll<HTMLElement>('[role="tab"]') ?? []), []);
  /** Lleva el foco a la pestaña `id` (si está dibujada). */
  const focusTab = useCallback(
    (id: string) => {
      const el = tabs().find((x) => x.getAttribute(opts.current.attr) === id);
      el?.focus();
      return !!el;
    },
    [tabs],
  );

  useEffect(() => {
    const p = pending.current;
    if (!p) return;
    if (Date.now() - p.at > 120_000) pending.current = null;
    else if (!o.ids.includes(p.closed)) {
      pending.current = null;
      // Solo si el foco se perdió con la pestaña cerrada: no se roba de un diálogo ni de la terminal.
      const cur = document.activeElement;
      if (!cur || cur === document.body) focusTab(p.next);
    }
  }, [o.ids, focusTab]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;
    if (target.getAttribute("role") !== "tab") return;
    const { attr, orientation, ids, onSelect, onClose, onRename, onMenu } = opts.current;
    pending.current = null;
    const list = tabs();
    const i = list.indexOf(target);
    const id = target.getAttribute(attr)!;
    if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
      e.preventDefault();
      e.stopPropagation();
      return onMenu(id, target);
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "Enter" || e.key === " ") onSelect(id);
    else if (e.key === "F2") onRename(id);
    else if (e.key === "Delete") {
      const n = afterRemoval(ids.length, ids.indexOf(id));
      pending.current = n >= 0 ? { closed: id, next: ids[n], at: Date.now() } : null;
      onClose(id);
    } else {
      const to = stepIndex(e.key, i, list.length, { orientation });
      if (to < 0) return;
      e.preventDefault();
      e.stopPropagation();
      return list[to].focus();
    }
    e.preventDefault();
    e.stopPropagation();
  };

  return { listRef, onKeyDown, focusTab };
}
