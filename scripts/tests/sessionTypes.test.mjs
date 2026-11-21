// Pruebas de los tipos de sesión compartidos por Nueva sesión y Conexión rápida
// (src/lib/sessionTypes.ts): `node scripts/tests/sessionTypes.test.mjs`.
// Direcciones de documentación (RFC 5737 y RFC 3849).
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

const T = await import("../../src/lib/sessionTypes.ts");

// Mismo orden en ambos formularios; Conexión rápida solo omite Local.
{
  assert.deepEqual(
    T.SESSION_TYPES.map((t) => t.type),
    ["ssh", "telnet", "serial", "raw", "local"],
  );
  assert.deepEqual(
    T.QUICK_TYPES.map((t) => t.type),
    ["ssh", "telnet", "serial", "raw"],
  );
  for (const q of T.QUICK_TYPES) assert.equal(q.label, T.SESSION_TYPES.find((t) => t.type === q.type).label);
  assert.equal(new Set(T.SESSION_TYPES.map((t) => t.label)).size, T.SESSION_TYPES.length, "rótulos únicos");
}

// Puerto al cambiar de tipo.
{
  assert.equal(T.portForType("ssh", 22, "telnet"), 23);
  assert.equal(T.portForType("telnet", 23, "raw"), 2001);
  assert.equal(T.portForType("ssh", 2222, "telnet"), 2222, "un puerto propio se conserva");
  assert.equal(T.portForType("ssh", undefined, "telnet"), 23);
  assert.equal(T.portForType("ssh", 22, "serial"), undefined);
  assert.equal(T.portForType("serial", undefined, "ssh"), 22);
  assert.equal(T.portForType("serial", 0, "raw"), 2001);
}

// Resumen serial.
{
  assert.equal(T.serialSummary({}), "9600 8N1 · sin flujo");
  assert.equal(T.serialSummary({ baud_rate: 115200, data_bits: 7, parity: "even", stop_bits: 2, flow_control: "hardware" }), "115200 7E2 · RTS/CTS");
  assert.equal(T.serialSummary({ parity: "odd", flow_control: "software" }), "9600 8O1 · XON/XOFF");
  assert.ok(T.PARITY_OPTIONS.every(([, l]) => !/None/.test(l)), "sin 'None' en inglés");
  assert.ok(T.FLOW_OPTIONS.every(([, l]) => !/None/.test(l)));
}

// Nombre sugerido desde el host.
{
  assert.equal(T.suggestName("  10.0.0.1 "), "10.0.0.1");
  assert.equal(T.suggestName("[2001:db8::1]"), "2001:db8::1");
  assert.equal(T.suggestName(undefined), "");
  // Sigue al host mientras se escribe.
  assert.equal(T.followHostName("", "", "1"), "1");
  assert.equal(T.followHostName("1", "1", "19"), "19");
  assert.equal(T.followHostName("192.0.2.1", "192.0.2.1", "192.0.2.10"), "192.0.2.10");
  // Un nombre propio no se toca.
  assert.equal(T.followHostName("Router core", "192.0.2.1", "192.0.2.10"), "Router core");
  // Borrar el host deja el nombre vacío si venía de él.
  assert.equal(T.followHostName("192.0.2.1", "192.0.2.1", ""), "");
}

// Recientes que coinciden con lo escrito en Host.
{
  const list = ["ssh admin@192.0.2.10 22", "telnet sw01 23", "ssh admin@192.0.2.10 22", "basura con  espacios", "ssh 198.51.100.7 2222"];
  const all = T.matchRecent(list, "");
  assert.equal(all.length, 3, "sin repetidos ni inválidos");
  assert.equal(all[0].username, "admin");
  assert.equal(all[1].type, "telnet");
  assert.equal(all[2].port, 2222);
  assert.deepEqual(T.matchRecent(list, "sw").map((s) => s.host), ["sw01"]);
  assert.deepEqual(T.matchRecent(list, "ADMIN@192").map((s) => s.host), ["192.0.2.10"]);
  assert.deepEqual(T.matchRecent(list, "telnet").map((s) => s.host), ["sw01"]);
  assert.equal(T.matchRecent(list, "", 2).length, 2, "límite");
  assert.equal(T.matchRecent(list, "203.0.113").length, 0);
}

console.log("sessionTypes OK");
