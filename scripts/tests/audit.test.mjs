// Auditoría de configuración (src/lib/auditParse.ts, auditRules.ts, audit.ts y auditBuiltin.ts): parser,
// motor de reglas, puntaje, plan con orden seguro y rollback, capas con overrides y excepciones, validación
// de packs y exportaciones. Configs ficticias con IPs de documentación (RFC 5737), nombres y hashes inventados.
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { fastEnough } from "./timing.mjs";

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
const R = await import("../../src/lib/auditRules.ts");
const A = await import("../../src/lib/audit.ts");
const B = await import("../../src/lib/auditBuiltin.ts");
const { redosRisk } = await import("../../src/lib/regexSafety.ts");
const { sha256Hex } = await import("../../src/lib/sha256.ts");
const { createHash } = await import("node:crypto");

const NOW = new Date("2026-11-21T12:00:00Z");
const builtin = B.BUILTIN_RULE_PACKS.map((pack) => ({ pack, layer: "builtin" }));
const resolved = R.resolveRules(builtin);
const audit = (text, extra = {}, res = resolved, opts = {}) => A.runAudit({ text, ...extra }, res, { now: NOW, ...opts });
const statuses = (r) => Object.fromEntries(r.findings.map((f) => [f.ruleId, f.status]));
const byId = (r, id) => r.findings.find((f) => f.ruleId === id);

// ---------- Fixtures ----------

const CISCO_BAD = `!
version 15.2
hostname R-LAB
!
enable secret 5 $1$fake$SuperHashSecreto
username ops privilege 15 password 7 0822455D0A16
!
ip http server
service tcp-small-servers
snmp-server community public RO
snmp-server community Comunidad-Secreta-77 RW
ntp server 192.0.2.123
!
interface GigabitEthernet0/0
 description Internet ISP-A
 ip address 203.0.113.2 255.255.255.252
!
interface GigabitEthernet0/1
 ip address 192.0.2.1 255.255.255.0
!
line con 0
 exec-timeout 0 0
line vty 0 4
 exec-timeout 30 0
 transport input telnet ssh
line vty 5 15
 transport input telnet
!
end
`;

const CISCO_OK = `!
version 17.9
service timestamps debug datetime msec
service timestamps log datetime msec localtime show-timezone
service password-encryption
hostname R-OK
!
aaa new-model
aaa authentication login default group TACACS-NT local
!
enable secret 9 $9$fakehashA
username ops privilege 15 secret 9 $9$fakehashB
!
no ip source-route
ip domain name lab.example
ip ssh version 2
no ip http server
ip http secure-server
login block-for 120 attempts 5 within 60
!
archive
 path scp://respaldo@192.0.2.20/cfg/$h
 write-memory
!
interface GigabitEthernet0/0
 description Enlace Internet ISP-A
 ip address 203.0.113.2 255.255.255.252
 no ip proxy-arp
 no cdp enable
!
interface GigabitEthernet0/1
 description LAN usuarios
 ip address 192.0.2.1 255.255.255.0
 no ip proxy-arp
!
interface Loopback0
 ip address 198.51.100.1 255.255.255.255
!
ip access-list standard MGMT
 permit 192.0.2.0 0.0.0.255
!
logging host 192.0.2.50
snmp-server community Xq7-monitor RO SNMP-MGR
snmp-server group NT-V3 v3 priv
ntp authentication-key 1 md5 104D000A0618 7
ntp authenticate
ntp trusted-key 1
ntp server 192.0.2.123 key 1
!
banner login ^C
Acceso restringido a personal autorizado.
line vty 0 4
^C
!
line con 0
 exec-timeout 5 0
 logging synchronous
line vty 0 4
 access-class MGMT in
 exec-timeout 10 0
 transport input ssh
line vty 5 15
 access-class MGMT in
 transport input none
!
end
`;

const FORTI_BAD = `#config-version=FGT60F-7.2.5-FW-build1517:opmode=0:vdom=0
config system global
    set admintimeout 480
    set hostname "FW-LAB"
end
config system admin
    edit "admin"
        set accprofile "super_admin"
        set password ENC SH2ClaveAdminSecreta
    next
end
config system interface
    edit "wan1"
        set ip 203.0.113.2 255.255.255.252
        set allowaccess ping https ssh http telnet fgfm
        set role wan
    next
    edit "internal"
        set ip 192.0.2.1 255.255.255.0
        set allowaccess ping https ssh telnet
    next
end
config system snmp community
    edit 1
        set name "public"
    next
end
config firewall policy
    edit 1
        set srcintf "internal"
        set dstintf "wan1"
        set srcaddr "all"
        set dstaddr "all"
        set action accept
        set schedule "always"
        set service "ALL"
        set logtraffic disable
    next
end
`;

const FORTI_OK = `#config-version=FGT60F-7.2.8-FW-build1639:opmode=0:vdom=0
config system global
    set admin-sport 8443
    set admintimeout 10
    set hostname "FW-OK"
    set pre-login-banner enable
end
config system password-policy
    set status enable
    set minimum-length 14
    set min-lower-case-letter 1
    set min-upper-case-letter 1
    set min-number 1
    set min-non-alphanumeric 1
end
config system admin
    edit "ops-fw"
        set accprofile "super_admin"
        set trusthost1 192.0.2.0 255.255.255.0
        set two-factor fortitoken
        set fortitoken "FTKMOB0000000000"
        set password ENC SH2fakehash
    next
end
config system interface
    edit "wan1"
        set ip 203.0.113.2 255.255.255.252
        set allowaccess ping fgfm
        set role wan
        set description "Internet ISP-A"
    next
    edit "internal"
        set ip 192.0.2.1 255.255.255.0
        set allowaccess ping https ssh
        set alias "LAN"
    next
    edit "port9"
        set status down
    next
end
config system ntp
    set type custom
    config ntpserver
        edit 1
            set server "192.0.2.123"
        next
    end
end
config system snmp community
    edit 1
        set name "mon-Xq7"
        config hosts
            edit 1
                set ip 192.0.2.10 255.255.255.255
            next
        end
    next
end
config system central-management
    set type fortimanager
    set fmg "192.0.2.7"
end
config vpn ssl settings
    set source-interface "wan1"
    set source-address "geo-CL"
    set port 10443
    set ssl-min-proto-ver tls1-2
end
config vpn ipsec phase1-interface
    edit "to-branch"
        set interface "wan1"
        set proposal aes256gcm-prfsha384 aes256-sha256
        set dhgrp 20 21
        set remote-gw 198.51.100.20
        set psksecret ENC fakepsk
    next
end
config firewall policy
    edit 1
        set name "LAN-Internet"
        set srcintf "internal"
        set dstintf "wan1"
        set srcaddr "LAN"
        set dstaddr "all"
        set action accept
        set schedule "always"
        set service "HTTPS" "DNS"
        set utm-status enable
        set ssl-ssh-profile "deep-inspection"
        set av-profile "default"
        set webfilter-profile "default"
        set logtraffic all
        set comments "Navegación LAN, ticket CHG-1"
    next
    edit 2
        set name "Deny-Inbound"
        set srcintf "wan1"
        set dstintf "internal"
        set srcaddr "all"
        set dstaddr "all"
        set schedule "always"
        set service "ALL"
        set logtraffic all
        set comments "Bloqueo explícito con registro"
    next
end
`;

// ---------- SHA-256 (huella del input) ----------
for (const t of ["", "abc", "ñandú € ü 🙂".repeat(40), "x".repeat(55), "x".repeat(56), "x".repeat(64), CISCO_BAD]) assert.equal(sha256Hex(t), createHash("sha256").update(t, "utf8").digest("hex"));

// ---------- Parser ----------
{
  const t = P.parseConfig(CISCO_OK, "cisco");
  const vty = t.filter((n) => n.line.startsWith("line vty"));
  assert.equal(vty.length, 2, "dos bloques VTY (el texto del banner no cuenta)");
  assert.deepEqual(
    vty[0].children.map((c) => c.line),
    ["access-class MGMT in", "exec-timeout 10 0", "transport input ssh"],
  );
  const banner = t.find((n) => n.line === "banner login");
  assert.ok(banner && banner.children.length === 0 && banner.text.includes("line vty 0 4"), "cuerpo del banner aparte");
  assert.ok(!t.some((n) => n.line.startsWith("!") || n.line === "end"), "sin separadores ni end");
  assert.equal(t.find((n) => n.line === "ip ssh version 2").lineNo, CISCO_OK.split("\n").indexOf("ip ssh version 2") + 1);
  // Abreviaturas de IOS.
  assert.equal(P.normalizeIos("int gi0/1"), "interface GigabitEthernet0/1");
  assert.equal(P.normalizeIos("trans inp ssh"), "transport input ssh");
  assert.equal(P.normalizeIos("serv password-enc"), "service password-encryption");
  assert.equal(P.normalizeIos("no serv tcp-small"), "no service tcp-small-servers");
  assert.equal(P.normalizeIos("exec-t 5 0"), "exec-timeout 5 0");
  assert.equal(P.normalizeIos("ip ssh version 2"), "ip ssh version 2", "sin cambios si ya está completo");
  // Anidamiento por indentación (router bgp > address-family).
  const bgp = P.parseConfig("router bgp 64500\n neighbor 192.0.2.9 remote-as 64501\n address-family ipv4\n  neighbor 192.0.2.9 activate\n exit-address-family\n!\n", "cisco");
  assert.equal(bgp.length, 1);
  assert.equal(bgp[0].children[1].children[0].line, "neighbor 192.0.2.9 activate");
}
{
  const t = P.parseConfig(FORTI_OK, "fortinet");
  const ntp = t.find((n) => n.line === "config system ntp");
  assert.equal(ntp.children[1].line, "config ntpserver");
  assert.equal(ntp.children[1].children[0].name, "1");
  assert.equal(ntp.children[1].children[0].children[0].line, 'set server "192.0.2.123"');
  const iface = t.find((n) => n.line === "config system interface");
  assert.deepEqual(
    iface.children.map((e) => e.name),
    ["wan1", "internal", "port9"],
  );
  // Valor entre comillas en varias líneas (certificado) queda en un nodo.
  const cert = P.parseConfig('config vpn certificate local\n    edit "lab"\n        set certificate "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----"\n        set range global\n    next\nend\n', "fortinet");
  assert.equal(cert[0].children[0].children.length, 2);
  assert.ok(cert[0].children[0].children[0].line.includes("END CERTIFICATE"));
  // VDOM: los bloques suben a la raíz con su contexto.
  const vd = P.parseConfig(
    "config vdom\nedit root\nnext\nend\nconfig global\nconfig system global\n    set admintimeout 30\nend\nend\nconfig vdom\nedit root\nconfig firewall policy\n    edit 1\n        set action accept\n    next\nend\nnext\nend\n",
    "fortinet",
  );
  assert.deepEqual(
    vd.map((n) => [n.line, n.ctx]),
    [
      ["config system global", "global"],
      ["config firewall policy", "vdom:root"],
    ],
  );
  assert.deepEqual(P.fortiTokens('set service "HTTPS" "DNS" ALL'), ["set", "service", "HTTPS", "DNS", "ALL"]);
}
{
  assert.equal(P.detectVendor(CISCO_BAD).vendor, "cisco");
  assert.equal(P.detectVendor(CISCO_BAD).platform, "ios");
  assert.equal(P.detectVendor(CISCO_OK).platform, "ios-xe");
  const f = P.detectVendor(FORTI_BAD);
  assert.equal(f.vendor, "fortinet");
  assert.equal(f.version, "7.2.5");
  assert.equal(P.detectVendor("sysname CE-LAB\n#\ninterface GE1/0/1\n#\nreturn\n").vendor, "huawei");
  assert.equal(P.detectVendor("hola mundo").vendor, null);
  assert.throws(() => audit("hola mundo"), /fabricante/);
  // Override del usuario.
  const r = audit(FORTI_BAD.replace(/^#config-version.*\n/, ""), { vendor: "fortinet" });
  assert.equal(r.vendor, "fortinet");
  const o = audit("hostname R1\n", { vendor: "fortinet" });
  assert.equal(o.vendorOverridden, true);
}
// Enmascarado (misma regla que mask_line de backups.rs).
{
  const cases = [
    ["enable secret 5 $1$abc$def", "enable secret 5 ****"],
    ["username ops privilege 15 password 7 0822455D0A16", "username ops privilege 15 password 7 ****"],
    ["snmp-server community Comunidad-Secreta RO 10", "snmp-server community **** RO 10"],
    ["tacacs-server key 7 ABCDEF", "tacacs-server key 7 ****"],
    [" key 7 0505", " key 7 ****"],
    ["set password ENC SH2abcdef", "set password ENC ****"],
    ["set psksecret ENC xyz", "set psksecret ENC ****"],
    ['set auth-pwd "Clave Con Espacios"', "set auth-pwd ****"],
    ["path scp://respaldo:ClaveUrl@192.0.2.20/cfg", "path scp://respaldo:****@192.0.2.20/cfg"],
    ["set auth-pwd {{snmpv3_auth_pass}}", "set auth-pwd {{snmpv3_auth_pass}}"],
    ["snmp-server community **** RO", "snmp-server community **** RO"],
    ["interface GigabitEthernet0/1", "interface GigabitEthernet0/1"],
  ];
  for (const [inp, out] of cases) assert.equal(P.maskLine(inp), out, inp);
}

// ---------- Packs integrados ----------
{
  assert.equal(B.BUILTIN_CISCO.rules.length, 20, "Cisco: 20 reglas");
  assert.equal(B.BUILTIN_FORTIOS.rules.length, 29, "FortiOS: 27 controles en 29 reglas");
  for (const { pack } of builtin) {
    const v = R.validateRulePack(JSON.stringify(pack));
    assert.deepEqual(v.errors, [], `${pack.id} válido`);
    assert.deepEqual(v.warnings, [], `${pack.id} sin avisos (todas las reglas traen tests)`);
    for (const rule of pack.rules) {
      assert.ok(rule.tests.length >= 2, `${rule.id}: al menos 2 tests`);
      assert.ok(rule.tests.some((t) => t.expect === "fail" || t.expect === "review"), `${rule.id}: un caso que no cumple`);
      assert.ok(rule.tests.some((t) => t.expect === "pass"), `${rule.id}: un caso que cumple`);
      assert.ok(rule.controls.some((c) => R.isIsoFramework(c.framework) && R.isIsoControl(c.control)), `${rule.id}: mapeo ISO`);
      assert.deepEqual(A.testRule(rule), [], `${rule.id}: tests embebidos`);
    }
  }
  // Todas las regex integradas pasan el validador anti-ReDoS.
  const regexes = [];
  const walkCond = (c) => {
    if (!c) return;
    if (c.match) regexes.push(c.match);
    if (c.select) regexes.push(c.select);
    if (c.key) regexes.push(c.key);
    if (c.op === "noneMatch" || c.op === "allMatch") regexes.push(...c.value);
    (c.conditions ?? []).forEach(walkCond);
  };
  for (const { pack } of builtin)
    for (const r of pack.rules) {
      walkCond(r.check);
      walkCond(r.applicable);
      walkCond(r.scope?.where);
      if (r.scope) regexes.push(r.scope.block, ...(r.scope.child ? [r.scope.child] : []));
      if (r.reviewIf) regexes.push(r.reviewIf.match);
      if (r.compute) regexes.push(r.compute.from);
      regexes.push(...Object.values(r.capture ?? {}));
      for (const p of Object.values(r.params ?? {})) if (p.pattern) regexes.push(p.pattern);
    }
  for (const re of regexes) assert.equal(redosRisk(re, true), null, `regex segura: ${re}`);
  // Los parámetros secretos nunca traen valor por defecto y CLI Lab los oculta por el nombre.
  for (const { pack } of builtin) for (const r of pack.rules) for (const [k, p] of Object.entries(r.params ?? {})) if (p.secret) assert.ok(!p.default && /pass|secret|key/.test(k), k);
  // Los 27 controles del usuario están cubiertos.
  const fos = new Set(B.BUILTIN_FORTIOS.rules.map((r) => r.id));
  for (const id of ["ADM-001", "POL-001", "ADM-002", "ADM-003", "PWP-001", "CRY-001", "TLS-001", "TLS-002", "TEL-001", "SSL-001", "SSL-002", "SNMP-001", "POL-002", "IPS-001", "PWP-002", "ADM-004", "HTTP-001", "NTP-001", "LOG-001", "LOG-002", "POL-003", "ADM-005", "ADM-006", "BAN-001", "SSL-003", "IF-001", "BAK-001", "POL-004", "POL-005"])
    assert.ok(fos.has(`NT-FOS-${id}`), id);
  // Un test embebido que no se cumple se informa.
  const wrong = { ...B.BUILTIN_CISCO.rules[0], tests: [{ config: "line vty 0 4\n transport input ssh\n", expect: "fail" }] };
  assert.equal(A.testRule(wrong)[0].got, "pass");
}

// ---------- Resultado esperado por regla ----------
const EXPECT_CISCO_BAD = {
  "NT-IOS-VTY-001": "fail",
  "NT-IOS-VTY-002": "fail",
  "NT-IOS-SSH-001": "fail",
  "NT-IOS-PWE-001": "fail",
  "NT-IOS-ENA-001": "fail",
  "NT-IOS-USR-001": "fail",
  "NT-IOS-AAA-001": "fail",
  "NT-IOS-EXT-001": "fail",
  "NT-IOS-BAN-001": "fail",
  "NT-IOS-NTP-001": "pass",
  "NT-IOS-NTP-002": "fail",
  "NT-IOS-LOG-001": "fail",
  "NT-IOS-SNMP-001": "fail",
  "NT-IOS-SNMP-002": "fail",
  "NT-IOS-HTTP-001": "fail",
  "NT-IOS-SVC-001": "fail",
  "NT-IOS-PARP-001": "fail",
  "NT-IOS-CDP-001": "fail",
  "NT-IOS-LBF-001": "fail",
  "NT-IOS-ARC-001": "fail",
};
const cBad = audit(CISCO_BAD, { device: "R-LAB" });
{
  assert.deepEqual(statuses(cBad), EXPECT_CISCO_BAD);
  assert.equal(cBad.coverage.otherVendor, 29, "las reglas FortiOS no se evalúan sobre Cisco");
  // VTY: 2 de 2 bloques; EXT: consola y vty 0 4 sí, vty 5 15 cumple por defecto.
  assert.deepEqual(
    byId(cBad, "NT-IOS-EXT-001").units.map((u) => [u.label, u.status]),
    [
      ["line con 0", "fail"],
      ["line vty 0 4", "fail"],
      ["line vty 5 15", "pass"],
    ],
  );
  // Evidencia con número de línea real y enmascarada.
  const usr = byId(cBad, "NT-IOS-USR-001").units[0].evidence[0];
  assert.equal(usr.lineNo, 6);
  assert.equal(usr.text, "username ops privilege 15 password 7 ****");
  const snmp2 = byId(cBad, "NT-IOS-SNMP-002");
  assert.ok(snmp2.units.every((u) => !u.label.includes("Comunidad-Secreta")), "cabecera enmascarada");
  // Puntaje: solo NTP-001 (media, 3) cumple, sobre 69 puntos (crítica 10, 7 altas, 6 medias, 6 bajas).
  assert.equal(cBad.score.passWeight, 3);
  assert.equal(cBad.score.evaluatedWeight, 69);
  assert.equal(cBad.score.percent, 4.3);
  assert.equal(cBad.risk.level, "critical");
  assert.match(cBad.coverage.text, /20 reglas evaluadas .* de 93 controles del Anexo A/);
  assert.match(cBad.coverage.disclaimer, /interpretación propia/);
}
{
  const ok = audit(CISCO_OK);
  assert.deepEqual(
    Object.entries(statuses(ok)).filter(([, s]) => s !== "pass"),
    [],
    "config endurecida sin falsos positivos",
  );
  assert.equal(ok.score.percent, 100);
  assert.equal(ok.risk.level, "low");
  // El mismo respaldo enmascarado: solo SNMP-001 queda por revisar (no se ve el nombre de la comunidad).
  const masked = audit(P.maskText(CISCO_OK));
  assert.deepEqual(
    Object.entries(statuses(masked)).filter(([, s]) => s !== "pass"),
    [["NT-IOS-SNMP-001", "review"]],
  );
  assert.equal(masked.score.percent, 100, "revisar queda fuera del puntaje");
}
const EXPECT_FORTI_BAD = {
  "NT-FOS-ADM-001": "fail",
  "NT-FOS-POL-001": "fail",
  "NT-FOS-ADM-002": "fail",
  "NT-FOS-ADM-003": "fail",
  "NT-FOS-PWP-001": "fail",
  "NT-FOS-PWP-002": "n/a",
  "NT-FOS-CRY-001": "pass",
  "NT-FOS-TLS-001": "pass",
  "NT-FOS-TEL-001": "fail",
  "NT-FOS-SSL-001": "n/a",
  "NT-FOS-SSL-002": "n/a",
  "NT-FOS-TLS-002": "n/a",
  "NT-FOS-SNMP-001": "fail",
  "NT-FOS-POL-002": "fail",
  "NT-FOS-IPS-001": "n/a",
  "NT-FOS-ADM-004": "fail",
  "NT-FOS-HTTP-001": "fail",
  "NT-FOS-NTP-001": "review",
  "NT-FOS-LOG-001": "fail",
  "NT-FOS-LOG-002": "n/a",
  "NT-FOS-POL-003": "fail",
  "NT-FOS-ADM-005": "review",
  "NT-FOS-ADM-006": "fail",
  "NT-FOS-BAN-001": "fail",
  "NT-FOS-SSL-003": "n/a",
  "NT-FOS-IF-001": "fail",
  "NT-FOS-BAK-001": "fail",
  "NT-FOS-POL-004": "fail",
  "NT-FOS-POL-005": "pass",
};
const fBad = audit(FORTI_BAD, { device: "FW-LAB" });
{
  assert.deepEqual(statuses(fBad), EXPECT_FORTI_BAD);
  assert.equal(fBad.platform, "fortios");
  assert.equal(fBad.risk.level, "critical");
  assert.deepEqual(fBad.counts, { pass: 3, fail: 17, review: 2, "n/a": 7, waived: 0 });
  // Valor por defecto supuesto, visible en la evidencia.
  assert.equal(byId(fBad, "NT-FOS-CRY-001").units[0].evidence[0].kind, "default");
  // HTTP: solo wan1 tiene http.
  assert.deepEqual(
    byId(fBad, "NT-FOS-HTTP-001").units.map((u) => u.status),
    ["fail", "pass"],
  );
}
{
  const ok = audit(FORTI_OK);
  const notPass = Object.entries(statuses(ok)).filter(([, s]) => s !== "pass");
  assert.deepEqual(notPass, [], "FortiOS endurecido sin falsos positivos");
  assert.equal(ok.score.percent, 100);
}

// ---------- Remediación calculada y plan ----------
{
  const fails = fBad.findings.filter((f) => f.status === "fail").map((f) => f.ruleId);
  const plan = A.buildPlan(fBad, resolved, fails, { params: { snmpv3_user: "nt-mon", mgmt_net: "192.0.2.0 255.255.255.0", snmpv3_auth_pass: "NoDebeAparecer1" }, now: NOW });
  const t = plan.lines.map((l) => l.text.trim());
  // allowaccess calculado desde el valor actual: ADM-001, TEL-001 y HTTP-001 se combinan; fgfm se conserva.
  assert.equal(t.filter((x) => x === "config system interface").length, 1, "una sola apertura del bloque");
  assert.equal(t.filter((x) => x === 'edit "wan1"').length, 1);
  assert.equal(t.filter((x) => x.startsWith("set allowaccess")).length, 2);
  assert.ok(t.includes("set allowaccess ping fgfm"), "WAN sin https/ssh/http/telnet");
  assert.ok(t.includes("set allowaccess ping https ssh"), "LAN solo sin telnet");
  // Rollback en paralelo con el valor anterior.
  const rb = plan.rollback.map((l) => l.text.trim());
  assert.ok(rb.includes("set allowaccess ping https ssh http telnet fgfm"));
  assert.ok(rb.includes("set admintimeout 480"));
  // SNMPv3 se crea antes de borrar la comunidad; el borrado del usuario va al final del rollback.
  assert.ok(t.indexOf('edit "nt-mon"') < t.indexOf("delete 1"));
  assert.ok(rb.indexOf('delete "nt-mon"') === rb.length - 2, "rollback de prerrequisitos al final");
  // Secretos: siempre variables para CLI Lab, nunca el valor aunque se entregue.
  assert.ok(t.includes("set auth-pwd {{snmpv3_auth_pass}}"));
  assert.ok(!plan.text.includes("NoDebeAparecer1"));
  assert.equal(plan.params.find((p) => p.name === "snmpv3_auth_pass").state, "secret");
  assert.equal(plan.params.find((p) => p.name === "mgmt_net").state, "filled");
  assert.ok(plan.params.find((p) => p.name === "av_profile").state === "pending" && plan.warnings.some((w) => w.includes("av_profile")));
  // Riesgo por línea: comentarios sin riesgo, comandos con computeRisk.
  for (const l of plan.lines) assert.equal(l.comment, l.risk === null, l.text);
  assert.ok(plan.riskCount.change > 0);
  // Sin corrección automática: queda como comentario manual.
  assert.ok(plan.manual.some((m) => m.ruleId === "NT-FOS-POL-001"));
  assert.ok(plan.text.includes("# [NT-FOS-POL-001] Corrección manual"));
  // El rollback va al final del plan como comentario.
  const tail = plan.text.split("\n").slice(plan.text.split("\n").findIndex((l) => l.includes("Rollback")));
  assert.ok(tail.every((l) => l.startsWith("#")));
  assert.ok(plan.rollbackText.split("\n").some((l) => l.trim() === "set admintimeout 480"));
}
{
  const fails = cBad.findings.filter((f) => f.status === "fail").map((f) => f.ruleId);
  const plan = A.buildPlan(cBad, resolved, fails, { params: { snmpv3_user: "nt-mon", syslog_server: "192.0.2.50", mgmt_acl: "MGMT" }, now: NOW });
  const t = plan.lines.map((l) => l.text);
  assert.equal(t[0], "configure terminal");
  assert.equal(t.at(-1), "end");
  // Llave/SSH antes de restringir VTY; SNMPv3 antes de quitar public.
  assert.ok(t.indexOf("ip ssh version 2") < t.indexOf(" transport input ssh"));
  assert.ok(t.findIndex((x) => x.startsWith("snmp-server user nt-mon")) < t.indexOf("no snmp-server community public"));
  // Sin repetir aperturas: cada VTY una vez, con transport, ACL y timeout juntos.
  assert.equal(t.filter((x) => x === "line vty 0 4").length, 1);
  const vty = t.slice(t.indexOf("line vty 0 4"), t.indexOf("exit", t.indexOf("line vty 0 4")));
  assert.ok(vty.includes(" transport input ssh") && vty.includes(" access-class MGMT in") && vty.includes(" exec-timeout 10 0"));
  assert.ok(vty.indexOf(" transport input ssh") < vty.indexOf(" access-class MGMT in"), "ACL después de restringir a SSH");
  // Comunidad enmascarada: comentario, no comando.
  assert.ok(!t.some((x) => !x.trim().startsWith("!") && x.includes("****")));
  assert.ok(!plan.text.includes("Comunidad-Secreta") && !plan.text.includes("SuperHashSecreto"));
  // Rollback: lo restrictivo se deshace primero y la creación de SNMPv3 al final.
  const rb = plan.rollback.map((l) => l.text);
  assert.ok(rb.includes(" transport input telnet ssh") && rb.includes(" exec-timeout 0 0"));
  assert.equal(rb.at(-2), "no snmp-server group NT-V3 v3 priv");
  assert.equal(rb.at(-1), "end");
  // Parámetro con salto de línea: se rechaza y queda la variable.
  const inj = A.buildPlan(cBad, resolved, ["NT-IOS-LOG-001"], { params: { syslog_server: "192.0.2.50\nreload" } });
  assert.ok(inj.text.includes("logging host {{syslog_server}}") && !inj.text.includes("reload"));
  assert.ok(inj.warnings.some((w) => w.includes("syslog_server")));
  // Un hallazgo que cumple no genera nada.
  const none = A.buildPlan(cBad, resolved, ["NT-IOS-NTP-001"]);
  assert.equal(none.lines.length, 0);
}
{
  // Prerrequisito fuera del plan: aviso.
  const plan = A.buildPlan(cBad, resolved, ["NT-IOS-VTY-001"]);
  assert.ok(plan.warnings.some((w) => w.includes("NT-IOS-SSH-001")));
  // Unidades elegidas: solo vty 5 15.
  const one = A.buildPlan(cBad, resolved, [{ rule: "NT-IOS-VTY-001", units: [1] }]);
  assert.ok(one.lines.some((l) => l.text === "line vty 5 15") && !one.lines.some((l) => l.text === "line vty 0 4"));
}
{
  // FortiOS con VDOM: el plan vuelve a envolver en config global / config vdom.
  const vd =
    "config global\nconfig system global\n    set admintimeout 480\nend\nend\nconfig vdom\nedit root\nconfig system interface\n    edit \"port1\"\n        set allowaccess ping telnet\n    next\nend\nnext\nend\n";
  const r = audit(vd, { vendor: "fortinet" });
  const plan = A.buildPlan(r, resolved, ["NT-FOS-ADM-004", "NT-FOS-TEL-001"]);
  const t = plan.lines.map((l) => l.text.trim());
  assert.equal(t[t.indexOf("config global") + 1], "config system global");
  assert.equal(t[t.indexOf("config vdom") + 1], "edit root");
  assert.ok(t.includes("set allowaccess ping") && t.includes("set admintimeout 10"));
}

// ---------- Capas: overrides, redefinición y excepciones ----------
{
  const imported = {
    format: "netterminal-rules",
    formatVersion: 1,
    id: "proveedor-x",
    name: "Pack importado",
    version: "3.1.0",
    rules: [
      {
        ...B.BUILTIN_CISCO.rules.find((r) => r.id === "NT-IOS-LBF-001"),
        title: "Bloqueo de login (versión del proveedor)",
        severity: "medium",
      },
    ],
  };
  const user = {
    format: "netterminal-rules",
    formatVersion: 1,
    id: "hardening-lab",
    name: "Hardening del laboratorio",
    version: "2026.11",
    owner: "equipo-redes",
    overrides: [
      { rule: "NT-IOS-CDP-001", enabled: false, reason: "Lo cubre otro control" },
      { rule: "NT-IOS-BAN-001", severity: "medium", reason: "Norma interna" },
      { rule: "NT-IOS-EXT-001", params: { exec_timeout: "5" } },
    ],
    waivers: [
      { rule: "NT-IOS-HTTP-001", reason: "Equipo de laboratorio aislado", approvedBy: "CISO", expires: "2027-03-31", ticket: "RISK-12" },
      { rule: "NT-IOS-PWE-001", reason: "Excepción antigua", approvedBy: "CISO", expires: "2026-01-31" },
      { rule: "NT-IOS-VTY-001", match: "line vty 5 15", reason: "Consola de emergencia", approvedBy: "Jefe de redes", expires: "2027-01-01" },
    ],
    rules: [
      {
        id: "USR-LAB-001",
        title: "Hostname con prefijo de sitio",
        severity: "low",
        vendor: "cisco",
        controls: [
          { framework: "Hardening interno", control: "HRD-NOM-01" },
          { framework: "ISO/IEC 27001:2022", control: "A.8.9" },
        ],
        check: { type: "present", match: "^hostname (R|SW)-[A-Z]{3}" },
        tests: [
          { config: "hostname R-LAB\n", expect: "pass" },
          { config: "hostname router1\n", expect: "fail" },
        ],
      },
    ],
  };
  for (const p of [imported, user]) assert.deepEqual(R.validateRulePack(JSON.stringify(p)).errors, []);
  const res = R.resolveRules([
    { pack: user, layer: "user" },
    ...builtin,
    { pack: imported, layer: "imported" },
  ]);
  assert.deepEqual(
    res.packs.map((p) => [p.id, p.layer]),
    [
      ["nt-cisco-ios", "builtin"],
      ["nt-fortios", "builtin"],
      ["proveedor-x", "imported"],
      ["hardening-lab", "user"],
    ],
    "orden de capas integrada < importada < usuario",
  );
  assert.ok(res.packs.every((p) => /^[0-9a-f]{64}$/.test(p.sha256)));
  const r = audit(CISCO_BAD, { device: "R-LAB" }, res);
  assert.equal(byId(r, "NT-IOS-CDP-001"), undefined, "desactivada");
  assert.deepEqual(res.disabled[0], { id: "NT-IOS-CDP-001", layer: "user", packId: "hardening-lab", reason: "Lo cubre otro control" });
  const ban = byId(r, "NT-IOS-BAN-001");
  assert.equal(ban.severity, "medium");
  assert.ok(ban.changes[0].includes("Severidad baja → media"));
  const lbf = byId(r, "NT-IOS-LBF-001");
  assert.equal(lbf.layer, "imported");
  assert.equal(lbf.title, "Bloqueo de login (versión del proveedor)");
  assert.equal(byId(r, "USR-LAB-001").layer, "user");
  assert.equal(byId(r, "USR-LAB-001").status, "pass");
  // Excepción vigente: estado waived, visible y fuera del puntaje.
  const http = byId(r, "NT-IOS-HTTP-001");
  assert.equal(http.status, "waived");
  assert.equal(http.units[0].waiver.approvedBy, "CISO");
  assert.equal(r.counts.waived, 1);
  // Excepción vencida: sigue fallando y se informa.
  const pwe = byId(r, "NT-IOS-PWE-001");
  assert.equal(pwe.status, "fail");
  assert.equal(pwe.expiredWaivers[0].expires, "2026-01-31");
  assert.match(pwe.units[0].note, /vencida/);
  // Excepción por bloque: solo vty 5 15.
  const vty = byId(r, "NT-IOS-VTY-001");
  assert.deepEqual(
    vty.units.map((u) => u.status),
    ["fail", "waived"],
  );
  assert.equal(vty.status, "fail");
  // Parámetro ajustado por override y bloque con excepción fuera del plan.
  const plan = A.buildPlan(r, res, ["NT-IOS-EXT-001", "NT-IOS-VTY-001", "NT-IOS-HTTP-001"]);
  assert.ok(plan.lines.some((l) => l.text === " exec-timeout 5 0"));
  assert.ok(!plan.lines.some((l) => l.text === "line vty 5 15"), "unidad con excepción no se corrige");
  assert.ok(!plan.lines.some((l) => l.text === "no ip http server"), "regla con excepción no se corrige");
  // Waiver por match en FortiOS (cuenta de emergencia), como en el ejemplo del diseño.
  const fw = R.resolveRules([
    ...builtin,
    {
      layer: "user",
      pack: {
        format: "netterminal-rules",
        formatVersion: 1,
        id: "fw-user",
        name: "x",
        version: "1",
        waivers: [{ rule: "NT-FOS-ADM-002", match: 'edit "breakglass"', reason: "Cuenta de emergencia con control compensatorio", approvedBy: "CISO", expires: "2027-03-31" }],
      },
    },
  ]);
  const adm = byId(
    audit(
      'config system admin\n    edit "breakglass"\n        set accprofile "super_admin"\n    next\n    edit "ops"\n        set trusthost1 192.0.2.0 255.255.255.0\n    next\nend\n',
      {},
      fw,
    ),
    "NT-FOS-ADM-002",
  );
  assert.equal(adm.status, "waived");
  // Override sobre una regla que no existe: nota, sin error.
  const ghost = R.resolveRules([...builtin, { layer: "user", pack: { format: "netterminal-rules", formatVersion: 1, id: "g", name: "g", version: "1", overrides: [{ rule: "NO-EXISTE", enabled: false }] } }]);
  assert.ok(ghost.notes[0].includes("NO-EXISTE"));
}

// ---------- Packs inválidos ----------
{
  const base = { format: "netterminal-rules", formatVersion: 1, id: "p", name: "P", version: "1" };
  const rule = (over = {}) => ({ id: "R-1", title: "t", severity: "low", vendor: "cisco", controls: [], check: { type: "present", match: "^x$" }, tests: [{ config: "x", expect: "pass" }], ...over });
  const errs = (p) => R.validateRulePack(typeof p === "string" ? p : JSON.stringify(p)).errors.join(" | ");
  assert.equal(errs({ ...base, rules: [rule()] }), "");
  assert.match(errs("{no es json"), /JSON inválido/);
  assert.match(errs("x".repeat(R.MAX_PACK_BYTES + 1)), /supera/);
  assert.match(errs({ ...base, format: "otro" }), /format/);
  assert.match(errs({ ...base, formatVersion: 2 }), /formatVersion/);
  assert.match(errs({ ...base, rules: [rule(), rule()] }), /id repetido/);
  assert.match(errs({ ...base, rules: [rule({ severity: "urgente" })] }), /severidad inválida/);
  assert.match(errs({ ...base, rules: [rule({ vendor: "acme" })] }), /fabricante desconocido/);
  assert.match(errs({ ...base, rules: [rule({ check: { type: "present", match: "(a+)+$" } })] }), /anidados/);
  assert.match(errs({ ...base, rules: [rule({ check: { type: "absent", match: ".*a.*b" } })] }), /repeticiones sin tope/);
  assert.match(errs({ ...base, rules: [rule({ scope: { block: "^(\\w+\\s?)+$" } })] }), /scope\.block/);
  assert.match(errs({ ...base, rules: [rule({ check: { type: "value", key: "^x (\\d+)$", op: "gte", value: "diez" } })] }), /compara números/);
  assert.match(errs({ ...base, rules: [rule({ check: { type: "eval", match: "x" } })] }), /tipo de condición desconocido/);
  assert.match(errs({ ...base, rules: [rule({ check: { type: "present", match: "[" } })] }), /regex inválida/);
  assert.match(errs({ ...base, rules: [rule({ controls: [{ framework: "ISO/IEC 27001:2022", control: "A.8.99" }] })] }), /no es un control del Anexo A/);
  assert.match(errs({ ...base, rules: [rule({ remediation: { cisco: ["ntp server {{ntp}}"] } })] }), /sin parámetro declarado/);
  assert.match(errs({ ...base, rules: [rule({ remediation: { cisco: ["{{block}}"] } })] }), /requiere scope/);
  assert.match(errs({ ...base, rules: [rule({ remediation: { cisco: ["?fail:nada:x"] } })] }), /no corresponde/);
  assert.match(errs({ ...base, rules: [rule({ params: { clave_snmp: { prompt: "x", secret: true, default: "abc" } } })] }), /secreto no puede tener valor/);
  assert.match(errs({ ...base, rules: [rule({ params: { comunidad_x: { prompt: "x", secret: true }, usuario: { prompt: "y", secret: true } } })] }), /debe llamarse/);
  assert.match(errs({ ...base, rules: [rule({ params: { block: { prompt: "x" } } })] }), /reservado/);
  assert.match(errs({ ...base, rules: [rule({ ejecutar: "rm -rf" })] }), /campo desconocido/);
  assert.match(errs({ ...base, waivers: [{ rule: "R-1", reason: "x", approvedBy: "y", expires: "2026-02-30" }] }), /vencimiento/);
  assert.match(errs({ ...base, waivers: [{ rule: "R-1", reason: "", approvedBy: "y", expires: "2026-12-31" }] }), /motivo/);
  assert.match(errs({ ...base, overrides: [{ rule: "R-1", severity: "máxima" }] }), /severidad inválida/);
  assert.match(errs({ ...base, rules: Array.from({ length: R.MAX_RULES + 1 }, (_, i) => rule({ id: `R-${i}` })) }), /máximo/);
  assert.equal(R.validateRulePack({ ...base, rules: [rule({ check: { type: "present", match: "(a+)+$" } })] }).pack, null, "con errores no se carga nada");
  const noTests = R.validateRulePack({ ...base, rules: [rule({ tests: undefined })] });
  assert.ok(noTests.pack && noTests.warnings[0].includes("no trae tests"));
}
// Una regla peligrosa que llegue sin validar no congela: queda "revisar".
{
  const evil = { id: "EVIL", title: "x", severity: "high", vendor: "cisco", controls: [], check: { type: "present", match: "^(a|a)+$" } };
  const res = { rules: [{ rule: evil, layer: "user", packId: "x", packVersion: "1", severity: "high", changes: [], waivers: [], paramDefaults: {}, order: 0 }], disabled: [], notes: [], packs: [] };
  const r = fastEnough("regla peligrosa", 200, () => audit(`hostname R1\n${"a".repeat(5000)}!\n`, { vendor: "cisco" }, res));
  assert.equal(byId(r, "EVIL").status, "review");
  assert.match(byId(r, "EVIL").reason, /no se pudo evaluar/);
}

// ---------- Puntaje y riesgo ----------
{
  assert.equal(A.fmtPct(Math.round((1000 * 2) / 29) / 10), "6,9 %", "2 de 29 se redondea, no se trunca");
  const only = (ids) => ({ ...resolved, rules: resolved.rules.filter((r) => ids.includes(r.rule.id)) });
  // Solo una baja que falla y una baja que cumple: 50 % bajo el umbral → riesgo alto.
  const r = audit("hostname R1\nip ssh version 2\n", {}, only(["NT-IOS-LBF-001", "NT-IOS-BAN-001"]));
  assert.equal(r.score.percent, 0);
  assert.equal(r.risk.level, "high");
  assert.match(r.risk.reasons.join(" "), /umbral de 70/);
  const r2 = audit("hostname R1\nlogin block-for 60 attempts 3 within 30\n", {}, only(["NT-IOS-LBF-001", "NT-IOS-BAN-001"]), { riskThreshold: 40 });
  assert.equal(r2.score.percent, 50);
  assert.equal(r2.risk.level, "low", "solo bajas y sobre el umbral");
  const r3 = audit("hostname R1\n", {}, only(["NT-IOS-PWE-001", "NT-IOS-SSH-001"]), { riskThreshold: 0 });
  assert.equal(r3.risk.level, "high");
  const r4 = audit("hostname R1\nip ssh version 2\n", {}, only(["NT-IOS-PWE-001", "NT-IOS-SSH-001"]), { riskThreshold: 0 });
  assert.equal(r4.risk.level, "medium");
  // Sin reglas evaluables: puntaje sin dato.
  const r5 = audit("hostname R1\n", {}, only(["NT-IOS-USR-001"]));
  assert.equal(r5.score.percent, null);
}

// ---------- Exportaciones ----------
{
  const secrets = ["SuperHashSecreto", "0822455D0A16", "Comunidad-Secreta-77"];
  const r = audit(CISCO_BAD, { device: '<script>alert(1)</script>"R&D"' });
  const plan = A.buildPlan(r, resolved, ["NT-IOS-VTY-001", "NT-IOS-SNMP-002"]);
  const csv = A.auditToCsv(r);
  assert.ok(csv.startsWith("﻿regla,titulo,capa,pack,control,severidad,estado,equipo,bloque,linea,evidencia,excepcion\n"));
  assert.equal(csv.split("\n").filter(Boolean).length, 1 + r.findings.reduce((n, f) => n + Math.max(1, f.units.length), 0));
  const json = A.auditToJson(r);
  const parsed = JSON.parse(json);
  assert.match(parsed.input.sha256, /^[0-9a-f]{64}$/);
  assert.equal(parsed.input.sha256, A.runAudit({ text: CISCO_BAD }, resolved, { now: NOW }).input.sha256, "hash reproducible");
  assert.deepEqual(
    parsed.packs.map((p) => `${p.id}@${p.version}`),
    ["nt-cisco-ios@1.0.0", "nt-fortios@1.0.0"],
  );
  assert.ok(!json.includes('"computeFrom"') && parsed.findings.every((f) => f.units.every((u) => !("fix" in u))), "sin datos internos de remediación");
  const html = A.auditToHtml(r, plan);
  assert.ok(html.startsWith("<!doctype html>"));
  assert.ok(!/<script/i.test(html), "todo escapado");
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;&quot;R&amp;D&quot;"));
  assert.ok(!/(src|href)=/i.test(html), "sin recursos externos");
  assert.ok(html.includes("interpretación propia") && html.includes("Rollback"));
  for (const out of [csv, json, html, plan.text, plan.rollbackText]) for (const s of secrets) assert.ok(!out.includes(s), `secreto filtrado: ${s}`);
  // CSV: celdas que parecen fórmula se neutralizan.
  const f = A.auditToCsv(audit("hostname R1\n", { device: "=HYPERLINK(1)" }));
  assert.ok(f.includes(`"'=HYPERLINK(1)"`));
}

// ---------- Excepciones por bloque: palabras completas y rutas ----------
{
  const pack = (waivers) => R.resolveRules([...builtin, { layer: "user", pack: { format: "netterminal-rules", formatVersion: 1, id: "w", name: "w", version: "1", waivers } }]);
  const w = (rule, match) => ({ rule, ...(match !== undefined ? { match } : {}), reason: "x", approvedBy: "CISO", expires: "2027-03-31" });
  // "edit 1" no cubre edit 10, 11 ni 100.
  const fwCfg = `config firewall policy\n${[1, 10, 11, 100].map((n) => `    edit ${n}\n        set srcintf "internal"\n        set dstintf "wan1"\n        set srcaddr "all"\n        set dstaddr "all"\n        set action accept\n        set schedule "always"\n        set service "ALL"\n    next\n`).join("")}end\n`;
  const base = byId(audit(fwCfg, { vendor: "fortinet" }), "NT-FOS-POL-001");
  assert.equal(base.units.filter((u) => u.status === "fail").length, 4, "las cuatro políticas fallan sin excepción");
  const one = byId(audit(fwCfg, { vendor: "fortinet" }, pack([w("NT-FOS-POL-001", "edit 1")])), "NT-FOS-POL-001");
  assert.deepEqual(one.units.map((u) => u.status), ["waived", "fail", "fail", "fail"], "edit 1 solo cubre la política 1");
  // Ruta completa guardada desde un hallazgo (etiqueta) y ruta parcial antigua "a › b".
  const label = base.units[1].label;
  const viaLabel = byId(audit(fwCfg, { vendor: "fortinet" }, pack([w("NT-FOS-POL-001", label)])), "NT-FOS-POL-001");
  assert.deepEqual(viaLabel.units.map((u) => u.status), ["fail", "waived", "fail", "fail"]);
  const viaPath = byId(audit(fwCfg, { vendor: "fortinet" }, pack([w("NT-FOS-POL-001", "config firewall policy › edit 11")])), "NT-FOS-POL-001");
  assert.deepEqual(viaPath.units.map((u) => u.status), ["fail", "fail", "waived", "fail"]);
  const prefix = byId(audit(fwCfg, { vendor: "fortinet" }, pack([w("NT-FOS-POL-001", "config firewall policy")])), "NT-FOS-POL-001");
  assert.ok(prefix.units.every((u) => u.status === "waived"), "el bloque entero cubre sus políticas");
  // Cisco: "GigabitEthernet0/1" no cubre GigabitEthernet0/10; la etiqueta completa (sin " › ") tampoco.
  const ios = "interface GigabitEthernet0/1\n ip address 192.0.2.1 255.255.255.0\ninterface GigabitEthernet0/10\n ip address 192.0.2.65 255.255.255.192\n";
  const parp = (m) => byId(audit(ios, { vendor: "cisco" }, pack([w("NT-IOS-PARP-001", m)])), "NT-IOS-PARP-001").units.map((u) => u.status);
  assert.deepEqual(parp("GigabitEthernet0/1"), ["waived", "fail"]);
  assert.deepEqual(parp("interface GigabitEthernet0/1"), ["waived", "fail"]);
  assert.deepEqual(parp("interface GigabitEthernet0/10"), ["fail", "waived"]);
  assert.deepEqual(parp(undefined), ["waived", "waived"], "sin bloque cubre toda la regla");
  // Funciones sueltas.
  assert.equal(A.waiverMatches('edit "breakglass"', 'config system admin › edit "breakglass"'), true);
  assert.equal(A.waiverMatches("breakglass", 'config system admin › edit "breakglass"'), true, "sin comillas");
  assert.equal(A.waiverMatches("edit 1", "[VDOM root] config firewall policy › edit 10"), false);
  assert.equal(A.waiverMatches("[VDOM b] config firewall policy › edit 1", "[VDOM root] config firewall policy › edit 1"), false, "otra VDOM");
  assert.equal(A.waiverMatches("config firewall policy › edit 1", "[VDOM root] config firewall policy › edit 1"), true);
  assert.equal(A.waiverMatches("line vty 0 4", "line vty 0 4 (+1)", ["line vty 0 4", "line vty 5 15"]), true);
  // Vencimiento en el día local.
  assert.equal(A.localDay(new Date(2026, 0, 31, 23, 59)), "2026-01-31");
}

// ---------- FortiOS multi-VDOM sin `each`: una unidad por VDOM ----------
{
  const ssl = (src) => `config vpn ssl settings\n    set source-interface "wan1"\n    set port 10443\n${src ? `    set source-address ${src}\n` : ""}end\n`;
  const text = `config global\nconfig system global\n    set admintimeout 10\nend\nend\nconfig vdom\nedit root\n${ssl('"geo-CL"')}next\nedit B\n${ssl('"all"')}next\nend\n`;
  const r = audit(text, { vendor: "fortinet" });
  const f = byId(r, "NT-FOS-SSL-001");
  assert.equal(f.status, "fail", "la VDOM B no cumple aunque root sí");
  assert.equal(f.units.length, 2);
  assert.deepEqual(f.units.map((u) => [u.fix.ctx, u.status]), [["vdom:root", "pass"], ["vdom:B", "fail"]]);
  assert.match(f.units[1].label, /^\[VDOM B\]/);
  const plan = A.buildPlan(r, resolved, ["NT-FOS-SSL-001"], { params: { sslvpn_source: "geo-CL" } });
  const t = plan.lines.map((l) => l.text.trim());
  assert.equal(t[t.indexOf("config vdom") + 1], "edit B", "el plan va en la VDOM que falla");
  assert.ok(!t.includes("edit root"));
  const rb = plan.rollback.map((l) => l.text.trim());
  assert.equal(rb[rb.indexOf("config vdom") + 1], "edit B");
  assert.ok(rb.includes('set source-address "all"'), "rollback con el valor de B");
}

// ---------- Parámetros de los filtros (WAN y externas) ----------
{
  const names = (v) => A.filterParams(resolved, v).map((p) => p.name);
  assert.deepEqual(names("fortinet"), ["wan_interfaces"]);
  assert.deepEqual(names("cisco"), ["external_ifaces"]);
  const wan = A.filterParams(resolved, "fortinet")[0];
  assert.ok(wan.rules.includes("NT-FOS-ADM-001") && wan.rules.includes("NT-FOS-POL-002"));
  const fw = 'config system interface\n    edit "port1"\n        set ip 203.0.113.2 255.255.255.252\n        set allowaccess ping telnet\n    next\nend\n';
  assert.equal(byId(audit(fw, { vendor: "fortinet" }), "NT-FOS-ADM-001").status, "n/a", "sin el parámetro, port1 no es WAN");
  assert.equal(byId(audit(fw, { vendor: "fortinet" }, resolved, { params: { wan_interfaces: "port1" } }), "NT-FOS-ADM-001").status, "fail");
  const ios = "interface GigabitEthernet0/3\n ip address 203.0.113.6 255.255.255.252\n";
  assert.equal(byId(audit(ios, { vendor: "cisco" }, resolved, { params: { external_ifaces: "GigabitEthernet0/3" } }), "NT-IOS-CDP-001").status, "fail");
}

// ---------- Plantillas sin caracteres de control ----------
{
  const rule = (line) => ({
    format: "netterminal-rules",
    formatVersion: 1,
    id: "ctl",
    name: "ctl",
    version: "1",
    rules: [{ id: "R-CTL", title: "t", severity: "low", vendor: "cisco", controls: [], check: { type: "present", match: "^x" }, remediation: { cisco: [line] } }],
  });
  assert.deepEqual(R.validateRulePack(rule("no ip http server")).errors, []);
  for (const bad of ["no ip\thttp server", "no ip http server\u001b[2J", "a\u0008b", "a\u007fb"]) assert.match(R.validateRulePack(rule(bad)).errors.join(), /caracteres de control/, JSON.stringify(bad));
}

// ---------- Rollbacks que conservan lo previo ----------
{
  const rb = (text, id, params = {}) => A.buildPlan(audit(text, { vendor: id.startsWith("NT-FOS") ? "fortinet" : "cisco" }), resolved, [id], { params }).rollback.map((l) => l.text.trim());
  // NTP con llave existente: no se borra en el rollback.
  const ntp = rb("ntp authentication-key 3 md5 ****\nntp server 192.0.2.123\n", "NT-IOS-NTP-002");
  assert.ok(!ntp.some((l) => l.startsWith("no ntp authentication-key")), "la llave existente queda");
  const ntpNew = rb("ntp server 192.0.2.123\n", "NT-IOS-NTP-002");
  assert.ok(ntpNew.includes("no ntp authentication-key 1"), "la llave creada por el plan sí se quita");
  // archive con write-memory previo: el rollback no lo quita.
  assert.ok(!rb("archive\n path tftp://192.0.2.20/$h\n write-memory\n", "NT-IOS-ARC-001", { archive_path: "scp://r@192.0.2.20/c/$h" }).includes("no write-memory"));
  assert.ok(rb("archive\n path tftp://192.0.2.20/$h\n", "NT-IOS-ARC-001", { archive_path: "scp://r@192.0.2.20/c/$h" }).includes("no write-memory"));
  // FortiOS NTP con servidores: no se toca ntpserver.
  const fntp = 'config system ntp\n    set ntpsync disable\n    set type custom\n    config ntpserver\n        edit 1\n            set server "192.0.2.9"\n        next\n    end\nend\n';
  const plan = A.buildPlan(audit(fntp, { vendor: "fortinet" }), resolved, ["NT-FOS-NTP-001"], { params: { ntp_server: "192.0.2.123" } });
  assert.ok(![...plan.lines, ...plan.rollback].some((l) => /edit 1|delete 1|set server/.test(l.text)), "el servidor existente no se sobrescribe ni se borra");
  // Política de contraseñas: el rollback restaura los valores previos.
  const pwp = rb('config system password-policy\n    set status disable\n    set minimum-length 9\nend\n', "NT-FOS-PWP-001");
  assert.ok(pwp.includes("set minimum-length 9") && pwp.includes("unset min-number"));
}

// ---------- Rendimiento ----------
{
  const big = ["version 17.9", "hostname R-BIG"];
  for (let i = 0; i < 4000; i++) big.push(`interface GigabitEthernet1/0/${i}`, ` description puerto ${i}`, ` ip address 192.0.2.${i % 250} 255.255.255.0`, "!");
  big.push("line vty 0 4", " transport input ssh");
  const text = big.join("\n");
  const r = fastEnough("auditoría de 16.000 líneas", 1500, () => audit(text));
  assert.equal(byId(r, "NT-IOS-PARP-001").units.length, 4000);
  fastEnough("plan de 4.000 interfaces", 1500, () => A.buildPlan(r, resolved, ["NT-IOS-PARP-001"]));
}

console.log("audit OK");
