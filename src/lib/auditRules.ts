/**
 * Reglas de auditoría: formato "netterminal-rules" (formatVersion 1), validación al importar y capas
 * (integrada < importada < usuario) con overrides y excepciones (waivers).
 *
 * Las reglas son datos, no código: no hay eval y cada regex pasa por el validador anti-ReDoS
 * (riskyRegex de highlight.ts, que usa redosRisk de regexSafety.ts) antes de compilarse.
 *
 * Plantillas de remediación y rollback (una línea por comando, por fabricante):
 * - Variables: {{block}} (cabecera del bloque evaluado), {{child}} (cabecera del hijo, p. ej. `edit "wan1"`),
 *   {{name}} (primer grupo de la regex del ámbito o nombre del "edit"), {{current}} y {{current.x}} (valores
 *   capturados con `capture`), {{computed}} (resultado de `compute`), {{line}} (dentro de @each) y
 *   {{<parámetro>}}. Un parámetro secreto nunca se reemplaza: queda como variable {{x}} para que CLI Lab
 *   lo pida en un campo oculto.
 * - Prefijos (se pueden encadenar): `?fail:<id>:` solo si falló la condición <id>; `?current:` / `?!current:`
 *   (o `?current.x:`) si hay o no valor capturado; `?param:<nombre>:` si el parámetro tiene valor;
 *   `@each:<id>:` repite la línea por cada línea que hizo fallar la condición <id> ({{line}}).
 * - En Cisco, una línea que empieza con espacio va dentro del bloque anterior. En FortiOS el anidamiento
 *   sale de config/edit/next/end. Las líneas con "!" (Cisco) o "#" (FortiOS) son comentarios.
 */
import { riskyRegex } from "./highlight";
import { isSecretVar } from "./templateSecrets";
import { AUDIT_VENDORS, type AuditVendor } from "./auditParse";
import { sha256Hex } from "./sha256";

export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type Status = "pass" | "fail" | "review" | "n/a" | "waived";
export type Layer = "builtin" | "imported" | "user";
export type FixKind = "auto" | "guided" | "manual";

export const SEVERITIES: readonly Severity[] = ["critical", "high", "medium", "low", "info"];
/** Pesos visibles del puntaje. */
export const SEVERITY_WEIGHT: Record<Severity, number> = { critical: 10, high: 5, medium: 3, low: 1, info: 0 };
export const SEVERITY_LABEL: Record<Severity, string> = { critical: "Crítica", high: "Alta", medium: "Media", low: "Baja", info: "Informativa" };
export const STATUS_LABEL: Record<Status, string> = { pass: "Cumple", fail: "No cumple", review: "Revisar", "n/a": "No aplica", waived: "Excepción" };
export const LAYER_LABEL: Record<Layer, string> = { builtin: "Integrada", imported: "Importada", user: "Usuario" };

export type ValueOp =
  | "eq"
  | "ne"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "notIn"
  | "contains"
  | "containsAny"
  | "containsNone"
  | "noneMatch"
  | "allMatch";
export const VALUE_OPS: readonly ValueOp[] = ["eq", "ne", "gt", "gte", "lt", "lte", "in", "notIn", "contains", "containsAny", "containsNone", "noneMatch", "allMatch"];

interface CondBase {
  /** Identificador para `?fail:<id>:` y `@each:<id>:`. */
  id?: string;
  /** Busca en todo el subárbol del ámbito y no solo en los hijos directos. */
  deep?: boolean;
  /** Distingue mayúsculas (por defecto no). */
  matchCase?: boolean;
}
/** present: alguna línea calza. absent: ninguna calza (las que calzan son la evidencia). */
export interface PresenceCond extends CondBase {
  type: "present" | "absent";
  match: string;
}
/** regex: toda línea elegida por `select` (o toda línea si no hay) debe calzar con `match`. */
export interface RegexCond extends CondBase {
  type: "regex";
  select?: string;
  match: string;
}
/** value: captura el primer grupo de `key` y lo compara (número, texto o lista de palabras). */
export interface ValueCond extends CondBase {
  type: "value";
  key: string;
  op: ValueOp;
  /** Número, texto o lista. Un elemento "{{param}}" toma el valor del parámetro (lista separada por espacios o comas). */
  value: number | string | string[];
  /** Valor que se supone si la línea no aparece (valores por defecto que `show` omite). */
  default?: string;
}
export interface GroupCond extends CondBase {
  type: "all" | "any";
  conditions: Cond[];
}
export type Cond = PresenceCond | RegexCond | ValueCond | GroupCond;

export interface Scope {
  /** Regex de la línea que abre el bloque (en la raíz). */
  block: string;
  /** Regex de los hijos del bloque que son la unidad (p. ej. `^edit `). */
  child?: string;
  /** Evalúa cada bloque (o hijo) por separado. */
  each?: boolean;
  /** Filtro: solo se evalúan las unidades que cumplen esta condición. */
  where?: Cond;
}

export interface ParamSpec {
  prompt: string;
  example?: string;
  required?: boolean;
  /** Secreto: nunca se escribe en el plan; queda como variable {{x}} para CLI Lab. */
  secret?: boolean;
  default?: string;
  /** Regex que debe cumplir el valor (validada contra ReDoS). */
  pattern?: string;
}

export interface Waiver {
  /**
   * Bloque (literal, no regex): palabras completas de la cabecera, del nombre o de la etiqueta de la unidad,
   * o una ruta "bloque › subbloque" igual tramo a tramo (ver waiverMatches en audit.ts). Sin él aplica a
   * toda la regla.
   */
  match?: string;
  reason: string;
  approvedBy: string;
  /** AAAA-MM-DD. Vencida, deja de aplicar y el informe lo muestra. */
  expires: string;
  ticket?: string;
}

export interface Control {
  framework: string;
  control: string;
  note?: string;
}

export interface RuleTest {
  name?: string;
  config: string;
  expect: Status;
  params?: Record<string, string>;
  /** Líneas (sin espacios al borde) que deben aparecer en el plan de esta prueba. */
  planIncludes?: string[];
}

export type VendorLines = Partial<Record<AuditVendor, string[]>>;

export interface Rule {
  id: string;
  title: string;
  severity: Severity;
  vendor: AuditVendor;
  platforms?: string[];
  controls: Control[];
  /** Referencias externas solo por ID (CIS, STIG V-ID, NSA): nunca su texto. */
  refs?: string[];
  description?: string;
  rationale?: string;
  notes?: string;
  scope?: Scope;
  check: Cond;
  /** Si falla (evaluada en la raíz), la regla no aplica a esta config. */
  applicable?: Cond;
  /** Estado cuando el bloque del ámbito no existe (por defecto "n/a"). */
  missingScope?: "pass" | "fail" | "review" | "n/a";
  /** Estado cuando falta el dato (regex sin líneas elegidas, value sin línea ni `default`). Por defecto "review". */
  defaultState?: "pass" | "fail" | "review";
  /** Pasa a "revisar" si alguna línea calza (p. ej. comunidad enmascarada) y el resultado estaba en `from`. */
  reviewIf?: { match: string; from: ("pass" | "fail")[]; deep?: boolean };
  /** "review": un incumplimiento se informa como "revisar" (decisión humana, sin comando a ciegas). */
  onFail?: "fail" | "review";
  capture?: Record<string, string>;
  /** Remediación calculada: valor actual de `from` sin las palabras de `remove`. */
  compute?: { key: string; from: string; remove: string[]; ifEmpty?: string };
  fix?: FixKind;
  /** Prerrequisitos del plan (antes de todo lo demás), p. ej. crear el usuario SNMPv3. */
  prepare?: VendorLines;
  remediation?: VendorLines;
  rollback?: VendorLines;
  /** Rollback de `prepare` (va al final del rollback). */
  rollbackPrepare?: VendorLines;
  /** Reglas que, si también se corrigen, van antes en el plan. */
  after?: string[];
  params?: Record<string, ParamSpec>;
  tests?: RuleTest[];
  waivers?: Waiver[];
  enabled?: boolean;
}

export interface Override {
  rule: string;
  enabled?: boolean;
  severity?: Severity;
  /** Valores por defecto de parámetros (no secretos). */
  params?: Record<string, string>;
  reason?: string;
}

export interface RulePack {
  format: "netterminal-rules";
  formatVersion: 1;
  id: string;
  name: string;
  version: string;
  owner?: string;
  description?: string;
  rules?: Rule[];
  overrides?: Override[];
  waivers?: (Waiver & { rule: string })[];
}

/** Regla resuelta tras aplicar las capas. */
export interface EffectiveRule {
  rule: Rule;
  layer: Layer;
  packId: string;
  packVersion: string;
  severity: Severity;
  /** Cambios aplicados por capas posteriores (para el informe). */
  changes: string[];
  waivers: (Waiver & { layer: Layer; packId: string })[];
  paramDefaults: Record<string, string>;
  /** Posición (orden estable del plan). */
  order: number;
}

// ---------- ISO/IEC 27001:2022 Anexo A ----------

/** Cantidad de controles del Anexo A por tema (5: organizacionales, 6: personas, 7: físicos, 8: tecnológicos). */
const ISO_THEMES: Record<number, number> = { 5: 37, 6: 8, 7: 14, 8: 34 };
export const ISO_TOTAL = 93;
/** Nombres breves (paráfrasis propia) de los controles que usan los packs integrados. */
export const ISO_TITLES: Record<string, string> = {
  "A.5.15": "Control de acceso",
  "A.5.17": "Información de autenticación",
  "A.5.31": "Requisitos legales y contractuales",
  "A.8.2": "Derechos de acceso privilegiado",
  "A.8.5": "Autenticación segura",
  "A.8.9": "Gestión de la configuración",
  "A.8.13": "Respaldo de la información",
  "A.8.15": "Registro de eventos",
  "A.8.16": "Monitoreo de actividades",
  "A.8.17": "Sincronización de relojes",
  "A.8.20": "Seguridad de redes",
  "A.8.21": "Seguridad de los servicios de red",
  "A.8.23": "Filtrado web",
  "A.8.24": "Uso de criptografía",
};
export const isIsoFramework = (f: string) => /27001/.test(f);
/** "A.8.20" válido dentro del Anexo A de 2022. */
export function isIsoControl(c: string): boolean {
  const m = /^A\.([5-8])\.(\d{1,2})$/.exec(c);
  return !!m && Number(m[2]) >= 1 && Number(m[2]) <= ISO_THEMES[Number(m[1])];
}

// ---------- Validación ----------

export const RULES_FORMAT = "netterminal-rules";
/** Tamaño máximo de un pack importado (como MAX_BYTES de cmdpacks). */
export const MAX_PACK_BYTES = 512 * 1024;
export const MAX_RULES = 500;
const MAX_REGEX = 300;
const MAX_TEMPLATE_LINES = 60;
const MAX_LINE = 300;
const MAX_TEST_CONFIG = 20_000;
const MAX_DEPTH = 5;
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const PARAM = /^[a-z][a-z0-9_]{1,39}$/;
const COND_ID = /^[a-z][a-z0-9-]{0,31}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES: readonly Status[] = ["pass", "fail", "review", "n/a", "waived"];
/** Variables que pone el motor (no pueden ser nombres de parámetros). */
export const RESERVED_VARS = ["block", "child", "name", "current", "computed", "line"];
const TEMPLATE_VAR = /\{\{([^{}]*)\}\}/g;
const RULE_KEYS = new Set([
  "id",
  "title",
  "severity",
  "vendor",
  "platforms",
  "controls",
  "refs",
  "description",
  "rationale",
  "notes",
  "scope",
  "check",
  "applicable",
  "missingScope",
  "defaultState",
  "reviewIf",
  "onFail",
  "capture",
  "compute",
  "fix",
  "prepare",
  "remediation",
  "rollback",
  "rollbackPrepare",
  "after",
  "params",
  "tests",
  "waivers",
  "enabled",
  "source",
]);

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isStr = (v: unknown, max = 2000): v is string => typeof v === "string" && v.length <= max;

/** Error de una regex de regla, o null. Compila con las mismas opciones que el motor. */
export function ruleRegexError(pattern: unknown, matchCase = false): string | null {
  if (typeof pattern !== "string" || !pattern) return "regex vacía";
  if (pattern.length > MAX_REGEX) return `regex de más de ${MAX_REGEX} caracteres`;
  try {
    new RegExp(pattern, matchCase ? "" : "i");
  } catch (e) {
    return `regex inválida (${(e as Error).message})`;
  }
  return riskyRegex(pattern, !matchCase);
}

function validDate(s: string): boolean {
  if (!DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function checkCond(c: unknown, where: string, errs: string[], ids: Set<string>, depth = 0): void {
  if (!isObj(c)) return void errs.push(`${where}: condición inválida`);
  if (depth > MAX_DEPTH) return void errs.push(`${where}: condiciones anidadas en más de ${MAX_DEPTH} niveles`);
  if (c.id !== undefined) {
    if (typeof c.id !== "string" || !COND_ID.test(c.id)) errs.push(`${where}: id de condición inválido`);
    else if (ids.has(c.id)) errs.push(`${where}: id de condición repetido (${c.id})`);
    else ids.add(c.id);
  }
  const mc = c.matchCase === true;
  const re = (p: unknown, label: string) => {
    const bad = ruleRegexError(p, mc);
    if (bad) errs.push(`${where}.${label}: ${bad}`);
  };
  switch (c.type) {
    case "present":
    case "absent":
      re(c.match, "match");
      break;
    case "regex":
      re(c.match, "match");
      if (c.select !== undefined) re(c.select, "select");
      break;
    case "value": {
      re(c.key, "key");
      if (!VALUE_OPS.includes(c.op as ValueOp)) errs.push(`${where}: operador desconocido (${String(c.op)})`);
      const v = c.value;
      const okVal = typeof v === "number" || isStr(v, 200) || (Array.isArray(v) && v.length <= 50 && v.every((x) => isStr(x, 100)));
      if (!okVal) errs.push(`${where}: value debe ser número, texto o lista de textos`);
      if (["gt", "gte", "lt", "lte"].includes(c.op as string) && typeof v !== "number" && !(typeof v === "string" && /^\{\{\w+\}\}$/.test(v))) errs.push(`${where}: ${String(c.op)} compara números`);
      if (c.op === "noneMatch" || c.op === "allMatch") for (const p of Array.isArray(v) ? v : [v]) re(p, "value");
      if (c.default !== undefined && !isStr(c.default, 200)) errs.push(`${where}: default debe ser texto`);
      break;
    }
    case "all":
    case "any":
      if (!Array.isArray(c.conditions) || !c.conditions.length || c.conditions.length > 20) errs.push(`${where}: ${c.type} necesita de 1 a 20 condiciones`);
      else c.conditions.forEach((x, i) => checkCond(x, `${where}.${c.type}[${i}]`, errs, ids, depth + 1));
      break;
    default:
      errs.push(`${where}: tipo de condición desconocido (${String(c.type)})`);
  }
}

/** Variables de una línea de plantilla (sin los prefijos ?fail:/?current:/@each:). */
export function templateVars(line: string): string[] {
  return [...line.matchAll(TEMPLATE_VAR)].map((m) => m[1].trim());
}

function checkTemplates(r: Record<string, unknown>, key: string, where: string, errs: string[], params: Set<string>, condIds: Set<string>, captures: Set<string>): void {
  const t = r[key];
  if (t === undefined) return;
  if (!isObj(t)) return void errs.push(`${where}.${key}: debe ser un objeto por fabricante`);
  for (const [vendor, lines] of Object.entries(t)) {
    if (!AUDIT_VENDORS.includes(vendor as AuditVendor)) errs.push(`${where}.${key}: fabricante desconocido (${vendor})`);
    if (!Array.isArray(lines) || lines.length > MAX_TEMPLATE_LINES || !lines.every((l) => isStr(l, MAX_LINE))) {
      errs.push(`${where}.${key}.${vendor}: lista de hasta ${MAX_TEMPLATE_LINES} líneas de hasta ${MAX_LINE} caracteres`);
      continue;
    }
    for (const raw of lines as string[]) {
      // Sin saltos ni caracteres de control (tabulador, escape, retroceso): llegarían tal cual al equipo.
      if (/[\u0000-\u001f\u007f]/.test(raw)) errs.push(`${where}.${key}.${vendor}: una línea no puede tener saltos ni caracteres de control`);
      let line = raw;
      for (;;) {
        const m = /^\?fail:([^:]+):|^\?!?current(?:\.([\w-]+))?:|^\?param:([^:]+):|^@each:([^:]+):/.exec(line);
        if (!m) break;
        if (m[1] !== undefined && !condIds.has(m[1])) errs.push(`${where}.${key}: ?fail:${m[1]} no corresponde a una condición con ese id`);
        if (m[4] !== undefined && !condIds.has(m[4])) errs.push(`${where}.${key}: @each:${m[4]} no corresponde a una condición con ese id`);
        if (m[3] !== undefined && !params.has(m[3])) errs.push(`${where}.${key}: ?param:${m[3]} no es un parámetro declarado`);
        if (m[2] !== undefined && !captures.has(m[2])) errs.push(`${where}.${key}: current.${m[2]} no está en capture`);
        line = line.slice(m[0].length);
      }
      for (const v of templateVars(line)) {
        if (v === "current" && !captures.has("current")) errs.push(`${where}.${key}: {{current}} requiere capture.current`);
        else if (v.startsWith("current.")) {
          if (!captures.has(v.slice(8))) errs.push(`${where}.${key}: {{${v}}} no está en capture`);
        } else if (v === "computed" && !r.compute) errs.push(`${where}.${key}: {{computed}} requiere compute`);
        else if ((v === "block" || v === "name") && !r.scope) errs.push(`${where}.${key}: {{${v}}} requiere scope`);
        else if (v === "child" && !(isObj(r.scope) && r.scope.child)) errs.push(`${where}.${key}: {{child}} requiere scope.child`);
        else if (!RESERVED_VARS.includes(v) && !params.has(v)) errs.push(`${where}.${key}: variable {{${v}}} sin parámetro declarado`);
      }
    }
  }
}

function checkWaiver(w: unknown, where: string, errs: string[]): void {
  if (!isObj(w)) return void errs.push(`${where}: excepción inválida`);
  if (!isStr(w.reason, 500) || !w.reason.trim()) errs.push(`${where}: la excepción necesita motivo`);
  if (!isStr(w.approvedBy, 120) || !w.approvedBy.trim()) errs.push(`${where}: la excepción necesita aprobador`);
  if (!isStr(w.expires, 10) || !validDate(w.expires)) errs.push(`${where}: vencimiento AAAA-MM-DD obligatorio`);
  if (w.match !== undefined && (!isStr(w.match, 200) || !w.match)) errs.push(`${where}: match debe ser texto (literal)`);
  if (w.ticket !== undefined && !isStr(w.ticket, 120)) errs.push(`${where}: ticket debe ser texto`);
}

function checkRule(r: unknown, where: string, errs: string[], warns: string[]): void {
  if (!isObj(r)) return void errs.push(`${where}: regla inválida`);
  for (const k of Object.keys(r)) if (!RULE_KEYS.has(k)) errs.push(`${where}: campo desconocido "${k}"`);
  if (!isStr(r.title, 200) || !r.title.trim()) errs.push(`${where}: falta title`);
  if (!SEVERITIES.includes(r.severity as Severity)) errs.push(`${where}: severidad inválida (${String(r.severity)}); usa ${SEVERITIES.join(", ")}`);
  if (!AUDIT_VENDORS.includes(r.vendor as AuditVendor)) errs.push(`${where}: fabricante desconocido (${String(r.vendor)}); usa ${AUDIT_VENDORS.join(", ")}`);
  if (r.platforms !== undefined && !(Array.isArray(r.platforms) && r.platforms.every((p) => isStr(p, 40)))) errs.push(`${where}: platforms debe ser lista de textos`);
  if (!Array.isArray(r.controls)) errs.push(`${where}: controls debe ser una lista`);
  else
    for (const c of r.controls) {
      if (!isObj(c) || !isStr(c.framework, 100) || !isStr(c.control, 100)) errs.push(`${where}: control inválido`);
      else if (isIsoFramework(c.framework) && !isIsoControl(c.control)) errs.push(`${where}: ${c.control} no es un control del Anexo A de ISO/IEC 27001:2022`);
    }
  for (const k of ["description", "rationale", "notes"]) if (r[k] !== undefined && !isStr(r[k], 2000)) errs.push(`${where}: ${k} debe ser texto`);
  if (r.refs !== undefined && !(Array.isArray(r.refs) && r.refs.every((x) => isStr(x, 120)))) errs.push(`${where}: refs debe ser lista de IDs`);
  const condIds = new Set<string>();
  if (r.scope !== undefined) {
    if (!isObj(r.scope)) errs.push(`${where}.scope: inválido`);
    else {
      const b = ruleRegexError(r.scope.block);
      if (b) errs.push(`${where}.scope.block: ${b}`);
      if (r.scope.child !== undefined) {
        const c = ruleRegexError(r.scope.child);
        if (c) errs.push(`${where}.scope.child: ${c}`);
      }
      if (r.scope.where !== undefined) checkCond(r.scope.where, `${where}.scope.where`, errs, new Set());
    }
  }
  checkCond(r.check, `${where}.check`, errs, condIds);
  if (r.applicable !== undefined) checkCond(r.applicable, `${where}.applicable`, errs, new Set());
  if (r.missingScope !== undefined && !["pass", "fail", "review", "n/a"].includes(r.missingScope as string)) errs.push(`${where}: missingScope inválido`);
  if (r.defaultState !== undefined && !["pass", "fail", "review"].includes(r.defaultState as string)) errs.push(`${where}: defaultState inválido`);
  if (r.onFail !== undefined && !["fail", "review"].includes(r.onFail as string)) errs.push(`${where}: onFail inválido`);
  if (r.fix !== undefined && !["auto", "guided", "manual"].includes(r.fix as string)) errs.push(`${where}: fix inválido`);
  if (r.reviewIf !== undefined) {
    if (!isObj(r.reviewIf) || !Array.isArray(r.reviewIf.from) || !r.reviewIf.from.every((x) => x === "pass" || x === "fail")) errs.push(`${where}: reviewIf inválido`);
    else {
      const b = ruleRegexError(r.reviewIf.match);
      if (b) errs.push(`${where}.reviewIf.match: ${b}`);
    }
  }
  const captures = new Set<string>();
  if (r.capture !== undefined) {
    if (!isObj(r.capture)) errs.push(`${where}.capture: inválido`);
    else
      for (const [k, v] of Object.entries(r.capture)) {
        if (!/^[a-z][\w-]{0,31}$/.test(k)) errs.push(`${where}.capture: nombre inválido (${k})`);
        const b = ruleRegexError(v);
        if (b) errs.push(`${where}.capture.${k}: ${b}`);
        captures.add(k);
      }
  }
  if (r.compute !== undefined) {
    const c = r.compute;
    if (!isObj(c) || !isStr(c.key, 60) || !Array.isArray(c.remove) || !c.remove.every((x) => isStr(x, 60))) errs.push(`${where}.compute: necesita key, from y remove (lista)`);
    else {
      const b = ruleRegexError(c.from);
      if (b) errs.push(`${where}.compute.from: ${b}`);
      if (c.ifEmpty !== undefined && !isStr(c.ifEmpty, MAX_LINE)) errs.push(`${where}.compute.ifEmpty: texto`);
    }
  }
  const params = new Set<string>();
  if (r.params !== undefined) {
    if (!isObj(r.params)) errs.push(`${where}.params: inválido`);
    else
      for (const [name, spec] of Object.entries(r.params)) {
        if (!PARAM.test(name) || RESERVED_VARS.includes(name)) errs.push(`${where}.params: nombre inválido o reservado (${name})`);
        if (!isObj(spec) || !isStr(spec.prompt, 200)) {
          errs.push(`${where}.params.${name}: falta prompt`);
          continue;
        }
        if (spec.secret === true) {
          if (spec.default !== undefined) errs.push(`${where}.params.${name}: un parámetro secreto no puede tener valor por defecto`);
          if (!isSecretVar(name)) errs.push(`${where}.params.${name}: un parámetro secreto debe llamarse con pass, pwd, secret, key o similar (CLI Lab lo oculta por el nombre)`);
        }
        if (spec.default !== undefined && !isStr(spec.default, 200)) errs.push(`${where}.params.${name}: default debe ser texto`);
        if (spec.pattern !== undefined) {
          const b = ruleRegexError(spec.pattern, true);
          if (b) errs.push(`${where}.params.${name}.pattern: ${b}`);
        }
        params.add(name);
      }
  }
  for (const k of ["prepare", "remediation", "rollback", "rollbackPrepare"]) checkTemplates(r, k, where, errs, params, condIds, captures);
  if (r.after !== undefined && !(Array.isArray(r.after) && r.after.every((x) => typeof x === "string" && ID.test(x)))) errs.push(`${where}: after debe ser lista de ids`);
  if (r.waivers !== undefined) {
    if (!Array.isArray(r.waivers)) errs.push(`${where}: waivers debe ser una lista`);
    else r.waivers.forEach((w, i) => checkWaiver(w, `${where}.waivers[${i}]`, errs));
  }
  if (r.enabled !== undefined && typeof r.enabled !== "boolean") errs.push(`${where}: enabled debe ser true o false`);
  if (r.tests !== undefined) {
    if (!Array.isArray(r.tests) || r.tests.length > 30) errs.push(`${where}: tests debe ser una lista (máx. 30)`);
    else
      r.tests.forEach((t, i) => {
        if (!isObj(t) || !isStr(t.config, MAX_TEST_CONFIG)) errs.push(`${where}.tests[${i}]: config de hasta ${MAX_TEST_CONFIG} caracteres`);
        else if (!STATUSES.includes(t.expect as Status)) errs.push(`${where}.tests[${i}]: expect inválido`);
      });
  } else warns.push(`${where}: la regla no trae tests`);
}

export interface PackValidation {
  pack: RulePack | null;
  errors: string[];
  warnings: string[];
}

/** Valida un pack (texto JSON u objeto). Con errores, `pack` es null y nada se carga. */
export function validateRulePack(input: unknown): PackValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  let data = input;
  if (typeof input === "string") {
    if (input.length > MAX_PACK_BYTES) return { pack: null, errors: [`El pack supera ${MAX_PACK_BYTES / 1024} KB`], warnings };
    try {
      data = JSON.parse(input);
    } catch (e) {
      return { pack: null, errors: [`JSON inválido: ${(e as Error).message}`], warnings };
    }
  }
  if (!isObj(data)) return { pack: null, errors: ["El pack debe ser un objeto JSON"], warnings };
  if (data.format !== RULES_FORMAT) errors.push(`format debe ser "${RULES_FORMAT}"`);
  if (data.formatVersion !== 1) errors.push("formatVersion no soportado (se espera 1)");
  if (typeof data.id !== "string" || !ID.test(data.id)) errors.push("id del pack inválido (letras, números, punto, guion; máx. 64)");
  if (!isStr(data.name, 120) || !data.name.trim()) errors.push("falta name");
  if (!isStr(data.version, 40) || !data.version.trim()) errors.push("falta version");
  const rules = data.rules ?? [];
  if (!Array.isArray(rules)) errors.push("rules debe ser una lista");
  else {
    if (rules.length > MAX_RULES) errors.push(`máximo ${MAX_RULES} reglas por pack`);
    const seen = new Set<string>();
    rules.slice(0, MAX_RULES).forEach((r, i) => {
      const id = isObj(r) && typeof r.id === "string" ? r.id : "";
      const where = `regla ${id || `#${i + 1}`}`;
      if (!ID.test(id)) errors.push(`${where}: id inválido`);
      else if (seen.has(id)) errors.push(`${where}: id repetido`);
      seen.add(id);
      checkRule(r, where, errors, warnings);
    });
  }
  if (data.overrides !== undefined) {
    if (!Array.isArray(data.overrides)) errors.push("overrides debe ser una lista");
    else
      data.overrides.forEach((o, i) => {
        const where = `override #${i + 1}`;
        if (!isObj(o) || typeof o.rule !== "string" || !ID.test(o.rule)) return void errors.push(`${where}: falta rule`);
        if (o.enabled !== undefined && typeof o.enabled !== "boolean") errors.push(`${where}: enabled debe ser true o false`);
        if (o.severity !== undefined && !SEVERITIES.includes(o.severity as Severity)) errors.push(`${where}: severidad inválida`);
        if (o.params !== undefined && !(isObj(o.params) && Object.values(o.params).every((v) => isStr(v, 200)))) errors.push(`${where}: params debe ser un objeto de textos`);
        if (o.reason !== undefined && !isStr(o.reason, 500)) errors.push(`${where}: reason debe ser texto`);
      });
  }
  if (data.waivers !== undefined) {
    if (!Array.isArray(data.waivers)) errors.push("waivers debe ser una lista");
    else
      data.waivers.forEach((w, i) => {
        if (!isObj(w) || typeof w.rule !== "string" || !ID.test(w.rule)) errors.push(`excepción #${i + 1}: falta rule`);
        checkWaiver(w, `excepción #${i + 1}`, errors);
      });
  }
  return { pack: errors.length ? null : (data as unknown as RulePack), errors, warnings };
}

// ---------- Capas ----------

/** Pack usado en una auditoría (para que el informe sea reproducible). */
export interface PackInfo {
  id: string;
  name: string;
  version: string;
  layer: Layer;
  rules: number;
  /** SHA-256 del pack serializado. */
  sha256: string;
}

export interface ResolvedRules {
  rules: EffectiveRule[];
  disabled: { id: string; layer: Layer; packId: string; reason?: string }[];
  notes: string[];
  packs: PackInfo[];
}

const LAYER_RANK: Record<Layer, number> = { builtin: 0, imported: 1, user: 2 };

/**
 * Reglas efectivas: integrada < importada < usuario. Una regla con el mismo id en una capa posterior
 * reemplaza a la anterior; los overrides (desactivar, severidad, parámetros) y las excepciones se aplican
 * sobre lo que haya en ese momento. Una regla desactivada no aparece en el resultado; las demás llevan
 * la lista de cambios para el informe.
 */
export function resolveRules(packs: { pack: RulePack; layer: Layer }[]): ResolvedRules {
  const sorted = packs.map((p, i) => ({ ...p, i })).sort((a, b) => LAYER_RANK[a.layer] - LAYER_RANK[b.layer] || a.i - b.i);
  const map = new Map<string, EffectiveRule & { enabled: boolean; disabledBy?: { layer: Layer; packId: string; reason?: string } }>();
  const notes: string[] = [];
  let order = 0;
  for (const { pack, layer } of sorted) {
    for (const rule of pack.rules ?? []) {
      const prev = map.get(rule.id);
      const changes = prev ? [...prev.changes, `Redefinida por ${LAYER_LABEL[layer].toLowerCase()} (${pack.id})`] : [];
      map.set(rule.id, {
        rule,
        layer,
        packId: pack.id,
        packVersion: pack.version,
        severity: rule.severity,
        changes,
        waivers: (rule.waivers ?? []).map((w) => ({ ...w, layer, packId: pack.id })),
        paramDefaults: {},
        order: prev?.order ?? order++,
        enabled: rule.enabled !== false,
      });
    }
    for (const o of pack.overrides ?? []) {
      const e = map.get(o.rule);
      if (!e) {
        notes.push(`${pack.id}: override de ${o.rule}, que no existe en las capas anteriores`);
        continue;
      }
      const why = o.reason ? `: ${o.reason}` : "";
      if (o.enabled === false) {
        e.enabled = false;
        e.disabledBy = { layer, packId: pack.id, reason: o.reason };
        e.changes.push(`Desactivada por ${LAYER_LABEL[layer].toLowerCase()} (${pack.id})${why}`);
      } else if (o.enabled === true && !e.enabled) {
        e.enabled = true;
        e.changes.push(`Reactivada por ${LAYER_LABEL[layer].toLowerCase()} (${pack.id})${why}`);
      }
      if (o.severity && o.severity !== e.severity) {
        e.changes.push(`Severidad ${SEVERITY_LABEL[e.severity].toLowerCase()} → ${SEVERITY_LABEL[o.severity].toLowerCase()} por ${LAYER_LABEL[layer].toLowerCase()} (${pack.id})${why}`);
        e.severity = o.severity;
      }
      if (o.params) {
        for (const [k, v] of Object.entries(o.params)) {
          const spec = e.rule.params?.[k];
          if (!spec) notes.push(`${pack.id}: override de ${o.rule} con parámetro desconocido (${k})`);
          else if (spec.secret) notes.push(`${pack.id}: el parámetro ${k} de ${o.rule} es secreto y no admite valor fijo`);
          else e.paramDefaults[k] = v;
        }
        e.changes.push(`Parámetros ajustados por ${LAYER_LABEL[layer].toLowerCase()} (${pack.id})`);
      }
    }
    for (const w of pack.waivers ?? []) {
      const e = map.get(w.rule);
      if (!e) {
        notes.push(`${pack.id}: excepción para ${w.rule}, que no existe`);
        continue;
      }
      const { rule: _r, ...rest } = w;
      e.waivers.push({ ...rest, layer, packId: pack.id });
    }
  }
  const all = [...map.values()].sort((a, b) => a.order - b.order);
  return {
    rules: all.filter((e) => e.enabled).map(({ enabled: _e, disabledBy: _d, ...r }) => r),
    disabled: all.filter((e) => !e.enabled).map((e) => ({ id: e.rule.id, layer: e.disabledBy?.layer ?? e.layer, packId: e.disabledBy?.packId ?? e.packId, reason: e.disabledBy?.reason })),
    notes,
    packs: sorted.map(({ pack, layer }) => ({ id: pack.id, name: pack.name, version: pack.version, layer, rules: pack.rules?.length ?? 0, sha256: sha256Hex(JSON.stringify(pack)) })),
  };
}
