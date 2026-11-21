// Pruebas de los destinos escritos a mano (paleta, Conexión rápida y "Conectar a…" de la pantalla
// de inicio): `node scripts/tests/quickTarget.test.mjs`.
import assert from "node:assert/strict";

const Q = await import("../../src/lib/quickTarget.ts");

// parseQuick: formas aceptadas.
{
  const [ssh, telnet] = Q.parseQuick("10.0.0.1");
  assert.equal(ssh.type, "ssh");
  assert.equal(ssh.port, 22);
  assert.equal(telnet.type, "telnet");
  assert.equal(telnet.port, 23);

  const [u] = Q.parseQuick("admin@router:2222");
  assert.equal(Q.parseQuick("admin@router:2222").length, 1, "con usuario solo SSH");
  assert.equal(u.username, "admin");
  assert.equal(u.host, "router");
  assert.equal(u.port, 2222);

  const t = Q.parseQuick("telnet sw01 2323");
  assert.equal(t.length, 1);
  assert.equal(t[0].type, "telnet");
  assert.equal(t[0].port, 2323);

  assert.equal(Q.parseQuick("2001:db8::1")[0].host, "2001:db8::1");
  assert.equal(Q.parseQuick("[2001:db8::1]:2222")[0].port, 2222);
  assert.equal(Q.parseQuick("telnet fe80::1%en0 2323")[0].host, "fe80::1%en0");
}

// parseQuick: rechazos.
{
  assert.deepEqual(Q.parseQuick(""), []);
  assert.deepEqual(Q.parseQuick("   "), []);
  assert.deepEqual(Q.parseQuick("host 70000"), [], "puerto fuera de rango");
  assert.deepEqual(Q.parseQuick("cerrar todas"), [], "dos palabras sin puerto");
  assert.deepEqual(Q.parseQuick("a  b"), [], "espacios dobles");
  assert.deepEqual(Q.parseQuick("123"), [], "número suelto no es host");
}

// quickTarget vuelve a interpretarse igual.
{
  for (const input of ["admin@10.0.0.1:2222", "telnet sw01 2323", "ssh [2001:db8::1]:2200"]) {
    const [s] = Q.parseQuick(input);
    const [again] = Q.parseQuick(Q.quickTarget(s));
    assert.equal(again.type, s.type, input);
    assert.equal(again.host, s.host, input);
    assert.equal(again.port, s.port, input);
    assert.equal(again.username, s.username, input);
  }
}

// fold: sin tildes ni mayúsculas.
assert.equal(Q.fold("Conexión RÁPIDA"), "conexion rapida");

// matchConnect: sesiones guardadas primero y por relevancia; luego la conexión rápida.
{
  const s = (name, host, folder) => ({ id: name, name, type: "ssh", host, folder, port: 22, created_at: "" });
  const sessions = [
    s("dist-core", "10.0.0.9", "Sitio"),
    s("core-sw02", "192.0.2.2", "Sitio/Core"),
    s("core", "192.0.2.10", "Sitio/Core"),
    s("core-sw01", "192.0.2.1", "Sitio/Core"),
    s("borde", "198.51.100.1", "WAN"),
  ];

  assert.deepEqual(Q.matchConnect("", sessions), []);

  const core = Q.matchConnect("Core", sessions);
  assert.deepEqual(
    core.filter((m) => !m.quick).map((m) => m.session.name),
    ["core", "core-sw02", "core-sw01", "dist-core", "borde"].filter((n) => n !== "borde"),
    "exacto, luego empieza igual (en el orden de la lista), luego contiene",
  );
  assert.ok(core.slice(-2).every((m) => m.quick), "la conexión rápida va al final");

  const byHost = Q.matchConnect("198.51", sessions);
  assert.equal(byHost[0].session.name, "borde", "coincide por host");

  const byFolder = Q.matchConnect("wan", sessions);
  assert.equal(byFolder[0].session.name, "borde", "coincide por carpeta");

  const quick = Q.matchConnect("admin@203.0.113.5", sessions);
  assert.equal(quick.length, 1);
  assert.ok(quick[0].quick);
  assert.equal(quick[0].session.username, "admin");

  const tildes = Q.matchConnect("Conexión", [s("conexion-lab", "10.1.1.1")]);
  assert.equal(tildes[0].session.name, "conexion-lab", "sin tildes");

  assert.equal(Q.matchConnect("core", sessions, 2).filter((m) => !m.quick).length, 2, "límite de guardadas");

  // IP completa: Enter (primer candidato) no abre otra sesión guardada cuyo host solo la contiene.
  const exact = Q.matchConnect("192.0.2.1", sessions);
  assert.equal(exact[0].session.name, "core-sw01", "host exacto primero, aunque 192.0.2.10 esté antes en la lista");
  assert.ok(exact[1].quick && exact[2].quick, "luego la conexión rápida");
  assert.equal(exact[3].session.name, "core", "las que solo contienen la IP van al final");
  const fresh = Q.matchConnect("192.0.2.", sessions);
  assert.ok(!fresh[0].quick, "IP a medio escribir: sigue siendo una búsqueda, guardadas primero");
  const other = Q.matchConnect("10.0.0.9", [s("lab", "10.0.0.99"), s("lab2", "10.0.0.90")]);
  assert.ok(other[0].quick, "sin sesión guardada exacta, la conexión rápida va primero");
  assert.equal(other[0].session.host, "10.0.0.9");
  assert.equal(other.filter((m) => !m.quick).length, 2, "las parciales siguen disponibles");
}

console.log("quickTarget: OK");
