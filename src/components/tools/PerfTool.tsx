import { useEffect, useId, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { ChevronRight, FolderSearch, Gauge, Play, RefreshCw, Square, Trash2 } from "lucide-react";
import { SpeedResult } from "../../lib/settings";
import { parsePort, portError, speedProgress } from "../../lib/perf";
import { LineChart } from "./LineChart";
import { Btn, Console, CopyText, Label, Metric, Section, ToolHeader, Toggle } from "./ui";
import { useJob } from "./useJob";

interface IperfResult {
  protocol: string;
  sent_mbps: number | null;
  received_mbps: number | null;
  retransmits: number | null;
  jitter_ms: number | null;
  lost_percent: number | null;
  cpu_local: number | null;
  cpu_remote: number | null;
  remote: string | null;
  intervals: number[];
}

const mbps = (v: number | null | undefined) =>
  v == null ? "—" : v >= 1000 ? `${(v / 1000).toFixed(2)} Gbps` : `${v.toFixed(v >= 100 ? 0 : 1)} Mbps`;

interface SpeedProps {
  history: SpeedResult[];
  onResult: (r: SpeedResult) => void;
  onHistory: (h: SpeedResult[]) => void;
}

/** `onServing`: avisa a ToolsView si el servidor iperf3 está escuchando (punto verde del menú). */
export function PerfTool({ onServing, ...p }: SpeedProps & { onServing?: (on: boolean) => void }) {
  return (
    <div className="space-y-4">
      {/* Sin acción primaria en el encabezado: Speedtest e iperf3 se inician cada uno en su sección. */}
      <ToolHeader title="Velocidad" description="Speedtest de la conexión a internet de este PC e iperf3 para medir el throughput entre dos puntos de tu red." />
      <SpeedTest {...p} />
      <Iperf onServing={onServing} />
    </div>
  );
}

function SpeedTest({ history, onResult, onHistory }: SpeedProps) {
  // Borrado en dos clics (sin diálogo): el primero arma, el segundo confirma.
  const [armed, setArmed] = useState<string | null>(null);
  const job = useJob<SpeedResult, { phase: string; value: number; progress: number }>();
  const [live, setLive] = useState<{ download: number[]; upload: number[] }>({ download: [], upload: [] });

  useEffect(() => {
    const p = job.progress;
    if (p && (p.phase === "download" || p.phase === "upload"))
      setLive((l) => ({ ...l, [p.phase]: [...l[p.phase as "download" | "upload"], p.value] }));
  }, [job.progress]);

  useEffect(() => {
    if (job.result) onResult(job.result);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.result]);

  // Si la última medición se borró del historial, deja de mostrarse en los indicadores.
  const r = job.result && history.some((h) => h.ts === job.result!.ts) ? job.result : history[0];
  const phaseLabel = { latency: "Midiendo latencia", download: "Midiendo bajada", upload: "Midiendo subida" }[job.progress?.phase ?? ""] ?? "Preparando";
  // Avance global: el backend informa cada fase de 0 a 100 %; aquí se pondera por lo que transfiere cada una.
  const overall = speedProgress(job.progress?.phase, job.progress?.progress);
  const pct = Math.round(overall.value * 100);
  const livePhase: "download" | "upload" = job.progress?.phase === "upload" ? "upload" : "download";

  return (
    <Section
      title="Speedtest"
      hint="Contra speed.cloudflare.com (red anycast más cercana). Consume ~95 MB de datos por prueba."
      right={
        <Btn
          kind={job.running ? "default" : "primary"}
          onClick={() => {
            if (job.running) return job.stop();
            setLive({ download: [], upload: [] });
            job.start("tool_speedtest");
          }}
        >
          {job.running ? <Square size={13} /> : <Gauge size={14} />} {job.running ? "Detener" : "Iniciar prueba"}
        </Btn>
      }
    >
      {job.running && (
        <div className="mb-3">
          <div className="flex justify-between text-body-sm text-muted mb-1 tabular-nums">
            <span>
              {phaseLabel} · paso {overall.step} de 3
            </span>
            <span>{job.progress ? `${pct} %` : ""}</span>
          </div>
          <div
            role="progressbar"
            aria-label="Avance del speedtest"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-valuetext={`${phaseLabel}, paso ${overall.step} de 3, ${pct} %`}
            className="h-1.5 rounded-full bg-hover overflow-hidden"
          >
            <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}
      {job.error && <p className="mb-2 text-body-sm text-danger">{job.error}</p>}
      <div className="grid grid-cols-2 @[32rem]:grid-cols-4 gap-x-3 gap-y-2">
        <Metric label="Bajada" value={mbps(r?.download_mbps)} />
        <Metric label="Subida" value={mbps(r?.upload_mbps)} />
        <Metric label="Latencia" value={r ? `${r.latency_ms.toFixed(1)} ms` : "—"} />
        <Metric label="Jitter" value={r ? `${r.jitter_ms.toFixed(1)} ms` : "—"} />
      </div>
      {r?.server?.colo && (
        <p className="mt-2 text-body-sm text-muted">
          Servidor: {r.server.colo}
          {r.server.city ? ` (${r.server.city})` : ""} · {new Date(r.ts).toLocaleString("es-CL")}
        </p>
      )}
      {job.running && live[livePhase].length > 0 && (
        <div className="mt-3">
          <LineChart
            title={livePhase === "upload" ? "Mediciones de subida" : "Mediciones de bajada"}
            unit="Mbps"
            height={110}
            points={live[livePhase].map((y, i) => ({ x: i, y }))}
          />
        </div>
      )}
      {history.length > 0 && (
        // Mismo chevron que Collapsible en lugar del marcador nativo (▶), que cambia según la plataforma.
        <details className="group mt-3">
          <summary className="inline-flex items-center gap-1.5 px-1 -mx-1 h-6 rounded-md text-body-sm text-muted hover:text-fg hover:bg-hover cursor-default list-none [&::-webkit-details-marker]:hidden">
            <ChevronRight size={14} aria-hidden className="shrink-0 transition-transform group-open:rotate-90" />
            Historial ({history.length})
          </summary>
          <table className="w-full mt-2 text-body-sm">
            <thead className="text-muted text-left">
              <tr>
                <th className="font-medium py-1">Fecha</th>
                <th className="font-medium">Bajada</th>
                <th className="font-medium">Subida</th>
                <th className="font-medium">Latencia</th>
                <th className="font-medium">Jitter</th>
                <th className="font-medium">Servidor</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {history.map((h) => (
                <tr key={h.ts} className="border-t border-line">
                  <td className="py-1">{new Date(h.ts).toLocaleString("es-CL")}</td>
                  <td>{mbps(h.download_mbps)}</td>
                  <td>{mbps(h.upload_mbps)}</td>
                  <td>{h.latency_ms.toFixed(1)} ms</td>
                  <td>{h.jitter_ms != null ? `${h.jitter_ms.toFixed(1)} ms` : "—"}</td>
                  <td>{h.server?.colo ?? ""}</td>
                  <td className="text-right">
                    {/* Armado: el texto visible y el nombre accesible piden confirmar (no solo el color). */}
                    <button
                      title={armed === h.ts ? "Clic para confirmar" : "Eliminar esta medición"}
                      aria-label={armed === h.ts ? "Confirmar: eliminar esta medición" : "Eliminar esta medición"}
                      onMouseLeave={() => setArmed(null)}
                      onBlur={() => setArmed(null)}
                      onClick={() => {
                        if (armed !== h.ts) return setArmed(h.ts);
                        onHistory(history.filter((x) => x.ts !== h.ts));
                        setArmed(null);
                      }}
                      className={`h-6 min-w-6 px-1 inline-flex items-center justify-center gap-1 rounded-md hover:bg-hover ${
                        armed === h.ts ? "text-danger" : "text-muted hover:text-danger"
                      }`}
                    >
                      <Trash2 size={13} aria-hidden />
                      {armed === h.ts && <span>Confirmar</span>}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-end mt-1">
            <button
              onMouseLeave={() => setArmed(null)}
              onBlur={() => setArmed(null)}
              onClick={() => {
                if (armed !== "all") return setArmed("all");
                onHistory([]);
                setArmed(null);
              }}
              className={`text-body-sm px-2 h-6 rounded-md hover:bg-hover ${armed === "all" ? "text-danger" : "text-muted hover:text-danger"}`}
            >
              {armed === "all" ? "Clic para borrar todo el historial" : "Borrar historial"}
            </button>
          </div>
        </details>
      )}
    </Section>
  );
}

/** Ruta de iperf3 elegida a mano (comodidad de este equipo: cada PC lo tiene en otra carpeta). */
const IPERF_PATH_KEY = "iperfPath";
const storedIperfPath = () => {
  try {
    return localStorage.getItem(IPERF_PATH_KEY) ?? "";
  } catch {
    return "";
  }
};
/** `suggested`: hallado en una carpeta de usuario (Descargas, C:\…) y aún no ejecutado. */
type IperfFound = { path: string; version: string; suggested?: boolean };
const isWindows = typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);

function Iperf({ onServing }: { onServing?: (on: boolean) => void }) {
  const [found, setFound] = useState<IperfFound | null | undefined>(undefined);
  const [searching, setSearching] = useState(false);
  const [pickError, setPickError] = useState("");
  const version = found === undefined ? undefined : found && !found.suggested ? found.version : null;
  const [host, setHost] = useState("");
  // El puerto se guarda como texto: así se puede borrar y reescribir, y se valida al enviar.
  const [portText, setPortText] = useState("5201");
  const [serverPortText, setServerPortText] = useState("5201");
  const [seconds, setSeconds] = useState(10);
  const [parallel, setParallel] = useState(1);
  const [reverse, setReverse] = useState(false);
  const [udp, setUdp] = useState(false);
  const [bandwidth, setBandwidth] = useState("100M");
  const client = useJob<IperfResult>();
  const server = useJob();
  // Parámetros con que se inició cada job: lo que se muestra corresponde a lo que corre.
  const [clientRun, setClientRun] = useState<{ seconds: number; t0: number } | null>(null);
  const [serverPort, setServerPort] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const portId = useId();
  const serverPortId = useId();

  useEffect(() => {
    if (!client.running || !clientRun) return;
    setElapsed(0);
    const t = window.setInterval(() => setElapsed(Math.floor((Date.now() - clientRun.t0) / 1000)), 1000);
    return () => window.clearInterval(t);
  }, [client.running, clientRun]);

  const serving = useRef(onServing);
  serving.current = onServing;
  useEffect(() => {
    serving.current?.(server.running);
  }, [server.running]);
  useEffect(() => () => serving.current?.(false), []);
  const [ips, setIps] = useState<{ name: string; ip: string }[]>([]);

  /** Busca iperf3 (también fuera del PATH: carpetas de descarga, winget, Homebrew, snap…). */
  const detect = async (custom = storedIperfPath()) => {
    setSearching(true);
    try {
      const f = await invoke<IperfFound | null>("tool_iperf_version", { custom: custom || null });
      setFound(f);
      return f;
    } catch {
      setFound(null);
      return null;
    } finally {
      setSearching(false);
    }
  };
  /** El usuario elige el ejecutable (o confirma el sugerido): se guarda solo si responde como iperf3. */
  const pick = async (chosen?: string) => {
    setPickError("");
    const file =
      chosen ??
      (await open({
        multiple: false,
        directory: false,
        title: "Elegir el ejecutable de iperf3",
        filters: isWindows ? [{ name: "iperf3", extensions: ["exe"] }] : undefined,
      }));
    if (typeof file !== "string") return;
    const f = await detect(file);
    if (f && f.path === file) {
      try {
        localStorage.setItem(IPERF_PATH_KEY, file);
      } catch {
        /* solo comodidad */
      }
    } else setPickError(`"${file.split(/[\\/]/).pop()}" no respondió como iperf3 (el archivo debe llamarse iperf3${isWindows ? ".exe" : ""}).`);
  };

  const whyId = useId();
  useEffect(() => {
    void detect();
    invoke<{ name: string; ip: string }[]>("local_ips")
      .then(setIps)
      .catch(() => setIps([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (version === null)
    return (
      <Section title="iperf3" hint="Throughput, retransmisiones, jitter y pérdida entre dos puntos.">
        <p className="text-body-sm">
          No se encontró iperf3 en el PATH ni en las carpetas habituales (Descargas, Archivos de programa, winget, Chocolatey, Scoop, Homebrew, MacPorts, snap). Si ya lo
          instalaste o descomprimiste en otra carpeta, elige el ejecutable:
        </p>
        {found?.suggested && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-body-sm">
            <span className="min-w-0 break-all">
              Se encontró uno en <span className="font-mono">{found.path}</span>. Por seguridad no se ejecuta hasta que lo confirmes.
            </span>
            <Btn onClick={() => void pick(found.path)}>Usar este</Btn>
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Btn kind={found?.suggested ? undefined : "primary"} onClick={() => void pick()}>
            <FolderSearch size={14} /> Elegir iperf3{isWindows ? ".exe" : ""}…
          </Btn>
          <Btn onClick={() => void detect()} disabled={searching}>
            <RefreshCw size={14} className={searching ? "animate-spin" : ""} /> {searching ? "Buscando…" : "Buscar de nuevo"}
          </Btn>
        </div>
        {pickError && <p className="mt-1.5 text-body-sm text-danger">{pickError}</p>}
        <p className="mt-3 text-body-sm text-muted">Para instalarlo:</p>
        <ul className="mt-2 space-y-1 text-body-sm text-muted">
          <li>
            macOS: <CopyText text="brew install iperf3" />
          </li>
          <li>
            Linux: <CopyText text="sudo apt install iperf3" /> o <CopyText text="sudo dnf install iperf3" />
          </li>
          <li>
            Windows: búscalo con <CopyText text="winget search iperf3" /> o usa una compilación de terceros enlazada desde iperf.fr (ESnet no publica binarios). Si es un zip,
            descomprímelo completo (iperf3.exe necesita cygwin1.dll en la misma carpeta) y elige iperf3.exe arriba.
          </li>
        </ul>
      </Section>
    );

  const r = client.result;
  const port = parsePort(portText);
  const portErr = portError(portText);
  const sPort = parsePort(serverPortText);
  const sPortErr = portError(serverPortText);
  // Por qué "Medir" no se puede pulsar todavía.
  const measureWhy = client.running ? undefined : !host.trim() ? "Ingresa la IP del servidor iperf3" : portErr ? "Corrige el puerto" : undefined;
  const runSecs = clientRun?.seconds ?? seconds;

  return (
    // items-start: cada tarjeta mide lo que su contenido; estiradas al alto de la vecina dejaban bloques vacíos.
    <div className="grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(400px,1fr))]">
      <Section
        title="iperf3 · cliente"
        hint={found ? `${found.version} · ${found.path}` : "Detectando…"}
        right={
          found && (
            <Btn kind="ghost" className="!h-7 !px-2" title="Usar otro ejecutable de iperf3" onClick={() => void pick()}>
              <FolderSearch size={13} /> Cambiar
            </Btn>
          )
        }
      >
        {pickError && <p className="mb-2 text-body-sm text-danger">{pickError}</p>}
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (client.running) return client.stop();
            if (!host.trim() || port == null) return;
            setClientRun({ seconds, t0: Date.now() });
            client.start("tool_iperf", {
              params: { host: host.trim(), port, seconds, parallel, reverse, udp, bandwidth: udp ? bandwidth : undefined },
            });
          }}
        >
          {/* Con la medición en curso los parámetros quedan fijos: lo visible es lo que se mide. */}
          <fieldset disabled={client.running} className="space-y-3 min-w-0">
          <div className="grid grid-cols-2 @[36rem]:grid-cols-[1fr_90px_90px_80px] gap-2">
            <Label text="Servidor iperf3">
              <input className="field" value={host} placeholder="Ej. 10.0.0.2" onChange={(e) => setHost(e.target.value)} />
            </Label>
            <Label text="Puerto">
              <input
                className="field"
                type="number"
                inputMode="numeric"
                min={1}
                max={65535}
                value={portText}
                aria-invalid={portErr ? true : undefined}
                aria-describedby={portErr ? portId : undefined}
                onChange={(e) => setPortText(e.target.value)}
              />
            </Label>
            <Label text="Duración">
              <select className="field" value={seconds} onChange={(e) => setSeconds(Number(e.target.value))}>
                {[5, 10, 30, 60].map((s) => (
                  <option key={s} value={s}>
                    {s} s
                  </option>
                ))}
              </select>
            </Label>
            <Label text="Flujos">
              <select className="field" value={parallel} onChange={(e) => setParallel(Number(e.target.value))}>
                {[1, 2, 4, 8, 16].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Label>
          </div>
          {portErr && (
            <p id={portId} role="status" className="text-body-sm text-danger">
              {portErr}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-4">
            <Toggle checked={reverse} onChange={setReverse} label="Inverso (servidor → cliente)" />
            <Toggle checked={udp} onChange={setUdp} label="UDP" />
            {udp && (
              <input
                className="field !w-24 !h-7"
                value={bandwidth}
                aria-label="Ancho de banda objetivo"
                title="Ancho de banda objetivo (ej. 100M, 1G)"
                onChange={(e) => setBandwidth(e.target.value)}
              />
            )}
          </div>
          </fieldset>
          <div className="flex flex-wrap items-center gap-4">
            <span className="ml-auto inline-flex flex-wrap items-center gap-2">
              {/* Estado aparte del botón: "Detener" es la acción; el avance va como texto y barra. */}
              {client.running && (
                <span className="inline-flex items-center gap-2 text-body-sm text-muted tabular-nums">
                  Midiendo: {Math.min(elapsed, runSecs)} de {runSecs} s
                  <span
                    role="progressbar"
                    aria-label="Avance de la medición iperf3"
                    aria-valuemin={0}
                    aria-valuemax={runSecs}
                    aria-valuenow={Math.min(elapsed, runSecs)}
                    className="w-20 h-1.5 rounded-full bg-hover overflow-hidden"
                  >
                    <span className="block h-full bg-accent transition-all" style={{ width: `${Math.min(100, (elapsed / runSecs) * 100)}%` }} />
                  </span>
                </span>
              )}
              {/* Motivo visible del botón deshabilitado (no solo el tono atenuado). */}
              {measureWhy && (
                <span id={whyId} className="text-body-sm text-muted">
                  {measureWhy}
                </span>
              )}
              <Btn
                type="submit"
                kind={client.running ? "default" : "primary"}
                disabled={!client.running && !!measureWhy}
                aria-describedby={measureWhy ? whyId : undefined}
                title={measureWhy}
              >
                {client.running ? <Square size={13} /> : <Play size={13} />} {client.running ? "Detener" : "Medir"}
              </Btn>
            </span>
          </div>
        </form>
        {client.error && <p className="mt-2 text-body-sm text-danger">{client.error}</p>}
        {r && (
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-2 @[32rem]:grid-cols-4 gap-x-3 gap-y-2">
              <Metric label="Enviado" value={mbps(r.sent_mbps)} />
              <Metric label="Recibido" value={mbps(r.received_mbps)} />
              {r.protocol === "UDP" ? (
                <>
                  <Metric label="Jitter" value={r.jitter_ms != null ? `${r.jitter_ms.toFixed(2)} ms` : "—"} />
                  <Metric label="Pérdida" value={r.lost_percent != null ? `${r.lost_percent.toFixed(2)} %` : "—"} tone={(r.lost_percent ?? 0) > 1 ? "danger" : undefined} />
                </>
              ) : (
                <>
                  <Metric label="Retransmisiones" value={String(r.retransmits ?? "—")} tone={(r.retransmits ?? 0) > 0 ? "warn" : undefined} />
                  <Metric label="CPU local / remota" value={r.cpu_local != null ? `${r.cpu_local.toFixed(0)} / ${(r.cpu_remote ?? 0).toFixed(0)} %` : "—"} />
                </>
              )}
            </div>
            {r.intervals.length > 1 && (
              <LineChart title="Throughput por segundo" unit="Mbps" height={130} points={r.intervals.map((y, i) => ({ x: i + 1, y }))} xLabel={(x) => `Segundo ${x}`} />
            )}
          </div>
        )}
        {!r && client.lines.length > 0 && <Console lines={client.lines} height={120} />}
      </Section>

      <Section
        title="iperf3 · servidor"
        hint="Para medir desde otro equipo hacia este PC."
        right={
          // Sin kind primario: abre un listener en todas las interfaces, el rótulo dice qué hace.
          <Btn
            disabled={!server.running && sPort == null}
            onClick={() => {
              if (server.running) return server.stop();
              if (sPort == null) return;
              setServerPort(sPort);
              server.start("tool_iperf", { params: { server: true, port: sPort } });
            }}
          >
            {server.running ? <Square size={13} /> : <Play size={13} />} {server.running ? "Detener" : sPort != null ? `Escuchar en puerto ${sPort}` : "Escuchar"}
          </Btn>
        }
      >
        <Label text="Puerto de escucha" className="w-40 mb-1">
          <input
            className="field"
            type="number"
            inputMode="numeric"
            min={1}
            max={65535}
            value={serverPortText}
            disabled={server.running}
            aria-invalid={sPortErr ? true : undefined}
            aria-describedby={sPortErr ? serverPortId : undefined}
            onChange={(e) => setServerPortText(e.target.value)}
          />
        </Label>
        {sPortErr && !server.running && (
          <p id={serverPortId} role="status" className="text-body-sm text-danger">
            {sPortErr}
          </p>
        )}
        <p className="mt-2 text-body-sm text-muted mb-2">Desde el otro extremo ejecuta:</p>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {ips.map((i) => (
            <CopyText key={i.ip} text={`iperf3 -c ${i.ip} -p ${server.running && serverPort != null ? serverPort : (sPort ?? 5201)}`} />
          ))}
        </div>
        {server.error && <p className="mb-2 text-body-sm text-danger">{server.error}</p>}
        <Console lines={server.lines} empty={server.running ? "Esperando clientes…" : "Detenido"} height={160} />
      </Section>
    </div>
  );
}
