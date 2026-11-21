import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ChevronRight, History, ListX, Search } from "lucide-react";
import { Session, sessionTarget } from "../types";
import { QuickBolt, SessionIcon, typeLabel } from "./SessionIcon";
import { useModal } from "../lib/useModal";
import { fold, parseQuick, quickTarget } from "../lib/quickTarget";

/** Acción de la app en la paleta (p. ej. "Cerrar todas las sesiones"). */
export interface PaletteAction {
  label: string;
  detail: string;
  shortcut?: string;
  /** Acción que corta conexiones o cierra pestañas: ícono y color de peligro (forma además de color). */
  danger?: boolean;
  run: () => void;
}

interface Props {
  sessions: Session[];
  onClose: () => void;
  onOpen: (s: Session) => void;
  actions?: PaletteAction[];
}

type Group = "recent" | "saved" | "quick" | "action";
type Item =
  | { group: Exclude<Group, "action">; session: Session; quick: boolean; recent: boolean; action?: undefined }
  | { group: "action"; action: PaletteAction };

/** Encabezado de cada grupo de resultados (la misma separación que el Command Center de VS Code). */
const GROUP_LABEL: Record<Group, string> = {
  recent: "Recientes",
  saved: "Sesiones",
  quick: "Conexión rápida",
  action: "Acciones",
};

// parseQuick y quickTarget viven en lib/quickTarget (también los usa la pantalla de inicio sin cargar la paleta).
export { parseQuick, quickTarget };

export function CommandPalette({ sessions, onClose, onOpen, actions = [] }: Props) {
  const modal = useModal({ onClose });
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  // Últimos destinos de conexión rápida (archivo en la carpeta de datos, máx. 20).
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => {
    invoke<string[]>("recent_targets").then(setRecent).catch(() => {});
  }, []);

  const items = useMemo((): Item[] => {
    const q = query.trim().toLowerCase();
    // Con texto, las acciones que coinciden van primero; sin texto, al final de la lista.
    const words = fold(q).split(/\s+/).filter(Boolean);
    const acts = actions
      .filter((a) => words.every((w) => fold(a.label).includes(w)))
      .map((action) => ({ group: "action" as const, action }));
    const recents = q
      ? []
      : recent
          .map((t) => parseQuick(t)[0])
          .filter((s): s is Session => !!s)
          .map((s) => ({ group: "recent" as const, session: s, quick: true, recent: true }));
    const saved = sessions
      .filter((s) =>
        !q || [s.name, s.host, s.folder, s.serial_port].some((v) => v?.toLowerCase().includes(q)),
      )
      .slice(0, 50)
      .map((s) => ({ group: "saved" as const, session: s, quick: false, recent: false }));
    const quick = parseQuick(query).map((s) => ({ group: "quick" as const, session: s, quick: true, recent: false }));
    return q ? [...acts, ...recents, ...saved, ...quick] : [...recents, ...saved, ...quick, ...acts];
  }, [query, sessions, recent, actions]);

  useEffect(() => setIndex(0), [query]);
  // La opción activa siempre a la vista al moverse con las flechas.
  useEffect(() => {
    document.getElementById(`palette-opt-${index}`)?.scrollIntoView({ block: "nearest" });
  }, [index]);

  const choose = (i: number) => {
    const item = items[i];
    if (!item) return;
    if (item.action) {
      onClose();
      item.action.run();
      return;
    }
    if (item.quick) invoke("recent_target_add", { target: quickTarget(item.session) }).catch(() => {});
    onOpen(item.session);
    onClose();
  };

  const clearRecent = () => {
    invoke("recent_targets_clear").catch(() => {});
    setRecent([]);
  };

  // Grupos consecutivos de la lista plana (el índice de cada opción sigue siendo global: flechas y aria-activedescendant).
  const groups = useMemo(() => {
    const out: { group: Group; start: number; items: Item[] }[] = [];
    items.forEach((item, i) => {
      const last = out[out.length - 1];
      if (last?.group === item.group) last.items.push(item);
      else out.push({ group: item.group, start: i, items: [item] });
    });
    return out;
  }, [items]);

  const optionClass = (i: number) =>
    `flex items-center gap-3 px-3 h-11 rounded-lg ${i === index ? "bg-selected shadow-[inset_2px_0_0_0_var(--accent)]" : ""}`;

  const renderItem = (item: Item, i: number) => {
    if (item.action) {
      const a = item.action;
      return (
        <li
          key={`action-${a.label}`}
          id={`palette-opt-${i}`}
          role="option"
          aria-selected={i === index}
          onMouseMove={() => setIndex(i)}
          onClick={() => choose(i)}
          className={optionClass(i)}
        >
          {a.danger ? (
            <ListX aria-hidden size={15} className="text-danger shrink-0" />
          ) : (
            <ChevronRight aria-hidden size={15} className="text-muted shrink-0" />
          )}
          <div className="min-w-0 flex-1 leading-tight">
            <div className={`truncate ${a.danger ? "text-danger" : ""}`}>{a.label}</div>
            <div className="truncate text-[11.5px] text-muted">{a.detail}</div>
          </div>
          {a.shortcut && <kbd className="text-[11px] text-muted font-sans">{a.shortcut}</kbd>}
        </li>
      );
    }
    const { session: s, quick, recent: isRecent } = item;
    return (
      <li
        key={isRecent ? `recent-${i}` : quick ? `quick-${s.type}` : s.id}
        id={`palette-opt-${i}`}
        role="option"
        aria-selected={i === index}
        onMouseMove={() => setIndex(i)}
        onClick={() => choose(i)}
        className={optionClass(i)}
      >
        {isRecent ? (
          <History aria-hidden size={15} className="text-muted shrink-0" />
        ) : quick ? (
          <QuickBolt size={15} />
        ) : (
          <SessionIcon type={s.type} size={15} />
        )}
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate">
            {isRecent ? sessionTarget(s) : quick ? `Conexión rápida ${typeLabel[s.type]}` : s.name}
          </div>
          <div className="truncate text-[11.5px] text-muted">
            {isRecent ? "Conexión rápida reciente" : sessionTarget(s)}
            {!quick && s.folder ? ` · ${s.folder}` : ""}
          </div>
        </div>
        <span className="text-[11px] font-medium text-muted uppercase">{typeLabel[s.type]}</span>
      </li>
    );
  };

  return (
    <div {...modal.overlay} className="fixed inset-0 z-50 flex justify-center pt-[12vh] bg-black/25" onMouseDown={onClose}>
      {/* El foco queda atrapado (Tab no sale a la barra lateral ni a la terminal de detrás): lo hace useModal. */}
      <div
        {...modal.dialog}
        aria-labelledby={undefined}
        aria-label="Buscar sesión o acción"
        className="w-[560px] max-w-[92vw] h-fit bg-panel border border-line rounded-xl shadow-pop overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 px-4 h-12 border-b border-line">
          <Search aria-hidden size={16} className="text-muted" />
          <input
            autoFocus
            role="combobox"
            aria-expanded
            aria-controls="palette-list"
            aria-autocomplete="list"
            aria-activedescendant={items.length ? `palette-opt-${index}` : undefined}
            aria-label="Buscar sesión o acción"
            className="flex-1 bg-transparent outline-none text-[14px] placeholder:text-muted"
            placeholder="Sesión, acción o user@host…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((i) => Math.min(i + 1, items.length - 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((i) => Math.max(i - 1, 0));
              }
              if (e.key === "Enter") choose(index);
            }}
          />
        </div>
        <ul id="palette-list" role="listbox" aria-label="Resultados" className="max-h-[50vh] overflow-y-auto p-1.5">
          {groups.map((g) => (
            <li key={`${g.group}-${g.start}`} role="presentation" className="[&+&]:mt-1.5">
              <div className="flex items-center justify-between px-3 h-7 text-[11px] font-semibold uppercase tracking-wide text-muted">
                <span id={`palette-grp-${g.group}`}>{GROUP_LABEL[g.group]}</span>
                {g.group === "recent" && (
                  <button
                    className="h-6 px-1.5 -mr-1.5 rounded normal-case font-normal tracking-normal hover:text-fg hover:bg-hover"
                    onClick={clearRecent}
                  >
                    Borrar recientes
                  </button>
                )}
              </div>
              <ul role="group" aria-labelledby={`palette-grp-${g.group}`}>
                {g.items.map((item, k) => renderItem(item, g.start + k))}
              </ul>
            </li>
          ))}
          {items.length === 0 && (
            <li role="presentation" className="px-3 py-6 text-center text-muted text-[12px]">
              Sin resultados. Prueba con <code>ssh user@host</code> o <code>telnet host 23</code>.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
