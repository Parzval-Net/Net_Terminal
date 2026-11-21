import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { FolderOpen, Pause, Play } from "lucide-react";
import { Settings } from "../../lib/settings";
import { Btn, CopyText, IpSelect, Label, Section, StatusPill, ToolHeader, Toggle } from "./ui";
import { useLocalIp } from "./useLocalIp";
import { ServerGuardPanel, commandIp, useGuardPrefs, useGuardStats } from "./ServerGuard";
import { ALL } from "../../lib/serverGuard";
import { loghostCommands } from "../../lib/devicefs";

interface Msg {
  ts: number;
  src: string;
  severity: number;
  facility: number;
  msg: string;
}

const SEV = ["Emergencia", "Alerta", "Crítico", "Error", "Warning", "Notice", "Info", "Debug"];
const sevColor = (s: number) => (s <= 3 ? "text-danger" : s === 4 ? "text-warn" : "text-muted");
const MAX = 5000;
/** Filas que se dibujan; el resto queda en memoria para filtrar y se avisa al pie. */
const SHOWN = 1000;

export function SyslogTool({
  settings: s,
  running,
  onChange,
  refreshRunning,
}: {
  settings: Settings;
  running: string[];
  onChange: (p: Partial<Settings>) => void;
  refreshRunning: () => void;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [filter, setFilter] = useState("");
  const [minSev, setMinSev] = useState(7);
  // Pausa de la vista: los mensajes se siguen recibiendo y la lista queda congelada en esta foto.
  const [frozen, setFrozen] = useState<Msg[] | null>(null);
  const paused = frozen !== null;
  const [error, setError] = useState("");
  const { ips, ip: localIp, setIp } = useLocalIp();
  const guard = useGuardPrefs("syslog", s, onChange, ips);
  const stats = useGuardStats(running);
  const on = running.includes("syslog");

  useEffect(() => {
    const un = listen<Msg[]>("syslog", ({ payload }) => {
      setMsgs((m) => [...payload.reverse(), ...m].slice(0, MAX));
    });
    return () => {
      un.then((f) => f());
    };
  }, []);

  const toggle = async () => {
    setError("");
    if (!on && guard.allowErrors.length) return setError(`Syslog: ${guard.allowErrors[0]}.`);
    try {
      if (on) await invoke("server_stop", { kind: "syslog" });
      else await invoke("server_start", { kind: "syslog", port: s.syslogPort, save: s.syslogSave, opts: guard.opts() });
    } catch (e) {
      setError(String(e));
    }
    refreshRunning();
  };

  const view = frozen ?? msgs;
  // Llegados durante la pausa: la lista nueva empieza con ellos, antes del primero de la foto.
  // Si el primero de la foto ya salió del tope (MAX), todo lo que hay en memoria es nuevo.
  const at = frozen?.length ? msgs.indexOf(frozen[0]) : -1;
  const pending = frozen ? (at < 0 ? msgs.length : at) : 0;
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return view.filter((m) => m.severity <= minSev && (!q || m.msg.toLowerCase().includes(q) || m.src.includes(q)));
  }, [view, filter, minSev]);

  // Con una interfaz de escucha fija los comandos usan esa IP; el selector solo aplica a "todas".
  const listenAll = guard.bind === ALL;
  const ip = commandIp(guard.bind, localIp || "IP_DE_ESTE_PC");
  const cmds = loghostCommands(ip, s.syslogPort);

  return (
    <div className="space-y-4">
      {/* Acción primaria (iniciar o detener el servidor) y su estado en el encabezado común. */}
      <ToolHeader
        title="Syslog"
        description="Recibe los logs que envían los equipos (UDP). Útil durante ventanas de cambio para ver eventos en vivo."
        actions={
          <>
            <StatusPill state={on ? "running" : "stopped"} label={on ? `Activo · UDP ${s.syslogPort}` : "Detenido"} />
            <Btn kind={on ? "default" : "primary"} onClick={toggle}>
              {on ? "Detener servidor" : "Iniciar servidor"}
            </Btn>
          </>
        }
      />
      <Section title="Servidor" hint="Puerto, archivo diario y control de acceso. El puerto y el archivo diario se cambian con el servidor detenido.">
        <div className="flex flex-wrap items-end gap-3">
          <Label text="Puerto" className="w-24">
            <input className="field" type="number" disabled={on} value={s.syslogPort} onChange={(e) => onChange({ syslogPort: Number(e.target.value) || 514 })} />
          </Label>
          {/* El archivo diario se fija al iniciar el servidor: con él activo el cambio no tendría efecto. */}
          <fieldset disabled={on} className="pb-1.5 disabled:opacity-60" title={on ? "Se cambia con el servidor detenido" : undefined}>
            <Toggle checked={s.syslogSave} onChange={(v) => onChange({ syslogSave: v })} label="Guardar en archivo diario" />
          </fieldset>
          <Btn kind="ghost" title="Abrir carpeta de syslog" aria-label="Abrir carpeta de syslog" onClick={() => invoke("open_dir", { which: "syslog" })}>
            <FolderOpen size={14} />
          </Btn>
        </div>
        {error && (
          <p role="alert" className="mt-2 text-body-sm text-danger">
            {error}
          </p>
        )}
        <div className="mt-3">
          <ServerGuardPanel kind="syslog" settings={s} onChange={onChange} ips={ips} running={on} stat={stats.syslog} />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {listenAll ? (
            <IpSelect ips={ips} ip={localIp} onChange={setIp} className="w-72" />
          ) : (
            <p className="pb-1 text-body-sm text-muted">
              Los comandos usan la IP de escucha <span className="font-mono text-fg">{guard.bind}</span> (se cambia en Acceso y seguridad).
            </p>
          )}
          <div className="flex flex-wrap items-center gap-1.5 pb-1 text-body-sm text-muted">
            Configura el equipo: Cisco <CopyText text={cmds.cisco} /> Huawei <CopyText text={cmds.huawei} />
          </div>
        </div>
        {cmds.huaweiPortNote && (
          <p className="mt-1.5 text-body-sm text-muted">
            Huawei: "port" está documentado en CloudEngine V300, NE y S5700/S6700 V200R024; en AR y versiones antiguas, verificar en tu
            versión (sin "port" solo sirve el 514).
          </p>
        )}
        {s.syslogPort < 1024 && (
          <p className="mt-1.5 text-body-sm text-muted">En Linux y macOS el puerto 514 puede requerir privilegios; si no inicia, usa 1514.</p>
        )}
      </Section>

      <Section
        title={`Mensajes (${shown.length}${shown.length !== view.length ? ` de ${view.length}` : ""})${paused ? " · vista en pausa" : ""}`}
        right={
          <div className="flex items-center gap-2">
            <input className="field !h-7 !w-48" placeholder="Filtrar texto o IP" aria-label="Filtrar mensajes por texto o IP" value={filter} onChange={(e) => setFilter(e.target.value)} />
            <select className="field !h-7 !w-36" aria-label="Severidad máxima" value={minSev} onChange={(e) => setMinSev(Number(e.target.value))}>
              {SEV.map((l, i) => (
                <option key={l} value={i}>
                  Hasta {l}
                </option>
              ))}
            </select>
            <Btn
              kind="ghost"
              title={paused ? "Reanudar la vista" : "Pausar la vista (los mensajes se siguen recibiendo)"}
              aria-label={paused && pending > 0 ? `Pausar la vista, ${pending} nuevos` : "Pausar la vista"}
              aria-pressed={paused}
              onClick={() => setFrozen(paused ? null : msgs)}
            >
              {paused ? <Play size={13} /> : <Pause size={13} />}
              {paused && pending > 0 && <span className="tabular-nums">+{pending} nuevos</span>}
            </Btn>
            <Btn
              kind="ghost"
              onClick={() => {
                setMsgs([]);
                if (paused) setFrozen([]);
              }}
            >
              Limpiar
            </Btn>
          </div>
        }
      >
        <div className="max-h-[480px] overflow-y-auto">
          <table className="w-full text-body-sm">
            <thead className="sr-only">
              <tr>
                <th scope="col">Hora</th>
                <th scope="col">Origen</th>
                <th scope="col">Severidad</th>
                <th scope="col">Mensaje</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {shown.slice(0, SHOWN).map((m, i) => (
                <tr key={`${m.ts}-${i}`} className="border-t border-line align-top">
                  <td className="py-1 pr-3 text-muted whitespace-nowrap tabular-nums">{new Date(m.ts).toLocaleTimeString("es-CL")}</td>
                  <td className="pr-3 whitespace-nowrap">{m.src}</td>
                  <td className={`pr-3 whitespace-nowrap font-sans ${sevColor(m.severity)}`}>
                    {m.severity <= 3 ? "✕ " : m.severity === 4 ? "▲ " : ""}
                    {SEV[m.severity]}
                  </td>
                  <td className="break-all select-text">{m.msg}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length > SHOWN && (
            <p className="p-2 text-body-sm text-muted">
              Se muestran {SHOWN.toLocaleString("es-CL")} de {shown.length.toLocaleString("es-CL")}; filtra o usa el archivo diario para ver todo.
            </p>
          )}
          {msgs.length === 0 && <p className="text-body-sm text-muted">{on ? "Esperando mensajes…" : "Inicia el servidor para recibir logs."}</p>}
        </div>
      </Section>
    </div>
  );
}
