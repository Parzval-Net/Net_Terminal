import { memo, useEffect, useId, useState, useSyncExternalStore } from "react";
import { ArrowLeftRight, KeyRound, Bot, Circle, CircleCheck, CircleDashed, CircleOff, Lock, RotateCcw, ShieldAlert, ShieldCheck } from "lucide-react";
import {
  DeviceInfo,
  LIFE_LABEL,
  LifeLevel,
  Lifecycle,
  OsEntry,
  behind,
  findLifecycle,
  findOs,
  lifeDetail,
  lifeLevel,
  loadLifecycle,
  loadOs,
  osDetail,
  osTarget,
} from "../lib/lifecycle";
import { store } from "../lib/store";
import { Tab, TabState, sessionTarget, tunnelLabel } from "../types";
import { BroadcastTargetPicker } from "./BroadcastTarget";
import { QuickBolt, typeLabel } from "./SessionIcon";
import { statusColor } from "./TabBar";

/** Etiquetas de los botones: con la barra angosta (ventana mínima o vista con barra lateral) solo queda el icono y el title. */
const LBL = "hidden @[52rem]:inline";

const statusText = { connecting: "Conectando", connected: "Conectado", closed: "Desconectado" };
/** Cada estado con su forma además del color (WCAG 1.4.1): check, anillo punteado y círculo tachado. */
const statusIcon = { connecting: CircleDashed, connected: CircleCheck, closed: CircleOff };

/** Columnas y filas de cada pestaña: las publica la terminal al montar y en cada cambio de tamaño. */
const termSizes = store<Record<string, readonly [number, number]>>({});

/** Publica el tamaño de la terminal de una pestaña (sin re-render si no cambió). */
export function publishTermSize(id: string, cols: number, rows: number) {
  const cur = termSizes.get();
  const prev = cur[id];
  if (prev && prev[0] === cols && prev[1] === rows) return;
  termSizes.set({ ...cur, [id]: [cols, rows] });
}

/** Olvida el tamaño de una pestaña cerrada. */
export function forgetTermSize(id: string) {
  const cur = termSizes.get();
  if (!(id in cur)) return;
  const next = { ...cur };
  delete next[id];
  termSizes.set(next);
}

interface Props {
  tab: Tab | undefined;
  state: TabState | undefined;
  onToggleLog: () => void;
  onReconnect: () => void;
  aiEnabled: boolean;
  /** Ventanas de consultas de agentes activas (se ven y revocan en Ajustes › Agentes IA). */
  aiWindows?: number;
  onAi: () => void;
  /** Guarda la conexión rápida de la pestaña como sesión. */
  onSaveAs?: () => void;
  /** Modelo y versión leídos de la pantalla (show version): ciclo de vida del equipo. */
  device?: DeviceInfo;
  /** Desactiva el modo solo lectura de la pestaña (el candado de la barra es el atajo del menú de la pestaña). */
  onToggleReadOnly?: () => void;
}

/**
 * Barra de estado: solo informa (estado, protocolo, destino, túneles, columnas x filas, ciclo de
 * vida, log y destino de envío), como piden Fluent y HIG. Las acciones que quedan son
 * indicadores con estado: el log (REC / Sin log), el destino de envío y Reconectar cuando la
 * sesión está caída, junto al estado que resuelve.
 */
export const StatusBar = memo(function StatusBar({
  tab,
  state,
  onToggleLog,
  onReconnect,
  aiEnabled,
  aiWindows = 0,
  onAi,
  onSaveAs,
  device,
  onToggleReadOnly,
}: Props) {
  const logHintId = useId();
  const sizes = useSyncExternalStore(termSizes.subscribe, termSizes.get);
  const winText = aiWindows > 0 ? `. ${aiWindows} ${aiWindows === 1 ? "ventana de consultas activa" : "ventanas de consultas activas"} (clic para revisar o revocar)` : "";
  const ai = aiEnabled && (
    <BarBtn onClick={onAi} title={`Servidor MCP activo: los agentes de IA pueden conectarse${winText}`} aria-label={`Servidor MCP activo: agentes de IA${winText}`} className="!text-accent">
      <Bot size={12} />
      <span className={LBL}>IA</span>
      {aiWindows > 0 && <span className="rounded-full bg-accent text-accent-fg px-1 text-[10px] leading-[14px] font-medium tabular-nums">{aiWindows}</span>}
    </BarBtn>
  );
  if (!tab || !state)
    return (
      <div className="@container h-7 shrink-0 flex items-center justify-end px-3 bg-chrome border-t border-line text-[12px] text-muted">
        {ai}
      </div>
    );
  const { session } = tab;
  const logging = !!state.logPath;
  const connected = state.status === "connected";
  const StatusIcon = statusIcon[state.status];
  const size = sizes[tab.id];

  return (
    <div className="@container h-7 shrink-0 flex items-center gap-2 @[40rem]:gap-3 px-3 bg-chrome border-t border-line text-[12px] text-muted">
      <span role="status" className="flex items-center gap-1.5 shrink-0 whitespace-nowrap" title={statusText[state.status]}>
        <StatusIcon size={12} aria-hidden style={{ color: statusColor[state.status] }} />
        {/* Barra muy angosta: queda el ícono de forma propia; el estado se lee igual (texto solo para lectores) y va en el tooltip. */}
        <span className="sr-only @[34rem]:not-sr-only">{statusText[state.status]}</span>
      </span>
      {state.status === "closed" && (
        <BarBtn onClick={onReconnect} title="Reconectar (o Enter en la terminal)" aria-label="Reconectar" className="-ml-1 !text-accent">
          <RotateCcw size={12} />
          <span className={LBL}>Reconectar</span>
        </BarBtn>
      )}
      {tab.readOnly && (
        <BarBtn
          onClick={onToggleReadOnly}
          title="Solo lectura: la pestaña no envía nada al equipo. Clic para desactivar"
          aria-label="Solo lectura activada: desactivar"
          className="!text-warn font-medium"
        >
          <Lock size={12} aria-hidden />
          <span className="hidden @[34rem]:inline">Solo lectura</span>
        </BarBtn>
      )}
      <span className="font-medium text-fg/80">{typeLabel[session.type]}</span>
      <span className="truncate min-w-0">{sessionTarget(session)}</span>
      {session.type === "ssh" && !!session.tunnels?.length && (
        <span
          className="flex items-center gap-1 shrink-0 text-fg/80"
          title={`Túneles${connected ? " activos" : ""}:\n${session.tunnels.map(tunnelLabel).join("\n")}`}
        >
          <ArrowLeftRight size={11} />
          {session.tunnels.length === 1 ? tunnelLabel(session.tunnels[0]) : `${session.tunnels.length} túneles`}
        </span>
      )}

      {onSaveAs && !session.id && session.type !== "local" && !session.scp && (
        <BarBtn onClick={onSaveAs} title="Conexión rápida sin guardar: guardar como sesión" aria-label="Guardar como sesión">
          <QuickBolt size={12} />
          <span className={LBL}>Guardar como sesión…</span>
        </BarBtn>
      )}

      {session.save_password && session.type !== "local" && (
        <span
          className="flex items-center shrink-0 text-fg/80"
          title="Contraseña guardada: se completa sola en el primer pedido de contraseña al conectar"
        >
          <KeyRound size={11} />
        </span>
      )}

      {device?.model && <LifecycleChip model={device.model} version={device.version} name={device.name} />}

      <div className="ml-auto shrink-0 flex items-center gap-1">
        {size && (
          <span
            className="hidden @[44rem]:inline shrink-0 tabular-nums px-1"
            title="Columnas × filas de la terminal"
            aria-label={`${size[0]} columnas por ${size[1]} filas`}
          >
            {size[0]}×{size[1]}
          </span>
        )}
        {/*
          Indicador del log con estado legible: "● REC" en rojo mientras graba (evidencia de cambios) y
          "Sin log" en gris si no. Sigue activando o deteniendo la grabación con un clic.
        */}
        <BarBtn
          onClick={onToggleLog}
          disabled={!connected && !logging}
          aria-describedby={!connected && !logging ? logHintId : undefined}
          title={
            logging
              ? `Grabando en ${state.logPath}. Clic para detener`
              : connected
                ? "Sin log: clic para grabar la sesión en un archivo de texto"
                : "Conecta la sesión para grabar un log"
          }
          aria-label={logging ? "REC: grabando log, detener" : "Sin log: grabar log"}
          className={logging ? "!text-danger font-semibold tracking-wide" : ""}
        >
          {logging ? <span aria-hidden className="w-2 h-2 rounded-full bg-danger" /> : <Circle size={11} aria-hidden />}
          {logging ? "REC" : <span className="hidden @[36rem]:inline">Sin log</span>}
          {!connected && !logging && (
            <span id={logHintId} className="sr-only">
              Conecta la sesión para grabar un log
            </span>
          )}
        </BarBtn>
        <span aria-hidden className="w-px h-3.5 mx-1 bg-line" />
        {/* Destino único de Notas, catálogo, botones y scripts: siempre a la vista; en difusión, chip de aviso con el número de equipos. */}
        <BroadcastTargetPicker />
        {ai && <span aria-hidden className="w-px h-3.5 mx-1 bg-line" />}
        {ai}
      </div>
    </div>
  );
});

function BarBtn(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`shrink-0 whitespace-nowrap flex items-center justify-center gap-1 h-6 min-w-6 px-1.5 rounded hover:bg-hover hover:text-fg disabled:opacity-40 disabled:hover:bg-transparent ${props.className ?? ""}`}
    />
  );
}

const LIFE_CLASS: Record<LifeLevel, string> = {
  ldos: "text-danger",
  eosw: "text-danger",
  eos: "text-warn",
  announced: "text-warn",
  none: "text-fg/80",
  unknown: "text-warn",
};

/**
 * Modelo y etapa del ciclo de vida (fin de venta, de software, de soporte). La base se descarga
 * recién aquí, la primera vez que una pestaña muestra un modelo.
 */
export function LifecycleChip({ model, version, name }: { model: string; version?: string; name?: string }) {
  const [life, setLife] = useState<{ model: string; l: Lifecycle | null; os: OsEntry | null } | null>(null);
  useEffect(() => {
    let live = true;
    Promise.all([loadLifecycle(), loadOs()])
      .then(([db, os]) => live && setLife({ model, l: findLifecycle(db, model), os: findOs(os.db, os.res, model) }))
      .catch(() => live && setLife(null));
    return () => {
      live = false;
    };
  }, [model]);
  if (!life || life.model !== model) return null;
  const level = lifeLevel(life.l, new Date().toISOString().slice(0, 10));
  const late = behind(life.os, version);
  const bad = level !== "none" || late === true;
  const tip = [
    name && `Equipo: ${name}`,
    lifeDetail(model, life.l, version),
    ...osDetail(life.os, version),
    "Se actualiza con cada show version (o equivalente) que ejecutes.",
  ]
    .filter(Boolean)
    .join("\n");
  return (
    <span
      className={`flex items-center gap-1 min-w-0 shrink ${level === "none" && late ? "text-warn" : LIFE_CLASS[level]}`}
      title={tip}
      aria-label={`${model}: ${LIFE_LABEL[level]}${late ? `, actualizable a ${osTarget(life.os!)}` : ""}`}
    >
      {bad ? <ShieldAlert size={11} className="shrink-0" /> : <ShieldCheck size={11} className="shrink-0" />}
      <span className="truncate">
        <span className="font-medium">{model}</span>
        {version && <span className="hidden @[60rem]:inline text-muted"> · {version}</span>} · {LIFE_LABEL[level]}
        {late && <span className="hidden @[52rem]:inline"> · actualizar a {osTarget(life.os!)}</span>}
      </span>
    </span>
  );
}
