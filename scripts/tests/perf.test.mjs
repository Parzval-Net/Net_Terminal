// Pruebas de Herramientas › Velocidad (puerto de iperf3 y avance del speedtest): `node scripts/tests/perf.test.mjs` (Node 22.15+).
import assert from "node:assert/strict";
const { parsePort, portError, speedProgress } = await import("../../src/lib/perf.ts");

// Puerto: entero de 1 a 65535; antes 70000 llegaba a Tauri y fallaba al deserializar u16.
assert.equal(parsePort("5201"), 5201);
assert.equal(parsePort(" 65535 "), 65535);
assert.equal(parsePort("1"), 1);
assert.equal(parsePort("70000"), null);
assert.equal(parsePort("0"), null);
assert.equal(parsePort(""), null);
assert.equal(parsePort("52.1"), null);
assert.equal(parsePort("-1"), null);
assert.equal(parsePort("1e3"), null);
assert.equal(portError("5201"), "");
assert.equal(portError(""), "Ingresa un puerto");
assert.equal(portError("70000"), "Puerto fuera de rango (1 a 65535)");

// Avance global del speedtest: crece de forma monótona entre fases (antes volvía a 0 en cada una).
const seq = [
  ["latency", 0.5],
  ["latency", 1],
  ["download", 1 / 7],
  ["download", 1],
  ["upload", 0.2],
  ["upload", 1],
].map(([ph, p]) => speedProgress(ph, p));
for (let i = 1; i < seq.length; i++) assert.ok(seq[i].value >= seq[i - 1].value, `retrocede en ${i}`);
assert.equal(seq[0].step, 1);
assert.equal(seq[2].step, 2);
assert.equal(seq[4].step, 3);
assert.ok(Math.abs(seq.at(-1).value - 1) < 1e-9);
assert.ok(Math.abs(speedProgress("latency", 1).value - 0.05) < 1e-9);
assert.deepEqual(speedProgress(undefined, undefined), { value: 0, step: 1 });
assert.equal(speedProgress("upload", 5).value, speedProgress("upload", 1).value);

console.log("perf OK");
