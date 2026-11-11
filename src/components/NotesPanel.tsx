import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ITheme } from "@xterm/xterm";
import { ArrowDownToLine, Check, FolderOpen, Lock, MoreHorizontal, Network, Pencil, Plus, Replace, Search, Send, SendHorizontal, ShieldCheck, Trash2, Workflow, X } from "lucide-react";
import { DiagramPreview } from "./DiagramPreview";
import { NETWORK_TEMPLATE } from "../lib/mermaidBlocks";
import { CodeEditor } from "./CodeEditor";
import { NoteSecurity, NoteUnlock } from "./NoteLock";
import { Compiled } from "../lib/highlight";
import { fontStack } from "../lib/theme";
import { isMac, modLabel } from "../lib/platform";
import { PanelResize, panelClass } from "./PanelResize";

/** Atajos del editor de notas: Ctrl o ⌘ más Enter (sin la tecla extra que usan los atajos globales de la app). */
const sendKey = isMac ? "⌘" : "Ctrl+";

interface NoteInfo {
  name: string;
  modified: number;
  /** Cifrada con contraseña: el contenido solo existe en memoria mientras está desbloqueada. */
  protected: boolean;
}

interface NoteMatch {
  name: string;
  line: number;
  snippet: string;
  /** Nota protegida que coincide por nombre (su contenido no se busca). */
  protected: boolean;
}

const AUTO_LOCK_KEY = "notesAutoLockMin";
/** Vista de diagramas abierta (comodidad de este equipo). */
const PREVIEW_KEY = "notesDiagrams";

/** Tema oscuro según el fondo de la terminal (para el estilo de los diagramas). */
function darkBackground(bg: string | undefined): boolean {
  const m = bg?.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
  if (!m) return false;
  const [r, g, b] = m.slice(1).map((h) => parseInt(h, 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5;
}
function storedAutoLock(): number {
  try {
    const v = Number(localStorage.getItem(AUTO_LOCK_KEY));
    return v >= 1 && v <= 60 ? v : 5;
  } catch {
    return 5;
  }
}

/** Posiciones de `find` en `text` (texto plano, opcionalmente sin distinguir mayúsculas). */
function occurrences(text: string, find: string, matchCase: boolean): number[] {
  if (!find) return [];
  const hay = matchCase ? text : text.toLowerCase();
  const needle = matchCase ? find : find.toLowerCase();
  // toLowerCase puede cambiar el largo en algunos caracteres: entonces se busca tal cual.
  if (hay.length !== text.length || needle.length !== find.length) return occurrences(text, find, true);
  const out: number[] = [];
  for (let i = hay.indexOf(needle); i !== -1 && out.length < 10000; i = hay.indexOf(needle, i + needle.length)) out.push(i);
  return out;
}

interface Props {
  width: number;
  onResize: (w: number) => void;
  /** Ancho máximo del arrastre según el reparto de la ventana. */
  resizeMax?: () => number;
  /** Ventana angosta: el panel se superpone a la terminal. */
  overlay?: boolean;
  /** Por qué no se puede enviar ahora (Herramientas a la vista, sin conexión…); null si se puede. */
  blocked?: string | null;
  /** Vuelve a la última terminal (solo con Herramientas a la vista) y el nombre de esa pestaña. */
  onReturn?: () => void;
  returnLabel?: string;
  onClose: () => void;
  compiled: Compiled[];
  theme: ITheme;
  font: string;
  fontSize: number;
  /** Destino de "Enviar"; null si no hay sesión activa. */
  target: string | null;
  onSend: (text: string) => void;
  onCapture: () => string;
}

export const NotesPanel = memo(function NotesPanel(p: Props) {
  const [notes, setNotes] = useState<NoteInfo[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [saved, setSaved] = useState(true);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return setConfirmDelete(false);
    const close = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenuOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [menuOpen]);
  const [notice, setNotice] = useState("");
  const footId = useId();
  const findInfoId = useId();
  const [diagrams, setDiagrams] = useState(() => {
    try {
      return localStorage.getItem(PREVIEW_KEY) === "1";
    } catch {
      return false;
    }
  });
  const toggleDiagrams = (v: boolean) => {
    setDiagrams(v);
    try {
      localStorage.setItem(PREVIEW_KEY, v ? "1" : "0");
    } catch {
      /* solo comodidad */
    }
  };
  const editorRef = useRef<HTMLTextAreaElement>(null);
  // Búsqueda en todas las notas y buscar/reemplazar en la actual (cerradas por defecto).
  const [tool, setTool] = useState<"search" | "replace" | "secure" | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NoteMatch[] | null>(null);
  const [find, setFind] = useState("");
  const [replaceWith, setReplaceWith] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const saveTimer = useRef<number | undefined>(undefined);
  const pendingSave = useRef<{ name: string; content: string; secure: boolean } | null>(null);
  // Nota protegida abierta: el texto descifrado vive solo en `content` y se borra al bloquear.
  const [unlocked, setUnlocked] = useState(false);
  const unlockedRef = useRef(false);
  const [autoLock, setAutoLock] = useState(storedAutoLock);
  const lastActivity = useRef(Date.now());
  const lastTouch = useRef(0);
  const isProtected = notes.find((n) => n.name === current)?.protected ?? false;
  const locked = isProtected && !unlocked;
  const markUnlocked = (v: boolean) => {
    unlockedRef.current = v;
    setUnlocked(v);
    lastActivity.current = Date.now();
  };

  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(""), 3000);
  };

  const flushSave = useCallback(async () => {
    window.clearTimeout(saveTimer.current);
    const job = pendingSave.current;
    if (!job) return;
    pendingSave.current = null;
    if (job.secure) {
      const ok = await invoke("note_save_secure", { name: job.name, content: job.content }).then(
        () => true,
        (e) => (flash(`No se pudo guardar: ${e}`), false),
      );
      // La llave caducó en el backend: se bloquea también aquí (sin texto en claro en memoria).
      if (!ok && unlockedRef.current) {
        unlockedRef.current = false;
        setUnlocked(false);
        setContent("");
      }
    } else {
      await invoke("save_note", { name: job.name, content: job.content }).catch((e) => flash(`No se pudo guardar: ${e}`));
    }
    setSaved(true);
  }, []);

  /** Guarda lo pendiente, borra la llave del backend y el texto descifrado de la memoria. */
  const lockNote = useCallback(
    async (msg?: string) => {
      await flushSave();
      if (!unlockedRef.current) return;
      await invoke("note_lock").catch(() => {});
      unlockedRef.current = false;
      setUnlocked(false);
      setContent("");
      if (msg) flash(msg);
    },
    [flushSave],
  );

  const refresh = useCallback(() => invoke<NoteInfo[]>("list_notes").then(setNotes), []);

  const open = useCallback(
    async (name: string) => {
      await lockNote();
      const list = await invoke<NoteInfo[]>("list_notes").catch(() => null);
      if (list) setNotes(list);
      if (list?.find((n) => n.name === name)?.protected) {
        // Protegida: se muestra la pantalla de contraseña, sin leer nada del disco.
        setCurrent(name);
        setContent("");
        setSaved(true);
        setConfirmDelete(false);
        return;
      }
      let text: string;
      try {
        text = await invoke<string>("read_note", { name });
      } catch (e) {
        // Sin abrirla: mostrarla vacía haría que el autoguardado borre su contenido.
        flash(`No se pudo abrir ${name}: ${e}`);
        return;
      }
      setCurrent(name);
      setContent(text);
      setSaved(true);
      setConfirmDelete(false);
    },
    [lockNote],
  );

  const create = useCallback(async (rename = true) => {
    await lockNote();
    const list = await invoke<NoteInfo[]>("list_notes");
    let name = "Nota";
    for (let i = 2; list.some((n) => n.name === name); i++) name = `Nota ${i}`;
    await invoke("save_note", { name, content: "" });
    await refresh();
    setCurrent(name);
    setContent("");
    if (rename) setRenaming(name);
  }, [lockNote, refresh]);

  useEffect(() => {
    invoke<NoteInfo[]>("list_notes").then((list) => {
      setNotes(list);
      if (list[0]) open(list[0].name);
      else create(false);
    });
    // Al cerrar el panel se guarda lo pendiente y se bloquea la nota protegida abierta.
    return () => {
      flushSave().finally(() => invoke("note_lock").catch(() => {}));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // El CLI Lab guardó una nota: aparece en la lista y, si es la abierta y no hay cambios sin
  // guardar aquí, se recarga (si no, el autoguardado de Notas pisaría lo guardado en el Lab).
  useEffect(() => {
    const onSaved = (e: Event) => {
      const name = (e as CustomEvent<{ name: string }>).detail?.name;
      refresh();
      if (name && name === current && !isProtected && !pendingSave.current)
        invoke<string>("read_note", { name }).then(setContent, () => {});
    };
    window.addEventListener("nt-note-saved", onSaved);
    return () => window.removeEventListener("nt-note-saved", onSaved);
  }, [current, isProtected, refresh]);

  useEffect(() => {
    if (tool !== "search" || query.trim().length < 2) return setResults(null);
    const t = window.setTimeout(async () => {
      await flushSave();
      invoke<NoteMatch[]>("search_notes", { query })
        .then(setResults)
        .catch(() => setResults([]));
    }, 250);
    return () => window.clearTimeout(t);
  }, [tool, query, flushSave]);

  // Bloqueo por inactividad de la nota protegida abierta (el backend tiene su propio plazo).
  useEffect(() => {
    if (!unlocked) return;
    const t = window.setInterval(() => {
      if (Date.now() - lastActivity.current > autoLock * 60_000) lockNote("Nota bloqueada por inactividad");
    }, 5000);
    return () => window.clearInterval(t);
  }, [unlocked, autoLock, lockNote]);

  const activity = () => {
    lastActivity.current = Date.now();
    if (unlockedRef.current && current && Date.now() - lastTouch.current > 30_000) {
      lastTouch.current = Date.now();
      invoke("note_touch", { name: current }).catch(() => {});
    }
  };

  const setAutoLockMin = (min: number) => {
    setAutoLock(min);
    try {
      localStorage.setItem(AUTO_LOCK_KEY, String(min));
    } catch {
      /* sin almacenamiento local: vale solo para esta sesión */
    }
  };

  const idleSecs = autoLock * 60;
  const unlock = async (password: string): Promise<string | null> => {
    if (!current) return null;
    try {
      const text = await invoke<string>("note_unlock", { name: current, password, idleSecs });
      setContent(text);
      setSaved(true);
      markUnlocked(true);
      return null;
    } catch (e) {
      return String(e);
    }
  };

  const protect = async (password: string): Promise<string | null> => {
    if (!current) return null;
    await flushSave();
    try {
      await invoke("note_protect", { name: current, password, idleSecs });
    } catch (e) {
      return String(e);
    }
    markUnlocked(true);
    await refresh();
    setTool(null);
    flash("Nota protegida: cifrada en disco");
    return null;
  };

  const changePassword = async (old: string, next: string): Promise<string | null> => {
    if (!current) return null;
    await flushSave();
    try {
      await invoke("note_change_password", { name: current, old, new: next });
    } catch (e) {
      return String(e);
    }
    flash("Contraseña de la nota actualizada");
    return null;
  };

  const unprotect = async (): Promise<string | null> => {
    if (!current) return null;
    await flushSave();
    try {
      await invoke("note_unprotect", { name: current });
    } catch (e) {
      return String(e);
    }
    unlockedRef.current = false;
    setUnlocked(false);
    await refresh();
    setTool(null);
    flash("Protección quitada: la nota vuelve a ser texto plano");
    return null;
  };

  /** Abre la nota y selecciona la línea encontrada. */
  const jumpTo = async (m: NoteMatch) => {
    if (m.name !== current) await open(m.name);
    if (m.protected) return;
    window.setTimeout(() => {
      const ta = editorRef.current;
      if (!ta) return;
      const lines = ta.value.split("\n");
      const start = lines.slice(0, m.line - 1).reduce((n, l) => n + l.length + 1, 0);
      ta.focus();
      ta.setSelectionRange(start, start + (lines[m.line - 1]?.length ?? 0));
      ta.scrollTop = Math.max(0, (m.line - 1) * p.fontSize * 1.5 - ta.clientHeight / 3);
    }, 30);
  };

  const hits = useMemo(
    () => (tool === "replace" ? occurrences(content, find, matchCase) : []),
    [tool, content, find, matchCase],
  );

  const replaceAll = () => {
    if (!hits.length) return;
    let out = "";
    let last = 0;
    for (const i of hits) {
      out += content.slice(last, i) + replaceWith;
      last = i + find.length;
    }
    edit(out + content.slice(last));
    flash(`${hits.length} reemplazos`);
  };

  const toggleTool = (t: "search" | "replace" | "secure") => setTool((cur) => (cur === t ? null : t));

  const edit = (text: string) => {
    if (locked) return;
    setContent(text);
    if (!current) return;
    setSaved(false);
    pendingSave.current = { name: current, content: text, secure: isProtected };
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(flushSave, 600);
  };

  const commitRename = async (to: string) => {
    const from = renaming;
    setRenaming(null);
    if (!from || !to.trim() || to.trim() === from) return;
    await flushSave();
    try {
      const name = await invoke<string>("rename_note", { from, to });
      await refresh();
      setCurrent(name);
    } catch (e) {
      flash(String(e));
    }
  };

  const remove = async () => {
    if (!current) return;
    if (!confirmDelete) return setConfirmDelete(true);
    window.clearTimeout(saveTimer.current);
    pendingSave.current = null;
    unlockedRef.current = false;
    setUnlocked(false);
    await invoke("delete_note", { name: current }).catch(() => {});
    const list = await invoke<NoteInfo[]>("list_notes");
    setNotes(list);
    setConfirmDelete(false);
    if (list[0]) open(list[0].name);
    else create();
  };

  /** Selección del editor o, si no hay, la línea del cursor (y avanza a la siguiente). */
  const sendSelectionOrLine = () => {
    if (locked) return;
    const ta = editorRef.current;
    if (!ta) return;
    const { selectionStart: s, selectionEnd: e, value } = ta;
    if (s !== e) return p.onSend(value.slice(s, e));
    const start = value.lastIndexOf("\n", s - 1) + 1;
    const endIdx = value.indexOf("\n", s);
    const end = endIdx === -1 ? value.length : endIdx;
    p.onSend(value.slice(start, end) + "\n");
    const next = end === value.length ? end : end + 1;
    ta.setSelectionRange(next, next);
  };

  const capture = () => {
    if (locked) return;
    const sel = p.onCapture();
    if (!sel) return flash("Selecciona texto en la terminal primero");
    const sep = content && !content.endsWith("\n") ? "\n" : "";
    edit(content + sep + sel.replace(/\r/g, "") + "\n");
    flash("Selección agregada al final");
  };

  const blocked = p.blocked ?? "Conecta una sesión para enviar.";
  const lineReason = locked ? "Desbloquea la nota para enviar" : !p.target ? blocked : null;
  const allReason = locked ? "Desbloquea la nota para enviar" : !p.target ? blocked : !content.trim() ? "La nota está vacía" : null;

  return (
    <aside
      data-side-panel
      role="complementary"
      aria-label="Notas"
      className={panelClass(!!p.overlay)}
      style={{ width: p.width }}
      onKeyDownCapture={activity}
      onMouseDownCapture={activity}
      onMouseMove={activity}
      onCopy={() => unlocked && flash("Copiado. Ojo: el portapapeles no está protegido")}
      onCut={() => unlocked && flash("Cortado. Ojo: el portapapeles no está protegido")}
    >
      <PanelResize width={p.width} onResize={p.onResize} max={p.resizeMax} />

      <header className="flex items-center gap-1 h-9 px-2 border-b border-line">
        {renaming !== null ? (
          <input
            autoFocus
            aria-label="Nuevo nombre de la nota"
            className="field !h-7 flex-1"
            defaultValue={renaming}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={(e) => commitRename(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setRenaming(null);
            }}
          />
        ) : (
          <>
            {/* Candado de la nota protegida: con la nota abierta, clic para bloquear. */}
            {isProtected &&
              (unlocked ? (
                <HeadBtn title="Bloquear nota" onClick={() => lockNote()} className="!text-accent">
                  <Lock size={13} />
                </HeadBtn>
              ) : (
                <span title="Nota protegida" className="shrink-0 px-1 text-accent">
                  <Lock size={13} />
                </span>
              ))}
            <select
              aria-label="Nota abierta"
              className="field !h-7 flex-1 min-w-0 !text-[13px]"
              title={current ?? undefined}
              value={current ?? ""}
              onChange={(e) => open(e.target.value)}
            >
              {notes.map((n) => (
                <option key={n.name} value={n.name}>
                  {n.protected ? `${n.name} (protegida)` : n.name}
                </option>
              ))}
            </select>
          </>
        )}
        <span className="hidden @[19rem]:contents">
        <HeadBtn
          title={diagrams ? "Ocultar diagramas" : "Ver diagramas Mermaid de la nota (bloques ```mermaid)"}
          aria-pressed={diagrams}
          onClick={() => toggleDiagrams(!diagrams)}
          className={diagrams ? "!text-accent" : ""}
        >
          <Workflow size={14} />
        </HeadBtn>
        <HeadBtn title="Buscar en todas las notas" aria-pressed={tool === "search"} onClick={() => toggleTool("search")} className={tool === "search" ? "!text-accent" : ""}>
          <Search size={14} />
        </HeadBtn>
        </span>
        <HeadBtn title="Nueva nota" onClick={() => create()}>
          <Plus size={14} />
        </HeadBtn>
        {/* Acciones menos frecuentes en un menú: el selector de nota conserva el ancho. */}
        <div ref={menuRef} className="relative shrink-0">
          <HeadBtn title="Más acciones de la nota" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)} className={menuOpen ? "!text-fg bg-hover" : ""}>
            <MoreHorizontal size={14} />
          </HeadBtn>
          {menuOpen && (
            <div role="menu" className="absolute right-0 top-full mt-1 z-40 w-60 bg-panel border border-line rounded-lg shadow-pop p-1 text-[13px]">
              {/* Panel angosto: diagramas y búsqueda pasan del encabezado a este menú. */}
              <MenuItem
                className={NARROW_ONLY}
                icon={<Search size={14} />}
                label="Buscar en todas las notas"
                active={tool === "search"}
                onClick={() => { toggleTool("search"); setMenuOpen(false); }}
              />
              <MenuItem
                className={NARROW_ONLY}
                icon={<Workflow size={14} />}
                label={diagrams ? "Ocultar diagramas" : "Ver diagramas Mermaid"}
                active={diagrams}
                onClick={() => { toggleDiagrams(!diagrams); setMenuOpen(false); }}
              />
              <MenuItem icon={<Replace size={14} />} label="Buscar y reemplazar" active={tool === "replace"} onClick={() => { toggleTool("replace"); setMenuOpen(false); }} />
              <MenuItem
                icon={<ShieldCheck size={14} />}
                label={isProtected ? "Protección de la nota" : "Proteger con contraseña"}
                hint={locked ? "Desbloquea la nota primero" : undefined}
                disabled={locked}
                active={tool === "secure"}
                onClick={() => { toggleTool("secure"); setMenuOpen(false); }}
              />
              <MenuItem
                icon={<Network size={14} />}
                label="Insertar diagrama de red"
                hint={
                  locked
                    ? "Desbloquea la nota primero"
                    : !current
                      ? "Elige o crea una nota primero"
                      : "Agrega al final de la nota un diagrama Mermaid de ejemplo y abre la vista de diagramas"
                }
                disabled={locked || !current}
                onClick={() => {
                  edit(content + (content && !content.endsWith("\n\n") ? (content.endsWith("\n") ? "\n" : "\n\n") : "") + NETWORK_TEMPLATE);
                  toggleDiagrams(true);
                  setMenuOpen(false);
                }}
              />
              <MenuItem icon={<Pencil size={13} />} label="Renombrar" onClick={() => { if (current) setRenaming(current); setMenuOpen(false); }} />
              <MenuItem icon={<FolderOpen size={14} />} label="Abrir carpeta de notas" onClick={() => { invoke("open_dir", { which: "notes" }); setMenuOpen(false); }} />
              <div className="my-1 border-t border-line" />
              <MenuItem
                icon={<Trash2 size={13} />}
                label={confirmDelete ? "Clic de nuevo para eliminar" : "Eliminar nota"}
                danger
                onClick={async () => { const was = confirmDelete; await remove(); if (was) setMenuOpen(false); }}
              />
            </div>
          )}
        </div>
        <HeadBtn title={`Cerrar (${modLabel}J)`} onClick={p.onClose}>
          <X size={15} />
        </HeadBtn>
      </header>

      {tool === "search" && (
        <div className="border-b border-line px-2 py-1.5 space-y-1">
          <input
            autoFocus
            className="field !h-7 !text-[12px]"
            placeholder="Buscar en todas las notas (mín. 2 caracteres)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setTool(null);
              if (e.key === "Enter" && results?.[0]) jumpTo(results[0]);
            }}
          />
          {results && (
            <ul className="max-h-[35vh] overflow-y-auto text-[12px]">
              {results.length === 0 && <li className="px-1 py-1 text-muted">Sin coincidencias</li>}
              {notes.some((n) => n.protected) && (
                <li className="px-1 py-1 text-[11px] text-muted">Las notas protegidas no se incluyen en la búsqueda</li>
              )}
              {results.map((m, i) => (
                <li key={i}>
                  <button
                    onClick={() => jumpTo(m)}
                    className="w-full text-left px-1.5 py-1 rounded hover:bg-hover"
                    title={m.protected ? `${m.name} (protegida)` : `${m.name}, línea ${m.line}`}
                  >
                    {m.protected ? (
                      <span className="flex items-center gap-1 text-[11px] text-muted truncate">
                        <Lock size={10} className="shrink-0" /> {m.name} · nota protegida, contenido no buscado
                      </span>
                    ) : (
                      <>
                        <span className="block text-[11px] text-muted truncate">
                          {m.name} · línea {m.line}
                        </span>
                        <span className="block truncate font-mono">{m.snippet}</span>
                      </>
                    )}
                  </button>
                </li>
              ))}
              {results.length >= 200 && <li className="px-1 py-1 text-muted">Se muestran los primeros 200 resultados</li>}
            </ul>
          )}
        </div>
      )}
      {tool === "secure" && current && !locked && (
        <NoteSecurity
          key={`${current}-${isProtected}`}
          name={current}
          isProtected={isProtected}
          autoLock={autoLock}
          onAutoLock={setAutoLockMin}
          onProtect={protect}
          onChange={changePassword}
          onUnprotect={unprotect}
          onLock={() => {
            setTool(null);
            lockNote();
          }}
          onClose={() => setTool(null)}
        />
      )}
      {tool === "replace" && !locked && (
        <div className="border-b border-line px-2 py-1.5 space-y-1 text-[12px]">
          <div className="flex items-center gap-1">
            <input
              autoFocus
              className="field !h-7 !text-[12px] flex-1"
              placeholder="Buscar en esta nota"
              value={find}
              onChange={(e) => setFind(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setTool(null)}
            />
            <button
              title="Distinguir mayúsculas"
              onClick={() => setMatchCase((v) => !v)}
              className={`w-7 h-7 shrink-0 rounded-md text-[11px] font-semibold hover:bg-hover ${matchCase ? "text-accent bg-hover" : "text-muted"}`}
            >
              Aa
            </button>
          </div>
          <div className="flex items-center gap-1">
            <input
              className="field !h-7 !text-[12px] flex-1"
              placeholder="Reemplazar por"
              value={replaceWith}
              onChange={(e) => setReplaceWith(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setTool(null);
                if (e.key === "Enter") replaceAll();
              }}
            />
            <button
              onClick={replaceAll}
              disabled={!hits.length}
              aria-describedby={hits.length ? undefined : findInfoId}
              title={hits.length ? `Reemplazar las ${hits.length} coincidencias` : find ? "No hay coincidencias para reemplazar" : "Escribe el texto a reemplazar"}
              className="px-2 h-7 shrink-0 rounded-md border border-line hover:bg-hover disabled:opacity-40"
            >
              Reemplazar todo
            </button>
          </div>
          <p id={findInfoId} className="text-[11px] text-muted">
            {find ? `${hits.length >= 10000 ? "10.000+" : hits.length} ${hits.length === 1 ? "coincidencia" : "coincidencias"} en ${current ?? "la nota"}` : "Texto plano, sin expresiones regulares"}
          </p>
        </div>
      )}

      {locked && current ? (
        <NoteUnlock key={current} name={current} onUnlock={unlock} />
      ) : (
        <div className="flex-1 min-h-0 flex flex-col">
        <CodeEditor
          ref={editorRef}
          value={content}
          onChange={edit}
          compiled={p.compiled}
          theme={p.theme}
          font={fontStack(p.font)}
          fontSize={p.fontSize}
          placeholder={`Comandos, plantillas o config.\n${sendKey}Enter: envía la línea o selección\n${sendKey}${isMac ? "⇧" : "Shift+"}Enter: envía todo`}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              if (e.shiftKey) p.onSend(content);
              else sendSelectionOrLine();
            }
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
              e.preventDefault();
              flushSave();
            }
          }}
        />
        {diagrams && (
          <section aria-label="Diagramas de la nota" className="h-1/2 min-h-[120px] overflow-auto border-t border-line bg-bg">
            <DiagramPreview text={content} dark={darkBackground(p.theme.background)} name={current ?? "nota"} onNotice={flash} />
          </section>
        )}
        </div>
      )}

      <footer className="border-t border-line px-2 py-1.5 space-y-1">
        {/* En un panel angosto los botones bajan a una segunda fila en vez de partir su texto. */}
        <div className="flex flex-wrap items-center gap-1">
          <FootBtn
            onClick={sendSelectionOrLine}
            disabled={!!lineReason}
            aria-describedby={lineReason ? footId : undefined}
            title={lineReason ?? `Enviar la línea o selección (${sendKey}Enter)`}
          >
            <SendHorizontal size={13} />
            {/* Panel angosto: texto corto para que los botones quepan en una fila. */}
            <span className="@[20rem]:hidden">Línea</span>
            <span className="hidden @[20rem]:inline">Línea / selección</span>
          </FootBtn>
          <FootBtn
            onClick={() => p.onSend(content)}
            disabled={!!allReason}
            aria-describedby={allReason ? footId : undefined}
            title={allReason ?? `Enviar toda la nota (${sendKey}${isMac ? "⇧" : "Shift+"}Enter)`}
          >
            <Send size={13} /> Todo
          </FootBtn>
          <FootBtn
            onClick={capture}
            disabled={locked}
            aria-describedby={locked ? footId : undefined}
            title={locked ? "Desbloquea la nota para capturar" : "Agregar a la nota el texto seleccionado en la terminal"}
          >
            <ArrowDownToLine size={13} /> Capturar
          </FootBtn>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted min-h-6">
          <span
            id={footId}
            role="status"
            className={`flex-1 min-w-0 ${p.target || notice ? "truncate" : "text-warn leading-snug"}`}
            title={notice || (p.target ? `Destino: ${p.target}` : blocked)}
          >
            {notice || (p.target ? `Destino: ${p.target}` : blocked)}
          </span>
          {!p.target && !notice && p.onReturn && (
            <button onClick={p.onReturn} className="shrink-0 h-6 px-2 rounded-md border border-line bg-panel text-fg hover:bg-hover max-w-full truncate">
              Volver a {p.returnLabel ?? "la terminal"}
            </button>
          )}
          <span className="flex items-center gap-1 shrink-0">
            {locked ? <Lock size={11} /> : saved ? <Check size={11} /> : null}
            {locked ? "Bloqueada" : saved ? (unlocked ? "Cifrada" : "Guardado") : "Guardando…"}
          </span>
        </div>
      </footer>
    </aside>
  );
});

/** Solo en el menú "…" cuando el panel es angosto (los botones del encabezado se ocultan). */
const NARROW_ONLY = "@[19rem]:hidden";

function HeadBtn({ className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      aria-label={props.title}
      {...props}
      className={`w-7 h-7 shrink-0 grid place-items-center rounded-md text-muted hover:text-fg hover:bg-hover ${className}`}
    />
  );
}

function MenuItem(p: { icon: React.ReactNode; label: string; hint?: string; onClick: () => void; disabled?: boolean; active?: boolean; danger?: boolean; className?: string }) {
  return (
    <button
      role={p.active === undefined ? "menuitem" : "menuitemcheckbox"}
      aria-checked={p.active === undefined ? undefined : p.active}
      disabled={p.disabled}
      title={p.hint ?? p.label}
      onClick={p.onClick}
      className={`w-full flex items-center gap-2 px-2 h-8 rounded-md text-left hover:bg-hover disabled:opacity-40 disabled:hover:bg-transparent ${
        p.danger ? "text-danger" : p.active ? "text-accent" : ""
      } ${p.className ?? ""}`}
    >
      <span className="w-4 grid place-items-center shrink-0">{p.icon}</span>
      {p.label}
    </button>
  );
}

function FootBtn(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="shrink-0 whitespace-nowrap flex items-center gap-1.5 px-2 h-7 rounded-md text-[12px] text-muted hover:text-fg hover:bg-hover disabled:opacity-40 disabled:hover:bg-transparent"
    />
  );
}
