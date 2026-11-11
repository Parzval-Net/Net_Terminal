// Pruebas del resaltado en flujo con ráfagas grandes: `node scripts/tests/hlStream.test.mjs` (Node 22.15+).
// Una ráfaga se resalta por tramos (la interfaz responde entre ellos) sin perder ni reordenar texto,
// aunque lleguen más datos, un eco o un cierre mientras queda parte pendiente.
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// highlight.ts importa sin extensión (como lo resuelve Vite): se completa con .ts.
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
// StreamHighlighter usa window.setTimeout (corre en el navegador).
globalThis.window ??= globalThis;

const H = await import("../../src/lib/highlight.ts");
const rules = H.compile(H.effectiveRules({ enabled: true, schemes: ["cisco", "common"], custom: [] }));
assert.ok(rules.length > 0);
const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const burst = (n, tag = "") =>
  Array.from({ length: n }, (_, i) => `${tag}GigabitEthernet1/0/${i % 48} 192.0.2.${i % 254} up up 00:1a:2b:3c:4d:${(i % 256).toString(16).padStart(2, "0")}\r\n`).join("");

// Ráfaga de ~400 KB: se escribe en varios tramos, todos terminados en línea completa, con el mismo texto.
{
  const out = [];
  const hl = new H.StreamHighlighter((s) => out.push(s), () => rules, () => false);
  const big = burst(6000);
  hl.push(big);
  const first = out.length;
  for (let i = 0; i < 400 && strip(out.join("")).length < big.length; i++) await sleep(1);
  assert.equal(strip(out.join("")), big, "mismo texto y en orden");
  assert.ok(out.length > 1, `varios tramos (${out.length})`);
  assert.ok(first >= 1, "el primer tramo sale de inmediato");
  assert.ok(out.every((s) => s.endsWith("\n")), "cada tramo termina en línea completa");
  hl.dispose();
}

// Datos nuevos durante la continuación: esperan detrás de lo pendiente; un eco o flush() lo vacía todo en orden.
{
  const out = [];
  const hl = new H.StreamHighlighter((s) => out.push(s), () => rules, () => false);
  const a = burst(6000, "a");
  const b = burst(50, "b");
  hl.push(a);
  hl.push(b);
  hl.push("core-sw01#");
  hl.push("s"); // eco de una tecla: sale tras todo lo anterior
  assert.equal(strip(out.join("")), a + b + "core-sw01#s", "el eco vacía la ráfaga pendiente sin reordenar");
  await sleep(20);
  assert.equal(strip(out.join("")), a + b + "core-sw01#s", "la continuación cancelada no repite nada");
  hl.dispose();
}

// Una línea más larga que el tramo no se corta a la mitad.
{
  const out = [];
  const hl = new H.StreamHighlighter((s) => out.push(s), () => rules, () => false);
  const long = "x".repeat(40 * 1024) + "\r\n" + burst(3000);
  hl.push(long);
  for (let i = 0; i < 400 && strip(out.join("")).length < long.length; i++) await sleep(1);
  assert.equal(strip(out.join("")), long);
  assert.ok(out.every((s) => s.endsWith("\n")));
  hl.dispose();
}

// dispose() durante la continuación: no escribe nada más.
{
  const out = [];
  const hl = new H.StreamHighlighter((s) => out.push(s), () => rules, () => false);
  hl.push(burst(8000));
  const n = out.length;
  hl.dispose();
  await sleep(30);
  assert.equal(out.length, n, "sin escrituras después de cerrar");
}

// Sin reglas (o pantalla completa): la ráfaga también va en trozos, sin cambiar el texto.
{
  const out = [];
  const hl = new H.StreamHighlighter((s) => out.push(s), () => [], () => false);
  const big = burst(6000);
  hl.push(big);
  assert.equal(out.join(""), big);
  assert.ok(out.length > 1 && out.every((s) => s.length <= 32 * 1024), `trozos (${out.length})`);
  hl.dispose();
}

console.log("hlStream: ok");
