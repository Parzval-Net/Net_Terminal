// Asistentes de terminal (auditoría): Enter en la confirmación de difusión y CLI Lab, plantillas con
// secretos, "Detener" del CLI Lab, secretos cortos en el eco y errores de regex en español.
// `node scripts/tests/assistants.test.mjs` (Node 22.15+ con tipos TS).
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

const K = await import("../../src/lib/confirmKeys.ts");
const T = await import("../../src/lib/templateFill.ts");
const L = await import("../../src/lib/cliLab.ts");
const H = await import("../../src/lib/highlight.ts");
const A = await import("../../src/lib/alerts.ts");

// ---------- Enter en la confirmación ----------
// Enter sobre "Cancelar" cancela siempre, aunque el envío sea de solo consulta (antes enviaba).
assert.equal(K.enterAction("cancel", false, true), "cancel");
assert.equal(K.enterAction("cancel", true, true), "cancel");
// Sobre el botón de envío, confirma solo si está habilitado.
assert.equal(K.enterAction("confirm", false, true), "confirm");
assert.equal(K.enterAction("confirm", true, false), null);
// Otro botón: lo resuelve el propio botón. En campos no envía.
assert.equal(K.enterAction("button", false, true), "native");
assert.equal(K.enterAction("field", false, true), null);
// Fuera de los controles: envía lo que no exige escribir la cantidad de equipos.
assert.equal(K.enterAction("other", false, true), "confirm");
assert.equal(K.enterAction("other", true, true), null);
assert.equal(K.enterAction("other", false, false), null);

// ---------- Plantillas con variables secretas ----------
const tpl = "tacacs-server host {{ip}}\ntacacs-server key {{tacacs_key}}";
const f = T.fillTemplateMasked(tpl, { ip: "10.0.0.5", tacacs_key: "ab" });
assert.equal(f.text, "tacacs-server host 10.0.0.5\ntacacs-server key ab");
assert.equal(f.shown, "tacacs-server host 10.0.0.5\ntacacs-server key ••••••");
assert.equal(f.secret, true, "con secreto no va al historial");
const snmp = T.fillTemplateMasked("snmp-server user u g v3 auth sha {{auth}} priv aes 128 {{priv_key}}", { auth: "A1", priv_key: "P2" });
assert.ok(!snmp.shown.includes("A1") && !snmp.shown.includes("P2"));
assert.equal(snmp.secret, true);
const plain = T.fillTemplateMasked("interface {{puerto}}\n description {{desc}}", { puerto: "Gi1/0/1", desc: "uplink" });
assert.equal(plain.shown, plain.text);
assert.equal(plain.secret, false, "sin secretos se guarda como siempre");
assert.deepEqual(T.templateVars("{{a}} {{ b }} {{a}}"), ["a", "b"]);

// ---------- CLI Lab ----------
const targets = [{ tabId: "a", name: "sw-a" }];
const conn = () => "c";

// Detener deja de esperar la línea en curso al instante (antes esperaba el plazo por comando).
let finished = false;
const slowExec = async (_c, cmd) => {
  await new Promise((r) => setTimeout(r, 1500));
  finished = true;
  return { ok: true, output: `sw#${cmd}\nsw#` };
};
const t0 = Date.now();
const p = L.runLab(targets, ["show tech-support", "show version"], { stopOnError: true, parallel: 1, answer: false, conn, exec: slowExec });
setTimeout(() => L.stopLab(), 50);
const stopped = await p;
const took = Date.now() - t0;
assert.ok(took < 1000, `Detener tardó ${took} ms`);
assert.equal(finished, false, "la línea en curso no terminó: no se la esperó");
assert.equal(stopped.running, false);
assert.equal(stopped.items[0].status, "stopped");
assert.match(stopped.items[0].reason, /línea 1: el equipo puede seguir/);
assert.equal(stopped.items[0].steps.length, 1);
assert.equal(stopped.items[0].steps[0].note, L.STOP_NOTE);
assert.equal(L.isLabRunning(), false);
// El trabajo abandonado termina después sin romper nada (ni un rechazo sin atender).
await new Promise((r) => setTimeout(r, 1600));
assert.equal(finished, true);

// Un secreto de 2 caracteres no queda en el eco del equipo (visor, informe).
const r2 = await L.runLab(targets, ["snmp-server community ab RO"], {
  stopOnError: true,
  parallel: 1,
  answer: false,
  conn,
  labels: ["snmp-server community •••••• RO"],
  secrets: ["ab"],
  exec: async (_c, cmd) => ({ ok: true, output: `sw(config)#${cmd}\nsw(config)#` }),
});
const report = L.labReport(r2);
assert.ok(!/community ab\b/.test(report), report);
assert.match(report, /community •••••• RO/);
// El visor encuentra el eco (busca la etiqueta) y no lo deja dentro del cuerpo.
assert.deepEqual(L.splitStep(r2.items[0].steps[0].output, r2.items[0].steps[0].cmd), { prompt: "sw(config)#", body: [] });
assert.equal(L.maskOutput("x show ver y", "show ver", "show ver"), "x show ver y", "sin secreto no cambia");

// ---------- Errores de expresión regular en español ----------
assert.equal(H.regexError("BGP.*(Down"), "Falta cerrar un paréntesis ( )");
assert.equal(H.regexError("a)"), "Sobra un paréntesis de cierre )");
assert.equal(H.regexError("[abc"), "Falta cerrar un corchete [ ]");
assert.match(H.regexError("*a"), /no tiene qué repetir/);
assert.match(H.regexError("a{3,1}"), /mínimo es mayor/);
assert.match(H.regexError("[z-a]"), /Rango invertido/);
assert.match(H.regexError("abc\\"), /termina en \\/);
assert.match(H.regexError("(?<a>x)(?<a>y)"), /Nombre de grupo/);
assert.equal(H.regexError("BGP.*Down"), null);
for (const p of ["BGP.*(Down", "a)", "[abc", "*a", "(?x)"]) {
  const m = H.regexError(p);
  assert.ok(!/Invalid regular expression|dgm/.test(m), `${p}: ${m}`);
}
// Lo mismo llega a Alertas.
const alert = { ...A.newAlert(), id: "r", name: "x", pattern: "BGP.*(Down", regex: true };
assert.equal(A.alertError(alert), "Falta cerrar un paréntesis ( )");

console.log("assistants: ok");
