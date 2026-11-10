// Paridad de riesgo: lee scripts/tests/fixtures/risk-cases.json, el MISMO archivo que lee la
// prueba risk_fixture_* de src-tauri/src/mcp.rs, y exige que computeRisk dé el riesgo esperado.
// Un caso con "gap" es una diferencia conocida entre lo esperado por diseño y la lógica actual:
// se fija el valor actual para que cualquier cambio (a favor o en contra) se note.
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

const here = dirname(fileURLToPath(import.meta.url));
const { computeRisk, textRisk } = await import("../../src/lib/packs.ts");
const { cases } = JSON.parse(readFileSync(join(here, "fixtures", "risk-cases.json"), "utf8"));

const RISKS = new Set(["read", "change", "disruptive"]);
assert.ok(cases.length >= 150, `el fixture tiene ${cases.length} casos (mínimo 150)`);
const vendors = new Set(cases.map((c) => c.vendor));
for (const v of ["cisco", "huawei", "juniper", "fortinet", "checkpoint", "linux", "windows", "macos"]) assert.ok(vendors.has(v), `falta el fabricante ${v}`);
for (const r of RISKS) assert.ok(cases.some((c) => c.risk === r), `ningún caso ${r}`);
assert.ok(cases.some((c) => /[\t\u001b\u0003?]/.test(c.cmd)), "faltan líneas con Tab/Esc/Ctrl/?");
assert.ok(cases.some((c) => /;|&&|\|\|/.test(c.cmd)), "faltan comandos encadenados");

const wrong = [];
let gaps = 0;
for (const c of cases) {
  assert.ok(RISKS.has(c.risk), `riesgo inválido en ${JSON.stringify(c.cmd)}`);
  const actual = computeRisk(c.cmd);
  if (c.gap) {
    gaps++;
    assert.notEqual(c.gap.actual, c.risk, `gap sin diferencia: ${JSON.stringify(c.cmd)}`);
    if (actual !== c.gap.actual) wrong.push(`${c.vendor} ${JSON.stringify(c.cmd)}: gap fija ${c.gap.actual}, computeRisk da ${actual} (¿se corrigió? actualiza el fixture)`);
  } else if (actual !== c.risk) {
    wrong.push(`${c.vendor} ${JSON.stringify(c.cmd)}: esperado ${c.risk}, computeRisk da ${actual}`);
  }
}
assert.equal(wrong.length, 0, `\n${wrong.join("\n")}`);

// Un texto de varias líneas toma el mayor riesgo de sus líneas.
assert.equal(textRisk("show version\nshow clock"), "read");
assert.equal(textRisk("show version\r\nreload"), "disruptive");
assert.equal(textRisk("\n  \n"), "read");

console.log(`riskParity: ok (${cases.length} casos, ${gaps} diferencias conocidas)`);
