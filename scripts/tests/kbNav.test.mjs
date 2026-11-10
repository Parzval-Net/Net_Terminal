// Pruebas de la navegación por teclado (árbol de sesiones, pestañas, trampa de foco de diálogos):
// `node scripts/tests/kbNav.test.mjs` (Node 22.15+).
import assert from "node:assert/strict";
const { stepIndex, afterRemoval, treeKey, trapIndex, createStack } = await import("../../src/lib/kbNav.ts");

// ---- Pestañas horizontales: Izquierda/Derecha con vuelta, Inicio/Fin ----
const h = { orientation: "horizontal" };
assert.equal(stepIndex("ArrowRight", 0, 3, h), 1);
assert.equal(stepIndex("ArrowRight", 2, 3, h), 0, "da la vuelta");
assert.equal(stepIndex("ArrowLeft", 0, 3, h), 2, "da la vuelta hacia atrás");
assert.equal(stepIndex("Home", 2, 3, h), 0);
assert.equal(stepIndex("End", 0, 3, h), 2);
assert.equal(stepIndex("ArrowDown", 0, 3, h), -1, "las flechas verticales no navegan en horizontal");
assert.equal(stepIndex("ArrowRight", 0, 1, h), -1, "una sola pestaña: no hay a dónde ir");
assert.equal(stepIndex("ArrowRight", 0, 0, h), -1);
assert.equal(stepIndex("a", 0, 3, h), -1);
// Verticales
const v = { orientation: "vertical" };
assert.equal(stepIndex("ArrowDown", 1, 3, v), 2);
assert.equal(stepIndex("ArrowUp", 0, 3, v), 2);
assert.equal(stepIndex("ArrowRight", 0, 3, v), -1);
// Sin vuelta (árboles) y paginado
const t = { orientation: "vertical", wrap: false, page: 10 };
assert.equal(stepIndex("ArrowUp", 0, 50, t), -1);
assert.equal(stepIndex("ArrowDown", 49, 50, t), -1);
assert.equal(stepIndex("PageDown", 5, 50, t), 15);
assert.equal(stepIndex("PageDown", 45, 50, t), 49, "se detiene en el final");
assert.equal(stepIndex("PageUp", 3, 50, t), 0);
assert.equal(stepIndex("PageUp", 0, 50, t), -1);
assert.equal(stepIndex("PageDown", 5, 50, v), -1, "sin `page` no pagina");

// ---- Foco tras cerrar con Supr ----
assert.equal(afterRemoval(3, 0), 1);
assert.equal(afterRemoval(3, 1), 2);
assert.equal(afterRemoval(3, 2), 1, "era la última: el anterior");
assert.equal(afterRemoval(1, 0), -1);

// ---- Árbol: raíz1 (abierta) { a, sub (cerrada) }, b, raíz2 (cerrada), suelta ----
const rows = [
  { level: 1, folder: true, expanded: true }, // 0 raíz1
  { level: 2, folder: false }, // 1 a
  { level: 2, folder: true, expanded: false }, // 2 sub
  { level: 1, folder: false }, // 3 b
  { level: 1, folder: true, expanded: false }, // 4 raíz2
  { level: 1, folder: false }, // 5 suelta
];
assert.deepEqual(treeKey(rows, 0, "ArrowDown"), { focus: 1 });
assert.deepEqual(treeKey(rows, 5, "ArrowDown"), null, "último: no da la vuelta");
assert.deepEqual(treeKey(rows, 0, "ArrowUp"), null);
assert.deepEqual(treeKey(rows, 3, "ArrowUp"), { focus: 2 });
assert.deepEqual(treeKey(rows, 2, "Home"), { focus: 0 });
assert.deepEqual(treeKey(rows, 2, "End"), { focus: 5 });
// Derecha: carpeta cerrada se abre; abierta entra en su primer hijo; hoja no hace nada.
assert.deepEqual(treeKey(rows, 2, "ArrowRight"), { expand: 2 });
assert.deepEqual(treeKey(rows, 0, "ArrowRight"), { focus: 1 });
assert.deepEqual(treeKey(rows, 1, "ArrowRight"), null);
// Carpeta abierta pero vacía (el siguiente es de su mismo nivel): nada.
assert.deepEqual(treeKey([{ level: 1, folder: true, expanded: true }, { level: 1, folder: false }], 0, "ArrowRight"), null);
// Izquierda: carpeta abierta se cierra; cerrada u hoja suben al padre; la raíz no hace nada.
assert.deepEqual(treeKey(rows, 0, "ArrowLeft"), { collapse: 0 });
assert.deepEqual(treeKey(rows, 1, "ArrowLeft"), { focus: 0 });
assert.deepEqual(treeKey(rows, 2, "ArrowLeft"), { focus: 0 });
assert.deepEqual(treeKey(rows, 4, "ArrowLeft"), null, "carpeta cerrada en la raíz");
assert.deepEqual(treeKey(rows, 5, "ArrowLeft"), null);
// Con filtro las carpetas no se pliegan (expanded indefinido): Izquierda sube al padre.
const filtered = [{ level: 1, folder: true }, { level: 2, folder: false }];
assert.deepEqual(treeKey(filtered, 0, "ArrowLeft"), null);
assert.deepEqual(treeKey(filtered, 0, "ArrowRight"), { focus: 1 });
assert.deepEqual(treeKey(filtered, 1, "ArrowLeft"), { focus: 0 });
// Enter y teclas ajenas.
assert.deepEqual(treeKey(rows, 3, "Enter"), { activate: 3 });
assert.deepEqual(treeKey(rows, 2, "Enter"), { activate: 2 });
assert.equal(treeKey(rows, 3, "x"), null);
assert.equal(treeKey(rows, 99, "ArrowDown"), null);
assert.deepEqual(treeKey(rows, 0, "PageDown", 3), { focus: 3 });

// ---- Trampa de foco ----
assert.equal(trapIndex(0, -1, false), -1, "sin enfocables: el diálogo");
assert.equal(trapIndex(4, 3, false), 0, "Tab en el último vuelve al primero");
assert.equal(trapIndex(4, 0, true), 3, "Mayús+Tab en el primero va al último");
assert.equal(trapIndex(4, 1, false), null, "en medio decide el navegador");
assert.equal(trapIndex(4, 2, true), null);
assert.equal(trapIndex(4, -1, false), 0, "foco fuera: entra por el primero");
assert.equal(trapIndex(4, -1, true), 3);
assert.equal(trapIndex(1, 0, false), 0);
assert.equal(trapIndex(1, 0, true), 0);

// ---- Pila de diálogos ----
const s = createStack();
const a = {};
const b = {};
s.push(a);
assert.ok(s.isTop(a));
s.push(b);
assert.ok(s.isTop(b) && !s.isTop(a), "solo el último atiende Esc");
s.remove(b);
assert.ok(s.isTop(a));
s.remove(b);
s.remove(a);
assert.equal(s.size, 0);
assert.ok(!s.isTop(a));
console.log("kbNav OK");
