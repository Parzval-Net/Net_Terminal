// Pruebas del estado de la interfaz SNMP (src/lib/snmpUi.ts): eventos de un WALK que llegan antes
// que su id e ids estables de los traps. `node scripts/tests/snmpUi.test.mjs` (Node 22.15+).
import assert from "node:assert/strict";
const U = await import("../../src/lib/snmpUi.ts");

// ---- JobTracker ----
const ev = (job, kind) => ({ job, kind, text: "" });
const t = new U.JobTracker();
assert.deepEqual(t.push(ev("j1", "line")), [], "sin trabajo en curso no se procesa nada");

// Un WALK rápido: todo llega antes de que invoke devuelva el id.
t.begin();
assert.deepEqual(t.push(ev("j1", "line")), []);
assert.deepEqual(t.push(ev("j0", "done")), [], "se guarda también lo de otro trabajo");
assert.deepEqual(t.push(ev("j1", "result")), []);
assert.deepEqual(t.push(ev("j1", "done")), []);
const replay = t.resolve("j1");
assert.deepEqual(replay.map((e) => e.kind), ["line", "result", "done"], "se reproducen en orden solo los del trabajo");
assert.equal(t.id, "j1");

// Después del id, los eventos pasan directo y los de otros trabajos se ignoran.
assert.equal(t.push(ev("j1", "line")).length, 1);
assert.deepEqual(t.push(ev("j2", "line")), []);
t.reset();
assert.equal(t.id, null);
assert.deepEqual(t.push(ev("j1", "line")), [], "terminado el trabajo, sus eventos tardíos se ignoran");

// Falla el comando: no quedan eventos guardados ni se procesan después.
t.begin();
t.push(ev("j3", "line"));
t.reset();
assert.deepEqual(t.push(ev("j3", "line")), []);
assert.deepEqual(t.resolve("j3"), [], "tras reset no quedan eventos guardados");

// ---- prependTraps ----
const trap = (n) => ({ ts: n, src: "192.0.2.1", version: "v2c", kind: "trap", trap_oid: `1.3.6.1.6.3.1.1.5.${n}`, vbs: [] });
let s = U.prependTraps([], [trap(1), trap(2)], 0, 10);
assert.deepEqual(s.list.map((x) => [x.ts, x.id]), [[2, 1], [1, 0]], "el más nuevo primero, con ids crecientes");
assert.equal(s.next, 2);
const batch = [trap(3), trap(4)];
s = U.prependTraps(s.list, batch, s.next, 10);
assert.deepEqual(s.list.map((x) => x.id), [3, 2, 1, 0], "los ids existentes no cambian al llegar traps nuevos");
assert.deepEqual(batch.map((x) => x.ts), [3, 4], "no modifica el lote recibido");
s = U.prependTraps(s.list, [trap(5)], s.next, 3);
assert.deepEqual(s.list.map((x) => x.id), [4, 3, 2], "recorta al máximo");
assert.equal(s.next, 5);

console.log("snmpUi: ok");
