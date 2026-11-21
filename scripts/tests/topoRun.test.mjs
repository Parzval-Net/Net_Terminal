// Pruebas del lector de comandos del descubrimiento de Topología (hallazgo 3 de la auditoría: una
// salida cortada no se procesa como completa): `node scripts/tests/topoRun.test.mjs`.
// Salidas de ejemplo con direcciones de documentación (RFC 5737) y nombres ficticios.
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

const U = await import("../../src/lib/topoRun.ts");
const T = await import("../../src/lib/topology.ts");
const { computeRisk } = await import("../../src/lib/packs.ts");

/** Sesión simulada: responde cada comando con lo que diga `replies` (texto, o { output, cut }). */
function device(replies, fallback = "% Invalid input detected at '^' marker.\nsw-a#") {
  const sent = [];
  const exec = async (cmd) => {
    sent.push(cmd);
    const r = typeof replies === "function" ? replies(cmd) : replies[cmd];
    if (r === undefined) return { output: fallback };
    return typeof r === "string" ? { output: r } : r;
  };
  return { sent, exec };
}

const CDP = `sw-a#show cdp neighbors detail
-------------------------
Device ID: sw-b
Entry address(es):
  IP address: 192.0.2.2
Platform: cisco WS-C2960X,  Capabilities: Switch
Interface: GigabitEthernet1/0/1,  Port ID (outgoing port): GigabitEthernet0/1
-------------------------
Device ID: sw-c
Entry address(es):
  IP address: 192.0.2.3
Platform: cisco WS-C2960X,  Capabilities: Switch
Interface: GigabitEthernet1/0/2,  Port ID (outgoing port): GigabitEthernet0/1
sw-a#`;

// ---------- Salida completa: se devuelve sin restos del paginador ----------
{
  const d = device({ "show cdp neighbors detail": CDP.replace("-------------------------\nDevice ID: sw-c", " --More-- \b\b\b\b\b\b\b\b\b        \b\b\b\b\b\b\b\b\b-------------------------\nDevice ID: sw-c") });
  const shown = [];
  const r = U.commandReader(d.exec, "cisco", (c) => shown.push(c));
  const out = await r.run("show cdp neighbors detail");
  assert.deepEqual(T.parseNeighbors("cisco", [out]).map((n) => n.name), ["sw-b", "sw-c"]);
  assert.deepEqual([r.cut, r.skipped, r.wasCut("show cdp neighbors detail")], [undefined, [], false]);
  assert.deepEqual(shown, ["show cdp neighbors detail"]);
  assert.equal(U.partialNote(r), "");
}

// ---------- 3. Resultado fallido: plazo vencido con la salida a medias ----------
{
  // El backend devolvió lo leído hasta el plazo (falta sw-c) con el motivo del corte.
  const half = CDP.slice(0, CDP.indexOf("-------------------------\nDevice ID: sw-c")) + " --More-- ";
  const d = device({
    "show cdp neighbors detail": { output: half, cut: "Tiempo agotado esperando al equipo" },
    "show lldp neighbors detail": "sw-a#show lldp neighbors detail\nTotal entries displayed: 0\nsw-a#",
  });
  const r = U.commandReader(d.exec, "cisco");
  const out = await r.run("show cdp neighbors detail");
  assert.deepEqual(T.parseNeighbors("cisco", [out]).map((n) => n.name), ["sw-b"], "lo leído se entrega");
  assert.deepEqual(r.cut, { cmd: "show cdp neighbors detail", why: "Tiempo agotado esperando al equipo" });
  assert.ok(r.wasCut("show cdp neighbors detail"));
  // No se envía nada más: el equipo puede seguir entregando esa salida.
  assert.equal(await r.run("show lldp neighbors detail"), "");
  assert.equal(await r.run("show interfaces status"), "");
  assert.deepEqual(d.sent, ["show cdp neighbors detail"]);
  assert.deepEqual(r.skipped, ["show lldp neighbors detail", "show interfaces status"]);
  assert.ok(r.wasCut("show lldp neighbors detail"), "lo no enviado tampoco se leyó");
  // El aviso va primero en el mensaje y dice qué pasó con lo leído.
  const note = U.partialNote(r);
  assert.match(note, /^Resultado parcial: la salida de "show cdp neighbors detail" se cortó \(Tiempo agotado esperando al equipo\) y no se enviaron 2 comandos más\./);
  assert.match(note, /sin dar por retirado ningún enlace/);
  assert.ok(!note.includes("—"));
  // Con eso ningún protocolo cuenta como leído completo: al fusionar no se retira el enlace a sw-c.
  const complete = T.completeProtos("cisco", [
    { cmd: "show cdp neighbors detail", out, cut: r.wasCut("show cdp neighbors detail") },
    { cmd: "show lldp neighbors detail", out: "", cut: r.wasCut("show lldp neighbors detail") },
  ]);
  assert.deepEqual(complete, []);
  const before = T.mergeNeighbors({ nodes: [], links: [] }, { name: "sw-a" }, T.parseNeighbors("cisco", [CDP]));
  const after = T.mergeNeighbors(before, { name: "sw-a" }, T.parseNeighbors("cisco", [out]), { complete });
  assert.equal(after.links.filter(T.isStale).length, 0, "una lectura cortada no retira enlaces");
  // La misma lectura, completa, sí lo retiraría.
  assert.equal(T.mergeNeighbors(before, { name: "sw-a" }, T.parseNeighbors("cisco", [out])).links.filter(T.isStale).length, 1);
}
{
  // Un corte en un comando posterior (tope de páginas): los vecinos ya leídos cuentan como completos.
  const d = device({
    "show cdp neighbors detail": CDP,
    "show lldp neighbors detail": "% LLDP is not enabled\nsw-a#",
    "show interfaces status": { output: "Port      Name   Status       Vlan\nGi1/0/1          connected    1\n --More-- ", cut: "Demasiadas páginas del paginador; se detuvo la lectura" },
  });
  const r = U.commandReader(d.exec, "cisco");
  const outs = [];
  for (const cmd of T.NEIGHBOR_COMMANDS.cisco) outs.push({ cmd, out: await r.run(cmd), cut: r.wasCut(cmd) });
  await r.run("show interfaces status");
  await r.run("show etherchannel summary");
  assert.deepEqual(T.completeProtos("cisco", outs), ["CDP", "LLDP"]);
  assert.match(U.partialNote(r), /se cortó \(Demasiadas páginas del paginador; se detuvo la lectura\) y no se envió 1 comando más\./);
  assert.deepEqual(d.sent, ["show cdp neighbors detail", "show lldp neighbors detail", "show interfaces status"], "tras el corte no se prueban alternativas");
}

// ---------- Alternativas cuando el equipo no reconoce el comando ----------
{
  // IOS de router: sin "status", sirve la descripción (una sola alternativa enviada).
  const desc = "Interface   Status   Protocol Description\nGi0/0       up       up       WAN\nrtr-01#";
  const d = device({ "show interfaces description": desc });
  const r = U.commandReader(d.exec, "cisco");
  assert.equal(await r.run("show interfaces status"), desc);
  assert.deepEqual(d.sent, ["show interfaces status", "show interfaces description"]);
  // Sin ninguna alternativa válida se devuelve el rechazo (quien llama lo reconoce con isCliError).
  const none = device({});
  assert.ok(T.isCliError(await U.commandReader(none.exec, "cisco").run("show interfaces trunk")));
  assert.deepEqual(none.sent, ["show interfaces trunk", "show interface trunk"]);
}
{
  // NX-OS: "show interfaces …" no existe. Tras la primera variante que responde, las siguientes parten por ella.
  const nx = { "show interface status": "Port Name Status Vlan\nEth1/1 -- connected trunk full 10G\nn9k-01#", "show interface counters errors": "Port Align-Err FCS-Err\nEth1/1 0 0\nn9k-01#", "show interface trunk": "Port Native Status Port\nEth1/1 1 trunking --\nn9k-01#", "show port-channel summary": "1 Po1(SU) Eth LACP Eth1/1(P)\nn9k-01#" };
  const d = device(nx, "% Invalid command at '^' marker.\nn9k-01#");
  const r = U.commandReader(d.exec, "cisco");
  for (const cmd of T.PORT_COMMANDS.cisco) assert.ok(!T.isCliError(await r.run(cmd)), cmd);
  assert.deepEqual(d.sent, [
    "show interfaces status",
    "show interfaces description",
    "show interface status",
    "show etherchannel summary",
    "show port-channel summary",
    "show interface counters errors",
    "show interface trunk",
  ]);
  for (const c of d.sent) assert.equal(computeRisk(c), "read", c);
}

// ---------- Sin paginador por comando (Junos y Huawei) ----------
{
  const lldp = "noc@mx1> show lldp neighbors | no-more\nLocal Interface    Parent Interface    Chassis Id          Port info          System Name\nge-0/0/0           -                   00:00:5e:00:53:01   ge-0/0/1           core-sw01\n\nnoc@mx1>";
  const d = device((cmd) => (cmd.endsWith("| no-more") ? lldp : undefined), "error: syntax error\nnoc@mx1>");
  const r = U.commandReader(d.exec, "juniper");
  assert.equal(T.parseNeighbors("juniper", [await r.run("show lldp neighbors")]).length, 1);
  await r.run("show ospf neighbor");
  assert.deepEqual(d.sent, ["show lldp neighbors | no-more", "show ospf neighbor | no-more"]);
}
{
  // VRP que no reconoce el filtro: se reenvía el comando solo y no se vuelve a usar en este descubrimiento.
  const d = device((cmd) => (cmd.includes("|") ? "Error: Unrecognized command found at '^' position.\n<hw-core>" : `<hw-core>${cmd}\nsalida\n<hw-core>`));
  const r = U.commandReader(d.exec, "huawei");
  assert.match(await r.run("display lldp neighbor"), /salida/);
  assert.match(await r.run("display interface brief"), /salida/);
  assert.deepEqual(d.sent, ["display lldp neighbor | no-more", "display lldp neighbor", "display interface brief"]);
  for (const c of d.sent) assert.equal(computeRisk(c), "read", c);
}
{
  // Si el filtro ya funcionó, un rechazo posterior es del comando: no se repite sin filtro.
  const d = device((cmd) => (cmd.startsWith("display lldp") ? "<hw-core>ok\n<hw-core>" : "Error: Unrecognized command found at '^' position.\n<hw-core>"));
  const r = U.commandReader(d.exec, "huawei");
  await r.run("display lldp neighbor");
  assert.ok(T.isCliError(await r.run("display eth-trunk")));
  assert.deepEqual(d.sent, ["display lldp neighbor | no-more", "display eth-trunk | no-more"]);
}
{
  // Fabricante mal elegido (Junos sobre un Cisco): el comando solo responde y deja ver el prompt real.
  const d = device((cmd) => (cmd === "show lldp neighbors" ? "Device ID  Local Intf  Hold-time  Capability  Port ID\nsw-b  Gi1/0/1  120  B  Gi0/1\nsw-a#" : undefined));
  const out = await U.commandReader(d.exec, "juniper").run("show lldp neighbors");
  assert.equal(T.vendorFromPrompt(out), "cisco");
  assert.deepEqual(d.sent, ["show lldp neighbors | no-more", "show lldp neighbors"]);
}

console.log("topoRun: ok");
