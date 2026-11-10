/**
 * Preferencias de acceso de los servidores integrados (TFTP, HTTP, FTP y Syslog): interfaz de
 * escucha, clientes permitidos e inactividad. Lógica pura: la interfaz la usa para armar las
 * opciones de `server_start` y validar lo escrito. El backend (src-tauri/src/srvguard.rs) valida
 * de nuevo y es quien aplica; las reglas de CIDR y de IP de escucha son las mismas.
 */

export type GuardKind = "tftp" | "http" | "ftp" | "syslog";

export const GUARD_KINDS: GuardKind[] = ["tftp", "http", "ftp", "syslog"];

export const GUARD_LABEL: Record<GuardKind, string> = { tftp: "TFTP", http: "HTTP", ftp: "FTP", syslog: "Syslog" };

/** Minutos sin actividad tras los que un servidor se detiene (el mismo valor por defecto que el backend). */
export const DEFAULT_IDLE_MIN = 30;
export const MAX_IDLE_MIN = 24 * 60;
/** Valor de `bind` para escuchar en todas las interfaces. */
export const ALL = "all";

export interface GuardPrefs {
  /** Interfaz de escucha: "all" o una IP local. Sin valor: la IP de la ruta por defecto. */
  bind?: string;
  /** IP o subredes CIDR permitidas, separadas por coma, espacio o salto de línea. Vacío: cualquiera. */
  allow?: string;
  /** Minutos de inactividad antes de detenerse; 0 desactiva la detención automática. */
  idle?: number;
}

export interface GuardOpts {
  bind: string;
  allow: string[];
  idleMinutes: number;
}

export interface LocalIf {
  name: string;
  ip: string;
  default?: boolean;
}

/** Preferencias guardadas de un servidor, con forma válida (un settings.json editado a mano no rompe nada). */
export function prefsOf(store: unknown, kind: GuardKind): GuardPrefs {
  const raw = store && typeof store === "object" && !Array.isArray(store) ? (store as Record<string, unknown>)[kind] : undefined;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const r = raw as Record<string, unknown>;
  const out: GuardPrefs = {};
  if (typeof r.bind === "string") out.bind = r.bind;
  if (typeof r.allow === "string") out.allow = r.allow.slice(0, 4000);
  if (typeof r.idle === "number" && Number.isFinite(r.idle)) out.idle = r.idle;
  return out;
}

/** Minutos de inactividad efectivos: por defecto 30; 0 (desactivada) se conserva; el resto se acota a 1..1440. */
export function idleMinutes(p: GuardPrefs): number {
  if (p.idle === undefined) return DEFAULT_IDLE_MIN;
  if (p.idle <= 0) return 0;
  return Math.min(MAX_IDLE_MIN, Math.max(1, Math.round(p.idle)));
}

/** IP preseleccionada: la de la ruta por defecto; si no hay, la primera interfaz. Sin interfaces: todas. */
export function defaultBind(ips: LocalIf[]): string {
  return ips.find((i) => i.default)?.ip ?? ips[0]?.ip ?? ALL;
}

/**
 * Interfaz de escucha efectiva. Una IP guardada que ya no existe (otra red) vuelve a la
 * predeterminada y se marca `stale` para avisarlo.
 */
export function resolveBind(p: GuardPrefs, ips: LocalIf[]): { bind: string; stale: boolean } {
  if (p.bind === undefined || p.bind === "") return { bind: defaultBind(ips), stale: false };
  if (p.bind === ALL) return { bind: ALL, stale: false };
  if (ips.length === 0 || ips.some((i) => i.ip === p.bind)) return { bind: p.bind, stale: false };
  return { bind: defaultBind(ips), stale: true };
}

// ---------- Clientes permitidos ----------

const V4 = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;
// IPv6: validación laxa (el backend es el que decide); evita aceptar basura obvia.
const V6 = /^[0-9a-fA-F:.]+$/;

function validIp(s: string): "4" | "6" | null {
  if (V4.test(s)) return "4";
  if (s.includes(":") && V6.test(s) && (s.match(/::/g) ?? []).length <= 1 && s.split(":").length <= 9) return "6";
  return null;
}

export interface AllowParse {
  entries: string[];
  errors: string[];
}

export const MAX_ALLOW_ENTRIES = 64;

/** Separa y valida la lista de clientes permitidos (IP, o subred con /prefijo). */
export function parseAllow(text: string | undefined): AllowParse {
  const entries: string[] = [];
  const errors: string[] = [];
  for (const e of (text ?? "").split(/[\s,;]+/).filter(Boolean)) {
    const [addr, len, ...rest] = e.split("/");
    const fam = validIp(addr);
    const n = len === undefined ? null : /^\d{1,3}$/.test(len) ? Number(len) : NaN;
    if (!fam || rest.length || (n !== null && (Number.isNaN(n) || n > (fam === "4" ? 32 : 128)))) errors.push(`"${e}" no es una IP ni una subred válida (ej. 10.0.0.0/24)`);
    else entries.push(e);
  }
  if (entries.length > MAX_ALLOW_ENTRIES) errors.push(`Máximo ${MAX_ALLOW_ENTRIES} entradas`);
  return { entries, errors };
}

/** Opciones que se pasan a `server_start` / `ftp_server_start`. `bind`: interfaz ya resuelta ("all" o una IP). */
export function serverOpts(store: unknown, kind: GuardKind, bind: string): GuardOpts {
  const p = prefsOf(store, kind);
  return { bind, allow: parseAllow(p.allow).entries, idleMinutes: idleMinutes(p) };
}

/**
 * Para quien arranca el servidor a pedido de una operación (gestor de archivos): la interfaz es la
 * IP que el usuario eligió allí (la que el equipo alcanza) salvo que haya fijado "todas".
 */
export function operationBind(store: unknown, kind: GuardKind, chosenIp: string): string {
  return prefsOf(store, kind).bind === ALL || !chosenIp ? ALL : chosenIp;
}

/** Resumen de una línea del estado de acceso de un servidor. */
export function guardSummary(p: GuardPrefs, ips: LocalIf[]): { text: string; warn: boolean } {
  const { bind } = resolveBind(p, ips);
  const allow = parseAllow(p.allow).entries.length;
  const idle = idleMinutes(p);
  const where = bind === ALL ? "todas las interfaces" : bind;
  const who = allow ? `${allow} ${allow === 1 ? "origen permitido" : "orígenes permitidos"}` : "cualquier cliente";
  const stop = idle ? `se detiene tras ${idle} min sin uso` : "sin detención automática";
  return { text: `${where} · ${who} · ${stop}`, warn: bind === ALL && allow === 0 };
}

/** Mensaje al detenerse un servidor por inactividad. */
export function idleStopMessage(kind: string, minutes: number | null | undefined): string {
  const name = GUARD_LABEL[kind as GuardKind] ?? kind;
  return `Servidor ${name} detenido: ${minutes ? `${minutes} min` : "tiempo"} sin actividad. Vuelve a iniciarlo cuando lo necesites.`;
}
