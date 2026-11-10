// Pruebas del reparto de ancho entre barra de sesiones, terminal y panel derecho:
// `node scripts/tests/panelLayout.test.mjs` (Node 22.15+).
import assert from "node:assert/strict";
const { panelLayout, minTermFor, PANEL_MIN, TOOLS_NARROW } = await import("../../src/lib/panelLayout.ts");

const base = { rootW: 1024, vtabsW: 0, focusMode: false, sidebarOpen: true, sidebarW: 256, panelOpen: true, panelW: 307, minTerm: minTermFor(13) };
const L = (o) => panelLayout({ ...base, ...o });

// ~60 columnas a 13 px: 60 * 13 * 0,602 + 30
assert.equal(minTermFor(13), 500);

// Panel cerrado: nada se oculta ni se superpone.
let r = L({ panelOpen: false });
assert.deepEqual([r.sidebarAutoHidden, r.sidebarShown, r.panelOverlay], [false, true, false]);
assert.equal(r.termWidth, 1024 - 44 - 256);

// 1024 px: con sesiones no cabe (724 - 307 = 417 < 500): se oculta la barra y el panel se acopla entero.
r = L({});
assert.deepEqual([r.sidebarAutoHidden, r.sidebarShown, r.panelOverlay], [true, false, false]);
assert.equal(r.panelWidth, 307);
assert.equal(r.termWidth, 1024 - 44 - 307);
assert.ok(r.termWidth >= 500, "la terminal conserva ~60 columnas");

// 1280 px: cabe todo, la barra de sesiones se queda.
r = L({ rootW: 1280 });
assert.deepEqual([r.sidebarAutoHidden, r.sidebarShown, r.panelOverlay], [false, true, false]);
assert.ok(r.termWidth >= 500);

// Entre medio: el panel se achica (hasta 260) antes de ocultar la barra o superponerse.
r = L({ rootW: 1100 });
assert.equal(r.sidebarAutoHidden, false);
assert.ok(r.panelWidth >= PANEL_MIN && r.panelWidth <= 307);
assert.ok(r.termWidth >= 500);

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

// Herramientas en ventana angosta (< 900 px): la barra de sesiones acoplada se oculta sola, sin panel abierto y sin tocar la preferencia.
assert.equal(TOOLS_NARROW, 900);
r = L({ rootW: 720, panelOpen: false, toolsActive: true });
assert.deepEqual([r.sidebarAutoHidden, r.sidebarShown, r.sidebarHiddenBy], [true, false, "tools"]);
assert.equal(r.termWidth, 720 - 44, "el mapa recibe todo el ancho");
r = L({ rootW: 899, panelOpen: false, toolsActive: true });
assert.equal(r.sidebarHiddenBy, "tools");
// Desde 900 px cabe con la barra, y sin Herramientas activa (terminal) no se oculta por ese motivo.
r = L({ rootW: 900, panelOpen: false, toolsActive: true });
assert.deepEqual([r.sidebarAutoHidden, r.sidebarShown, r.sidebarHiddenBy], [false, true, null]);
r = L({ rootW: 720, panelOpen: false, toolsActive: false });
assert.deepEqual([r.sidebarAutoHidden, r.sidebarShown, r.sidebarHiddenBy], [false, true, null]);
// Si el usuario no la tenía acoplada, no se marca como oculta por la app; modo foco o sin medir: nada.
assert.equal(L({ rootW: 720, panelOpen: false, toolsActive: true, sidebarOpen: false }).sidebarAutoHidden, false);
assert.equal(L({ rootW: 720, panelOpen: false, toolsActive: true, focusMode: true }).sidebarAutoHidden, false);
assert.equal(L({ rootW: 0, panelOpen: false, toolsActive: true }).sidebarAutoHidden, false);
// Con un panel abierto el motivo declarado sigue siendo Herramientas si ya la ocultaba por eso.
assert.equal(L({ rootW: 720, toolsActive: true }).sidebarHiddenBy, "tools");
assert.equal(L({ rootW: 1024 }).sidebarHiddenBy, "panel");
// La preferencia no cambia: fuera de Herramientas la barra vuelve sola.
assert.equal(L({ rootW: 720, panelOpen: false, toolsActive: false }).sidebarShown, true);

console.log("panelLayout: ok");
