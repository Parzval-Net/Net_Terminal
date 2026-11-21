// Pruebas del reparto de ancho entre barra de sesiones, terminal y panel derecho:
// `node scripts/tests/panelLayout.test.mjs` (Node 22.15+).
import assert from "node:assert/strict";
const { panelLayout, sidebarFold, minTermFor, PANEL_MIN, NARROW_W, TOOLS_NARROW, sidebarDragMax, panelDragMax, SIDEBAR_MAX, SIDEBAR_MIN } = await import("../../src/lib/panelLayout.ts");

const base = { rootW: 1024, vtabsW: 0, focusMode: false, sidebarOpen: true, sidebarW: 256, panelOpen: true, panelW: 307, minTerm: minTermFor(13) };
const L = (o) => panelLayout({ ...base, ...o });

// ~60 columnas a 13 px: 60 * 13 * 0,602 + 30
assert.equal(minTermFor(13), 500);

// Panel cerrado: nada se oculta ni se superpone.
let r = L({ panelOpen: false });
assert.deepEqual([r.sidebarAutoHidden, r.sidebarShown, r.panelOverlay], [false, true, false]);
assert.equal(r.termWidth, 1024 - 44 - 256);

// 1024 px: ventana angosta con panel: se pliega el árbol primero y el panel se acopla entero.
r = L({});
assert.deepEqual([r.sidebarAutoHidden, r.sidebarShown, r.panelOverlay], [true, false, false]);
assert.equal(r.panelWidth, 307);
assert.equal(r.termWidth, 1024 - 44 - 307);
assert.ok(r.termWidth >= 500, "la terminal conserva ~60 columnas");

// 1440 px: cabe todo con ~80 columnas o más, la barra de sesiones se queda y el panel no se achica.
r = L({ rootW: 1440 });
assert.deepEqual([r.sidebarAutoHidden, r.sidebarShown, r.panelOverlay, r.panelWidth], [false, true, false, 307]);
assert.ok(r.termWidth >= 657);

// ~80 columnas a 13 px: 657 px. A 1280 px: 1236 - 256 - 307 = 673, el árbol se queda; con un panel de 330, 650: se pliega.
assert.equal(L({ rootW: 1280 }).sidebarShown, true);
assert.equal(L({ rootW: 1280, panelW: 330 }).sidebarHiddenBy, "panel");
// El árbol se pliega antes de que el panel se achique: mientras se ve, el panel va a su ancho elegido.
for (const w of [1150, 1200, 1280, 1300, 1440]) {
  const x = L({ rootW: w });
  if (x.sidebarShown) assert.equal(x.panelWidth, 307, `${w}`);
  else assert.equal(x.sidebarHiddenBy, "panel", `${w}`);
}
// Umbral de ventana: en 1100 px o menos se pliega aunque las columnas alcancen (letra chica, árbol y panel angostos).
const small = { minTerm: minTermFor(9), sidebarW: 180, panelW: 260 };
assert.equal(NARROW_W, 1100);
assert.equal(L({ ...small, rootW: 1100 }).sidebarHiddenBy, "panel");
assert.equal(L({ ...small, rootW: 1101 }).sidebarShown, true);
// El umbral de ~80 columnas se puede fijar a mano.
assert.equal(L({ rootW: 1440, comfortTerm: 900 }).sidebarHiddenBy, "panel");

// Pestañas verticales de 220 px a 1024: el panel se achica a ~260 en vez de superponerse.
r = L({ vtabsW: 220, sidebarOpen: false });
assert.equal(r.panelOverlay, false);
assert.equal(r.panelWidth, PANEL_MIN);
assert.ok(r.termWidth >= 500);

// 720 px: ni sin barra cabe el mínimo: el panel se acopla a PANEL_MIN y la terminal se reajusta (bajo 60 columnas, sin superponer).
r = L({ rootW: 720 });
assert.deepEqual([r.sidebarAutoHidden, r.sidebarShown, r.panelOverlay], [true, false, false]);
assert.equal(r.panelWidth, PANEL_MIN);
assert.equal(r.termWidth, 720 - 44 - PANEL_MIN);
assert.ok(r.termWidth < 500 && r.termWidth >= 265);

// Último recurso: la terminal acoplada quedaría bajo ~30 columnas: el panel se superpone, reducido.
r = L({ rootW: 500 });
assert.equal(r.panelOverlay, true);
assert.ok(r.panelWidth >= PANEL_MIN && r.panelWidth < 307);
assert.equal(r.termWidth, 500 - 44, "superpuesto: la terminal ocupa todo el área");

// Sin barra de sesiones elegida por el usuario: nunca se marca como oculta por la app.
r = L({ rootW: 500, sidebarOpen: false });
assert.deepEqual([r.sidebarAutoHidden, r.sidebarShown], [false, false]);

// Sin medir (ancho 0) o en modo foco: no se toca nada.
r = L({ rootW: 0 });
assert.deepEqual([r.sidebarAutoHidden, r.panelOverlay], [false, false]);
r = L({ focusMode: true });
assert.deepEqual([r.sidebarAutoHidden, r.panelOverlay], [false, false]);

// La preferencia no cambia: al cerrar el panel la barra vuelve sola.
assert.equal(L({ panelOpen: false }).sidebarShown, true);

// Herramientas en ventana angosta (1100 px o menos): la barra de sesiones acoplada se oculta sola, sin panel abierto y sin tocar la preferencia.
assert.equal(TOOLS_NARROW, NARROW_W);
r = L({ rootW: 720, panelOpen: false, toolsActive: true });
assert.deepEqual([r.sidebarAutoHidden, r.sidebarShown, r.sidebarHiddenBy], [true, false, "tools"]);
assert.equal(r.termWidth, 720 - 44, "el mapa recibe todo el ancho");
r = L({ rootW: 960, panelOpen: false, toolsActive: true });
assert.equal(r.sidebarHiddenBy, "tools");
r = L({ rootW: 1100, panelOpen: false, toolsActive: true });
assert.equal(r.sidebarHiddenBy, "tools");
// Sobre 1100 px cabe con la barra, y sin Herramientas activa (terminal) no se oculta por ese motivo.
r = L({ rootW: 1101, panelOpen: false, toolsActive: true });
assert.deepEqual([r.sidebarAutoHidden, r.sidebarShown, r.sidebarHiddenBy], [false, true, null]);
r = L({ rootW: 720, panelOpen: false, toolsActive: false });
assert.deepEqual([r.sidebarAutoHidden, r.sidebarShown, r.sidebarHiddenBy], [false, true, null]);
// Herramientas sobre 1100 px pero con un árbol muy ancho: lo que queda baja de ~80 columnas y se pliega.
assert.equal(L({ rootW: 1120, sidebarW: 480, panelOpen: false, toolsActive: true }).sidebarHiddenBy, "tools");
// Si el usuario no la tenía acoplada, no se marca como oculta por la app; modo foco o sin medir: nada.
assert.equal(L({ rootW: 720, panelOpen: false, toolsActive: true, sidebarOpen: false }).sidebarAutoHidden, false);
assert.equal(L({ rootW: 720, panelOpen: false, toolsActive: true, focusMode: true }).sidebarAutoHidden, false);
assert.equal(L({ rootW: 0, panelOpen: false, toolsActive: true }).sidebarAutoHidden, false);
// Con un panel abierto el motivo declarado sigue siendo Herramientas si ya la ocultaba por eso.
assert.equal(L({ rootW: 720, toolsActive: true }).sidebarHiddenBy, "tools");
assert.equal(L({ rootW: 1024 }).sidebarHiddenBy, "panel");
// Herramientas con espacio y un panel que no cabe junto al árbol: el motivo es el panel.
assert.equal(L({ rootW: 1280, panelW: 400, toolsActive: true }).sidebarHiddenBy, "panel");
// La preferencia no cambia: fuera de Herramientas la barra vuelve sola.
assert.equal(L({ rootW: 720, panelOpen: false, toolsActive: false }).sidebarShown, true);
// sidebarFold es la misma regla que usa el reparto.
for (const o of [{}, { rootW: 1440 }, { rootW: 720, toolsActive: true, panelOpen: false }, { rootW: 1300, sidebarOpen: false }])
  assert.equal(sidebarFold({ ...base, ...o }), L(o).sidebarHiddenBy, JSON.stringify(o));

// Límites del arrastre: al soltar dentro de ellos el reparto deja todo donde se veía.
// 1440 px con panel: la barra llega hasta donde quedan ~80 columnas junto al panel (1396 - 657 - 307 = 432).
assert.equal(sidebarDragMax({ ...base, rootW: 1440 }), 432);
assert.equal(L({ rootW: 1440, sidebarW: 432 }).sidebarShown, true);
assert.equal(L({ rootW: 1440, sidebarW: 433 }).sidebarShown, false);
// Herramientas sin panel a 1200 px: hasta 1156 - 657 = 499, tope 480.
assert.equal(sidebarDragMax({ ...base, rootW: 1200, panelOpen: false, toolsActive: true }), SIDEBAR_MAX);
assert.equal(sidebarDragMax({ ...base, rootW: 1150, panelOpen: false, toolsActive: true }), 1106 - 657);
// Sin panel ni Herramientas, con la barra flotante o en ventana ancha: el máximo de siempre.
assert.equal(sidebarDragMax({ ...base, rootW: 1280, panelOpen: false }), SIDEBAR_MAX);
assert.equal(sidebarDragMax({ ...base, rootW: 1024, sidebarOpen: false }), SIDEBAR_MAX);
assert.equal(sidebarDragMax({ ...base, rootW: 1920 }), SIDEBAR_MAX);
// Nunca bajo el ancho actual (no se achica sola al tomar el borde) ni bajo el mínimo.
assert.ok(sidebarDragMax({ ...base, rootW: 1440, sidebarW: 300 }) >= 300);
assert.ok(sidebarDragMax({ ...base, rootW: 1440, panelW: 600, sidebarW: 180, comfortTerm: 100 }) >= SIDEBAR_MIN);
// Panel: el máximo es lo que el reparto dibujaría; con el árbol a la vista, hasta donde el árbol aún cabe.
for (const o of [{ rootW: 1440 }, { rootW: 1280 }, { rootW: 1920 }, { rootW: 1024 }, { rootW: 800, sidebarOpen: false }, { rootW: 720 }]) {
  const max = panelDragMax({ ...base, ...o });
  const at = L({ ...o, panelW: max });
  assert.equal(at.panelWidth, max, JSON.stringify(o));
  // Soltar en el máximo no pliega el árbol que se veía.
  assert.equal(at.sidebarShown, L(o).sidebarShown, JSON.stringify(o));
}
// 1440 px con el árbol: el panel crece hasta 1396 - 256 - 657 = 483.
assert.equal(panelDragMax({ ...base, rootW: 1440 }), 483);
// Árbol plegado (1024 px): el panel puede crecer hasta dejar ~60 columnas.
assert.equal(panelDragMax({ ...base, rootW: 1024 }), 1024 - 44 - 500);

console.log("panelLayout: ok");
