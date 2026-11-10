// Lectura SNMP para Topología (src/lib/topoSnmp.ts): casos base y de borde de las funciones puras.
// La paridad de las listas de OID con snmp.rs y el descubrimiento completo ya están en
// topology.test.mjs; aquí van las piezas chicas. IPs de documentación (RFC 5737), nombres ficticios.
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, next) {
    if (/^\.\.?\//.test(specifier) && !/\.[cm]?[jt]s$/.test(specifier) && context.parentURL?.endsWith(".ts")) {
      for (const cand of [`${specifier}.ts`, `${specifier}/index.ts`]) {
        try {
          return next(cand, context);
        } catch {
          /* sigue con el siguiente candidato */
        }
      }
    }
    return next(specifier, context);
  },
});

const S = await import("../../src/lib/topoSnmp.ts");
const { canonPort } = await import("../../src/lib/topology.ts");
const O = S.OID;
const hexOf = (s) => Buffer.from(s, "utf8").toString("hex");
const str = (oid, v) => ({ oid, type: "OCTET STRING", value: v, hex: hexOf(v) });
const int = (oid, v) => ({ oid, type: "INTEGER", value: String(v) });
const read = (rows, gets = [], extra = {}) => {
  const byRoot = new Map();
  for (const r of rows) {
    const root = [...S.WALK_ALLOWED].filter((w) => r.oid.startsWith(`${w}.`)).sort((a, b) => b.length - a.length)[0];
    if (!byRoot.has(root)) byRoot.set(root, []);
    byRoot.get(root).push(r);
  }
  return { gets, getError: null, walks: [...byRoot].map(([oid, rs]) => ({ oid, rows: rs, truncated: false, timedOut: false, error: null })), ms: 1, ...extra };
};

// ---------- OID ----------
const values = Object.values(O);
assert.equal(new Set(values).size, values.length, "no hay OID repetidos");
for (const v of values) assert.match(v, /^\d+(\.\d+)+$/, v);
assert.equal(S.oidLabel(O.ifName), "ifName");
assert.equal(S.oidLabel("1.2.3"), "1.2.3", "OID desconocido: se muestra tal cual");
// Todo lo que se lee por GET termina en ".0" (escalares) o es una columna con permitido su raíz.
for (const s of S.GET_SCALARS) assert.ok(s.endsWith(".0"), s);
for (const c of S.GET_COLUMNS) assert.ok(!c.endsWith(".0"), c);
// Ninguna raíz permitida es prefijo de otra: evita que una "ampliación" abra más OID de la cuenta.
for (const a of S.WALK_ALLOWED) for (const b of S.WALK_ALLOWED) if (a !== b) assert.ok(!b.startsWith(`${a}.`), `${a} es prefijo de ${b}`);

// ---------- Plan de descubrimiento ----------
{
  const base = S.snmpDiscoveryPlan({ routing: false, mac: false, ports: false });
  assert.deepEqual(base.gets, [O.sysObjectID, O.sysName]);
  assert.ok(base.walks.includes(O.lldpRemSysName) && base.walks.includes(O.cdpCacheDeviceId) && base.walks.includes(O.dot1dBasePortIfIndex));
  assert.ok(!base.walks.includes(O.bgpPeerState) && !base.walks.includes(O.dot1dTpFdbPort) && !base.walks.includes(O.ifAlias));
  const r = S.snmpDiscoveryPlan({ routing: true, mac: false, ports: false });
  assert.ok(r.walks.includes(O.ospfNbrState) && r.walks.includes(O.ipAdEntIfIndex) && r.gets.includes(O.bgpLocalAs));
  const m = S.snmpDiscoveryPlan({ routing: false, mac: true, ports: false });
  assert.ok(m.walks.includes(O.dot1dTpFdbPort) && m.walks.includes(O.ipAdEntIfIndex) && !m.walks.includes(O.ospfNbrState));
  const p = S.snmpDiscoveryPlan({ routing: false, mac: false, ports: true });
  assert.ok(p.walks.includes(O.ifAlias) && p.walks.includes(O.ifHighSpeed));
  for (const plan of [base, r, m, p]) assert.equal(new Set(plan.walks).size, plan.walks.length, "sin recorridos repetidos");
}

// ---------- column / octets ----------
{
  const rd = read([
    str(`${O.ifName}.1`, "Gi0/1"),
    { oid: `${O.ifName}.2`, type: "noSuchInstance", value: "" },
    { oid: `${O.ifName}.3`, type: "endOfMibView", value: "" },
    { oid: `${O.ifName}.4`, type: "noSuchObject", value: "" },
    str(`${O.ifName}`, "sin-indice"),
    str(`${O.ifName}x.5`, "otro-prefijo"),
  ]);
  assert.deepEqual([...S.column(rd, O.ifName).keys()], ["1"]);
  assert.equal(S.column(rd, O.ifDescr).size, 0);
  assert.equal(S.column({ gets: [], getError: null, walks: [], ms: 0 }, O.ifName).size, 0);

  assert.deepEqual(S.octets({ oid: "x", type: "OCTET STRING", value: "", hex: "00ff10" }), [0, 255, 16]);
  assert.deepEqual(S.octets({ oid: "x", type: "OCTET STRING", value: "", hex: "" }), undefined, "cadena vacía: sin octetos");
  assert.equal(S.octets({ oid: "x", type: "OCTET STRING", value: "", hex: "abc" }), undefined, "largo impar");
  assert.equal(S.octets({ oid: "x", type: "OCTET STRING", value: "", hex: "zz" }), undefined);
  assert.equal(S.octets({ oid: "x", type: "OCTET STRING", value: "" }), undefined);
  assert.equal(S.octets(undefined), undefined);
}

// ---------- ifNames / ifIndexByPort ----------
{
  const rd = read([
    str(`${O.ifDescr}.1`, "GigabitEthernet0/1"),
    str(`${O.ifName}.1`, "Gi0/1"),
    str(`${O.ifDescr}.2`, "Vlan10"),
    str(`${O.ifName}.3`, "‮Gi0/3\u0007"),
    str(`${O.ifName}.x`, "no-numerico"),
    str(`${O.ifName}.4`, ""),
    int(`${O.ifName}.5`, 7),
  ]);
  const names = S.ifNames(rd);
  assert.equal(names.get(1), "Gi0/1", "ifName gana a ifDescr");
  assert.equal(names.get(2), "Vlan10", "sin ifName se usa ifDescr");
  assert.equal(names.get(3), "Gi0/3", "control y bidi fuera");
  assert.ok(!names.has(4) && !names.has(5) && names.size === 3);
  const idx = S.ifIndexByPort(names);
  assert.equal(idx.get(canonPort("Gi0/1")), 1);
  assert.equal(idx.get(canonPort("Vlan10")), 2);
}

// ---------- LLDP: el TimeMark más reciente manda ----------
{
  const idx = (tm, port, rem) => `${tm}.${port}.${rem}`;
  const rows = [];
  for (const [tm, name] of [[100, "viejo-sw"], [200, "nuevo-sw"]]) {
    rows.push(str(`${O.lldpRemSysName}.${idx(tm, 1, 1)}`, name));
    rows.push(int(`${O.lldpRemChassisIdSubtype}.${idx(tm, 1, 1)}`, 4));
    rows.push({ oid: `${O.lldpRemChassisId}.${idx(tm, 1, 1)}`, type: "OCTET STRING", value: "", hex: "001b21aabbcc" });
    rows.push(int(`${O.lldpRemPortIdSubtype}.${idx(tm, 1, 1)}`, 5));
    rows.push(str(`${O.lldpRemPortId}.${idx(tm, 1, 1)}`, "Gi0/48"));
  }
  const rd = read([...rows, str(`${O.ifName}.1`, "Gi0/1")]);
  const n = S.lldpFromSnmp(rd, S.ifNames(rd), new Map());
  assert.equal(n.length, 1);
  assert.equal(n[0].name, "nuevo-sw");
  // Índices malformados no rompen ni agregan vecinos.
  const bad = read([str(`${O.lldpRemSysName}.1.2`, "a"), str(`${O.lldpRemSysName}.x.1.1`, "b"), str(`${O.lldpRemSysName}.1.1.1.1`, "c")]);
  assert.deepEqual(S.lldpFromSnmp(bad, new Map(), new Map()), []);
}

// ---------- ARP propio y MAC inválida ----------
{
  const hex = (oid, h) => ({ oid, type: "OCTET STRING", value: "", hex: h });
  const rd = read([
    hex(`${O.ipNetToMediaPhysAddress}.3.192.0.2.9`, "001b21000001"),
    hex(`${O.ipNetToMediaPhysAddress}.3.192.0.2.10`, "001b2100"),
    hex(`${O.ipNetToMediaPhysAddress}.3.192.0.2.11`, "gg1b21000001"),
  ]);
  const rows = S.arpFromSnmp(rd, new Set(["192.0.2.9"]));
  assert.deepEqual(rows, [{ mac: "001b.2100.0001", ip: "192.0.2.9", self: true }], "MAC de largo o formato inválido se descarta");
  assert.deepEqual(S.arpFromSnmp(read([]), new Set()), []);
}

// ---------- Cisco / VLAN ----------
{
  const gets = (v) => [{ oid: O.sysObjectID, type: "OID", value: v }];
  assert.ok(S.isCiscoAgent(read([], gets("1.3.6.1.4.1.9.1.516"))));
  assert.ok(S.isCiscoAgent(read([], gets(".1.3.6.1.4.1.9.1.1"))), "con punto inicial");
  assert.ok(S.isCiscoAgent(read([], gets("1.3.6.1.4.1.9"))));
  assert.ok(!S.isCiscoAgent(read([], gets("1.3.6.1.4.1.90.1"))), "enterprises.90 no es 9");
  assert.ok(!S.isCiscoAgent(read([], [{ oid: O.sysObjectID, type: "OCTET STRING", value: "1.3.6.1.4.1.9.1" }])), "tipo distinto de OID");
  assert.ok(!S.isCiscoAgent(read([])));

  const vt = (dom, vlan, st) => int(`${O.vtpVlanState}.${dom}.${vlan}`, st);
  const rd = read([vt(1, 20, 1), vt(1, 10, 1), vt(1, 20, 1), vt(1, 30, 2), vt(1, 1002, 1), vt(1, 1005, 1), vt(1, 0, 1), vt(1, 4095, 1), vt(1, 4094, 1), { oid: `${O.vtpVlanState}.1.5.9`, type: "INTEGER", value: "1" }]);
  assert.deepEqual(S.activeVlans(rd), { vlans: [10, 20, 4094], total: 3 });
  assert.deepEqual(S.activeVlans(read([])), { vlans: [], total: 0 });
}

// ---------- walkNotes ----------
{
  const w = (o) => ({ oid: O.ifName, rows: [], truncated: false, timedOut: false, error: null, ...o });
  assert.deepEqual(S.walkNotes({ gets: [], getError: null, walks: [w({})], ms: 0 }), []);
  assert.match(S.walkNotes({ gets: [], getError: null, walks: [w({ timedOut: true, rows: [str(`${O.ifName}.1`, "a")] })], ms: 0 })[0], /1 fila\)/);
  assert.match(S.walkNotes({ gets: [], getError: null, walks: [w({ timedOut: true, rows: [] })], ms: 0 })[0], /0 filas\)/);
  // El mismo error en varias tablas se informa una sola vez.
  const dup = S.walkNotes({ gets: [], getError: null, walks: [w({ error: "Sin permiso" }), w({ oid: O.ifDescr, error: "Sin permiso" })], ms: 0 });
  assert.equal(dup.length, 1);
  // Un error largo se acota.
  assert.ok(S.walkNotes({ gets: [], getError: "x".repeat(1000), walks: [], ms: 0 })[0].length < 200);
}

// ---------- parseSnmpDiscovery vacía ----------
{
  const d = S.parseSnmpDiscovery({ gets: [], getError: null, walks: [], ms: 0 }, { routing: true, mac: true, ports: true });
  assert.deepEqual([d.neighbors, d.routing, d.macRows, d.arpRows, d.addrs, d.notes], [[], [], [], [], [], []]);
  assert.equal(d.l2Empty, true);
  assert.equal(d.name, undefined);
  assert.deepEqual(d.ports, {});
  const off = S.parseSnmpDiscovery({ gets: [], getError: null, walks: [], ms: 0 }, { routing: false, mac: false, ports: false });
  assert.equal(off.ports, undefined);
  assert.equal(S.needsArpFallback(read([])), true);
  assert.equal(S.needsLldpV2Fallback(read([])), true);
}

console.log("topoSnmp: ok");
