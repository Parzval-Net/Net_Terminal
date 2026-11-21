// Auditoría, lado de la interfaz (src/lib/auditLib.ts): packs guardados, pack "Mis reglas" (activar,
// severidad, reglas propias y excepciones), regla simple del formulario con prueba en vivo, filtros de
// hallazgos y openLab(script) de CLI Lab. Configs ficticias con IPs de documentación (RFC 5737).
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, next) {
    if (/^\.\.?\//.test(specifier) && !/\.[cm]?[jt]s$/.test(specifier) && context.parentURL?.endsWith(".ts")) {
      try {
        return next(`${specifier}.ts`, context);
      } catch {
        /* sigue con la resolución normal */
      }
    }
    return next(specifier, context);
  },
});

const L = await import("../../src/lib/auditLib.ts");
const R = await import("../../src/lib/auditRules.ts");
const A = await import("../../src/lib/audit.ts");
const P = await import("../../src/lib/auditParse.ts");
const B = await import("../../src/lib/auditBuiltin.ts");
const Lab = await import("../../src/lib/cliLab.ts");

const NOW = new Date("2026-11-21T12:00:00Z");
const builtin = B.BUILTIN_RULE_PACKS.map((pack) => ({ pack, layer: "builtin" }));
const withUser = (user) => R.resolveRules([...builtin, { pack: user, layer: "user" }]);

const FORTI = `#config-version=FG200F-7.2.5-FW-build1517:opmode=0:vdom=0
config system global
    set admintimeout 480
    set hostname "fw-demo"
end
config system admin
    edit "admin"
        set accprofile "super_admin"
        set password ENC ****
    next
    edit "breakglass"
        set accprofile "super_admin"
        set password ENC ****
    next
end
config system interface
    edit "wan1"
        set ip 203.0.113.2 255.255.255.252
        set allowaccess ping https ssh http
        set role wan
    next
end
`;

// ---------- Packs guardados ----------
{
  const user = L.emptyUserPack();
  assert.equal(R.validateRulePack(user).errors.length, 0, "el pack vacío del usuario es válido");
  const loaded = L.loadStored([
    { layer: "user", file: "user-mis-reglas.json", pack: user },
    { layer: "imported", file: "imported-roto.json", error: "JSON inválido: x" },
    { layer: "imported", file: "imported-malo.json", pack: { format: "netterminal-rules", formatVersion: 1, id: "malo", name: "x", version: "1", rules: [{ id: "R1", title: "t", severity: "grave", vendor: "cisco", controls: [], check: { type: "present", match: "(a+)+$" } }] } },
  ]);
  assert.ok(loaded[0].pack);
  assert.equal(loaded[1].pack, null);
  assert.deepEqual(loaded[1].errors, ["JSON inválido: x"]);
  assert.equal(loaded[2].pack, null, "un pack guardado y alterado a mano se revalida y no se carga");
  assert.ok(loaded[2].errors.some((e) => /severidad/.test(e)));
  assert.ok(loaded[2].errors.some((e) => /regex|ReDoS|retroceso|anidad/i.test(e)), loaded[2].errors.join(" | "));
}

// ---------- Mis reglas: activar, severidad, excepciones ----------
{
  let u = L.emptyUserPack();
  u = L.setRuleEnabled(u, "NT-FOS-ADM-004", false, "Política propia de 30 minutos");
  assert.equal(u.version, "1.0.1", "cada cambio sube la versión del pack");
  let res = withUser(u);
  assert.ok(res.disabled.some((d) => d.id === "NT-FOS-ADM-004" && d.layer === "user"));
  u = L.setRuleEnabled(u, "NT-FOS-ADM-004", true);
  assert.equal(u.overrides.length, 0, "reactivar sin otros cambios quita el override");
  u = L.setRuleSeverity(u, "NT-FOS-ADM-004", "low");
  res = withUser(u);
  const er = res.rules.find((r) => r.rule.id === "NT-FOS-ADM-004");
  assert.equal(er.severity, "low");
  assert.ok(er.changes.some((c) => /Severidad media → baja por usuario/.test(c)));
  u = L.setRuleSeverity(u, "NT-FOS-ADM-004", null);
  assert.equal(u.overrides.length, 0);

  assert.deepEqual(L.waiverErrors({ reason: "", approvedBy: "", expires: "" }, "2026-11-21"), ["Escribe el motivo", "Indica quién la aprobó", "Elige la fecha de vencimiento"]);
  assert.deepEqual(L.waiverErrors({ reason: "x", approvedBy: "CISO", expires: "2026-01-01" }, "2026-11-21"), ["La fecha de vencimiento ya pasó"]);
  u = L.addWaiver(u, { rule: "NT-FOS-ADM-002", match: ' edit "breakglass" ', reason: " Cuenta de emergencia ", approvedBy: "CISO", expires: "2027-03-31", ticket: "" });
  assert.deepEqual(u.waivers[0], { rule: "NT-FOS-ADM-002", match: 'edit "breakglass"', reason: "Cuenta de emergencia", approvedBy: "CISO", expires: "2027-03-31" });
  assert.equal(R.validateRulePack(u).errors.length, 0);
  const r = A.runAudit({ text: FORTI }, withUser(u), { now: NOW });
  const adm = r.findings.find((f) => f.ruleId === "NT-FOS-ADM-002");
  assert.equal(adm.units.find((x) => x.label.includes("breakglass")).status, "waived", "la excepción aplica solo al bloque indicado");
  assert.equal(adm.units.find((x) => x.label.includes('"admin"')).status, "fail");
  u = L.removeWaiver(u, 0);
  assert.equal(u.waivers.length, 0);
}

// ---------- Regla simple del formulario ----------
{
  const f = { ...L.emptyForm("fortinet"), id: "USR-FGT-ADM-001", title: "Todo admin con trusthost", severity: "high", block: "^config system admin$", child: "^edit ", kind: "present", match: "^set trusthost1 ", iso: "a.8.5, 8.20", internal: "HRD-ADM-03", missingScope: "fail", remediation: "config system admin\nedit {{child}}\nset trusthost1 192.0.2.0 255.255.255.0\nnext\nend", rollback: "config system admin\nedit {{child}}\nunset trusthost1\nnext\nend" };
  const { rule, errors } = L.ruleFromForm(f);
  assert.deepEqual(errors, []);
  assert.deepEqual(
    rule.controls.map((c) => c.control),
    ["A.8.5", "A.8.20", "HRD-ADM-03"],
    "los controles ISO se normalizan (A.8.5) y el interno va aparte",
  );
  assert.equal(rule.fix, "guided", "una corrección escrita a mano se marca como guiada (revisar valores)");
  const er = { rule, layer: "user", packId: "mis-reglas", packVersion: "1", severity: rule.severity, changes: [], waivers: [], paramDefaults: {}, order: 0 };
  const live = A.evaluateRule(er, P.parseConfig(FORTI, "fortinet"), "fortinet", { now: NOW });
  assert.equal(live.status, "fail");
  assert.equal(live.units.length, 2);
  // Plan con la regla del formulario.
  const user = L.upsertRule(L.emptyUserPack(), rule);
  const res = withUser(user);
  const result = A.runAudit({ text: FORTI }, res, { now: NOW });
  const plan = A.buildPlan(result, res, ["USR-FGT-ADM-001"], { now: NOW });
  assert.ok(plan.text.includes('edit "admin"') && plan.text.includes("set trusthost1 192.0.2.0 255.255.255.0"));
  assert.ok(plan.rollbackText.includes("unset trusthost1"));
  // Ida y vuelta formulario → regla → formulario.
  assert.deepEqual(L.formFromRule(rule), { ...f, iso: "A.8.5, A.8.20" });
  assert.equal(L.formFromRule(B.BUILTIN_FORTIOS.rules.find((x) => x.capture || x.params)), null, "una regla avanzada no se edita en el formulario simple");

  // Errores claros y anti-ReDoS.
  assert.deepEqual(L.ruleFromForm({ ...f, id: "mal id", title: "", match: "" }).errors, [
    "El id usa letras, números, punto o guion (máx. 64), por ejemplo USR-SSH-001",
    "Escribe un título",
    "Escribe la línea a buscar (regex)",
  ]);
  const redos = L.ruleFromForm({ ...f, match: "^(a+)+$" });
  assert.equal(redos.rule, null);
  assert.ok(redos.errors.length && redos.errors.every((e) => !/^regla /.test(e)), redos.errors.join(" | "));
  assert.ok(L.ruleFromForm({ ...f, iso: "A.9.1" }).errors.some((e) => /Anexo A/.test(e)), "un control fuera del Anexo A de 2022 se rechaza");
  assert.ok(L.ruleFromForm({ ...f, remediation: "set x {{nada}}" }).errors.some((e) => /\{\{nada\}\}/.test(e)), "variable sin parámetro");
}

// ---------- Fuentes ----------
{
  assert.equal(L.readCommandError("show running-config"), null);
  assert.equal(L.readCommandError("show full-configuration"), null);
  assert.match(L.readCommandError("configure terminal"), /consulta/);
  assert.match(L.readCommandError("show run\nreload"), /Una sola línea/);
  assert.match(L.readCommandError("  "), /Escribe/);
  assert.equal(L.vendorOfSession({ platform: "fos72" }), "fortinet");
  assert.equal(L.vendorOfSession({ highlight: "cisco" }), "cisco");
  assert.equal(L.vendorOfSession({ highlight: "default" }), null);
  assert.equal(L.hostnameOf(FORTI), "fw-demo");
  assert.equal(L.hostnameOf("!\nhostname rt-borde01\n!"), "rt-borde01");
  assert.equal(L.hostnameOf("interface Gi0/0\n"), null);
  assert.equal(L.exportName("fw perímetro/01", "html", NOW), "auditoria-fw-perimetro-01-2026-11-21.html");
  assert.equal(L.exportName(undefined, "csv", NOW), "auditoria-2026-11-21.csv");
}

// ---------- Hallazgos: filtros, grupos y selección inicial ----------
{
  const res = withUser(L.emptyUserPack());
  const r = A.runAudit({ text: FORTI }, res, { now: NOW });
  const att = L.filterFindings(r.findings, { status: "attention", severity: "all", query: "" });
  assert.ok(att.length && att.every((f) => f.status === "fail" || f.status === "review" || f.expiredWaivers.length));
  assert.ok(L.filterFindings(r.findings, { status: "all", severity: "all", query: "a.8.5" }).every((f) => f.controls.some((c) => c.control === "A.8.5")));
  assert.ok(L.filterFindings(r.findings, { status: "all", severity: "critical", query: "" }).every((f) => f.severity === "critical"));
  const groups = L.groupBySeverity(r.findings);
  assert.deepEqual(
    groups.map(([s]) => s),
    ["critical", "high", "medium", "low", "info"].filter((s) => r.findings.some((f) => f.severity === s)),
  );
  for (const [, list] of groups) assert.ok(list.findIndex((f) => f.status !== "fail") === -1 || list.slice(list.findIndex((f) => f.status !== "fail")).every((f) => f.status !== "fail"), "lo que no cumple va primero");
  const sel = L.defaultSelection(r);
  assert.ok(sel.length && sel.every((id) => r.findings.find((f) => f.ruleId === id).fix === "auto"));
  assert.ok(sel.includes("NT-FOS-ADM-001"), "servicios de administración en la WAN");
}

// ---------- CLI Lab: openLab(script) ----------
{
  Lab.openLab("config system global\n    set admintimeout 10\nend");
  const first = Lab.labOpenState();
  assert.ok(first.script.startsWith("config system global"), "el plan queda precargado");
  Lab.openLab({ type: "click" });
  const second = Lab.labOpenState();
  assert.equal(second.script, undefined, "un evento de clic no es un script");
  assert.equal(second.n, first.n + 1);
  Lab.openLab("x".repeat(Lab.LAB_SCRIPT_MAX + 10));
  assert.equal(Lab.labOpenState().script.length, Lab.LAB_SCRIPT_MAX);
  Lab.closeLab();
  assert.equal(Lab.labOpenState(), null);
}

console.log("auditLib OK");
