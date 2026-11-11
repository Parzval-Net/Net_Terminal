/**
 * Resaltado de la salida de terminal por expresiones regulares (modelo ChromaTerm /
 * keyword highlighting de SecureCRT). Los colores con nombre usan la paleta ANSI del
 * tema activo, así el resaltado se adapta a cualquier tema de terminal.
 */
import type { ITheme } from "@xterm/xterm";
import { baseColor, themedColor } from "./hlPalette";
import { redosRisk } from "./regexSafety";

export const COLOR_NAMES = [
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
  "gray",
  "brightRed",
  "brightGreen",
  "brightYellow",
  "brightBlue",
  "brightMagenta",
  "brightCyan",
] as const;

export const colorLabel: Record<string, string> = {
  red: "Rojo",
  green: "Verde",
  yellow: "Amarillo",
  blue: "Azul",
  magenta: "Magenta",
  cyan: "Cian",
  white: "Blanco",
  gray: "Gris",
  brightRed: "Rojo claro",
  brightGreen: "Verde claro",
  brightYellow: "Amarillo claro",
  brightBlue: "Azul claro",
  brightMagenta: "Magenta claro",
  brightCyan: "Cian claro",
};

const ANSI_FG: Record<string, number> = {
  black: 30,
  red: 31,
  green: 32,
  yellow: 33,
  blue: 34,
  magenta: 35,
  cyan: 36,
  white: 37,
  gray: 90,
  brightRed: 91,
  brightGreen: 92,
  brightYellow: 93,
  brightBlue: 94,
  brightMagenta: 95,
  brightCyan: 96,
  brightWhite: 97,
};

export interface HlStyle {
  /** Nombre ANSI (adaptable al tema) o color #rrggbb fijo. */
  color?: string;
  bg?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

export interface HlRule {
  id: string;
  name: string;
  pattern: string;
  /** Sin distinguir mayúsculas. */
  ignoreCase?: boolean;
  /** Resaltar solo este grupo de captura (0 = coincidencia completa). */
  group?: number;
  style: HlStyle;
  enabled?: boolean;
}

export interface HlScheme {
  id: string;
  name: string;
  description: string;
  rules: HlRule[];
}

let ruleSeq = 0;
/**
 * Reglas integradas (auditadas, con pruebas de tiempo): se reconocen por identidad del objeto, nunca por
 * el id ni por otro dato que pueda venir de un archivo importado. Una copia ({ ...regla }) ya no es
 * integrada y se valida como cualquier regla del usuario.
 */
const BUILTIN = new WeakSet<HlRule>();
const r = (name: string, pattern: string, style: HlStyle, opts: Partial<HlRule> = {}): HlRule => {
  const rule = { id: `b${++ruleSeq}`, name, pattern, style, ...opts };
  BUILTIN.add(rule);
  return rule;
};
/** La regla es una de las integradas de la app (no una copia ni una importada). */
export const isBuiltinRule = (rule: HlRule) => BUILTIN.has(rule);

const IF_STATE_BAD = String.raw`\b(?:administratively down|err-?disabled|notconnect|not connected|sfp-config-mismatch|suspended|faulty|down|disabled|failed|failure|error|denied|deny|unreachable|timed? ?out|critical|alarm|inactive|discard(?:ed)?|rejected?|invalid)\b`;
// "up" en prosa ("up to the cursor", "up a line") no es un estado.
const IF_STATE_OK = String.raw`\b(?:up(?!\s+(?:to|a|an|the|one|from|by|with|for|and|of|in|on|at|until|time|since|days?|hours?)\b)|connected|established|enabled|permit|accept(?:ed)?|ok(?![?\w])|success(?:ful)?|forwarding|full|valid|reachable)\b`;
const IF_STATE_WARN = String.raw`\b(?:warning|warn|a-half|half|half-duplex|blocking|learning|listening|idle|opensent|openconfirm|init|2-?way|exstart|exchange|loading|standby|pending|degraded|flapping)\b`;
const ERR_COUNTERS = String.raw`\b[1-9]\d*\s+(?:input errors?|output errors?|CRC|frame|overrun|ignored|runts|giants|throttles|collisions|interface resets|late collision|output drops|input drops|drops|discards|errors)\b|\b(?:total output drops|output drops|input drops|CRC errors?|input errors?|output errors?)\s*[:=]\s*[1-9]\d*\b`;

const IPV4 = String.raw`\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\/(?:3[0-2]|[12]?\d))?\b`;
const IPV6 = String.raw`(?<![\w:.])(?:(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}|(?:[0-9a-f]{1,4}:){1,7}:(?:[0-9a-f]{1,4}(?::[0-9a-f]{1,4}){0,6})?|::[0-9a-f]{1,4}(?::[0-9a-f]{1,4}){0,6}|::(?=\/0))(?:\/\d{1,3})?(?![\w:])`;
const MAC = String.raw`\b(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}\b|\b(?:[0-9a-f]{4}\.){2}[0-9a-f]{4}\b`;

export const schemes: HlScheme[] = [
  {
    id: "cisco",
    name: "Cisco / Arista",
    description: "IOS, IOS-XE, IOS-XR, NX-OS y EOS: interfaces, secciones, shutdown, syslog",
    rules: [
      // El eco del comando va pegado al prompt ("core-sw01#show ..."): no se exige espacio.
      r("Prompt", String.raw`^[\w.\-\/:]+(?:\([\w\-\/.]+\))?[#>]`, { bold: true }),
      r("Comentario", String.raw`(?<=^\s*)!.*$`, { color: "gray" }),
      r("Error de comando", String.raw`(?<=^\s*)% .*$`, { color: "red", bold: true }),
      r("Syslog crítico (0-3)", String.raw`%[A-Z0-9_]+(?:-[A-Z0-9_]+)?-[0-3]-[A-Z0-9_]+`, { color: "red", bold: true }),
      r("Syslog warning (4)", String.raw`%[A-Z0-9_]+(?:-[A-Z0-9_]+)?-4-[A-Z0-9_]+`, { color: "yellow", bold: true }),
      r("Syslog info (5-7)", String.raw`%[A-Z0-9_]+(?:-[A-Z0-9_]+)?-[5-7]-[A-Z0-9_]+`, { color: "cyan" }),
      r("Descripción", String.raw`\bdescription\s+(.+)$`, { color: "brightYellow", italic: true }, { group: 1 }),
      r("no shutdown", String.raw`\bno shutdown\b`, { color: "green" }),
      r("shutdown", String.raw`(?<=^\s*)shutdown\b`, { color: "red", bold: true }),
      r("Negación", String.raw`(?<=^\s*)no(?=\s)`, { color: "yellow" }),
      r(
        "Sección",
        String.raw`^(?:interface|router|vlan|line|vrf(?: definition| context)?|ip vrf|policy-map|class-map|route-map|ip access-list|ipv6 access-list|access-list|object-group|aaa|snmp-server|ntp|logging|hostname|username|crypto|key chain|track|ip prefix-list|ipv6 prefix-list|banner|control-plane|spanning-tree|feature|address-family|neighbor|ip route|ipv6 route)\b`,
        { color: "brightBlue", bold: true },
      ),
      r(
        "Interfaz",
        String.raw`\bMgmtEth\d+\/RS?P\d+\/CPU\d+\/\d+\b|\b(?:(?:FourHundred|TwoHundred|Hundred|Fifty|Forty|TwentyFive|Ten|Two|Five)?Gig(?:abit)?E(?:thernet)?|AppGigabitEthernet|FastEthernet|Ethernet|Port-channel|port-channel|Bundle-Ether|Loopback|Tunnel|Serial|Vlan|BDI|nve|mgmt|Management|Hu|Fo|Twe|Te|Tw|Gi|Fa|Eth|Et|Po|BE|Lo|Tu|Se|Vl|Ap)\d+(?:[\/.:]\d+)*\b`,
        { color: "cyan" },
      ),
    ],
  },
  {
    id: "juniper",
    name: "Juniper",
    description: "Junos: set/delete, [edit], interfaces ge-/xe-/ae, inactive",
    rules: [
      r("Prompt", String.raw`^[\w.\-]+@[\w.\-]+[>#%](?=\s|$)`, { bold: true }),
      r("Jerarquía", String.raw`^\[edit[^\]]*\]`, { color: "brightBlue", bold: true }),
      r("Comentario", String.raw`(?<=^\s*)(?:#|\/\*).*$`, { color: "gray" }),
      r("Error de comando", String.raw`(?<=^\s*)(?:error: .*|syntax error\b.*|unknown command\b.*)$`, { color: "red", bold: true }),
      r("set", String.raw`(?<=^\s*)(?:set|activate)\b`, { color: "green", bold: true }),
      r("delete", String.raw`(?<=^\s*)(?:delete|deactivate)\b`, { color: "red", bold: true }),
      r("Descripción", String.raw`\bdescription\s+("[^"]*"|\S+)`, { color: "brightYellow", italic: true }, { group: 1 }),
      r("commit", String.raw`\bcommit complete\b`, { color: "green", bold: true }),
      r(
        "Interfaz",
        String.raw`\b(?:(?:ge|xe|et|fe|mge|xle|gr|lt|ip|st)-\d+\/\d+\/\d+(?::\d+)?|ae\d+|reth\d+|lo\d+|em\d+|fxp\d+|me\d+|(?:irb|vlan)(?=\.\d))(?:\.\d+)?\b`,
        { color: "cyan" },
      ),
    ],
  },
  {
    id: "huawei",
    name: "Huawei / H3C",
    description: "VRP y Comware: undo, display, interfaces GE/XGE/Eth-Trunk, Vlanif, Bridge-Aggregation",
    rules: [
      r("Prompt", String.raw`^[<\[][~*]?[\w.\-~][\w.\-~\/:]*[>\]]`, { bold: true }),
      r("Separador", String.raw`(?<=^\s*)#\s*$`, { color: "gray" }),
      r("Error de comando", String.raw`(?<=^\s*)(?:Error:|%\s).*$`, { color: "red", bold: true }),
      // Huawei "%%01IFNET/4/LINK_STATE"; H3C "IFNET/3/PHY_UPDOWN:" (sin %% y seguido de ":").
      r("Syslog crítico", String.raw`%%\d+[A-Z_][A-Z0-9_]*\/[0-3]\/[A-Z0-9_]+|\b[A-Z][A-Z0-9_]*\/[0-3]\/[A-Z0-9_]+(?=:)`, { color: "red", bold: true }),
      r("Syslog warning", String.raw`%%\d+[A-Z_][A-Z0-9_]*\/4\/[A-Z0-9_]+|\b[A-Z][A-Z0-9_]*\/4\/[A-Z0-9_]+(?=:)`, { color: "yellow", bold: true }),
      r("Syslog info", String.raw`%%\d+[A-Z_][A-Z0-9_]*\/[5-7]\/[A-Z0-9_]+|\b[A-Z][A-Z0-9_]*\/[5-7]\/[A-Z0-9_]+(?=:)`, { color: "cyan" }),
      r("Descripción", String.raw`\bdescription\s+(.+)$`, { color: "brightYellow", italic: true }, { group: 1 }),
      r("undo shutdown", String.raw`\bundo shutdown\b`, { color: "green" }),
      r("shutdown", String.raw`(?<=^\s*)shutdown\b`, { color: "red", bold: true }),
      r("undo", String.raw`(?<=^\s*)undo\b`, { color: "yellow" }),
      r(
        "Sección",
        String.raw`^(?:interface|bgp|ospf|isis|vlan|acl|aaa|user-interface|ip vpn-instance|route-policy|ip ip-prefix|sysname|ntp-service|snmp-agent|info-center|ip route-static)\b`,
        { color: "brightBlue", bold: true },
      ),
      r(
        "Interfaz",
        String.raw`\b(?:Ten-GigabitEthernet|M-GigabitEthernet|XGigabitEthernet|GigabitEthernet|FortyGigE|HundredGigE|Bridge-Aggregation|Route-Aggregation|Vlan-interface|MultiGE|400GE|200GE|100GE|50GE|40GE|25GE|10GE|XGE|FGE|HGE|MGE|GE|BAGG|RAGG|Ethernet|Eth-Trunk|Vlanif|Vbdif|Nve|LoopBack|InLoopBack|MEth|NULL|Tunnel)\s?\d+(?:[\/.:]\d+)*\b`,
        { color: "cyan" },
      ),
    ],
  },
  {
    id: "fortinet",
    name: "Fortinet",
    description: "FortiOS, FortiSwitchOS, FortiAP y FortiExtender: config/edit/set, port1/wan1 y nivel de logs",
    rules: [
      r("Prompt", String.raw`^[\w.\-]+(?: \([\w\-.]+\))? [#$](?=\s|$)`, { bold: true }),
      r("Comentario", String.raw`(?<=^\s*)#.*$`, { color: "gray" }),
      r("config / end", String.raw`(?<=^\s*)(?:config|end)\b`, { color: "brightBlue", bold: true }),
      r("edit / next", String.raw`(?<=^\s*)(?:edit|next)\b`, { color: "cyan", bold: true }),
      r("set", String.raw`(?<=^\s*)set\b`, { color: "green" }),
      r("unset", String.raw`(?<=^\s*)(?:unset|delete|purge)\b`, { color: "yellow" }),
      // Logs (log display, diagnose): el nivel manda sobre el color del texto entre comillas.
      r("Log crítico", String.raw`\blevel="?(?:emergency|alert|critical|error)"?`, { color: "red", bold: true }),
      r("Log warning", String.raw`\blevel="?warning"?`, { color: "yellow", bold: true }),
      r(
        "Interfaz",
        String.raw`\b(?:port\d+|wan\d|dmz\d?|internal\d+|lan\d+|modem\d|lte\d|wwan\d?|x\d{1,2}|ha\d|mgmt\d?|fortilink|npu\d+_vlink\d+|ssl\.root)(?:\.\d+)?\b`,
        { color: "cyan" },
      ),
      // El texto entre comillas se pinta completo; el resultado de un login o acción manda sobre él.
      r("Resultado negativo", String.raw`(?<=\b(?:status|action|result)=")(?:fail(?:ed|ure)?|error|denied?|blocked?|dropped|timeout|reject(?:ed)?)(?=")`, { color: "red", bold: true }),
      r("Error de comando", String.raw`(?<=^\s*)(?:Command fail|Unknown action|command parse error|Value parse error|node_check_object fail)\b.*$`, { color: "red", bold: true }),
      r("Texto", String.raw`"[^"]*"`, { color: "brightYellow" }),
    ],
  },
  {
    id: "aruba",
    name: "Aruba",
    description: "AOS-CX, ArubaOS-Switch y ArubaOS: puertos 1/1/1, lag, VSX, event log",
    rules: [
      // AOS-CX y ArubaOS-Switch "core-cx(config-if)#"; controladora "(Aruba7005) [mynode] (config) #".
      r("Prompt", String.raw`^\([\w.\-]+\)\s*(?:\[[\w\-\/.]+\]\s*)?(?:\([\w\-]+\)\s*)?#|^[\w.\-:]+(?:\([\w\-\/.]+\))?[#>]`, { bold: true }),
      r("Comentario", String.raw`(?<=^\s*)!.*$`, { color: "gray" }),
      r("Error de comando", String.raw`(?<=^\s*)(?:%\s.*|Invalid input.*)$`, { color: "red", bold: true }),
      r("Log crítico", String.raw`\bLOG_(?:EMER|ALERT|CRIT|ERR)\b|^[CE](?= \d{2}\/\d{2}\/\d{2} )`, { color: "red", bold: true }),
      r("Log warning", String.raw`\bLOG_WARN(?:ING)?\b|^W(?= \d{2}\/\d{2}\/\d{2} )`, { color: "yellow", bold: true }),
      r("Descripción", String.raw`\bdescription\s+(.+)$`, { color: "brightYellow", italic: true }, { group: 1 }),
      r("no shutdown", String.raw`\bno shutdown\b`, { color: "green" }),
      r("shutdown", String.raw`(?<=^\s*)shutdown\b`, { color: "red", bold: true }),
      r("Negación", String.raw`(?<=^\s*)no(?=\s)`, { color: "yellow" }),
      r(
        "Sección",
        String.raw`^(?:interface|vlan|router|vsx|vrf|aaa|radius-server|tacacs-server|ntp|logging|snmp-server|spanning-tree|access-list|class|policy|wlan|ap-group|trunk)\b`,
        { color: "brightBlue", bold: true },
      ),
      // AOS-CX miembro/ranura/puerto (1/1/1, sin tomar fechas 10/14/26), lag, vlan, loopback;
      // ArubaOS-Switch Trk y puertos de chasis o stack (A1, 1/A1); controladora GE0/0/0.
      r(
        "Interfaz",
        String.raw`\b\d{1,2}\/\d\/\d{1,3}(?:[.:]\d+)?\b|\b(?:lag|vlan|loopback|tunnel|port-channel)\s?\d+\b|\bmgmt\b|\bTrk\d+\b|\b\d+\/[A-L]\d{1,2}\b|(?<=^\s*)[A-L]\d{1,2}\b|\bGE\d+\/\d+\/\d+\b`,
        { color: "cyan" },
      ),
    ],
  },
  {
    id: "grandstream",
    name: "Grandstream",
    description: "Switches GWN78xx: CLI tipo Cisco con Ethernet 1/0/1 y lag",
    rules: [
      r("Prompt", String.raw`^[\w.\-]+(?:\([\w\-\/.]+\))?[#>]`, { bold: true }),
      r("Comentario", String.raw`(?<=^\s*)!.*$`, { color: "gray" }),
      r("Error de comando", String.raw`(?<=^\s*)%\s?.*$`, { color: "red", bold: true }),
      r("Descripción", String.raw`\bdescription\s+(.+)$`, { color: "brightYellow", italic: true }, { group: 1 }),
      r("no shutdown", String.raw`\bno shutdown\b`, { color: "green" }),
      r("shutdown", String.raw`(?<=^\s*)shutdown\b`, { color: "red", bold: true }),
      r("Negación", String.raw`(?<=^\s*)no(?=\s)`, { color: "yellow" }),
      r(
        "Sección",
        String.raw`^(?:interface|router|ip route|spanning-tree|aaa|radius|tacacs|snmp-server|logging|ntp|username)\b`,
        { color: "brightBlue", bold: true },
      ),
      r(
        "Interfaz",
        String.raw`\b(?:(?:Ethernet|GigabitEthernet|TenGigabitEthernet)\s?\d+\/\d+\/\d+|(?:lag|vlan|VLAN|Loopback)\s?\d+)\b`,
        { color: "cyan" },
      ),
    ],
  },
  {
    id: "checkpoint",
    name: "Check Point",
    description: "Gaia clish y expert: prompt, interfaces eth1-01/bond, estados de ClusterXL",
    rules: [
      r("Prompt", String.raw`^\[Expert@[\w.\-]+(?::\d+)?\]#|^[\w.\-]+:\d+>`, { bold: true }),
      // ClusterXL: "ACTIVE(!)" o "Active Attention" es un miembro activo con problemas.
      r("Cluster con problema", String.raw`\bACTIVE\(!\S*\)|\bActive Attention\b|\bDOWN\b|\bLost\b`, { color: "red", bold: true, underline: true }),
      r("Cluster activo", String.raw`\bACTIVE\b|\bActive\b`, { color: "green", bold: true }),
      r("Cluster en espera", String.raw`\b(?:STANDBY|Standby|BACKUP|Backup|READY|Ready)\b`, { color: "yellow" }),
      r("Interfaz", String.raw`\b(?:eth\d+(?:-\d+)?|bond\d+|wrp\d+|Mgmt|Sync)(?:\.\d+)?\b`, { color: "cyan" }),
    ],
  },
  {
    id: "common",
    name: "Común",
    description: "IPv4/IPv6, MAC, estados up/down, permit/deny y contadores de error",
    rules: [
      r("Contadores de error > 0", ERR_COUNTERS, { color: "red", bold: true }, { ignoreCase: true }),
      // BGP: en el resumen de vecinos (línea que empieza con la IP del vecino), "Active", "Idle" o
      // "Connect" en la columna de estado significan sesión NO establecida. Fuera de esa línea
      // "Active" es normal (HSRP, VRRP), por eso no va en los estados generales.
      r("Vecino BGP sin establecer", String.raw`(?<=^\s*(?:\d{1,3}\.){3}\d{1,3}\s+\d.*\s)(?:Active|Idle(?: \((?:Admin|PfxCt)\))?|Connect)\s*$`, { color: "red", bold: true }),
      r("Estado crítico", IF_STATE_BAD, { color: "red", bold: true }, { ignoreCase: true }),
      r("Estado transitorio", IF_STATE_WARN, { color: "yellow" }, { ignoreCase: true }),
      r("Estado OK", IF_STATE_OK, { color: "green" }, { ignoreCase: true }),
      r("MAC", MAC, { color: "brightMagenta" }, { ignoreCase: true }),
      r("IPv4", IPV4, { color: "magenta" }),
      r("IPv6", IPV6, { color: "magenta" }, { ignoreCase: true }),
    ],
  },
];

export const vendorSchemes = schemes.filter((s) => s.id !== "common");

/** Esquema de resaltado para un fabricante del catálogo (la familia Fortinet comparte uno). */
export function schemeForVendor(vendor: string): string | undefined {
  if (/^forti/.test(vendor)) return "fortinet";
  return schemes.some((s) => s.id === vendor && s.id !== "common") ? vendor : undefined;
}

// ---------- Motor ----------

export interface Compiled {
  re: RegExp;
  style: HlStyle;
  group: number;
  on: string;
  off: string;
  /** Regla del usuario o importada (no integrada): tope de línea propio y presupuesto de tiempo. */
  user?: boolean;
  /** Nombre para el aviso si se desactiva por lenta. */
  name?: string;
  /** Identidad del patrón (opciones + texto) para recordar en la sesión que se desactivó. */
  key?: string;
  /** Excesos de tiempo seguidos. */
  strikes?: number;
  /** Desactivada por lenta en esta sesión. */
  dead?: boolean;
}

function sgrColor(value: string, bg: boolean): string | null {
  const named = ANSI_FG[value];
  if (named !== undefined) return String(bg ? named + 10 : named);
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value);
  if (!m) return null;
  return `${bg ? 48 : 38};2;${parseInt(m[1], 16)};${parseInt(m[2], 16)};${parseInt(m[3], 16)}`;
}

/** Con tema, los nombres ANSI salen como color real ya ajustado (ver hlPalette.ts). */
function sgr(style: HlStyle, theme?: ITheme): { on: string; off: string } {
  const on: string[] = [];
  const off: string[] = [];
  if (style.bold) on.push("1"), off.push("22");
  if (style.italic) on.push("3"), off.push("23");
  if (style.underline) on.push("4"), off.push("24");
  const fg = style.color && sgrColor((theme && themedColor(style.color, theme)) || style.color, false);
  if (fg) on.push(fg), off.push("39");
  const bg = style.bg && sgrColor((theme && baseColor(theme, style.bg)) || style.bg, true);
  if (bg) on.push(bg), off.push("49");
  return { on: `\x1b[${on.join(";")}m`, off: `\x1b[${off.join(";")}m` };
}

/** Largo máximo de un patrón propio o importado. */
export const MAX_PATTERN = 500;

/**
 * Patrón que puede congelar la interfaz por retroceso catastrófico (ReDoS): repeticiones anidadas o
 * alternativas solapadas dentro de un grupo repetido ((a+)+, (a|aa)+), repeticiones sin tope seguidas
 * que pueden tomar el mismo texto (a*a*b, .*a.*b, (.*a){3}b) y referencias dentro de una repetición.
 * Ver regexSafety.ts. Se aplica a toda regla propia o importada; las integradas ya están auditadas.
 * `ignoreCase`: la regla no distingue mayúsculas (sin el dato, se asume que sí: es lo conservador).
 * Devuelve el mensaje para el usuario o null.
 */
export function riskyRegex(pattern: string, ignoreCase = true): string | null {
  if (pattern.length > MAX_PATTERN) return `Patrón demasiado largo (máx. ${MAX_PATTERN} caracteres)`;
  try {
    new RegExp(pattern, "gmd");
  } catch {
    return null; // regexError lo informa
  }
  return redosRisk(pattern, ignoreCase);
}

/** Valida un patrón; devuelve el mensaje de error o null. */
export function regexError(pattern: string): string | null {
  if (!pattern) return "Patrón vacío";
  try {
    new RegExp(pattern, "gmd");
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

// ---------- Presupuesto de tiempo de las reglas del usuario ----------

/**
 * Largo máximo de línea que examinan las reglas del usuario (las integradas, auditadas, usan MAX_LINE).
 * Con 400 caracteres, un patrón polinomial de grado 2 que escapara al validador tarda ~20 ms por línea.
 */
export const USER_MAX_LINE = 400;
/** Tiempo de una regla del usuario en una línea que la desactiva de inmediato. */
export const SLOW_LINE_MS = 20;
/** Exceso menor: tres seguidos también la desactivan. */
export const SLOW_STRIKE_MS = 5;
export const SLOW_STRIKES = 3;

/** Patrones desactivados por lentos en esta sesión de la app (clave → nombre). */
const slowRules = new Map<string, string>();
const slowListeners = new Set<(name: string) => void>();

/** Avisa cuando una regla o un resaltado se desactiva por lento. Devuelve la función para dejar de escuchar. */
export function onSlowRule(fn: (name: string) => void): () => void {
  slowListeners.add(fn);
  return () => slowListeners.delete(fn);
}

/** Marca un patrón como lento para el resto de la sesión y avisa (una vez por patrón). */
export function disableSlowRule(key: string, name: string) {
  if (slowRules.has(key)) return;
  slowRules.set(key, name);
  for (const fn of slowListeners) {
    try {
      fn(name);
    } catch {
      /* un oyente con error no corta a los demás */
    }
  }
}

export const isSlowRule = (key: string) => slowRules.has(key);

/** Opciones con que se compila una regla y su clave de sesión (la que usa isSlowRule). */
const ruleFlags = (rule: HlRule) => `gm${rule.group ? "d" : ""}${rule.ignoreCase ? "i" : ""}`;
export const ruleKey = (rule: HlRule) => `${ruleFlags(rule)}/${rule.pattern}`;

/** Tiempo de una ejecución de regla del usuario: la desactiva si se pasó del presupuesto. */
function chargeTime(rule: Compiled, ms: number) {
  if (ms > SLOW_LINE_MS) rule.strikes = SLOW_STRIKES;
  else if (ms > SLOW_STRIKE_MS) rule.strikes = (rule.strikes ?? 0) + 1;
  else rule.strikes = 0;
  if (rule.strikes >= SLOW_STRIKES) {
    rule.dead = true;
    disableSlowRule(rule.key ?? rule.re.source, rule.name ?? rule.re.source);
  }
}

/** `theme`: tema de terminal activo; sin él los colores con nombre salen como ANSI y el terminal los resuelve. */
export function compile(rules: HlRule[], theme?: ITheme): Compiled[] {
  const out: Compiled[] = [];
  for (const rule of rules) {
    if (rule.enabled === false || typeof rule.pattern !== "string" || regexError(rule.pattern)) continue;
    const user = !BUILTIN.has(rule);
    const flags = ruleFlags(rule);
    const key = ruleKey(rule);
    if (user && (riskyRegex(rule.pattern, !!rule.ignoreCase) || slowRules.has(key))) continue;
    const { on, off } = sgr(rule.style ?? {}, theme);
    if (on === "\x1b[m") continue;
    out.push({
      // El flag "d" (índices de grupos) es caro en V8: solo para reglas que pintan un grupo.
      re: new RegExp(rule.pattern, flags),
      style: rule.style,
      group: rule.group ?? 0,
      on,
      off,
      ...(user ? { user, name: rule.name || rule.pattern, key, strikes: 0 } : {}),
    });
  }
  return out;
}

/**
 * Asigna a cada carácter la primera regla que lo cubre (las reglas anteriores tienen
 * prioridad) y devuelve tramos [inicio, fin, índiceRegla]. Las reglas del usuario solo miran
 * líneas de hasta USER_MAX_LINE caracteres y se cronometran: la que se pasa del presupuesto
 * deja de evaluarse en esa línea y, si es reiterado, en el resto de la sesión (con aviso).
 */
export function runs(line: string, rules: Compiled[]): [number, number, number][] {
  if (!line || !rules.length) return [];
  const owner = new Int16Array(line.length).fill(-1);
  rules.forEach((rule, i) => {
    if (rule.user) {
      if (rule.dead || line.length > USER_MAX_LINE) return;
      if (rule.key && slowRules.has(rule.key)) {
        rule.dead = true;
        return;
      }
    }
    const t0 = rule.user ? performance.now() : 0;
    rule.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    let guard = 0;
    while ((m = rule.re.exec(line)) && guard++ < 1000) {
      if (m[0] === "") {
        rule.re.lastIndex++;
      } else {
        const span = rule.group ? m.indices?.[rule.group] : [m.index, m.index + m[0].length];
        if (span) for (let k = span[0]; k < span[1]; k++) if (owner[k] === -1) owner[k] = i;
      }
      if (rule.user && performance.now() - t0 > SLOW_LINE_MS) break;
    }
    if (rule.user) chargeTime(rule, performance.now() - t0);
  });
  const out: [number, number, number][] = [];
  let start = 0;
  for (let k = 1; k <= line.length; k++) {
    if (k === line.length || owner[k] !== owner[start]) {
      if (owner[start] !== -1) out.push([start, k, owner[start]]);
      start = k;
    }
  }
  return out;
}

function highlightLine(line: string, rules: Compiled[]): string {
  // Líneas que ya traen secuencias de escape (prompts de shell con color, edición de
  // línea, apps de pantalla completa) se dejan intactas para no romperlas.
  if (line.includes("\x1b")) return line;
  // Líneas enormes (configs en una línea, dumps) cuestan más de lo que aporta pintarlas.
  if (line.length > MAX_LINE) return line;
  // El salto final queda fuera para que ^/$ funcionen igual que en el texto visible.
  const body = line.replace(/\r?\n$/, "");
  const tail = line.slice(body.length);
  const spans = runs(body, rules);
  if (!spans.length) return line;
  let out = "";
  let pos = 0;
  for (const [s, e, i] of spans) {
    out += body.slice(pos, s) + rules[i].on + body.slice(s, e) + rules[i].off;
    pos = e;
  }
  return out + body.slice(pos) + tail;
}

/**
 * `continued`: el texto empieza a mitad de una línea ya escrita (se escribió un trozo sin
 * salto). Ese primer tramo se deja sin resaltar: las reglas con ^ lo tomarían por inicio de
 * línea ("line." al final de una frase pintado como sección).
 */
export function highlightText(text: string, rules: Compiled[], continued = false): string {
  if (!rules.length) return text;
  return text
    .split(/(?<=\n)/)
    .map((l, i) => (i === 0 && continued ? l : highlightLine(l, rules)))
    .join("");
}

/** Largo máximo de línea que se resalta. */
const MAX_LINE = 1000;

/** Máximo de texto sin salto de línea que se retiene esperando el resto. */
const MAX_PENDING = 4096;

/**
 * Ráfagas: el backend junta hasta 256 KB por entrega y resaltarlos de una vez era una tarea de
 * decenas de ms (cientos en equipos lentos). Se resalta por tramos de líneas completas de hasta
 * `SLICE` caracteres y, pasado `BUDGET` ms, lo que queda sigue en otra tarea: la interfaz responde
 * entre tramos. El orden de salida no cambia (lo nuevo espera detrás de lo pendiente).
 */
const SLICE = 32 * 1024;
const BUDGET = 8;

/**
 * Procesa el flujo por líneas completas. Una línea incompleta (prompt, eco de teclas)
 * espera unos milisegundos por si llega el resto, y luego se escribe igual.
 */
export class StreamHighlighter {
  private pending = "";
  /** Lo último escrito no terminó en salto de línea. */
  private midLine = false;
  private timer: number | undefined;
  /** Continuación programada de una ráfaga a medio resaltar. */
  private later: number | undefined;
  private write: (s: string) => void;
  private rules: () => Compiled[];
  private bypass: () => boolean;

  constructor(write: (s: string) => void, rules: () => Compiled[], bypass: () => boolean) {
    this.write = write;
    this.rules = rules;
    this.bypass = bypass;
  }

  push(text: string) {
    const rules = this.rules();
    if (!rules.length || this.bypass()) {
      this.flush();
      this.outRaw(text);
      return;
    }
    // Eco de teclas y redibujo de línea (\b, \x1b[K): sin espera para que escribir se sienta
    // inmediato. Si había un prompt retenido, sale primero para conservar el orden.
    if (!text.includes("\n") && (text.length <= 4 || text.includes("\x1b"))) {
      this.flush();
      this.out(text);
      return;
    }
    this.pending += text;
    // Con una ráfaga a medio resaltar, lo nuevo espera su turno en la continuación ya programada.
    if (this.later !== undefined) return;
    this.drain();
  }

  /** Resalta las líneas completas pendientes por tramos; si se acaba el tiempo, sigue en otra tarea. */
  private drain() {
    this.later = undefined;
    const rules = this.rules();
    const t0 = performance.now();
    for (;;) {
      const cut = this.pending.lastIndexOf("\n");
      if (cut < 0) break;
      // Hasta el último salto dentro del tramo (o el primero después, si la línea es más larga).
      let end = cut + 1;
      if (end > SLICE) {
        const inSlice = this.pending.lastIndexOf("\n", SLICE);
        end = (inSlice >= 0 ? inSlice : this.pending.indexOf("\n", SLICE)) + 1;
      }
      this.out(highlightText(this.pending.slice(0, end), rules, this.midLine));
      this.pending = this.pending.slice(end);
      if (this.pending.includes("\n") && performance.now() - t0 >= BUDGET) {
        this.later = window.setTimeout(() => this.drain(), 0);
        return;
      }
    }
    // Salida continua sin saltos de línea (barras de progreso, líneas enormes): no se
    // retiene indefinidamente ni se acumula a costo cuadrático. El plazo es fijo desde
    // que empezó a retenerse (no se reinicia con cada trozo).
    if (this.pending.length > MAX_PENDING) this.flush();
    else if (!this.pending) {
      window.clearTimeout(this.timer);
      this.timer = undefined;
    } else if (this.timer === undefined) this.timer = window.setTimeout(() => this.flush(), 12);
  }

  flush() {
    window.clearTimeout(this.timer);
    this.timer = undefined;
    window.clearTimeout(this.later);
    this.later = undefined;
    if (!this.pending) return;
    const text = this.pending;
    this.pending = "";
    this.out(highlightText(text, this.rules(), this.midLine));
  }

  private out(text: string) {
    if (!text) return;
    this.midLine = !text.endsWith("\n");
    this.write(text);
  }

  /**
   * Sin resaltado, una ráfaga iría entera: xterm revisa el reloj solo entre escrituras, así que se le
   * entrega en trozos para que ceda entre ellos (su parser conserva el estado de un trozo al otro).
   */
  private outRaw(text: string) {
    if (text.length <= SLICE) return this.out(text);
    for (let i = 0; i < text.length; i += SLICE) this.out(text.slice(i, i + SLICE));
  }

  dispose() {
    window.clearTimeout(this.timer);
    window.clearTimeout(this.later);
  }
}

/** Reglas efectivas: personalizadas > fabricante > comunes. */
export function effectiveRules(
  opts: { enabled: boolean; schemes: string[]; custom: HlRule[] },
  sessionProfile?: string,
): HlRule[] {
  if (!opts.enabled || sessionProfile === "off") return [];
  const ids =
    sessionProfile && sessionProfile !== "default" ? [sessionProfile, "common"] : opts.schemes;
  const chosen = schemes.filter((s) => s.id !== "common" && ids.includes(s.id));
  const common = ids.includes("common") ? schemes.filter((s) => s.id === "common") : [];
  return [...opts.custom, ...chosen.flatMap((s) => s.rules), ...common.flatMap((s) => s.rules)];
}

/** Color CSS de un estilo según el tema, para la vista previa. */
export function cssColor(value: string | undefined, theme: ITheme, isBg = false): string | undefined {
  if (!value) return undefined;
  if (value.startsWith("#")) return value;
  const themed = isBg ? baseColor(theme, value) : themedColor(value, theme);
  if (themed) return themed;
  const key = value === "gray" ? "brightBlack" : value;
  return (theme as Record<string, string | undefined>)[key];
}
