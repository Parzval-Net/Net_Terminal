/**
 * Respaldo de configuración: comando de solo lectura por fabricante y limpieza de la
 * salida (eco, paginación, prompt final) antes de guardarla.
 */
import { cliErrorLine } from "./cliText";
import type { Session } from "../types";
import { computeRisk } from "./packs";

export interface BackupProfile {
  id: string;
  label: string;
  cmd: string;
}

/** Comandos tomados de los packs incluidos (fuente oficial en cada pack). */
export const BACKUP_PROFILES: BackupProfile[] = [
  { id: "cisco", label: "Cisco / Arista", cmd: "show running-config" },
  { id: "huawei", label: "Huawei VRP / H3C", cmd: "display current-configuration" },
  { id: "juniper", label: "Juniper Junos (set)", cmd: "show configuration | display set" },
  { id: "fortinet", label: "FortiOS (cambios)", cmd: "show" },
  { id: "fortinet-full", label: "FortiOS (completa)", cmd: "show full-configuration" },
  { id: "checkpoint", label: "Check Point Gaia (clish)", cmd: "show configuration" },
];

export const profileById = (id: string) => BACKUP_PROFILES.find((p) => p.id === id) ?? BACKUP_PROFILES[0];

/** Perfil sugerido según el resaltado o la plataforma detectada de la sesión. */
export function guessBackupProfile(s: Session): string {
  if (/^r8\d/.test(s.platform ?? "")) return "checkpoint";
  if (/^fos/.test(s.platform ?? "")) return "fortinet";
  if (s.platform === "junos") return "juniper";
  if (/^(vrp|yunshan)/.test(s.platform ?? "")) return "huawei";
  switch (s.highlight) {
    case "huawei":
      return "huawei";
    case "juniper":
      return "juniper";
    case "fortinet":
      return "fortinet";
    default:
      return "cisco";
  }
}

/** Un comando propio solo se acepta si el motor de riesgo lo clasifica como consulta. */
export function isReadOnly(cmd: string): boolean {
  const c = cmd.trim();
  return !!c && !/[\r\n]/.test(c) && computeRisk(c) === "read";
}

/** Huawei: "---- More ----", retrocede el cursor, lo borra con espacios y vuelve a la columna 0. */
const HUAWEI_MORE = /[ ]*-{2,}\s*More\s*-{2,}\x1b\[\d+D[ ]*\x1b\[\d+D/g;
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b[()][A-Z0-9]|\x1b[=>]/g;
/** Marcas de paginación que quedan en la salida (Cisco, Huawei, Juniper, FortiOS). */
const MORE = /[ ]*(--\s*more\s*--|-{2,}\s*more\s*-{2,}|---\(more[^)]*\)---)/gi;
const PROMPT = /^\S{1,80}?\s?[>#$\]]\s*$/;

/** Aplica retrocesos (\b) como lo haría la terminal: al paginar, el equipo borra "--More--". */
function applyBackspaces(line: string): string {
  if (!line.includes("\b")) return line;
  const out: string[] = [];
  for (const ch of line) {
    if (ch === "\b") out.pop();
    else out.push(ch);
  }
  return out.join("");
}

/**
 * Deja solo la configuración: sin eco del comando, sin marcas de paginación, sin el
 * prompt final ni la cabecera variable (bytes y "Building configuration" de IOS, horas de NX-OS,
 * estado del nodo de Junos en cluster): dos respaldos sin cambios deben salir idénticos.
 */
export function cleanConfig(raw: string, cmd: string): string {
  const lines = raw
    .replace(HUAWEI_MORE, "")
    .replace(ANSI, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => applyBackspaces(l).replace(MORE, "").replace(/\s+$/, ""));
  // Todo lo anterior al eco del comando (y el eco) se descarta.
  const echo = lines.findIndex((l) => l.includes(cmd.trim()));
  let body = echo >= 0 ? lines.slice(echo + 1) : lines;
  const trimTail = () => {
    while (body.length && !body[body.length - 1].trim()) body.pop();
    // Junos en chassis cluster o Virtual Chassis: "{primary:node0}" antes del prompt; cambia tras un failover.
    if (body.length && JUNOS_STATE.test(body[body.length - 1].trim())) body.pop();
    while (body.length && !body[body.length - 1].trim()) body.pop();
  };
  trimTail();
  if (body.length && PROMPT.test(body[body.length - 1])) body.pop();
  trimTail();
  // Cabecera variable de IOS: cambia en cada respaldo y ensucia las comparaciones.
  let start = 0;
  while (
    start < body.length &&
    start < 4 &&
    (!body[start].trim() || /^(Building configuration\.\.\.|Current configuration\s*:\s*\d+ bytes)$/i.test(body[start].trim()))
  )
    start++;
  body = body.slice(start);
  // Marcas de hora de la cabecera (NX-OS, NVRAM de IOS): cambian sin que cambie la configuración.
  body = body.filter((l, i) => i >= HEADER_LINES || !VOLATILE_HEADER.test(l.trim()));
  while (body.length && !body[0].trim()) body.shift();
  return body.join("\n") + (body.length ? "\n" : "");
}

/** Estado del nodo que Junos muestra sobre el prompt en cluster o VC: "{primary:node0}", "{master:0}". */
const JUNOS_STATE = /^\{[\w:.-]+\}$/;
/** Líneas de la cabecera donde se buscan marcas de hora. */
const HEADER_LINES = 8;
/** NX-OS ("!Command:", "!Running configuration last done at:", "!Time:") e IOS ("! NVRAM config last updated at"). */
const VOLATILE_HEADER = /^!\s*(Command\s*:|Time\s*:|Running configuration last done at\b|NVRAM config last updated\b)/i;

/**
 * Configuración lista para guardar, o el motivo para no guardarla. Una lectura cortada (plazo
 * vencido, sesión cerrada, tope de salida o de páginas) nunca se guarda: parecería un respaldo
 * válido y en la comparación aparecería como configuración quitada.
 */
export function prepareBackup(r: { output: string; cut?: string }, cmd: string): { clean: string; problem: string | null } {
  if (r.cut) return { clean: "", problem: `Respaldo incompleto: ${r.cut}` };
  const clean = cleanConfig(r.output, cmd);
  return { clean, problem: configProblem(clean) };
}

/** Mensaje de error si la salida no parece una configuración. */
export function configProblem(clean: string): string | null {
  if (!clean.trim()) return "El equipo no devolvió configuración";
  const head = clean.split("\n").slice(0, 5).join("\n");
  const failed = cliErrorLine(head);
  if (failed) return failed;
  if (clean.split("\n").length < 3) return "Salida demasiado corta para ser una configuración";
  return null;
}

/** Ejecuta tareas con concurrencia máxima `limit`; `stopped()` evita iniciar nuevas. */
export async function pool<T>(items: T[], limit: number, run: (item: T) => Promise<void>, stopped: () => boolean) {
  let next = 0;
  const worker = async () => {
    while (next < items.length && !stopped()) await run(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/** Estado de un equipo en una tanda de respaldos. "skipped": no alcanzó a iniciar porque se detuvo la tanda. */
export type JobState = { state: "pending" | "running" | "ok" | "error" | "skipped"; text?: string };

/** Tras detener la tanda, los que seguían en cola quedan como omitidos (ya no están "En cola"). */
export function skipPending(jobs: Record<string, JobState>): Record<string, JobState> {
  return Object.fromEntries(
    Object.entries(jobs).map(([id, j]) => [id, j.state === "pending" ? { state: "skipped", text: "No se respaldó: se detuvo la tanda" } : j]),
  );
}

/** "2026-10-21_143005.txt" → "21-10-2026 14:30:05". */
export function backupLabel(file: string): string {
  const m = file.match(/^(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\d{2})(-\d+)?\.txt$/);
  return m ? `${m[3]}-${m[2]}-${m[1]} ${m[4]}:${m[5]}:${m[6]}${m[7] ?? ""}` : file;
}
