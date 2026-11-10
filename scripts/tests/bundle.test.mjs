// Pruebas de la parte de interfaz del archivo cifrado (.ntx) y del bloqueo automático de la bóveda:
// `node scripts/tests/bundle.test.mjs` (Node 22.15+ con tipos TS). El cifrado, las contraseñas y la
// validación de sesiones se prueban en Rust (src-tauri/src/bundle.rs, credentials.rs, datafiles.rs).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

const B = await import("../../src/lib/bundle.ts");
const S = await import("../../src/lib/settings.ts");
const V = await import("../../src/lib/vaultLock.ts");

const rust = readFileSync(new URL("../../src-tauri/src/bundle.rs", import.meta.url), "utf8");

// ---------- Paridad con Rust ----------
{
  const block = rust.match(/pub const SETTINGS_EXCLUDED: \[&str; (\d+)\] = \[([\s\S]*?)\];/);
  assert.ok(block, "SETTINGS_EXCLUDED en bundle.rs");
  const keys = [...block[2].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.equal(keys.length, Number(block[1]));
  assert.deepEqual([...B.SETTINGS_EXCLUDED], keys, "misma lista de ajustes excluidos en Rust y en la interfaz");
  const safe = rust.match(/pub const SETTINGS_SAFE_ONLY[^=]*= \[([\s\S]*?)\];/)[1];
  const pairs = Object.fromEntries([...safe.matchAll(/\("(\w+)", (true|false)\)/g)].map((m) => [m[1], m[2] === "true"]));
  assert.deepEqual(B.SETTINGS_SAFE_ONLY, pairs);
  assert.equal(rust.match(/pub const CONFIRM_WORD: &str = "(\w+)"/)[1], B.CONFIRM_WORD);
  assert.equal(Number(rust.match(/pub const MIN_PASSWORD: usize = (\d+)/)[1]), B.MIN_BUNDLE_PASSWORD);
  // El token MCP y las funciones sensibles están en la lista.
  for (const k of ["mcpToken", "mcpEnabled", "mcpReadOnly", "mcpApproval", "autoLegacySsh", "tftpPort", "syslogSave", "logsDir", "vaultAutoLockMin", "vaultLockOnSleep"])
    assert.ok(B.SETTINGS_EXCLUDED.includes(k), k);
  // Cada clave excluida es un ajuste real (no un nombre equivocado que dejaría pasar el verdadero).
  for (const k of B.SETTINGS_EXCLUDED) assert.ok(k in S.defaultSettings, `${k} existe en defaultSettings`);
}

// ---------- Ajustes que se aplican ----------
const cur = { ...S.defaultSettings, fontSize: 13, logMask: true, confirmSend: true, macros: [{ id: "m1", label: "Viejo", kind: "send", text: "x" }] };
const imported = {
  fontSize: 16,
  appTheme: "dark",
  mcpEnabled: true,
  mcpToken: "abc",
  autoLegacySsh: true,
  logsDir: "/tmp/x",
  logMask: false,
  confirmSend: true,
  scrollback: "mucho",
  claveFutura: 1,
  snmpProfiles: [{ id: "p1", name: "core", host: "192.0.2.1", saved: true }, { id: "../x", host: "h" }],
  alertRules: [{ id: "a1", name: "x", pattern: "(a+)+$", regex: true, caseSensitive: false, enabled: true, folder: "", toast: true, sound: false }],
};
{
  const ch = B.settingsChanges(cur, imported).map((c) => c.key);
  assert.deepEqual(ch.sort(), ["appTheme", "fontSize", "snmpProfiles"].sort(), "solo claves conocidas, seguras y del mismo tipo");
  const ign = B.ignoredSettings(imported);
  for (const k of ["mcpEnabled", "mcpToken", "autoLegacySsh", "logsDir", "logMask", "scrollback", "claveFutura"]) assert.ok(ign.includes(k), k);
  assert.ok(!ign.includes("confirmSend"), "una protección encendida sí se acepta");
  assert.deepEqual(B.settingsChanges(cur, null), []);
}

// ---------- Combinar botones, reglas, carpetas y perfiles ----------
const preview = (over = {}) => ({
  token: "t",
  app: "0.9.21",
  created: "",
  sessions: [],
  advanced: [],
  with_password: [],
  folders: ["Core/Vacía", "Otra"],
  settings: imported,
  ignored_settings: [],
  macros: [{ id: "m1", label: "Nuevo", kind: "send", text: "show ver" }, { id: "m2", label: "Script", kind: "script", script: "a.py" }, { id: "", label: "x", kind: "send" }, { id: "m3", label: "y", kind: "exec" }],
  packs: null,
  notes: [{ name: "nota", content: "a" }, { name: "Nota", content: "b" }, { name: "otra", content: "c" }],
  highlight: [
    { id: "r1", name: "err", pattern: "error", style: { fg: "red" } },
    { id: "r2", name: "redos", pattern: "(a+)+$", style: { fg: "red" } },
    { id: "r3", name: "mala", pattern: "(", style: { fg: "red" } },
  ],
  passwords: { sessions: 0, hops: 0, snmp: 1 },
  hops: [],
  snmp_profiles: ["p1"],
  warnings: [],
  ...over,
});
{
  const p = preview();
  const all = B.settingsPatch(cur, p, { settings: true, macros: true, highlight: true, dest: "Restaurado" });
  assert.equal(all.fontSize, 16);
  for (const k of ["mcpEnabled", "mcpToken", "autoLegacySsh", "logsDir", "logMask", "claveFutura", "scrollback"]) assert.ok(!(k in all), k);
  // Botones: nunca reemplazan (ids predecibles m1/m2 de un archivo no pisan los propios); inválidos fuera.
  assert.deepEqual(all.macros.map((m) => m.label), ["Viejo", "Nuevo", "Script"]);
  assert.equal(all.macros[0].id, "m1", "el botón propio sigue igual");
  assert.ok(all.macros.slice(1).every((m) => m.id.startsWith("imp-") && m.id !== "m1" && m.id !== "m2"), "ids nuevos");
  assert.equal(new Set(all.macros.map((m) => m.id)).size, 3);
  assert.deepEqual(all.customRules.map((r) => r.name), ["err"], "reglas con ReDoS o inválidas se descartan");
  assert.notEqual(all.customRules[0].id, "r1", "las reglas también llegan con id nuevo");
  assert.deepEqual(all.extraFolders, ["Restaurado/Core/Vacía", "Restaurado/Otra"]);
  assert.deepEqual(all.snmpProfiles.map((x) => x.id), ["p1"], "perfil con id inválido descartado");
  assert.equal(all.alertRules, undefined, "regla de alerta con ReDoS descartada: no cambia nada");
  // Sin marcar ajustes: nada de ajustes, sí botones si se pidió.
  const none = B.settingsPatch(cur, p, { settings: false, macros: false, highlight: false, dest: "" });
  assert.deepEqual(Object.keys(none), ["extraFolders"]);
  // Los secretos SNMP solo entran con su perfil (es decir, con los ajustes aplicados).
  assert.deepEqual(B.importedSnmpProfiles(p, false), []);
  assert.deepEqual(B.importedSnmpProfiles(p, true), ["p1"]);
  assert.deepEqual(B.importedSnmpProfiles(preview({ snmp_profiles: [] }), true), []);
}

// ---------- Botones, reglas y packs: se agregan, nunca reemplazan ----------
{
  const mine = [{ id: "m1", label: "Interfaces", kind: "send", text: "show ip int br" }];
  const add = B.planMacros(mine, [
    { id: "m1", label: "Interfaces", kind: "send", text: "reload" },
    { id: "m9", label: "interfaces", kind: "send", text: "conf t" },
    { id: "m3", label: "Otro", kind: "script", script: "a.py" },
  ]);
  assert.deepEqual(add.map((m) => m.label), ["Interfaces (importado)", "interfaces (importado 2)", "Otro"], "etiqueta repetida con sufijo");
  assert.ok(add.every((m) => !["m1", "m9", "m3"].includes(m.id)));
  assert.equal(B.macroRisk(add[0]), "disruptive", "riesgo del texto del botón (computeRisk)");
  assert.equal(B.macroRisk(add[1]), "change");
  assert.equal(B.macroRisk(add[2]), "change", "un botón de script se trata como cambio");
  assert.equal(B.macroRisk({ id: "x", label: "x", kind: "send", text: "show version\nshow clock" }), "read");
  // Validación: solo campos conocidos.
  assert.deepEqual(Object.keys(B.validMacros([{ id: "a", label: "b", kind: "send", text: "x", extra: 1 }])[0]).sort(), ["id", "kind", "label", "text"]);
  const rules = B.planRules([{ id: "c1", name: "VLAN", pattern: "x", style: {} }], B.validRules([{ id: "c1", name: "VLAN", pattern: "\\bvlan\\b", style: { color: "red", onclick: "x" } }]));
  assert.equal(rules[0].name, "VLAN (importado)");
  assert.notEqual(rules[0].id, "c1");
  assert.deepEqual(rules[0].style, { color: "red" }, "estilo sin campos desconocidos");
  // Packs: un id que ya existe (o de un pack incluido) se renombra.
  const pk = (id) => ({ format: "netterminal-commands", formatVersion: 1, id, name: id, vendor: "cisco", vendorName: "Cisco", commands: [{ cmd: "reload", desc: "x", cat: "Sistema", risk: "read" }] });
  const planned = B.planPacks(["user-cisco"], [pk("user-cisco"), pk("builtin-cisco"), pk("nuevo")]);
  assert.deepEqual(planned.map((p) => p.id), ["user-cisco-imp", "cisco-imp", "nuevo"]);
  const pr = B.packRisks(pk("x"));
  assert.equal(pr[0].risk, "disruptive", "max(declarado, calculado)");
  assert.equal(pr[0].escalated, true);
  // Extras: confirmación adicional si un comando al conectar cambia o corta.
  const ex = [{ index: 0, on_connect: "terminal length 0" }, { index: 1, on_connect: "conf t\ninterface Gi1\nshutdown" }];
  assert.equal(B.extrasNeedConfirm(ex, new Set([0])), false);
  assert.equal(B.extrasNeedConfirm(ex, new Set([0, 1])), true);
  assert.deepEqual(B.lineRisks(" show ver \n\n reload ").map((l) => [l.line, l.risk]), [["show ver", "read"], ["reload", "disruptive"]]);
}

// ---------- Clasificación de todos los ajustes (docs/TECNICO.md) ----------
{
  const policy = B.SETTINGS_POLICY;
  const keys = Object.keys(S.defaultSettings).sort();
  // Una clave nueva en settings.ts sin clasificar hace fallar esta prueba (y no compila con tsc).
  assert.deepEqual(Object.keys(policy).sort(), keys, "cada ajuste de settings.ts está clasificado en SETTINGS_POLICY");
  const kind = (k) => policy[k].kind;
  assert.deepEqual(keys.filter((k) => kind(k) === "excluded").sort(), [...B.SETTINGS_EXCLUDED].sort(), "excluidas = SETTINGS_EXCLUDED");
  assert.deepEqual(keys.filter((k) => kind(k) === "safeOnly").sort(), Object.keys(B.SETTINGS_SAFE_ONLY).sort(), "solo seguras = SETTINGS_SAFE_ONLY");
  for (const k of ["serverGuard", "disabledPacks", "macros", "customRules", "mcpToken", "monitors", "topoSources", "logsDir"]) assert.equal(kind(k), "excluded", k);
  for (const k of ["scrollback", "sendLineDelay", "fontSize", "logPattern", "catalogVendor", "highlightSchemes", "suggestListKey"]) assert.equal(kind(k), "check", k);
  assert.equal(kind("modules"), "onlyOff");
  // Documentada: cada clave aparece en la tabla de docs/TECNICO.md.
  const doc = readFileSync(new URL("../../docs/TECNICO.md", import.meta.url), "utf8");
  for (const k of keys) assert.ok(doc.includes(`\`${k}\``), `${k} en la tabla de ajustes del .ntx (docs/TECNICO.md)`);

  const base = { ...S.defaultSettings };
  const ch = (imp) => B.settingsPatch(base, { ...preview(), settings: imp, macros: null, highlight: null, folders: [] }, { settings: true, macros: false, highlight: false, dest: "" });
  assert.deepEqual(ch({ serverGuard: { tftp: { bind: "0.0.0.0", allow: "", idle: 0 } } }), {}, "servidores abiertos: nunca");
  assert.deepEqual(ch({ scrollback: 1e9 }), {}, "historial fuera de rango");
  assert.deepEqual(ch({ scrollback: 50000 }), { scrollback: 50000 });
  assert.deepEqual(ch({ sendLineDelay: 60000 }), {});
  assert.deepEqual(ch({ fontSize: 400 }), {});
  assert.deepEqual(ch({ appTheme: "<img>" }), {});
  assert.deepEqual(ch({ rightClickPaste: false, copyOnSelect: false, autoLog: true }), { rightClickPaste: false, copyOnSelect: false }, "solo se apagan");
  assert.deepEqual(ch({ rightClickPaste: true, autoLog: true }), {}, "no se encienden");
  assert.deepEqual(ch({ modules: { transfer: false, syslog: true, inventado: false } }), { modules: { ...base.modules, transfer: false } }, "módulos: solo apagar");
  assert.deepEqual(ch({ modules: { transfer: true } }), {});
  assert.deepEqual(ch({ logPattern: "../../x" }), {}, "nombre de log con ..");
  assert.deepEqual(ch({ logPattern: "/etc/x" }), {});
  assert.deepEqual(ch({ logPattern: "C:\\x" }), {});
  assert.deepEqual(ch({ logPattern: "{folder}/{session}_{date}" }), { logPattern: "{folder}/{session}_{date}" });
  assert.deepEqual(ch({ highlightSchemes: ["cisco", "inventado"] }), {});
  assert.deepEqual(ch({ highlightSchemes: ["juniper", "common"] }), { highlightSchemes: ["juniper", "common"] });
  assert.deepEqual(ch({ catalogVendor: "../x" }), {});
  assert.deepEqual(ch({ favCommands: ["cisco:show ver", "x\u001b[31m"] }), {}, "sin caracteres de control");
  assert.deepEqual(ch({ fontFamily: "JetBrains Mono" }), { fontFamily: "JetBrains Mono" });
  assert.deepEqual(ch({ fontFamily: "x;}body{display:none" }), {});
}

// ---------- Notas, destino y fortaleza ----------
{
  const plan = B.planNotes(["Nota", "nota (importada)"], preview().notes);
  assert.deepEqual(plan.map((n) => n.name), ["nota (importada 2)", "Nota (importada 3)", "otra"]);
  const ses = B.withDest([{ id: "b1", name: "x", type: "ssh", host: "192.0.2.1", folder: "Core", created_at: "" }, { id: "b2", name: "y", type: "ssh", host: "192.0.2.2", created_at: "" }], " Respaldo / ");
  assert.deepEqual(ses.map((s) => s.folder), ["Respaldo/Core", "Respaldo"]);
  assert.deepEqual(B.withDest(ses, "").map((s) => s.folder), ["Respaldo/Core", "Respaldo"]);
  assert.equal(B.bundleStrength("corta-123"), 0);
  assert.equal(B.bundleStrength("abcdefghijkl"), 1);
  assert.ok(B.bundleStrength("Frase larga de 4 palabras!") >= 2);
  assert.equal(B.bundleStrength("ñandúñandúñá"), 1, "cuenta caracteres, no bytes");
}

// ---------- Bloqueo automático y aviso del token ----------
{
  assert.equal(S.defaultSettings.vaultAutoLockMin, 0, "apagado por defecto");
  assert.equal(S.defaultSettings.vaultLockOnSleep, false);
  assert.equal(V.autolockMinutes(15), 15);
  assert.equal(V.autolockMinutes(-3), 0);
  assert.equal(V.autolockMinutes(99999), 1440);
  assert.equal(V.autolockMinutes("15"), 0);
  assert.equal(V.AUTOLOCK_CHOICES[0][0], 0);
  const credRs = readFileSync(new URL("../../src-tauri/src/credentials.rs", import.meta.url), "utf8");
  assert.equal(Number(credRs.match(/pub const AUTOLOCK_MAX_MIN: u32 = (\d+) \* (\d+);/).slice(1).reduce((a, b) => a * b)), 1440);

  const notice = { fileVersion: 1, schemaVersion: 1, newer: false, migratedFrom: null, restoredFrom: "settings.json.bak", dropped: [], tooLarge: false, corrupt: true, tokenRegenerated: true };
  const info = S.parseDataFilesInfo({ schemaVersion: 1, settings: notice, topology: { ...notice, restoredFrom: null, corrupt: false, tokenRegenerated: false } });
  assert.equal(info.settings.tokenRegenerated, true);
  const texts = S.describeDataNotices(info).map((n) => n.text);
  assert.ok(texts.some((t) => /token del API local/.test(t) && /Agentes IA/.test(t)), texts.join("\n"));
  // Un aviso sin el campo (backend anterior) no lo inventa.
  const old = S.parseDataFilesInfo({ schemaVersion: 1, settings: { ...notice, tokenRegenerated: undefined }, topology: notice });
  assert.equal(old.settings.tokenRegenerated, false);
}

console.log("bundle: OK");
