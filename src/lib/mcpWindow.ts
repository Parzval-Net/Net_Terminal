/**
 * Ventana de consultas de un agente de IA (MCP): durante unos minutos, los comandos de UN agente en
 * UNA conexión que el motor de riesgo clasifica como consulta (`read`) se envían sin diálogo.
 *
 * La decisión se toma solo aquí, en la interfaz, con el motor de riesgo de la app (computeRisk,
 * contactsNetwork y opensInteractive de packs.ts, recibidos como parámetro); Rust nunca aprueba por su
 * cuenta y vuelve a exigir una línea, sin control, dentro del tope y con riesgo `read`. Todo lo demás
 * (cambios, cortes, varias líneas, caracteres de control, comandos largos, abrir sesiones, clientes de
 * red y programas interactivos) pide aprobación siempre. La ventana se revoca sola al vencer, al desconectar la sesión, al poner la
 * pestaña en solo lectura y al apagar el servidor.
 *
 * Lógica pura, sin React: la prueban scripts/tests/mcpWindow.test.mjs.
 */
import type { Risk } from "./packs";

/** Duraciones que ofrece la interfaz (minutos). */
export const WINDOW_MINUTES = [5, 15, 60] as const;
export type WindowMinutes = (typeof WINDOW_MINUTES)[number];

/** Largo máximo de un comando que la ventana puede aprobar (el mismo AUTO_MAX_CHARS de mcp.rs). */
export const AUTO_MAX_CHARS = 200;

/** Herramientas que la ventana puede aprobar: solo las que escriben un comando de consulta. */
const AUTO_TOOLS = new Set(["run_command", "send_command"]);

export interface ConsultWindow {
  /** Conexión (id del backend, cambia en cada reconexión). */
  conn: string;
  /** Clave del agente (id de sesión MCP); vacía si el cliente no la envía. */
  clientKey: string;
  /** Nombre del agente según su initialize: dato no confiable, solo para mostrar (escapado). */
  clientName: string;
  /** Nombre visible de la conexión. */
  target: string;
  /** Vence (ms desde epoch). */
  until: number;
}

/** Lo que llega en el evento "mcp-approval" (ver ApprovalRequest en mcp.rs). */
export interface WindowRequest {
  tool: string;
  detail: string;
  connection?: string | null;
  client_key?: string;
}

/** Controles C0/C1, DEL, tabulador y caracteres de ancho cero o de dirección. */
const CONTROL = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/;

export const isWindowMinutes = (n: unknown): n is WindowMinutes => WINDOW_MINUTES.includes(n as WindowMinutes);

/** Ventanas vigentes (las vencidas se descartan). */
export function activeWindows(list: readonly ConsultWindow[], now: number): ConsultWindow[] {
  return list.filter((w) => w.until > now);
}

/** Abre (o renueva) la ventana del agente en la conexión. */
export function grantWindow(
  list: readonly ConsultWindow[],
  w: { conn: string; clientKey: string; clientName: string; target: string },
  minutes: number,
  now: number,
): ConsultWindow[] {
  if (!w.conn || !isWindowMinutes(minutes)) return activeWindows(list, now);
  const rest = activeWindows(list, now).filter((x) => !(x.conn === w.conn && x.clientKey === w.clientKey));
  return [...rest, { ...w, clientName: w.clientName.slice(0, 64), target: w.target.slice(0, 128), until: now + minutes * 60_000 }];
}

/** Revoca las ventanas de las conexiones que cumplan `drop` (desconexión, solo lectura). */
export function revokeWhere(list: readonly ConsultWindow[], drop: (w: ConsultWindow) => boolean): ConsultWindow[] {
  return list.filter((w) => !drop(w));
}

/** Revoca una ventana puntual. */
export const revokeOne = (list: readonly ConsultWindow[], conn: string, clientKey: string) =>
  revokeWhere(list, (w) => w.conn === conn && w.clientKey === clientKey);

/**
 * Funciones del motor de riesgo (src/lib/packs.ts) con que decide la ventana: las recibe como parámetro para que
 * la decisión use exactamente el motor de la app y no una copia.
 * - `contacts` (contactsNetwork): algún tramo contacta un destino que elige quien escribe (ping, nslookup, curl,
 *   ssh…, también tras sudo, env, time, timeout, comillas o subexpresiones). Es consulta, pero un agente podría
 *   sacar un dato ya visto poniéndolo en el nombre de destino o en la URL.
 * - `interactive` (opensInteractive): abre un programa interactivo (less, top, vi, watch, ssh sin comando…); las
 *   líneas siguientes del agente las leería ese programa y no el equipo.
 */
export interface WindowEngine {
  risk: (cmd: string) => Risk;
  contacts: (cmd: string) => boolean;
  interactive: (cmd: string) => boolean;
}

/**
 * ¿Se aprueba sin diálogo? Solo si hay una ventana vigente para ese agente y esa conexión, la
 * herramienta envía comandos, el comando es UNA línea sin caracteres de control, cabe en el tope,
 * el motor lo clasifica como `read`, no contacta a otro equipo y no abre un programa interactivo.
 */
export function autoApprove(
  list: readonly ConsultWindow[],
  req: WindowRequest,
  now: number,
  engine: WindowEngine,
): { auto: true; risk: Risk } | { auto: false; reason: string } {
  const conn = req.connection ?? "";
  const key = req.client_key ?? "";
  if (!AUTO_TOOLS.has(req.tool)) return { auto: false, reason: "herramienta" };
  if (!conn || !activeWindows(list, now).some((w) => w.conn === conn && w.clientKey === key)) return { auto: false, reason: "sin ventana" };
  const cmd = req.detail;
  if (typeof cmd !== "string" || !cmd.trim()) return { auto: false, reason: "vacío" };
  if (cmd.includes("\n") || cmd.includes("\r")) return { auto: false, reason: "varias líneas" };
  if (CONTROL.test(cmd)) return { auto: false, reason: "caracteres de control" };
  if ([...cmd].length > AUTO_MAX_CHARS) return { auto: false, reason: "largo" };
  const r = engine.risk(cmd);
  if (r !== "read") return { auto: false, reason: r };
  if (engine.contacts(cmd)) return { auto: false, reason: "contacta a otro equipo" };
  if (engine.interactive(cmd)) return { auto: false, reason: "programa interactivo" };
  return { auto: true, risk: r };
}

/** Riesgo por línea para el diálogo de aprobación. */
export function lineRisks(detail: string, risk: (cmd: string) => Risk): { line: string; risk: Risk }[] {
  return detail
    .split(/\r?\n|\r/)
    .filter((l) => l.trim())
    .map((line) => ({ line, risk: risk(line) }));
}

/** ¿Se puede ofrecer la ventana para esta solicitud? (comandos de una conexión, no abrir sesiones). */
export const canOfferWindow = (req: WindowRequest) => AUTO_TOOLS.has(req.tool) && !!req.connection;

/** Minutos restantes (redondeado hacia arriba) para mostrar. */
export const minutesLeft = (w: ConsultWindow, now: number) => Math.max(0, Math.ceil((w.until - now) / 60_000));

/** Herramienta MCP que ejecuta varias consultas en una llamada (una línea por comando en `detail`). */
export const BATCH_TOOL = "run_commands";
/** Comandos máximos de un lote (el mismo MAX_BATCH de mcp_tools.rs). */
export const BATCH_MAX = 10;

/** Decisión de la ventana (la misma forma que devuelve `autoApprove`). */
export type WindowDecision = ReturnType<typeof autoApprove>;

/**
 * Decisión de la ventana para cualquier solicitud. `one` decide UNA solicitud con la regla de siempre
 * (en la app, `autoApprove` con las ventanas vigentes). Además:
 * - Sin clave de agente (cliente sin `Mcp-Session-Id`) nunca se aprueba sin diálogo: todos los
 *   anónimos compartirían la misma ventana.
 * - Un lote de `run_commands` se aprueba solo si cada línea, por separado, pasa `one` como si fuera un
 *   `run_command` de esa línea; basta una que no para mostrar el diálogo con el lote completo.
 * Rust vuelve a exigir lo mismo (cliente identificado, cada línea dentro del tope y sin control).
 */
export function autoApproveBatch(req: WindowRequest, one: (r: WindowRequest) => WindowDecision): WindowDecision {
  if (!req.client_key) return { auto: false, reason: "agente sin sesión MCP" };
  if (req.tool !== BATCH_TOOL) return one(req);
  const lines = typeof req.detail === "string" ? req.detail.split("\n") : [];
  if (!lines.length || lines.length > BATCH_MAX) return { auto: false, reason: "lote" };
  for (let i = 0; i < lines.length; i++) {
    const d = one({ ...req, tool: "run_command", detail: lines[i] });
    if (!d.auto) return { auto: false, reason: `línea ${i + 1}: ${d.reason}` };
  }
  return { auto: true, risk: "read" };
}

/** Como `canOfferWindow`, también para un lote, y solo a un agente identificado (con clave). */
export const canOfferWindowFor = (req: WindowRequest) =>
  !!req.client_key && !!req.connection && (canOfferWindow(req) || req.tool === BATCH_TOOL);
