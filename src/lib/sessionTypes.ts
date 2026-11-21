/**
 * Tipos de sesión y valores de formulario compartidos por Nueva sesión (SessionModal) y Conexión
 * rápida: el mismo orden y los mismos rótulos en ambos, para que la tercera opción sea siempre
 * Serial y no cambie de nombre de un formulario a otro. Lógica pura (sin React).
 */
import type { Session, SessionType } from "../types";
import { fold, parseQuick, quickTarget } from "./quickTarget";

export interface SessionTypeDef {
  type: SessionType;
  /** Rótulo corto del segmentado (cabe en cinco columnas de un diálogo de 460 px). */
  label: string;
  /** Descripción para el tooltip. */
  hint: string;
}

/** Orden único: SSH, Telnet, Serial, TCP raw y Local. Conexión rápida omite solo Local. */
export const SESSION_TYPES: readonly SessionTypeDef[] = [
  { type: "ssh", label: "SSH", hint: "SSH con el OpenSSH del sistema" },
  { type: "telnet", label: "Telnet", hint: "Telnet (puerto 23)" },
  { type: "serial", label: "Serial", hint: "Consola por puerto serial o adaptador USB-serial" },
  { type: "raw", label: "TCP raw", hint: "TCP crudo, sin negociación Telnet (servidores de consola)" },
  { type: "local", label: "Local", hint: "Shell local de este equipo" },
];

export type QuickType = Exclude<SessionType, "local">;

/** Tipos de Conexión rápida: los mismos, en el mismo orden, sin Local. */
export const QUICK_TYPES = SESSION_TYPES.filter((t): t is SessionTypeDef & { type: QuickType } => t.type !== "local");

export const DEFAULT_PORT: Partial<Record<SessionType, number>> = { ssh: 22, telnet: 23, raw: 2001 };

/** Puerto al cambiar de tipo: el del tipo nuevo, salvo que el usuario haya escrito uno propio. */
export function portForType(from: SessionType, port: number | undefined, to: SessionType): number | undefined {
  return port === DEFAULT_PORT[from] || !port ? DEFAULT_PORT[to] : port;
}

export const BAUDS = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600];
export const DATA_BITS = [8, 7, 6, 5];
export const STOP_BITS = [1, 2];
export const PARITY_OPTIONS: readonly [NonNullable<Session["parity"]>, string][] = [
  ["none", "Ninguna (N)"],
  ["even", "Par (E)"],
  ["odd", "Impar (O)"],
];
export const FLOW_OPTIONS: readonly [NonNullable<Session["flow_control"]>, string][] = [
  ["none", "Sin control"],
  ["software", "XON/XOFF"],
  ["hardware", "RTS/CTS"],
];

/** Resumen de la línea serial: "9600 8N1 · sin flujo", "115200 7E2 · RTS/CTS". */
export function serialSummary(s: Pick<Session, "baud_rate" | "data_bits" | "parity" | "stop_bits" | "flow_control">): string {
  const parity = (s.parity ?? "none")[0].toUpperCase();
  const flow = s.flow_control === "software" ? "XON/XOFF" : s.flow_control === "hardware" ? "RTS/CTS" : "sin flujo";
  return `${s.baud_rate ?? 9600} ${s.data_bits ?? 8}${parity}${s.stop_bits ?? 1} · ${flow}`;
}

/** Nombre sugerido para un host: sin espacios ni corchetes de IPv6 ("[2001:db8::1]" → "2001:db8::1"). */
export function suggestName(host: string | undefined): string {
  const h = (host ?? "").trim();
  return h.replace(/^\[(.*)\]$/, "$1");
}

/**
 * Nombre tras editar el host: sigue al host mientras el nombre esté vacío o sea la sugerencia del
 * host anterior. Si el usuario escribió un nombre propio, no se toca.
 */
export function followHostName(name: string, prevHost: string | undefined, nextHost: string | undefined): string {
  return !name.trim() || name === suggestName(prevHost) ? suggestName(nextHost) : name;
}

/**
 * Destinos recientes (recent_targets, forma de quickTarget) que coinciden con lo escrito en Host,
 * sin repetidos y como sesiones listas para rellenar el formulario. Sin texto devuelve los últimos.
 */
export function matchRecent(targets: string[], query: string, limit = 8): Session[] {
  const q = fold(query.trim());
  const seen = new Set<string>();
  const out: Session[] = [];
  for (const t of targets) {
    const s = parseQuick(t)[0];
    if (!s) continue;
    const key = quickTarget(s);
    if (seen.has(key)) continue;
    seen.add(key);
    if (q && !fold(`${s.username ?? ""}@${s.host ?? ""} ${key}`).includes(q)) continue;
    out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}
