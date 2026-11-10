// Pruebas de las preferencias de acceso de los servidores integrados (src/lib/serverGuard.ts):
// `node scripts/tests/serverGuard.test.mjs` (Node 22.15+). El filtro, el bind y la detención se prueban en Rust.
import assert from "node:assert/strict";
const G = await import("../../src/lib/serverGuard.ts");

const ips = [
  { name: "en0", ip: "10.20.0.5", default: true },
  { name: "en5", ip: "192.168.50.2" },
];

// ---- Interfaz de escucha ----
assert.equal(G.defaultBind(ips), "10.20.0.5", "la IP de la ruta por defecto va preseleccionada");
assert.equal(G.defaultBind([{ name: "en5", ip: "192.168.50.2" }]), "192.168.50.2", "sin ruta por defecto, la primera");
assert.equal(G.defaultBind([]), "all", "sin interfaces, todas");
assert.deepEqual(G.resolveBind({}, ips), { bind: "10.20.0.5", stale: false });
assert.deepEqual(G.resolveBind({ bind: "all" }, ips), { bind: "all", stale: false }, "todas las interfaces es una opción explícita");
assert.deepEqual(G.resolveBind({ bind: "192.168.50.2" }, ips), { bind: "192.168.50.2", stale: false });
assert.deepEqual(G.resolveBind({ bind: "172.16.0.9" }, ips), { bind: "10.20.0.5", stale: true }, "una IP que ya no existe vuelve a la predeterminada y se avisa");
assert.deepEqual(G.resolveBind({ bind: "172.16.0.9" }, []), { bind: "172.16.0.9", stale: false }, "sin lista de interfaces no se descarta lo guardado");
assert.equal(G.operationBind({ tftp: { bind: "all" } }, "tftp", "10.0.0.9"), "all");
assert.equal(G.operationBind({}, "tftp", "10.0.0.9"), "10.0.0.9", "el gestor de archivos escucha en la IP que eligió el usuario");
assert.equal(G.operationBind({}, "tftp", ""), "all");

// ---- Inactividad ----
assert.equal(G.idleMinutes({}), 30, "activada por defecto");
assert.equal(G.idleMinutes({ idle: 0 }), 0, "0 la desactiva");
assert.equal(G.idleMinutes({ idle: -5 }), 0);
assert.equal(G.idleMinutes({ idle: 2.4 }), 2);
assert.equal(G.idleMinutes({ idle: 0.2 }), 1, "no baja de 1 minuto salvo desactivada");
assert.equal(G.idleMinutes({ idle: 99999 }), 1440);

// ---- Clientes permitidos ----
assert.deepEqual(G.parseAllow(undefined), { entries: [], errors: [] });
assert.deepEqual(G.parseAllow("  \n "), { entries: [], errors: [] });
assert.deepEqual(G.parseAllow("10.0.0.0/24, 192.168.1.5;fd00:1::/32\n2001:db8::7"), { entries: ["10.0.0.0/24", "192.168.1.5", "fd00:1::/32", "2001:db8::7"], errors: [] });
for (const bad of ["10.0.0.0/33", "10.0.0.256", "10.0.0", "hola", "10.0.0.1/x", "fd00::/129", "10.0.0.1/24/8", "01.2.3.4", "1::2::3"]) {
  assert.equal(G.parseAllow(bad).errors.length, 1, `${bad} debía fallar`);
  assert.deepEqual(G.parseAllow(bad).entries, []);
}
{
  const r = G.parseAllow("10.0.0.1 hola 10.0.0.2");
  assert.deepEqual(r.entries, ["10.0.0.1", "10.0.0.2"]);
  assert.equal(r.errors.length, 1);
  assert.ok(r.errors[0].includes('"hola"'));
  assert.equal(G.parseAllow(Array.from({ length: 65 }, (_, i) => `10.0.0.${i}`).join(" ")).errors.length, 1, "máximo 64 entradas");
}

// ---- Preferencias guardadas: forma inválida no rompe ----
assert.deepEqual(G.prefsOf(null, "tftp"), {});
assert.deepEqual(G.prefsOf({ tftp: [1] }, "tftp"), {});
assert.deepEqual(G.prefsOf({ tftp: { bind: 5, allow: 7, idle: "x" } }, "tftp"), {});
assert.deepEqual(G.prefsOf({ ftp: { bind: "all", allow: "10.0.0.0/8", idle: 0 } }, "ftp"), { bind: "all", allow: "10.0.0.0/8", idle: 0 });
assert.deepEqual(G.prefsOf({ ftp: { idle: Infinity } }, "ftp"), {});

// ---- Opciones para el backend ----
assert.deepEqual(G.serverOpts({ http: { allow: "10.0.0.0/24 mal", idle: 10 } }, "http", "10.20.0.5"), { bind: "10.20.0.5", allow: ["10.0.0.0/24"], idleMinutes: 10 });
assert.deepEqual(G.serverOpts({}, "syslog", "all"), { bind: "all", allow: [], idleMinutes: 30 });

// ---- Resumen ----
assert.deepEqual(G.guardSummary({}, ips), { text: "10.20.0.5 · cualquier cliente · se detiene tras 30 min sin uso", warn: false });
assert.deepEqual(G.guardSummary({ bind: "all" }, ips), { text: "todas las interfaces · cualquier cliente · se detiene tras 30 min sin uso", warn: true }, "todas las interfaces sin filtro es lo único que advierte");
assert.equal(G.guardSummary({ bind: "all", allow: "10.0.0.0/8" }, ips).warn, false);
assert.equal(G.guardSummary({ allow: "10.0.0.0/8 10.1.0.0/16", idle: 0 }, ips).text, "10.20.0.5 · 2 orígenes permitidos · sin detención automática");
assert.equal(G.guardSummary({ allow: "10.0.0.1" }, ips).text.includes("1 origen permitido"), true);
assert.equal(G.idleStopMessage("tftp", 30), "Servidor TFTP detenido: 30 min sin actividad. Vuelve a iniciarlo cuando lo necesites.");
assert.ok(G.idleStopMessage("raro", null).includes("raro"));

console.log("serverGuard: ok");
