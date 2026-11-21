import { Fragment, memo, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Check,
  ChevronsDownUp,
  ClipboardCopy,
  Columns2,
  Copy,
  FileDown,
  FileUp,
  Folder,
  FolderOpen,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  Zap,
  Search,
  Trash2,
  UserRound,
  ArrowDownUp,
} from "lucide-react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { ConnStatus, Session, sessionTarget } from "../types";
import { SessionIcon } from "./SessionIcon";
import { modLabel } from "../lib/platform";
import { TreeRow, treeKey } from "../lib/kbNav";
import { focusOrigin, setMenuOrigin } from "../lib/useModal";
import {
  FolderNode,
  SidebarOrder,
  TreeItem,
  allFolders,
  findFolder,
  itemKey,
  orderedItems,
  placeKey,
  baseName,
  buildTree,
  freeName,
  isWithin,
  joinPath,
  normPath,
  parentOf,
  rebase,
  sessionsWithin,
  own,
} from "../lib/folders";

import { plural } from "../lib/plural";
import { PanelResize } from "./PanelResize";
export interface ConfirmRequest {
  title: string;
  message: string;
  label: string;
  danger?: boolean;
  action: () => void;
}

interface Props {
  sessions: Session[];
  extraFolders: string[];
  /** Ancho en px de la barra (lo arrastra el usuario por su borde derecho). */
  width: number;
  onResize: (w: number) => void;
  /** Ancho máximo del arrastre y vista previa de lo que depende del ancho (panel derecho, barra flotante). */
  resizeMax?: () => number;
  onResizePreview?: (w: number | null) => void;
  /** Orden manual por carpeta: carpetas y sesiones intercaladas (p. ej. "Shell local" arriba). */
  order: SidebarOrder;
  onSetOrder: (order: SidebarOrder) => void;
  /** Estado de conexión por id de sesión guardada (si tiene pestañas abiertas). */
  live: Record<string, ConnStatus>;
  onOpen: (s: Session) => void;
  onOpenMany: (list: Session[]) => void;
  onNew: (folder?: string) => void;
  onEdit: (s: Session) => void;
  onDuplicate: (s: Session) => void;
  onDelete: (s: Session) => void;
  onUpdateSessions: (changed: Session[]) => void;
  onSetExtraFolders: (folders: string[]) => void;
  onConfirm: (req: ConfirmRequest) => void;
  /** Abre la importación desde PuTTY, SecureCRT, MobaXterm, OpenSSH o CSV. */
  onImportFile?: () => void;
  /** Abre "Exportar sesiones" con la carpeta indicada preseleccionada (sin carpeta: todas). */
  onExportFile?: (folder?: string) => void;
  /** Conexión rápida sin guardar (SSH, Telnet, Serial). */
  onQuickConnect?: () => void;
  /** Conecta la sesión en vista dividida junto a la pestaña actual (sin manejador, el ítem no aparece). */
  onOpenSplit?: (s: Session) => void;
  /** Conecta con otro usuario sin cambiar la sesión guardada (sin manejador, el ítem no aparece). */
  onOpenAs?: (s: Session) => void;
}

/**
 * [etiqueta, icono, acción, deshabilitado, atajo que se muestra a la derecha, separador antes, submenú].
 * Con submenú la acción no se usa: el ítem abre la lista con clic, Enter o flecha derecha.
 */
type MenuItem = [string, React.ReactNode, () => void, boolean?, string?, boolean?, MenuItem[]?];
/**
 * `radio`: el cuarto elemento de cada ítem marca la opción elegida (menuitemradio con check) en vez de deshabilitarla.
 * `owner`: quién lo abrió (para el aria-expanded del botón que lo despliega).
 */
type Menu = { x: number; y: number; items: MenuItem[]; radio?: boolean; owner?: string };
type Selected = { kind: "session"; id: string } | { kind: "folder"; path: string } | null;

/** Dónde cae lo arrastrado sobre una fila: antes, después o dentro de una carpeta. */
type DropPos = "before" | "after" | "into";
const DND_SESSION = "application/x-nt-session";
const DND_FOLDER = "application/x-nt-folder";

/** Desde cuántas filas visibles se dibuja solo la ventana a la vista. */
const VIRTUAL_FROM = 200;
/** Filas extra arriba y abajo de la ventana (scroll sin parpadeo). */
const OVERSCAN = 12;

/** Une grupos de ítems con un separador entre ellos (los grupos vacíos no cuentan). */
function grouped(...groups: MenuItem[][]): MenuItem[] {
  return groups
    .filter((g) => g.length)
    .flatMap((g, gi) =>
      g.map((it, i): MenuItem => {
        if (gi === 0 || i > 0) return it;
        const [label, icon, action, disabled, shortcut, , sub] = it;
        return [label, icon, action, disabled, shortcut, true, sub];
      }),
    );
}

/** Lo que copia "Copiar host": IP o nombre del equipo, o el puerto en una serial; nada en la terminal local. */
function hostOf(s: Session): string | undefined {
  return (s.type === "serial" ? s.serial_port : s.type === "local" ? undefined : s.host)?.trim() || undefined;
}

function loadCollapsed(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem("collapsedFolders") ?? "{}");
  } catch {
    return {};
  }
}

export const Sidebar = memo(function Sidebar(p: Props) {
  const { sessions, extraFolders } = p;
  const [filter, setFilter] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(loadCollapsed);
  const [selected, setSelected] = useState<Selected>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  /** Indicador de reordenamiento: fila (clave de árbol con su carpeta) y posición. */
  const [dropHint, setDropHint] = useState<{ row: string; pos: DropPos } | null>(null);
  const expandTimer = useRef<number | undefined>(undefined);
  /** Aviso bajo la cabecera: los errores en rojo; una confirmación (p. ej. host copiado) en tono neutro. */
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const addWasOpen = useRef(false);
  // Teclado (árbol WAI-ARIA con tabindex móvil): la fila que recibe el foco con Tab y la que debe tomarlo tras el próximo dibujo.
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const pendingFocus = useRef<{ key: string; tries: number } | null>(null);
  /** Enter o Esc en el campo de renombrar devuelven el foco a la fila; un clic fuera no. */
  const refocusRename = useRef(false);
  const filterRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem("collapsedFolders", JSON.stringify(collapsed));
    } catch {
      /* sin almacenamiento: no se recuerda */
    }
  }, [collapsed]);

  const flash = (msg: string, error = true) => {
    setNotice({ text: msg, error });
    window.setTimeout(() => setNotice((n) => (n?.text === msg ? null : n)), 3000);
  };

  const folders = useMemo(() => allFolders(sessions, extraFolders), [sessions, extraFolders]);

  // Diferido: el campo muestra cada tecla al instante y el árbol (con miles de sesiones, lo caro) se
  // filtra después con el último texto. Todo lo que depende del árbol usa este mismo valor.
  const q = useDeferredValue(filter.trim().toLowerCase());
  const matches = useMemo(
    () =>
      q
        ? sessions.filter((s) => [s.name, s.host, s.serial_port, s.folder, s.username].some((v) => v?.toLowerCase().includes(q)))
        : null,
    [sessions, q],
  );
  const tree = useMemo(() => (matches ? buildTree(matches, []) : buildTree(sessions, extraFolders)), [sessions, extraFolders, matches]);

  // ---------- Operaciones de carpetas ----------

  const createFolder = (parent: string) => {
    const path = freeName(folders, parent);
    p.onSetExtraFolders([...extraFolders, path]);
    if (parent) setCollapsed((c) => ({ ...c, [parent]: false }));
    setRenaming(path);
  };

  /** Mueve o renombra una carpeta con todo su contenido (si el destino existe, se fusionan). */
  const moveFolderTo = (from: string, to: string) => {
    if (from === to) return;
    const changed = sessionsWithin(sessions, from).map((s) => ({
      ...s,
      folder: rebase(normPath(s.folder), from, to),
    }));
    if (changed.length) p.onUpdateSessions(changed);
    p.onSetExtraFolders([...new Set(extraFolders.map((f) => rebase(normPath(f), from, to)))]);
    setCollapsed((c) => Object.fromEntries(Object.entries(c).map(([k, v]) => [rebase(k, from, to), v])));
    // El orden manual sigue a la carpeta: sus subcarpetas cambian de ruta y, si solo se
    // renombró, conserva su lugar entre sus hermanas.
    const next: SidebarOrder = {};
    for (const [k, v] of Object.entries(p.order)) next[rebase(k, from, to)] = v;
    if (parentOf(from) === parentOf(to) && next[parentOf(from)])
      next[parentOf(from)] = next[parentOf(from)].map((k) => (k === `f:${baseName(from)}` ? `f:${baseName(to)}` : k));
    p.onSetOrder(next);
  };

  const commitRename = (path: string, raw: string) => {
    setRenaming(null);
    const refocus = refocusRename.current;
    refocusRename.current = false;
    const name = raw.replace(/\//g, "-").trim();
    if (!name || name === baseName(path)) return refocus && focusLater(`f:${path}`);
    const target = joinPath(parentOf(path), name);
    if (folders.includes(target)) {
      flash(`Ya existe la carpeta "${name}"`);
      return refocus && focusLater(`f:${path}`);
    }
    moveFolderTo(path, target);
    if (refocus) focusLater(`f:${target}`);
  };

  const deleteFolder = (path: string) => {
    const inside = sessionsWithin(sessions, path);
    const up = parentOf(path);
    const remove = () => {
      if (inside.length)
        p.onUpdateSessions(
          inside.map((s) => ({ ...s, folder: rebase(normPath(s.folder), path, up) || undefined })),
        );
      p.onSetExtraFolders(
        extraFolders
          .map((f) => normPath(f))
          .filter((f) => f !== path)
          .map((f) => rebase(f, path, up))
          .filter(Boolean),
      );
    };
    if (!inside.length) return remove();
    p.onConfirm({
      title: `¿Eliminar la carpeta "${baseName(path)}"?`,
      message: `${inside.length === 1 ? "Su sesión o subcarpeta pasa" : `Sus ${inside.length} sesiones y subcarpetas pasan`} a ${up || "la raíz"}. No se elimina ninguna sesión.`,
      label: "Eliminar carpeta",
      danger: true,
      action: remove,
    });
  };

  const connectAll = (path: string) => {
    const list = sessionsWithin(sessions, path);
    if (!list.length) return;
    if (list.length <= 5) return p.onOpenMany(list);
    p.onConfirm({
      title: `¿Conectar ${plural(list.length, "sesión", "sesiones")}?`,
      message: `Se abrirá una pestaña por cada equipo de "${baseName(path)}".`,
      label: "Conectar todas",
      action: () => p.onOpenMany(list),
    });
  };

  const deleteSession = (s: Session) =>
    p.onConfirm({
      title: `¿Eliminar "${s.name}"?`,
      message: `${sessionTarget(s)}. Esta acción no se puede deshacer.`,
      label: "Eliminar",
      danger: true,
      action: () => p.onDelete(s),
    });

  // ---------- Menús contextuales ----------

  /** Con el mouse el menú nace en el puntero; desde el teclado (tecla de menú, Shift+F10, Enter en "Más acciones"), bajo la fila. */
  const openMenu = (anchor: React.MouseEvent | HTMLElement, items: MenuItem[]) => {
    if (anchor instanceof HTMLElement) {
      const r = anchor.getBoundingClientRect();
      return setMenu({ x: r.left + 28, y: r.bottom, items });
    }
    anchor.preventDefault();
    anchor.stopPropagation();
    setMenu({ x: anchor.clientX, y: anchor.clientY, items });
  };
  /** Clic del mouse o activación con teclado (detail 0) sobre un botón dentro de una fila. */
  const anchorOf = (e: React.MouseEvent<HTMLElement>): React.MouseEvent | HTMLElement =>
    e.detail === 0 ? (e.currentTarget.closest<HTMLElement>("[data-rowkey]") ?? e.currentTarget) : e;

  const folderMenu = (e: React.MouseEvent | HTMLElement, node: FolderNode) => {
    setSelected({ kind: "folder", path: node.path });
    openMenu(
      e,
      grouped(
        [[`Conectar todas (${node.total})`, <Play size={13} />, () => connectAll(node.path), node.total === 0]],
        [
          ["Nueva sesión aquí", <Plus size={13} />, () => p.onNew(node.path)],
          ["Nueva subcarpeta", <FolderPlus size={13} />, () => createFolder(node.path)],
        ],
        [
          ["Renombrar", <Pencil size={13} />, () => setRenaming(node.path), false, "F2"],
          ...(p.onExportFile ? [["Exportar sesiones…", <FileDown size={13} />, () => p.onExportFile?.(node.path), node.total === 0] as MenuItem] : []),
          sortItem({ kind: "folder", node }, parentOf(node.path)),
        ],
        [["Eliminar carpeta", <Trash2 size={13} />, () => deleteFolder(node.path), false, "Supr"]],
      ),
    );
  };

  const copyHost = (host: string) =>
    writeText(host).then(
      () => flash(`Copiado: ${host}`, false),
      () => flash("No se pudo copiar al portapapeles"),
    );

  /** Grupos: conectar | copiar | editar y ordenar | eliminar (lo destructivo, aislado al final). */
  const sessionMenu = (e: React.MouseEvent | HTMLElement, s: Session) => {
    setSelected({ kind: "session", id: s.id });
    const host = hostOf(s);
    // La terminal local no tiene usuario ni host: "Conectar como…" no aplica.
    const remote = s.type !== "local" && s.type !== "serial";
    openMenu(
      e,
      grouped(
        [
          ["Conectar", <Play size={13} />, () => p.onOpen(s), false, "Enter"],
          ...(p.onOpenSplit ? [["Conectar en vista dividida", <Columns2 size={13} />, () => p.onOpenSplit!(s)] as MenuItem] : []),
          ...(p.onOpenAs && remote ? [["Conectar como…", <UserRound size={13} />, () => p.onOpenAs!(s)] as MenuItem] : []),
        ],
        host ? [[s.type === "serial" ? "Copiar puerto serial" : "Copiar host", <ClipboardCopy size={13} />, () => void copyHost(host)]] : [],
        [
          ["Editar", <Pencil size={13} />, () => p.onEdit(s)],
          ["Duplicar", <Copy size={13} />, () => p.onDuplicate(s)],
          sortItem({ kind: "session", session: s }, normPath(s.folder)),
        ],
        [["Eliminar", <Trash2 size={13} />, () => deleteSession(s), false, "Supr"]],
      ),
    );
  };

  /** Lo que agrega o trae sesiones: el "+" de la cabecera y el clic derecho en el fondo del árbol. */
  const addItems = (folder: string | undefined): MenuItem[] =>
    grouped(
      [
        ["Nueva sesión…", <Plus size={13} />, () => p.onNew(folder || undefined), false, `${modLabel}N`],
        ["Nueva carpeta", <FolderPlus size={13} />, () => createFolder(folder ?? "")],
      ],
      p.onQuickConnect ? [["Conexión rápida…", <Zap size={13} />, p.onQuickConnect, false, `${modLabel}O`]] : [],
      [
        ...(p.onImportFile ? [["Importar sesiones…", <FileUp size={13} />, p.onImportFile] as MenuItem] : []),
        ...(p.onExportFile ? [["Exportar sesiones…", <FileDown size={13} />, () => p.onExportFile?.()] as MenuItem] : []),
      ],
    );
  /** El menú del "+" nace bajo el botón, alineado a su borde izquierdo. */
  const addMenu = (btn: HTMLElement) => {
    const r = btn.getBoundingClientRect();
    setMenu({ x: r.left, y: r.bottom + 4, items: addItems(selectedFolder(selected, sessions)), owner: "add" });
  };

  // ---------- Orden manual ----------

  /** Deja un elemento (sesión o carpeta) en `parent`, antes o después de `anchor`, o al inicio o al final. */
  const placeItem = (moved: { sid?: string; fpath?: string }, parent: string, anchor: string | null, where: "before" | "after" | "start" | "end") => {
    let key: string;
    if (moved.sid) {
      const s = sessions.find((x) => x.id === moved.sid);
      if (!s) return;
      if (normPath(s.folder) !== parent) p.onUpdateSessions([{ ...s, folder: parent || undefined }]);
      key = `s:${s.id}`;
    } else if (moved.fpath) {
      if (isWithin(parent, moved.fpath)) return flash("No se puede mover una carpeta dentro de sí misma");
      const dest = joinPath(parent, baseName(moved.fpath));
      if (dest !== moved.fpath && folders.includes(dest)) return flash(`Ya existe la carpeta "${baseName(dest)}" ahí`);
      if (parentOf(moved.fpath) !== parent) moveFolderTo(moved.fpath, dest);
      key = `f:${baseName(moved.fpath)}`;
    } else return;
    const node = findFolder(buildTree(sessions, extraFolders), parent);
    const current = node ? orderedItems(node, own(p.order, parent)).map(itemKey) : [];
    p.onSetOrder({ ...p.order, [parent]: placeKey(current, key, anchor, where) });
  };

  /** Sube o baja un elemento un lugar entre sus hermanos (menú y teclado, sin arrastrar). */
  const shiftItem = (it: TreeItem, parent: string, dir: -1 | 1) => {
    const node = findFolder(buildTree(sessions, extraFolders), parent);
    if (!node) return;
    const list = orderedItems(node, own(p.order, parent)).map(itemKey);
    const i = list.indexOf(itemKey(it));
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    p.onSetOrder({ ...p.order, [parent]: list });
  };

  const moveItems = (it: TreeItem, parent: string): MenuItem[] => {
    const moved = it.kind === "session" ? { sid: it.session.id } : { fpath: it.node.path };
    return [
      ["Mover al inicio", <ArrowUpToLine size={13} />, () => placeItem(moved, parent, null, "start"), !!q],
      ["Subir", <ChevronUp size={13} />, () => shiftItem(it, parent, -1), !!q],
      ["Bajar", <ChevronDown size={13} />, () => shiftItem(it, parent, 1), !!q],
      ["Mover al final", <ArrowDownToLine size={13} />, () => placeItem(moved, parent, null, "end"), !!q],
    ];
  };
  /** Las 4 opciones de orden van en un submenú: es una tarea poco frecuente (también se hace arrastrando). */
  const sortItem = (it: TreeItem, parent: string): MenuItem => [
    "Ordenar",
    <ArrowDownUp size={13} />,
    () => {},
    !!q,
    undefined,
    false,
    moveItems(it, parent),
  ];

  // ---------- Arrastrar y soltar ----------

  const onDrop = (e: React.DragEvent, target: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);
    const sid = e.dataTransfer.getData(DND_SESSION);
    const fpath = e.dataTransfer.getData(DND_FOLDER);
    if (sid) {
      const s = sessions.find((x) => x.id === sid);
      if (s && normPath(s.folder) !== target) p.onUpdateSessions([{ ...s, folder: target || undefined }]);
    } else if (fpath) {
      if (isWithin(target, fpath)) return flash("No se puede mover una carpeta dentro de sí misma");
      if (parentOf(fpath) === target) return;
      moveFolderTo(fpath, joinPath(target, baseName(fpath)));
    }
    if (target) setCollapsed((c) => ({ ...c, [target]: false }));
  };

  const dropProps = (target: string) => ({
    onDragOver: (e: React.DragEvent) => {
      const t = e.dataTransfer.types;
      if (!t.includes(DND_SESSION) && !t.includes(DND_FOLDER)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      setDropTarget(target);
    },
    onDragLeave: () => setDropTarget((t) => (t === target ? null : t)),
    onDrop: (e: React.DragEvent) => onDrop(e, target),
  });

  /**
   * Arrastre sobre una fila: en la mitad de arriba cae antes y en la de abajo después (en una
   * carpeta, el centro es "dentro"). Mantener el arrastre sobre una carpeta cerrada la abre.
   * Con un filtro activo solo se mueve dentro de carpetas: el orden visible está incompleto.
   */
  const rowDropProps = (it: TreeItem, parent: string) => {
    const row = `${parent}|${itemKey(it)}`;
    const posAt = (e: React.DragEvent): DropPos | null => {
      const r = e.currentTarget.getBoundingClientRect();
      const y = (e.clientY - r.top) / Math.max(1, r.height);
      if (it.kind === "folder") {
        if (q) return "into";
        if (y < 0.3) return "before";
        // Abierta, lo de abajo del encabezado ya es su contenido: el borde inferior es "dentro".
        if (y > 0.7 && own(collapsed, it.node.path)) return "after";
        return "into";
      }
      return q ? null : y < 0.5 ? "before" : "after";
    };
    return {
      onDragOver: (e: React.DragEvent) => {
        const t = e.dataTransfer.types;
        if (!t.includes(DND_SESSION) && !t.includes(DND_FOLDER)) return;
        const pos = posAt(e);
        if (!pos) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
        setDropTarget(null);
        setDropHint((h) => (h?.row === row && h.pos === pos ? h : { row, pos }));
        if (pos === "into" && it.kind === "folder" && own(collapsed, it.node.path) && expandTimer.current === undefined) {
          const path = it.node.path;
          expandTimer.current = window.setTimeout(() => {
            expandTimer.current = undefined;
            setCollapsed((c) => ({ ...c, [path]: false }));
          }, 600);
        }
      },
      onDragLeave: () => {
        setDropHint((h) => (h?.row === row ? null : h));
        window.clearTimeout(expandTimer.current);
        expandTimer.current = undefined;
      },
      onDrop: (e: React.DragEvent) => {
        const pos = posAt(e);
        window.clearTimeout(expandTimer.current);
        expandTimer.current = undefined;
        setDropHint(null);
        if (!pos) return;
        if (pos === "into" && it.kind === "folder") return onDrop(e, it.node.path);
        e.preventDefault();
        e.stopPropagation();
        const sid = e.dataTransfer.getData(DND_SESSION) || undefined;
        const fpath = e.dataTransfer.getData(DND_FOLDER) || undefined;
        if ((sid && it.kind === "session" && it.session.id === sid) || (fpath && it.kind === "folder" && it.node.path === fpath)) return;
        placeItem({ sid, fpath }, parent, itemKey(it), pos === "before" ? "before" : "after");
      },
    };
  };
  const hintClass = (it: TreeItem, parent: string) => {
    if (dropHint?.row !== `${parent}|${itemKey(it)}`) return "";
    return dropHint.pos === "before"
      ? "shadow-[inset_0_2px_0_0_var(--accent)]"
      : dropHint.pos === "after"
        ? "shadow-[inset_0_-2px_0_0_var(--accent)]"
        : "bg-selected ring-1 ring-[var(--accent)]";
  };
  const endDrag = () => {
    setDropHint(null);
    setDropTarget(null);
    window.clearTimeout(expandTimer.current);
    expandTimer.current = undefined;
  };

  // ---------- Render ----------

  // ---------- Teclado ----------

  const rowKey = (it: TreeItem) => (it.kind === "folder" ? `f:${it.node.path}` : `s:${it.session.id}`);
  const focusLater = (key: string) => {
    setFocusKey(key);
    pendingFocus.current = { key, tries: 3 };
  };
  /** Foco a la fila `i` de la lista visible; con ventana virtual, antes se desplaza para que esté dibujada. */
  const focusRow = (i: number) => {
    const r = rows[i];
    const nav = navRef.current;
    if (!r) return;
    if (virtual && nav) {
      const y = i * rowH;
      if (y < nav.scrollTop) nav.scrollTop = y;
      else if (y + rowH > nav.scrollTop + nav.clientHeight) nav.scrollTop = y + rowH - nav.clientHeight;
      setView({ top: nav.scrollTop, height: nav.clientHeight });
    }
    focusLater(rowKey(r.it));
  };
  const toggleFolder = (path: string, open?: boolean) =>
    setCollapsed((c) => ({ ...c, [path]: open === undefined ? !c[path] : !open }));

  /** Teclas de una fila del árbol: flechas, Inicio/Fin, Enter, F2, Supr y menú contextual (tecla de menú o Shift+F10). */
  const onRowKey = (e: React.KeyboardEvent<HTMLElement>, index: number) => {
    if (e.target !== e.currentTarget) return;
    const it = rows[index]?.it;
    if (!it) return;
    if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
      e.preventDefault();
      e.stopPropagation();
      return it.kind === "folder" ? folderMenu(e.currentTarget, it.node) : sessionMenu(e.currentTarget, it.session);
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "F2" && it.kind === "folder") return setRenaming(it.node.path);
    if (e.key === "Delete") return it.kind === "folder" ? deleteFolder(it.node.path) : deleteSession(it.session);
    if (e.key === " ") {
      e.preventDefault();
      return setSelected(it.kind === "folder" ? { kind: "folder", path: it.node.path } : { kind: "session", id: it.session.id });
    }
    // Arriba desde la primera fila vuelve al filtro (el recorrido de ida y vuelta de la barra superpuesta).
    if (e.key === "ArrowUp" && index === 0) {
      e.preventDefault();
      return filterRef.current?.focus();
    }
    const page = Math.max(1, Math.floor((navRef.current?.clientHeight ?? 400) / rowH) - 1);
    const mv = treeKey(treeRows, index, e.key, page);
    if (!mv) return;
    e.preventDefault();
    if ("focus" in mv) focusRow(mv.focus);
    else if ("expand" in mv) it.kind === "folder" && toggleFolder(it.node.path, true);
    else if ("collapse" in mv) it.kind === "folder" && toggleFolder(it.node.path, false);
    else if (it.kind === "session") p.onOpen(it.session);
    else {
      setSelected({ kind: "folder", path: it.node.path });
      if (!q) toggleFolder(it.node.path);
    }
  };

  /** Estado de la fila para el árbol: atributos ARIA, tabindex móvil y selección. */
  const rowProps = (key: string, index: number, level: number, label: string, selected: boolean, expanded?: boolean) => ({
    role: "treeitem" as const,
    "aria-level": level,
    "aria-selected": selected,
    "aria-expanded": expanded,
    "aria-label": label,
    "data-rowkey": key,
    tabIndex: key === tabKey ? 0 : -1,
    onFocus: () => setFocusKey((k) => (k === key ? k : key)),
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => onRowKey(e, index),
  });

  // ---------- Render ----------

  /** Barra de acento de 2 px además del tinte: el tinte solo no llega a 3:1 contra el fondo (WCAG 1.4.11). */
  const SEL_BAR = "shadow-[inset_2px_0_0_0_var(--accent)]";

  const renderFolder = (node: FolderNode, depth: number, index: number): React.ReactNode => {
    const isCollapsed = !q && own(collapsed, node.path);
    const isSel = selected?.kind === "folder" && selected.path === node.path;
    const key = `f:${node.path}`;
    const stop = key === tabKey;
    return (
        <div
          key={key}
          data-row
          draggable={renaming !== node.path}
          onDragStart={(e) => {
            e.dataTransfer.setData(DND_FOLDER, node.path);
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragEnd={endDrag}
          {...rowDropProps({ kind: "folder", node }, parentOf(node.path))}
          {...rowProps(key, index, Math.max(0, depth) + 1, `${node.name}, carpeta, ${node.total ? plural(node.total, "sesión", "sesiones") : "vacía"}`, isSel, !isCollapsed)}
          onClick={() => {
            setSelected({ kind: "folder", path: node.path });
            setCollapsed((c) => ({ ...c, [node.path]: !c[node.path] }));
          }}
          onContextMenu={(e) => folderMenu(e, node)}
          style={{ paddingLeft: 6 + depth * 14 }}
          className={`group flex items-center gap-1.5 pr-1 h-7 rounded-md focus-visible:outline-offset-[-2px] ${
            hintClass({ kind: "folder", node }, parentOf(node.path)) || (isSel ? `bg-hover ${SEL_BAR}` : "hover:bg-hover")
          }`}
        >
          <ChevronRight
            size={12}
            aria-hidden
            className={`shrink-0 text-muted transition-transform ${isCollapsed ? "" : "rotate-90"}`}
          />
          {isCollapsed ? (
            <Folder size={14} aria-hidden className="shrink-0 text-muted" />
          ) : (
            <FolderOpen size={14} aria-hidden className="shrink-0 text-muted" />
          )}
          {renaming === node.path ? (
            <input
              autoFocus
              aria-label={`Nuevo nombre de la carpeta ${node.name}`}
              className="field !h-6 !px-1.5 flex-1 min-w-0"
              defaultValue={node.name}
              onClick={(e) => e.stopPropagation()}
              onFocus={(e) => e.currentTarget.select()}
              onBlur={(e) => commitRename(node.path, e.currentTarget.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") {
                  refocusRename.current = true;
                  e.currentTarget.blur();
                }
                if (e.key === "Escape") {
                  setRenaming(null);
                  focusLater(key);
                }
              }}
            />
          ) : (
            <span className="truncate flex-1 font-medium text-[12.5px]">{node.name}</span>
          )}
          <span aria-hidden className="text-[11px] text-muted group-hover:hidden group-focus-within:hidden">{node.total || ""}</span>
          <RowBtn
            title="Más acciones"
            aria-label={`Más acciones de la carpeta ${node.name}`}
            tabIndex={stop ? 0 : -1}
            className="hidden group-hover:grid group-focus-within:grid"
            onClick={(e) => folderMenu(anchorOf(e), node)}
          >
            <MoreHorizontal size={14} />
          </RowBtn>
        </div>
    );
  };

  const renderSession = (s: Session, depth: number, index: number) => {
    const isSel = selected?.kind === "session" && selected.id === s.id;
    const status = p.live[s.id];
    const key = `s:${s.id}`;
    const stop = key === tabKey;
    const statusWord = status === "connected" ? "conectada" : status === "connecting" ? "conectando" : "cerrada";
    return (
      <div
        key={key}
        data-row
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(DND_SESSION, s.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={endDrag}
        {...rowDropProps({ kind: "session", session: s }, normPath(s.folder))}
        {...rowProps(key, index, Math.max(0, depth) + 1, status ? `${s.name}, pestaña abierta, ${statusWord}` : s.name, isSel)}
        onClick={() => setSelected({ kind: "session", id: s.id })}
        onDoubleClick={() => p.onOpen(s)}
        onContextMenu={(e) => sessionMenu(e, s)}
        title={`${sessionTarget(s)}\nDoble clic o Enter: conectar · clic derecho o Shift+F10: más opciones`}
        style={{ paddingLeft: 24 + depth * 14 }}
        className={`group flex items-center gap-2 pr-1 h-7 rounded-md focus-visible:outline-offset-[-2px] ${
          hintClass({ kind: "session", session: s }, normPath(s.folder)) || (isSel ? `bg-selected ${SEL_BAR}` : "hover:bg-hover")
        }`}
      >
        <SessionIcon type={s.type} size={14} />
        <span className="truncate flex-1 text-[13px]">{s.name}</span>
        {status && (
          <>
            {/* Estado por forma además de color: círculo relleno = conectada, rombo = conectando, anillo vacío = cerrada. */}
            <span
              aria-hidden
              className={`w-2 h-2 shrink-0 group-hover:hidden group-focus-within:hidden ${
                status === "closed" ? "rounded-full border-[1.5px] border-[var(--muted)]" : status === "connecting" ? "rotate-45 animate-pulse" : "rounded-full"
              }`}
              title="Pestaña abierta"
              style={status === "connected" ? { background: "var(--ok)" } : status === "connecting" ? { background: "var(--warn)" } : undefined}
            />
            <span className="sr-only">Pestaña abierta, {statusWord}</span>
          </>
        )}
        <div className="hidden group-hover:flex group-focus-within:flex items-center">
          <RowBtn title="Editar" aria-label={`Editar ${s.name}`} tabIndex={stop ? 0 : -1} onClick={() => p.onEdit(s)}>
            <Pencil size={12} />
          </RowBtn>
          <RowBtn title="Más acciones" aria-label={`Más acciones de ${s.name}`} tabIndex={stop ? 0 : -1} onClick={(e) => sessionMenu(anchorOf(e), s)}>
            <MoreHorizontal size={14} />
          </RowBtn>
        </div>
      </div>
    );
  };

  // Árbol visible como lista plana (carpetas abiertas o filtradas): base del render por ventana.
  const rows = useMemo(() => {
    const out: { it: TreeItem; depth: number }[] = [];
    const walk = (node: FolderNode, depth: number) => {
      for (const it of orderedItems(node, own(p.order, node.path))) {
        out.push({ it, depth });
        if (it.kind === "folder" && (q || !own(collapsed, it.node.path))) walk(it.node, depth + 1);
      }
    };
    for (const it of orderedItems(tree, own(p.order, ""))) {
      out.push({ it, depth: it.kind === "folder" ? 0 : -1 });
      if (it.kind === "folder" && (q || !own(collapsed, it.node.path))) walk(it.node, 1);
    }
    return out;
  }, [tree, p.order, collapsed, q]);

  // Con inventarios grandes solo se dibujan las filas a la vista (todas miden lo mismo): con
  // 2.000 sesiones abiertas el arranque dibujaba 6.000 íconos.
  const navRef = useRef<HTMLElement>(null);
  const [view, setView] = useState({ top: 0, height: 800 });
  const [rowH, setRowH] = useState(28);
  const virtual = rows.length > VIRTUAL_FROM;
  useLayoutEffect(() => {
    const el = navRef.current;
    if (!el || !virtual) return;
    const row = el.querySelector<HTMLElement>("[data-row]");
    if (row?.offsetHeight) setRowH(row.offsetHeight);
    const sync = () => setView({ top: el.scrollTop, height: el.clientHeight });
    sync();
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(sync);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [virtual]);
  // Al filtrar, los resultados se ven desde arriba.
  useLayoutEffect(() => {
    if (navRef.current) navRef.current.scrollTop = 0;
    setView((v) => (v.top ? { ...v, top: 0 } : v));
  }, [q]);
  // Si la lista se achica (carpeta cerrada, filtro), la ventana no puede quedar más allá del final.
  const top = Math.max(0, Math.min(view.top, rows.length * rowH - view.height));
  const first = virtual ? Math.max(0, Math.floor(top / rowH) - OVERSCAN) : 0;
  const last = virtual ? Math.min(rows.length, Math.ceil((top + view.height) / rowH) + OVERSCAN) : rows.length;
  const renderRow = ({ it, depth }: { it: TreeItem; depth: number }, index: number) =>
    it.kind === "folder" ? renderFolder(it.node, depth, index) : renderSession(it.session, depth, index);

  // Para el teclado: nivel y estado de cada fila visible, y la única fila que entra en el orden de Tab (la
  // que tuvo el foco, si no la seleccionada, si no la primera dibujada).
  const treeRows = useMemo<TreeRow[]>(
    () =>
      rows.map(({ it, depth }) => ({
        level: Math.max(0, depth) + 1,
        folder: it.kind === "folder",
        // Con filtro las carpetas no se pliegan.
        expanded: it.kind === "folder" && !q ? !own(collapsed, it.node.path) : undefined,
      })),
    [rows, collapsed, q],
  );
  const visibleKeys = rows.slice(first, last).map((r) => rowKey(r.it));
  const selKey = selected ? (selected.kind === "folder" ? `f:${selected.path}` : `s:${selected.id}`) : null;
  const tabKey = [focusKey, selKey].find((k) => k && visibleKeys.includes(k)) ?? visibleKeys[0] ?? null;
  // Un foco pedido (flechas, Esc al renombrar) se aplica cuando la fila ya está dibujada.
  useLayoutEffect(() => {
    const want = pendingFocus.current;
    if (!want) return;
    const el = Array.from(navRef.current?.querySelectorAll<HTMLElement>("[data-rowkey]") ?? []).find((x) => x.dataset.rowkey === want.key);
    if (el) {
      el.focus();
      pendingFocus.current = null;
    } else if (--want.tries <= 0) pendingFocus.current = null;
  });

  const empty = tree.children.length === 0 && tree.sessions.length === 0;

  return (
    <aside
      style={{ width: p.width }}
      className="relative shrink-0 h-full flex flex-col bg-chrome border-r border-line"
    >
      {/* Cabecera: título con un solo "+" (todo lo que agrega o trae sesiones) y, abajo, el filtro a todo el ancho. */}
      <div className="px-2.5 pt-2 pb-2 flex flex-col gap-1.5">
        <div className="flex items-center gap-0.5">
          <h2 className="flex-1 min-w-0 pl-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Sesiones</h2>
          <HeadBtn
            title="Agregar: nueva sesión, carpeta, conexión rápida, importar o exportar"
            aria-label="Agregar sesión o carpeta"
            aria-haspopup="menu"
            aria-expanded={menu?.owner === "add"}
            // El mousedown fuera del menú ya lo cierra: con el menú abierto, el clic en "+" no lo reabre.
            onMouseDown={() => (addWasOpen.current = menu?.owner === "add")}
            onClick={(e) => {
              const wasOpen = addWasOpen.current && e.detail !== 0;
              addWasOpen.current = false;
              if (!wasOpen) addMenu(e.currentTarget);
            }}
          >
            <Plus size={16} />
          </HeadBtn>
          <HeadBtn title="Contraer todas las carpetas" onClick={() => setCollapsed(Object.fromEntries(folders.map((f) => [f, true])))}>
            <ChevronsDownUp size={15} />
          </HeadBtn>
        </div>
        <div className="relative">
          <Search size={14} aria-hidden className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            className={`field !h-7 !pl-8 !text-[12px] ${matches ? "!pr-10" : ""}`}
            placeholder="Filtrar sesiones…"
            title="Filtra las sesiones por nombre, IP, usuario o carpeta. Esc: limpiar"
            aria-label="Filtrar sesiones por nombre, IP, usuario o carpeta"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            ref={filterRef}
            onKeyDown={(e) => {
              if (e.key === "Escape" && filter) {
                e.preventDefault();
                setFilter("");
              } else if (e.key === "ArrowDown" && rows.length) {
                // Flecha abajo pasa al árbol: a la fila con foco o seleccionada, si no a la primera.
                e.preventDefault();
                focusRow(Math.max(0, rows.findIndex((r) => rowKey(r.it) === tabKey)));
              }
            }}
          />
          {matches && (
            <span aria-hidden className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted tabular-nums">
              {matches.length}
            </span>
          )}
          {/* El contador se anuncia sin mover el foco del campo. */}
          <span role="status" className="sr-only">
            {matches ? (matches.length ? `${plural(matches.length, "sesión", "sesiones")} encontradas` : "Sin coincidencias") : ""}
          </span>
        </div>
      </div>

      {notice && (
        <p role={notice.error ? "alert" : "status"} className={`px-3 pb-1 text-[11.5px] break-words ${notice.error ? "text-danger" : "text-muted"}`}>
          {notice.text}
        </p>
      )}

      <nav
        ref={navRef}
        aria-label="Sesiones guardadas"
        className={`flex-1 overflow-y-auto px-1.5 pb-3 ${dropTarget === "" ? "bg-selected" : ""}`}
        onContextMenu={(e) => openMenu(e, addItems(""))}
        {...dropProps("")}
        onClick={(e) => e.target === e.currentTarget && setSelected(null)}
      >
        <div role="tree" aria-label="Sesiones y carpetas" aria-orientation="vertical">
          {virtual && <div style={{ height: first * rowH }} role="presentation" aria-hidden />}
          {rows.slice(first, last).map((r, k) => renderRow(r, first + k))}
          {virtual && <div style={{ height: (rows.length - last) * rowH }} role="presentation" aria-hidden />}
        </div>

        {empty && (
          <div className="px-3 py-8 text-center text-[12px] text-muted">
            {q ? "Sin coincidencias" : "Crea una sesión o una carpeta. Clic derecho para más opciones."}
            {!q && p.onImportFile && (
              <button className="block mx-auto mt-2 min-h-6 px-1 text-accent hover:underline" onClick={p.onImportFile}>
                Importar desde PuTTY, SecureCRT, MobaXterm…
              </button>
            )}
          </div>
        )}
      </nav>

      {menu && <ContextMenu menu={menu} onClose={closeMenu} />}
      <PanelResize side="right" width={p.width} onResize={p.onResize} max={p.resizeMax} preview={p.onResizePreview} />
    </aside>
  );
});

/** Carpeta destino según la selección: la carpeta seleccionada o la de la sesión seleccionada. */
function selectedFolder(sel: Selected, sessions: Session[]): string | undefined {
  if (sel?.kind === "folder") return sel.path;
  if (sel?.kind === "session") return normPath(sessions.find((s) => s.id === sel.id)?.folder) || undefined;
  return undefined;
}

export function ContextMenu({ menu, onClose }: { menu: Menu; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: menu.x, y: menu.y });
  /** Submenú abierto: índice del ítem padre, su caja y si el foco debe entrar (teclado) o no (mouse). */
  const [sub, setSub] = useState<{ index: number; anchor: DOMRect; focus: boolean } | null>(null);
  const hoverTimer = useRef<number | undefined>(undefined);

  // Ajusta la posición para que el menú no se salga de la ventana.
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setPos({
      x: Math.min(menu.x, window.innerWidth - r.width - 8),
      y: Math.min(menu.y, window.innerHeight - r.height - 8),
    });
    setSub(null);
  }, [menu]);

  useEffect(() => {
    const onMouse = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !subRef.current?.contains(t)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("mousedown", onMouse);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("mousedown", onMouse);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);
  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);

  // Teclado: el foco entra al primer ítem, las flechas lo mueven y, si la acción no deja el foco
  // en otro lado (un campo, un diálogo), vuelve a donde estaba (p. ej. la terminal).
  useEffect(() => {
    const prev = focusOrigin();
    // Un diálogo abierto desde el menú devuelve el foco a quien abrió el menú, no al ítem que desaparece.
    setMenuOrigin(prev);
    ref.current?.querySelector<HTMLElement>('button:not([disabled])')?.focus({ preventScroll: true });
    return () => {
      const cur = document.activeElement;
      if ((!cur || cur === document.body) && prev?.isConnected) prev.focus({ preventScroll: true });
    };
  }, []);

  /** Flechas, Inicio y Fin dentro de una lista (menú o submenú); Tab cierra todo, como un menú nativo. */
  const listKey = (e: React.KeyboardEvent, box: HTMLElement | null) => {
    const items = Array.from(box?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? []);
    if (!items.length) return false;
    const i = items.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (e.key === "ArrowDown") next = (i + 1) % items.length;
    else if (e.key === "ArrowUp") next = (i - 1 + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    else if (e.key === "Tab") {
      e.preventDefault();
      onClose();
      return true;
    } else return false;
    e.preventDefault();
    items[next].focus();
    return true;
  };
  const parentBtn = (index: number) => ref.current?.querySelector<HTMLElement>(`[data-index="${index}"]`);
  const openSub = (index: number, el: HTMLElement, focus: boolean) => {
    window.clearTimeout(hoverTimer.current);
    setSub({ index, anchor: el.getBoundingClientRect(), focus });
  };
  const closeSub = (refocus: boolean) => {
    if (!sub) return;
    const btn = parentBtn(sub.index);
    setSub(null);
    if (refocus) btn?.focus();
  };
  const onMenuKey = (e: React.KeyboardEvent) => {
    if (listKey(e, ref.current)) return;
    const active = document.activeElement as HTMLElement | null;
    const index = Number(active?.dataset.index);
    if (e.key === "ArrowRight" && menu.items[index]?.[6]?.length && active) {
      e.preventDefault();
      openSub(index, active, true);
    } else if (e.key === "ArrowLeft" && sub) {
      e.preventDefault();
      closeSub(true);
    }
  };
  const onSubKey = (e: React.KeyboardEvent) => {
    if (listKey(e, subRef.current)) return;
    if (e.key === "ArrowLeft" || e.key === "Escape") {
      // Esc cierra solo el submenú (no llega al cierre general de la ventana).
      e.preventDefault();
      e.stopPropagation();
      closeSub(true);
    }
  };
  /** Con el mouse, el submenú se abre al quedarse sobre su ítem y se cierra al pasar a otro. */
  const onHover = (index: number, el: HTMLElement, hasSub: boolean) => {
    window.clearTimeout(hoverTimer.current);
    if (hasSub && sub?.index === index) return;
    if (!hasSub && !sub) return;
    hoverTimer.current = window.setTimeout(() => (hasSub ? openSub(index, el, false) : setSub(null)), 150);
  };

  const item = (it: MenuItem, index: number, inSub: boolean) => {
    const [label, icon, action, disabled, shortcut, separated, children] = it;
    const radio = !inSub && menu.radio;
    const hasSub = !inSub && !!children?.length;
    const open = hasSub && sub?.index === index;
    return (
      <Fragment key={label}>
        {separated && <div role="separator" className="my-1 mx-2 h-px bg-line" />}
        <button
          data-index={inSub ? undefined : index}
          role={radio ? "menuitemradio" : "menuitem"}
          aria-checked={radio ? !!disabled : undefined}
          aria-haspopup={hasSub ? "menu" : undefined}
          aria-expanded={hasSub ? open : undefined}
          disabled={radio ? false : disabled}
          onMouseEnter={inSub ? undefined : (e) => onHover(index, e.currentTarget, hasSub)}
          onClick={(e) => {
            // Siempre abre (el paso del mouse ya pudo abrirlo); con teclado (detail 0) el foco entra a la lista.
            if (hasSub) return openSub(index, e.currentTarget, e.detail === 0);
            onClose();
            action();
          }}
          className={`w-full flex items-center gap-2.5 px-2.5 h-7 rounded-md text-left text-[12.5px] hover:bg-hover focus-visible:bg-hover focus-visible:!outline-offset-[-2px] disabled:opacity-40 ${
            label.startsWith("Eliminar") ? "text-danger" : ""
          } ${open ? "bg-hover" : ""}`}
        >
          <span className="text-muted">{icon}</span>
          <span className={`flex-1 ${radio && disabled ? "font-medium" : ""}`}>{label}</span>
          {radio && <Check size={13} aria-hidden className={`text-accent ${disabled ? "" : "invisible"}`} />}
          {shortcut && <kbd className="ml-4 text-[11px] text-muted font-sans">{shortcut}</kbd>}
          {hasSub && <ChevronRight size={13} aria-hidden className="ml-4 text-muted" />}
        </button>
      </Fragment>
    );
  };

  const subItems = sub ? menu.items[sub.index]?.[6] : undefined;
  return (
    <>
      <div
        ref={ref}
        role="menu"
        onKeyDown={onMenuKey}
        className="fixed z-50 min-w-48 p-1 bg-panel border border-line rounded-lg shadow-pop"
        style={{ left: pos.x, top: pos.y }}
      >
        {menu.items.map((it, i) => item(it, i, false))}
      </div>
      {sub && subItems && (
        <SubMenu
          boxRef={subRef}
          anchor={sub.anchor}
          focus={sub.focus}
          label={menu.items[sub.index][0]}
          onKeyDown={onSubKey}
          onMouseEnter={() => window.clearTimeout(hoverTimer.current)}
        >
          {subItems.map((it, i) => item(it, i, true))}
        </SubMenu>
      )}
    </>
  );
}

/** Lista desplegada a la derecha de su ítem (a la izquierda si no cabe), dentro de la ventana. */
function SubMenu({
  boxRef,
  anchor,
  focus,
  label,
  onKeyDown,
  onMouseEnter,
  children,
}: {
  boxRef: React.RefObject<HTMLDivElement | null>;
  anchor: DOMRect;
  focus: boolean;
  label: string;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onMouseEnter: () => void;
  children: React.ReactNode;
}) {
  const [pos, setPos] = useState({ x: anchor.right + 2, y: anchor.top - 5 });
  useLayoutEffect(() => {
    const r = boxRef.current?.getBoundingClientRect();
    if (!r) return;
    const right = anchor.right + 2;
    setPos({
      x: right + r.width > window.innerWidth - 8 ? Math.max(8, anchor.left - r.width - 2) : right,
      y: Math.max(8, Math.min(anchor.top - 5, window.innerHeight - r.height - 8)),
    });
    if (focus) boxRef.current?.querySelector<HTMLElement>("button:not([disabled])")?.focus({ preventScroll: true });
  }, [anchor, focus, boxRef]);
  return (
    <div
      ref={boxRef}
      role="menu"
      aria-label={label}
      onKeyDown={onKeyDown}
      onMouseEnter={onMouseEnter}
      className="fixed z-50 min-w-44 p-1 bg-panel border border-line rounded-lg shadow-pop"
      style={{ left: pos.x, top: pos.y }}
    >
      {children}
    </div>
  );
}

function HeadBtn(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      aria-label={props.title}
      {...props}
      className="w-7 h-7 shrink-0 grid place-items-center rounded-md text-muted hover:text-fg hover:bg-hover"
    />
  );
}

function RowBtn({ className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      onClick={(e) => {
        e.stopPropagation();
        props.onClick?.(e);
      }}
      onDoubleClick={(e) => e.stopPropagation()}
      className={`w-6 h-6 place-items-center rounded text-muted hover:text-fg ${className || "grid"}`}
    />
  );
}
