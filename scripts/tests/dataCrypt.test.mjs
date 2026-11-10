// Pruebas de la lógica de interfaz del modo portable cifrado: `node scripts/tests/dataCrypt.test.mjs`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";

// settings.ts y bundle.ts importan módulos sin extensión: se resuelven al .ts.
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

const D =await import("../../src/lib/dataCrypt.ts");
const S = await import("../../src/lib/settings.ts");
const B = await import("../../src/lib/bundle.ts");

const st = (p) => ({ ...D.PLAIN_STATUS, ...p });

// ---------- Qué pantalla se muestra ----------
assert.equal(D.gateView(null), "loading", "sin estado aún no se monta nada");
assert.equal(D.gateView(st({})), "app", "carpeta en claro");
assert.equal(D.gateView(st({ encrypted: true, unlocked: false })), "unlock", "cifrada y bloqueada: nada de la app");
assert.equal(D.gateView(st({ encrypted: true, unlocked: true })), "app");
assert.equal(D.gateView(st({ encrypted: true, unlocked: true, journal: "encrypt" })), "resume", "conversión cortada: retomar o revertir antes de abrir");
assert.equal(D.gateView(st({ encrypted: true, unlocked: false, journal: "decrypt" })), "unlock", "primero la contraseña");
assert.equal(D.gateView(st({ encrypted: true, unlocked: false, error: "versión más nueva" })), "error");
// Sin backend (navegador de desarrollo) se comporta como carpeta en claro.
assert.equal(D.gateView(D.PLAIN_STATUS), "app");

// ---------- Validación del diálogo de activación ----------
const form = (p) => ({ hasVault: true, master: "", confirm: "", ack: false, logsActive: 0, ...p });
assert.deepEqual(D.enableCheck(form({})), { ok: false, reason: null }, "vacío: sin mensaje de error");
assert.equal(D.enableCheck(form({ master: "x" })).ok, false, "sin la casilla no se puede");
assert.equal(D.enableCheck(form({ master: "x", ack: true })).ok, true, "con bóveda: la contraseña la verifica el backend");
assert.match(D.enableCheck(form({ master: "x", ack: true, logsActive: 2 })).reason, /2 pestañas/);
assert.match(D.enableCheck(form({ master: "x", ack: true, logsActive: 1 })).reason, /1 pestaña/);
// Sin bóveda: se crea la maestra (mínimo 8 caracteres, contados como caracteres y no bytes) y se confirma.
const nv = (p) => form({ hasVault: false, ack: true, ...p });
assert.match(D.enableCheck(nv({ master: "corta" })).reason, /al menos 8/);
assert.equal(D.enableCheck(nv({ master: "ñandú-ok" })).ok, false, "falta confirmar");
assert.equal(D.enableCheck(nv({ master: "ñandú-ok" })).reason, null, "sin confirmación escrita no se acusa error");
assert.match(D.enableCheck(nv({ master: "ñandú-ok", confirm: "otra" })).reason, /no coinciden/);
assert.equal(D.enableCheck(nv({ master: "ñandú-ok", confirm: "ñandú-ok" })).ok, true);
assert.equal(D.enableCheck(nv({ master: "ñandú-ok", confirm: "ñandú-ok", ack: false })).ok, false);

// ---------- Advertencias obligatorias ----------
const w = D.ENABLE_WARNINGS.join(" ");
for (const must of [/no hay forma de recuperar/, /versiones anteriores/i, /toma un poco más/, /no garantiza que desaparezcan/, /No se cifran/]) assert.match(w, must);
assert.ok(!/—/.test(w), "sin guion largo");

// ---------- Avance y resultado ----------
assert.equal(D.progressText(null), "Preparando…");
assert.equal(D.progressText({ done: 1, total: 1, bytes: 512, totalBytes: 2048 }), "1 de 1 archivo · 512 B de 2 KB");
assert.equal(D.progressText({ done: 3, total: 40, bytes: 3 * 1048576, totalBytes: 18 * 1048576 }), "3 de 40 archivos · 3,0 MB de 18,0 MB");
assert.equal(D.progressRatio(null), 0);
assert.equal(D.progressRatio({ done: 0, total: 0, bytes: 0, totalBytes: 0 }), 1, "nada que convertir = listo");
assert.equal(D.progressRatio({ done: 1, total: 4, bytes: 0, totalBytes: 0 }), 0.25);
assert.equal(D.progressRatio({ done: 1, total: 4, bytes: 50, totalBytes: 100 }), 0.5);
assert.equal(D.reportText({ converted: 1, aside: [], incomplete: [], bytes: 1, ms: 1 }, "encrypt"), "1 archivo cifrado y verificado.");
const r = D.reportText({ converted: 12, aside: ["settings.encontrado-1.json"], incomplete: ["logs/core.log"], bytes: 1, ms: 1 }, "decrypt");
assert.match(r, /^12 archivos descifrados y verificados\./);
assert.match(r, /quedó aparte: settings\.encontrado-1\.json/);
assert.match(r, /grabación cortada.*logs\/core\.log/);

// ---------- Aviso de actividad limitado ----------
let t = 0;
let sent = 0;
const ping = D.throttle(() => sent++, 20_000, () => t);
ping();
ping();
assert.equal(sent, 1, "una sola vez dentro del intervalo");
t = 19_999;
ping();
assert.equal(sent, 1);
t = 20_000;
ping();
assert.equal(sent, 2);

// ---------- Ajuste nuevo: clasificado como excluido del archivo .ntx ----------
assert.equal(S.defaultSettings.dataLockStopLogs, false, "por defecto los logs siguen al bloquear (con la llave de su archivo)");
assert.ok(B.SETTINGS_EXCLUDED.includes("dataLockStopLogs"));
const rust = readFileSync(new URL("../../src-tauri/src/bundle.rs", import.meta.url), "utf8");
assert.match(rust, /"dataLockStopLogs",/, "también excluido en Rust");
const doc = readFileSync(new URL("../../docs/TECNICO.md", import.meta.url), "utf8");
assert.match(doc, /\| Excluida \| `dataLockStopLogs` \|/);

// ---------- La contraseña nunca queda en el estado ni en los textos ----------
const api = readFileSync(new URL("../../src/lib/api.ts", import.meta.url), "utf8");
for (const cmd of ["data_unlock", "datacrypt_enable", "datacrypt_disable"]) assert.match(api, new RegExp(`"${cmd}", \\{ master \\}`), `${cmd} solo envía la maestra`);
assert.ok(!/master/.test(JSON.stringify(D.PLAIN_STATUS)), "el estado no trae contraseñas");

console.log("dataCrypt: OK");
