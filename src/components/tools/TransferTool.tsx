import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Check, ExternalLink, FilePlus, FolderOpen, RefreshCw, SquareTerminal, Trash2, X } from "lucide-react";
import { Settings } from "../../lib/settings";
import { stored, persist } from "../../lib/prefs";
import {
  ACTIONS,
  Action,
  Proto,
  RECOVERY_VENDORS,
  VENDORS,
  Vendor,
  backupName,
  detectOs,
  guessVendor,
  ipAllowed,
  isLinkLocal,
  osTips,
  protocolsFor,
  rate,
  recipe,
  recoveryGuide,
  sameSubnet,
  suggestDeviceIp,
} from "../../lib/transferCmds";
import { Btn, Collapsible, CopyText, IpSelect, Label, Section, StatusPill, Toggle, fmtBytes, ToolHeader } from "./ui";
import { useLocalIp } from "./useLocalIp";
import { FileManager, ScpRequest, TerminalRef } from "./FileManager";
import { FtpClientSection, FtpServerSection, SftpSection } from "./FtpPanels";
import { ServerGuardPanel, commandIp, useGuardPrefs, useGuardStats } from "./ServerGuard";
import { ALL, GUARD_LABEL, parseAllow, serverOpts } from "../../lib/serverGuard";

interface Transfer {
  id: string;
  proto: string;
  client: string;
  file: string;
  dir: "get" | "put";
  bytes: number;
  total: number | null;
  done: boolean;
  error: string | null;
  /** Primera y última vez que llegó un aviso (para la hora de inicio y la velocidad). */
  start: number;
  ts: number;
}

type Tab = "send" | "session" | "ftp";
const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: "send", label: "Enviar y recibir", hint: "Servidor TFTP/HTTP de este PC, archivos compartidos y el comando para el equipo" },
  { id: "session", label: "Gestor de archivos", hint: "Copiar archivos con la sesión abierta: la app escribe el comando y sigue el progreso" },
  { id: "ftp", label: "FTP y SFTP", hint: "Servidor FTP, cliente FTP y SFTP/SCP" },
];
const TAB_KEY = "transfer.tab";

/**
 * Transferencias: arriba el estado del servidor (interfaz, TFTP y HTTP), luego el flujo en 3 pasos
 * numerados (1 equipo y tarea, 2 archivo, 3 verificación y comando) y abajo la lista de
 * transferencias, plegable y abierta sola mientras hay alguna en curso.
 */
export function TransferTool({
  settings: s,
  running,
  onChange,
  refreshRunning,
  terminals,
  onConfirm,
  onScp,
}: {
  settings: Settings;
  running: string[];
  onChange: (p: Partial<Settings>) => void;
  refreshRunning: () => void;
  terminals: TerminalRef[];
  onConfirm: (req: { title: string; message: string; label: string; danger?: boolean; action: () => void }) => void;
  onScp: (req: ScpRequest) => void;
}) {
  const [tab, setTab] = useState<Tab>(() => {
    const t = stored<string>(TAB_KEY, "send");
    return TABS.some((x) => x.id === t) ? (t as Tab) : "send";
  });
  const pick = (t: Tab) => {
    setTab(t);
    persist(TAB_KEY, t);
  };
  const { ips, ip: localIp, setIp } = useLocalIp();
  const ip = localIp || "IP_DE_ESTE_PC";

  return (
    <div className="space-y-3">
      <ToolHeader
        title="Transferencias"
        description="Mueve firmware, imágenes y configuraciones entre este PC y los equipos por TFTP, HTTP, FTP o SFTP."
      />
      <div role="tablist" aria-label="Transferencias" className="flex flex-wrap gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            title={t.hint}
            onClick={() => pick(t.id)}
            className={`h-8 px-3 -mb-px border-b-2 text-[12.5px] ${tab === t.id ? "border-[var(--accent)] text-fg font-medium" : "border-transparent text-muted hover:text-fg"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Las tres vistas quedan montadas: cambiar de pestaña no corta un envío ni pierde lo escrito. */}
      <div role="tabpanel" hidden={tab !== "send"}>
        <SendReceive
          settings={s}
          running={running}
          onChange={onChange}
          refreshRunning={refreshRunning}
          terminals={terminals}
          onConfirm={onConfirm}
          ips={ips}
          localIp={localIp}
          setIp={setIp}
        />
      </div>
      <div role="tabpanel" hidden={tab !== "session"}>
        <Section
          title="Gestor de archivos"
          hint="Selecciona o arrastra archivos entre este PC y el equipo. La app escribe el comando copy en la sesión, responde las confirmaciones y muestra el progreso."
        >
          <FileManager terminals={terminals} settings={s} refreshRunning={refreshRunning} onConfirm={onConfirm} onScp={onScp} />
        </Section>
      </div>
      <div role="tabpanel" hidden={tab !== "ftp"} className="space-y-4">
        <FtpTab settings={s} running={running} onChange={onChange} refreshRunning={refreshRunning} terminals={terminals} onScp={onScp} ip={ip} ips={ips} />
      </div>
    </div>
  );
}

function FtpTab({
  settings: s,
  running,
  onChange,
  refreshRunning,
  terminals,
  onScp,
  ip,
  ips,
}: {
  settings: Settings;
  running: string[];
  onChange: (p: Partial<Settings>) => void;
  refreshRunning: () => void;
  terminals: TerminalRef[];
  onScp: (req: ScpRequest) => void;
  ip: string;
  ips: { name: string; ip: string; default?: boolean }[];
}) {
  const stats = useGuardStats(running);
  const { files, reload } = useSharedFiles();
  return (
    <>
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(340px,100%),1fr))]">
        <FtpServerSection settings={s} running={running} onChange={onChange} refreshRunning={refreshRunning} ip={ip} ips={ips} stat={stats.ftp} file={files[0]?.[0] ?? "firmware.bin"} />
        <SftpSection terminals={terminals} onScp={onScp} />
      </div>
      <FtpClientSection files={files} onLocalChange={reload} />
    </>
  );
}

/** Archivos de la carpeta compartida (la que sirven TFTP, HTTP y FTP). */
function useSharedFiles() {
  const [files, setFiles] = useState<[string, number][]>([]);
  const reload = useCallback(() => {
    invoke<[string, number][]>("tftp_files")
      .then(setFiles)
      .catch(() => {});
  }, []);
  useEffect(() => {
    reload();
    // Una subida terminada agrega un archivo a la carpeta.
    const un = listen<{ done: boolean; dir: string }>("transfer", ({ payload }) => {
      if (payload.done && payload.dir === "put") reload();
    });
    return () => {
      un.then((f) => f());
    };
  }, [reload]);
  return { files, reload };
}

const time = (ts: number) => new Date(ts).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

function SendReceive({
  settings: s,
  running,
  onChange,
  refreshRunning,
  terminals,
  onConfirm,
  ips,
  localIp,
  setIp,
}: {
  settings: Settings;
  running: string[];
  onChange: (p: Partial<Settings>) => void;
  refreshRunning: () => void;
  terminals: TerminalRef[];
  onConfirm: (req: { title: string; message: string; label: string; danger?: boolean; action: () => void }) => void;
  ips: { name: string; ip: string; default?: boolean }[];
  localIp: string;
  setIp: (ip: string) => void;
}) {
  const guardT = useGuardPrefs("tftp", s, onChange, ips);
  const guardH = useGuardPrefs("http", s, onChange, ips);
  const stats = useGuardStats(running);
  const { files, reload } = useSharedFiles();
  const [selFile, setSelFile] = useState("");
  const [md5, setMd5] = useState<Record<string, string>>({});
  // Subidas TFTP: solo por esta sesión de la app (nunca quedan habilitadas al reiniciar). Con el
  // servidor activo se aplican en caliente, sin reiniciarlo.
  const [tftpWrite, setTftpWrite] = useState(false);
  // Lo que eligió el usuario: con el servidor detenido el interruptor vuelve a esto, no a lo que
  // dejó el gestor de archivos durante una extracción.
  const userWrite = useRef(false);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [opts, setOpts] = useState(false);

  const tftpOn = running.includes("tftp");
  const httpOn = running.includes("http");

  // Estado real del servidor (el gestor de archivos puede habilitar subidas durante una extracción).
  const syncWrite = useCallback(() => {
    invoke<boolean | null>("server_write", { kind: "tftp" })
      .then((w) => setTftpWrite(w ?? userWrite.current))
      .catch(() => {});
  }, []);
  useEffect(() => {
    syncWrite();
    window.addEventListener("nt-server-write", syncWrite);
    return () => window.removeEventListener("nt-server-write", syncWrite);
  }, [syncWrite, running]);

  useEffect(() => {
    const un = listen<Omit<Transfer, "ts" | "start">>("transfer", ({ payload }) => {
      const now = Date.now();
      setTransfers((list) => {
        const i = list.findIndex((t) => t.id === payload.id);
        if (i < 0) return [{ ...payload, start: now, ts: now }, ...list].slice(0, 50);
        return list.map((t, k) => (k === i ? { ...t, ...payload, ts: now } : t));
      });
    });
    return () => {
      un.then((f) => f());
    };
  }, []);

  const setWrite = async (v: boolean) => {
    setError("");
    userWrite.current = v;
    setTftpWrite(v);
    if (!tftpOn) return;
    try {
      await invoke("server_set_write", { kind: "tftp", allow: v });
    } catch (e) {
      setError(String(e));
      syncWrite();
    }
  };

  const toggle = async (kind: "tftp" | "http", on = !running.includes(kind), port?: number, bind?: string) => {
    setError("");
    const g = kind === "tftp" ? guardT : guardH;
    if (on && g.allowErrors.length) return setError(`${GUARD_LABEL[kind]}: ${g.allowErrors[0]}.`);
    try {
      if (!on) await invoke("server_stop", { kind });
      else
        await invoke("server_start", {
          kind,
          port: port ?? (kind === "tftp" ? s.tftpPort : s.httpPort),
          allowWrite: tftpWrite,
          opts: bind ? serverOpts({ ...(s.serverGuard ?? {}), [kind]: { ...g.prefs, bind } }, kind, bind) : g.opts(),
        });
    } catch (e) {
      setError(String(e));
    }
    refreshRunning();
  };

  // Los gestores de arranque piden TFTP siempre en el puerto 69: se cambia y se reinicia el servidor.
  const usePort69 = async () => {
    onChange({ tftpPort: 69 });
    if (tftpOn) await invoke("server_stop", { kind: "tftp" }).catch(() => {});
    await toggle("tftp", true, 69);
  };

  // TFTP escucha en una IP distinta de la elegida (p. ej. el Wi-Fi de la ruta por defecto, con el
  // equipo conectado por cable directo): el equipo no lo alcanzaría.
  const bindMismatch = guardT.bind !== ALL && !!localIp && guardT.bind !== localIp;
  const listenOn = async (ip: string) => {
    guardT.set({ bind: ip });
    if (!tftpOn) return;
    await invoke("server_stop", { kind: "tftp" }).catch(() => {});
    await toggle("tftp", true, undefined, ip);
  };

  const addFile = async () => {
    const path = await open({ multiple: true, directory: false, title: "Archivos para servir por TFTP/HTTP" });
    const list = typeof path === "string" ? [path] : (path ?? []);
    if (!list.length) return;
    setError("");
    setNote(list.length === 1 ? "Copiando a la carpeta compartida…" : `Copiando ${list.length} archivos a la carpeta compartida…`);
    let last = "";
    for (const p of list) {
      try {
        last = await invoke<string>("tftp_add", { path: p });
      } catch (e) {
        setError(String(e));
      }
    }
    setNote("");
    reload();
    if (last) setSelFile(last);
  };

  const remove = (name: string) =>
    onConfirm({
      title: "Quitar de la carpeta compartida",
      message: `Se borra "${name}" de la carpeta que sirven TFTP, HTTP y FTP. El archivo original que agregaste no se toca.`,
      label: "Quitar",
      danger: true,
      action: () => {
        invoke("tftp_delete", { name })
          .then(reload)
          .catch((e) => setError(String(e)));
      },
    });

  const hash = (name: string) => {
    setMd5((m) => ({ ...m, [name]: "…" }));
    invoke<string>("tftp_md5", { name })
      .then((h) => setMd5((m) => ({ ...m, [name]: h })))
      .catch((e) => setMd5((m) => ({ ...m, [name]: `Error: ${e}` })));
  };

  const file = files.some(([n]) => n === selFile) ? selFile : (files[0]?.[0] ?? "");
  const rejects = (["tftp", "http"] as const).filter((k) => running.includes(k) && (stats[k]?.rejected ?? 0) > 0);
  const active = transfers.filter((t) => !t.done).length;
  const finished = transfers.length - active;

  // La lista de transferencias se abre sola cuando empieza una (de 0 a 1 o más en curso); después la
  // pliega o despliega el usuario.
  const [listOpen, setListOpen] = useState(false);
  const prevActive = useRef(0);
  useEffect(() => {
    if (active > 0 && prevActive.current === 0) setListOpen(true);
    prevActive.current = active;
  }, [active]);
  const listRef = useRef<HTMLDivElement>(null);
  const showList = () => {
    setListOpen(true);
    requestAnimationFrame(() => listRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };
  const lastActive = transfers.find((t) => !t.done);
  const listSummary = active
    ? `${active} en curso${lastActive ? ` · ${lastActive.file}` : ""}${finished ? ` · ${finished} ${finished === 1 ? "terminada" : "terminadas"}` : ""}`
    : transfers.length
      ? `${finished} ${finished === 1 ? "terminada" : "terminadas"} · ninguna en curso`
      : tftpOn || httpOn
        ? "Sin transferencias. Esperando que un equipo pida un archivo"
        : "Sin transferencias. Los servidores están detenidos";

  return (
    <div className="space-y-4">
      {/* Servidor en modo lectura: estado de cada servicio con un botón secundario. Lo que falta para la
          tarea lo pide la lista de verificación del paso 3, con el único botón primario. */}
      <section aria-label="Servidor de este PC" className="rounded-xl border border-line bg-panel px-4 py-3 space-y-2">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <IpSelect ips={ips} ip={localIp} onChange={setIp} className="w-72 max-w-full" />
          <ServerSwitch label="TFTP" detail={`UDP ${s.tftpPort}${tftpWrite ? " · acepta envíos" : ""}`} on={tftpOn} onToggle={() => toggle("tftp")} />
          <ServerSwitch label="HTTP" detail={`TCP ${s.httpPort} · solo lectura`} on={httpOn} onToggle={() => toggle("http")} />
          {active > 0 && (
            <Btn kind="ghost" className="!h-7 ml-auto" onClick={showList} aria-label={`Ver transferencias: ${active} en curso`}>
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse" aria-hidden />
              {active} en curso
            </Btn>
          )}
        </div>
        {bindMismatch && (
          <p className="flex flex-wrap items-center gap-2 text-[12px] text-warn" role="status">
            TFTP escucha en {guardT.bind}, no en {localIp}: un equipo conectado a esa tarjeta no lo alcanzará.
            <Btn className="!h-6 !px-2 !text-[11.5px]" onClick={() => listenOn(localIp)}>
              Escuchar en {localIp}
            </Btn>
          </p>
        )}
        {error && (
          <div role="alert" className="space-y-1">
            <p className="text-[12px] text-danger">{error}</p>
            {/privilegios|permiso|denied|firewall/i.test(error) && <OsTips />}
          </div>
        )}
        {rejects.map((k) => (
          <p key={k} className="text-[12px] text-warn" role="status">
            {GUARD_LABEL[k]} · {stats[k].rejected.toLocaleString("es-CL")} {stats[k].rejected === 1 ? "conexión rechazada" : "conexiones rechazadas"} por origen no permitido
            {stats[k].last ? ` · último ${stats[k].last}` : ""}
          </p>
        ))}
      </section>

      {/* La tarea principal: equipo y tarea, archivo, verificación y comando. */}
      <Assistant
        file={file}
        terminals={terminals}
        tftpOn={tftpOn}
        httpOn={httpOn}
        tftpWrite={tftpWrite}
        tftpIp={commandIp(guardT.bind, localIp || "IP_DE_ESTE_PC")}
        httpIp={commandIp(guardH.bind, localIp || "IP_DE_ESTE_PC")}
        httpPort={s.httpPort}
        startServer={(k) => toggle(k, true)}
        allowWrite={() => setWrite(true)}
        tftpPort={s.tftpPort}
        usePort69={usePort69}
        pcIp={localIp}
        tftpBind={guardT.bind}
        tftpAllow={guardT.prefs.allow ?? ""}
        listenOn={listenOn}
        onConfirm={onConfirm}
        filesActions={
          <div className="flex gap-1">
            <Btn kind="ghost" title="Abrir la carpeta compartida" aria-label="Abrir la carpeta compartida" onClick={() => invoke("open_dir", { which: "tftp" }).catch((e) => setError(String(e)))}>
              <FolderOpen size={14} />
            </Btn>
            <Btn kind="ghost" title="Actualizar" aria-label="Actualizar la lista" onClick={reload}>
              <RefreshCw size={13} />
            </Btn>
          </div>
        }
        filesPanel={
          <>
            <button
              type="button"
              onClick={addFile}
              className="w-full mb-3 flex items-center justify-center gap-2 h-12 rounded-lg border border-dashed border-field-line text-[12.5px] text-muted hover:text-fg hover:bg-hover"
            >
              <FilePlus size={16} /> Agregar archivos (firmware, imagen, configuración)
            </button>
            {note && <p className="mb-2 text-[12px] text-muted" role="status">{note}</p>}
            {files.length === 0 ? (
              <p className="text-[12px] text-muted">La carpeta está vacía. Agrega el firmware que vas a cargar en el equipo; los respaldos que envíe el equipo también llegan aquí.</p>
            ) : (
              <ul role="listbox" aria-label="Archivos compartidos" className="max-h-72 overflow-auto rounded-lg border border-line divide-y divide-line">
                {files.map(([name, size]) => {
                  const on = name === file;
                  return (
                    <li key={name} role="option" aria-selected={on} className={`flex items-center gap-2 px-2 py-1 text-[12px] ${on ? "bg-selected" : "hover:bg-hover"}`}>
                      <button type="button" onClick={() => setSelFile(name)} className="flex-1 min-w-0 min-h-6 flex items-center gap-2 text-left" title="Usar este archivo en el comando">
                        <span className={`shrink-0 w-3.5 h-3.5 grid place-items-center rounded-full border ${on ? "border-[var(--accent)] bg-accent text-accent-fg" : "border-field-line"}`} aria-hidden>
                          {on && <Check size={10} />}
                        </span>
                        <span className="font-mono truncate">{name}</span>
                      </button>
                      <span className="shrink-0 text-muted tabular-nums">{fmtBytes(size)}</span>
                      {md5[name] ? (
                        <span className="shrink-0 max-w-[9rem]" title="MD5 para comparar con el del fabricante o con 'verify /md5' en el equipo">
                          {md5[name] === "…" ? <span className="text-muted">MD5…</span> : <CopyText text={md5[name]} />}
                        </span>
                      ) : (
                        <Btn kind="ghost" className="!h-6 !px-1.5 !text-[11px]" onClick={() => hash(name)} title="Calcular MD5" aria-label={`Calcular MD5 de ${name}`}>
                          MD5
                        </Btn>
                      )}
                      <Btn kind="ghost" className="!h-6 !w-6 !px-0" aria-label={`Quitar ${name}`} title="Quitar de la carpeta" onClick={() => remove(name)}>
                        <Trash2 size={12} />
                      </Btn>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        }
      />

      {/* Lo que descargan o envían los equipos: plegada, se abre sola cuando empieza una transferencia. */}
      <div ref={listRef} className="scroll-mt-4">
        <Collapsible
          title="Transferencias"
          summary={listSummary}
          badge={active || undefined}
          open={listOpen}
          onToggle={setListOpen}
          right={
            finished > 0 ? (
              <Btn kind="ghost" onClick={() => setTransfers((l) => l.filter((t) => !t.done))}>
                Limpiar terminadas
              </Btn>
            ) : undefined
          }
        >
          {transfers.length === 0 ? (
            <p className="text-[12px] text-muted">
              {tftpOn || httpOn
                ? "Esperando que un equipo pida un archivo. Cada descarga o envío aparecerá aquí con su progreso."
                : "Inicia TFTP o HTTP (o usa la lista de verificación del paso 3) para que el equipo descargue archivos de este PC o le envíe respaldos."}
            </p>
          ) : (
            <ul className="divide-y divide-line" aria-label="Transferencias">
              {transfers.map((t) => {
                const pct = t.total ? Math.min(100, (t.bytes / t.total) * 100) : t.done && !t.error ? 100 : null;
                const r = rate(t.bytes, t.start, t.ts);
                return (
                  <li key={t.id} className="py-2 first:pt-0">
                    <div className="flex items-baseline gap-2 text-[12px]">
                      <span className="flex-1 min-w-0 font-mono truncate" title={t.file}>
                        {t.file}
                      </span>
                      <span className={`shrink-0 inline-flex items-center gap-1 tabular-nums ${t.error ? "text-danger" : t.done ? "text-ok" : "text-fg"}`}>
                        {t.error ? <X size={12} aria-hidden /> : t.done ? <Check size={12} aria-hidden /> : null}
                        {t.error ? "Error" : t.done ? "Completa" : pct != null ? `${Math.floor(pct)} %` : "En curso"}
                      </span>
                    </div>
                    <div
                      className="mt-1 h-1.5 rounded-full bg-hover overflow-hidden"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={pct ?? undefined}
                      aria-label={`Progreso de ${t.file}`}
                    >
                      <div className={`h-full ${t.error ? "bg-danger" : t.done ? "bg-ok" : "bg-accent"} ${pct == null ? "animate-pulse w-1/3" : ""}`} style={pct != null ? { width: `${pct}%` } : undefined} />
                    </div>
                    <p className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted tabular-nums">
                      <span className="font-mono">{t.client}</span>
                      <span>
                        {t.proto.toUpperCase()} · {t.dir === "get" ? "el equipo descarga" : "el equipo envía"}
                      </span>
                      <span>inicio {time(t.start)}</span>
                      <span>
                        {fmtBytes(t.bytes)}
                        {t.total ? ` de ${fmtBytes(t.total)}` : ""}
                      </span>
                      {r && <span>{fmtBytes(r)}/s</span>}
                      {t.error && <span className="text-danger">{t.error}</span>}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </Collapsible>
      </div>

      <Collapsible
        title="Opciones del servidor"
        summary={`Puertos TFTP ${s.tftpPort} y HTTP ${s.httpPort} · envíos por TFTP ${tftpWrite ? "permitidos" : "bloqueados"} · acceso y detención automática`}
        open={opts}
        onToggle={setOpts}
      >
        <div className="mb-3 space-y-1">
          <Toggle checked={tftpWrite} onChange={setWrite} label="Permitir que el equipo envíe archivos (TFTP)" />
          <p className="text-[11.5px] text-muted">
            Solo por esta sesión de la app: al reiniciarla vuelve a quedar bloqueado. Con el servidor activo se aplica sin reiniciarlo. Si la tarea lo necesita, la lista de verificación del paso 3 ofrece permitirlo.
          </p>
        </div>
        <div className="flex flex-wrap gap-4 mb-3">
          <Label text="Puerto TFTP (UDP)" className="w-36">
            <input className="field" type="number" disabled={tftpOn} value={s.tftpPort} onChange={(e) => onChange({ tftpPort: Number(e.target.value) || 69 })} />
          </Label>
          <Label text="Puerto HTTP (TCP)" className="w-36">
            <input className="field" type="number" disabled={httpOn} value={s.httpPort} onChange={(e) => onChange({ httpPort: Number(e.target.value) || 8080 })} />
          </Label>
          <p className="flex-1 min-w-[240px] text-[11.5px] text-muted self-end">
            Los puertos se cambian con el servidor detenido. TFTP negocia tamaño de bloque y tamaño de archivo (RFC 2348 y 2349) y admite imágenes de más de 32 MB.
            {s.tftpPort < 1024 ? " En Linux el puerto 69 puede requerir privilegios; si no inicia, usa 1069 y configura ese puerto en el equipo si lo soporta." : ""}
          </p>
        </div>
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr))]">
          <ServerGuardPanel kind="tftp" settings={s} onChange={onChange} ips={ips} running={tftpOn} stat={stats.tftp} />
          <ServerGuardPanel kind="http" settings={s} onChange={onChange} ips={ips} running={httpOn} stat={stats.http} />
        </div>
        <p className="mt-2 text-[11.5px] text-muted">
          Los servidores escuchan solo mientras están activos y se detienen solos tras un rato sin uso. Si el firewall del sistema pregunta, permite el acceso solo en redes privadas.
        </p>
      </Collapsible>
    </div>
  );
}

/** Servicio con su estado y un botón secundario para iniciarlo o detenerlo. */
function ServerSwitch({ label, detail, on, onToggle }: { label: string; detail: string; on: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <StatusPill state={on ? "running" : "stopped"} label={`${label} ${on ? "activo" : "detenido"}`} />
      <span className="text-[11.5px] text-muted whitespace-nowrap">{detail}</span>
      <Btn className="!h-7" onClick={onToggle} aria-label={`${on ? "Detener" : "Iniciar"} ${label}`}>
        {on ? "Detener" : "Iniciar"}
      </Btn>
    </div>
  );
}

/**
 * Paso numerado del flujo de envío. El número (o un check cuando está listo) va junto al título y el
 * estado se anuncia también en texto, no solo con color.
 */
function Step({
  n,
  title,
  hint,
  done,
  right,
  className = "",
  children,
}: {
  n: number;
  title: string;
  hint?: string;
  done?: boolean;
  right?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <li aria-labelledby={id} className={`min-w-0 rounded-xl border border-line bg-panel ${className}`}>
      <header className="flex items-start gap-2.5 px-4 pt-3 pb-2">
        <span
          aria-hidden
          className={`mt-px shrink-0 w-6 h-6 grid place-items-center rounded-full text-[12px] font-semibold tabular-nums ${done ? "bg-ok text-white" : "border-2 border-[var(--accent)] text-[var(--accent)]"}`}
        >
          {done ? <Check size={13} strokeWidth={3} /> : n}
        </span>
        <div className="flex-1 min-w-0">
          <h3 id={id} className="text-[13px] font-semibold truncate">
            <span className="sr-only">Paso {n} de 3: </span>
            {title}
            <span className="sr-only">{done ? " (listo)" : " (pendiente)"}</span>
          </h3>
          {hint && (
            <p className="text-[11.5px] text-muted truncate" title={hint}>
              {hint}
            </p>
          )}
        </div>
        {right}
      </header>
      <div className="px-4 pb-4">{children}</div>
    </li>
  );
}

const ASSIST_KEY = "transfer.assist";

/**
 * Asistente: equipo, tarea y protocolo; muestra qué falta (servidor, subidas, archivo) con el botón
 * para resolverlo, y el comando listo para copiar o escribir en la pestaña (sin Enter: lo confirma
 * el usuario en la terminal, y si reinicia el equipo se pide confirmación antes).
 */
function Assistant({
  file,
  terminals,
  tftpOn,
  httpOn,
  tftpWrite,
  tftpIp,
  httpIp,
  httpPort,
  startServer,
  allowWrite,
  tftpPort,
  usePort69,
  pcIp,
  tftpBind,
  tftpAllow,
  listenOn,
  onConfirm,
  filesPanel,
  filesActions,
}: {
  file: string;
  terminals: TerminalRef[];
  tftpOn: boolean;
  httpOn: boolean;
  tftpWrite: boolean;
  tftpIp: string;
  httpIp: string;
  httpPort: number;
  startServer: (k: "tftp" | "http") => void;
  allowWrite: () => void;
  tftpPort: number;
  usePort69: () => void;
  pcIp: string;
  tftpBind: string;
  tftpAllow: string;
  listenOn: (ip: string) => void;
  onConfirm: (req: { title: string; message: string; label: string; danger?: boolean; action: () => void }) => void;
  /** Lista de la carpeta compartida (paso 2) y sus acciones de encabezado. */
  filesPanel: React.ReactNode;
  filesActions: React.ReactNode;
}) {
  const saved = useMemo(() => stored<{ vendor?: Vendor; action?: Action; proto?: Proto }>(ASSIST_KEY, {}), []);
  const [conn, setConn] = useState("");
  const term = terminals.find((t) => t.connId === conn);
  const [vendor, setVendor] = useState<Vendor>(saved.vendor ?? "cisco");
  const [action, setAction] = useState<Action>(saved.action ?? "firmware");
  const [proto, setProto] = useState<Proto>(saved.proto ?? "tftp");
  const [remote, setRemote] = useState("");
  const [sent, setSent] = useState("");
  const [mode, setMode] = useState<"command" | "recover">("command");
  const canRecover = RECOVERY_VENDORS.includes(vendor);
  const recovering = mode === "recover" && canRecover;

  useEffect(() => persist(ASSIST_KEY, { vendor, action, proto }), [vendor, action, proto]);
  // Al elegir una pestaña se sugiere su fabricante (plataforma detectada o resaltado).
  const chooseTerm = (id: string) => {
    setConn(id);
    setSent("");
    const t = terminals.find((x) => x.connId === id);
    if (t) setVendor(guessVendor({ platform: t.session.platform, highlight: t.highlight }));
  };
  // Si la pestaña se cerró, se vuelve a "solo copiar".
  useEffect(() => {
    if (conn && !terminals.some((t) => t.connId === conn)) setConn("");
  }, [conn, terminals]);

  const protos = protocolsFor(vendor, action);
  const p = protos.includes(proto) ? proto : protos[0];
  const firstAction = ACTIONS.find((a) => protocolsFor(vendor, a.id).length)?.id ?? "firmware";
  const act = protos.length ? action : firstAction;
  const needsFile = act === "firmware" || act === "copy";
  const name = needsFile ? file : remote.trim() || (act === "backup" ? backupName(term?.name ?? "equipo", new Date()) : "");
  const r = p ? recipe(vendor, act, p, { ip: p === "http" ? httpIp : tftpIp, port: httpPort, file: name }) : null;
  const serverOn = p === "http" ? httpOn : tftpOn;

  const checks: CheckItem[] = [];
  if (p) checks.push({ ok: serverOn, text: serverOn ? `Servidor ${p.toUpperCase()} activo` : `El servidor ${p.toUpperCase()} está detenido`, fix: serverOn ? undefined : { label: `Iniciar ${p.toUpperCase()}`, run: () => startServer(p) } });
  if (r?.needsWrite) checks.push({ ok: tftpWrite, text: tftpWrite ? "El equipo puede enviar archivos a este PC" : "Falta permitir que el equipo envíe archivos", fix: tftpWrite ? undefined : { label: "Permitir", run: allowWrite } });
  if (needsFile) checks.push({ ok: !!file, text: file ? `Archivo: ${file}` : "Elige o agrega el archivo en el paso 2" });
  if (act === "pull") checks.push({ ok: !!remote.trim(), text: remote.trim() ? `Archivo del equipo: ${remote.trim()}` : "Escribe en el paso 2 el nombre del archivo en el equipo" });
  const ready = !!r && checks.every((c) => c.ok);
  // Paso 2 listo: hay archivo elegido, o el nombre del archivo que se trae del equipo (un respaldo
  // tiene nombre sugerido).
  const fileDone = needsFile || recovering ? !!file : act === "pull" ? !!remote.trim() : true;

  const write = () => {
    if (!r || !term) return;
    const go = () => {
      // Sin Enter: el comando queda escrito en la terminal para revisarlo y confirmarlo allí.
      invoke("write", { id: term.connId, data: r.command })
        .then(() => setSent(`Escrito en ${term.name}. Revisa la línea en la terminal y presiona Enter.`))
        .catch((e) => setSent(`No se pudo escribir: ${e}`));
    };
    if (r.disruptive)
      onConfirm({
        title: "Cargar firmware",
        message: `Se escribirá en ${term.name}:\n${r.command}\n\n${r.note ?? ""}`,
        label: "Escribir en la terminal",
        danger: true,
        action: go,
      });
    else go();
  };

  const vendorLabel = VENDORS.find((v) => v.id === vendor)?.label ?? vendor;
  const taskLabel = recovering ? "Recuperar desde el arranque" : (ACTIONS.find((a) => a.id === act)?.label ?? "");

  return (
    <ol aria-label="Enviar o recibir un archivo en 3 pasos" className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(380px,100%),1fr))]">
      <Step n={1} title="Equipo y tarea" hint={`${term ? term.name : "Sin pestaña (solo copiar)"} · ${vendorLabel} · ${taskLabel}`} done={recovering || !!r}>
        <div className="space-y-3">
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(170px,100%),1fr))]">
            <Label text="Pestaña del equipo">
              <select className="field" value={conn} onChange={(e) => chooseTerm(e.target.value)}>
                <option value="">Ninguna (solo copiar)</option>
                {terminals.map((t) => (
                  <option key={t.connId} value={t.connId}>
                    {t.name}
                    {t.host ? ` · ${t.host}` : ""}
                  </option>
                ))}
              </select>
            </Label>
            <Label text="Fabricante">
              <select className="field" value={vendor} onChange={(e) => setVendor(e.target.value as Vendor)}>
                {VENDORS.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </Label>
          </div>

          <div role="radiogroup" aria-label="Tarea" className="grid grid-cols-2 gap-1.5">
            {ACTIONS.map((a) => {
              const can = protocolsFor(vendor, a.id).length > 0;
              const on = act === a.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  role="radio"
                  aria-checked={on && !recovering}
                  disabled={!can}
                  title={can ? a.hint : `${vendorLabel} no lo hace con TFTP/HTTP desde este asistente`}
                  onClick={() => {
                    setAction(a.id);
                    setMode("command");
                  }}
                  className={`px-2.5 py-1.5 rounded-md border text-left text-[12px] disabled:opacity-40 ${on && !recovering ? "border-[var(--accent)] bg-[var(--selected)]" : "border-line hover:bg-hover"}`}
                >
                  <span className="block font-medium">{a.label}</span>
                  <span className="block text-[11px] text-muted truncate">{a.hint}</span>
                </button>
              );
            })}
            <button
              type="button"
              role="radio"
              aria-checked={recovering}
              disabled={!canRecover}
              title={canRecover ? "El equipo no arranca o no tiene firmware: se carga desde su menú de arranque por la consola" : "Aún sin guía de recuperación para este fabricante"}
              onClick={() => setMode("recover")}
              className={`col-span-2 px-2.5 py-1.5 rounded-md border text-left text-[12px] disabled:opacity-40 ${recovering ? "border-[var(--accent)] bg-[var(--selected)]" : "border-line hover:bg-hover"}`}
            >
              <span className="block font-medium">Recuperar desde el arranque (consola)</span>
              <span className="block text-[11px] text-muted truncate">Equipo sin firmware o que no inicia: menú del BIOS o ROMMON, imagen por TFTP</span>
            </button>
          </div>

          {!recovering && protos.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11.5px] font-medium text-muted">Protocolo</span>
              <div role="radiogroup" aria-label="Protocolo" className="inline-flex rounded-md border border-line overflow-hidden">
                {protos.map((x) => (
                  <button
                    key={x}
                    type="button"
                    role="radio"
                    aria-checked={p === x}
                    onClick={() => setProto(x)}
                    title={x === "http" ? "Más rápido para imágenes grandes" : "El más compatible"}
                    className={`h-8 px-3 text-[12px] ${p === x ? "bg-accent text-accent-fg font-medium" : "hover:bg-hover"}`}
                  >
                    {x.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </Step>

      <Step
        n={2}
        title="Archivo"
        hint={
          recovering
            ? "La imagen que el equipo descarga desde su menú de arranque"
            : needsFile
              ? "Lo que el equipo descarga de este PC"
              : act === "backup"
                ? "Nombre del respaldo; llega a la carpeta compartida"
                : "El archivo del equipo; llega a la carpeta compartida"
        }
        done={fileDone}
        right={filesActions}
      >
        {!recovering && !needsFile && (
          <Label text={act === "backup" ? "Nombre del respaldo en este PC" : "Archivo en el equipo"} className="mb-3">
            <input
              className="field font-mono"
              value={remote}
              placeholder={act === "backup" ? backupName(term?.name ?? "equipo", new Date()) : vendor === "huawei" ? "vrpcfg.zip" : "flash:archivo"}
              onChange={(e) => setRemote(e.target.value)}
            />
          </Label>
        )}
        {filesPanel}
      </Step>

      <Step
        n={3}
        title={recovering ? "Verificación y pasos en la consola" : "Verificación y comando"}
        hint={recovering ? "Datos de red, lo que falta y los valores para el menú de arranque" : "Lo que falta, con el botón para resolverlo, y el comando con la IP de este PC"}
        done={!recovering && ready}
        className="[grid-column:1/-1]"
      >
        {recovering ? (
          <Recovery
            vendor={vendor}
            file={file}
            pcIp={pcIp}
            term={term}
            tftpOn={tftpOn}
            tftpPort={tftpPort}
            tftpBind={tftpBind}
            tftpAllow={tftpAllow}
            startTftp={() => startServer("tftp")}
            usePort69={usePort69}
            listenOn={listenOn}
          />
        ) : (
          <div className="space-y-3">
            <Checklist checks={checks} />
            {r ? (
              <div className="rounded-lg border border-line p-2.5 space-y-2">
                <CopyText text={r.command} />
                {r.note && <p className={`text-[11.5px] ${r.disruptive ? "text-warn" : "text-muted"}`}>{r.note}</p>}
                <div className="flex flex-wrap items-center gap-2">
                  <Btn kind={ready ? "primary" : "default"} disabled={!term} onClick={write} title={term ? "Escribe el comando en la pestaña sin presionar Enter" : "Elige la pestaña del equipo en el paso 1"}>
                    <SquareTerminal size={14} /> {term ? `Escribir en ${term.name}` : "Escribir en la pestaña"}
                  </Btn>
                  {r.source && (
                    <Btn kind="ghost" onClick={() => openUrl(r.source!).catch(() => {})} title={r.source}>
                      <ExternalLink size={13} /> Documentación
                    </Btn>
                  )}
                </div>
                {!term && <p className="text-[11.5px] text-muted">Copia el comando o elige la pestaña del equipo en el paso 1 para escribirlo allí.</p>}
                {!ready && <p className="text-[11.5px] text-warn">Resuelve lo marcado con ! antes de ejecutar el comando en el equipo.</p>}
                {sent && (
                  <p className="text-[11.5px] text-muted" role="status">
                    {sent}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-[12px] text-muted">Este fabricante no hace esa tarea por TFTP/HTTP. Para Junos usa SCP en la pestaña FTP y SFTP.</p>
            )}
          </div>
        )}
      </Step>
    </ol>
  );
}

type CheckItem = { ok: boolean; text: string; fix?: { label: string; run: () => void } };

/**
 * Lista de verificación con el botón que resuelve cada punto. Solo el primero pendiente va como
 * primario: es el siguiente paso; los demás quedan secundarios.
 */
function Checklist({ checks, wrap }: { checks: CheckItem[]; wrap?: boolean }) {
  const next = checks.findIndex((c) => !c.ok && c.fix);
  return (
    <ul className="space-y-1" aria-label="Lista de verificación">
      {checks.map((c, i) => (
        <li key={c.text} className="flex items-center gap-2 text-[12px] min-h-6">
          <span aria-hidden className={`shrink-0 w-4 h-4 grid place-items-center rounded-full ${c.ok ? "bg-ok text-white" : "border border-warn text-warn"}`}>
            {c.ok ? <Check size={10} /> : "!"}
          </span>
          <span className="sr-only">{c.ok ? "Listo: " : "Pendiente: "}</span>
          <span className={`flex-1 min-w-0 ${wrap ? "" : "truncate"} ${c.ok ? "" : "text-warn"}`} title={wrap ? undefined : c.text}>
            {c.text}
          </span>
          {c.fix && (
            <Btn kind={i === next ? "primary" : "default"} className="!h-6 !px-2 !text-[11.5px]" onClick={c.fix.run}>
              {c.fix.label}
            </Btn>
          )}
        </li>
      ))}
    </ul>
  );
}

const OS = detectOs(navigator.userAgent);

/** Qué revisar en este sistema para que el equipo llegue al TFTP (puerto 69 y firewall). */
function OsTips() {
  return (
    <ul className="space-y-1">
      {osTips(OS).map((t) => (
        <li key={t.text} className="text-[11.5px] text-muted">
          {t.text}
          {t.command && (
            <span className="block mt-0.5">
              <CopyText text={t.command} />
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Guía de recuperación desde el gestor de arranque: datos de red, lista de verificación (TFTP en el
 * puerto 69, misma red, archivo) y los pasos con valores para copiar o enviar a la consola.
 */
function Recovery({
  vendor,
  file,
  pcIp,
  term,
  tftpOn,
  tftpPort,
  startTftp,
  usePort69,
  tftpBind,
  tftpAllow,
  listenOn,
}: {
  vendor: Vendor;
  file: string;
  pcIp: string;
  term?: TerminalRef;
  tftpOn: boolean;
  tftpPort: number;
  startTftp: () => void;
  usePort69: () => void;
  tftpBind: string;
  tftpAllow: string;
  listenOn: (ip: string) => void;
}) {
  const [deviceIp, setDeviceIp] = useState("");
  const [mask, setMask] = useState("255.255.255.0");
  const [gateway, setGateway] = useState("");
  const [sent, setSent] = useState("");
  const [tips, setTips] = useState(false);
  const dev = deviceIp.trim() || suggestDeviceIp(pcIp);
  const gw = gateway.trim() || pcIp;
  const guide = recoveryGuide(vendor, { pcIp, deviceIp: dev, mask, gateway: gw, file });
  if (!guide) return null;
  const serial = term?.session.type === "serial";
  const checks: CheckItem[] = [
    { ok: !!pcIp && !isLinkLocal(pcIp), text: !pcIp ? "Elige la IP de este PC en la barra del servidor" : isLinkLocal(pcIp) ? `${pcIp} es autoasignada: fija una IP estática en la tarjeta conectada al equipo` : `Este PC: ${pcIp}` },
    { ok: tftpPort === 69, text: tftpPort === 69 ? "TFTP en el puerto 69 (el que usa el arranque)" : `TFTP está en el puerto ${tftpPort}; el arranque solo usa el 69`, fix: tftpPort === 69 ? undefined : { label: "Usar 69", run: usePort69 } },
    {
      ok: tftpBind === ALL || tftpBind === pcIp,
      text: tftpBind === ALL || tftpBind === pcIp ? `TFTP escucha en ${tftpBind === ALL ? "todas las interfaces" : pcIp}` : `TFTP escucha en ${tftpBind}, no en ${pcIp}`,
      fix: tftpBind === ALL || tftpBind === pcIp || !pcIp ? undefined : { label: `Escuchar en ${pcIp}`, run: () => listenOn(pcIp) },
    },
    ...(ipAllowed(dev, parseAllow(tftpAllow).entries)
      ? []
      : [{ ok: false, text: `TFTP solo acepta a ${tftpAllow.trim()}: agrega ${dev} en Opciones del servidor › Acceso.` }]),
    { ok: tftpOn, text: tftpOn ? "Servidor TFTP activo" : "El servidor TFTP está detenido", fix: tftpOn || tftpPort !== 69 ? undefined : { label: "Iniciar TFTP", run: startTftp } },
    { ok: !!file, text: file ? `Imagen: ${file}` : "Elige o agrega la imagen en el paso 2" },
    { ok: sameSubnet(pcIp, dev, mask), text: sameSubnet(pcIp, dev, mask) ? `Equipo ${dev} en la misma red que este PC` : `El equipo (${dev}) y este PC no están en la misma red con ${mask}` },
    { ok: serial, text: serial ? `Consola: ${term!.name}` : term ? `${term.name} no es una consola serial: el menú de arranque solo sale por el puerto de consola` : "Elige en el paso 1 la pestaña de la consola serial para enviar los valores" },
  ];

  const send = (value: string, key?: boolean) => {
    if (!term) return;
    // Las teclas de menú del boot loader van solas; los valores y comandos, con Enter.
    invoke("write", { id: term.connId, data: key ? value : `${value}\r` })
      .then(() => setSent(`Enviado a ${term.name}: ${value}`))
      .catch((e) => setSent(`No se pudo enviar: ${e}`));
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(150px,100%),1fr))]">
        <Label text="IP para el equipo">
          <input className="field font-mono" value={deviceIp} placeholder={suggestDeviceIp(pcIp)} onChange={(e) => setDeviceIp(e.target.value)} />
        </Label>
        <Label text="Máscara">
          <input className="field font-mono" value={mask} onChange={(e) => setMask(e.target.value)} />
        </Label>
        {vendor === "cisco" && (
          <Label text="Gateway (distinto del router)">
            <input className="field font-mono" value={gateway} placeholder={pcIp} onChange={(e) => setGateway(e.target.value)} />
          </Label>
        )}
      </div>

      <Checklist checks={checks} wrap />

      <div className="rounded-lg border border-line p-2.5">
        <p className="text-[12.5px] font-medium mb-2">{guide.title}</p>
        <ol className="space-y-2.5 list-decimal pl-5">
          {guide.steps.map((st, i) => (
            <li key={i} className={`text-[12px] ${st.warn ? "text-warn" : ""}`}>
              {st.text}
              {st.values && (
                <ul className="mt-1.5 space-y-1">
                  {st.values.map((v) => (
                    <li key={v.label} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] items-center gap-2">
                      <span className="text-[11px] text-muted">{v.label}</span>
                      <span className="min-w-0">
                        <CopyText text={v.value} />
                      </span>
                      {v.send && (
                        <Btn kind="ghost" className="!h-6 !px-2 !text-[11.5px]" disabled={!term} title={term ? (v.key ? `Presiona ${v.value} en ${term.name}` : `Escribe ${v.value} y Enter en ${term.name}`) : "Elige la pestaña de la consola en el paso 1"} onClick={() => send(v.value, v.key)}>
                          <SquareTerminal size={12} /> Enviar
                        </Btn>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
        <div className="mt-2 flex flex-wrap gap-2">
          {guide.sources.map((u) => (
            <Btn key={u} kind="ghost" className="!h-6 !px-1.5 !text-[11.5px]" onClick={() => openUrl(u).catch(() => {})} title={u}>
              <ExternalLink size={12} /> Documentación
            </Btn>
          ))}
        </div>
        {sent && (
          <p className="mt-1 text-[11.5px] text-muted" role="status">
            {sent}
          </p>
        )}
      </div>

      <Collapsible title={`Si el equipo no llega al TFTP (${OS === "mac" ? "macOS" : OS === "windows" ? "Windows" : "Linux"})`} open={tips} onToggle={setTips}>
        <OsTips />
      </Collapsible>
    </div>
  );
}
