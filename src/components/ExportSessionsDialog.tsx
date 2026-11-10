import { useId, useMemo, useState } from "react";
import { useModal } from "../lib/useModal";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { FileDown, Folder, Lock, X } from "lucide-react";
import { Session, sessionTarget } from "../types";
import { SessionIcon } from "./SessionIcon";
import { isWithin, normPath } from "../lib/folders";
import { sessionsToXml } from "../lib/sessionXml";
import { plural } from "../lib/plural";
import { Segmented } from "./controls";
import { BundleExportPanel } from "./BundleExport";

interface Props {
  sessions: Session[];
  /** Carpeta preseleccionada (menú de una carpeta del panel); sin valor, todas. */
  folder?: string;
  onClose: () => void;
}

/** Elige qué sesiones exportar: XML compatible con SecureCRT, JSON al portapapeles o archivo cifrado (.ntx). */
export function ExportSessionsDialog({ sessions, folder, onClose }: Props) {
  const list = useMemo(
    () =>
      sessions
        .filter((s) => s.type !== "local")
        .map((s) => ({ s, path: normPath(s.folder) }))
        .sort((a, b) => a.path.localeCompare(b.path) || a.s.name.localeCompare(b.s.name)),
    [sessions],
  );
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(list.filter((x) => folder === undefined || isWithin(x.path, normPath(folder))).map((x) => x.s.id)),
  );
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");
  const [msgError, setMsgError] = useState(false);
  const [mode, setMode] = useState<"xml" | "ntx">("xml");
  const [busy, setBusy] = useState(false);
  const formId = useId();
  const say = (text: string, error = false) => {
    setMsg(text);
    setMsgError(error);
  };

  const modal = useModal({ onClose: onClose });

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return list;
    return list.filter((x) => `${x.s.name} ${sessionTarget(x.s)} ${x.path}`.toLowerCase().includes(t));
  }, [list, q]);

  const groups = useMemo(() => {
    const out: { path: string; items: Session[] }[] = [];
    for (const x of shown) {
      const last = out[out.length - 1];
      if (last?.path === x.path) last.items.push(x.s);
      else out.push({ path: x.path, items: [x.s] });
    }
    return out;
  }, [shown]);

  const setMany = (ids: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) on ? next.add(id) : next.delete(id);
      return next;
    });
  const shownIds = shown.map((x) => x.s.id);
  const allShown = shownIds.length > 0 && shownIds.every((id) => selected.has(id));
  const picked = () => list.filter((x) => selected.has(x.s.id)).map((x) => x.s);

  const saveXml = async () => {
    const items = picked();
    const dest = await save({ defaultPath: "sesiones.xml", filters: [{ name: "XML", extensions: ["xml"] }] }).catch(() => null);
    if (!dest) return;
    await invoke("save_text", { dest, content: sessionsToXml(items) })
      .then(() => say(`${plural(items.length, "sesión exportada", "sesiones exportadas")}: ${dest}`))
      .catch((e) => say(String(e), true));
  };

  const copyJson = async () => {
    const items = picked().map(({ id: _id, created_at: _c, save_password: _pw, ...rest }) => rest);
    await writeText(JSON.stringify(items, null, 2))
      .then(() => say(`${plural(items.length, "sesión copiada", "sesiones copiadas")} al portapapeles`))
      .catch((e) => say(String(e), true));
  };

  return (
    <div {...modal.overlay} className="fixed inset-0 z-[60] grid place-items-center bg-black/25 p-4" onMouseDown={onClose}>
      <div
        {...modal.dialog}
        className="w-[560px] max-w-[96vw] max-h-[90vh] flex flex-col bg-panel border border-line rounded-xl shadow-pop overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 flex items-center justify-between px-5 h-12 border-b border-line">
          <h2 id={modal.titleId} className="text-[14px] font-semibold">Exportar sesiones</h2>
          <button onClick={onClose} aria-label="Cerrar" className="w-7 h-7 grid place-items-center rounded-md text-muted hover:text-fg hover:bg-hover">
            <X size={16} />
          </button>
        </header>

        <div className="shrink-0 px-5 pt-4 pb-2 space-y-2">
          <div className="flex items-center justify-between gap-3 text-[12px]">
            <span id={`${formId}-fmt`} className="text-muted">Formato</span>
            <Segmented
              value={mode}
              label="Formato de exportación"
              options={[
                ["xml", "XML o JSON"],
                ["ntx", "Archivo cifrado (.ntx)"],
              ]}
              onChange={(v) => {
                setMode(v);
                say("");
              }}
            />
          </div>
          <div className="flex items-center gap-2">
            <input className="field flex-1" placeholder="Filtrar sesiones por nombre, host o carpeta" aria-label="Filtrar sesiones por nombre, host o carpeta" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
            <label className="flex items-center gap-2 text-[12.5px] shrink-0">
              <input type="checkbox" className="accent-[var(--accent)]" checked={allShown} onChange={(e) => setMany(shownIds, e.target.checked)} />
              {q ? "Todas las filtradas" : "Todas"}
            </label>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-3">
          {!groups.length && <p className="py-6 text-center text-[12px] text-muted">Sin sesiones que coincidan.</p>}
          {groups.map((g) => {
            const ids = g.items.map((s) => s.id);
            const on = ids.every((id) => selected.has(id));
            return (
              <div key={g.path} className="py-1">
                <label className="flex items-center gap-2 h-7 text-[12px] font-medium text-muted">
                  <input type="checkbox" className="accent-[var(--accent)]" checked={on} onChange={(e) => setMany(ids, e.target.checked)} />
                  <Folder size={13} />
                  <span className="truncate">{g.path || "Sin carpeta"}</span>
                  <span className="ml-auto text-[11px] font-normal">{ids.filter((id) => selected.has(id)).length}/{ids.length}</span>
                </label>
                {g.items.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 h-7 pl-6 text-[12.5px] rounded-md hover:bg-hover">
                    <input type="checkbox" className="accent-[var(--accent)]" checked={selected.has(s.id)} onChange={(e) => setMany([s.id], e.target.checked)} />
                    <SessionIcon type={s.type} size={13} />
                    <span className="truncate">{s.name}</span>
                    <span className="ml-auto pr-1 text-[11px] text-muted truncate">{sessionTarget(s)}</span>
                  </label>
                ))}
              </div>
            );
          })}
          {mode === "ntx" && (
            <BundleExportPanel
              formId={formId}
              sessionIds={picked().map((s) => s.id)}
              allSessions={selected.size === list.length && list.length > 0}
              onBusy={setBusy}
              onMessage={say}
            />
          )}
        </div>

        <footer className="shrink-0 border-t border-line px-5 py-3 space-y-2">
          <p className="text-[11.5px] text-muted">
            {mode === "xml"
              ? "El XML usa el formato de SecureCRT: se abre ahí y se reimporta aquí con Importar › Desde archivo. Solo datos de conexión, nunca contraseñas ni comandos al conectar."
              : "Un solo archivo cifrado (XChaCha20-Poly1305, llave Argon2id) con lo elegido, para respaldar o llevar a otro equipo. Se abre en NetTerminal con Importar › Archivo cifrado de NetTerminal (.ntx)."}
          </p>
          {/* Región viva siempre presente: el lector anuncia el resultado aunque el texto cambie. */}
          <p role={msgError ? "alert" : "status"} className={`text-[11.5px] break-words ${msgError ? "text-danger" : "text-accent"} ${msg ? "" : "sr-only"}`}>
            {msg}
          </p>
          <div className="flex items-center justify-end gap-2 whitespace-nowrap">
            <span className="text-[11.5px] text-muted">{plural(selected.size, "sesión", "sesiones")}</span>
            {mode === "xml" ? (
              <>
                <button onClick={copyJson} disabled={!selected.size} className="px-3 h-8 rounded-md border border-line hover:bg-hover disabled:opacity-40">
                  Copiar JSON
                </button>
                <button
                  onClick={saveXml}
                  disabled={!selected.size}
                  className="flex items-center gap-1.5 px-3.5 h-8 rounded-md bg-accent text-accent-fg font-medium hover:opacity-90 disabled:opacity-40"
                >
                  <FileDown size={14} /> Guardar XML…
                </button>
              </>
            ) : (
              <button
                type="submit"
                form={formId}
                disabled={!selected.size || busy}
                className="flex items-center gap-1.5 px-3.5 h-8 rounded-md bg-accent text-accent-fg font-medium hover:opacity-90 disabled:opacity-40"
              >
                <Lock size={14} /> {busy ? "Cifrando…" : "Guardar archivo cifrado…"}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
