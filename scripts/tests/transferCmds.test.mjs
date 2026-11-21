// Pruebas del asistente de Transferencias (src/lib/transferCmds.ts): comandos por fabricante,
// protocolos admitidos y requisitos. Uso: node scripts/tests/transferCmds.test.mjs (Node 22.15+).
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// transferCmds.ts importa "./devicefs" sin extensión (como lo resuelve Vite): se completa con .ts.
registerHooks({
  resolve(specifier, context, next) {
    if (/^\.\.?\//.test(specifier) && !/\.[cm]?[jt]s$/.test(specifier) && context.parentURL?.endsWith(".ts")) return next(`${specifier}.ts`, context);
    return next(specifier, context);
  },
});
const T = await import("../../src/lib/transferCmds.ts");

const v = { ip: "10.0.0.5", port: 8080, file: "FGT_60F-v7.4.8.out" };

// ---- FortiGate ----
const fw = T.recipe("fortigate", "firmware", "tftp", v);
assert.equal(fw.command, "execute restore image tftp FGT_60F-v7.4.8.out 10.0.0.5");
assert.equal(fw.disruptive, true, "restore image reinicia el equipo: se confirma antes");
assert.equal(fw.needsWrite, false);
assert.match(fw.source, /docs\.fortinet\.com/);
const fb = T.recipe("fortigate", "backup", "tftp", { ...v, file: "fw01.conf" });
assert.equal(fb.command, "execute backup config tftp fw01.conf 10.0.0.5");
assert.equal(fb.needsWrite, true, "el respaldo escribe en este PC");
assert.equal(T.recipe("fortigate", "firmware", "http", v), null, "FortiOS no carga imagen por HTTP en este asistente");
assert.deepEqual(T.protocolsFor("fortigate", "copy"), [], "FortiOS no copia archivos sueltos");

// ---- Cisco / NX-OS / Huawei / Junos (perfiles del gestor de archivos) ----
assert.equal(T.recipe("cisco", "firmware", "tftp", { ...v, file: "c9300.bin" }).command, "copy tftp://10.0.0.5/c9300.bin flash:c9300.bin");
assert.equal(T.recipe("cisco", "firmware", "http", { ...v, file: "c9300.bin" }).command, "copy http://10.0.0.5:8080/c9300.bin flash:c9300.bin");
assert.equal(T.recipe("cisco", "backup", "tftp", { ...v, file: "sw1.cfg" }).command, "copy running-config tftp://10.0.0.5/sw1.cfg");
assert.equal(T.recipe("cisco", "backup", "tftp", { ...v, file: "sw1.cfg" }).needsWrite, true);
assert.match(T.recipe("nxos", "copy", "tftp", { ...v, file: "n9k.bin" }).command, /vrf management$/);
assert.equal(T.recipe("huawei", "copy", "tftp", { ...v, file: "s5735.cc" }).command, "tftp 10.0.0.5 get s5735.cc");
assert.equal(T.recipe("huawei", "backup", "tftp", v), null, "VRP: el respaldo va por 'Traer archivo' (vrpcfg.zip)");
assert.equal(T.recipe("huawei", "pull", "tftp", { ...v, file: "vrpcfg.zip" }).command, "tftp 10.0.0.5 put vrpcfg.zip");
assert.equal(T.recipe("juniper", "pull", "tftp", v), null, "Junos no sube por TFTP");
assert.deepEqual(T.protocolsFor("juniper", "firmware"), ["http", "tftp"]);
// Cada protocolo ofrecido tiene comando.
for (const { id } of T.VENDORS) for (const { id: a } of T.ACTIONS) for (const p of T.protocolsFor(id, a)) assert.ok(T.recipe(id, a, p, v), `${id}/${a}/${p}`);

// ---- Sugerencias ----
assert.equal(T.guessVendor({ platform: "fos7" }), "fortigate");
assert.equal(T.guessVendor({ highlight: "fortinet" }), "fortigate");
assert.equal(T.guessVendor({ platform: "nxos" }), "nxos");
assert.equal(T.guessVendor({}), "cisco");
assert.equal(T.backupName("fw 01/core", new Date(2026, 10, 21, 9, 5)), "fw_01_core_20261121-0905.cfg");
assert.equal(T.backupName("///", new Date(2026, 0, 1, 0, 0)), "equipo_20260101-0000.cfg");
assert.equal(T.rate(1_000_000, 0, 2000), 500_000);
assert.equal(T.rate(0, 0, 2000), null);
assert.equal(T.rate(10, 0, 100), null, "sin medio segundo de muestra no hay velocidad");

console.log("transferCmds: ok");

// ---- Recuperación desde el arranque ----
const rv = { pcIp: "192.168.1.100", deviceIp: "192.168.1.99", mask: "255.255.255.0", gateway: "192.168.1.1", file: "FGT_60F-v7.4.8.out" };
const fg = T.recoveryGuide("fortigate", rv);
const fgVals = fg.steps.flatMap((s) => s.values ?? []);
assert.deepEqual(fgVals.map((x) => x.value).slice(0, 6), ["R", "C", "192.168.1.100", "192.168.1.99", "255.255.255.0", "FGT_60F-v7.4.8.out"], "revisar, configurar y valores del menú C");
assert.ok(fgVals.filter((x) => /^[A-Z]$/.test(x.value)).every((x) => x.key), "las teclas de menú se envían sin Enter");
assert.ok(fgVals.some((x) => x.value === "execute restore secondary-image tftp FGT_60F-v7.4.8.out 192.168.1.100"), "imagen en la partición de respaldo");
assert.ok(fg.sources.every((u) => /fortinet\.com/.test(u)));
const cr = T.recoveryGuide("cisco", { ...rv, file: "c2800nm.bin" });
const crVals = cr.steps.flatMap((s) => s.values ?? []).map((x) => x.value);
assert.deepEqual(crVals, ["IP_ADDRESS=192.168.1.99", "IP_SUBNET_MASK=255.255.255.0", "DEFAULT_GATEWAY=192.168.1.1", "TFTP_SERVER=192.168.1.100", "TFTP_FILE=c2800nm.bin", "tftpdnld", "reset"]);
assert.equal(T.recoveryGuide("juniper", rv), null);
for (const v of T.RECOVERY_VENDORS) assert.ok(T.recoveryGuide(v, rv), v);
assert.equal(T.sameSubnet("192.168.1.100", "192.168.1.99", "255.255.255.0"), true);
assert.equal(T.sameSubnet("192.168.1.100", "192.168.2.99", "255.255.255.0"), false);
assert.equal(T.sameSubnet("10.0.0.1", "x", "255.0.0.0"), false);
assert.equal(T.suggestDeviceIp("192.168.1.100"), "192.168.1.101");
assert.equal(T.suggestDeviceIp("10.1.1.254"), "10.1.1.253");
assert.equal(T.isLinkLocal("169.254.10.2"), true);
assert.equal(T.detectOs("Mozilla/5.0 (Windows NT 10.0)"), "windows");
assert.equal(T.detectOs("Mozilla/5.0 (Macintosh; Intel Mac OS X)"), "mac");
assert.equal(T.detectOs("Mozilla/5.0 (X11; Linux x86_64)"), "linux");
assert.match(T.osTips("linux")[0].command, /ip_unprivileged_port_start=69/);
assert.match(T.osTips("windows")[0].command, /NetworkCategory Private/);
console.log("transferCmds recuperación: ok");
assert.equal(T.ipAllowed("192.168.1.99", []), true);
assert.equal(T.ipAllowed("192.168.1.99", ["192.168.1.0/24"]), true);
assert.equal(T.ipAllowed("192.168.1.99", ["10.0.0.0/8", "192.168.1.99"]), true);
assert.equal(T.ipAllowed("192.168.2.1", ["192.168.1.0/24"]), false);
assert.equal(T.ipAllowed("10.1.2.3", ["0.0.0.0/0"]), true);
