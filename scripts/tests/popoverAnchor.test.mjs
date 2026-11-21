// Pruebas de la posición del panel de historial bajo su botón: `node scripts/tests/popoverAnchor.test.mjs`.
import assert from "node:assert/strict";

const { anchorBelow, FALLBACK_TOP } = await import("../../src/lib/popoverAnchor.ts");
const view = { width: 1440, height: 900 };

// Bajo el botón, alineado a su borde derecho.
{
  const p = anchorBelow({ left: 1300, right: 1328, top: 8, bottom: 32 }, 420, view);
  assert.equal(p.top, 38);
  assert.equal(p.left, 1328 - 420);
  assert.equal(p.maxHeight, 900 - 38 - 12);
}

// Botón cerca del borde izquierdo: no se sale por la izquierda.
assert.equal(anchorBelow({ left: 20, right: 48, top: 8, bottom: 32 }, 420, view).left, 12);

// Ventana más angosta que el panel: queda en el margen.
assert.equal(anchorBelow({ left: 300, right: 328, top: 8, bottom: 32 }, 420, { width: 400, height: 600 }).left, 12);

// Sin botón (o botón oculto, rect vacío): arriba a la derecha.
{
  const p = anchorBelow(null, 420, view);
  assert.equal(p.top, FALLBACK_TOP);
  assert.equal(p.left, 1440 - 12 - 420);
  const hidden = anchorBelow({ left: 0, right: 0, top: 0, bottom: 0 }, 420, view);
  assert.deepEqual(hidden, p);
}

// Botón muy abajo: el panel sube para dejar al menos 120 px de alto.
{
  const p = anchorBelow({ left: 1300, right: 1328, top: 860, bottom: 884 }, 420, view);
  assert.ok(p.top + 120 <= 900 - 12);
  assert.ok(p.maxHeight >= 120);
}

console.log("popoverAnchor: OK");
