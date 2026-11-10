// Alertas por palabra clave (src/lib/alerts.ts): validación de reglas, carpetas y resaltado.
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, next) {
    if (/^\.\.?\//.test(specifier) && !/\.[cm]?[jt]s$/.test(specifier) && context.parentURL?.endsWith(".ts")) {
      for (const cand of [`${specifier}.ts`, `${specifier}/index.ts`]) {
        try {
          return next(cand, context);
        } catch {
          /* sigue con el siguiente candidato */
        }
      }
    }
    return next(specifier, context);
  },
});

const A = await import("../../src/lib/alerts.ts");
const rule = (o = {}) => ({ ...A.newAlert(), id: "r1", name: "x", pattern: "down", ...o });

// ---------- alertError ----------
assert.equal(A.alertError(rule({ pattern: "" })), "Escribe el texto o la expresión a buscar");
assert.equal(A.alertError(rule({ pattern: "   " })), "Escribe el texto o la expresión a buscar");
assert.equal(A.alertError(rule({ pattern: "a".repeat(501) })), "Máximo 500 caracteres");
assert.equal(A.alertError(rule({ pattern: "a".repeat(500) })), null);
assert.equal(A.alertError(rule({ pattern: "%LINK-3-UPDOWN" })), null);
// Texto literal: no se interpreta como regex, aunque sea inválida como tal.
assert.equal(A.alertError(rule({ pattern: "(sin cerrar", regex: false })), null);
assert.equal(A.alertError(rule({ pattern: "[a-", regex: false })), null);
// Regex inválida o riesgosa.
assert.ok(A.alertError(rule({ pattern: "(sin cerrar", regex: true })));
assert.ok(A.alertError(rule({ pattern: "(a+)+$", regex: true }))?.includes("anidados"));
// El motor de Rust no admite lookaround ni referencias.
for (const p of ["a(?=b)", "a(?!b)", "(?<=a)b", "(?<!a)b", "(a)\\1"]) assert.match(A.alertError(rule({ pattern: p, regex: true })) ?? "", /lookahead|referencias/, p);
assert.equal(A.alertError(rule({ pattern: "BGP.*Down", regex: true })), null);
assert.equal(A.alertError(rule({ pattern: "(?:a|b)c", regex: true })), null, "grupo sin captura es válido");
assert.equal(A.alertError(rule({ pattern: "a\\d", regex: true })), null);

// ---------- ejemplos ----------
assert.equal(A.exampleAlerts.length, 3);
for (const e of A.exampleAlerts) {
  assert.equal(e.enabled, false, "los ejemplos vienen desactivados");
  assert.equal(A.alertError(e), null, e.name);
}
assert.equal(new Set(A.exampleAlerts.map((e) => e.id)).size, A.exampleAlerts.length);
const n = A.newAlert();
assert.ok(n.enabled && n.pattern === "" && n.name === "" && /^a[0-9a-z]+$/.test(n.id));

// ---------- inFolder ----------
assert.ok(A.inFolder("Clientes/Acme", ""), "alcance vacío: todas");
assert.ok(A.inFolder(undefined, ""));
assert.ok(A.inFolder("Clientes/Acme", "Clientes"));
assert.ok(A.inFolder("Clientes/Acme/Core", "Clientes/Acme"));
assert.ok(A.inFolder("Clientes", "Clientes"));
assert.ok(A.inFolder("/Clientes/Acme/", "Clientes/Acme"), "barras sobrantes");
assert.ok(A.inFolder("Clientes/Acme", "/Clientes/"));
assert.ok(!A.inFolder("ClientesX/Acme", "Clientes"), "prefijo de texto no es subcarpeta");
assert.ok(!A.inFolder("Otros", "Clientes"));
assert.ok(!A.inFolder(undefined, "Clientes"));
assert.ok(!A.inFolder("Clientes", "Clientes/Acme"), "la carpeta padre no está en la hija");

// ---------- alertHighlights ----------
assert.deepEqual(A.alertHighlights(undefined, "x"), []);
const rules = [
  rule({ id: "1", highlight: true, pattern: "a.b(c)", regex: false }),
  rule({ id: "2", highlight: true, pattern: "BGP.*Down", regex: true, caseSensitive: false }),
  rule({ id: "3", highlight: false, pattern: "nop" }),
  rule({ id: "4", highlight: true, enabled: false, pattern: "off" }),
  rule({ id: "5", highlight: true, pattern: "(a+)+$", regex: true }),
  rule({ id: "6", highlight: true, pattern: "otra", folder: "Otros" }),
  rule({ id: "7", highlight: true, pattern: "  espacios  " }),
];
const hl = A.alertHighlights(rules, "Clientes/Acme");
assert.deepEqual(hl.map((h) => h.id), ["alert-1", "alert-2", "alert-7"]);
assert.equal(hl[0].pattern, "a\\.b\\(c\\)", "literal: se escapan los metacaracteres");
assert.equal(hl[0].ignoreCase, false);
assert.equal(hl[1].pattern, "BGP.*Down");
assert.equal(hl[1].ignoreCase, true);
assert.equal(hl[2].pattern, "espacios");
assert.ok(new RegExp(hl[0].pattern).test("a.b(c)") && !new RegExp(hl[0].pattern).test("axb(c)"));
assert.deepEqual(A.alertHighlights(rules, "Otros").map((h) => h.id), ["alert-1", "alert-2", "alert-6", "alert-7"]);
assert.deepEqual(A.alertHighlights(rules, undefined).map((h) => h.id), ["alert-1", "alert-2", "alert-7"]);

console.log("alerts: ok");
