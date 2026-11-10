// Pruebas de recentRows (src/lib/termBuffer.ts): qué filas del búfer de xterm lee `recentText(n)`
// de cada pestaña (salto en pestaña nueva, tráfico por consola, equipo de la pestaña, detección de
// plataforma). Nombres ficticios.
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

const { recentRows } = await import("../../src/lib/termBuffer.ts");
const { atPrompt } = await import("../../src/lib/cliText.ts");
const H = await import("../../src/lib/hopTab.ts");

/**
 * Búfer como el de xterm: `rows` filas de viewport, `lines` escritas y el cursor en la última. Con menos
 * líneas que filas, `length` es igual a `rows` (las filas bajo el cursor existen, en blanco).
 */
function fakeBuffer(lines, rows) {
  const length = Math.max(rows, lines.length);
  const baseY = length - rows;
  const cursorY = lines.length - 1 - baseY;
  return { length, baseY, cursorY, getLine: (i) => lines[i] ?? "" };
}
/** Lo que hace recentText(n) en TerminalView. */
const recentText = (buf, n) => {
  const [start, end] = recentRows(buf, n);
  const out = [];
  for (let i = start; i < end; i++) out.push(buf.getLine(i));
  return out.join("\n");
};

// Pestaña recién abierta en una ventana grande: 4 líneas en un viewport de 40 filas.
const fresh = fakeBuffer(["", "Unauthorized access prohibited.", "", "core-sw01#"], 40);
assert.deepEqual(recentRows(fresh, 6), [0, 4], "hasta el cursor, no hasta el fondo del viewport");
assert.equal(recentText(fresh, 6).trim().split("\n").pop(), "core-sw01#");
assert.ok(atPrompt(recentText(fresh, 6)), "el tráfico por consola ve el prompt (antes: pestaña ocupada para siempre)");
assert.deepEqual(H.classifyHopScreen(recentText(fresh, 30)), { kind: "prompt", name: "core-sw01" }, "el salto en pestaña nueva ve el prompt del pivote");
assert.deepEqual(H.tabDevice({ name: "x", screen: (n) => recentText(fresh, n) }), { name: "core-sw01", verified: true, index: 0 });
// Lo que hacía antes (desde length - n): solo filas en blanco.
const old = (buf, n) => Array.from({ length: Math.min(n, buf.length) }, (_, k) => buf.getLine(buf.length - Math.min(n, buf.length) + k)).join("\n");
assert.equal(old(fresh, 6).trim(), "", "regresión documentada: el cálculo anterior no veía nada");

// Tras clear: el prompt queda arriba del viewport y el resto en blanco.
const cleared = fakeBuffer(["core-sw01#"], 48);
assert.deepEqual(recentRows(cleared, 8), [0, 1]);
assert.ok(atPrompt(recentText(cleared, 8)));

// Con historial (más líneas que filas): las últimas n hasta el cursor.
const long = Array.from({ length: 300 }, (_, i) => `linea ${i}`).concat("dist-sw01#");
const full = fakeBuffer(long, 40);
assert.deepEqual(recentRows(full, 6), [295, 301]);
assert.equal(recentText(full, 150).split("\n").length, 150, "la detección (150 líneas) recibe 150 líneas reales");
assert.equal(recentText(full, 150).split("\n").pop(), "dist-sw01#");

// Bordes: n mayor que lo escrito, n = 0 y cursor fuera de rango no rompen.
assert.deepEqual(recentRows(fresh, 1000), [0, 4]);
assert.deepEqual(recentRows(fresh, 0), [4, 4]);
assert.deepEqual(recentRows({ length: 10, baseY: 0, cursorY: 50 }, 3), [7, 10]);
assert.deepEqual(recentRows({ length: 0, baseY: 0, cursorY: 0 }, 3), [0, 0]);

console.log("termBuffer: ok");
