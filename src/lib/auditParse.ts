/**
 * Auditoría de configuración: árbol de la configuración por familia de fabricante, detección del
 * fabricante y enmascarado de secretos para la evidencia.
 *
 * El árbol es {line, children, lineNo}: `line` es la línea sin la indentación (y en Cisco con las
 * abreviaturas habituales expandidas), `raw` la original y `lineNo` su número (desde 1) en el texto.
 * - Cisco IOS/IOS-XE (y Arista, que comparte el estilo): bloques por indentación; "!" es separador o
 *   comentario y no entra al árbol. El cuerpo de un banner va en `text` y no como hijos, para que su
 *   contenido nunca calce con una regla.
 * - FortiOS: config/edit/next/end con anidamiento real; un valor entre comillas que sigue en otra
 *   línea (certificados, mensajes) se junta en un solo nodo. Las envolturas "config global" y
 *   "config vdom / edit <vdom>" se aplanan para que las reglas vean los bloques en la raíz.
 * - Huawei/H3C: indentación con "#" como separador. Junos (display set): líneas planas.
 *
 * Todo es local y puro: no hay red, ni eval, ni regex armadas con texto del usuario.
 */

export type AuditVendor = "cisco" | "fortinet" | "huawei" | "juniper" | "arista";

/** Fabricantes que puede declarar una regla (los que tienen parser). */
export const AUDIT_VENDORS: readonly AuditVendor[] = ["cisco", "fortinet", "huawei", "juniper", "arista"];

export const VENDOR_LABEL: Record<AuditVendor, string> = {
  cisco: "Cisco IOS / IOS-XE",
  fortinet: "FortiOS",
  huawei: "Huawei VRP",
  juniper: "Juniper Junos (set)",
  arista: "Arista EOS",
};

export interface ConfigNode {
  /** Línea sin indentación (Cisco: abreviaturas expandidas). Multilínea en FortiOS si el valor sigue entre comillas. */
  line: string;
  /** Línea tal como venía (con indentación). */
  raw: string;
  /** Número de línea en el texto, desde 1. */
  lineNo: number;
  children: ConfigNode[];
  /** FortiOS: nombre del "edit" sin comillas. */
  name?: string;
  /** FortiOS: VDOM de origen cuando la config trae varias. */
  vdom?: string;
  /** Cisco: cuerpo del banner (no se evalúa). */
  text?: string;
  /** Comentario conservado (solo al parsear planes con keepComments). */
  comment?: boolean;
  /** FortiOS con VDOM: bloque de la raíz que venía de "config global" ("global") o de una VDOM ("vdom:<nombre>"). */
  ctx?: string;
}

export interface ParseOptions {
  /** Conserva las líneas de comentario como nodos (para los planes de remediación). */
  keepComments?: boolean;
  /** FortiOS: aplana "config global" y "config vdom" (por defecto sí; los planes no lo usan). */
  flatten?: boolean;
}

/** Una configuración más grande que esto no se audita (20 MB, el mismo tope que los respaldos). */
export const MAX_CONFIG_BYTES = 20 * 1024 * 1024;

const splitLines = (text: string) => text.replace(/\r\n?/g, "\n").split("\n");

// ---------- Cisco IOS / IOS-XE ----------

/**
 * Abreviaturas habituales de IOS que importan a las reglas: primera palabra (tras un "no" opcional) y,
 * para algunas, la segunda. Una abreviatura se expande solo si es prefijo (de 3 o más letras) de una
 * única palabra de la lista; la running-config siempre trae la forma completa, esto cubre texto pegado.
 */
const IOS_FIRST = [
  "interface",
  "service",
  "username",
  "logging",
  "transport",
  "exec-timeout",
  "access-class",
  "hostname",
  "banner",
  "snmp-server",
  "description",
  "shutdown",
  "archive",
  "password",
];
const IOS_SECOND: Record<string, string[]> = {
  transport: ["input", "output"],
  service: ["password-encryption", "timestamps", "tcp-small-servers", "udp-small-servers"],
  logging: ["host", "trap", "buffered", "source-interface"],
};
/** Tipos de interfaz abreviados (Gi0/1 → GigabitEthernet0/1). */
const IOS_IFTYPES: [RegExp, string][] = [
  [/^(gi|gig|giga|gigabit)(?=\d)/i, "GigabitEthernet"],
  [/^(te|ten|tengig)(?=\d)/i, "TenGigabitEthernet"],
  [/^(fa|fas|fast)(?=\d)/i, "FastEthernet"],
  [/^(lo|loop)(?=\d)/i, "Loopback"],
  [/^(vl|vla)(?=\d)/i, "Vlan"],
  [/^(po|port)(?=\d)/i, "Port-channel"],
  [/^(tu|tun)(?=\d)/i, "Tunnel"],
];

function expand(word: string, list: readonly string[]): string {
  const w = word.toLowerCase();
  if (w.length < 3 || list.includes(w)) return word;
  const hits = list.filter((k) => k.startsWith(w));
  return hits.length === 1 ? hits[0] : word;
}

/** Expande las abreviaturas de IOS que usan las reglas ("int gi0/1" → "interface GigabitEthernet0/1"). */
export function normalizeIos(line: string): string {
  const parts = line.trim().split(/\s+/);
  if (!parts[0]) return "";
  let i = parts[0].toLowerCase() === "no" ? 1 : 0;
  if (i >= parts.length) return parts.join(" ");
  parts[i] = expand(parts[i], IOS_FIRST);
  const first = parts[i].toLowerCase();
  const second = IOS_SECOND[first];
  if (second && parts[i + 1]) parts[i + 1] = expand(parts[i + 1], second);
  if (first === "interface" && parts[i + 1]) {
    for (const [re, full] of IOS_IFTYPES) {
      if (re.test(parts[i + 1])) {
        parts[i + 1] = parts[i + 1].replace(re, full);
        break;
      }
    }
  }
  return parts.join(" ");
}

const CISCO_NOISE = /^(building configuration|current configuration\s*:|last configuration change|nvram config last updated|end$)/i;
const BANNER = /^banner\s+(\S+)\s+(\^C|\S)(.*)$/;

const indentOf = (s: string) => s.length - s.trimStart().length;

/** Árbol por indentación. `sep`: líneas separadoras/comentario ("!" en Cisco, "#" en Huawei). */
function parseIndented(text: string, sep: RegExp, cisco: boolean, opts: ParseOptions): ConfigNode[] {
  const roots: ConfigNode[] = [];
  const stack: { indent: number; node: ConfigNode }[] = [];
  const lines = splitLines(text);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].replace(/\s+$/, "");
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const indent = indentOf(raw);
    if (sep.test(trimmed)) {
      if (opts.keepComments) {
        while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
        const c: ConfigNode = { line: trimmed, raw, lineNo: i + 1, children: [], comment: true };
        (stack.length ? stack[stack.length - 1].node.children : roots).push(c);
      }
      continue;
    }
    if (cisco && indent === 0 && CISCO_NOISE.test(trimmed)) continue;
    const node: ConfigNode = { line: cisco ? normalizeIos(trimmed) : trimmed.replace(/\s+/g, " "), raw, lineNo: i + 1, children: [] };
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    (stack.length ? stack[stack.length - 1].node.children : roots).push(node);
    stack.push({ indent, node });
    // Banner: el cuerpo llega hasta el delimitador de cierre y no se interpreta.
    const b = cisco ? BANNER.exec(trimmed) : null;
    if (b) {
      const delim = b[2];
      const rest = b[3];
      const body: string[] = [];
      if (rest.includes(delim)) {
        body.push(rest.slice(0, rest.indexOf(delim)));
      } else {
        body.push(rest);
        for (i++; i < lines.length; i++) {
          const l = lines[i];
          const at = l.indexOf(delim);
          if (at >= 0) {
            body.push(l.slice(0, at));
            break;
          }
          body.push(l);
        }
      }
      node.text = body.join("\n").trim();
      node.line = `banner ${b[1]}`;
      stack.pop();
    }
  }
  return roots;
}

// ---------- FortiOS ----------

/** Cantidad de comillas dobles sin escapar (para saber si el valor sigue en otra línea). */
function openQuote(s: string): boolean {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\") i++;
    else if (s[i] === '"') n++;
  }
  return n % 2 === 1;
}

/** Palabras de una línea de FortiOS: separa por espacios y quita las comillas ("a b" queda como una). */
export function fortiTokens(line: string): string[] {
  const out: string[] = [];
  const re = /"((?:[^"\\]|\\.)*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) out.push(m[1] !== undefined ? m[1].replace(/\\(.)/g, "$1") : m[2]);
  return out;
}

function parseForti(text: string, opts: ParseOptions): ConfigNode[] {
  const roots: ConfigNode[] = [];
  // Pila de contenedores abiertos: "config" o "edit".
  const stack: ConfigNode[] = [];
  const lines = splitLines(text);
  const add = (n: ConfigNode) => (stack.length ? stack[stack.length - 1].children : roots).push(n);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].replace(/\s+$/, "");
    let line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#")) {
      if (opts.keepComments) add({ line, raw, lineNo: i + 1, children: [], comment: true });
      continue;
    }
    const lineNo = i + 1;
    // Valor entre comillas que continúa en las líneas siguientes.
    if (openQuote(line)) {
      const parts = [line];
      while (i + 1 < lines.length) {
        i++;
        parts.push(lines[i].replace(/\s+$/, ""));
        if (openQuote(parts.join("\n"))) continue;
        break;
      }
      line = parts.join("\n");
    }
    const word = line.split(/\s+/, 1)[0].toLowerCase();
    if (word === "end") {
      // Cierra el "config" abierto (y un "edit" que quedara sin "next").
      while (stack.length && !/^config\s/i.test(stack[stack.length - 1].line)) stack.pop();
      stack.pop();
      continue;
    }
    if (word === "next") {
      if (stack.length && /^edit\s/i.test(stack[stack.length - 1].line)) stack.pop();
      continue;
    }
    if (word === "edit" && stack.length && /^edit\s/i.test(stack[stack.length - 1].line)) stack.pop();
    const node: ConfigNode = { line: line.replace(/[ \t]+/g, " "), raw, lineNo, children: [] };
    if (word === "edit") node.name = fortiTokens(line)[1] ?? "";
    add(node);
    if (word === "config" || word === "edit") stack.push(node);
  }
  return opts.flatten === false ? roots : flattenVdoms(roots);
}

/** "config global" y "config vdom / edit X" pasan sus bloques a la raíz (con la VDOM anotada). */
function flattenVdoms(roots: ConfigNode[]): ConfigNode[] {
  const out: ConfigNode[] = [];
  const tag = (n: ConfigNode, vdom: string) => {
    n.vdom = vdom;
    n.children.forEach((c) => tag(c, vdom));
  };
  for (const n of roots) {
    const l = n.line.toLowerCase();
    if (l === "config global") {
      for (const c of n.children) c.ctx = "global";
      out.push(...n.children);
    } else if (l === "config vdom") {
      for (const e of n.children) {
        if (!e.children.length) continue;
        for (const c of e.children) {
          tag(c, e.name ?? "");
          c.ctx = `vdom:${e.name ?? ""}`;
        }
        out.push(...e.children);
      }
    } else out.push(n);
  }
  return out;
}

// ---------- API ----------

/** Árbol de la configuración según el fabricante. */
export function parseConfig(text: string, vendor: AuditVendor, opts: ParseOptions = {}): ConfigNode[] {
  switch (vendor) {
    case "fortinet":
      return parseForti(text, opts);
    case "huawei":
      return parseIndented(text, /^#/, false, opts);
    case "juniper":
      return parseIndented(text, /^#/, false, opts);
    default:
      return parseIndented(text, /^!/, true, opts);
  }
}

/** Todos los nodos (en orden de aparición). */
export function walk(nodes: ConfigNode[], out: ConfigNode[] = []): ConfigNode[] {
  for (const n of nodes) {
    out.push(n);
    walk(n.children, out);
  }
  return out;
}

export interface VendorGuess {
  vendor: AuditVendor | null;
  /** Plataforma sugerida (ios, ios-xe, fortios). */
  platform?: string;
  /** Versión leída de la config, si aparece. */
  version?: string;
  /** Por qué se eligió (para mostrar al usuario). */
  reason: string;
}

/** Fabricante por heurística: cuenta señales típicas de cada sintaxis. El usuario puede corregirlo. */
export function detectVendor(text: string): VendorGuess {
  const sample = text.length > 400_000 ? text.slice(0, 400_000) : text;
  const count = (re: RegExp) => (sample.match(re) ?? []).length;
  const forti = count(/^\s*config (system|firewall|vpn|router|log|user|webfilter|antivirus) /gm) * 3 + count(/^#config-version=/gm) * 10 + (count(/^\s*edit \S/gm) && count(/^\s*set \S/gm) ? 2 : 0);
  const cisco =
    count(/^(hostname|interface|line (vty|con)|version \d|service (timestamps|password-encryption)|ip (route|ssh|http|domain)|aaa |snmp-server |enable secret)\b/gm) * 2 +
    count(/^!\s*$/gm);
  const huawei = count(/^\s*sysname /gm) * 5 + count(/^#\s*$/gm) + count(/^return\s*$/gm) * 3;
  const juniper = count(/^set (system|interfaces|protocols|routing-options|security|snmp) /gm) * 2;
  const scores: [AuditVendor, number][] = [
    ["fortinet", forti],
    ["cisco", cisco],
    ["huawei", huawei],
    ["juniper", juniper],
  ];
  scores.sort((a, b) => b[1] - a[1]);
  const [best, score] = scores[0];
  if (!score) return { vendor: null, reason: "No se reconoce la sintaxis: elige el fabricante a mano" };
  if (best === "fortinet") {
    const v = /^#config-version=([A-Z0-9]+)-(\d+\.\d+\.\d+)/m.exec(sample);
    return { vendor: best, platform: "fortios", version: v?.[2], reason: v ? `Cabecera #config-version (${v[1]})` : "Bloques config/edit/set de FortiOS" };
  }
  if (best === "cisco") {
    const v = /^version (\d+)\.(\d+)/m.exec(sample);
    // IOS-XE numera desde 16.x; IOS clásico llega hasta 15.x.
    const platform = v ? (Number(v[1]) >= 16 ? "ios-xe" : "ios") : undefined;
    return { vendor: best, platform, version: v ? `${v[1]}.${v[2]}` : undefined, reason: v ? `Línea "version ${v[1]}.${v[2]}" de IOS` : "Bloques por indentación con separador \"!\"" };
  }
  if (best === "huawei") return { vendor: best, platform: "vrp", reason: "Línea sysname y separadores \"#\"" };
  return { vendor: best, platform: "junos", reason: "Líneas \"set\" de Junos" };
}

// ---------- Enmascarado de secretos (misma lógica que mask_line de backups.rs) ----------

const SECRET_WORDS = new Set([
  "password",
  "passwd",
  "secret",
  "community",
  "key-string",
  "psksecret",
  "pre-shared-key",
  "authentication-key",
  "message-digest-key",
  "encrypted-password",
  "auth-password",
  "priv-password",
  "passphrase",
  "shared-secret",
  "ascii-text",
  "hexadecimal",
  "cipher",
  "irreversible-cipher",
]);
const TYPE_TOKENS = new Set(["enc", "cipher", "irreversible-cipher", "simple", "plain", "encrypted", "ascii-text", "hexadecimal", "md5", "sha", "sha1", "sha256", "hidden"]);
const isTypeToken = (t: string) => (t.length <= 3 && /^\d+$/.test(t)) || TYPE_TOKENS.has(t.toLowerCase());
const fortiSetSecret = (t: string) => ["password", "passwd", "pwd", "secret", "key", "passphrase"].some((s) => t.endsWith(s));
const URL_CRED = /\b((?:s?ftp|scp|https?|tftp):\/\/)([^\s/:@[\]]+):([^\s/]+)@/gi;
/** Un valor que ya está enmascarado o que es una variable de plantilla ({{x}}) no se toca. */
const KEEP_VALUE = /^(\*{4}|\{\{[\w.-]+\}\})[;"]?$/;

/**
 * Reemplaza por **** los valores secretos de una línea y conserva la estructura (palabra clave, tipo y
 * lo que sigue al valor). Es la misma regla que `mask_line` de src-tauri/src/backups.rs, para que la
 * evidencia de una config pegada sin enmascarar quede igual que la de un respaldo enmascarado.
 */
export function maskLine(line: string): string {
  const parts: [boolean, string][] = [];
  for (const c of line) {
    const ws = /\s/.test(c);
    const last = parts[parts.length - 1];
    if (last && last[0] === ws) last[1] += c;
    else parts.push([ws, c]);
  }
  for (const p of parts) if (!p[0] && p[1].includes("://")) p[1] = p[1].replace(URL_CRED, "$1$2:****@");
  const words = parts.map((p, i) => (p[0] ? -1 : i)).filter((i) => i >= 0);
  if (!words.length) return line;
  const first = parts[words[0]][1].toLowerCase();
  let k = 0;
  while (k < words.length) {
    const tok = parts[words[k]][1].toLowerCase().replace(/;+$/, "");
    const prev = k > 0 ? parts[words[k - 1]][1].toLowerCase() : "";
    const trigger =
      SECRET_WORDS.has(tok) ||
      (tok === "key" &&
        (prev === "isakmp" ||
          first.startsWith("tacacs") ||
          first.startsWith("radius") ||
          first === "server" ||
          (k === 0 && words.length >= 3 && /^\d+$/.test(parts[words[1]][1])))) ||
      (k === 1 && first === "set" && fortiSetSecret(tok));
    if (!trigger) {
      k++;
      continue;
    }
    let j = k + 1;
    if (tok === "community") {
      while (j < words.length && ["read", "write", "cipher", "simple"].includes(parts[words[j]][1].toLowerCase())) j++;
    } else {
      while (j < words.length && isTypeToken(parts[words[j]][1])) j++;
      if (j === words.length && j > k + 1) j--;
    }
    if (j >= words.length) break;
    const start = words[j];
    let end = start;
    const firstVal = parts[start][1];
    if (firstVal.startsWith('"') && !(firstVal.length > 1 && firstVal.replace(/;+$/, "").endsWith('"'))) {
      let m = j + 1;
      while (m < words.length) {
        end = words[m];
        if (parts[words[m]][1].replace(/;+$/, "").endsWith('"')) break;
        m++;
      }
      j = m;
    }
    const value = parts
      .slice(start, end + 1)
      .map((p) => p[1])
      .join("");
    if (!KEEP_VALUE.test(value.replace(/^"|"$/g, "")) && !KEEP_VALUE.test(value)) {
      const tail = parts[end][1].endsWith(";") ? ";" : "";
      parts[start][1] = `****${tail}`;
      for (let x = start + 1; x <= end; x++) parts[x][1] = "";
    }
    k = j + 1;
  }
  return parts.map((p) => p[1]).join("");
}

/** Enmascara un texto de varias líneas. */
export const maskText = (text: string) => splitLines(text).map(maskLine).join("\n");
