// Detección de familias Cisco (NX-OS, IOS XR, ASA) y banners mal cerrados en src/lib/auditParse.ts.
// `node scripts/tests/auditDetect.test.mjs` (Node 22.15+ con tipos TS). Configs ficticias, IPs RFC 5737.
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

const P = await import("../../src/lib/auditParse.ts");

// NX-OS: "version 9.3(5) Bios:..." no es IOS.
{
  const nx = "!Command: show running-config\nversion 9.3(5) Bios:version 07.69\nhostname N9K\nfeature ssh\nfeature tacacs+\ninterface Ethernet1/1\n  no shutdown\n";
  const g = P.detectVendor(nx);
  assert.equal(g.vendor, "cisco");
  assert.equal(g.platform, "nx-os");
  assert.equal(g.version, "9.3(5)");
  assert.match(g.reason, /no aplican/);
  const g2 = P.detectVendor("hostname N9K\nfeature bgp\ninterface Ethernet1/1\n!\n");
  assert.equal(g2.platform, "nx-os");
}
// IOS XR y ASA.
{
  const xr = P.detectVendor("!! IOS XR Configuration 7.3.2\nhostname XR1\ninterface Loopback0\n!\n");
  assert.equal(xr.platform, "ios-xr");
  assert.equal(xr.version, "7.3.2");
  const asa = P.detectVendor(": Saved\nASA Version 9.16(2)\nhostname FW1\ninterface GigabitEthernet0/0\n nameif outside\n!\n");
  assert.equal(asa.platform, "asa");
  assert.equal(asa.version, "9.16(2)");
}
// IOS e IOS-XE siguen igual.
{
  assert.equal(P.detectVendor("version 15.2\nhostname R1\ninterface Gi0/1\n!\n").platform, "ios");
  assert.equal(P.detectVendor("version 17.9\nhostname R1\ninterface Gi1\n!\n").platform, "ios-xe");
}
// Banner sin delimitador de cierre: no se traga el resto de la config.
{
  const lines = ["hostname R1", "banner motd ^C Acceso restringido", ...Array.from({ length: 250 }, (_, i) => `! relleno ${i}`), "line vty 0 4", " transport input ssh"];
  const t = P.parseConfig(lines.join("\n"), "cisco");
  const banner = t.find((n) => n.line === "banner motd");
  assert.ok(banner, "banner presente");
  assert.equal(banner.text, "Acceso restringido");
  assert.ok(t.some((n) => n.line === "line vty 0 4"), "lo que sigue al banner mal cerrado se interpreta");
  // Bien cerrado: el cuerpo llega hasta el delimitador.
  const ok = P.parseConfig("banner login ^C\nHola\nline vty 0 4\n^C\nhostname R1\n", "cisco");
  const b = ok.find((n) => n.line === "banner login");
  assert.ok(b.text.includes("line vty 0 4"));
  assert.ok(ok.some((n) => n.line === "hostname R1"));
  assert.ok(!ok.some((n) => n.line === "line vty 0 4"));
}
console.log("auditDetect: ok");
