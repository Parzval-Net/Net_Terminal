// Pruebas del texto de errores de los avisos: `node scripts/tests/errors.test.mjs`.
import assert from "node:assert/strict";

const { errText, failText } = await import("../../src/lib/errors.ts");

assert.equal(errText("Permiso denegado"), "Permiso denegado");
assert.equal(errText("Error: no hay red"), "no hay red");
assert.equal(errText(new Error("fallo")), "fallo");
assert.equal(errText(undefined), "error desconocido");
assert.equal(errText(""), "error desconocido");
assert.equal(errText({ code: 5 }), '{"code":5}');
const circular = {};
circular.self = circular;
assert.equal(errText(circular), "error desconocido");
assert.equal(failText("guardar la sesión", "Disco lleno"), "No se pudo guardar la sesión. Motivo: Disco lleno");
assert.equal(failText("conectar", new Error("Error: tiempo agotado")), "No se pudo conectar. Motivo: tiempo agotado");
console.log("errors: OK");
