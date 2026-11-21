import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Play, Square } from "lucide-react";
import { MAX_PORTS, PortState, Sample, parsePortList, portState, stats } from "../../lib/monitors";
import { LineChart } from "./LineChart";
import { Btn, Console, Label, Metric, Section, ToolHeader, fmtMs } from "./ui";
import { useJob } from "./useJob";

const QUICK = "quick-ping";

interface PortRow {
  port: number;
  open: boolean;
  rtt: number | null;
  error: string | null;
}

const COMMON: Record<number, string> = {
  21: "FTP", 22: "SSH", 23: "Telnet", 25: "SMTP", 53: "DNS", 69: "TFTP", 80: "HTTP", 110: "POP3", 161: "SNMP",
  179: "BGP", 389: "LDAP", 443: "HTTPS", 445: "SMB", 830: "NETCONF", 1812: "RADIUS", 3389: "RDP", 8080: "HTTP alt",
  8443: "HTTPS alt", 49: "TACACS+",
};

const PORT_LABEL: Record<PortState, [string, string]> = {
  open: ["● Abierto", "text-ok"],
  refused: ["○ Cerrado (rechaza)", "text-muted"],
  filtered: ["◌ Filtrado (sin respuesta)", "text-warn"],
  error: ["✕ Error", "text-danger"],
};

export function DiagTool({ samples }: { samples: Record<string, Sample[]> }) {
  const [pingHost, setPingHost] = useState("");
  const [pinging, setPinging] = useState(false);
  const [pingErr, setPingErr] = useState("");
  // Host e inicio del ping en curso: las muestras de "quick-ping" viven en App y se acumulan entre
  // corridas; sin este corte se mezclaban las de un host anterior en el gráfico y la pérdida.
  const [pingRun, setPingRun] = useState<{ host: string; since: number } | null>(null);
  const [traceHost, setTraceHost] = useState("");
  const trace = useJob();
  const [portHost, setPortHost] = useState("");
  const [portText, setPortText] = useState("22,23,80,443,830,8080");
  const [ports, setPorts] = useState<PortRow[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [portErr, setPortErr] = useState("");

  useEffect(() => () => void invoke("monitor_stop", { id: QUICK }).catch(() => {}), []);

  const togglePing = async () => {
    if (pinging) {
      // Aunque detener falle (el monitor ya no existe), el botón vuelve a "Iniciar".
      await invoke("monitor_stop", { id: QUICK }).catch(() => {});
      return setPinging(false);
    }
    setPingErr("");
    const host = pingHost.trim();
    try {
      const since = Date.now();
      await invoke("monitor_start", {
        cfg: { id: QUICK, kind: "icmp", host, interval_ms: 1000, timeout_ms: 1000 },
      });
      setPingRun({ host, since });
      setPinging(true);
    } catch (e) {
      setPingErr(String(e));
    }
  };

  const quick = useMemo(
    () => (pingRun ? (samples[QUICK] ?? []).filter((s) => s.ts >= pingRun.since).slice(-300) : []),
    [samples, pingRun],
  );
  const st = stats(quick);
  const portList = useMemo(() => parsePortList(portText), [portText]);
  const portMsg = portList.invalid.length
    ? `${portList.invalid.map((x) => `"${x}"`).join(", ")} no ${portList.invalid.length === 1 ? "es un puerto válido" : "son puertos válidos"} (1 a 65535)`
    : portList.truncated
      ? `Máximo ${MAX_PORTS} puertos por consulta: acota el rango`
      : "";

  const scan = async () => {
    setScanning(true);
    setPortErr("");
    setPorts(null);
    try {
      setPorts(await invoke<PortRow[]>("tool_ports", { host: portHost.trim(), ports: portList.ports, timeoutMs: 1500 }));
    } catch (e) {
      setPortErr(String(e));
    }
    setScanning(false);
  };

  return (
    <div className="space-y-4">
      {/* Sin acción primaria en el encabezado: cada prueba tiene la suya y corren por separado. */}
      <ToolHeader title="Diagnóstico" description="Ping continuo, traceroute y revisión de puertos TCP desde este PC hacia un equipo." />
      <Section
        title={pingRun ? `Ping continuo a ${pingRun.host}` : "Ping continuo"}
        hint="Usa el ping del sistema; no requiere permisos de administrador."
      >
        <form
          className="flex gap-2 mb-3"
          onSubmit={(e) => {
            e.preventDefault();
            togglePing();
          }}
        >
          <input className="field flex-1" aria-label="Host para ping" placeholder="8.8.8.8 o router.lab" value={pingHost} disabled={pinging} onChange={(e) => setPingHost(e.target.value)} />
          <Btn type="submit" kind={pinging ? "default" : "primary"} disabled={!pingHost.trim()}>
            {pinging ? <Square size={13} /> : <Play size={13} />} {pinging ? "Detener" : "Iniciar"}
          </Btn>
        </form>
        {pingErr && <p className="mb-2 text-body-sm text-danger">{pingErr}</p>}
        <div className="grid grid-cols-5 gap-x-3 gap-y-2 mb-3">
          <Metric label="Actual" value={st.last?.ok ? fmtMs(st.last.rtt) : st.last ? "Sin resp." : "—"} tone={st.last && !st.last.ok ? "danger" : undefined} />
          <Metric label="Promedio" value={fmtMs(st.avg)} />
          <Metric label="Mín / máx" value={st.min == null ? "—" : `${st.min.toFixed(0)} / ${st.max!.toFixed(0)}`} />
          <Metric label="Jitter" value={fmtMs(st.jitter)} />
          <Metric label={`Pérdida (${st.lost}/${st.sent})`} value={st.sent ? `${st.loss.toFixed(1)} %` : "—"} tone={st.loss >= 5 ? "danger" : st.loss > 0 ? "warn" : undefined} />
        </div>
        <LineChart
          title="Latencia del ping continuo"
          unit="ms"
          height={150}
          points={quick.map((s) => ({ x: s.ts, y: s.ok ? s.rtt : null, note: s.error ?? undefined }))}
          xLabel={(x) => new Date(x).toLocaleTimeString("es-CL")}
        />
      </Section>

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(380px,1fr))]">
        <Section title="Traceroute" hint="Muestra cada salto hasta el destino (sin resolver nombres).">
          <form
            className="flex gap-2 mb-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (trace.running) trace.stop();
              else trace.start("tool_traceroute", { host: traceHost.trim() });
            }}
          >
            <input className="field flex-1" aria-label="Destino del traceroute" placeholder="Destino" value={traceHost} onChange={(e) => setTraceHost(e.target.value)} />
            <Btn type="submit" kind={trace.running ? "default" : "primary"} disabled={!traceHost.trim()}>
              {trace.running ? "Detener" : "Trazar"}
            </Btn>
          </form>
          {trace.error && <p className="mb-2 text-body-sm text-danger">{trace.error}</p>}
          <Console lines={trace.lines} empty="La ruta aparecerá aquí" />
        </Section>

        <Section title="Puertos TCP" hint="Verifica si un servicio acepta conexiones. Rangos permitidos: 22,80-90.">
          <form
            className="grid grid-cols-[1fr_1fr_auto] gap-2 mb-3"
            onSubmit={(e) => {
              e.preventDefault();
              scan();
            }}
          >
            <Label text="Host">
              <input className="field" value={portHost} placeholder="192.0.2.10" onChange={(e) => setPortHost(e.target.value)} />
            </Label>
            <Label text="Puertos">
              <input
                className="field font-mono !text-body-sm"
                value={portText}
                aria-invalid={!!portMsg}
                aria-describedby="diag-ports-msg"
                onChange={(e) => setPortText(e.target.value)}
              />
            </Label>
            <div className="self-end">
              <Btn type="submit" kind="primary" disabled={scanning || !portHost.trim() || !portList.ports.length || !!portMsg}>
                {scanning ? "Revisando…" : "Revisar"}
              </Btn>
            </div>
          </form>
          {/* Cuántos puertos se revisarán o por qué no: antes "1-65535" revisaba 1..1024 y "abc" se ignoraba sin aviso. */}
          <p id="diag-ports-msg" className={`-mt-1 mb-2 text-body-sm ${portMsg ? "text-danger" : "text-muted"}`} aria-live="polite">
            {portMsg || `${portList.ports.length} ${portList.ports.length === 1 ? "puerto" : "puertos"}${scanning && portList.ports.length > 64 ? ": puede tardar unos segundos" : ""}`}
          </p>
          {portErr && <p className="mb-2 text-body-sm text-danger">{portErr}</p>}
          <div className="max-h-[220px] overflow-y-auto">
            <table className="w-full text-body-sm tabular-nums">
              <thead className="text-muted text-left">
                <tr>
                  <th className="font-medium py-1">Puerto</th>
                  <th className="font-medium">Servicio</th>
                  <th className="font-medium">Estado</th>
                  <th className="font-medium">Detalle</th>
                  <th className="font-medium text-right">Tiempo</th>
                </tr>
              </thead>
              <tbody>
                {/* Cerrado (RST) y filtrado (sin respuesta) se distinguen, y el motivo va en una columna
                    visible: en un tooltip no se leía con teclado y una falla de DNS parecía un puerto cerrado. */}
                {ports?.map((r) => {
                  const [text, color] = PORT_LABEL[portState(r)];
                  return (
                    <tr key={r.port} className="border-t border-line">
                      <td className="py-1 font-mono">{r.port}</td>
                      <td className="text-muted">{COMMON[r.port] ?? ""}</td>
                      <td className={`whitespace-nowrap ${color}`}>{text}</td>
                      <td className="text-muted [overflow-wrap:anywhere]">{r.open ? "" : (r.error ?? "")}</td>
                      <td className="text-right tabular-nums">{r.open ? fmtMs(r.rtt) : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </div>
  );
}
