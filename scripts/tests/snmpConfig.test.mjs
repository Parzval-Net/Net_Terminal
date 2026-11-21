// Pruebas del generador de configuración SNMP (src/lib/snmpconfig.ts):
// `node scripts/tests/snmpConfig.test.mjs` (Node 22.15+).
import assert from "node:assert/strict";
const G = await import("../../src/lib/snmpconfig.ts");

const base = { ...G.DEFAULT_INPUT, nms: "192.0.2.10" };
const head = (r) => r.text.split("\n")[2];

// ---- Huawei VRP: las contraseñas v3 no se escriben y sus campos quedan deshabilitados ----
let r = G.generate({ ...base, platform: "vrp", authPass: "abc" });
assert.ok(r.text, "una contraseña inválida que quedó de otra plataforma no bloquea VRP");
assert.deepEqual(r.errors, []);
r = G.generate({ ...base, platform: "vrp", authPass: "Abcdefgh1", privPass: "Zyxwvuts2" });
assert.ok(!r.text.includes("Abcdefgh1") && !r.text.includes("Zyxwvuts2"), "VRP no escribe las contraseñas");
assert.equal(r.typed, false, "VRP v3 no lleva secretos aunque se hayan escrito");
assert.match(head(r), /Reemplaza los marcadores/);
assert.ok(!r.text.includes("la que escribiste"), "el comentario de VRP no menciona contraseñas que el texto no trae");

// En las demás plataformas la contraseña se sigue validando.
r = G.generate({ ...base, platform: "ios", authPass: "abc" });
assert.equal(r.text, "");
assert.equal(r.errors[0].field, "authPass");

// ---- Aviso de secretos según lo que de verdad se emite ----
r = G.generate({ ...base, authPass: "Abcdefgh1" });
assert.equal(r.typed, true);
assert.match(head(r), /ATENCIÓN: este texto contiene secretos reales/);
assert.ok(r.text.includes("Abcdefgh1"));
r = G.generate({ ...base, version: "v2c", authPass: "Abcdefgh1" });
assert.equal(r.typed, false, "una authPass que quedó de v3 no cuenta en v2c");
assert.match(head(r), /Reemplaza los marcadores/);
assert.ok(r.text.includes("<COMMUNITY>"));
r = G.generate({ ...base, version: "v2c", authPass: "x" });
assert.deepEqual(r.errors, [], "en v2c no se valida la contraseña v3 oculta");
r = G.generate({ ...base, version: "v2c", community: "Ro-Comm-2024" });
assert.equal(r.typed, true);
assert.ok(r.text.includes("Ro-Comm-2024"));
r = G.generate({ ...base, version: "v3", community: "Ro-Comm-2024" });
assert.equal(r.typed, false, "una community que quedó de v2c no cuenta en v3");
assert.ok(!r.text.includes("Ro-Comm-2024"));

assert.equal(G.emitsSecrets({ ...base, platform: "netsnmp", privPass: "Abcdefgh1" }), true);
assert.equal(G.emitsSecrets({ ...base, platform: "vrp", version: "v2c", community: "Ro-Comm-2024" }), true, "VRP v2c sí escribe la community");

// ---- NMS vacío: error para la interfaz (que lo muestra recién al tocar el campo) ----
r = G.generate({ ...G.DEFAULT_INPUT });
assert.equal(r.text, "");
assert.deepEqual(r.errors.map((e) => e.field), ["nms"]);

console.log("snmpConfig: ok");
