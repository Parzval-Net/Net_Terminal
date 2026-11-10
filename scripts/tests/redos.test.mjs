// Pruebas del validador anti-ReDoS (regexSafety.ts) y del presupuesto de tiempo del resaltado:
// `node scripts/tests/redos.test.mjs` (Node 22.15+ con tipos TS).
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { fastEnough } from "./timing.mjs";

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

const S = await import("../../src/lib/regexSafety.ts");
const H = await import("../../src/lib/highlight.ts");
const T = await import("../../src/lib/termHl.ts");
const { validRules } = await import("../../src/lib/bundle.ts");

// ---------- Patrones peligrosos: todos rechazados ----------
const BAD = [
  // Del informe de auditoría: polinomiales que no detectaba la regla de cuantificadores anidados.
  "a*a*a*b",
  "(.*a){3}b",
  ".*a.*b",
  "a*a*b",
  ".*.*x",
  "\\w+\\w*x",
  "\\w*\\d+x",
  "error.*Gi.*down",
  // Exponenciales clásicos.
  "(a+)+$",
  "^(a+)+$",
  "(\\w*)*x",
  "(?:a*)*x",
  "(a*b*)*c",
  "(a|aa)+c",
  "(a|a)*b",
  "(\\w|\\d)+x",
  "(\\w+\\s?)+$",
  "(x+y?){2,}z",
  "(.*a)+b",
  "(?=(a+)+b)x",
  // Referencias dentro de una repetición.
  "(a)\\1*",
  "((a)\\2)+",
];
for (const p of BAD) {
  assert.ok(S.redosRisk(p), `debe rechazarse: ${p}`);
  assert.ok(H.riskyRegex(p), `riskyRegex: ${p}`);
  assert.equal(H.compile([{ id: "x", name: "x", pattern: p, style: { color: "red" } }]).length, 0, `compile la descarta: ${p}`);
}
assert.match(S.redosRisk("(a+)+$"), /Cuantificadores anidados/);
assert.match(S.redosRisk("a*a*b"), /repeticiones sin tope/);
assert.match(S.redosRisk("(a)\\1*"), /referencia/);

// ---------- Patrones legítimos comunes: ninguno rechazado ----------
const GOOD = [
  "down",
  "\\b(?:up|down)\\b",
  "line protocol is (up|down)",
  "\\b(err-disabled|notconnect)\\b",
  "(\\d+\\.){3}\\d+",
  "(?:\\d{1,3}\\.){3}\\d{1,3}",
  "\\b(?:(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)(?:\\/\\d{1,2})?\\b",
  "\\b(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}\\b",
  "[0-9a-f]{2}(:[0-9a-f]{2}){5}",
  "(?:[0-9a-f]{4}\\.){2}[0-9a-f]{4}",
  "\\d+\\.\\d+",
  "\\S+\\s+\\S+",
  "Gi\\d+(?:[\\/.:]\\d+)*",
  "(?:Gi|Te|Fa)\\d+\\/\\d+(?:\\/\\d+)?",
  "(Gigabit|TenGigabit)Ethernet\\d/\\d/\\d",
  "\\bVLAN\\s?(?:100|200)\\b",
  "\\bdescription\\s+(.+)$",
  "^\\s*!.*$",
  ".*error.*",
  "error.*down",
  "%[A-Z0-9_]+-\\d-[A-Z_]+",
  "\\s+$",
  "^interface \\S+",
  "^\\S+#\\s*$",
  "\\b[1-9]\\d*\\s+(?:input errors?|CRC)\\b",
  "\\d+ packets input, \\d+ bytes",
  "[^,]*,[^,]*,x",
  "\\b\\w+\\b",
  "(\\w+)\\s+\\1",
  "(ab)+",
  "(?:ab)+c",
  "([+*?|])+x",
  "(?<n>ab)*c",
  "\\{\\{\\s*[\\w.-]+\\s*\\}\\}",
  "(\\d+\\.)*",
];
for (const p of GOOD) assert.equal(S.redosRisk(p), null, `no debe rechazarse: ${p}`);
// Sin distinguir mayúsculas cambia qué clases se solapan.
assert.equal(S.redosRisk("[a-z]+[A-Z]+x", false), null);
assert.ok(S.redosRisk("[a-z]+[A-Z]+x", true));

// Todas las reglas integradas pasan el mismo validador (al copiarlas con "Personalizar" se validan).
for (const sc of H.schemes)
  for (const r of sc.rules) assert.equal(S.redosRisk(r.pattern, !!r.ignoreCase), null, `${sc.id} ${r.name}: ${r.pattern}`);

// El validador es rápido incluso con patrones largos y enredados (no se cuelga él mismo).
fastEnough("validar patrón largo", 200, () => S.redosRisk("(?:" + Array.from({ length: 60 }, (_, i) => `w${i}\\d+`).join("|") + ")+x"));
fastEnough("validar cuentas anidadas", 200, () => S.redosRisk("((a{10}){10}){10}b"));

// ---------- Reglas integradas: por identidad, nunca por id ----------
const imported = validRules([
  { id: "b1", name: "falsa integrada", pattern: "a*a*a*b", style: { color: "red" } },
  { id: "b2", name: "otra", pattern: "(.*a){3}b", style: { color: "red" } },
  { id: "c1", name: "buena", pattern: "\\bdown\\b", style: { color: "red" } },
]);
assert.deepEqual(imported.map((r) => r.name), ["buena"], "un .ntx con ids que empiezan con b no se salta la validación");
assert.equal(H.compile([{ id: "b7", name: "x", pattern: "a*a*b", style: { color: "red" } }]).length, 0);
const builtin = H.schemes[0].rules[0];
assert.ok(H.isBuiltinRule(builtin));
assert.ok(!H.isBuiltinRule({ ...builtin }), "una copia ya no es integrada");
assert.ok(!H.compile([builtin])[0].user, "las integradas no se cronometran");
assert.ok(H.compile([{ ...builtin }])[0].user);

// ---------- Presupuesto de tiempo: una regla lenta que escapara al validador se apaga ----------
const seen = [];
const off = H.onSlowRule((name) => seen.push(name));
const sneaky = { re: /a*a*b/gm, style: { color: "red" }, group: 0, on: "\x1b[31m", off: "\x1b[39m", user: true, name: "Regla lenta", key: "gm/a*a*b", strikes: 0 };
const line = "a".repeat(H.USER_MAX_LINE);
for (let i = 0; i < 6 && !sneaky.dead; i++) H.runs(line, [sneaky]);
assert.ok(sneaky.dead, "desactivada tras exceder el presupuesto");
assert.deepEqual(seen, ["Regla lenta"], "un solo aviso");
fastEnough("regla apagada no se evalúa", 2, () => H.runs(line, [sneaky]));
assert.ok(H.isSlowRule("gm/a*a*b"));
// Al recompilar en la misma sesión sigue apagada (también si viniera de la lista de reglas).
off();
// Las reglas del usuario no miran líneas sobre su tope: una regla que se cuela no ve 1.000 caracteres.
const sneaky2 = { ...sneaky, re: /a*a*b/gm, key: "gm/otra", dead: false, strikes: 0 };
fastEnough("regla del usuario en línea de 1.000", 5, () => H.runs("a".repeat(1000), [sneaky2]));
assert.ok(!sneaky2.dead);

// ---------- Tiempos con líneas hostiles (límite 50 ms por línea) ----------
const allRules = H.compile(
  H.effectiveRules(
    {
      enabled: true,
      schemes: H.schemes.map((s) => s.id),
      custom: GOOD.map((p, i) => ({ id: `u${i}`, name: p, pattern: p, style: { color: "yellow" } })),
    },
    undefined,
  ),
);
assert.ok(allRules.some((r) => r.user), "hay reglas del usuario aceptadas");
for (const [label, text] of [
  ["a×1.000", "a".repeat(1000)],
  ["a×399", "a".repeat(399)],
  ["espacios×1.000", " ".repeat(999) + "x"],
  ["dígitos y puntos ×1.000", "1.".repeat(500)],
  ["interfaces ×1.000", "Gi1/0/1 ".repeat(125)],
  ["a×100.000", "a".repeat(100_000)],
]) {
  fastEnough(`resaltado ${label}`, 50, () => H.highlightText(text + "\n", allRules));
}
assert.ok(allRules.every((r) => !r.dead), "las reglas legítimas no se apagan con líneas hostiles");

// Resaltado al vuelo: validación y tope del texto examinado.
assert.match(T.validateHl({ pattern: "a*a*b", regex: true, matchCase: false }), /repeticiones sin tope/);
assert.match(T.validateHl({ pattern: ".*x.*y", regex: true, matchCase: false }), /repeticiones sin tope/);
const re = T.buildRegex({ pattern: ".*x", regex: true, matchCase: false });
fastEnough("resaltado al vuelo en 100 KB", 50, () => T.findSpans("a".repeat(100_000), re));
fastEnough("resaltado al vuelo en 4.000", 50, () => T.findSpans("a".repeat(T.MAX_SCAN_TEXT), re));

console.log("redos: ok");
