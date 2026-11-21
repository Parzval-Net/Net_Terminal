/**
 * Destinos de conexión escritos a mano ("admin@10.0.0.1", "telnet sw01 2323", nombre de sesión).
 * Lógica pura: la usan la paleta, Conexión rápida y el campo "Conectar a…" de la pantalla de inicio.
 */
import type { Session } from "../types";

/** Coincidencia sin mayúsculas ni tildes: "cerrar todas" encuentra "Cerrar todas las sesiones". */
export const fold = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Interpreta conexiones rápidas:
 *   ssh admin@10.0.0.1:2222 · telnet 10.0.0.1 2323 · admin@router · 10.0.0.1
 *   2001:db8::1 · [2001:db8::1]:2222 · telnet fe80::1%en0 2323
 */
export function parseQuick(input: string): Session[] {
  const q = input.trim();
  if (!q || /\s{2,}/.test(q)) return [];
  const m = q.match(/^(?:(ssh|telnet)\s+)?(?:([^@\s]+)@)?(\S+?)(?:\s+(\d+))?$/i);
  if (!m) return [];
  const [, proto, user, target, spacePort] = m;
  let host: string;
  let colonPort: string | undefined;
  const bracket = target.match(/^\[([0-9a-f:.%\w-]+)\](?::(\d+))?$/i);
  if (bracket) [, host, colonPort] = bracket;
  else if ((target.match(/:/g) ?? []).length > 1) {
    // IPv6 sin corchetes: los ":" son parte de la dirección (el puerto va separado por espacio).
    if (!/^[0-9a-f:.]+(%[\w.-]+)?$/i.test(target)) return [];
    host = target;
  } else {
    const hp = target.match(/^([\w.-]+)(?::(\d+))?$/);
    if (!hp) return [];
    [, host, colonPort] = hp;
    if (!/[.-]|^[a-z][\w-]*$/i.test(host)) return [];
  }
  const p = colonPort || spacePort;
  const port = p ? Number(p) : undefined;
  if (port !== undefined && (port < 1 || port > 65535)) return [];
  const base = { id: "", folder: undefined, created_at: new Date().toISOString() };
  const ssh: Session = { ...base, type: "ssh", name: host, host, port: port ?? 22, username: user };
  const telnet: Session = { ...base, type: "telnet", name: host, host, port: port ?? 23 };
  if (proto?.toLowerCase() === "telnet") return [telnet];
  if (proto || user) return [ssh];
  return [ssh, telnet];
}

/** Forma canónica de un destino rápido, que parseQuick vuelve a interpretar. */
export function quickTarget(s: Session): string {
  return `${s.type} ${s.username ? `${s.username}@` : ""}${s.host ?? ""} ${s.port ?? ""}`.trim();
}

/** Candidato del campo "Conectar a…": una sesión guardada o una conexión rápida sin guardar. */
export interface ConnectMatch {
  session: Session;
  quick: boolean;
}

/** Dirección IP completa (IPv4 de cuatro octetos o IPv6): no es un texto de búsqueda a medio escribir. */
const isIpLiteral = (host: string | undefined) => !!host && (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":"));

/**
 * Candidatos para lo escrito en "Conectar a…". Primero las sesiones guardadas (nombre o host exacto,
 * luego nombre que empieza igual, luego nombre, host o carpeta que lo contienen), porque conservan
 * usuario, credenciales y ajustes; después la conexión rápida que se deduce del texto.
 *
 * Con una IP completa la conexión rápida va antes que las guardadas que solo la contienen: al
 * escribir "10.0.0.1", Enter no debe abrir la sesión guardada de 10.0.0.10 (otro equipo).
 */
export function matchConnect(query: string, sessions: Session[], limit = 5): ConnectMatch[] {
  const q = fold(query.trim());
  if (!q) return [];
  const rank = (s: Session) => {
    const name = fold(s.name);
    if (name === q || (!!s.host && fold(s.host) === q)) return 0;
    if (name.startsWith(q)) return 1;
    if (name.includes(q)) return 2;
    return [s.host, s.folder, s.serial_port].some((v) => v && fold(v).includes(q)) ? 3 : -1;
  };
  const saved = sessions
    .map((s, i) => ({ s, i, r: rank(s) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .slice(0, limit);
  const quick = parseQuick(query).map((session) => ({ session, quick: true }));
  const item = ({ s }: { s: Session }) => ({ session: s, quick: false });
  if (isIpLiteral(quick[0]?.session.host))
    return [...saved.filter((x) => x.r === 0).map(item), ...quick, ...saved.filter((x) => x.r > 0).map(item)];
  return [...saved.map(item), ...quick];
}
