// Pruebas de la numeración de paneles según el orden de la barra: `node scripts/tests/paneNumbers.test.mjs` (Node 22.15+).
import assert from "node:assert/strict";
const { paneNumbers, tabPaneNumbers } = await import("../../src/lib/paneNumbers.ts");

const order = ["a", "b", "c", "d", "e"];

// Caso de la captura: la pestaña del primer panel está al final de la barra; se numera según la barra.
assert.deepEqual(paneNumbers(["e", "b", "c", "d"], order), [4, 1, 2, 3]);
// Ya en orden: no cambia nada.
assert.deepEqual(paneNumbers(["a", "b"], order), [1, 2]);
assert.deepEqual(paneNumbers(["c", "a"], order), [2, 1]);
// Paneles vacíos al final, por posición.
assert.deepEqual(paneNumbers([null, "d", null, "b"], order), [3, 2, 4, 1]);
assert.deepEqual(paneNumbers([null, null], order), [1, 2]);
// Pestaña que ya no está en la barra: se trata como vacío.
assert.deepEqual(paneNumbers(["x", "a"], order), [2, 1]);
// Mapa por pestaña: el mismo número que la cabecera del panel.
assert.deepEqual([...tabPaneNumbers(["e", null, "b", "c"], order)].sort(), [["b", 1], ["c", 2], ["e", 3]]);
assert.equal(tabPaneNumbers(null, order).size, 0);

console.log("paneNumbers OK");
