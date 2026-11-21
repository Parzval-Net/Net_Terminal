// Cola por tema de comandos que guardan (src/lib/inOrder.ts): `node scripts/tests/inOrder.test.mjs`.
// Con los guardados async en el backend, dos llamadas seguidas pueden terminar en otro orden; la cola
// debe dejarlas como cuando el backend las corría en el hilo principal: de a una y en orden.
import assert from "node:assert/strict";

const { inOrder } = await import("../../src/lib/inOrder.ts");

/** "Backend" falso: cada llamada termina cuando el test la resuelve, en el orden que el test quiera. */
function fakeBackend() {
  const started = [];
  const pending = new Map();
  const call = (name) => () =>
    new Promise((resolve, reject) => {
      started.push(name);
      pending.set(name, { resolve, reject });
    });
  const tick = () => new Promise((r) => setTimeout(r, 0));
  return { started, pending, call, tick };
}

// Guardados sucesivos del mismo tema: el segundo no empieza hasta que termina el primero, aunque el
// "backend" esté listo para terminar el segundo antes.
{
  const b = fakeBackend();
  const done = [];
  const p1 = inOrder("sessions", b.call("guardar A")).then((v) => done.push(v));
  const p2 = inOrder("sessions", b.call("guardar B")).then((v) => done.push(v));
  const p3 = inOrder("sessions", b.call("listar")).then((v) => done.push(v));
  await b.tick();
  assert.deepEqual(b.started, ["guardar A"], "solo una llamada en curso por tema");
  b.pending.get("guardar A").resolve("A");
  await b.tick();
  assert.deepEqual(b.started, ["guardar A", "guardar B"]);
  b.pending.get("guardar B").resolve("B");
  await b.tick();
  b.pending.get("listar").resolve("lista");
  await Promise.all([p1, p2, p3]);
  assert.deepEqual(done, ["A", "B", "lista"], "resultados en el orden pedido");
}

// Un error no corta la cola y llega a quien llamó; temas distintos no se esperan entre sí.
{
  const b = fakeBackend();
  const fail = inOrder("notes", b.call("guardar nota"));
  const next = inOrder("notes", b.call("leer nota"));
  const other = inOrder("packs", b.call("guardar pack"));
  await b.tick();
  assert.deepEqual(b.started, ["guardar nota", "guardar pack"], "otro tema no espera");
  b.pending.get("guardar nota").reject(new Error("disco lleno"));
  await assert.rejects(fail, /disco lleno/);
  await b.tick();
  assert.ok(b.started.includes("leer nota"), "la siguiente sigue tras un error");
  b.pending.get("leer nota").resolve("texto");
  b.pending.get("guardar pack").resolve("ok");
  assert.equal(await next, "texto");
  assert.equal(await other, "ok");
}

// Sin pendientes, la llamada sale de inmediato (en la misma vuelta de microtareas).
{
  const b = fakeBackend();
  const p = inOrder("sessions", b.call("guardar C"));
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(b.started, ["guardar C"]);
  b.pending.get("guardar C").resolve(1);
  assert.equal(await p, 1);
}

console.log("inOrder: OK");
