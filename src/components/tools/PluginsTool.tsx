import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { AlertTriangle, Code2, FolderOpen, FolderInput, Loader2, Package, Play, RefreshCw, Square, Trash2 } from "lucide-react";
import { stopScript } from "../../lib/api";
import { pluginSessionName } from "../../lib/pluginRuns";
import { Btn, Console, Section, Toggle, ToolHeader, fmtBytes } from "./ui";

interface Action {
  id: string;
  label: string;
  description?: string;
}

interface Plugin {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  permissions: string[];
  actions: Action[];
  enabled: boolean;
  tampered: boolean;
  /** Sin aprobación guardada: copiado a mano a la carpeta o deshabilitado con una versión anterior. */
  unreviewed?: boolean;
}

interface Preview {
  staging: string;
  manifest: Omit<Plugin, "enabled" | "tampered" | "unreviewed"> & { entry: string };
  files: [string, number][];
  code: string;
  replaces: string | null;
}

/** Ejecución de un plugin en curso (para mostrarla y poder detenerla). */
interface ActiveRun {
  plugin: string;
  action: string;
  session: string | null;
}

const PERM_TEXT: Record<string, string> = {
  session: "Leer y enviar comandos a la sesión conectada",
  network: "Conectarse a la red por su cuenta",
  files: "Leer o escribir archivos en tu equipo",
  "vault-type": "Pedir que la app escriba la contraseña guardada de la sesión en su pedido de login (el plugin no la ve; se aprueba en cada ejecución)",
};

/** Sesión sin nombre conocido (la vista no recibió las pestañas). */
const ACTIVE_SESSION = "la sesión conectada de la última pestaña de terminal";

export function PluginsTool({
  connId,
  tabs,
  onConfirm,
}: {
  /** Conexión activa (para acciones con permiso "session"). */
  connId: () => string | null;
  /** Pestañas abiertas, para nombrar la sesión donde corre el plugin. */
  tabs?: { tabId: string; name: string }[];
  onConfirm: (req: { title: string; message: string; label: string; danger?: boolean; action: () => void }) => void;
}) {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [code, setCode] = useState<{ id: string; text: string } | null>(null);
  const [error, setError] = useState("");
  const [output, setOutput] = useState<string[]>([]);
  const outputRef = useRef<HTMLDivElement>(null);
  // Al iniciar una acción se lleva la salida a la vista (queda al pie, bajo las tarjetas).
  const [showOutput, setShowOutput] = useState(0);
  useEffect(() => {
    if (showOutput) outputRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [showOutput]);
  const runs = useRef(new Set<string>());
  // Ejecuciones en curso por run id; se quitan con el evento done o error del script.
  const [active, setActive] = useState<Record<string, ActiveRun>>({});
  // Runs que ya terminaron: el evento final puede llegar antes de que plugin_run devuelva el id.
  const finished = useRef(new Set<string>());
  // Plugins con "vault-type" a los que el usuario permitió escribir la contraseña guardada en la
  // próxima ejecución. Se desmarca al ejecutar: la aprobación es por ejecución.
  const [vaultOk, setVaultOk] = useState<Set<string>>(new Set());
  // Intérprete que usan scripts y plugins; "Volver a detectar" evita reiniciar tras instalarlo.
  const [py, setPy] = useState<{ ok: boolean; text: string } | null>(null);
  const checkPython = useCallback((again: boolean) => {
    setPy(null);
    invoke<string>(again ? "python_redetect" : "python_status")
      .then((text) => setPy({ ok: true, text }))
      .catch((e) => setPy({ ok: false, text: String(e) }));
  }, []);
  useEffect(() => checkPython(false), [checkPython]);

  const load = useCallback(() => invoke<Plugin[]>("plugins_list").then(setPlugins), []);

  useEffect(() => {
    load();
    const un = listen<{ run: string; script: string; kind: string; message: string }>("script-event", ({ payload }) => {
      if (payload.kind !== "log") {
        finished.current.add(payload.run);
        if (finished.current.size > 100) finished.current.delete(finished.current.values().next().value as string);
        setActive((a) => {
          if (!(payload.run in a)) return a;
          const n = { ...a };
          delete n[payload.run];
          return n;
        });
      }
      if (runs.current.has(payload.run)) setOutput((o) => [...o.slice(-500), `[${payload.script}] ${payload.message}`]);
    });
    return () => {
      un.then((f) => f());
    };
  }, [load]);

  const install = async (directory: boolean) => {
    setError("");
    const path = await open({
      directory,
      multiple: false,
      title: directory ? "Carpeta del plugin" : "Plugin (.zip)",
      filters: directory ? undefined : [{ name: "Plugin", extensions: ["zip"] }],
    });
    if (typeof path !== "string") return;
    try {
      setPreview(await invoke<Preview>("plugin_stage", { path }));
    } catch (e) {
      setError(String(e));
    }
  };

  const confirmInstall = async () => {
    if (!preview) return;
    try {
      await invoke("plugin_confirm", { staging: preview.staging });
      setPreview(null);
      load();
    } catch (e) {
      setError(String(e));
    }
  };

  /** Muestra el código del plugin; el backend registra que esto es lo revisado. */
  const review = async (id: string) => setCode({ id, text: await invoke<string>("plugin_code", { id }).catch((e) => String(e)) });

  /** Aprueba el código que se acaba de revisar. Si cambió desde la revisión, el backend lo rechaza. */
  const approveReviewed = async (p: Plugin) => {
    setError("");
    try {
      await invoke("plugin_set_enabled", { id: p.id, enabled: true });
      setCode(null);
    } catch (e) {
      setError(String(e));
      review(p.id);
    }
    load();
  };

  const conn = connId();
  const sessionName = pluginSessionName(conn, tabs) ?? (conn ? ACTIVE_SESSION : null);

  const run = async (p: Plugin, a: Action) => {
    setError("");
    const needsSession = p.permissions.includes("session");
    const c = needsSession ? connId() : null;
    if (needsSession && !c) return setError(`${p.name} necesita una sesión conectada en la última pestaña de terminal que usaste.`);
    const session = needsSession ? (pluginSessionName(c, tabs) ?? ACTIVE_SESSION) : null;
    const vaultType = p.permissions.includes("vault-type") && vaultOk.has(p.id);
    setVaultOk((s) => {
      const n = new Set(s);
      n.delete(p.id);
      return n;
    });
    try {
      const id = await invoke<string>("plugin_run", { id: p.id, action: a.id, conn: c, vaultType });
      runs.current.add(id);
      if (!finished.current.has(id)) setActive((s) => ({ ...s, [id]: { plugin: p.id, action: a.label, session } }));
      setOutput((o) => [...o, `▶ ${p.name} · ${a.label}${session ? ` en ${session}` : ""}`]);
      setShowOutput((n) => n + 1);
    } catch (e) {
      setError(String(e));
      load();
    }
  };

  const installed = preview?.replaces ? plugins.find((p) => p.id === preview.replaces) : undefined;

  return (
    <div className="space-y-4">
      <ToolHeader
        title="Plugins"
        description="Carpeta con plugin.json y un script Python que usa la API netterminal. Antes de activarlo revisas sus permisos y su código; si sus archivos cambian, se bloquea hasta que lo vuelvas a aprobar."
        actions={
          <>
            <Btn onClick={() => install(false)}>
              <Package size={14} /> Instalar .zip
            </Btn>
            <Btn onClick={() => install(true)}>
              <FolderInput size={14} /> Desde carpeta
            </Btn>
            <Btn kind="ghost" title="Abrir carpeta de plugins" aria-label="Abrir carpeta de plugins" onClick={() => invoke("open_dir", { which: "plugins" })}>
              <FolderOpen size={14} />
            </Btn>
          </>
        }
      />
      <div className="flex items-center gap-2 text-[12px]">
        <span className={py && !py.ok ? "text-danger" : "text-muted"}>
          Python: {py ? py.text : "buscando…"}
        </span>
        <Btn kind="ghost" title="Volver a detectar Python" disabled={!py} onClick={() => checkPython(true)}>
          <RefreshCw size={13} /> Volver a detectar
        </Btn>
      </div>
      {error && (
        <p role="alert" className="text-[12px] text-danger">
          {error}
        </p>
      )}

      {preview && (
        <Section title={`Revisar antes de instalar: ${preview.manifest.name} ${preview.manifest.version}`} hint={preview.manifest.author ? `Autor declarado: ${preview.manifest.author}` : "Sin autor declarado"}>
          {preview.replaces && (
            <p className="mb-2 text-[12px] text-warn">
              ▲ Reemplazará la versión instalada
              {installed ? `: ${installed.version} → ${preview.manifest.version}` : ""}. Revisa el código completo: no se muestra solo lo que cambió.
            </p>
          )}
          <p className="text-[12.5px] mb-2">{preview.manifest.description}</p>
          <div className="mb-3">
            <div className="text-[11.5px] font-medium text-muted mb-1">Permisos solicitados</div>
            {preview.manifest.permissions.length === 0 ? (
              <p className="text-[12px]">Ninguno (solo muestra mensajes)</p>
            ) : (
              <ul className="text-[12px] space-y-0.5">
                {preview.manifest.permissions.map((p) => (
                  <li key={p}>
                    <span className="font-mono">{p}</span> · {PERM_TEXT[p]}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="mb-3">
            <div className="text-[11.5px] font-medium text-muted mb-1">Archivos ({preview.files.length})</div>
            <ul className="max-h-32 overflow-auto rounded-lg border border-line px-3 py-1.5 font-mono text-[11.5px]">
              {preview.files.map(([f, size]) => (
                <li key={f} className="flex justify-between gap-3">
                  <span className="min-w-0 break-all">{f}</span>
                  <span className="shrink-0 text-muted">{fmtBytes(size)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="text-[11.5px] font-medium text-muted mb-1">Código Python del plugin</div>
          <pre className="max-h-[60vh] overflow-auto rounded-lg bg-hover p-3 font-mono text-[11.5px] select-text">{preview.code}</pre>
          <p className="mt-2 text-[11.5px] text-muted flex gap-1.5">
            <AlertTriangle size={13} className="shrink-0 text-warn" />
            Los permisos son una declaración: el script corre con tus privilegios de usuario. Instala solo plugins de origen
            confiable y que entiendas.
          </p>
          <div className="flex justify-end gap-2 mt-3">
            <Btn
              onClick={() => {
                invoke("plugin_cancel", { staging: preview.staging });
                setPreview(null);
              }}
            >
              Cancelar
            </Btn>
            <Btn kind="primary" onClick={confirmInstall}>
              Instalar y habilitar
            </Btn>
          </div>
        </Section>
      )}

      {plugins.length === 0 && !preview && (
        <div className="rounded-xl border border-dashed border-line p-8 text-center text-[12.5px] text-muted">
          No hay plugins instalados. El repositorio incluye un ejemplo en <code>plugins/ejemplo-inventario</code>.
        </div>
      )}

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(360px,1fr))]">
        {plugins.map((p) => {
          // Alterado o sin aprobación: habilitarlo exige revisar el código antes.
          const needsReview = p.tampered || !!p.unreviewed;
          const needsSession = p.permissions.includes("session");
          const running = Object.entries(active).filter(([, r]) => r.plugin === p.id);
          return (
            <Section
              key={p.id}
              title={`${p.name} ${p.version}`}
              hint={p.author || undefined}
              right={
                <div className="flex items-center gap-1">
                  <Toggle
                    checked={p.enabled}
                    label="Habilitado"
                    onChange={async (v) => {
                      // Un plugin alterado o sin aprobación no se habilita con un clic: primero se muestra su código.
                      if (v && needsReview) return review(p.id);
                      await invoke("plugin_set_enabled", { id: p.id, enabled: v }).catch((e) => setError(String(e)));
                      load();
                    }}
                  />
                  <Btn kind="ghost" className="!px-1.5" title="Ver código" aria-label={`Ver código de ${p.name}`} onClick={() => (code?.id === p.id ? setCode(null) : review(p.id))}>
                    <Code2 size={14} />
                  </Btn>
                  <Btn
                    kind="ghost"
                    className="!px-1.5 hover:!text-danger"
                    title="Desinstalar"
                    aria-label={`Desinstalar ${p.name}`}
                    onClick={() =>
                      onConfirm({
                        title: `¿Desinstalar ${p.name}?`,
                        message: "Se eliminarán sus archivos de la carpeta de plugins.",
                        label: "Desinstalar",
                        danger: true,
                        action: () => invoke("plugin_uninstall", { id: p.id }).then(load),
                      })
                    }
                  >
                    <Trash2 size={13} />
                  </Btn>
                </div>
              }
            >
              {needsReview && (
                <div className="mb-2 text-[12px] text-danger space-y-1.5">
                  <p>
                    {p.tampered
                      ? "✕ Sus archivos cambiaron desde que lo aprobaste. Revisa el código y apruébalo solo si reconoces el cambio."
                      : "✕ No tiene una aprobación vigente: se copió a la carpeta de plugins o se deshabilitó con una versión anterior. Revisa su código antes de habilitarlo."}
                  </p>
                  {code?.id === p.id ? (
                    <Btn kind="danger" onClick={() => approveReviewed(p)}>
                      {p.tampered ? "Aprobar estos cambios y habilitar" : "Aprobar este código y habilitar"}
                    </Btn>
                  ) : (
                    <Btn onClick={() => review(p.id)}>Revisar código</Btn>
                  )}
                </div>
              )}
              <p className="text-[12.5px] mb-2">{p.description}</p>
              <div className="flex flex-wrap gap-1 mb-3">
                {p.permissions.map((perm) => (
                  <span key={perm} title={PERM_TEXT[perm]} className="px-1.5 h-5 inline-flex items-center rounded border border-line text-[11px] font-mono">
                    {perm}
                  </span>
                ))}
              </div>
              {needsSession && (
                <p className={`mb-2 text-[12px] ${sessionName ? "text-muted" : "text-warn"}`}>
                  {sessionName ? (
                    <>
                      Se ejecutará en: <span className="text-fg font-medium">{sessionName}</span>
                    </>
                  ) : (
                    "Sin sesión conectada: conecta una pestaña de terminal para usar sus acciones."
                  )}
                </p>
              )}
              {p.permissions.includes("vault-type") && (
                <label className="mb-2 flex items-start gap-2 text-[12px] cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-[var(--accent)]"
                    checked={vaultOk.has(p.id)}
                    disabled={!p.enabled || !sessionName}
                    onChange={(e) =>
                      setVaultOk((s) => {
                        const n = new Set(s);
                        if (e.target.checked) n.add(p.id);
                        else n.delete(p.id);
                        return n;
                      })
                    }
                  />
                  <span>
                    Permitir que el script escriba contraseñas guardadas en: {sessionName ?? "ninguna sesión conectada"}
                    <span className="block text-muted">Solo para la próxima ejecución; el plugin nunca ve la contraseña.</span>
                  </span>
                </label>
              )}
              <div className="flex flex-wrap gap-1.5">
                {p.actions.map((a) => (
                  <Btn key={a.id} disabled={!p.enabled || running.length > 0 || (needsSession && !sessionName)} title={a.description} onClick={() => run(p, a)}>
                    <Play size={12} /> {a.label}
                  </Btn>
                ))}
              </div>
              {running.map(([id, r]) => (
                <div key={id} role="status" className="mt-2 flex items-center gap-2 text-[12px]">
                  <Loader2 size={13} className="shrink-0 animate-spin text-accent" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">
                    Ejecutando «{r.action}»{r.session ? ` en ${r.session}` : ""}…
                  </span>
                  <Btn kind="danger" onClick={() => stopScript(id).catch((e) => setError(String(e)))}>
                    <Square size={11} /> Detener
                  </Btn>
                </div>
              ))}
              {code?.id === p.id && (
                <pre className="mt-3 max-h-[60vh] overflow-auto rounded-lg bg-hover p-3 font-mono text-[11.5px] select-text">{code.text}</pre>
              )}
            </Section>
          );
        })}
      </div>

      {output.length > 0 && (
        <div ref={outputRef}>
          <Section title="Salida de plugins" right={<Btn kind="ghost" onClick={() => setOutput([])}>Limpiar</Btn>}>
            <Console lines={output} height={180} />
          </Section>
        </div>
      )}
    </div>
  );
}
