/**
 * Auditoría de configuración, lado de la interfaz: packs guardados (importados y del usuario), el pack
 * propio que edita la Biblioteca de reglas (activar, severidad, reglas simples y excepciones), filtros
 * de hallazgos y nombres de archivo. Funciones puras (sin React ni Tauri) para poder probarlas.
 *
 * El motor está en audit.ts, auditRules.ts y auditParse.ts. Nada de aquí envía comandos al equipo.
 */
import { AUDIT_VENDORS, type AuditVendor } from "./auditParse";
import {
  SEVERITY_WEIGHT,
  validateRulePack,
  type Layer,
  type Override,
  type Rule,
  type RulePack,
  type Severity,
  type Status,
  type Waiver,
} from "./auditRules";
import type { AuditResult, Finding } from "./audit";
import { computeRisk } from "./packs";

/** Id del pack que edita la Biblioteca de reglas (capa "user"). */
export const USER_PACK_ID = "mis-reglas";
export const ISO_FRAMEWORK = "ISO/IEC 27001:2022";

/** Pack guardado en `<datos>/audit-rules` (auditrules.rs). */
export interface StoredPack {
  layer: Exclude<Layer, "builtin">;
  file: string;
  pack?: unknown;
  error?: string;
}

/** Pack listo para resolveRules, o el motivo por el que no se carga. */
export interface LoadedPack {
  layer: Exclude<Layer, "builtin">;
  file: string;
  pack: RulePack | null;
  errors: string[];
  warnings: string[];
}

/** Revalida cada pack guardado: uno alterado a mano o de una versión distinta no se carga en silencio. */
export function loadStored(list: StoredPack[]): LoadedPack[] {
  return list.map((s) => {
    if (s.error) return { layer: s.layer, file: s.file, pack: null, errors: [s.error], warnings: [] };
    const v = validateRulePack(s.pack);
    return { layer: s.layer, file: s.file, pack: v.pack, errors: v.errors, warnings: v.warnings };
  });
}

export function emptyUserPack(): RulePack {
  return { format: "netterminal-rules", formatVersion: 1, id: USER_PACK_ID, name: "Mis reglas", version: "1.0.0", description: "Reglas propias, cambios a reglas existentes y excepciones aprobadas.", rules: [], overrides: [], waivers: [] };
}

/** Sube la versión menor (1.0.3 → 1.0.4) para que el informe distinga versiones del pack propio. */
export function bumpVersion(v: string): string {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
  return m ? `${m[1]}.${m[2]}.${Number(m[3]) + 1}` : "1.0.0";
}

const touch = (p: RulePack, patch: Partial<RulePack>): RulePack => ({ ...p, ...patch, version: bumpVersion(p.version) });

/** Ajusta (o quita) el override de una regla. Un override vacío se elimina. */
function setOverride(p: RulePack, ruleId: string, patch: Partial<Override>): RulePack {
  const list = [...(p.overrides ?? [])];
  const i = list.findIndex((o) => o.rule === ruleId);
  const merged: Override = { ...(i >= 0 ? list[i] : { rule: ruleId }), ...patch };
  for (const k of Object.keys(merged) as (keyof Override)[]) if (merged[k] === undefined) delete merged[k];
  const empty = merged.enabled === undefined && merged.severity === undefined && !merged.params;
  if (i >= 0) {
    if (empty) list.splice(i, 1);
    else list[i] = merged;
  } else if (!empty) list.push(merged);
  return touch(p, { overrides: list });
}

/**
 * Activa o desactiva una regla. Una regla propia se marca en la misma regla (`enabled`); una de otra
 * capa, con un override. `base` es si la regla está activa sin el override (para no dejar overrides inútiles).
 */
export function setRuleEnabled(p: RulePack, ruleId: string, enabled: boolean, reason?: string): RulePack {
  const own = p.rules?.find((r) => r.id === ruleId);
  if (own) return touch(p, { rules: p.rules!.map((r) => (r.id === ruleId ? { ...r, enabled } : r)) });
  return setOverride(p, ruleId, { enabled: enabled ? undefined : false, reason: enabled ? undefined : reason || "Desactivada en la Biblioteca de reglas" });
}

/** Cambia la severidad (null vuelve a la de la regla). */
export function setRuleSeverity(p: RulePack, ruleId: string, severity: Severity | null): RulePack {
  const own = p.rules?.find((r) => r.id === ruleId);
  if (own) return severity ? touch(p, { rules: p.rules!.map((r) => (r.id === ruleId ? { ...r, severity } : r)) }) : p;
  return setOverride(p, ruleId, { severity: severity ?? undefined });
}

export function upsertRule(p: RulePack, rule: Rule): RulePack {
  const rules = [...(p.rules ?? [])];
  const i = rules.findIndex((r) => r.id === rule.id);
  if (i >= 0) rules[i] = rule;
  else rules.push(rule);
  return touch(p, { rules });
}

export function removeRule(p: RulePack, ruleId: string): RulePack {
  return touch(p, { rules: (p.rules ?? []).filter((r) => r.id !== ruleId), waivers: (p.waivers ?? []).filter((w) => w.rule !== ruleId), overrides: (p.overrides ?? []).filter((o) => o.rule !== ruleId) });
}

export function addWaiver(p: RulePack, w: Waiver & { rule: string }): RulePack {
  const clean: Waiver & { rule: string } = { rule: w.rule, reason: w.reason.trim(), approvedBy: w.approvedBy.trim(), expires: w.expires, ...(w.match?.trim() ? { match: w.match.trim() } : {}), ...(w.ticket?.trim() ? { ticket: w.ticket.trim() } : {}) };
  return touch(p, { waivers: [...(p.waivers ?? []), clean] });
}

export function removeWaiver(p: RulePack, index: number): RulePack {
  return touch(p, { waivers: (p.waivers ?? []).filter((_, i) => i !== index) });
}

/** Errores de una excepción antes de guardarla (los mismos criterios que validateRulePack). */
export function waiverErrors(w: Partial<Waiver>, today: string): string[] {
  const out: string[] = [];
  if (!w.reason?.trim()) out.push("Escribe el motivo");
  if (!w.approvedBy?.trim()) out.push("Indica quién la aprobó");
  if (!w.expires || !/^\d{4}-\d{2}-\d{2}$/.test(w.expires) || isNaN(Date.parse(`${w.expires}T00:00:00Z`))) out.push("Elige la fecha de vencimiento");
  else if (w.expires < today) out.push("La fecha de vencimiento ya pasó");
  return out;
}

// ---------- Regla simple desde el formulario ----------

export interface SimpleRuleForm {
  id: string;
  title: string;
  severity: Severity;
  vendor: AuditVendor;
  /** Regex de la línea que abre el bloque; vacío: se busca en la configuración global. */
  block: string;
  /** Regex de los hijos del bloque que son la unidad (FortiOS: `^edit `). */
  child: string;
  kind: "present" | "absent";
  /** Regex de la línea buscada dentro del bloque (o en la raíz). */
  match: string;
  /** Controles ISO separados por coma ("A.8.5, A.8.20"). */
  iso: string;
  /** Control de un estándar propio ("HRD-ADM-03"), opcional. */
  internal: string;
  missingScope: "n/a" | "fail" | "pass" | "review";
  remediation: string;
  rollback: string;
  notes: string;
}

export function emptyForm(vendor: AuditVendor = "cisco"): SimpleRuleForm {
  return { id: "USR-", title: "", severity: "medium", vendor, block: "", child: "", kind: "present", match: "", iso: "", internal: "", missingScope: "n/a", remediation: "", rollback: "", notes: "" };
}

const lines = (t: string) =>
  t
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.trim());

/** Regla del formulario. La valida el mismo validador de los packs importados (esquema y ReDoS). */
export function ruleFromForm(f: SimpleRuleForm): { rule: Rule | null; errors: string[] } {
  const isoList = f.iso
    .split(/[,;\s]+/)
    .map((x) => x.trim().toUpperCase().replace(/^(\d)/, "A.$1"))
    .filter(Boolean);
  const rem = lines(f.remediation);
  const rb = lines(f.rollback);
  const rule: Rule = {
    id: f.id.trim(),
    title: f.title.trim(),
    severity: f.severity,
    vendor: f.vendor,
    controls: [...isoList.map((control) => ({ framework: ISO_FRAMEWORK, control })), ...(f.internal.trim() ? [{ framework: "Estándar interno", control: f.internal.trim() }] : [])],
    // Las regex no se recortan: un espacio al final ("^edit ", "^line vty ") es parte del patrón.
    ...(f.block.trim() ? { scope: { block: f.block, ...(f.child.trim() ? { child: f.child } : {}), each: true }, missingScope: f.missingScope } : {}),
    check: { type: f.kind, match: f.match },
    ...(rem.length ? { remediation: { [f.vendor]: rem }, fix: "guided" as const } : { fix: "manual" as const }),
    ...(rb.length ? { rollback: { [f.vendor]: rb } } : {}),
    ...(f.notes.trim() ? { notes: f.notes.trim() } : {}),
  };
  const errors: string[] = [];
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(rule.id)) errors.push("El id usa letras, números, punto o guion (máx. 64), por ejemplo USR-SSH-001");
  if (!rule.title) errors.push("Escribe un título");
  if (!f.match.trim()) errors.push("Escribe la línea a buscar (regex)");
  if (errors.length) return { rule: null, errors };
  const v = validateRulePack({ format: "netterminal-rules", formatVersion: 1, id: "form", name: "form", version: "1", rules: [rule] });
  // El prefijo "regla X:" no aporta en el formulario.
  return v.pack ? { rule, errors: [] } : { rule: null, errors: v.errors.map((e) => e.replace(/^regla [^:]+: /, "").replace(/^regla [^.]+\./, "")) };
}

/** Formulario de una regla propia, si es "simple" (la que crea el formulario); null si no lo es. */
export function formFromRule(r: Rule): SimpleRuleForm | null {
  const c = r.check;
  if (c.type !== "present" && c.type !== "absent") return null;
  if (r.applicable || r.capture || r.compute || r.prepare || r.params || r.scope?.where) return null;
  const iso = r.controls.filter((x) => x.framework === ISO_FRAMEWORK).map((x) => x.control);
  const internal = r.controls.find((x) => x.framework !== ISO_FRAMEWORK)?.control ?? "";
  return {
    id: r.id,
    title: r.title,
    severity: r.severity,
    vendor: r.vendor,
    block: r.scope?.block ?? "",
    child: r.scope?.child ?? "",
    kind: c.type,
    match: c.match,
    iso: iso.join(", "),
    internal,
    missingScope: r.missingScope ?? "n/a",
    remediation: (r.remediation?.[r.vendor] ?? []).join("\n"),
    rollback: (r.rollback?.[r.vendor] ?? []).join("\n"),
    notes: r.notes ?? "",
  };
}

// ---------- Fuentes ----------

/** Nombre del equipo en la configuración (Cisco `hostname`, FortiOS `set hostname`, Huawei `sysname`). */
export function hostnameOf(text: string): string | null {
  const head = text.length > 400_000 ? text.slice(0, 400_000) : text;
  const m = /^hostname\s+(\S{1,64})\s*$/m.exec(head) ?? /^\s*set hostname\s+"?([^"\s]{1,64})"?\s*$/m.exec(head) ?? /^\s*sysname\s+(\S{1,64})\s*$/m.exec(head);
  return m ? m[1] : null;
}

/** Comando de lectura sugerido por fabricante: FortiOS completo para no caer en valores por defecto omitidos. */
export const READ_COMMAND: Record<AuditVendor, string> = {
  cisco: "show running-config",
  arista: "show running-config",
  fortinet: "show full-configuration",
  huawei: "display current-configuration",
  juniper: "show configuration | display set",
};

/** Fabricante probable de una sesión (por plataforma detectada o resaltado). */
export function vendorOfSession(s: { platform?: string; highlight?: string }): AuditVendor | null {
  const p = s.platform ?? "";
  if (/^fos/.test(p) || s.highlight === "fortinet") return "fortinet";
  if (/^(ios|iosxe|ios-xe|nxos)/.test(p) || s.highlight === "cisco") return "cisco";
  if (/^(vrp|yunshan)/.test(p) || s.highlight === "huawei") return "huawei";
  if (p === "junos" || s.highlight === "juniper") return "juniper";
  if (/^eos/.test(p) || s.highlight === "arista") return "arista";
  return null;
}

/** Error del comando de lectura, o null: una sola línea que el motor de riesgo clasifica como consulta. */
export function readCommandError(cmd: string): string | null {
  const c = cmd.trim();
  if (!c) return "Escribe el comando de lectura";
  if (/[\r\n]/.test(c)) return "Una sola línea";
  if (computeRisk(c) !== "read") return "Solo se permiten comandos de consulta (el motor de riesgo lo clasifica como cambio)";
  return null;
}

// ---------- Hallazgos ----------

export type StatusFilter = "attention" | "all" | Status;

export interface FindingFilter {
  status: StatusFilter;
  severity: Severity | "all";
  query: string;
}

/** "attention": lo que hay que mirar (no cumple, por revisar, excepciones vencidas). */
export function filterFindings(list: Finding[], f: FindingFilter): Finding[] {
  const q = f.query.trim().toLowerCase();
  return list.filter((x) => {
    if (f.status === "attention" ? !(x.status === "fail" || x.status === "review" || x.expiredWaivers.length) : f.status !== "all" && x.status !== f.status) return false;
    if (f.severity !== "all" && x.severity !== f.severity) return false;
    if (!q) return true;
    const hay = [x.ruleId, x.title, x.reason, ...x.controls.map((c) => `${c.framework} ${c.control}`), ...x.refs, ...x.units.map((u) => u.label)].join(" ").toLowerCase();
    return hay.includes(q);
  });
}

const STATUS_RANK: Record<Status, number> = { fail: 0, review: 1, waived: 2, pass: 3, "n/a": 4 };

/** Grupos por severidad (de crítica a informativa), con lo que no cumple primero dentro de cada grupo. */
export function groupBySeverity(list: Finding[]): [Severity, Finding[]][] {
  const order: Severity[] = ["critical", "high", "medium", "low", "info"];
  return order
    .map((s) => [s, list.filter((f) => f.severity === s).sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.ruleId.localeCompare(b.ruleId))] as [Severity, Finding[]])
    .filter(([, l]) => l.length);
}

/** Hallazgos que se pueden poner en el plan (no cumplen o por revisar, con al menos una unidad). */
export const plannable = (r: AuditResult) => r.findings.filter((f) => (f.status === "fail" || f.status === "review") && f.units.some((u) => u.status === "fail" || u.status === "review"));

/** Selección inicial del plan: lo que no cumple y tiene corrección automática, de mayor a menor peso. */
export function defaultSelection(r: AuditResult): string[] {
  return plannable(r)
    .filter((f) => f.status === "fail" && f.fix === "auto" && f.remediable)
    .sort((a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity])
    .map((f) => f.ruleId);
}

/** Nombre de archivo para exportar: "auditoria-fw-perimetro-2026-11-21.html". */
export function exportName(device: string | undefined, ext: string, now = new Date()): string {
  const dev = (device ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  const d = now.toISOString().slice(0, 10);
  return `auditoria-${dev ? `${dev}-` : ""}${d}.${ext}`;
}

export const isVendor = (v: unknown): v is AuditVendor => AUDIT_VENDORS.includes(v as AuditVendor);
