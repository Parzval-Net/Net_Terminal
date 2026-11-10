import { useEffect, useMemo, useState } from "react";
import { Bot } from "lucide-react";
import { useDragResize } from "../lib/useDragResize";
import { useModal } from "../lib/useModal";
import { Risk, computeRisk, riskLabel, textRisk } from "../lib/packs";
import { BATCH_TOOL, WINDOW_MINUTES, canOfferWindowFor, isWindowMinutes, lineRisks } from "../lib/mcpWindow";

const BADGE: Record<Risk, string> = {
  read: "border border-line text-muted",
  change: "border border-[var(--warn)] text-warn",
  disruptive: "bg-danger text-danger-fg",
};

/** Borde de cada línea según su riesgo (las de cambio y corte se destacan). */
const LINE: Record<Risk, string> = {
  read: "border-l-2 border-transparent",
  change: "border-l-2 border-[var(--warn)] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)]",
  disruptive: "border-l-2 border-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_12%,transparent)]",
};

export interface ApprovalRequest {
  id: string;
  tool: string;
  target: string;
  detail: string;
  /** Conexión del backend (null al abrir una sesión). */
  connection?: string | null;
  /** Nombre que declaró el agente en su initialize: dato no confiable (React lo escapa). */
  client?: string;
  /** Clave de la sesión MCP del agente (vacía si no la envía). */
  client_key?: string;
}

interface Props {
  request: ApprovalRequest;
  pending: number;
  /** Duración propuesta para la ventana de consultas (Ajustes › Agentes IA). */
  windowMinutes?: number;
  /** `minutes`: además de aprobar, permite las consultas de este agente en esta conexión por ese tiempo. */
  onDecide: (approved: boolean, minutes?: number) => void;
}

/**
 * Aprobación de una acción pedida por un agente de IA. Enter no aprueba a propósito:
 * hay que hacer clic en "Permitir" para evitar aprobaciones por inercia.
 */
export function ApprovalDialog({ request, pending, windowMinutes = 15, onDecide }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onDecide(false);
      }
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onDecide]);

  const win = useDragResize("approvalWindow", false);
  // Esc y Enter los atiende el manejador de arriba; el hook pone la trampa de foco y devuelve el foco al cerrar.
  const modal = useModal();
  const isOpen = request.tool === "open_session";
  const action = isOpen ? "abrir la sesión" : "ejecutar en";
  const risk = useMemo(() => (isOpen ? null : textRisk(request.detail)), [request, isOpen]);
  const lines = useMemo(() => (isOpen ? [] : lineRisks(request.detail, computeRisk)), [request, isOpen]);
  // Lo que puede cortar servicio exige una confirmación extra antes de habilitar "Permitir".
  const [ack, setAck] = useState(false);
  const blocked = risk === "disruptive" && !ack;
  const offer = canOfferWindowFor(request);
  const batch = request.tool === BATCH_TOOL;
  const [allow, setAllow] = useState(false);
  const [minutes, setMinutes] = useState<number>(isWindowMinutes(windowMinutes) ? windowMinutes : 15);
  const client = (request.client ?? "").trim();

  return (
    <div {...modal.overlay} className="fixed inset-0 z-[60] grid place-items-center bg-black/35 p-4">
      <div role="alertdialog" aria-modal="true" aria-labelledby="approval-title" aria-describedby="approval-detail" tabIndex={-1} {...win.box} className="w-[520px] max-w-full bg-panel border border-line rounded-xl shadow-pop">
        <header {...win.handle} className="flex items-center gap-2.5 px-5 pt-4 select-none">
          <span className="w-8 h-8 grid place-items-center rounded-lg bg-selected text-accent">
            <Bot size={17} />
          </span>
          <div className="min-w-0">
            <h2 id="approval-title" className="text-[14px] font-semibold">Un agente de IA quiere {action}</h2>
            <p className="text-[12px] text-muted truncate">{request.target}</p>
          </div>
          {risk && (
            <span className={`ml-auto shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${BADGE[risk]}`} title="Riesgo calculado por la app, no declarado por el agente">
              {riskLabel[risk]}
            </span>
          )}
        </header>
        {client && (
          <p className="px-5 mt-2 text-[11.5px] text-muted truncate" title="Nombre que declaró el agente al conectarse: no está verificado">
            Agente: <span className="font-mono text-fg">{client}</span> (nombre declarado)
          </p>
        )}
        {!isOpen && (
          <div id="approval-detail" className="mx-5 mt-3 py-1.5 rounded-lg bg-hover font-mono text-[12px] max-h-56 overflow-y-auto select-text">
            {lines.map((l, i) => (
              <div key={i} className={`flex items-start gap-2 px-2.5 py-0.5 ${LINE[l.risk]}`}>
                <span className="flex-1 whitespace-pre-wrap break-all">{l.line}</span>
                {lines.length > 1 && l.risk !== "read" && (
                  <span className={`shrink-0 rounded px-1 text-[10.5px] font-sans font-medium ${BADGE[l.risk]}`}>{riskLabel[l.risk]}</span>
                )}
              </div>
            ))}
          </div>
        )}
        <p className="px-5 mt-3 text-[11.5px] text-muted">
          {batch ? `${lines.length} ${lines.length === 1 ? "comando" : "comandos"} en orden, uno por línea; se detiene en el primer error. ` : lines.length > 1 ? `${lines.length} líneas. ` : ""}
          Revisa el contenido antes de permitir. Se rechaza solo en 2 minutos.
          {pending > 1 ? ` Hay ${pending - 1} ${pending - 1 === 1 ? "solicitud más" : "solicitudes más"} en espera.` : ""}
        </p>
        {risk === "disruptive" && (
          <label className="mx-5 mt-2 flex items-start gap-2 text-[12px] text-danger">
            <input type="checkbox" className="mt-0.5 accent-[var(--danger)]" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            Entiendo que este comando puede cortar servicio en {request.target}.
          </label>
        )}
        {offer && (
          <div className="mx-5 mt-2 text-[12px]">
            <label className="flex items-center gap-2 flex-wrap">
              <input type="checkbox" checked={allow} onChange={(e) => setAllow(e.target.checked)} />
              <span>Permitir consultas de este agente en esta sesión durante</span>
              <select
                className="field !h-6 !w-auto !py-0 !text-[12px]"
                aria-label="Duración de la ventana de consultas"
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
              >
                {WINDOW_MINUTES.map((m) => (
                  <option key={m} value={m}>{m} min</option>
                ))}
              </select>
            </label>
            {allow && (
              <p className="mt-1 ml-6 text-[11.5px] text-muted">
                Solo comandos de una línea que la app clasifica como «{riskLabel.read}» (en un lote, todas sus líneas). Cambios, cortes, varias líneas en un envío y comandos largos siguen pidiendo aprobación. Se revoca al vencer, al desconectar, con solo lectura, al cambiar el token o al apagar el servidor.
              </p>
            )}
          </div>
        )}
        <footer className="flex justify-end gap-2 px-5 py-3 mt-3 border-t border-line">
          {/* El foco parte en Rechazar: un Enter accidental no debe aprobar. */}
          <button autoFocus onClick={() => onDecide(false)} className="px-3.5 h-8 rounded-md border border-line hover:bg-hover">
            Rechazar
          </button>
          <button
            onClick={() => !blocked && onDecide(true, offer && allow ? minutes : undefined)}
            disabled={blocked}
            title={blocked ? "Marca la confirmación para permitir un comando que puede cortar servicio" : undefined}
            className={`px-3.5 h-8 rounded-md font-medium hover:opacity-90 disabled:opacity-50 ${risk === "disruptive" ? "bg-danger text-danger-fg" : "bg-accent text-accent-fg"}`}
          >
            Permitir
          </button>
        </footer>
      </div>
    </div>
  );
}
