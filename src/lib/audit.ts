/**
 * Auditoría de configuración: evalúa reglas declarativas (auditRules.ts) sobre el árbol de la
 * configuración (auditParse.ts), calcula el puntaje y el riesgo, y arma el plan de remediación con su
 * rollback. Funciones puras: no hay red, no hay IA y nada se envía al equipo (el plan se abre en CLI Lab,
 * que confirma equipos y riesgo antes de ejecutar).
 *
 * Toda la evidencia y todo lo que sale del motor (resultado, plan, exportaciones) pasa por maskLine: un
 * secreto de la config nunca queda a la vista. Una línea del plan que depende de un valor enmascarado se
 * deja como comentario y se avisa.
 */
import { detectVendor, fortiTokens, MAX_CONFIG_BYTES, maskLine, parseConfig, VENDOR_LABEL, walk, type AuditVendor, type ConfigNode, type VendorGuess } from "./auditParse";
import {
  isIsoFramework,
  ISO_TITLES,
  ISO_TOTAL,
  LAYER_LABEL,
  ruleRegexError,
  SEVERITIES,
  SEVERITY_LABEL,
  SEVERITY_WEIGHT,
  STATUS_LABEL,
  type Cond,
  type Control,
  type EffectiveRule,
  type FixKind,
  type Layer,
  type PackInfo,
  type ParamSpec,
  type ResolvedRules,
  type Rule,
  type Severity,
  type Status,
  type ValueCond,
  type Waiver,
} from "./auditRules";
import { computeRisk, type Risk } from "./packs";
import { sha256Hex } from "./sha256";
import { csvCell } from "./snmp";
import { CSV_BOM } from "./topology";

/** Versión del motor (va en el JSON del resultado). */
export const AUDIT_ENGINE_VERSION = "1.0.0";
/** Bajo este puntaje (%) el riesgo es al menos alto. Propuesta sin validar con datos: ajustable. */
export const DEFAULT_RISK_THRESHOLD = 70;
export const AUDIT_DISCLAIMER =
  "El mapeo a ISO/IEC 27001:2022 Anexo A es una interpretación propia de NetTerminal, no una certificación ni un porcentaje de cumplimiento de la norma. La auditoría revisa solo el texto de la configuración: no ve rutas, ACL efectivas, topología ni el estado del equipo.";

type CondState = "pass" | "fail" | "review";

export interface Evidence {
  lineNo: number;
  /** Línea enmascarada (solo la primera si el valor ocupa varias). */
  text: string;
  kind: "match" | "missing" | "value" | "default" | "info";
  note?: string;
}

export interface AppliedWaiver extends Waiver {
  layer: Layer;
  packId: string;
}

/** Datos para la remediación de una unidad (todo enmascarado). */
export interface FixCtx {
  block?: string;
  child?: string;
  name?: string;
  /** "global" o "vdom:<nombre>" en FortiOS con VDOM. */
  ctx?: string;
  captures: Record<string, string>;
  /** Palabras actuales para `compute` (null si la línea no está). */
  computeFrom: string[] | null;
  failed: string[];
  offending: Record<string, string[]>;
}

export interface UnitResult {
  label: string;
  lineNo: number;
  status: Exclude<Status, "n/a">;
  evidence: Evidence[];
  waiver?: AppliedWaiver;
  note?: string;
  fix: FixCtx;
}

export interface Finding {
  ruleId: string;
  title: string;
  severity: Severity;
  layer: Layer;
  packId: string;
  packVersion: string;
  vendor: AuditVendor;
  controls: Control[];
  refs: string[];
  status: Status;
  /** Explicación breve del estado. */
  reason: string;
  fix: FixKind;
  /** Hay comandos de remediación para este fabricante. */
  remediable: boolean;
  description?: string;
  notes?: string;
  changes: string[];
  units: UnitResult[];
  /** Excepciones vencidas que dejaron de aplicar. */
  expiredWaivers: AppliedWaiver[];
}

export interface AuditInput {
  text: string;
  /** Fabricante elegido por el usuario; si falta se detecta. */
  vendor?: AuditVendor;
  platform?: string;
  device?: string;
  source?: string;
}

export interface AuditOptions {
  now?: Date;
  riskThreshold?: number;
  /** Parámetros para los filtros de las reglas (p. ej. interfaces WAN). */
  params?: Record<string, string>;
}

export type RiskLevel = "critical" | "high" | "medium" | "low";
export const RISK_LABEL: Record<RiskLevel, string> = { critical: "Crítico", high: "Alto", medium: "Medio", low: "Bajo" };

export interface AuditResult {
  format: "netterminal-audit";
  formatVersion: 1;
  engine: string;
  generatedAt: string;
  device?: string;
  source?: string;
  vendor: AuditVendor;
  vendorDetected: VendorGuess;
  vendorOverridden: boolean;
  platform?: string;
  input: { sha256: string; lines: number; bytes: number };
  packs: PackInfo[];
  disabled: ResolvedRules["disabled"];
  notes: string[];
  findings: Finding[];
  counts: Record<Status, number>;
  bySeverity: Record<Severity, Record<Status, number>>;
  score: { percent: number | null; passWeight: number; evaluatedWeight: number; evaluated: number; weights: Record<Severity, number>; base: string };
  risk: { level: RiskLevel; reasons: string[]; threshold: number };
  coverage: { rules: number; evaluated: number; otherVendor: number; iso: string[]; isoTotal: number; frameworks: Record<string, number>; text: string; disclaimer: string };
}

// ---------- Regex ----------

const reCache = new Map<string, RegExp | null>();
/** Regex de regla ya validada (anti-ReDoS); null si es inválida o peligrosa. */
function rx(pattern: string, matchCase = false): RegExp | null {
  const key = (matchCase ? "c" : "i") + pattern;
  let re = reCache.get(key);
  if (re === undefined) {
    re = ruleRegexError(pattern, matchCase) ? null : new RegExp(pattern, matchCase ? "" : "i");
    if (reCache.size > 2000) reCache.clear();
    reCache.set(key, re);
  }
  return re;
}

class BadRegex extends Error {}
function mustRx(pattern: string, matchCase = false): RegExp {
  const re = rx(pattern, matchCase);
  if (!re) throw new BadRegex(`Regex rechazada: ${pattern}`);
  return re;
}

// ---------- Unidades ----------

interface Unit {
  /** Nodos de la unidad (cabeceras); vacío para la raíz. */
  heads: ConfigNode[];
  block?: ConfigNode;
  child?: ConfigNode;
  name?: string;
  root: boolean;
}

const firstLine = (s: string) => {
  const i = s.indexOf("\n");
  return i < 0 ? s : `${s.slice(0, i)} …`;
};
const shown = (n: ConfigNode) => maskLine(firstLine(n.line));

function unitLabel(u: Unit): string {
  if (u.root) return "Configuración global";
  const vdom = u.block?.vdom ? `[VDOM ${u.block.vdom}] ` : "";
  if (u.child && u.block) return `${vdom}${shown(u.block)} › ${shown(u.child)}`;
  if (u.heads.length > 1) return `${vdom}${shown(u.heads[0])} (+${u.heads.length - 1})`;
  return vdom + shown(u.heads[0]);
}

function candidates(u: Unit, roots: ConfigNode[], deep: boolean): ConfigNode[] {
  if (u.root) return deep ? walk(roots) : roots;
  const out: ConfigNode[] = [];
  for (const h of u.heads) {
    out.push(h);
    if (deep) walk(h.children, out);
    else out.push(...h.children);
  }
  return out;
}

function captureName(re: RegExp, n: ConfigNode): string | undefined {
  const m = re.exec(n.line);
  const g = m?.slice(1).find((x) => x !== undefined);
  return g ?? n.name;
}

function buildUnits(rule: Rule, roots: ConfigNode[]): Unit[] | null {
  const s = rule.scope;
  if (!s) return [{ heads: [], root: true }];
  const blockRe = mustRx(s.block);
  const blocks = roots.filter((n) => blockRe.test(n.line));
  if (!blocks.length) return null;
  let units: Unit[];
  if (s.child) {
    const childRe = mustRx(s.child);
    units = blocks.flatMap((b) => b.children.filter((c) => !c.comment && childRe.test(c.line)).map((c) => ({ heads: [c], block: b, child: c, name: captureName(childRe, c), root: false })));
    if (!units.length) return null;
  } else units = blocks.map((b) => ({ heads: [b], block: b, name: captureName(blockRe, b), root: false }));
  if (s.each || units.length === 1) return units;
  // Sin `each` los bloques se evalúan juntos, pero nunca se mezclan VDOM distintas (FortiOS): una unidad
  // por contexto, para que el resultado, el plan y el rollback queden en la VDOM que corresponde.
  const byCtx = new Map<string, Unit[]>();
  for (const u of units) {
    const k = u.block?.ctx ?? "";
    byCtx.set(k, [...(byCtx.get(k) ?? []), u]);
  }
  return [...byCtx.values()].map((g) => (g.length === 1 ? g[0] : { heads: g.flatMap((u) => u.heads), block: g[0].block, child: g[0].child, name: g[0].name, root: false }));
}

// ---------- Condiciones ----------

interface Env {
  rule: Rule;
  roots: ConfigNode[];
  params: Record<string, string>;
}

interface CondOut {
  state: CondState;
  evidence: Evidence[];
  failed: string[];
  offending: Record<string, string[]>;
}

const MAX_EVIDENCE = 8;
const ev = (n: ConfigNode, kind: Evidence["kind"], note?: string): Evidence => ({ lineNo: n.lineNo, text: shown(n), kind, ...(note ? { note } : {}) });

function unitAnchor(u: Unit): { lineNo: number; text: string } {
  const h = u.child ?? u.heads[0];
  return h ? { lineNo: h.lineNo, text: shown(h) } : { lineNo: 0, text: "(configuración global)" };
}

/** Valores de una lista: expande "{{param}}" (separado por espacios o comas) y quita los vacíos. */
function targets(v: ValueCond["value"], params: Record<string, string>, mc: boolean): string[] {
  const list = Array.isArray(v) ? v : [String(v)];
  const out: string[] = [];
  for (const x of list) {
    const m = /^\{\{\s*([\w.-]+)\s*\}\}$/.exec(x);
    if (m) out.push(...(params[m[1]] ?? "").split(/[\s,]+/).filter(Boolean));
    else out.push(x);
  }
  return mc ? out : out.map((x) => x.toLowerCase());
}

const num = (s: string) => (/^-?\d+(\.\d+)?$/.test(s.trim()) ? Number(s) : NaN);

/** Compara un valor capturado; null si no se puede decidir (p. ej. número esperado y texto encontrado). */
export function compareValue(raw: string, c: ValueCond, params: Record<string, string>): boolean | null {
  const mc = c.matchCase === true;
  const toks = fortiTokens(raw).map((t) => (mc ? t : t.toLowerCase()));
  const joined = toks.join(" ");
  const t = targets(c.value, params, mc);
  switch (c.op) {
    case "eq":
    case "ne": {
      const a = num(joined);
      const b = num(t.join(" "));
      const eq = !isNaN(a) && !isNaN(b) ? a === b : joined === t.join(" ");
      return c.op === "eq" ? eq : !eq;
    }
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const a = num(toks[0] ?? "");
      const b = typeof c.value === "number" ? c.value : num(t[0] ?? "");
      if (isNaN(a) || isNaN(b)) return null;
      return c.op === "gt" ? a > b : c.op === "gte" ? a >= b : c.op === "lt" ? a < b : a <= b;
    }
    case "in":
      return t.includes(joined);
    case "notIn":
      return !t.includes(joined);
    case "contains":
      return t.every((x) => toks.includes(x));
    case "containsAny":
      return t.some((x) => toks.includes(x));
    case "containsNone":
      return !t.some((x) => toks.includes(x));
    case "noneMatch":
    case "allMatch": {
      const res = (Array.isArray(c.value) ? c.value : [String(c.value)]).map((p) => mustRx(p, mc));
      return c.op === "noneMatch" ? !toks.some((x) => res.some((r) => r.test(x))) : toks.every((x) => res.some((r) => r.test(x)));
    }
  }
}

function missingState(env: Env): CondState {
  return env.rule.defaultState ?? "review";
}

function evalCond(c: Cond, u: Unit, env: Env): CondOut {
  const out: CondOut = { state: "pass", evidence: [], failed: [], offending: {} };
  const fail = (offending: ConfigNode[] = []) => {
    out.state = "fail";
    if (c.id) {
      out.failed.push(c.id);
      if (offending.length) out.offending[c.id] = offending.map((n) => maskLine(n.line));
    }
  };
  const mc = c.matchCase === true;
  const anchor = unitAnchor(u);
  switch (c.type) {
    case "present": {
      const re = mustRx(c.match, mc);
      const hits = candidates(u, env.roots, !!c.deep).filter((n) => !n.comment && re.test(n.line));
      if (hits.length) out.evidence = hits.slice(0, MAX_EVIDENCE).map((n) => ev(n, "match"));
      else {
        fail();
        out.evidence = [{ ...anchor, kind: "missing", note: `Falta una línea que calce con /${c.match}/` }];
      }
      return out;
    }
    case "absent": {
      const re = mustRx(c.match, mc);
      const hits = candidates(u, env.roots, !!c.deep).filter((n) => !n.comment && re.test(n.line));
      if (hits.length) {
        fail(hits);
        out.evidence = hits.slice(0, MAX_EVIDENCE).map((n) => ev(n, "match", "No debería estar"));
      }
      return out;
    }
    case "regex": {
      const heads = new Set(u.heads);
      const sel = c.select ? mustRx(c.select, mc) : null;
      const re = mustRx(c.match, mc);
      const picked = candidates(u, env.roots, !!c.deep).filter((n) => !n.comment && (sel ? sel.test(n.line) : !heads.has(n)));
      if (!picked.length) {
        out.state = missingState(env);
        if (out.state === "fail") fail();
        out.evidence = [{ ...anchor, kind: "missing", note: `Sin líneas que evaluar: estado por defecto "${STATUS_LABEL[out.state]}"` }];
        return out;
      }
      const bad = picked.filter((n) => !re.test(n.line));
      if (bad.length) {
        fail(bad);
        out.evidence = bad.slice(0, MAX_EVIDENCE).map((n) => ev(n, "match", `Debería calzar con /${c.match}/`));
      } else out.evidence = picked.slice(0, MAX_EVIDENCE).map((n) => ev(n, "match"));
      return out;
    }
    case "value": {
      const re = mustRx(c.key, mc);
      const hits = candidates(u, env.roots, !!c.deep).filter((n) => !n.comment && re.test(n.line));
      const val = (n: ConfigNode) => {
        const m = re.exec(n.line)!;
        return m[1] ?? m[0];
      };
      if (!hits.length) {
        if (c.default === undefined) {
          out.state = missingState(env);
          if (out.state === "fail") fail();
          out.evidence = [{ ...anchor, kind: "missing", note: `No aparece /${c.key}/: estado por defecto "${STATUS_LABEL[out.state]}"` }];
          return out;
        }
        const ok = compareValue(c.default, c, env.params);
        out.evidence = [{ ...anchor, kind: "default", note: `No aparece: se supone el valor por defecto "${c.default}"` }];
        if (ok === null) out.state = "review";
        else if (!ok) fail();
        return out;
      }
      let undecided = false;
      const bad: ConfigNode[] = [];
      for (const n of hits) {
        const ok = compareValue(val(n), c, env.params);
        if (ok === null) undecided = true;
        else if (!ok) bad.push(n);
      }
      if (bad.length) {
        fail(bad);
        out.evidence = bad.slice(0, MAX_EVIDENCE).map((n) => ev(n, "value", `Valor fuera de lo esperado (${c.op} ${JSON.stringify(c.value)})`));
      } else {
        out.state = undecided ? "review" : "pass";
        out.evidence = hits.slice(0, MAX_EVIDENCE).map((n) => ev(n, "value", undecided ? "No se pudo comparar el valor" : undefined));
      }
      return out;
    }
    case "all":
    case "any": {
      const parts = c.conditions.map((x) => evalCond(x, u, env));
      for (const p of parts) {
        out.failed.push(...p.failed);
        Object.assign(out.offending, p.offending);
      }
      const states = parts.map((p) => p.state);
      if (c.type === "all") out.state = states.includes("fail") ? "fail" : states.includes("review") ? "review" : "pass";
      else out.state = states.includes("pass") ? "pass" : states.includes("review") ? "review" : "fail";
      // Evidencia: la de las partes que explican el resultado.
      const relevant = parts.filter((p) => (out.state === "pass" ? p.state === "pass" : p.state !== "pass"));
      out.evidence = relevant.flatMap((p) => p.evidence).slice(0, MAX_EVIDENCE);
      if (out.state === "fail" && c.id) out.failed.push(c.id);
      return out;
    }
  }
}

// ---------- Reglas ----------

/** Fecha local (AAAA-MM-DD): una excepción vence al terminar su día en la hora del equipo, no en UTC. */
export const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const VDOM_PREFIX = /^\[VDOM [^\]]*\]\s*/;
const PLUS_SUFFIX = /\s+\(\+\d+\)$/;
/** Palabras de un texto de bloque, sin comillas y en minúsculas, para comparar sin depender de espacios. */
const words = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.replace(/^"(.*)"$/, "$1"));
/** `sub` aparece en `full` como palabras completas y seguidas ("edit 1" no calza con "edit 10"). */
function hasWords(full: string[], sub: string[]): boolean {
  if (!sub.length || sub.length > full.length) return false;
  for (let i = 0; i + sub.length <= full.length; i++) if (sub.every((w, j) => full[i + j] === w)) return true;
  return false;
}
const sameWords = (a: string, b: string) => {
  const x = words(a);
  const y = words(b);
  return x.length === y.length && x.every((w, i) => w === y[i]);
};

/**
 * La excepción calza con la unidad. Con " › " es una ruta (bloque › subbloque): cada tramo debe ser igual
 * al de la etiqueta, desde el comienzo. Sin " › " debe aparecer como palabras completas en la cabecera de
 * la unidad, en su nombre o en su etiqueta: "edit 1" no cubre "edit 10" ni "Gi0/1" cubre "Gi0/10".
 */
export function waiverMatches(match: string | undefined, label: string, heads: string[] = [], name?: string): boolean {
  const m = (match ?? "").trim();
  if (!m) return true;
  const plain = label.replace(PLUS_SUFFIX, "");
  if (m.includes("›")) {
    const want = m.split("›").map((x) => x.trim());
    const path = (VDOM_PREFIX.test(want[0]) ? plain : plain.replace(VDOM_PREFIX, "")).split("›").map((x) => x.trim());
    return want.length <= path.length && want.every((w, i) => sameWords(w, path[i]));
  }
  const sub = words(m.replace(PLUS_SUFFIX, ""));
  const texts = [plain, plain.replace(VDOM_PREFIX, ""), ...heads, ...(name !== undefined ? [name] : [])];
  return texts.some((t) => hasWords(words(t), sub));
}

function waiverFor(er: EffectiveRule, u: Unit, label: string, now: Date): { active?: AppliedWaiver; expired: AppliedWaiver[] } {
  const heads = u.heads.map((h) => firstLine(h.line));
  const expired: AppliedWaiver[] = [];
  for (const w of er.waivers) {
    if (!waiverMatches(w.match, label, heads, u.name)) continue;
    if (w.expires < localDay(now)) {
      expired.push(w);
      continue;
    }
    return { active: w, expired };
  }
  return { expired };
}

function fixCtx(rule: Rule, u: Unit, roots: ConfigNode[], out: CondOut | null): FixCtx {
  const cands = candidates(u, roots, false);
  // Las capturas se leen de la línea ya enmascarada: un secreto nunca llega al plan.
  const pick = (pattern: string): string | undefined => {
    const re = rx(pattern);
    if (!re) return undefined;
    for (const n of cands) {
      const m = re.exec(maskLine(n.line));
      if (m) return m[1] ?? m[0];
    }
    return undefined;
  };
  const captures: Record<string, string> = {};
  for (const [k, p] of Object.entries(rule.capture ?? {})) {
    const v = pick(p);
    if (v !== undefined) captures[k] = v;
  }
  let computeFrom: string[] | null = null;
  if (rule.compute) {
    const v = pick(rule.compute.from);
    computeFrom = v === undefined ? null : fortiTokens(v);
  }
  return {
    ...(u.block ? { block: maskLine(firstLine(u.block.line)) } : {}),
    ...(u.child ? { child: maskLine(firstLine(u.child.line)) } : {}),
    ...(u.name !== undefined ? { name: maskLine(u.name) } : {}),
    ...(u.block?.ctx ? { ctx: u.block.ctx } : {}),
    captures,
    computeFrom,
    failed: out?.failed ?? [],
    offending: out?.offending ?? {},
  };
}

/** Ids de todas las condiciones (un bloque ausente cuenta como si todas fallaran). */
function condIds(c: Cond, out: string[] = []): string[] {
  if (c.id) out.push(c.id);
  if (c.type === "all" || c.type === "any") c.conditions.forEach((x) => condIds(x, out));
  return out;
}

function hasRemediation(rule: Rule, vendor: AuditVendor): boolean {
  return !!(rule.remediation?.[vendor]?.length || rule.prepare?.[vendor]?.length);
}

function fixKind(rule: Rule, vendor: AuditVendor): FixKind {
  if (rule.fix) return rule.fix;
  if (!hasRemediation(rule, vendor)) return "manual";
  return Object.values(rule.params ?? {}).some((p) => p.required && !p.default) ? "guided" : "auto";
}

function worst(states: Exclude<Status, "n/a">[]): Status {
  if (states.includes("fail")) return "fail";
  if (states.includes("review")) return "review";
  if (states.includes("waived")) return "waived";
  return "pass";
}

function resolveParams(er: EffectiveRule, given: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, spec] of Object.entries(er.rule.params ?? {})) {
    if (spec.secret) continue;
    const v = given[k] ?? er.paramDefaults[k] ?? spec.default;
    if (v !== undefined && v !== "") out[k] = v;
  }
  return out;
}

function condParams(c: Cond | undefined, out: Set<string>): void {
  if (!c) return;
  if (c.type === "all" || c.type === "any") return c.conditions.forEach((x) => condParams(x, out));
  if (c.type !== "value") return;
  for (const v of Array.isArray(c.value) ? c.value : [String(c.value)]) {
    const m = /^\{\{\s*([\w.-]+)\s*\}\}$/.exec(v);
    if (m) out.add(m[1]);
  }
}

export interface FilterParam {
  name: string;
  spec: ParamSpec;
  rules: string[];
}

/**
 * Parámetros que cambian qué se evalúa (filtros `scope.where`, `applicable` y `check`), no solo el plan:
 * sin ellos una interfaz WAN sin `role wan` queda fuera y la regla dice "No aplica". La interfaz los pide
 * antes de auditar.
 */
export function filterParams(resolved: ResolvedRules, vendor: AuditVendor): FilterParam[] {
  const out = new Map<string, FilterParam>();
  for (const er of resolved.rules) {
    if (er.rule.vendor !== vendor) continue;
    const names = new Set<string>();
    condParams(er.rule.scope?.where, names);
    condParams(er.rule.applicable, names);
    condParams(er.rule.check, names);
    for (const n of names) {
      const spec = er.rule.params?.[n];
      if (!spec || spec.secret) continue;
      const p = out.get(n) ?? { name: n, spec, rules: [] };
      p.rules.push(er.rule.id);
      out.set(n, p);
    }
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Evalúa una regla sobre el árbol. Exportada para la prueba en vivo del editor. */
export function evaluateRule(er: EffectiveRule, roots: ConfigNode[], vendor: AuditVendor, opts: { now?: Date; params?: Record<string, string>; platform?: string } = {}): Finding {
  const rule = er.rule;
  const now = opts.now ?? new Date();
  const base: Finding = {
    ruleId: rule.id,
    title: rule.title,
    severity: er.severity,
    layer: er.layer,
    packId: er.packId,
    packVersion: er.packVersion,
    vendor: rule.vendor,
    controls: rule.controls ?? [],
    refs: rule.refs ?? [],
    status: "n/a",
    reason: "",
    fix: fixKind(rule, vendor),
    remediable: hasRemediation(rule, vendor),
    ...(rule.description ? { description: rule.description } : {}),
    ...(rule.notes ? { notes: rule.notes } : {}),
    changes: er.changes,
    units: [],
    expiredWaivers: [],
  };
  const env: Env = { rule, roots, params: resolveParams(er, opts.params ?? {}) };
  try {
    if (opts.platform && rule.platforms?.length && !rule.platforms.includes(opts.platform)) return { ...base, reason: `No aplica a la plataforma ${opts.platform}` };
    const rootUnit: Unit = { heads: [], root: true };
    if (rule.applicable && evalCond(rule.applicable, rootUnit, env).state !== "pass") return { ...base, reason: "No aplica: la configuración no usa esta función" };
    const all = buildUnits(rule, roots);
    if (!all) {
      const st = rule.missingScope ?? "n/a";
      if (st === "n/a") return { ...base, reason: "No aplica: el bloque no existe en la configuración" };
      const u: Unit = { heads: [], root: false };
      const unit: UnitResult = {
        label: "(bloque ausente)",
        lineNo: 0,
        status: st,
        evidence: [{ lineNo: 0, text: "", kind: "missing", note: `No existe un bloque que calce con /${rule.scope!.block}/` }],
        fix: { ...fixCtx(rule, u, roots, null), failed: condIds(rule.check) },
      };
      return finalize(base, er, [unit], [{ u, unit }], now);
    }
    const units = rule.scope?.where ? all.filter((u) => evalCond(rule.scope!.where!, u, env).state === "pass") : all;
    if (!units.length) return { ...base, reason: "No aplica: ningún bloque cumple el filtro de la regla" };
    const results: { u: Unit; unit: UnitResult }[] = [];
    for (const u of units) {
      const out = evalCond(rule.check, u, env);
      let state: Exclude<Status, "n/a"> = out.state;
      let note: string | undefined;
      if (rule.reviewIf && (rule.reviewIf.from as string[]).includes(state)) {
        const re = mustRx(rule.reviewIf.match);
        const hit = candidates(u, roots, !!rule.reviewIf.deep).find((n) => re.test(n.line));
        if (hit) {
          note = `Revisar: ${shown(hit)}`;
          out.evidence.push(ev(hit, "info", "Este dato impide decidir"));
          state = "review";
        }
      }
      if (state === "fail" && rule.onFail === "review") {
        state = "review";
        note = "Requiere decisión humana: no hay corrección automática segura";
      }
      const label = unitLabel(u);
      const unit: UnitResult = { label, lineNo: (u.child ?? u.heads[0])?.lineNo ?? 0, status: state, evidence: out.evidence, fix: fixCtx(rule, u, roots, out), ...(note ? { note } : {}) };
      results.push({ u, unit });
    }
    return finalize(
      base,
      er,
      results.map((r) => r.unit),
      results,
      now,
    );
  } catch (e) {
    if (!(e instanceof BadRegex)) throw e;
    return { ...base, status: "review", reason: `La regla no se pudo evaluar: ${e.message}` };
  }
}

function finalize(base: Finding, er: EffectiveRule, units: UnitResult[], pairs: { u: Unit; unit: UnitResult }[], now: Date): Finding {
  const expired: AppliedWaiver[] = [];
  for (const { u, unit } of pairs) {
    if (unit.status !== "fail" && unit.status !== "review") continue;
    const w = waiverFor(er, u, unit.label, now);
    expired.push(...w.expired);
    if (w.active) {
      unit.waiver = w.active;
      unit.status = "waived";
    } else if (w.expired.length) unit.note = `${unit.note ? `${unit.note}. ` : ""}Excepción vencida el ${w.expired[0].expires}`;
  }
  const status = worst(units.map((u) => u.status));
  const n = units.length;
  const bad = units.filter((u) => u.status === "fail").length;
  const rev = units.filter((u) => u.status === "review").length;
  const wv = units.filter((u) => u.status === "waived").length;
  const of = n > 1 ? ` (${n} bloques)` : "";
  const reason =
    status === "pass"
      ? `Cumple${of}`
      : status === "fail"
        ? n > 1
          ? `${bad} de ${n} bloques no cumplen`
          : "No cumple"
        : status === "review"
          ? n > 1
            ? `${rev} de ${n} bloques por revisar`
            : (units[0].note ?? "No se puede decidir con la configuración disponible")
          : `Con excepción vigente${wv < n ? ` en ${wv} de ${n} bloques` : ""}`;
  const uniq = new Map(expired.map((w) => [`${w.packId}|${w.match ?? ""}|${w.expires}`, w]));
  return { ...base, status, reason, units, expiredWaivers: [...uniq.values()] };
}

// ---------- Auditoría ----------

const emptyCounts = (): Record<Status, number> => ({ pass: 0, fail: 0, review: 0, "n/a": 0, waived: 0 });

/** Audita una configuración con las reglas resueltas (resolveRules). */
export function runAudit(input: AuditInput, resolved: ResolvedRules, opts: AuditOptions = {}): AuditResult {
  const text = input.text.replace(/\r\n?/g, "\n");
  if (text.length > MAX_CONFIG_BYTES) throw new Error("La configuración supera 20 MB");
  const now = opts.now ?? new Date();
  const detected = detectVendor(text);
  const vendor = input.vendor ?? detected.vendor;
  if (!vendor) throw new Error(detected.reason);
  const platform = input.platform ?? (vendor === detected.vendor ? detected.platform : undefined);
  const roots = parseConfig(text, vendor);
  const mine = resolved.rules.filter((r) => r.rule.vendor === vendor);
  const findings = mine.map((er) => evaluateRule(er, roots, vendor, { now, params: opts.params, platform }));

  const counts = emptyCounts();
  const bySeverity = Object.fromEntries(SEVERITIES.map((s) => [s, emptyCounts()])) as Record<Severity, Record<Status, number>>;
  let passW = 0;
  let evalW = 0;
  for (const f of findings) {
    counts[f.status]++;
    bySeverity[f.severity][f.status]++;
    if (f.status === "pass" || f.status === "fail") {
      evalW += SEVERITY_WEIGHT[f.severity];
      if (f.status === "pass") passW += SEVERITY_WEIGHT[f.severity];
    }
  }
  const evaluated = counts.pass + counts.fail;
  const percent = evalW ? Math.round((1000 * passW) / evalW) / 10 : null;
  const threshold = opts.riskThreshold ?? DEFAULT_RISK_THRESHOLD;

  const fails = (s: Severity) => findings.filter((f) => f.status === "fail" && f.severity === s);
  const reasons: string[] = [];
  let level: RiskLevel = "low";
  if (fails("critical").length) {
    level = "critical";
    reasons.push(`${fails("critical").length} incumplimiento(s) crítico(s): ${fails("critical").map((f) => f.ruleId).join(", ")}`);
  }
  if (fails("high").length) {
    if (level === "low") level = "high";
    reasons.push(`${fails("high").length} incumplimiento(s) de severidad alta`);
  }
  if (percent !== null && percent < threshold) {
    if (level === "low") level = "high";
    reasons.push(`Puntaje ${fmtPct(percent)} bajo el umbral de ${threshold} %`);
  }
  if (level === "low" && fails("medium").length) {
    level = "medium";
    reasons.push(`${fails("medium").length} incumplimiento(s) de severidad media`);
  }
  if (!reasons.length) reasons.push(evaluated ? "Sin incumplimientos de severidad media o mayor" : "No hubo reglas evaluables");
  if (counts.review) reasons.push(`${counts.review} regla(s) por revisar quedan fuera del puntaje`);

  const touched = findings.filter((f) => f.status !== "n/a");
  const iso = [...new Set(touched.flatMap((f) => f.controls.filter((c) => isIsoFramework(c.framework)).map((c) => c.control)))].sort(isoSort);
  const frameworks: Record<string, number> = {};
  for (const f of touched) for (const fw of new Set(f.controls.map((c) => c.framework))) frameworks[fw] = (frameworks[fw] ?? 0) + 1;
  const evalTxt = `${evaluated} regla${evaluated === 1 ? "" : "s"} evaluada${evaluated === 1 ? "" : "s"}`;

  return {
    format: "netterminal-audit",
    formatVersion: 1,
    engine: AUDIT_ENGINE_VERSION,
    generatedAt: now.toISOString(),
    ...(input.device ? { device: input.device } : {}),
    ...(input.source ? { source: input.source } : {}),
    vendor,
    vendorDetected: detected,
    vendorOverridden: !!input.vendor && input.vendor !== detected.vendor,
    ...(platform ? { platform } : {}),
    input: { sha256: sha256Hex(text), lines: text.split("\n").length, bytes: new TextEncoder().encode(text).length },
    packs: resolved.packs,
    disabled: resolved.disabled,
    notes: resolved.notes,
    findings,
    counts,
    bySeverity,
    score: {
      percent,
      passWeight: passW,
      evaluatedWeight: evalW,
      evaluated,
      weights: { ...SEVERITY_WEIGHT },
      base: percent === null ? "Sin reglas evaluadas con peso" : `${fmtPct(percent)}: ${passW} de ${evalW} puntos, ponderado por severidad sobre ${evalTxt}`,
    },
    risk: { level, reasons, threshold },
    coverage: {
      rules: findings.length,
      evaluated,
      otherVendor: resolved.rules.length - mine.length,
      iso,
      isoTotal: ISO_TOTAL,
      frameworks,
      text: `${evalTxt} (${touched.length} aplicables), que tocan ${iso.length} de ${ISO_TOTAL} controles del Anexo A de ISO/IEC 27001:2022 (mapeo interpretativo propio)`,
      disclaimer: AUDIT_DISCLAIMER,
    },
  };
}

function isoSort(a: string, b: string): number {
  const pa = a.slice(2).split(".").map(Number);
  const pb = b.slice(2).split(".").map(Number);
  return pa[0] - pb[0] || pa[1] - pb[1];
}

/** Porcentaje con coma decimal ("6,9 %"). */
export const fmtPct = (p: number) => `${p.toFixed(1).replace(/\.0$/, "").replace(".", ",")} %`;

// ---------- Pruebas embebidas ----------

export interface RuleTestFailure {
  ruleId: string;
  test: string;
  expected: Status;
  got: Status;
  detail?: string;
}

/** Corre los tests embebidos de una regla (para el pack integrado, los importados y el editor). */
export function testRule(rule: Rule, now = new Date("2026-01-01T00:00:00Z")): RuleTestFailure[] {
  const out: RuleTestFailure[] = [];
  const er: EffectiveRule = { rule, layer: "user", packId: "test", packVersion: "0", severity: rule.severity, changes: [], waivers: [], paramDefaults: {}, order: 0 };
  (rule.tests ?? []).forEach((t, i) => {
    const name = t.name ?? `#${i + 1}`;
    const roots = parseConfig(t.config, rule.vendor);
    const f = evaluateRule(er, roots, rule.vendor, { now, params: t.params });
    if (f.status !== t.expect) out.push({ ruleId: rule.id, test: name, expected: t.expect, got: f.status, detail: f.reason });
    if (t.planIncludes?.length) {
      const plan = buildPlan({ vendor: rule.vendor, findings: [f] }, { rules: [er], disabled: [], notes: [], packs: [] }, [rule.id], { params: t.params });
      const lines = new Set([...plan.lines, ...plan.rollback].map((l) => l.text.trim()));
      for (const want of t.planIncludes) if (!lines.has(want.trim())) out.push({ ruleId: rule.id, test: name, expected: t.expect, got: f.status, detail: `Falta en el plan: ${want}` });
    }
  });
  return out;
}

// ---------- Plan de remediación ----------

export interface PlanSelection {
  rule: string;
  /** Índices de unidades (por defecto, todas las que no cumplen). */
  units?: number[];
}

export interface PlanOptions {
  params?: Record<string, string>;
  now?: Date;
}

export interface PlanLine {
  text: string;
  /** null en comentarios. */
  risk: Risk | null;
  rules: string[];
  comment: boolean;
}

export interface PlanParam {
  name: string;
  prompt: string;
  example?: string;
  secret: boolean;
  required: boolean;
  rules: string[];
  /** filled: el plan ya lo trae; pending: queda {{x}} y CLI Lab lo pide; secret: siempre {{x}} en campo oculto. */
  state: "filled" | "pending" | "secret";
}

export interface RemediationPlan {
  vendor: AuditVendor;
  rules: string[];
  lines: PlanLine[];
  rollback: PlanLine[];
  params: PlanParam[];
  warnings: string[];
  manual: { ruleId: string; title: string; note: string }[];
  /** Plan para CLI Lab: comandos y, al final, el rollback como comentario. */
  text: string;
  /** Rollback como script aparte. */
  rollbackText: string;
  riskCount: Record<Risk, number>;
}

const COMMENT: Partial<Record<AuditVendor, string>> = { fortinet: "#", juniper: "#", huawei: "#" };
const CONFIG_MODE: Partial<Record<AuditVendor, [string, string]>> = { cisco: ["configure terminal", "end"], arista: ["configure terminal", "end"], huawei: ["system-view", "return"] };
const commentOf = (v: AuditVendor) => COMMENT[v] ?? "!";
const VAR = /\{\{\s*([\w.-]+)\s*\}\}/g;

/** Error de un valor de parámetro (o null). Evita saltos, comillas y variables anidadas en el plan. */
export function paramValueError(spec: ParamSpec | undefined, value: string, vendor: AuditVendor): string | null {
  if (value.length > 200) return "máximo 200 caracteres";
  if (/[\r\n\0]/.test(value) || /[\u0000-\u001f\u007f]/.test(value)) return "no puede tener saltos ni caracteres de control";
  if (value.includes("{{") || value.includes("}}")) return "no puede tener {{ }}";
  if (vendor === "fortinet" && value.includes('"')) return "no puede tener comillas dobles";
  if (spec?.pattern) {
    const re = rx(spec.pattern, true);
    if (!re || !re.test(value)) return `no cumple el formato (${spec.example ?? spec.pattern})`;
  }
  return null;
}

interface Rendered {
  lines: string[];
  warnings: string[];
}

/** Rellena las plantillas de una unidad. Los secretos y parámetros faltantes quedan como {{x}}. */
function render(tpl: string[], fx: FixCtx, rule: Rule, vendor: AuditVendor, values: Record<string, string>, computed: string | null): Rendered {
  const out: string[] = [];
  const warnings: string[] = [];
  const c = commentOf(vendor);
  for (const raw of tpl) {
    let line = raw;
    let include = true;
    let each: string | null = null;
    for (;;) {
      let m: RegExpExecArray | null;
      if ((m = /^\?fail:([^:]+):/.exec(line))) include &&= fx.failed.includes(m[1]);
      else if ((m = /^\?(!?)current(?:\.([\w-]+))?:/.exec(line))) {
        const has = fx.captures[m[2] ?? "current"] !== undefined;
        include &&= m[1] ? !has : has;
      } else if ((m = /^\?param:([^:]+):/.exec(line))) include &&= values[m[1]] !== undefined;
      else if ((m = /^@each:([^:]+):/.exec(line))) each = m[1];
      else break;
      line = line.slice(m[0].length);
    }
    if (!include) continue;
    const items: (string | null)[] = each ? (fx.offending[each] ?? []) : [null];
    for (const item of items) {
      let l = line;
      if (l.includes("{{computed}}") && computed === "") {
        if (!rule.compute?.ifEmpty) continue;
        l = (l.match(/^\s*/)?.[0] ?? "") + rule.compute.ifEmpty;
      }
      let unresolved = "";
      l = l.replace(VAR, (whole, name: string) => {
        if (name === "block" || name === "child" || name === "name") {
          const v = fx[name];
          if (v === undefined) unresolved = name;
          return v ?? whole;
        }
        if (name === "current" || name.startsWith("current.")) {
          const v = fx.captures[name === "current" ? "current" : name.slice(8)];
          if (v === undefined) unresolved = name;
          return v ?? whole;
        }
        if (name === "computed") {
          if (computed === null) unresolved = name;
          return computed ?? whole;
        }
        if (name === "line") return item ?? whole;
        const spec = rule.params?.[name];
        if (spec?.secret) return whole;
        return values[name] ?? whole;
      });
      if (l.trim().startsWith(c)) out.push(l);
      else if (unresolved) {
        out.push(`${c} [${rule.id}] completar a mano ({{${unresolved}}} sin valor): ${l.trim()}`);
        warnings.push(`${rule.id}: una línea necesita {{${unresolved}}}, que no está en la configuración; quedó como comentario`);
      } else if (l.includes("****")) {
        out.push(`${c} [${rule.id}] valor enmascarado, completar a mano: ${l.trim()}`);
        warnings.push(`${rule.id}: una línea depende de un secreto enmascarado; quedó como comentario para completarla a mano`);
      } else out.push(l);
    }
  }
  return { lines: out, warnings };
}

interface PNode {
  key: string;
  text: string;
  children: PNode[];
  rules: Set<string>;
  comment: boolean;
  container: boolean;
}

/** Los comentarios sueltos de una regla se meten al comienzo del bloque que les sigue (quedan junto a sus comandos). */
function attachComments(nodes: PNode[]): PNode[] {
  const out: PNode[] = [];
  let pending: PNode[] = [];
  for (const n of nodes) {
    if (n.comment) pending.push(n);
    else {
      if (n.container && pending.length) n.children.unshift(...pending);
      else out.push(...pending);
      pending = [];
      out.push(n);
    }
  }
  return [...out, ...pending];
}

function toPNodes(nodes: ConfigNode[], rule: string, vendor: AuditVendor): PNode[] {
  return nodes.map((n) => ({
    key: n.comment ? n.raw.trim() : n.line.toLowerCase().replace(/\s+/g, " "),
    text: n.raw.trim(),
    children: toPNodes(n.children, rule, vendor),
    rules: new Set([rule]),
    comment: !!n.comment,
    container: n.children.length > 0 || (vendor === "fortinet" && /^(config|edit)\s/i.test(n.line)),
  }));
}

/** Une hijos sin repetir aperturas ni líneas; avisa si dos reglas fijan valores distintos para el mismo "set". */
function mergeChildren(into: PNode, from: PNode, warnings: string[], vendor: AuditVendor): void {
  for (const r of from.rules) into.rules.add(r);
  for (const s of from.children) {
    const same = into.children.find((t) => t.key === s.key && t.container === s.container);
    if (same) {
      if (s.container) mergeChildren(same, s, warnings, vendor);
      else for (const r of s.rules) same.rules.add(r);
      continue;
    }
    if (vendor === "fortinet" && /^set \S+/.test(s.key)) {
      const k = /^set \S+/.exec(s.key)![0];
      const clash = into.children.find((t) => !t.container && t.key.startsWith(`${k} `));
      if (clash) warnings.push(`Dos reglas fijan "${k}" con valores distintos en ${into.text}: revisa cuál dejar (${[...clash.rules, ...s.rules].join(", ")})`);
    }
    if (s.comment) {
      // Los comentarios quedan al comienzo del bloque, junto a los de las otras reglas.
      const at = into.children.findIndex((t) => !t.comment);
      into.children.splice(at < 0 ? into.children.length : at, 0, s);
    } else into.children.push(s);
  }
}

/**
 * Arma una sección del plan sin duplicar aperturas de bloque. Un bloque solo se reutiliza si quedó
 * después de las líneas de las reglas que deben ir antes (prerrequisitos); si no, se abre de nuevo.
 */
function assemble(contribs: { rule: string; nodes: PNode[] }[], before: (rule: string) => Set<string>, warnings: string[], vendor: AuditVendor): PNode[] {
  const out: PNode[] = [];
  const lastIdx = new Map<string, number>();
  const mark = (i: number, rules: Set<string>) => {
    for (const r of rules) lastIdx.set(r, Math.max(lastIdx.get(r) ?? -1, i));
  };
  for (const c of contribs) {
    let min = -1;
    const pre = before(c.rule);
    for (const p of pre) min = Math.max(min, lastIdx.get(p) ?? -1);
    for (const s of c.nodes) {
      if (s.container) {
        // Sirve un bloque posterior a los prerrequisitos o uno que ya trae líneas de ellos (van antes dentro del bloque).
        const idx = out.findIndex((t, i) => t.container && t.key === s.key && (i >= min || [...t.rules].some((r) => pre.has(r))));
        if (idx >= 0) {
          mergeChildren(out[idx], s, warnings, vendor);
          mark(idx, s.rules);
        } else {
          out.push(s);
          mark(out.length - 1, s.rules);
        }
        continue;
      }
      // Una línea suelta (o comentario) idéntica ya incluida antes no se repite.
      const prev = out.findIndex((t) => !t.container && t.key === s.key);
      if (prev >= 0) for (const r of s.rules) out[prev].rules.add(r);
      else {
        out.push(s);
        mark(out.length - 1, s.rules);
      }
    }
  }
  return out;
}

function serialize(nodes: PNode[], vendor: AuditVendor): PlanLine[] {
  const out: PlanLine[] = [];
  const push = (text: string, n: PNode, comment = n.comment) => out.push({ text, risk: comment ? null : computeRisk(text.trim()), rules: [...n.rules], comment });
  const forti = (n: PNode, depth: number) => {
    const pad = "    ".repeat(depth);
    push(pad + n.text, n);
    if (!n.container) return;
    for (const c of n.children) forti(c, depth + 1);
    push(pad + (/^edit\s/i.test(n.text) ? "next" : "end"), n, false);
  };
  const cisco = (n: PNode, depth: number) => {
    push(" ".repeat(depth) + n.text, n);
    for (const c of n.children) cisco(c, depth + 1);
  };
  for (const n of nodes) {
    if (vendor === "fortinet") forti(n, 0);
    else {
      cisco(n, 0);
      if (n.children.length) push("exit", n, false);
    }
  }
  return out;
}

/** Orden de las reglas elegidas: prerrequisitos (`after`) primero; empates por orden del pack. */
function topoOrder(ids: string[], byId: Map<string, EffectiveRule>, warnings: string[]): string[] {
  const set = new Set(ids);
  const deps = new Map(ids.map((id) => [id, (byId.get(id)?.rule.after ?? []).filter((p) => set.has(p))]));
  const done: string[] = [];
  const left = [...ids].sort((a, b) => (byId.get(a)?.order ?? 0) - (byId.get(b)?.order ?? 0));
  while (left.length) {
    const i = left.findIndex((id) => deps.get(id)!.every((p) => done.includes(p)));
    if (i < 0) {
      warnings.push(`Dependencia circular entre ${left.join(", ")}: se usa el orden del pack`);
      done.push(...left);
      break;
    }
    done.push(left.splice(i, 1)[0]);
  }
  return done;
}

function closure(id: string, edges: (id: string) => string[]): Set<string> {
  const seen = new Set<string>();
  const stack = [...edges(id)];
  while (stack.length) {
    const x = stack.pop()!;
    if (seen.has(x)) continue;
    seen.add(x);
    stack.push(...edges(x));
  }
  return seen;
}

function wrapCtx(lines: string[], ctx: string | undefined, vendor: AuditVendor): string[] {
  if (vendor !== "fortinet" || !ctx || !lines.length) return lines;
  if (ctx === "global") return ["config global", ...lines, "end"];
  return ["config vdom", `edit ${ctx.slice(5)}`, ...lines, "next", "end"];
}

/**
 * Plan de remediación de los hallazgos elegidos: prerrequisitos (`prepare`) primero, luego las
 * correcciones en orden seguro (`after`), sin repetir aperturas de bloque. Cada línea lleva su riesgo
 * (computeRisk). El rollback se arma en paralelo, en orden inverso. Nunca se envía nada: el texto se
 * abre en CLI Lab, que pide los parámetros pendientes (los secretos en campo oculto) y confirma.
 */
export function buildPlan(result: Pick<AuditResult, "vendor" | "findings"> & Partial<AuditResult>, resolved: ResolvedRules, selection: (string | PlanSelection)[], opts: PlanOptions = {}): RemediationPlan {
  const vendor = result.vendor;
  const c = commentOf(vendor);
  const warnings: string[] = [];
  const manual: RemediationPlan["manual"] = [];
  const byId = new Map(resolved.rules.map((r) => [r.rule.id, r]));
  const findings = new Map(result.findings.map((f) => [f.ruleId, f]));
  const sel = selection.map((s) => (typeof s === "string" ? { rule: s } : s));
  const chosen: { er: EffectiveRule; f: Finding; units: UnitResult[] }[] = [];
  for (const s of sel) {
    const er = byId.get(s.rule);
    const f = findings.get(s.rule);
    if (!er || !f) {
      warnings.push(`${s.rule}: no está en el resultado`);
      continue;
    }
    const units = f.units.filter((u, i) => (u.status === "fail" || u.status === "review") && (!s.units || s.units.includes(i)));
    if (!units.length) continue;
    chosen.push({ er, f, units });
  }
  const order = topoOrder(
    chosen.map((x) => x.er.rule.id),
    byId,
    warnings,
  );
  const chosenIds = new Set(order);
  const byRule = new Map(chosen.map((x) => [x.er.rule.id, x]));

  // Prerrequisitos que no se van a corregir.
  for (const id of order) {
    for (const p of byId.get(id)?.rule.after ?? []) {
      const pf = findings.get(p);
      if (!chosenIds.has(p) && pf && (pf.status === "fail" || pf.status === "review")) warnings.push(`${id} conviene aplicarla después de corregir ${p} (${pf.title}), que no está en el plan`);
    }
  }

  // Valores de parámetros.
  const given = opts.params ?? {};
  const paramInfo = new Map<string, PlanParam>();
  const filled = new Set<string>();
  const valuesFor = (er: EffectiveRule): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [k, spec] of Object.entries(er.rule.params ?? {})) {
      if (spec.secret) continue;
      const v = given[k] ?? er.paramDefaults[k] ?? spec.default;
      if (v === undefined || v === "") continue;
      const bad = paramValueError(spec, v, vendor);
      if (bad) warnings.push(`Parámetro ${k}: ${bad}; quedará como variable para completar en CLI Lab`);
      else {
        out[k] = v;
        filled.add(k);
      }
    }
    return out;
  };

  // Remediación calculada: une lo que quitan varias reglas sobre la misma línea de la misma unidad.
  const unitKey = (fx: FixCtx) => `${fx.ctx ?? ""}\u0000${fx.block ?? ""}\u0000${fx.child ?? ""}`;
  const removals = new Map<string, Set<string>>();
  for (const id of order) {
    const { er, units } = byRule.get(id)!;
    const comp = er.rule.compute;
    if (!comp) continue;
    for (const u of units) {
      const k = `${unitKey(u.fix)}\u0000${comp.key}`;
      const s = removals.get(k) ?? new Set<string>();
      comp.remove.forEach((x) => s.add(x.toLowerCase()));
      removals.set(k, s);
    }
  }
  const computedFor = (er: EffectiveRule, fx: FixCtx): string | null => {
    const comp = er.rule.compute;
    if (!comp || fx.computeFrom === null) return null;
    const rm = removals.get(`${unitKey(fx)}\u0000${comp.key}`) ?? new Set(comp.remove.map((x) => x.toLowerCase()));
    return fx.computeFrom.filter((t) => !rm.has(t.toLowerCase())).join(" ");
  };

  type Section = "pre" | "main" | "rb" | "rbpre";
  const contribs: Record<Section, { rule: string; nodes: PNode[] }[]> = { pre: [], main: [], rb: [], rbpre: [] };
  const KEYS: Record<Section, "prepare" | "remediation" | "rollback" | "rollbackPrepare"> = { pre: "prepare", main: "remediation", rb: "rollback", rbpre: "rollbackPrepare" };
  const rbOrder = [...order].reverse();
  for (const sec of ["pre", "main", "rb", "rbpre"] as Section[]) {
    for (const id of sec === "rb" || sec === "rbpre" ? rbOrder : order) {
      const { er, f, units } = byRule.get(id)!;
      const rule = er.rule;
      const tpl = rule[KEYS[sec]]?.[vendor];
      if (sec === "main" && !hasRemediation(rule, vendor)) {
        manual.push({ ruleId: id, title: f.title, note: rule.notes ?? "Corrección manual: revisa la regla y aplica el cambio a mano" });
        contribs.main.push({ rule: id, nodes: toPNodes(parseConfig(`${c} [${id}] Corrección manual: ${f.title}. ${rule.notes ?? ""}`.trim(), vendor, { keepComments: true, flatten: false }), id, vendor) });
        continue;
      }
      if (!tpl?.length) continue;
      const values = valuesFor(er);
      for (const u of units) {
        const r = render(tpl, u.fix, rule, vendor, values, computedFor(er, u.fix));
        warnings.push(...r.warnings);
        let lines = r.lines;
        if (sec === "main" && (f.fix === "guided" || u.status === "review")) lines = [`${c} [${id}] Revisa los valores antes de aplicar (${f.fix === "guided" ? "corrección guiada" : "hallazgo por revisar"})`, ...lines];
        const text = wrapCtx(lines, u.fix.ctx, vendor).join("\n");
        if (!text.trim()) continue;
        contribs[sec].push({ rule: id, nodes: attachComments(toPNodes(parseConfig(text, vendor, { keepComments: true, flatten: false }), id, vendor)) });
      }
      for (const [k, spec] of Object.entries(rule.params ?? {})) {
        const p = paramInfo.get(k) ?? { name: k, prompt: spec.prompt, ...(spec.example ? { example: spec.example } : {}), secret: !!spec.secret, required: !!spec.required, rules: [], state: "pending" as const };
        if (!p.rules.includes(id)) p.rules.push(id);
        paramInfo.set(k, p);
      }
    }
  }

  const deps = (id: string) => (byId.get(id)?.rule.after ?? []).filter((p) => chosenIds.has(p));
  const dependents = (id: string) => order.filter((x) => deps(x).includes(id));
  const fwd = (id: string) => closure(id, deps);
  const back = (id: string) => closure(id, dependents);
  // Modo configuración (Cisco, Arista, Huawei): se entra al comienzo y se sale al final.
  const wrap = CONFIG_MODE[vendor];
  const mk = (text: string): PlanLine => ({ text, risk: computeRisk(text), rules: [], comment: false });
  const inMode = (ls: PlanLine[]) => (wrap && ls.some((l) => !l.comment) ? [mk(wrap[0]), ...ls, mk(wrap[1])] : ls);
  const main = inMode([...serialize(assemble(contribs.pre, fwd, warnings, vendor), vendor), ...serialize(assemble(contribs.main, fwd, warnings, vendor), vendor)]);
  const rollback = inMode([...serialize(assemble(contribs.rb, back, warnings, vendor), vendor), ...serialize(assemble(contribs.rbpre, back, warnings, vendor), vendor)]);

  // Estado de cada parámetro según lo que quedó en el texto.
  const used = new Set<string>();
  for (const l of [...main, ...rollback]) for (const m of l.text.matchAll(VAR)) used.add(m[1]);
  const params: PlanParam[] = [];
  for (const p of paramInfo.values()) {
    const state: PlanParam["state"] = p.secret ? "secret" : used.has(p.name) ? "pending" : "filled";
    if (state !== "filled" ? !used.has(p.name) : !filled.has(p.name)) continue;
    params.push({ ...p, state });
    if (state === "pending" && p.required) warnings.push(`Falta ${p.name} (${p.prompt}): CLI Lab lo pedirá antes de ejecutar`);
  }

  const riskCount: Record<Risk, number> = { read: 0, change: 0, disruptive: 0 };
  for (const l of main) if (l.risk) riskCount[l.risk]++;
  const stamp = (opts.now ?? new Date()).toISOString().slice(0, 16).replace("T", " ");
  const head = [
    `${c} Plan de remediación generado por NetTerminal (${stamp} UTC)${result.device ? ` para ${result.device}` : ""}`,
    `${c} Revisa cada línea antes de aplicarla. NetTerminal no envía nada por sí solo.`,
    ...(params.some((p) => p.state !== "filled") ? [`${c} Variables que pedirá CLI Lab: ${params.filter((p) => p.state !== "filled").map((p) => `{{${p.name}}}`).join(", ")}`] : []),
  ];
  const rbBody = rollback.map((l) => l.text);
  const text = [
    ...head,
    ...main.map((l) => l.text),
    ...(rollback.length ? [c, `${c} ===== Rollback (no se ejecuta; también disponible como script aparte) =====`, ...rbBody.map((l) => (l.trim().startsWith(c) ? l : `${c} ${l}`))] : []),
  ].join("\n");
  const rollbackText = rollback.length ? [`${c} Rollback del plan de NetTerminal (${stamp} UTC)${result.device ? ` para ${result.device}` : ""}`, ...rbBody].join("\n") : "";
  return { vendor, rules: order, lines: main, rollback, params, warnings: [...new Set(warnings)], manual, text, rollbackText, riskCount };
}

// ---------- Exportaciones ----------

const unitWaiver = (w?: AppliedWaiver) => (w ? `${w.reason} (aprobó ${w.approvedBy}, vence ${w.expires}${w.ticket ? `, ${w.ticket}` : ""})` : "");
const controlsText = (cs: Control[]) => cs.map((c) => `${c.framework} ${c.control}`).join("; ");

/** CSV (UTF-8 con BOM): una fila por bloque evaluado. */
export function auditToCsv(r: AuditResult): string {
  const head = ["regla", "titulo", "capa", "pack", "control", "severidad", "estado", "equipo", "bloque", "linea", "evidencia", "excepcion"];
  const rows: string[][] = [];
  for (const f of r.findings) {
    const common = [f.ruleId, f.title, LAYER_LABEL[f.layer], `${f.packId}@${f.packVersion}`, controlsText(f.controls), SEVERITY_LABEL[f.severity]];
    if (!f.units.length) {
      rows.push([...common, STATUS_LABEL[f.status], r.device ?? "", "", "", f.reason, ""]);
      continue;
    }
    for (const u of f.units)
      rows.push([
        ...common,
        STATUS_LABEL[u.status],
        r.device ?? "",
        u.label,
        u.lineNo ? String(u.lineNo) : "",
        u.evidence.map((e) => `${e.lineNo ? `${e.lineNo}: ` : ""}${e.text}${e.note ? ` (${e.note})` : ""}`).join(" | "),
        unitWaiver(u.waiver),
      ]);
  }
  return CSV_BOM + [head.join(","), ...rows.map((row) => row.map(csvCell).join(","))].join("\n") + "\n";
}

/** JSON del resultado (sin los datos internos de remediación), con hash del input y versión de los packs. */
export function auditToJson(r: AuditResult): string {
  return JSON.stringify(r, (k, v) => (k === "fix" && v && typeof v === "object" ? undefined : v), 2);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const STATUS_ORDER: Record<Status, number> = { fail: 0, review: 1, waived: 2, pass: 3, "n/a": 4 };

/** Informe HTML autocontenido (sin scripts ni recursos externos; todo el texto escapado). */
export function auditToHtml(r: AuditResult, plan?: RemediationPlan): string {
  const sorted = [...r.findings].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity]);
  const pill = (cls: string, txt: string) => `<span class="pill ${cls}">${esc(txt)}</span>`;
  const finding = (f: Finding) => {
    const units = f.units
      .filter((u) => u.status !== "pass" || f.units.length === 1)
      .map(
        (u) =>
          `<div class="unit"><div>${pill(`s-${u.status.replace("/", "")}`, STATUS_LABEL[u.status])} <b>${esc(u.label)}</b>${u.lineNo ? ` <span class="muted">línea ${u.lineNo}</span>` : ""}${u.note ? ` <span class="muted">${esc(u.note)}</span>` : ""}</div>` +
          (u.evidence.length ? `<pre>${u.evidence.map((e) => `${e.lineNo ? `${String(e.lineNo).padStart(5)}  ` : "       "}${esc(e.text)}${e.note ? `   « ${esc(e.note)}` : ""}`).join("\n")}</pre>` : "") +
          (u.waiver ? `<div class="waiver">Excepción: ${esc(unitWaiver(u.waiver))}</div>` : "") +
          `</div>`,
      )
      .join("");
    return `<details${f.status === "fail" ? " open" : ""}><summary>${pill(`s-${f.status.replace("/", "")}`, STATUS_LABEL[f.status])} ${pill(`v-${f.severity}`, SEVERITY_LABEL[f.severity])} <b>${esc(f.ruleId)}</b> ${esc(f.title)} <span class="muted">${esc(f.reason)}</span></summary>
<div class="meta">Controles: ${esc(controlsText(f.controls)) || "sin mapeo"}${f.refs.length ? ` · Referencias: ${esc(f.refs.join(", "))}` : ""} · Capa: ${esc(LAYER_LABEL[f.layer])} (${esc(f.packId)} ${esc(f.packVersion)}) · Corrección: ${esc(f.fix === "auto" ? "automática" : f.fix === "guided" ? "guiada" : "manual")}</div>
${f.description ? `<p>${esc(f.description)}</p>` : ""}${f.notes ? `<p class="muted">${esc(f.notes)}</p>` : ""}${f.changes.length ? `<p class="muted">Cambios de capa: ${esc(f.changes.join("; "))}</p>` : ""}${f.expiredWaivers.length ? `<p class="warn">Excepción vencida: ${esc(f.expiredWaivers.map((w) => unitWaiver(w)).join("; "))}</p>` : ""}${units}</details>`;
  };
  const waivers = r.findings.flatMap((f) => f.units.filter((u) => u.waiver).map((u) => `<tr><td>${esc(f.ruleId)}</td><td>${esc(u.label)}</td><td>${esc(u.waiver!.reason)}</td><td>${esc(u.waiver!.approvedBy)}</td><td>${esc(u.waiver!.expires)}</td></tr>`));
  const planHtml = plan
    ? `<h2>Plan de remediación</h2>${plan.warnings.length ? `<ul class="warn">${plan.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>` : ""}<p class="muted">Riesgo de las líneas: ${plan.riskCount.read} consulta, ${plan.riskCount.change} cambio, ${plan.riskCount.disruptive} disruptivo. NetTerminal no aplica nada por sí solo.</p><pre>${esc(plan.text)}</pre>${plan.rollbackText ? `<h3>Rollback</h3><pre>${esc(plan.rollbackText)}</pre>` : ""}`
    : "";
  const sevRows = SEVERITIES.map((s) => `<tr><td>${esc(SEVERITY_LABEL[s])} (peso ${SEVERITY_WEIGHT[s]})</td>${(["pass", "fail", "review", "waived", "n/a"] as Status[]).map((st) => `<td>${r.bySeverity[s][st]}</td>`).join("")}</tr>`).join("");
  const iso = r.coverage.iso.map((c) => `${c}${ISO_TITLES[c] ? ` ${ISO_TITLES[c]}` : ""}`).join(", ");
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Auditoría de configuración${r.device ? ` · ${esc(r.device)}` : ""}</title>
<style>
:root{--fg:#1d2330;--muted:#5b6475;--bg:#fff;--line:#d9dee7;--fail:#b42318;--pass:#1a7f37;--review:#9a6700;--waived:#6639ba;--na:#6e7781}
body{font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--fg);background:var(--bg);margin:0 auto;max-width:1100px;padding:24px 16px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 8px;border-bottom:1px solid var(--line);padding-bottom:4px}h3{font-size:15px}
.muted{color:var(--muted)}.warn{color:var(--review)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin:16px 0}
.card{border:1px solid var(--line);border-radius:8px;padding:12px}.card b{display:block;font-size:22px}
table{border-collapse:collapse;width:100%;margin:8px 0}td,th{border:1px solid var(--line);padding:4px 8px;text-align:left;font-size:13px}
details{border:1px solid var(--line);border-radius:8px;margin:8px 0;padding:8px 12px}summary{cursor:pointer}
.meta{font-size:12px;color:var(--muted);margin:6px 0}.unit{margin:8px 0 0}
pre{background:#f5f7fa;border:1px solid var(--line);border-radius:6px;padding:8px;overflow:auto;font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre-wrap;word-break:break-all}
.pill{display:inline-block;border-radius:10px;padding:0 8px;font-size:12px;font-weight:600;border:1px solid currentColor}
.s-fail{color:var(--fail)}.s-pass{color:var(--pass)}.s-review{color:var(--review)}.s-waived{color:var(--waived)}.s-na{color:var(--na)}
.v-critical{color:#8e1b10}.v-high{color:var(--fail)}.v-medium{color:var(--review)}.v-low{color:#0b5cad}.v-info{color:var(--na)}
.r-critical,.r-high{color:var(--fail)}.r-medium{color:var(--review)}.r-low{color:var(--pass)}
.waiver{font-size:12px;color:var(--waived)}
@media print{details{break-inside:avoid}details:not([open])>*:not(summary){display:none}}
</style></head><body>
<h1>Auditoría de configuración${r.device ? ` · ${esc(r.device)}` : ""}</h1>
<div class="muted">${esc(VENDOR_LABEL[r.vendor])}${r.platform ? ` (${esc(r.platform)})` : ""} · ${esc(r.generatedAt)} · motor ${esc(r.engine)}${r.source ? ` · fuente: ${esc(r.source)}` : ""}</div>
<div class="grid">
<div class="card"><span class="muted">Puntaje ponderado</span><b>${r.score.percent === null ? "s/d" : esc(fmtPct(r.score.percent))}</b><span class="muted">${esc(r.score.base)}</span></div>
<div class="card"><span class="muted">Riesgo agregado</span><b class="r-${r.risk.level}">${esc(RISK_LABEL[r.risk.level])}</b><span class="muted">${esc(r.risk.reasons.join(". "))}</span></div>
<div class="card"><span class="muted">Resultado</span><b>${r.counts.fail} no cumplen</b><span class="muted">${r.counts.pass} cumplen, ${r.counts.review} por revisar, ${r.counts.waived} con excepción, ${r.counts["n/a"]} no aplican</span></div>
</div>
<h2>Cobertura declarada</h2>
<p>${esc(r.coverage.text)}.</p>${iso ? `<p class="muted">Controles tocados: ${esc(iso)}.</p>` : ""}
<p class="muted">${esc(r.coverage.disclaimer)} Pesos: crítica 10, alta 5, media 3, baja 1, informativa 0; "revisar", "no aplica" y "excepción" quedan fuera del puntaje.</p>
<table><tr><th>Severidad</th><th>Cumple</th><th>No cumple</th><th>Revisar</th><th>Excepción</th><th>No aplica</th></tr>${sevRows}</table>
<h2>Hallazgos</h2>
${sorted.map(finding).join("\n")}
${waivers.length ? `<h2>Excepciones vigentes</h2><table><tr><th>Regla</th><th>Bloque</th><th>Motivo</th><th>Aprobó</th><th>Vence</th></tr>${waivers.join("")}</table>` : ""}
${planHtml}
<h2>Trazabilidad</h2>
<table><tr><th>Input (SHA-256)</th><td><code>${esc(r.input.sha256)}</code> · ${r.input.lines} líneas</td></tr>
<tr><th>Fabricante</th><td>${esc(VENDOR_LABEL[r.vendor])}${r.vendorOverridden ? " (elegido a mano)" : ""} · detección: ${esc(r.vendorDetected.reason)}</td></tr>
${r.packs.map((p) => `<tr><th>Pack ${esc(p.id)}</th><td>${esc(p.name)} ${esc(p.version)} · ${esc(LAYER_LABEL[p.layer])} · ${p.rules} reglas · <code>${esc(p.sha256.slice(0, 16))}</code></td></tr>`).join("")}
${r.disabled.length ? `<tr><th>Reglas desactivadas</th><td>${esc(r.disabled.map((d) => `${d.id} (${LAYER_LABEL[d.layer]}${d.reason ? `: ${d.reason}` : ""})`).join(", "))}</td></tr>` : ""}
</table>
<p class="muted">Evidencia con secretos enmascarados. Informe generado localmente por NetTerminal, sin red ni IA.</p>
</body></html>
`;
}
