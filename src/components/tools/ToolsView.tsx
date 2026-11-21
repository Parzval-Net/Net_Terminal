import { type ReactElement, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Activity, ArrowDownUp, Calculator, DatabaseBackup, FileSearch, Gauge, Network, Puzzle, Radar, ScrollText, ShieldCheck, SquareTerminal, Waypoints, Wrench, X } from "lucide-react";
import { TopologyTool } from "./TopologyTool";
import type { Session } from "../../types";
import { ModuleId, Settings, SpeedResult } from "../../lib/settings";
import type { TopoSnapshot, TopoSources, Topology } from "../../lib/topology";
import type { SnmpProfile } from "../../lib/snmp";
import { MonitorStatus, MonitorTarget, Sample } from "../../lib/monitors";
import { MonitorTool } from "./MonitorTool";
import { DiagTool } from "./DiagTool";
import { SubnetTool } from "./SubnetTool";
import { PerfTool } from "./PerfTool";
import { TransferTool } from "./TransferTool";
import { SyslogTool } from "./SyslogTool";
import { PluginsTool } from "./PluginsTool";
import type { ScpRequest, TabBrief, TerminalRef } from "./FileManager";
import { persist, stored } from "../../lib/prefs";
import { modLabel } from "../../lib/platform";
import { idleStopMessage } from "../../lib/serverGuard";
import { lazyView, whenIdle } from "../../lib/lazyView";

// Respaldos, SNMP, búsqueda en logs y auditoría van en chunks propios que se precargan junto con
// Herramientas (preloadTools): al abrir el módulo ya están y se dibujan al instante.
const BackupTool = lazyView(() => import("./BackupTool").then((m) => m.default));
const SnmpTool = lazyView(() => import("./SnmpTool").then((m) => m.default));
const LogSearchTool = lazyView(() => import("./LogSearchTool").then((m) => m.default));
const AuditTool = lazyView(() => import("./AuditTool").then((m) => m.default));

/** Precarga los módulos en chunks propios cuando la app queda libre. */
export function preloadTools() {
  whenIdle(() => {
    for (const t of [AuditTool, SnmpTool, BackupTool, LogSearchTool]) t.preload().catch(() => {});
  });
}

const NAV: { id: ModuleId; label: string; Icon: typeof Activity }[] = [
  { id: "monitor", label: "Monitoreo", Icon: Activity },
  { id: "diag", label: "Diagnóstico", Icon: Radar },
  { id: "syslog", label: "Syslog", Icon: ScrollText },
  { id: "snmp", label: "SNMP", Icon: Waypoints },
  { id: "topology", label: "Topología", Icon: Network },
  { id: "subnet", label: "Subredes", Icon: Calculator },
  { id: "perf", label: "Velocidad", Icon: Gauge },
  { id: "transfer", label: "Transferencias", Icon: ArrowDownUp },
  { id: "backup", label: "Respaldos", Icon: DatabaseBackup },
  { id: "logsearch", label: "Buscar en logs", Icon: FileSearch },
  { id: "plugins", label: "Plugins", Icon: Puzzle },
  { id: "audit", label: "Auditoría", Icon: ShieldCheck },
];

/** Encabezados del menú: qué se mira (Monitorear), el mapa y los cálculos (Red), lo que se ejecuta (Operar) y la revisión de hardening (Seguridad). */
const GROUPS: { label: string; ids: ModuleId[] }[] = [
  { label: "Monitorear", ids: ["monitor", "diag", "syslog", "snmp"] },
  { label: "Red", ids: ["topology", "subnet", "perf"] },
  { label: "Operar", ids: ["transfer", "backup", "logsearch", "plugins"] },
  { label: "Seguridad", ids: ["audit"] },
];

/** Valores por omisión con identidad fija: un `{}` o `[]` nuevo en cada render anularía el memo de Topología. */
const NO_SOURCES: TopoSources = {};
const NO_PROFILES: SnmpProfile[] = [];

/** Último módulo usado, para volver donde se estaba al reabrir Herramientas. */
const LAST_KEY = "toolsModule";

interface Props {
  active: boolean;
  /** Vuelve a la última terminal sin cerrar Herramientas (los módulos siguen vivos). */
  onBack: () => void;
  /** Cierra Herramientas de verdad (App avisa si hay servidores activos). */
  onClose: () => void;
  settings: Settings;
  update: (p: Partial<Settings> | ((s: Settings) => Partial<Settings>)) => void;
  monitors: {
    samples: Record<string, Sample[]>;
    status: Record<string, MonitorStatus>;
    clear: (id: string) => void;
    silence: (id: string) => void;
  };
  connId: () => string | null;
  terminals: TerminalRef[];
  sessions: Session[];
  onScp: (req: ScpRequest) => void;
  /** `background`: abre la pestaña sin activarla. Devuelve el id de la pestaña. */
  onOpenSession: (s: Session, opts?: { background?: boolean; title?: string }) => string | void;
  /** Todas las pestañas con su estado, para la ruta de Topología. */
  tabs: TabBrief[];
  /** Activa una pestaña (sale de Herramientas). */
  onFocusTab: (tabId: string) => void;
  onReconnectTab: (tabId: string) => void;
  onConfirm: (req: { title: string; message: string; label: string; danger?: boolean; action: () => void }) => void;
  /** Aviso breve (por ejemplo, un servidor que se detuvo por inactividad). */
  onToast?: (text: string, kind?: "info" | "error") => void;
}

/**
 * Pestaña de herramientas. Cada módulo se monta al visitarlo y luego se mantiene
 * vivo oculto, para no perder servidores, logs ni mediciones al cambiar de sección.
 */
export const ToolsView = memo(function ToolsView({ active, onBack, onClose, settings, update, monitors, connId, terminals, tabs, sessions, onConfirm, onScp, onOpenSession, onFocusTab, onReconnectTab, onToast }: Props) {
  const enabled = NAV.filter((n) => settings.modules[n.id] !== false);
  const [current, setCurrent] = useState<ModuleId>(() => {
    const last = stored<ModuleId | null>(LAST_KEY, null);
    return enabled.find((n) => n.id === last)?.id ?? enabled[0]?.id ?? "monitor";
  });
  const [visited, setVisited] = useState<Set<ModuleId>>(new Set([current]));
  const navRef = useRef<HTMLElement>(null);
  const currentLabel = enabled.find((n) => n.id === current)?.label;
  const [running, setRunning] = useState<string[]>([]);
  // El servidor iperf3 es un job de Velocidad (no un servidor de server_running): lo informa el módulo.
  const [iperfServing, setIperfServing] = useState(false);

  const refreshRunning = useCallback(() => {
    invoke<string[]>("server_running").then(setRunning);
  }, []);
  useEffect(refreshRunning, [refreshRunning]);

  // Un servidor que se detiene solo por inactividad: se actualiza el estado y se avisa aunque Herramientas esté oculta.
  const toast = useRef(onToast);
  toast.current = onToast;
  useEffect(() => {
    const un = listen<{ kind: string; reason: string; minutes?: number | null }>("server-stopped", ({ payload }) => {
      refreshRunning();
      if (payload.reason === "idle") toast.current?.(idleStopMessage(payload.kind, payload.minutes), "info");
    });
    return () => {
      un.then((f) => f());
    };
  }, [refreshRunning]);

  // Topología está memorizada: sus callbacks no cambian de identidad, así no se vuelve a dibujar con cada
  // muestra de Monitoreo (que llega aunque Herramientas esté oculta). `update` ya es estable.
  const onTopo = useCallback(
    (t: Topology | ((t: Topology) => Topology)) => update((s) => ({ topology: typeof t === "function" ? t(s.topology) : t })),
    [update],
  );
  const onSnapshots = useCallback((topoSnapshots: TopoSnapshot[]) => update({ topoSnapshots }), [update]);
  const onSources = useCallback((topoSources: TopoSources) => update({ topoSources }), [update]);

  const go = (id: ModuleId) => {
    persist(LAST_KEY, id);
    setCurrent(id);
    setVisited((v) => (v.has(id) ? v : new Set(v).add(id)));
  };

  useEffect(() => {
    if (!enabled.some((n) => n.id === current) && enabled[0]) go(enabled[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.modules]);

  // Acciones estables para los módulos (update ya lo es).
  const onMonitors = useCallback((m: MonitorTarget[]) => update({ monitors: m }), [update]);
  const onSpeedResult = useCallback((r: SpeedResult) => update((s) => ({ speedHistory: [r, ...s.speedHistory].slice(0, 20) })), [update]);
  const onSpeedHistory = useCallback((speedHistory: SpeedResult[]) => update({ speedHistory }), [update]);
  const onEnableAutoLog = useCallback(() => update({ autoLog: true }), [update]);
  const topoVisible = active && current === "topology";
  const logsVisible = active && current === "logsearch";

  // Cada módulo es un elemento memorizado con sus propias dependencias: al cambiar de módulo o alternar
  // Herramientas/terminal, React reutiliza el mismo elemento y no vuelve a dibujar los módulos visitados
  // (solo cambia el atributo hidden de su contenedor). Una muestra de Monitoreo redibuja solo Monitoreo y Diagnóstico.
  const monitorEl = useMemo(
    () => (
      <MonitorTool
        targets={settings.monitors}
        samples={monitors.samples}
        status={monitors.status}
        onChange={onMonitors}
        onClear={monitors.clear}
        onSilence={monitors.silence}
      />
    ),
    [settings.monitors, monitors.samples, monitors.status, monitors.clear, monitors.silence, onMonitors],
  );
  const diagEl = useMemo(() => <DiagTool samples={monitors.samples} />, [monitors.samples]);
  const topologyEl = useMemo(
    () => (
      <TopologyTool
        terminals={terminals}
        sessions={sessions}
        topo={settings.topology}
        snapshots={settings.topoSnapshots}
        onTopo={onTopo}
        onSnapshots={onSnapshots}
        sources={settings.topoSources ?? NO_SOURCES}
        onSources={onSources}
        snmpProfiles={settings.snmpProfiles ?? NO_PROFILES}
        visible={topoVisible}
        onOpenSession={onOpenSession}
        tabs={tabs}
        onFocusTab={onFocusTab}
        onReconnectTab={onReconnectTab}
        onConfirm={onConfirm}
        lifecycle={settings.lifecycleInfo}
      />
    ),
    [terminals, sessions, settings.topology, settings.topoSnapshots, onTopo, onSnapshots, settings.topoSources, onSources, settings.snmpProfiles, topoVisible, onOpenSession, tabs, onFocusTab, onReconnectTab, onConfirm, settings.lifecycleInfo],
  );
  const subnetEl = useMemo(() => <SubnetTool />, []);
  const perfEl = useMemo(
    () => <PerfTool history={settings.speedHistory} onResult={onSpeedResult} onHistory={onSpeedHistory} onServing={setIperfServing} />,
    [settings.speedHistory, onSpeedResult, onSpeedHistory],
  );
  const transferEl = useMemo(
    () => (
      <TransferTool
        settings={settings}
        running={running}
        onChange={update}
        refreshRunning={refreshRunning}
        terminals={terminals}
        onConfirm={onConfirm}
        onScp={onScp}
      />
    ),
    [settings, running, update, refreshRunning, terminals, onConfirm, onScp],
  );
  const syslogEl = useMemo(
    () => <SyslogTool settings={settings} running={running} onChange={update} refreshRunning={refreshRunning} />,
    [settings, running, update, refreshRunning],
  );
  const pluginsEl = useMemo(() => <PluginsTool connId={connId} onConfirm={onConfirm} />, [connId, onConfirm]);
  const snmpEl = useMemo(
    () => <SnmpTool settings={settings} running={running} onChange={update} refreshRunning={refreshRunning} onConfirm={onConfirm} />,
    [settings, running, update, refreshRunning, onConfirm],
  );
  const backupEl = useMemo(() => <BackupTool terminals={terminals} totalSessions={sessions.length} />, [terminals, sessions.length]);
  const auditEl = useMemo(() => <AuditTool terminals={terminals} onConfirm={onConfirm} />, [terminals, onConfirm]);
  const logsearchEl = useMemo(
    () => <LogSearchTool visible={logsVisible} autoLog={settings.autoLog} onEnableAutoLog={onEnableAutoLog} />,
    [logsVisible, settings.autoLog, onEnableAutoLog],
  );
  const panes: Record<ModuleId, ReactElement> = {
    monitor: monitorEl,
    diag: diagEl,
    topology: topologyEl,
    subnet: subnetEl,
    perf: perfEl,
    transfer: transferEl,
    syslog: syslogEl,
    plugins: pluginsEl,
    snmp: snmpEl,
    backup: backupEl,
    audit: auditEl,
    logsearch: logsearchEl,
  };

  const item = (id: ModuleId, group: string) => {
    const n = enabled.find((x) => x.id === id);
    if (!n) return null;
    const { label, Icon } = n;
    const serving =
      (id === "transfer" && (running.includes("tftp") || running.includes("http") || running.includes("ftp"))) ||
      (id === "snmp" && running.includes("snmptrap")) ||
      (id === "syslog" && running.includes("syslog")) ||
      (id === "perf" && iperfServing);
    return (
      <button
        key={id}
        onClick={() => go(id)}
        title={`${label} (${group})${serving ? ": servidor activo" : ""}`}
        // El punto verde no tiene texto: el estado va en el nombre accesible.
        aria-label={serving ? `${label}, servidor activo` : label}
        aria-current={current === id ? "page" : undefined}
        className={`relative w-full flex items-center gap-2 px-2 h-8 rounded-md text-left ${
          current === id ? "bg-selected text-fg font-medium" : "text-muted hover:text-fg hover:bg-hover"
        }`}
      >
        <Icon size={15} className="shrink-0" aria-hidden />
        <span className="hidden @[36rem]:inline truncate">{label}</span>
        {serving ? <span aria-hidden className="absolute right-1 top-1 @[36rem]:static @[36rem]:ml-auto w-1.5 h-1.5 shrink-0 rounded-full bg-ok" /> : null}
      </button>
    );
  };

  return (
    // Oculta: sus animaciones (pulsos de transferencias, giros) se pausan y su contenido no se calcula
    // ni se pinta (content-visibility), así redimensionar la app o animar otra vista no la recorre.
    <div
      className={`@container absolute inset-0 flex flex-col bg-bg${active ? "" : " anims-paused [content-visibility:hidden]"}`}
      style={{ visibility: active ? "visible" : "hidden" }}
    >
      {/* Encabezado: dónde estás y cómo salir. "Volver" deja Herramientas viva; la X la cierra. */}
      <div className="h-9 shrink-0 flex items-center gap-1 pl-3 pr-1.5 border-b border-line bg-chrome">
        <Wrench size={14} className="text-muted shrink-0" aria-hidden />
        {/* Ruta (patrón breadcrumb de WAI-ARIA): "Herramientas › Monitoreo". El último nivel es la página
            actual; "Herramientas" lleva el foco al módulo activo del menú. */}
        <nav aria-label="Ruta de navegación" className="flex-1 min-w-0">
          <ol className="flex items-center gap-1 min-w-0 text-body-sm">
            <li className="shrink-0">
              <button
                onClick={() => navRef.current?.querySelector<HTMLElement>('[aria-current="page"]')?.focus()}
                title="Ir al menú de Herramientas"
                className="px-1 h-6 rounded text-muted hover:text-fg hover:bg-hover"
              >
                Herramientas
              </button>
            </li>
            {currentLabel && (
              <>
                <li aria-hidden className="shrink-0 text-muted">
                  ›
                </li>
                <li aria-current="page" className="min-w-0 truncate font-medium">
                  {currentLabel}
                </li>
              </>
            )}
          </ol>
        </nav>
        <button
          onClick={onBack}
          title={`Volver a la terminal (${modLabel}E): Herramientas sigue abierta y sus servidores y mediciones siguen activos`}
          aria-label="Volver a la terminal"
          className="h-7 px-2 flex items-center gap-1.5 rounded-md text-body-sm text-muted hover:text-fg hover:bg-hover"
        >
          <SquareTerminal size={14} />
          <span className="hidden @[36rem]:inline">Volver a la terminal</span>
        </button>
        <button
          onClick={onClose}
          title="Cerrar Herramientas (avisa si hay servidores activos)"
          aria-label="Cerrar Herramientas"
          className="w-7 h-7 grid place-items-center rounded-md text-muted hover:text-fg hover:bg-hover"
        >
          <X size={14} />
        </button>
      </div>
      <div className="flex-1 min-h-0 flex">
      {/* El menú conserva sus etiquetas desde 36 rem de ancho de Herramientas (una ventana de 960 px con el
          árbol de sesiones abierto deja unos 40 rem): con solo íconos, SNMP, Diagnóstico o Subredes no se
          reconocen (Fluent NavigationView). Bajo 36 rem queda solo con íconos, con nombre y grupo en el
          tooltip y una línea entre grupos. */}
      <nav
        ref={navRef}
        aria-label="Módulos de Herramientas"
        className="w-11 @[36rem]:w-40 @[56rem]:w-44 shrink-0 border-r border-line bg-chrome p-1.5 @[56rem]:p-2 overflow-y-auto overflow-x-hidden [scrollbar-width:thin]"
      >
        {GROUPS.map((g, i) => {
          const ids = g.ids.filter((id) => enabled.some((n) => n.id === id));
          if (!ids.length) return null;
          return (
            <div key={g.label} role="group" aria-label={g.label} className={i > 0 ? "mt-1.5 pt-1.5 border-t border-line @[36rem]:border-t-0 @[36rem]:pt-0" : ""}>
              <div aria-hidden className="hidden @[36rem]:block px-2 pt-1 pb-1 text-caption font-semibold uppercase tracking-wide text-muted">{g.label}</div>
              <div className="space-y-0.5">{ids.map((id) => item(id, g.label))}</div>
            </div>
          );
        })}
        {enabled.length === 0 && <p className="p-2 text-body-sm text-muted">Activa módulos en Ajustes › Módulos.</p>}
      </nav>
      <div className="@container flex-1 min-w-0 overflow-y-auto">
        {/* Topología ocupa todo el ancho y alto disponibles; el resto mantiene el ancho de lectura. */}
        <div className={current === "topology" ? "h-full p-2 @[40rem]:p-4" : "max-w-[1200px] mx-auto p-5"}>
          {enabled
            .filter((n) => visited.has(n.id))
            .map((n) => (
              <div key={n.id} hidden={n.id !== current} className={n.id === "topology" ? "h-full" : undefined}>
                {panes[n.id]}
              </div>
            ))}
        </div>
      </div>
      </div>
    </div>
  );
});
