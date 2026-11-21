// Pruebas de las correcciones de la auditoría de Topología, una por hallazgo (el número es el del
// informe): `node scripts/tests/topoAudit.test.mjs` (Node 22.15+ con tipos TS).
// Salidas de ejemplo con direcciones de documentación (RFC 5737) y nombres ficticios. El hallazgo 3
// (salida cortada) está en topoRun.test.mjs y el tope de páginas del paginador, en filexfer.rs.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";

// packs.ts importa "./highlight" sin extensión (como lo resuelve Vite): se completa con .ts.
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

const T = await import("../../src/lib/topology.ts");
const I = await import("../../src/lib/topoInsights.ts");
const R = await import("../../src/lib/topoTraffic.ts");
const S = await import("../../src/lib/topoSnmp.ts");
const H = await import("../../src/lib/hopTab.ts");
const C = await import("../../src/lib/cliText.ts");
const { computeRisk } = await import("../../src/lib/packs.ts");

const EMPTY = { nodes: [], links: [] };
const nb = (name, localPort, remotePort, extra = {}) => ({ name, localPort, remotePort, proto: "CDP", ...extra });
const A = { name: "sw-a" };
const T0 = 1_800_000_000_000;

// ---------- 1. Paginador de Junos en el backend y salida sin paginador ----------
{
  // La expresión del backend se lee de filexfer.rs: debe reconocer lo mismo que PAGER del frontend.
  const rs = readFileSync(new URL("../../src-tauri/src/filexfer.rs", import.meta.url), "utf8");
  const src = rs.match(/more: Regex::new\(r"\(\?i\)([^"]+)"\)/)?.[1];
  assert.ok(src, "se encontró la expresión `more` de filexfer.rs");
  const more = new RegExp(src, "i");
  for (const mark of ["---(more)---", "---(more 45%)---", "---(more 100%)---", " --More-- ", "  ---- More ----", "--More--"]) {
    assert.ok(more.test(mark.trimEnd()), `backend: ${mark}`);
    assert.equal(C.stripPager(`${mark}`).trim(), "", `frontend: ${mark}`);
  }
  assert.ok(!more.test("Learn more -- in the docs"));
  // Junos y Huawei: el comando va con "| no-more"; Cisco y FortiOS no tienen equivalente por comando.
  assert.equal(T.withNoPager("juniper", "show lldp neighbors"), "show lldp neighbors | no-more");
  assert.equal(T.withNoPager("huawei", "display lldp neighbor"), "display lldp neighbor | no-more");
  assert.equal(T.withNoPager("cisco", "show cdp neighbors detail"), "show cdp neighbors detail");
  assert.equal(T.withNoPager("fortinet", "diagnose lldprx neighbor summary"), "diagnose lldprx neighbor summary");
  assert.equal(T.withNoPager("juniper", "show lldp neighbors | no-more"), "show lldp neighbors | no-more", "no se repite el filtro");
  assert.equal(T.withNoPager(undefined, "show version"), "show version");
  // Todo lo que se envía sigue siendo de consulta también con el filtro.
  for (const v of ["juniper", "huawei"]) {
    const cmds = [...T.NEIGHBOR_COMMANDS[v], ...T.PORT_COMMANDS[v], ...T.ROUTING_COMMANDS[v], ...T.MAC_COMMANDS[v], T.ADDRESS_COMMANDS[v]].filter(Boolean);
    for (const cmd of cmds) assert.equal(computeRisk(T.withNoPager(v, cmd)), "read", T.withNoPager(v, cmd));
  }
  assert.equal(computeRisk(T.withNoPager("juniper", T.junosDetailCommand("ge-0/0/0"))), "read");
}

// ---------- 2. Enlaces que el equipo ya no informa ----------
{
  // A informa B y C; se retira C y A se vuelve a descubrir viendo solo B.
  const before = T.mergeNeighbors(EMPTY, A, [nb("sw-b", "Gi1/0/1", "Gi0/1"), nb("sw-c", "Gi1/0/2", "Gi0/1")], { now: T0 });
  assert.ok(before.links.every((l) => !T.isStale(l)));
  const t = T.mergeNeighbors(before, A, [nb("sw-b", "Gi1/0/1", "Gi0/1")], { now: T0 + 1000 });
  assert.equal(t.links.length, 2, "el enlace no se borra solo");
  const gone = t.links.find((l) => l.b === "sw-c");
  const kept = t.links.find((l) => l.b === "sw-b");
  assert.deepEqual([gone.staleSince, gone.seenBy], [T0 + 1000, []], "marcado con el momento de la lectura");
  assert.ok(T.isStale(gone) && !T.isStale(kept));
  // El snapshot lo muestra como retirado (antes daba 0 retirados).
  const d = T.diffTopology(before, t);
  assert.deepEqual(d.removedLinks.map((l) => l.b), ["sw-c"]);
  assert.deepEqual([d.addedLinks.length, d.addedNodes.length, d.removedNodes.length], [0, 0, 0]);
  assert.equal(T.diffTopology(t, t).removedLinks.length, 0, "ya estaba así en el snapshot: sin cambios");
  // La revisión lo informa (antes seenBy vacío pasaba como normal) y es su único hallazgo.
  const checks = I.linkChecks(t);
  const issue = checks.get(T.linkKey(gone));
  assert.equal(issue.length, 1);
  assert.deepEqual([issue[0].kind, issue[0].sev, issue[0].end], ["stale", "warn", "both"]);
  assert.match(issue[0].short, /^Ya no informado: no visto desde \d\d-\d\d \d\d:\d\d$/);
  assert.ok(!checks.has(T.linkKey(kept)));
  assert.equal(I.attentionRows(t, checks, new Map()).length, 1, "aparece en Requieren atención");
  assert.equal(I.linkDetail(t, gone).staleSince, T0 + 1000);
  assert.equal(I.linkDetail(t, kept).staleSince, undefined);
  // Exportaciones: el CSV lo dice y el SVG lo dibuja tenue.
  assert.match(T.toCsv(t), /"CDP \(ya no informado\)"$/m);
  assert.match(T.toMermaid(t), /ya no informado/);
  assert.match(T.toSvg(t), /stroke-opacity="0\.55" stroke-dasharray="1\.5 6"/);
  // Una lectura posterior no pisa la fecha; si vuelve a verse, deja de ser "no visto".
  assert.equal(T.mergeNeighbors(t, A, [nb("sw-b", "Gi1/0/1", "Gi0/1")], { now: T0 + 9000 }).links.find((l) => l.b === "sw-c").staleSince, T0 + 1000);
  const back = T.mergeNeighbors(t, A, [nb("sw-b", "Gi1/0/1", "Gi0/1"), nb("sw-c", "Gi1/0/2", "Gi0/1")], { now: T0 + 9000 });
  assert.ok(back.links.every((l) => !T.isStale(l) && l.staleSince === undefined));
  // Purgar: quita el enlace y el equipo que solo existía por él; nunca los explorados ni los manuales.
  const purged = T.purgeStale(t);
  assert.deepEqual([purged.links.length, purged.nodes.map((n) => n.id)], [1, ["sw-a", "sw-b"]]);
  assert.equal(T.purgeStale(purged), purged, "sin nada que quitar devuelve el mismo diagrama");
  const manual = { ...t, nodes: t.nodes.map((n) => (n.id === "sw-c" ? { ...n, manual: true } : n)) };
  assert.ok(T.purgeStale(manual).nodes.some((n) => n.id === "sw-c"), "un equipo agregado a mano no se quita");
  // La ruta más corta evita un enlace que ya nadie informa si hay otro camino.
  const ring = {
    nodes: ["sw-a", "sw-b", "sw-c"].map((id) => ({ id, name: id, explored: true, x: 1, y: 1 })),
    links: [
      { a: "sw-a", aPort: "Gi1", b: "sw-c", bPort: "Gi1", proto: "CDP", seenBy: [], staleSince: T0 },
      { a: "sw-a", aPort: "Gi2", b: "sw-b", bPort: "Gi1", proto: "CDP", seenBy: ["sw-a"] },
      { a: "sw-b", aPort: "Gi2", b: "sw-c", bPort: "Gi2", proto: "CDP", seenBy: ["sw-b"] },
    ],
  };
  assert.deepEqual(T.shortestPath(ring, "sw-a", "sw-c").nodes, ["sw-a", "sw-b", "sw-c"]);
  assert.deepEqual(T.shortestPath({ ...ring, links: ring.links.slice(0, 1) }, "sw-a", "sw-c").nodes, ["sw-a", "sw-c"], "si es el único camino, se usa");
}
{
  // Recableado: el mismo puerto pasa de B a C. Antes quedaban dos enlaces vigentes en Gi1/0/1.
  let t = T.mergeNeighbors(EMPTY, A, [nb("sw-b", "Gi1/0/1", "Gi0/1")], { now: T0 });
  t = T.mergeNeighbors(t, A, [nb("sw-c", "GigabitEthernet1/0/1", "Gi0/1")], { now: T0 + 1 });
  assert.deepEqual(t.links.filter((l) => !T.isStale(l)).map((l) => l.b), ["sw-c"]);
  assert.deepEqual(t.links.filter(T.isStale).map((l) => l.b), ["sw-b"]);

  const two = T.mergeNeighbors(EMPTY, A, [nb("sw-b", "Gi1/0/1", "Gi0/1"), nb("sw-c", "Gi1/0/2", "Gi0/1")], { now: T0 });
  // Lectura cortada (ningún protocolo completo): no se retira lo que no alcanzó a verse…
  const cut = T.mergeNeighbors(two, A, [nb("sw-b", "Gi1/0/1", "Gi0/1")], { complete: [], now: T0 + 1 });
  assert.ok(cut.links.every((l) => !T.isStale(l)), "lectura parcial: nada retirado");
  assert.deepEqual(cut.links.find((l) => l.b === "sw-c").seenBy, ["sw-a"], "ni deja de constar como visto");
  // …pero sí lo que fue reemplazado en su mismo puerto, que es un dato positivo.
  const swapped = T.mergeNeighbors(two, A, [nb("sw-d", "Gi1/0/1", "Gi0/1")], { complete: [], now: T0 + 1 });
  assert.deepEqual(swapped.links.filter(T.isStale).map((l) => l.b), ["sw-b"]);
  // Un vecino descartado por el alcance también ocupa el puerto (`seen` trae todo lo leído).
  const scoped = T.mergeNeighbors(two, A, [nb("sw-c", "Gi1/0/2", "Gi0/1")], { seen: [nb("tel-0101", "Gi1/0/1", "Port 1"), nb("sw-c", "Gi1/0/2", "Gi0/1")], now: T0 + 1 });
  assert.deepEqual(scoped.links.filter(T.isStale).map((l) => l.b), ["sw-b"]);
  assert.ok(!scoped.nodes.some((n) => n.id === "tel-0101"), "el descartado no entra al diagrama");
  // Por protocolo: con solo CDP leído completo, un enlace LLDP que no se vio no se retira.
  const mixed = T.mergeNeighbors(EMPTY, A, [nb("sw-b", "Gi1/0/1", "Gi0/1"), nb("ap-01", "Gi1/0/9", "eth0", { proto: "LLDP" })], { now: T0 });
  const onlyCdp = T.mergeNeighbors(mixed, A, [], { complete: ["CDP"], now: T0 + 1 });
  assert.deepEqual(onlyCdp.links.filter(T.isStale).map((l) => l.b), ["sw-b"]);
  // Varios vecinos en un puerto (teléfono con un PC detrás): no se retiran entre sí.
  const shared = [nb("tel-0101", "Gi1/0/5", "Port 1"), nb("pc-0101", "Gi1/0/5", "eth0", { proto: "LLDP" })];
  assert.ok(T.mergeNeighbors(T.mergeNeighbors(EMPTY, A, shared), A, shared).links.every((l) => !T.isStale(l)));
  // El otro extremo aún lo informa: no es "ya no informado" sino una asimetría.
  let asym = T.mergeNeighbors(EMPTY, A, [nb("sw-b", "Gi1/0/1", "Gi0/1")]);
  asym = T.mergeNeighbors(asym, { name: "sw-b" }, [nb("sw-a", "Gi0/1", "Gi1/0/1")]);
  asym = T.mergeNeighbors(asym, A, []);
  assert.deepEqual([asym.links[0].seenBy, T.isStale(asym.links[0])], [["sw-b"], false]);
  assert.equal(I.linkChecks(asym).get(T.linkKey(asym.links[0]))[0].kind, "asym");
  // Diagramas guardados por versiones anteriores, sin `seenBy`: si el otro extremo no se ha explorado,
  // solo este equipo pudo informar el enlace.
  const legacy = (bExplored) => ({
    nodes: [
      { id: "sw-a", name: "sw-a", explored: true, x: 1, y: 1 },
      { id: "sw-b", name: "sw-b", explored: bExplored, x: 2, y: 2 },
    ],
    links: [{ a: "sw-a", aPort: "Gi1/0/1", b: "sw-b", bPort: "Gi0/1", proto: "CDP" }],
  });
  assert.ok(T.isStale(T.mergeNeighbors(legacy(false), A, []).links[0]));
  assert.ok(!T.isStale(T.mergeNeighbors(legacy(true), A, []).links[0]), "con el otro explorado no se sabe quién lo informó");
  // Guardado con `seenBy` vacío antes de existir la marca: cuenta como no visto, sin fecha.
  const old = { ...legacy(false), links: [{ ...legacy(false).links[0], seenBy: [] }] };
  assert.ok(T.isStale(old.links[0]));
  assert.equal(I.linkChecks(old).get(T.linkKey(old.links[0]))[0].short, "Ya no informado: no visto");
  // Un enlace manual o de ruteo nunca se marca.
  let user = T.addManualNode(T.mergeNeighbors(EMPTY, A, []), { name: "fw-borde" }).topo;
  user = T.addManualLink(user, { a: "sw-a", aPort: "Gi1/0/3", b: "fw-borde", bPort: "port1" }).topo;
  assert.ok(T.mergeNeighbors(user, A, []).links.every((l) => !T.isStale(l)));
}
{
  // Qué protocolos se leyeron completos por consola.
  const cdp = "sw-a#show cdp neighbors detail\nTotal cdp entries displayed : 0\nsw-a#";
  const c1 = "show cdp neighbors detail";
  const c2 = "show lldp neighbors detail";
  assert.deepEqual(T.completeProtos("cisco", [{ cmd: c1, out: cdp }, { cmd: c2, out: "sw-a#show lldp neighbors detail\nTotal entries displayed: 0\nsw-a#" }]), ["CDP", "LLDP"]);
  assert.deepEqual(T.completeProtos("cisco", [{ cmd: c1, out: cdp }, { cmd: c2, out: "% LLDP is not enabled\nsw-a#" }]), ["CDP", "LLDP"], "apagado es una respuesta completa");
  assert.deepEqual(T.completeProtos("cisco", [{ cmd: c1, out: cdp }, { cmd: c2, out: "% Invalid input detected at '^' marker.\nsw-a#" }]), ["CDP"], "comando inexistente: no se leyó");
  assert.deepEqual(T.completeProtos("cisco", [{ cmd: c1, out: cdp, cut: true }, { cmd: c2, out: "" }]), [], "cortado o sin enviar");
  assert.deepEqual(T.completeProtos("juniper", [{ cmd: "show lldp neighbors", out: "noc@mx1> show lldp neighbors\n\nnoc@mx1>" }]), ["LLDP"]);
  assert.deepEqual(T.completeProtos("fortinet", [{ cmd: "diagnose lldprx neighbor summary", out: "Command fail. Return code -61\nfw01 #" }]), []);
  assert.deepEqual(T.completeProtos("cisco", []), []);
}

// ---------- 4. Chassis ID con formato MAC como nombre ----------
{
  assert.equal(T.nodeId("0c75.bd12.3456"), "0c75.bd12.3456");
  assert.equal(T.nodeId("00:00:5E:00:53:01"), "0000.5e00.5301");
  assert.equal(T.nodeId("00-00-5e-00-53-01"), "0000.5e00.5301");
  assert.equal(T.nodeId("0000-5e00-5301"), "0000.5e00.5301");
  // Lo demás sigue igual: nombre corto, IP completa, hostname hexadecimal sin separadores.
  assert.equal(T.nodeId("SW1.example.net"), "sw1");
  assert.equal(T.nodeId("192.0.2.1"), "192.0.2.1");
  assert.equal(T.nodeId("cafe.example.net"), "cafe");
  assert.equal(T.nodeId("deadbeefcafe"), "deadbeefcafe");
  assert.equal(T.nodeId("spine1(FDO00000000)"), "spine1");
  // IOS "show lldp neighbors detail" sin System Name: antes ambos vecinos eran el equipo "0c75".
  const lldp = `sw-a#show lldp neighbors detail
------------------------------------------------
Local Intf: Gi1/0/1
Chassis id: 0c75.bd12.3456
Port id: 0c75.bd12.3456
Port Description - not advertised
System Name - not advertised

Time remaining: 100 seconds
------------------------------------------------
Local Intf: Gi1/0/2
Chassis id: 0c75.bd98.7654
Port id: 0c75.bd98.7654
Port Description - not advertised
System Name - not advertised

Total entries displayed: 2
sw-a#`;
  const t = T.mergeNeighbors(EMPTY, A, T.parseNeighbors("cisco", [lldp]));
  assert.deepEqual(t.nodes.map((n) => n.id), ["sw-a", "0c75.bd12.3456", "0c75.bd98.7654"]);
  assert.equal(t.links.length, 2);
  // Por SNMP (lldpRemChassisId con subtipo MAC) pasaba lo mismo, y queda con el mismo id que por consola.
  const O = S.OID;
  const mac = (oid, hex) => ({ oid, type: "OCTET STRING", value: "?", hex });
  const int = (oid, v) => ({ oid, type: "INTEGER", value: String(v) });
  const str = (oid, v) => ({ oid, type: "OCTET STRING", value: v, hex: Buffer.from(v).toString("hex") });
  const walks = new Map();
  const add = (root, row) => walks.set(root, [...(walks.get(root) ?? []), row]);
  for (const [i, hex] of [
    [1, "0c75bd123456"],
    [2, "0c75bd987654"],
  ]) {
    add(O.lldpRemChassisIdSubtype, int(`${O.lldpRemChassisIdSubtype}.0.${i}.1`, 4));
    add(O.lldpRemChassisId, mac(`${O.lldpRemChassisId}.0.${i}.1`, hex));
    add(O.lldpRemPortIdSubtype, int(`${O.lldpRemPortIdSubtype}.0.${i}.1`, 5));
    add(O.lldpRemPortId, str(`${O.lldpRemPortId}.0.${i}.1`, "eth0"));
    add(O.ifName, str(`${O.ifName}.${i}`, `Gi1/0/${i}`));
  }
  const read = { gets: [], getError: null, ms: 1, walks: [...walks].map(([oid, rows]) => ({ oid, rows, truncated: false, timedOut: false, error: null })) };
  const d = S.parseSnmpDiscovery(read, { routing: false, mac: false, ports: false });
  assert.deepEqual(d.neighbors.map((n) => T.nodeId(n.name)), ["0c75.bd12.3456", "0c75.bd98.7654"]);
  assert.equal(T.mergeNeighbors(t, A, d.neighbors).nodes.length, 3, "consola y SNMP: los mismos dos equipos");
}

// ---------- 5. Junos "show lldp neighbors" resumido ----------
{
  const j = `noc@mx1> show lldp neighbors
Local Interface    Parent Interface    Chassis Id          Port info          System Name
ge-0/0/0           ae0                 00:00:5e:00:53:01   Uplink to MX1      core-sw01
ge-0/0/1           -                   00:00:5e:00:53:02   Gi1/0/2            dist-sw02.example.net
ge-0/0/2           -                   00:00:5e:00:53:03   ge-0/0/5
xe-0/0/3           -                   00:00:5e:00:53:04   528                acc-sw04
xe-0/0/4           ae1.0               00:00:5e:00:53:05   Enlace troncal hacia el nucleo dist-sw05

{master:0}
noc@mx1>`;
  assert.deepEqual(
    T.parseJunosLldp(j).map((n) => [n.localPort, n.group, n.remotePort, n.name]),
    [
      ["ge-0/0/0", "ae0", "Uplink to MX1", "core-sw01"],
      ["ge-0/0/1", undefined, "Gi1/0/2", "dist-sw02.example.net"],
      ["ge-0/0/2", undefined, "ge-0/0/5", "00:00:5e:00:53:03"],
      ["xe-0/0/3", undefined, "528", "acc-sw04"],
      ["xe-0/0/4", "ae1", "Enlace troncal hacia el nucleo", "dist-sw05"],
    ],
    "descripción con espacios, sin System Name y Port info más ancho que su columna",
  );
  // Formato antiguo, sin la columna Parent Interface: antes daba 0 vecinos.
  const old = `noc@ex1> show lldp neighbors
Local Interface    Chassis Id          Port info          System Name
ge-0/0/0.0         00:00:5e:00:53:01   ge-0/0/1.0         ex2
ge-0/0/1.0         00:00:5e:00:53:06   Uplink a ex3       ex3.example.net
noc@ex1>`;
  assert.deepEqual(T.parseJunosLldp(old).map((n) => [n.localPort, n.group, n.remotePort, n.name]), [
    ["ge-0/0/0.0", undefined, "ge-0/0/1.0", "ex2"],
    ["ge-0/0/1.0", undefined, "Uplink a ex3", "ex3.example.net"],
  ]);
  // Sin encabezado (una página que no lo trae): el nombre es la última palabra, como antes.
  assert.deepEqual(T.parseJunosLldp("ge-0/0/0  -  00:00:5e:00:53:01  ge-0/0/1  ex2").map((n) => [n.remotePort, n.name]), [["ge-0/0/1", "ex2"]]);
  assert.deepEqual(T.parseJunosLldp("Local Interface Parent Interface Chassis Id Port info System Name\nno es una fila\n{master:0}"), []);
  // El detalle por interfaz corrige el puerto remoto cuando la tabla trae una descripción o un índice.
  const detail = (local, portId, sys, chassis = "00:00:5e:00:53:01") => `noc@mx1> show lldp neighbors interface ${local}
LLDP Neighbor Information:
Local Information:
Local Interface    : ${local}
Parent Interface   : -
Local Port ID      : 510

Neighbour Information:
Chassis type       : Mac address
Chassis ID         : ${chassis}
Port type          : Interface name
Port ID            : ${portId}
${sys ? `System name        : ${sys}\n` : ""}
Management Info
  Address          : 192.0.2.31
noc@mx1>`;
  const merged = T.parseNeighbors("juniper", [j, detail("ge-0/0/0", "xe-1/0/7", "core-sw01")]);
  const core = merged.find((n) => n.name === "core-sw01");
  assert.deepEqual([core.remotePort, core.ip, core.group], ["xe-1/0/7", "192.0.2.31", "ae0"]);
  assert.equal(merged.length, 5, "resumen y detalle del mismo vecino no se duplican");
  // "Local Port ID" (el índice propio) no se toma como el puerto del vecino.
  assert.equal(T.parseJunosLldpDetail(detail("ge-0/0/0", "xe-1/0/7", "core-sw01")).remotePort, "xe-1/0/7");
  // Sin System name: el Chassis ID, igual que en la tabla, para que sea el mismo vecino.
  const noName = T.parseNeighbors("juniper", [j, detail("ge-0/0/2", "ge-0/0/5", "", "00:00:5e:00:53:03")]);
  assert.equal(noName.filter((n) => n.localPort === "ge-0/0/2").length, 1);
  assert.equal(noName.find((n) => n.localPort === "ge-0/0/2").ip, "192.0.2.31");
}

// ---------- 6. NX-OS: comandos y estados de puertos ----------
{
  // NX-OS no acepta "show interfaces …": cada comando de estado tiene su variante "show interface …".
  assert.deepEqual(T.FALLBACK_COMMANDS["show interfaces status"], ["show interfaces description", "show interface status"]);
  assert.deepEqual(T.FALLBACK_COMMANDS["show interfaces counters errors"], ["show interface counters errors"]);
  assert.deepEqual(T.FALLBACK_COMMANDS["show interfaces trunk"], ["show interface trunk"]);
  for (const [cmd, alts] of Object.entries(T.FALLBACK_COMMANDS)) {
    assert.ok(Array.isArray(alts) && alts.length, cmd);
    for (const alt of alts) assert.equal(computeRisk(alt), "read", alt);
  }
  // Estados que NX-OS corta a 9 caracteres.
  for (const s of ["notconnec", "xcvrAbsen", "sfpAbsent", "suspnd", "suspended", "notconnect", "disabled", "down/down", "*down/down"]) assert.equal(I.portDown(s), "down", s);
  for (const s of ["linkFlapE", "errDisabl", "err-disabled", "errdisabled"]) assert.equal(I.portDown(s), "err-disabled", s);
  for (const s of ["connected", "up/up", "up", "trunking", undefined, ""]) assert.equal(I.portDown(s), undefined, String(s));
  const status = `n9k-01# show interface status

--------------------------------------------------------------------------------
Port          Name               Status    Vlan      Duplex  Speed   Type
--------------------------------------------------------------------------------
mgmt0         --                 connected routed    full    1000    --
Eth1/1        to-core            connected trunk     full    10G     10Gbase-SR
Eth1/2        --                 notconnec 1         auto    auto    10Gbase-SR
Eth1/3        --                 xcvrAbsen 1         auto    auto    --
Eth1/4        srv-01             linkFlapE 10        auto    auto    10Gbase-SR
n9k-01#`;
  const errors = `n9k-01# show interface counters errors

--------------------------------------------------------------------------------
Port          Align-Err    FCS-Err   Xmit-Err    Rcv-Err  UnderSize OutDiscards
--------------------------------------------------------------------------------
mgmt0                 0          0          0          0          0           0
Eth1/1                0         37          0         37          0           0

--------------------------------------------------------------------------------
Port         Single-Col  Multi-Col   Late-Col  Exces-Col  Carri-Sen      Runts
--------------------------------------------------------------------------------
Eth1/1                0          0          0          0          0          9
n9k-01#`;
  const trunk = `n9k-01# show interface trunk

--------------------------------------------------------------------------------
Port          Native  Status        Port
              Vlan                  Channel
--------------------------------------------------------------------------------
Eth1/1        99      trunking      --
Eth1/5        1       trnk-bndl     Po10
Eth1/6        1       not-trunking  --
Po10          1       trunking      --

--------------------------------------------------------------------------------
Port          Vlans Allowed on Trunk
--------------------------------------------------------------------------------
Eth1/1        1-4094
n9k-01#`;
  const p = T.parsePortInfo([status, errors, trunk]);
  assert.deepEqual(p["eth1/1"], { status: "connected", speed: "10G", desc: "to-core", vlan: "trunk", duplex: "full", crc: "37", native: "99" });
  assert.deepEqual([p["eth1/2"].status, p["eth1/2"].desc, I.portDown(p["eth1/2"].status)], ["notconnec", undefined, "down"]);
  assert.equal(I.portDown(p["eth1/3"].status), "down");
  assert.equal(I.portDown(p["eth1/4"].status), "err-disabled");
  assert.deepEqual([p["eth1/5"].native, p["eth1/5"].vlan], ["1", "trunk"], "miembro de un port-channel");
  assert.equal(p["eth1/6"]?.native, undefined, "un puerto que no es trunk no trae VLAN nativa");
  assert.equal(p.po10.native, "1");
  // El enlace con el puerto en notconnec se pinta caído.
  const t = {
    nodes: [
      { id: "n9k-01", name: "n9k-01", explored: true, x: 1, y: 1, ports: p },
      { id: "srv-02", name: "srv-02", explored: false, x: 2, y: 2 },
    ],
    links: [{ a: "n9k-01", aPort: "Eth1/2", b: "srv-02", bPort: "eth0", proto: "LLDP", seenBy: ["n9k-01"] }],
  };
  assert.equal(I.linkChecks(t).get(T.linkKey(t.links[0]))[0].kind, "down");
}

// ---------- 7. SNMP: un GET con error no es "sin contadores de 64 bits" ----------
{
  const O = S.OID;
  // tooBig, genErr o authorizationError dejan el GET sin filas: antes se tomaba como "sin ifXTable".
  assert.equal(R.parseCounterGets([], [1, 2], true, 1).hcMissing, false);
  // Solo si el agente dice que no tiene esos objetos.
  const noSuch = (t) => [1, 2].flatMap((i) => [O.ifHCInOctets, O.ifHCOutOctets, O.ifHighSpeed].map((c) => ({ oid: `${c}.${i}`, type: t, value: "" })));
  assert.equal(R.parseCounterGets(noSuch("noSuchObject"), [1, 2], true, 1).hcMissing, true);
  assert.equal(R.parseCounterGets(noSuch("noSuchInstance"), [1, 2], true, 1).hcMissing, true);
  const some = [...noSuch("noSuchInstance").filter((r) => !r.oid.endsWith(".2")), { oid: `${O.ifHCInOctets}.2`, type: "Counter64", value: "10" }, { oid: `${O.ifHCOutOctets}.2`, type: "Counter64", value: "20" }];
  assert.deepEqual([R.parseCounterGets(some, [1, 2], true, 1).hcMissing, R.parseCounterGets(some, [1, 2], true, 1).samples.size], [false, 1], "una interfaz que ya no existe no cambia de columna");
  assert.equal(R.parseCounterGets(noSuch("noSuchObject"), [1, 2], false, 1).hcMissing, false, "ya en 32 bits no hay a dónde bajar");
  // Counter32 en 10 G: 8 Gb/s reales durante 30 s dan varias vueltas y se leen como 1,13 Gb/s. Se marca.
  const real = BigInt((8e9 / 8) * 30);
  const w0 = { inOctets: 100n, outOctets: 100n, bits: 32, speed: 10e9, ts: 0, src: "snmp" };
  const w1 = { inOctets: 100n, outOctets: (100n + real) % (1n << 32n), bits: 32, speed: 10e9, ts: 30_000, src: "snmp" };
  const low = R.portRate(w0, w1);
  assert.equal(low.lowRes, true);
  assert.ok(low.outBps > 1.1e9 && low.outBps < 1.2e9);
  const lt = R.linkTraffic({ a: "sw-a", aPort: "Te1/1/1", b: "sw-b", bPort: "Te1/1/1", proto: "CDP" }, new Map([["sw-a", new Map([["te1/1/1", low]])]]));
  assert.deepEqual([lt.approx, lt.lowRes], [true, true], "la utilización se muestra con ≈");
  assert.equal(I.linkDetail({ nodes: [], links: [] }, { a: "sw-a", aPort: "Te1/1/1", b: "sw-b", bPort: "Te1/1/1", proto: "CDP" }, { lt }).lowRes, true);
  // Bajo 1 G un contador de 32 bits alcanza, y con 64 bits nunca se marca.
  assert.equal(R.portRate({ ...w0, speed: 100e6 }, { ...w1, speed: 100e6, outOctets: 5000n }).lowRes, undefined);
  assert.equal(R.portRate({ ...w0, bits: 64 }, { ...w1, bits: 64, outOctets: 100n + real }).lowRes, undefined);
  // Si el otro extremo se lee con 64 bits, se usa ese y el enlace no queda aproximado.
  const hi = R.portRate({ ...w0, bits: 64 }, { ...w1, bits: 64, inOctets: 100n + real, outOctets: 100n });
  const both = R.linkTraffic({ a: "sw-b", aPort: "Te1/1/1", b: "sw-a", bPort: "Te1/1/1", proto: "CDP" }, new Map([["sw-a", new Map([["te1/1/1", low]])], ["sw-b", new Map([["te1/1/1", hi]])]]));
  assert.deepEqual([both.lowRes, both.approx, Math.round(both.ba / 1e9)], [undefined, undefined, 8]);
  // Índice de interfaces leído a medias: no se da por completo.
  const walk = (oid, extra = {}) => ({ oid, rows: [], truncated: false, timedOut: false, error: null, ...extra });
  const rd = (walks) => ({ gets: [], getError: null, walks, ms: 1 });
  assert.equal(S.walksComplete(rd([walk(O.ifName), walk(O.ifDescr)])), true);
  assert.equal(S.walksComplete(rd([walk(O.ifName, { timedOut: true }), walk(O.ifDescr)])), false);
  assert.equal(S.walksComplete(rd([walk(O.ifName), walk(O.ifDescr, { truncated: true })])), false);
  assert.equal(S.walksComplete(rd([walk(O.ifName, { error: "genErr" })]), [O.ifDescr]), true, "solo las tablas pedidas");
  assert.equal(S.parseSnmpDiscovery(rd([walk(O.ifName, { timedOut: true }), walk(O.ifDescr)]), { routing: false, mac: false, ports: false }).ifIndexComplete, false);
  assert.equal(S.parseSnmpDiscovery(rd([walk(O.ifName), walk(O.ifDescr)]), { routing: false, mac: false, ports: false }).ifIndexComplete, true);
  // Sin vecinos por SNMP no se sabe si no hay o si el agente no publica la MIB: no se retira nada.
  assert.deepEqual(S.parseSnmpDiscovery(rd([walk(O.ifName)]), { routing: false, mac: false, ports: false }).complete, []);
}

// ---------- 8. Tasa calculada contra una lectura antigua ----------
{
  const old = { inOctets: 0n, outOctets: 0n, bits: 64, speed: 1e9, ts: 0 };
  const now = { inOctets: 0n, outOctets: BigInt((900e6 / 8) * 60), bits: 64, speed: 1e9, ts: 7_200_000 };
  // Al volver tras 2 h la tasa era el promedio de 2 h (7,5 Mb/s en vez de 900 Mb/s del último minuto).
  assert.equal(R.portRate(old, now).outBps, 7.5e6, "sin tope se conserva el comportamiento anterior");
  assert.deepEqual(R.portRate(old, now, R.maxSampleGapMs(60)), { inBps: null, outBps: null, speed: 1e9, ts: 7_200_000 });
  // Dentro del margen se calcula normal.
  const recent = { ...old, ts: 7_200_000 - 60_000 };
  assert.equal(R.portRate(recent, now, R.maxSampleGapMs(60)).outBps, 900e6);
  // Tres intervalos, con un piso de 3 min (una lectura por consola puede tardar más de un minuto).
  assert.deepEqual([15, 30, 60, 120].map(R.maxSampleGapMs), [180_000, 180_000, 180_000, 360_000]);
  assert.equal(R.portRate({ ...old, ts: 7_200_000 - 180_001 }, now, R.maxSampleGapMs(30)).outBps, null);
}

// ---------- 9. Port-channel por consola: velocidad del agregado ----------
{
  const po = `sw-a#show interfaces
Port-channel1 is up, line protocol is up (connected)
  Hardware is EtherChannel, address is 0000.5e00.5301 (bia 0000.5e00.5301)
  MTU 1500 bytes, BW 4000000 Kbit/sec, DLY 10 usec,
     reliability 255/255, txload 1/255, rxload 1/255
  Full-duplex, 1000Mb/s, link type is auto, media type is unknown
  Members in this channel: Gi1/0/1 Gi1/0/2 Gi1/0/3 Gi1/0/4
     1000 packets input, 1000000 bytes, 0 no buffer
     1000 packets output, 2000000 bytes, 0 underruns
GigabitEthernet1/0/1 is up, line protocol is up (connected)
  MTU 1500 bytes, BW 1000000 Kbit/sec, DLY 10 usec,
  Full-duplex, 1000Mb/s, media type is 10/100/1000BaseTX
     500 packets input, 500000 bytes, 0 no buffer
     500 packets output, 700000 bytes, 0 underruns
sw-a#`;
  const c = R.parseCliCounters(po);
  assert.deepEqual([c.get("po1").speed, c.get("po1").speedApprox], [4e9, true], "el BW (suma de los miembros), no 1 G");
  assert.deepEqual([c.get("gi1/0/1").speed, c.get("gi1/0/1").speedApprox], [1e9, undefined], "un miembro conserva su velocidad física");
  // 2,4 Gb/s reales ya no se descartan por superar 1,5 veces 1 G.
  const sample = (outOctets, ts) => ({ inOctets: 0n, outOctets, bits: 64, speed: c.get("po1").speed, approx: true, ts, src: "cli" });
  assert.equal(R.portRate(sample(0n, 0), sample(BigInt((2.4e9 / 8) * 30), 30_000)).outBps, 2.4e9);
  // Huawei Eth-Trunk (lectura tolerante): "Current BW".
  const hw = R.parseCliCounters(`Eth-Trunk1 current state : UP
Line protocol current state : UP
Hash arithmetic : According to SIP-XOR-DIP, Maximal BW: 4G, Current BW: 2G, The Maximum Frame Length is 9216
    Input:  10 packets, 2000 bytes
    Output:  10 packets, 3000 bytes`);
  assert.equal(hw.get("po1").speed, 2e9);
}

// ---------- 10. Equipo duplicado si el prompt difiere del nombre CDP/LLDP ----------
{
  let t = T.mergeNeighbors(EMPTY, { name: "core1", ip: "192.0.2.1" }, [nb("mx-edge.example.net", "Gi0/1", "ge-0/0/0", { ip: "192.0.2.2", proto: "LLDP" })]);
  assert.equal(T.deviceNode(t, "mx-edge-re0", "192.0.2.2")?.id, "mx-edge", "mismo equipo: tiene su IP de gestión");
  t = T.mergeNeighbors(t, { name: "mx-edge-re0", ip: "192.0.2.2" }, [nb("core1", "ge-0/0/0", "Gi0/1", { proto: "LLDP" })]);
  assert.deepEqual(t.nodes.map((n) => [n.id, n.ip, n.explored]), [
    ["core1", "192.0.2.1", true],
    ["mx-edge", "192.0.2.2", true],
  ]);
  assert.deepEqual(t.nodes[1].aliases, ["mx-edge-re0"]);
  assert.equal(t.nodes[1].name, "mx-edge.example.net", "conserva el nombre con que lo conocen sus vecinos");
  assert.deepEqual(t.links.map((l) => [l.a, l.aPort, l.b, l.bPort, l.seenBy]), [["core1", "Gi0/1", "mx-edge", "ge-0/0/0", ["core1", "mx-edge"]]]);
  // Con el alias ya guardado se reconoce sin IP, también como vecino de otro y al buscarlo.
  const again = T.mergeNeighbors(t, { name: "MX-EDGE-RE0" }, [nb("core1", "ge-0/0/0", "Gi0/1", { proto: "LLDP" })]);
  assert.deepEqual([again.nodes.length, again.nodes[1].aliases], [2, ["mx-edge-re0"]]);
  assert.equal(T.mergeNeighbors(t, { name: "core2" }, [nb("mx-edge-re0", "Gi0/2", "ge-0/0/1")]).nodes.length, 3);
  assert.equal(T.findNode(t, "mx-edge-re0")?.id, "mx-edge");
  assert.equal(I.scopeNeighbors(t, "mx-edge-re0", [nb("pe-09", "ge-0/0/9", "ge-0/0/0")], { skipEndpoints: false, cidrs: "", maxDepth: 1 }).skipped.length, 1, "la profundidad se mide desde el equipo, no desde un nombre nuevo");
  // No se reutiliza un equipo ya explorado, uno conocido solo por dirección, ni si hay dos candidatos.
  assert.equal(T.deviceNode(t, "otro-nombre", "192.0.2.2"), undefined, "ya explorado con otro nombre: no se asume");
  const byAddr = T.mergeNeighbors(EMPTY, { name: "core1" }, [{ name: "192.0.2.9", localPort: "Gi0/3", remotePort: "", ip: "192.0.2.9", addrs: ["192.0.2.9"], proto: "OSPF", byAddr: true }]);
  assert.equal(T.deviceNode(byAddr, "pe-09", "192.0.2.9"), undefined, "los de ruteo se fusionan aparte, con su nombre real");
  assert.deepEqual(T.mergeNeighbors(byAddr, { name: "pe-09", ip: "192.0.2.9" }, []).nodes.map((n) => n.id), ["core1", "pe-09"]);
  const twins = T.mergeNeighbors(EMPTY, { name: "core1" }, [nb("fw-a", "Gi0/1", "port1", { ip: "192.0.2.5" }), nb("fw-b", "Gi0/2", "port1", { ip: "192.0.2.5" })]);
  assert.equal(T.deviceNode(twins, "fw-cluster", "192.0.2.5"), undefined, "dos equipos anuncian esa IP: no se elige uno");
  assert.equal(T.deviceNode(t, "x", "no-es-ip"), undefined);
  assert.equal(T.deviceNode(t, "x", "127.0.0.1"), undefined);
}

// ---------- 11. Tráfico por consola en pestañas con alias de prompt ----------
{
  const session = { id: "s1", name: "core-sw01", type: "ssh", host: "192.0.2.1", port: 22, username: "noc", created_at: "x" };
  // El salto llegó a "acc-sw01" pero su prompt dice "ACC_SW01-A": la ruta lo guarda como alias del paso.
  const route = { origin: "core-sw01", session, steps: [{ name: "acc-sw01", ip: "192.0.2.21", cmd: "ssh -l noc 192.0.2.21", user: "noc", prompt: "edificio-b-sw" }] };
  assert.ok(H.promptIsDevice("acc-sw01", "acc-sw01"));
  assert.ok(H.promptIsDevice("ACC_SW01.example.net", "acc-sw01"), "dominio, mayúsculas y guion bajo");
  assert.ok(H.promptIsDevice("edificio-b-sw", "acc-sw01", undefined, route), "alias de la ruta de la pestaña");
  assert.ok(H.promptIsDevice("mx-edge-re0", "mx-edge", ["mx-edge-re0"]), "alias del equipo en el diagrama");
  assert.ok(!H.promptIsDevice("edificio-b-sw", "acc-sw01"), "sin ruta ni alias no es ese equipo");
  assert.ok(!H.promptIsDevice("edificio-b-sw", "core-sw01", undefined, route), "el alias es del otro equipo de la ruta");
  assert.ok(!H.promptIsDevice("dist-sw09", "acc-sw01", ["acc-sw01-b"], route), "la pestaña cambió de equipo");
  // La pestaña de un equipo con alias se encuentra para leer su tráfico (antes quedaba sin lectura).
  const node = { id: "mx-edge", name: "mx-edge.example.net", ip: "192.0.2.2", explored: true, x: 0, y: 0, aliases: ["mx-edge-re0"] };
  const tab = { connId: "c1", tabId: "t1", name: "mx-edge", host: "192.0.2.2", screen: () => "banner\r\nnoc@mx-edge-re0>" };
  assert.equal(R.terminalFor(node, [tab])?.connId, "c1");
  assert.equal(R.terminalFor({ ...node, aliases: undefined }, [tab]), undefined, "sin el alias el prompt es de otro equipo");
  assert.deepEqual(H.planNode(node).aliases, ["mx-edge-re0"]);
}

// ---------- 12. Huawei "display interface brief": miembros de Eth-Trunk ----------
{
  const brief = `<hw-core>display interface brief
PHY: Physical
*down: administratively down
Interface                   PHY   Protocol  InUti OutUti   inErrors  outErrors
Eth-Trunk1                  up    up        0.01%  0.01%          0          0
  GigabitEthernet0/0/1      down  down         0%     0%        120          0
  GigabitEthernet0/0/2      up    up        0.01%  0.01%          0          0
GigabitEthernet0/0/3        up    up        0.01%  0.01%          7          0
GigabitEthernet0/0/4        *down down         0%     0%          0          0
<hw-core>`;
  assert.deepEqual(T.parsePortInfo([brief]), {
    po1: { status: "up/up", inErr: "0" },
    "gi0/0/1": { status: "down/down", inErr: "120", group: "Eth-Trunk1" },
    "gi0/0/2": { status: "up/up", inErr: "0", group: "Eth-Trunk1" },
    "gi0/0/3": { status: "up/up", inErr: "7" },
    "gi0/0/4": { status: "*down/down", inErr: "0" },
  });
}

// ---------- 13. CSV con BOM y nombres completos que se fusionan ----------
{
  const t = T.mergeNeighbors(EMPTY, { name: "núcleo-01" }, [nb("sw-b", "Gi1/0/1", "Gi0/1", { ip: "192.0.2.11" })]);
  const csv = T.toCsv(t);
  assert.equal(csv.charCodeAt(0), 0xfeff, "Excel necesita el BOM para leer los acentos en UTF-8");
  assert.equal(T.CSV_BOM, "\ufeff");
  assert.ok(csv.slice(1).startsWith("equipo_a,ip_a,"));
  assert.equal(csv.split("\ufeff").length, 2, "una sola vez");
  assert.match(csv, /"núcleo-01"/);
  // sw1.scl.example.net y sw1.anf.example.net caen en "sw1": se avisa (siguen dibujándose como uno).
  const cdp = (name, ip, port) => nb(name, port, "Gi0/1", { ip });
  const two = [cdp("sw1.scl.example.net", "192.0.2.11", "Gi1/0/1"), cdp("sw1.anf.example.net", "192.0.2.12", "Gi1/0/2")];
  assert.deepEqual(T.nameCollisions(EMPTY, two), ['sw1.scl.example.net (192.0.2.11) y sw1.anf.example.net (192.0.2.12) comparten el nombre corto "sw1"']);
  // También contra un equipo que ya está en el diagrama.
  const drawn = T.mergeNeighbors(EMPTY, { name: "core1" }, [two[0]]);
  assert.equal(T.nameCollisions(drawn, [two[1]]).length, 1);
  // Sin aviso: mismo nombre, misma IP, sin IP, nombre corto, o una MAC.
  assert.deepEqual(T.nameCollisions(drawn, [two[0]]), []);
  assert.deepEqual(T.nameCollisions(EMPTY, [cdp("sw1.scl.example.net", "192.0.2.11", "Gi1"), cdp("SW1.scl.example.net", "192.0.2.11", "Gi2")]), []);
  assert.deepEqual(T.nameCollisions(EMPTY, [cdp("sw1.scl.example.net", "192.0.2.11", "Gi1"), cdp("sw1.anf.example.net", undefined, "Gi2")]), []);
  assert.deepEqual(T.nameCollisions(EMPTY, [cdp("sw1", "192.0.2.11", "Gi1"), cdp("sw1.anf.example.net", "192.0.2.12", "Gi2")]), []);
  assert.deepEqual(T.nameCollisions(EMPTY, [cdp("0c75.bd12.3456", "192.0.2.11", "Gi1"), cdp("0c75.bd98.7654", "192.0.2.12", "Gi2")]), []);
}

// ---------- Otros: canonPort y puerto remoto ----------
{
  for (const [a, b] of [
    ["Serial0/0/0", "Se0/0/0"],
    ["Ser 0/0/0", "Serial0/0/0"],
    ["Tunnel1", "Tu1"],
    ["Loopback0", "Lo0"],
    ["LoopBack0", "lo0"],
    ["ae1.0", "ae1"],
    ["xe-0/0/0:1.0", "xe-0/0/0:1"],
    ["ge-0/0/1.0", "ge-0/0/1"],
  ])
    assert.equal(T.canonPort(a), T.canonPort(b), `${a} = ${b}`);
  assert.notEqual(T.canonPort("ae1.100"), T.canonPort("ae1"), "otra unidad lógica es otra interfaz");
  assert.notEqual(T.canonPort("Serial0/0/0"), T.canonPort("Serial0/0/1"));
  assert.equal(T.shortPort("ae1.0"), "ae1");
  assert.equal(T.shortPort("xe-0/0/0:1.0"), "xe-0/0/0:1");
  // Junos anunció su descripción como puerto; al explorar el otro extremo queda su nombre real.
  let t = T.mergeNeighbors(EMPTY, { name: "jun1" }, [nb("sw2", "ge-0/0/1", "uplink-jun1", { proto: "LLDP" })]);
  t = T.mergeNeighbors(t, { name: "sw2" }, [nb("jun1", "Gi1/0/5", "ge-0/0/1", { proto: "LLDP" })]);
  assert.deepEqual(t.links.map((l) => [l.a, l.aPort, l.b, l.bPort, l.seenBy]), [["jun1", "ge-0/0/1", "sw2", "Gi1/0/5", ["jun1", "sw2"]]]);
  // Y al volver a explorar el primero no se deshace ni se duplica.
  t = T.mergeNeighbors(t, { name: "jun1" }, [nb("sw2", "ge-0/0/1", "uplink-jun1", { proto: "LLDP" })]);
  assert.deepEqual(t.links.map((l) => [l.aPort, l.bPort, T.isStale(l)]), [["ge-0/0/1", "Gi1/0/5", false]]);
  // Con dos enlaces paralelos, cada vecino calza por su propio puerto.
  let par = T.mergeNeighbors(EMPTY, { name: "sw-b" }, [nb("sw-a", "Gi0/1", "Gi1/0/1"), nb("sw-a", "Gi0/2", "Gi1/0/2")]);
  par = T.mergeNeighbors(par, A, [nb("sw-b", "Gi1/0/1", "Gi0/1"), nb("sw-b", "Gi1/0/2", "Gi0/2")]);
  assert.deepEqual(par.links.map((l) => `${l.aPort}-${l.bPort}`), ["Gi0/1-Gi1/0/1", "Gi0/2-Gi1/0/2"]);
}

// ---------- Previos: LLDP de NX-OS, Junos up/down y "Volver" en VRP ----------
{
  // NX-OS: sin guiones entre vecinos, "Local Port id:" y la gestión en una línea. Antes daba 0 vecinos.
  const nx = `n9k-01# show lldp neighbors detail
Capability codes:
  (R) Router, (B) Bridge, (T) Telephone, (C) DOCSIS Cable Device
Device ID            Local Intf      Hold-time  Capability  Port ID

Chassis id: 0000.5e00.5311
Port id: Ethernet1/49
Local Port id: Eth1/1
Port Description: to-n9k
System Name: spine1.example.net
System Description: Cisco Nexus Operating System (NX-OS) Software 9.3(8)
Time remaining: 110 seconds
System Capabilities: B, R
Enabled Capabilities: B, R
Management Address: 192.0.2.21
Vlan ID: 1

Chassis id: 0000.5e00.5312
Port id: Ethernet1/50
Local Port id: Eth1/2
System Name: not advertised
Management Address: 192.0.2.22
Total entries displayed: 2
n9k-01#`;
  const n = T.parseCiscoLldp(nx);
  assert.equal(n.length, 2);
  assert.deepEqual(
    { ...n[0] },
    { name: "spine1.example.net", localPort: "Eth1/1", remotePort: "Ethernet1/49", ip: "192.0.2.21", platform: "Cisco Nexus Operating System (NX-OS) Software 9.3(8)", proto: "LLDP", remoteNative: "1", caps: "B, R" },
  );
  assert.deepEqual([n[1].name, n[1].localPort, n[1].remotePort, n[1].ip], ["0000.5e00.5312", "Eth1/2", "Ethernet1/50", "192.0.2.22"], "sin nombre anunciado: el Chassis id");
  // IOS sigue igual: bloques con guiones, "Local Intf:" y la gestión en "Management Addresses:".
  const ios = `sw-a#show lldp neighbors detail
------------------------------------------------
Local Intf: Gi1/0/1
Chassis id: 0000.5e00.5321
Port id: Gi0/1
Port Description: uplink
System Name: dist-sw02.example.net

System Description:
Cisco IOS Software, C2960X Software

Time remaining: 100 seconds
Enabled Capabilities: B
Management Addresses:
    IP: 192.0.2.32
Vlan ID: 10

Total entries displayed: 1
sw-a#`;
  assert.deepEqual({ ...T.parseCiscoLldp(ios)[0] }, { name: "dist-sw02.example.net", localPort: "Gi1/0/1", remotePort: "Gi0/1", ip: "192.0.2.32", platform: "Cisco IOS Software, C2960X Software", proto: "LLDP", remoteNative: "10", caps: "B" });

  // Junos "show interfaces descriptions": Admin up y Link down es un puerto caído.
  const p = T.parsePortInfo([`noc@mx1> show interfaces descriptions
Interface       Admin Link Description
ge-0/0/0        up    down UPLINK core-sw01
ge-0/0/1        up    up   to dist-sw02
ge-0/0/2        down  down reservado
noc@mx1>`]);
  assert.deepEqual([p["ge-0/0/0"].status, I.portDown(p["ge-0/0/0"].status)], ["up/down", "down"]);
  assert.equal(I.portDown(p["ge-0/0/1"].status), undefined);
  assert.equal(I.portDown(p["ge-0/0/2"].status), "down");
  // Y no cuenta como "puerto activo sin vecino".
  const mx = { nodes: [{ id: "mx1", name: "mx1", explored: true, x: 1, y: 1, ports: p }], links: [] };
  assert.deepEqual(I.unknownL2(mx).get("mx1").ports, ["Ge-0/0/1"]);

  // "Volver": quit en Huawei VRP y H3C, exit en el resto.
  assert.equal(T.backCommand(T.vendorFromPrompt("<hw-core>")), "quit");
  assert.equal(T.backCommand(T.vendorFromPrompt("[~hw-core]")), "quit");
  assert.equal(T.backCommand(T.vendorFromPrompt("sw-a#")), "exit");
  assert.equal(T.backCommand(T.vendorFromPrompt("noc@mx1>")), "exit");
  assert.equal(T.backCommand(T.vendorFromPrompt("fw01 #")), "exit");
  assert.equal(T.backCommand(null), "exit");
  assert.equal(T.backCommand(H.vendorOfPlatform("vrp8")), "quit");
}

// ---------- Datos guardados: los campos nuevos se leen sin confiar en su forma ----------
{
  const { mergeSettings } = await import("../../src/lib/settings.ts");
  const node = (id, extra = {}) => ({ id, name: id, explored: true, x: 1, y: 1, ...extra });
  const link = (extra = {}) => ({ a: "sw-a", aPort: "Gi1/0/1", b: "sw-b", bPort: "Gi0/1", proto: "CDP", ...extra });
  const saved = {
    nodes: [node("sw-a", { aliases: ["sw-a-re0", 7, null] }), node("sw-b", { aliases: "sw-b-re0" }), node("sw-c")],
    links: [link({ seenBy: [], staleSince: 1_800_000_000_000 }), link({ aPort: "Gi1/0/2", seenBy: "sw-a", staleSince: "ayer" }), link({ aPort: "Gi1/0/3", seenBy: ["sw-a", 5] })],
  };
  const t = mergeSettings({ topology: saved }).topology;
  assert.deepEqual(t.nodes.map((n) => n.aliases), [["sw-a-re0"], undefined, undefined]);
  assert.ok(!("aliases" in t.nodes[1]) && !("aliases" in t.nodes[2]));
  assert.deepEqual(t.links.map((l) => [l.seenBy, l.staleSince]), [[[], 1_800_000_000_000], [undefined, undefined], [["sw-a"], undefined]]);
  // Con eso las revisiones, la fusión y las exportaciones no fallan.
  I.linkChecks(t);
  T.toCsv(t);
  assert.equal(T.mergeNeighbors(t, { name: "sw-a-re0" }, []).nodes.length, 3, "el alias guardado se reconoce");
}

console.log("topoAudit: ok");
