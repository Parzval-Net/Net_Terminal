// Paridad de enmascarado: lee scripts/tests/fixtures/mask-cases.json, el MISMO archivo que lee la prueba
// mask_fixture_parity de src-tauri/src/backups.rs, y comprueba maskLine (src/lib/auditParse.ts).
// `node scripts/tests/maskParity.test.mjs` (Node 22.15+ con tipos TS).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
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

const P = await import("../../src/lib/auditParse.ts");
const here = dirname(fileURLToPath(import.meta.url));
const { cases, keep } = JSON.parse(readFileSync(join(here, "fixtures", "mask-cases.json"), "utf8"));

for (const [inp, want] of cases) assert.equal(P.maskLine(inp), want, `entrada: ${inp}`);
for (const line of keep) assert.equal(P.maskLine(line), line, `debe quedar intacta: ${line}`);
console.log(`maskParity: ok (${cases.length} casos, ${keep.length} sin cambios)`);
