/**
 * Tráfico en los enlaces de la topología: contadores por SNMP (IF-MIB) o por consola, tasas por
 * diferencia entre lecturas (con vuelta de contadores de 32 bits y reinicios) y tráfico por
 * sentido de cada enlace. Solo lectura: por SNMP solo GET de los contadores y por consola solo
 * los comandos de TRAFFIC_COMMANDS (computeRisk === "read", con test).
 */
import type { LinkTraffic, TopoLink, TopoVendor } from "./topology";
import { plainCli, stripPager } from "./cliText";
import { canonPort, isCliError, isSafeIface, knownAddrs, withNoPager } from "./topology";
import type { TopoNode } from "./topology";
import { OID } from "./topoSnmp";
import { tabAtDevice } from "./hopTab";
import type { TabRoute } from "./hopTab";

// ---------- Umbrales y estados del enlace ----------

/**
 * Umbrales de utilización del sentido más cargado: "alto" desde 70 % y "saturado" desde 90 %.
 * Son los mismos que usa el color continuo de la vista detallada (UTIL_WARN y UTIL_CRIT de
 * topology.ts, con prueba de igualdad). Constantes aparte para volverlos configurables.
 */
export const UTIL_HIGH = 0.7;
export const UTIL_SATURATED = 0.9;

/** Estado de carga de un enlace o de un sentido. Sin dato o sin velocidad conocida cuenta como normal. */
export type TrafficLevel = "normal" | "high" | "saturated";
/** Estado de un enlace en el mapa: a los de carga se suma "down" (puerto caído en algún extremo, incluye err-disabled). */
export type LinkLevel = TrafficLevel | "down";

export const trafficLevel = (util: number | undefined): TrafficLevel =>
  util === undefined || !Number.isFinite(util) ? "normal" : util >= UTIL_SATURATED ? "saturated" : util >= UTIL_HIGH ? "high" : "normal";

/** Estado de un sentido: su tasa contra la velocidad del enlace. */
export const dirLevel = (bps: number | null | undefined, speed: number | undefined): TrafficLevel =>
  bps == null || !speed || speed <= 0 ? "normal" : trafficLevel(bps / speed);

/** Orden de severidad para listas y para elegir el peor enlace de un par: caído y saturado primero. */
export const LEVEL_RANK: Record<LinkLevel | "issues", number> = { down: 3, saturated: 3, high: 2, issues: 1, normal: 0 };

/** Lectura de contadores de una interfaz. */
export interface CounterSample {
  inOctets: bigint;
  outOctets: bigint;
  /** 64: ifHCInOctets/ifHCOutOctets o consola; 32: ifInOctets/ifOutOctets (dan la vuelta). */
  bits: 32 | 64;
  /** Velocidad en bits/s (ifHighSpeed x 10^6, ifSpeed, velocidad física o BW de la consola). */
  speed?: number;
  /** La velocidad es el "BW" configurado (puede ser menor que la real): no sirve para descartar tasas. */
  approx?: boolean;
  /** Momento de la lectura (ms). */
  ts: number;
  /** Origen de la lectura. */
  src?: "snmp" | "cli";
}

/** Tasa de una interfaz en bits/s; null si no se puede calcular (primera lectura o reinicio). */
export interface PortRate {
  inBps: number | null;
  outBps: number | null;
  speed?: number;
  approx?: boolean;
  /** Contadores de 32 bits en una interfaz de 1 G o más: la tasa es un piso (ver LOW_RES_SPEED). */
  lowRes?: boolean;
  ts: number;
  src?: "snmp" | "cli";
}

const TWO32 = 1n << 32n;

/**
 * Desde esta velocidad un contador de 32 bits no alcanza: a 1 Gb/s da la vuelta en 34 s y a
 * 10 Gb/s en 3,4 s, menos que el intervalo de lectura. Con más de una vuelta entre lecturas la
 * tasa calculada queda por debajo de la real (8 Gb/s se leían como 1,13 Gb/s) y se marca aproximada.
 */
export const LOW_RES_SPEED = 1e9;

/**
 * Separación máxima entre dos lecturas para calcular una tasa: tres intervalos, con un piso de
 * 3 min (una lectura por consola de un equipo grande puede tardar más de un minuto). Sobre eso
 * la lectura anterior es de otra sesión de trabajo (la herramienta estuvo oculta) y la tasa sería
 * el promedio de todo ese tiempo.
 */
export const maxSampleGapMs = (intervalSecs: number) => Math.max(3 * intervalSecs * 1000, 180_000);

/**
 * Diferencia entre dos lecturas. Con 32 bits un valor menor se toma como una vuelta (2^32);
 * con 64 bits una vuelta es imposible en la práctica, así que es un reinicio (null).
 */
export function counterDelta(prev: bigint, cur: bigint, bits: 32 | 64): { d: bigint; wrapped: boolean } | null {
  if (cur >= prev) return { d: cur - prev, wrapped: false };
  if (bits === 32 && prev < TWO32 && cur < TWO32) return { d: cur + TWO32 - prev, wrapped: true };
  return null;
}

/** Margen sobre la velocidad para aceptar una tasa (ráfagas y redondeo de la velocidad). */
const OVER_SPEED = 1.5;

/**
 * Tasa en bits/s entre dos lecturas de un contador. Se descarta (null) si el contador se reinició
 * (equipo reiniciado o "clear counters") y, cuando se conoce la velocidad, si el resultado es
 * imposible: así un reinicio de un contador de 32 bits no se confunde con una vuelta.
 */
export function rateBps(prev: bigint, cur: bigint, bits: 32 | 64, seconds: number, speed?: number): number | null {
  if (!(seconds > 0)) return null;
  const delta = counterDelta(prev, cur, bits);
  if (!delta) return null;
  const bps = (Number(delta.d) * 8) / seconds;
  if (speed && bps > speed * OVER_SPEED) return null;
  return bps;
}

/**
 * Tasas de una interfaz entre dos lecturas (de la misma fuente). Con `maxGapMs`, una lectura
 * anterior más antigua que eso no se usa: al volver a Topología tras 2 h, la primera tasa era el
 * promedio de esas 2 h. Queda sin tasa hasta la lectura siguiente.
 */
export function portRate(prev: CounterSample | undefined, cur: CounterSample, maxGapMs?: number): PortRate {
  const speed = cur.speed && cur.speed > 0 ? cur.speed : undefined;
  const lowRes = cur.bits === 32 && !!speed && speed >= LOW_RES_SPEED ? { lowRes: true as const } : {};
  const approx = speed && cur.approx ? { approx: true as const } : {};
  const src = cur.src ? { src: cur.src } : {};
  if (!prev || prev.bits !== cur.bits || (maxGapMs !== undefined && cur.ts - prev.ts > maxGapMs)) return { inBps: null, outBps: null, speed, ...approx, ...lowRes, ...src, ts: cur.ts };
  const secs = (cur.ts - prev.ts) / 1000;
  // Con el BW configurado la velocidad puede ser menor que la real: no se descarta por 1,5x.
  const limit = cur.approx ? undefined : speed;
  return {
    inBps: rateBps(prev.inOctets, cur.inOctets, cur.bits, secs, limit),
    outBps: rateBps(prev.outOctets, cur.outOctets, cur.bits, secs, limit),
    speed,
    ...approx,
    ...lowRes,
    ...src,
    ts: cur.ts,
  };
}

/**
 * Clave flexible de un puerto ya normalizado (canonPort): sin la subinterfaz (".100") ni signos. Sirve
 * de segunda opción cuando el enlace informa el puerto distinto de como lo nombran los contadores.
 */
const loosePort = (k: string) => k.toLowerCase().replace(/\.\d+$/, "").replace(/[^a-z0-9/:]/g, "");

/**
 * Lectura de un puerto en el mapa de un equipo (clave canonPort). Primero la clave exacta; si falta,
 * la única clave que coincide sin distinguir mayúsculas, signos ni subinterfaz (un enlace sobre
 * "Gi1/0/1.100" usa los contadores de Gi1/0/1). Con dos o más candidatas no elige ninguna.
 */
export function portEntry<T>(m: Map<string, T> | undefined, port: string | undefined): T | undefined {
  if (!m || !port) return undefined;
  const k = canonPort(port);
  const hit = m.get(k);
  if (hit !== undefined) return hit;
  const want = loosePort(k);
  if (!want) return undefined;
  let found: T | undefined;
  let n = 0;
  for (const [key, v] of m) {
    if (loosePort(key) !== want) continue;
    if (++n > 1) return undefined;
    found = v;
  }
  return found;
}

/**
 * Tráfico de un enlace en ambos sentidos. A→B es lo que sale por el puerto de A (o, si A no se
 * lee, lo que entra por el de B); B→A, al revés. La velocidad es la menor informada. Sin al menos
 * una tasa calculada devuelve null (falta una segunda lectura).
 */
export function linkTraffic(l: TopoLink, rates: Map<string, Map<string, PortRate>>): LinkTraffic | null {
  const ra = portEntry(rates.get(l.a), l.aPort);
  const rb = portEntry(rates.get(l.b), l.bPort);
  const ab = ra?.outBps ?? rb?.inBps ?? null;
  const ba = ra?.inBps ?? rb?.outBps ?? null;
  if (ab === null && ba === null) return null;
  // La menor velocidad informada; una física (exacta) gana sobre un BW configurado.
  const known = [ra, rb].filter((r): r is PortRate => !!r?.speed && r.speed > 0);
  const exact = known.filter((r) => !r.approx);
  const pool = exact.length ? exact : known;
  const speed = pool.length ? Math.min(...pool.map((r) => r.speed!)) : undefined;
  // Alguna de las tasas usadas viene de contadores de 32 bits en 1 G o más: es un piso, no el valor.
  const lowRes = (ab !== null && !!(ra?.outBps != null ? ra : rb)?.lowRes) || (ba !== null && !!(ra?.inBps != null ? ra : rb)?.lowRes);
  const approx = (!exact.length && known.length > 0) || lowRes;
  const util = speed ? Math.max(ab ?? 0, ba ?? 0) / speed : undefined;
  // El origen es el de la lectura más reciente de los extremos.
  const src = (ra && rb ? (rb.ts > ra.ts ? rb : ra) : (ra ?? rb))?.src;
  return {
    ab,
    ba,
    ...(speed ? { speed } : {}),
    ...(util !== undefined ? { util } : {}),
    ...(approx ? { approx: true } : {}),
    ...(lowRes ? { lowRes: true } : {}),
    ts: Math.max(ra?.ts ?? 0, rb?.ts ?? 0),
    ...(src ? { src } : {}),
  };
}

// ---------- Enlaces sin datos de tráfico ----------

/** Estado de la última ronda de lecturas (el que registra useTopoTraffic), por nombre de equipo. */
export interface TrafficReadState {
  snmp: string[];
  cli: string[];
  /** Equipos explorados sin perfil SNMP ni sesión de consola habilitada. */
  none: string[];
  /** "equipo: motivo". */
  errors: string[];
  /** Pestañas sin prompt a la vista: no se les envió nada. */
  busy: string[];
  /** "equipo: detalle" de las lecturas por consola cortadas. */
  partial: string[];
  last?: number;
}

/**
 * Por qué un enlace no tiene tráfico con la lectura activa. De mayor a menor utilidad para actuar:
 * error de lectura, puerto que no aparece en los contadores, lectura parcial, extremo sin perfil SNMP
 * ni consola, pestaña ocupada, enlace sin puerto, esperando lectura y extremo sin explorar.
 */
export type NoTrafficKind = "error" | "portMissing" | "partial" | "noSource" | "busy" | "noPort" | "waiting" | "unexplored";
const NO_TRAFFIC_ORDER: NoTrafficKind[] = ["error", "portMissing", "partial", "noSource", "busy", "noPort", "waiting", "unexplored"];

/** Rótulo corto de cada motivo (resumen del panel). */
export const NO_TRAFFIC_SHORT: Record<NoTrafficKind, string> = {
  error: "error de lectura",
  portMissing: "puerto no encontrado",
  partial: "lectura parcial",
  noSource: "sin SNMP ni consola",
  busy: "pestaña ocupada",
  noPort: "sin puerto",
  waiting: "esperando lectura",
  unexplored: "sin explorar",
};

export interface NoTrafficEnd {
  /** Nombre del equipo del extremo. */
  name: string;
  kind: NoTrafficKind;
  text: string;
}

export interface NoTrafficReason {
  /** El motivo más útil para actuar entre los extremos. */
  kind: NoTrafficKind;
  /** Motivo legible del enlace, con el equipo de cada extremo. */
  text: string;
  ends: NoTrafficEnd[];
}

/** Texto después de "equipo: " en las listas de estado (errores y lecturas parciales). */
const afterName = (list: string[], name: string) => {
  const hit = list.find((e) => e.startsWith(`${name}: `));
  return hit === undefined ? undefined : hit.slice(name.length + 2);
};

function endReason(
  n: Pick<TopoNode, "id" | "name" | "explored"> | undefined,
  id: string,
  port: string,
  rates: Map<string, Map<string, PortRate>>,
  st: TrafficReadState,
): NoTrafficEnd {
  const name = n?.name ?? id;
  const end = (kind: NoTrafficKind, text: string): NoTrafficEnd => ({ name, kind, text });
  if (!n?.explored) return end("unexplored", "sin explorar: no se leen sus contadores");
  if (!port) return end("noPort", "el enlace no informa su puerto");
  if (st.none.includes(name)) return end("noSource", "sin perfil SNMP ni lectura por consola");
  const err = afterName(st.errors, name);
  if (err !== undefined) return end("error", `error de lectura (${err})`);
  if (st.busy.includes(name)) return end("busy", "su pestaña no estaba en el prompt; se reintenta en la próxima lectura");
  const own = rates.get(id);
  if (portEntry(own, port)) return end("waiting", "esperando la segunda lectura (la tasa sale de dos lecturas seguidas)");
  if (own) {
    if (afterName(st.partial, name) !== undefined) return end("partial", `lectura parcial: ${port} no alcanzó a leerse`);
    return end("portMissing", st.snmp.includes(name) ? `${port} no aparece en ifName ni ifDescr del equipo` : `${port} no aparece en los contadores leídos del equipo`);
  }
  return end("waiting", st.last ? "esperando la próxima lectura" : "esperando la primera lectura");
}

/**
 * Motivo por el que un enlace queda sin datos de tráfico con la lectura activa (sin LinkTraffic). Se
 * revisa cada extremo con lo que registró la última ronda: ningún extremo explorado; extremo sin
 * perfil SNMP ni consola; error de lectura; pestaña ocupada; puerto leído sin tasa todavía (falta la
 * segunda lectura o el contador se reinició); equipo leído cuyos contadores no traen el puerto; o
 * lectura por consola cortada. Función pura: el estado viene de useTopoTraffic.
 */
export function noTrafficReason(
  l: Pick<TopoLink, "a" | "aPort" | "b" | "bPort">,
  nodes: Map<string, Pick<TopoNode, "id" | "name" | "explored">>,
  rates: Map<string, Map<string, PortRate>>,
  st: TrafficReadState,
): NoTrafficReason {
  const ends = [endReason(nodes.get(l.a), l.a, l.aPort, rates, st), endReason(nodes.get(l.b), l.b, l.bPort, rates, st)];
  const read = ends.filter((e) => e.kind !== "unexplored");
  if (!read.length) return { kind: "unexplored", text: "Ningún extremo explorado: descubre uno de los dos equipos para leer sus contadores", ends };
  read.sort((x, y) => NO_TRAFFIC_ORDER.indexOf(x.kind) - NO_TRAFFIC_ORDER.indexOf(y.kind));
  const text = read.length === 2 && read[0].text === read[1].text ? `Ambos extremos: ${read[0].text}` : read.map((e) => `${e.name}: ${e.text}`).join("; ");
  return { kind: read[0].kind, text, ends };
}

/**
 * Pestaña del equipo para leer su tráfico por consola: la que su ruta o su prompt ubican en él
 * (ver `tabAtDevice`), verificada por prompt primero, o la que apunta a su IP o nombre si no se puede
 * verificar. Nunca una pestaña que cambió de equipo: con el prompt de otro, no es la de este.
 * Cada equipo de una ruta de saltos tiene su propia pestaña (`routes`, por id de pestaña).
 */
export function terminalFor<T extends { connId: string; name: string; host?: string; tabId?: string; screen?: (n: number) => string }>(
  n: TopoNode,
  terminals: T[],
  routes?: Record<string, TabRoute>,
): T | undefined {
  return tabAtDevice(n.id, knownAddrs(n), terminals, routes, undefined, n.aliases)?.tab;
}

// ---------- SNMP ----------

/** Máximo de interfaces por equipo en una lectura (3 OID cada una: cabe en un GET de 192). */
export const MAX_TRAFFIC_IFACES = 64;

/** OIDs de contadores para un GET: 64 bits (ifXTable) o, si el agente no los tiene, 32 bits. */
export function counterOids(ifIndexes: number[], hc: boolean): string[] {
  const cols = hc ? [OID.ifHCInOctets, OID.ifHCOutOctets, OID.ifHighSpeed] : [OID.ifInOctets, OID.ifOutOctets, OID.ifSpeed];
  return ifIndexes.slice(0, MAX_TRAFFIC_IFACES).flatMap((i) => cols.map((c) => `${c}.${i}`));
}

export interface GetRow {
  oid: string;
  type: string;
  value: string;
}

const big = (v: string | undefined) => (v !== undefined && /^\d{1,20}$/.test(v) ? BigInt(v) : undefined);

/**
 * Contadores por ifIndex desde el GET. `hcMissing`: el agente respondió que no tiene los contadores
 * de 64 bits (noSuchObject/noSuchInstance en todos) y hay que pedir los de 32 bits. Un GET sin filas
 * (tooBig, genErr, authorizationError: `getError` en la lectura) no dice nada de ifXTable: antes se
 * tomaba como "sin 64 bits" y el equipo quedaba en Counter32 hasta reiniciar la app.
 */
export function parseCounterGets(rows: GetRow[], ifIndexes: number[], hc: boolean, ts: number): { samples: Map<number, CounterSample>; hcMissing: boolean } {
  const val = new Map(rows.filter((r) => /^(Counter32|Counter64|Gauge32|INTEGER)$/.test(r.type)).map((r) => [r.oid, r.value]));
  const samples = new Map<number, CounterSample>();
  const [ci, co, cs] = hc ? [OID.ifHCInOctets, OID.ifHCOutOctets, OID.ifHighSpeed] : [OID.ifInOctets, OID.ifOutOctets, OID.ifSpeed];
  for (const i of ifIndexes) {
    const inO = big(val.get(`${ci}.${i}`));
    const outO = big(val.get(`${co}.${i}`));
    if (inO === undefined || outO === undefined) continue;
    const sp = Number(val.get(`${cs}.${i}`));
    // ifHighSpeed en Mb/s; ifSpeed en b/s (tope 4.294.967.295: sobre eso informa ifHighSpeed).
    const speed = Number.isFinite(sp) && sp > 0 ? (hc ? sp * 1e6 : sp) : undefined;
    samples.set(i, { inOctets: inO, outOctets: outO, bits: hc ? 64 : 32, speed, ts, src: "snmp" });
  }
  const noSuch = rows.some((r) => /^noSuch(?:Object|Instance)$/.test(r.type) && (r.oid.startsWith(`${ci}.`) || r.oid.startsWith(`${co}.`)));
  return { samples, hcMissing: hc && samples.size === 0 && ifIndexes.length > 0 && noSuch };
}

// ---------- Consola ----------

/**
 * Comando de contadores por fabricante (solo consulta, uno por lectura y equipo):
 * - Cisco IOS/IOS-XE "show interfaces" ("N packets input, N bytes", "BW N Kbit"), Cisco IOS
 *   Command Reference, "show interfaces",
 *   https://www.cisco.com/E-Learning/bulk/public/tac/cim/cib/using_cisco_ios_software/cmdrefs/show_interfaces.htm
 *   NX-OS no reconoce "show interfaces": se prueba "show interface" (RX/TX "N input packets N bytes").
 * - Huawei VRP "display interface" ("current state", "Speed : 100", "Input: N packets, N bytes"),
 *   Huawei, "display interface gigabitethernet 0/0/1" (guía de AR),
 *   https://info.support.huawei.com/network/ptmngsys/Web/tsrev_ar/en/content/ar/13_edesk_pppoe_cannot_dialup_to_the_internet/edesk_pppoe_cannot_dialup_to_the_internet_edesk002.html
 * - Junos "show interfaces extensive" ("Physical interface:", "Speed:", "Traffic statistics:
 *   Input bytes / Output bytes"), Juniper, "show interfaces extensive",
 *   https://juniper.net/documentation/en_US/junos13.1/topics/reference/command-summary/show-interfaces-extensive.html
 * FortiOS queda fuera (sin comando de consulta verificado con contadores por interfaz).
 *
 * En Cisco IOS/IOS-XE va primero filtrado (CISCO_TRAFFIC_FILTER): "show interfaces" completo de un
 * 2960 de 48 puertos son ~30 líneas por interfaz (más de 50 KB por lectura en el scrollback). Con el
 * filtro quedan las ~6 líneas que usa el cálculo (encabezado, BW, dúplex y velocidad, bytes de
 * entrada y salida, errores), con los mismos contadores y la misma tasa.
 */
export const TRAFFIC_COMMANDS: Record<TopoVendor, string | undefined> = {
  cisco: "show interfaces",
  huawei: "display interface",
  juniper: "show interfaces extensive",
  fortinet: undefined,
};
export const TRAFFIC_FALLBACK: Record<string, string> = { "show interfaces": "show interface" };

/**
 * "show interfaces" de IOS/IOS-XE con solo las líneas que lee parseCliCounters. "include" de IOS
 * acepta una expresión regular con alternativas ("|"), Cisco, "Using the Cisco IOS Command-Line
 * Interface", Filtering Output / Regular Expressions. Si el equipo no lo reconoce (NX-OS, otra
 * sintaxis) o no trae contadores, se sigue con el comando completo.
 */
export const CISCO_TRAFFIC_FILTER = "show interfaces | include line protocol|packets input|packets output|duplex|BW|CRC";
/** Comandos filtrados: una respuesta sin contadores no los da por buenos (se prueba el siguiente). */
export const isFilteredTraffic = (cmd: string) => cmd === CISCO_TRAFFIC_FILTER;

/**
 * Tope de interfaces que se leen una por una ("show interfaces Gi1/0/5 | include …", un comando cada
 * una). Un switch de acceso suele tener uno a cuatro enlaces en el diagrama: así se lee solo lo que
 * se dibuja. Con más enlaces va un solo comando filtrado (menos idas y vueltas por ronda).
 */
export const PER_PORT_MAX = 8;

/**
 * Comandos de una lectura de contadores: con el comando filtrado de IOS y hasta PER_PORT_MAX
 * interfaces con enlace, uno por interfaz (nombre tal como lo anunció el vecino, sin espacios:
 * "Gig 1/0/1" pasa a "Gig1/0/1", que IOS acepta); si no, el comando tal cual. Un nombre que no es
 * de interfaz (podría traer "| algo") deja la lectura en el comando único.
 */
export function trafficPlan(cmd: string, ports: string[]): string[] {
  if (!isFilteredTraffic(cmd) || !ports.length || ports.length > PER_PORT_MAX) return [cmd];
  const names = [...new Set(ports.map((p) => p.replace(/\s+/g, "")))];
  if (!names.every(isSafeIface)) return [cmd];
  const filter = cmd.slice("show interfaces".length);
  return names.map((n) => `show interfaces ${n}${filter}`);
}

/**
 * Comandos de contadores a probar para una sesión, en orden. Con la plataforma detectada (o
 * fijada en el catálogo) va el comando de su fabricante; si no, el del resaltado elegido; y si
 * tampoco hay resaltado ("Según ajustes"), Cisco y luego Huawei: antes un Huawei sin resaltado
 * recibía "show interfaces", fallaba y el enlace quedaba sin tráfico. Solo comandos de consulta.
 * En Junos y Huawei va primero con "| no-more" (sin paginador: la salida de un chasis son cientos
 * de páginas) y después solo, por si esa versión no reconoce el filtro.
 */
export function trafficCommands(platform: string | undefined, highlightVendor: TopoVendor | undefined): string[] {
  const p = platform ?? "";
  const vendor: TopoVendor | undefined = /^(vrp|yunshan)/.test(p)
    ? "huawei"
    : /^(junos|ex-legacy)/.test(p)
      ? "juniper"
      : /^fos/.test(p)
        ? "fortinet"
        : /^(ios|iosxe|iosxr|nxos)$/.test(p)
          ? "cisco"
          : highlightVendor;
  const vendors: TopoVendor[] = vendor ? [vendor] : ["cisco", "huawei"];
  const out: string[] = [];
  for (const v of vendors) {
    const c = TRAFFIC_COMMANDS[v];
    if (!c) continue;
    // NX-OS no reconoce "show interfaces" y su formato no trae "line protocol": va directo al completo.
    if (v === "cisco" && p !== "nxos") out.push(CISCO_TRAFFIC_FILTER);
    out.push(withNoPager(v, c), c);
    if (TRAFFIC_FALLBACK[c]) out.push(TRAFFIC_FALLBACK[c]);
  }
  return [...new Set(out)];
}

/** Contadores por interfaz leídos de la consola (clave canonPort). */
export interface CliCounters {
  name: string;
  inOctets: bigint;
  outOctets: bigint;
  speed?: number;
  /** La velocidad salió de "BW N Kbit" (configurable con "bandwidth"), no de la física. */
  speedApprox?: true;
  /** Estado de la interfaz según su encabezado: el motivo entre paréntesis (connected, notconnect, err-disabled) o "up/down". */
  status?: string;
  /** Dúplex negociado ("full" o "half") que informa Cisco junto a la velocidad. */
  duplex?: string;
  /** Errores CRC y de entrada acumulados (Cisco: "N input errors, N CRC"). */
  crc?: string;
  inErr?: string;
}

const HEADER = /^(?:(\S+) is (?:administratively )?(?:up|down|deleted)\b|(\S+) current state\s*:|Physical interface:\s*([^,\s]+),)/;
/** Bloques por interfaz con tope: una salida enorme no congela la vista. */
const MAX_CLI_IFACES = 4096;
const MAX_CLI_LEN = 4_000_000;

/**
 * "--More--" (IOS, NX-OS), "---- More ----" (VRP) y "---(more)---" (Junos) con el borrado que envía el
 * equipo al avanzar de página: "\r" + espacios + "\r", retrocesos o ESC[K.
 */

const UNIT = { k: 1e3, m: 1e6, g: 1e9, t: 1e12 } as const;
/** Agregados (Port-channel, Eth-Trunk, ae, Bundle-Ether): su velocidad es la suma de los miembros activos. */
const AGGREGATE = /^(?:port-channel|po|eth-trunk|ae|bundle-ether|be)\d/i;

/**
 * Velocidad de la interfaz. Cisco informa la física junto al dúplex ("Full-duplex, 1000Mb/s",
 * "full-duplex, 10 Gb/s" en NX-OS, "Full Duplex, 1000Mbps") y además "BW N Kbit", que es
 * configurable con "bandwidth" y puede ser menor que la real: la física gana y, si solo hay BW,
 * la velocidad queda marcada como aproximada.
 */
function speedOf(block: string, name = ""): { speed: number; approx?: true } | undefined {
  const bw = block.match(/\bBW (\d{1,12}) Kbit/);
  // En un agregado, "Full-duplex, 1000Mb/s" es la velocidad de un miembro y el BW, la suma de los
  // activos: con 4 x 1 G se tomaba 1 G y una tasa real de 2,4 Gb/s se descartaba por imposible.
  if (bw && AGGREGATE.test(name)) return { speed: Number(bw[1]) * 1e3, approx: true };
  // Huawei Eth-Trunk: "Maximal BW: 4G, Current BW: 2G" (lectura tolerante).
  const trunk = AGGREGATE.test(name) ? block.match(/\bCurrent BW\s*:\s*(\d{1,6}(?:\.\d{1,3})?)\s*([kmgt])/i) : null;
  if (trunk) return { speed: Number(trunk[1]) * UNIT[trunk[2].toLowerCase() as keyof typeof UNIT] };
  const phys = block.match(/\b(?:full|half)[- ]duplex,\s*(\d{1,6}(?:\.\d{1,3})?)\s*([kmgt])(?:b\/s|bps)/i);
  if (phys) return { speed: Number(phys[1]) * UNIT[phys[2].toLowerCase() as keyof typeof UNIT] };
  if (bw) return { speed: Number(bw[1]) * 1e3, approx: true };
  const hw = block.match(/^\s*Speed\s*:\s*(\d{1,7}),/m);
  if (hw) return { speed: Number(hw[1]) * 1e6 };
  const jn = block.match(/\bSpeed\s*:\s*(\d{1,6}(?:\.\d{1,3})?)\s*([kmgt])bps/i);
  if (jn) return { speed: Number(jn[1]) * UNIT[jn[2].toLowerCase() as keyof typeof UNIT] };
  return undefined;
}

/**
 * Estado, dúplex y errores de un bloque de "show interfaces" (Cisco IOS/IOS-XE, NX-OS). Encabezado:
 * "Gi1/0/5 is down, line protocol is down (err-disabled)"; "Full-duplex, 1000Mb/s"; "N input errors, N CRC".
 * Otros fabricantes quedan sin estos datos (solo se lee lo que el formato permite verificar).
 */
function stateOf(block: string): Pick<CliCounters, "status" | "duplex" | "crc" | "inErr"> {
  const out: Pick<CliCounters, "status" | "duplex" | "crc" | "inErr"> = {};
  const h = block.match(/^\S+ is (administratively )?(up|down|deleted), line protocol is (up|down)(?: \(([A-Za-z][\w-]{0,30})\))?/m);
  if (h) out.status = h[4] ?? (h[1] ? "administratively down" : `${h[2]}/${h[3]}`);
  const d = block.match(/\b(full|half)[- ]duplex\b/i);
  if (d) out.duplex = d[1].toLowerCase();
  const crc = block.match(/\b(\d{1,15}) CRC\b/);
  if (crc) out.crc = crc[1];
  const ie = block.match(/\b(\d{1,15}) input errors?\b/i);
  if (ie) out.inErr = ie[1];
  return out;
}

function countersOf(block: string): [bigint, bigint] | null {
  // Junos: solo la interfaz física (antes de la primera interfaz lógica).
  const phys = block.split(/^\s*Logical interface\b/m)[0];
  const pairs: [RegExp, RegExp][] = [
    [/(\d{1,20}) packets input, (\d{1,20}) bytes/, /(\d{1,20}) packets output, (\d{1,20}) bytes/],
    [/(\d{1,20}) input packets\s+(\d{1,20}) bytes/, /(\d{1,20}) output packets\s+(\d{1,20}) bytes/],
    [/Input:\s*(\d{1,20}) packets,\s*(\d{1,20}) bytes/, /Output:\s*(\d{1,20}) packets,\s*(\d{1,20}) bytes/],
    [/Input\s+bytes\s*:\s*()(\d{1,20})/, /Output\s+bytes\s*:\s*()(\d{1,20})/],
  ];
  for (const [ri, ro] of pairs) {
    const i = phys.match(ri);
    const o = phys.match(ro);
    if (i && o) return [BigInt(i[2]), BigInt(o[2])];
  }
  return null;
}

/** Contadores de "show interfaces", "show interface" (NX-OS), "display interface" o Junos extensive. */
export function parseCliCounters(out: string): Map<string, CliCounters> {
  const res = new Map<string, CliCounters>();
  if (!out || isCliError(out)) return res;
  // Lo que dejó el paginador ("--More--" y su borrado con retrocesos o ESC[K) queda pegado a la
  // primera línea de cada página; si es el encabezado de una interfaz, esta se perdía y sus
  // contadores se atribuían a la anterior. Se lee como lo muestra la terminal.
  const lines = plainCli(stripPager(out.slice(0, MAX_CLI_LEN))).split("\n");
  let name: string | undefined;
  let buf: string[] = [];
  const flush = () => {
    if (name && res.size < MAX_CLI_IFACES) {
      const block = buf.join("\n");
      const c = countersOf(block);
      const sp = speedOf(block, name);
      if (c) res.set(canonPort(name), { name, inOctets: c[0], outOctets: c[1], speed: sp?.speed, ...(sp?.approx ? { speedApprox: true as const } : {}), ...stateOf(block) });
    }
    buf = [];
  };
  for (const line of lines) {
    const m = line.match(HEADER);
    if (m) {
      flush();
      name = m[1] ?? m[2] ?? m[3];
    }
    buf.push(line);
  }
  flush();
  return res;
}
