// Pruebas de Monitoreo y Diagnóstico (src/lib/monitors.ts): transiciones de estado y alarmas,
// sondas eliminadas, validación del formulario y lista de puertos. Direcciones de documentación
// (RFC 5737) y nombres ficticios.
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

const M = await import("../../src/lib/monitors.ts");

// ---------- Transiciones y alarmas ----------

const ok = (ts) => ({ ts, ok: true, rtt: 5 });
const fail = (ts) => ({ ts, ok: false, rtt: null, error: "sin respuesta" });

/** Aplica muestras en orden y devuelve los eventos de alarma. */
function run(samples, threshold = 3) {
  let st;
  const events = [];
  for (const s of samples) {
    const r = M.nextStatus(st, s, threshold);
    st = r.next;
    if (r.event) events.push(r.event);
  }
  return { st, events };
}

{
  // Caído desde el arranque: antes solo sonaba una vez y no repetía. Ahora es "firstDown",
  // que el hook trata igual que una caída (alarma más repetición).
  const { st, events } = run([fail(1), fail(2), fail(3)]);
  assert.equal(st.state, "down");
  assert.deepEqual(events, ["firstDown"]);
  assert.equal(st.downCount, 1);
}
{
  // Arriba, cae y se recupera: una caída y una recuperación; el arranque a "up" no avisa.
  const { st, events } = run([ok(1), fail(2), fail(3), fail(4), fail(5), ok(6)]);
  assert.deepEqual(events, ["down", "up"]);
  assert.equal(st.state, "up");
  assert.equal(st.since, 6);
  assert.equal(st.downCount, 1);
}
{
  // Fallas sueltas bajo el umbral no cambian el estado.
  const { st, events } = run([ok(1), fail(2), fail(3), ok(4)]);
  assert.deepEqual(events, []);
  assert.equal(st.failStreak, 0);
}
{
  // Umbral 1: una falla basta.
  assert.deepEqual(run([ok(1), fail(2)], 1).events, ["down"]);
}
{
  // Una muestra borra el error de configuración (la sonda sí arrancó).
  const r = M.nextStatus({ state: "unknown", since: 0, failStreak: 0, downCount: 0, configError: "x" }, ok(1), 3);
  assert.equal(r.next.configError, undefined);
}

// ---------- Sondas eliminadas ----------

assert.deepEqual(M.removedIds(["a", "b", "c"], ["a", "c"]), ["b"]);
assert.deepEqual(M.removedIds([], ["a"]), []);
assert.deepEqual(M.removedIds(["a"], []), ["a"]);

// ---------- Validación del formulario (misma regla que validate_host en Rust) ----------

assert.equal(M.hostError("192.0.2.1"), null);
assert.equal(M.hostError("router.lab"), null);
assert.equal(M.hostError("[2001:db8::1]"), null);
assert.equal(M.hostError("fe80::1%eth0"), null);
assert.match(M.hostError(""), /Ingresa/);
assert.ok(M.hostError("ñandú.cl"), "sin tildes ni ñ");
assert.ok(M.hostError("a/b"));
assert.ok(M.hostError("-f"), "no puede parecer una opción");
assert.ok(M.hostError("[-f]"));
assert.ok(M.hostError("a b"));
assert.ok(M.hostError("x".repeat(254)));

assert.deepEqual(M.targetErrors({ kind: "icmp", host: "192.0.2.1" }), {});
assert.deepEqual(M.targetErrors({ kind: "tcp", host: "192.0.2.1", port: 22 }), {});
assert.ok(M.targetErrors({ kind: "tcp", host: "192.0.2.1", port: 70000 }).port, "fuera de u16");
assert.ok(M.targetErrors({ kind: "tcp", host: "192.0.2.1", port: 0 }).port);
assert.ok(M.targetErrors({ kind: "tcp", host: "192.0.2.1", port: 22.5 }).port);
assert.ok(M.targetErrors({ kind: "tcp", host: "192.0.2.1" }).port);
assert.equal(M.targetErrors({ kind: "icmp", host: "192.0.2.1", port: 70000 }).port, undefined, "ICMP ignora el puerto");

// ---------- Lista de puertos ----------

{
  const r = M.parsePortList("22,23 80-82;443");
  assert.deepEqual(r.ports, [22, 23, 80, 81, 82, 443]);
  assert.deepEqual(r.invalid, []);
  assert.equal(r.truncated, false);
}
{
  // Antes: 1024 puertos sin aviso, "abc" desaparecía y "70000" daba [].
  const r = M.parsePortList("22, 80-90, abc, 1-65535");
  assert.equal(r.truncated, true);
  assert.equal(r.ports.length, M.MAX_PORTS);
  assert.deepEqual(r.invalid, ["abc"]);
  assert.deepEqual(M.parsePortList("70000").invalid, ["70000"]);
  assert.deepEqual(M.parsePortList("0").invalid, ["0"]);
  assert.deepEqual(M.parsePortList("10-70000").invalid, ["10-70000"]);
}
assert.deepEqual(M.parsePortList("90-88").ports, [88, 89, 90], "rango invertido");
assert.deepEqual(M.parsePortList("22,22,20-23").ports, [22, 20, 21, 23], "sin duplicados");
assert.equal(M.parsePortList("1-1024").truncated, false, "justo el máximo no se marca");

// ---------- Estado del puerto ----------

assert.equal(M.portState({ open: true, error: null }), "open");
assert.equal(M.portState({ open: false, error: "Connection refused (os error 111)" }), "refused");
assert.equal(M.portState({ open: false, error: "No connection could be made because the target machine actively refused it. (os error 10061)" }), "refused");
assert.equal(M.portState({ open: false, error: "connection timed out" }), "filtered");
assert.equal(M.portState({ open: false, error: "Operation timed out (os error 60)" }), "filtered");
assert.equal(M.portState({ open: false, error: "DNS: failed to lookup address information" }), "error");
assert.equal(M.portState({ open: false, error: "Network is unreachable (os error 101)" }), "error");

console.log("monitors: ok");
