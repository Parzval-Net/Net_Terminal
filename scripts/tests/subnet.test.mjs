// Pruebas de la calculadora de subredes: `node scripts/tests/subnet.test.mjs` (Node 22.15+).
import assert from "node:assert/strict";
const { calc, splitV4 } = await import("../../src/lib/subnet.ts");

// Cálculo base.
const a = calc("192.168.10.77/26");
assert.equal(a.network, "192.168.10.64");
assert.equal(a.broadcast, "192.168.10.127");
assert.equal(a.hosts, 62);
assert.equal(a.scope, "Privada (RFC 1918)");
assert.equal(a.fromWildcard, false);
assert.equal(calc("10.0.0.1 255.255.255.0").prefix, 24);

// Rangos de uso especial (RFC 6890) que antes salían como "Pública".
assert.equal(calc("198.18.0.1/15").scope, "Benchmarking (RFC 2544)");
assert.equal(calc("198.19.255.1").scope, "Benchmarking (RFC 2544)");
assert.equal(calc("192.0.2.1/24").scope, "Documentación (RFC 5737)");
assert.equal(calc("198.51.100.9").scope, "Documentación (RFC 5737)");
assert.equal(calc("203.0.113.200").scope, "Documentación (RFC 5737)");
assert.equal(calc("0.0.0.0/8").scope, "Esta red (RFC 791)");
assert.equal(calc("192.0.0.8").scope, "Asignación IETF (RFC 6890)");
assert.equal(calc("255.255.255.255").scope, "Broadcast limitado (RFC 919)");
assert.equal(calc("240.0.0.1").scope, "Reservada");
assert.equal(calc("8.8.8.8").scope, "Pública");
assert.equal(calc("172.32.0.1").scope, "Pública");
assert.equal(calc("100.64.0.1").scope, "CGNAT (RFC 6598)");

// /31 y /32 no tienen broadcast (RFC 3021).
assert.equal(calc("10.1.1.1/31").broadcast, null);
assert.equal(calc("10.1.1.1/32").broadcast, null);
assert.equal(calc("10.1.1.1/31").hosts, 2);
assert.equal(calc("10.1.1.1/30").broadcast, "10.1.1.3");

// Wildcard copiada de una ACL u OSPF: se invierte y se avisa.
const w = calc("10.0.0.0 0.0.0.255");
assert.equal(w.prefix, 24);
assert.equal(w.mask, "255.255.255.0");
assert.equal(w.fromWildcard, true);
assert.equal(calc("10.0.0.0/0.0.3.255").prefix, 22);
// Máscara ni de red ni wildcard: inválida.
assert.equal(calc("10.0.0.0 255.0.255.0"), null);
// 0.0.0.0 vale como ambas: se toma como máscara de red.
assert.equal(calc("10.0.0.0 0.0.0.0").prefix, 0);

// IPv6: zona, "::" y rangos especiales.
assert.equal(calc("fe80::1%eth0/64").scope, "Link-local");
assert.equal(calc("fe80::1%12").prefix, 128);
assert.equal(calc("1::2:3:4:5:6:7:8"), null, "'::' debe reemplazar al menos un grupo");
assert.equal(calc("1:2:3:4:5:6:7::/64").prefix, 64);
assert.equal(calc("::").scope, "No especificada (::)");
assert.equal(calc("::1").scope, "Loopback");
assert.equal(calc("::ffff:10.0.0.1/96").scope, "IPv4 mapeada (RFC 4291)");
assert.equal(calc("2001:db8::1/64").scope, "Documentación (RFC 3849)");
assert.equal(calc("2001::1").scope, "Teredo (RFC 4380)");
assert.equal(calc("2002:c000:204::1").scope, "6to4 (RFC 3056)");
assert.equal(calc("64:ff9b::192.0.2.33").scope, "Traducción IPv4/IPv6 (RFC 6052)");
assert.equal(calc("2800:150::1").scope, "Global unicast");

// División.
assert.equal(splitV4("10.0.0.0", 8, 30).length, 1024);
assert.deepEqual(splitV4("10.0.0.0", 24, 25)[1], { cidr: "10.0.0.128/25", first: "10.0.0.129", last: "10.0.0.254" });

console.log("subnet OK");
