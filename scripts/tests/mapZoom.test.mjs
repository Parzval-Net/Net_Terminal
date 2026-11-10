// Pruebas de la legibilidad del mapa de Topología (src/lib/mapZoom.ts): zoom de "Ajustar a la vista"
// con piso, contraescala del texto, umbral de las etiquetas chicas y centrado con el panel encima.
import assert from "node:assert/strict";

const Z = await import("../../src/lib/mapZoom.ts");

const close = (a, b, eps = 0.01, msg = "") => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} ≉ ${b}`);

// ---------- Escala y zoom de ajuste ----------

// Diagrama de 1000 x 800 unidades en una vista de 514 x 429 px (Topología a 1024 x 768 antes del cambio).
const box = { x: 0, y: 0, w: 1000, h: 800 };
const view = { w: 514, h: 429 };
close(Z.fitScale(view, box), 0.514, 0.001, "zoom 1 = diagrama completo");
close(Z.scaleAt(view, box, 2), 1.028, 0.001);
assert.equal(Z.fitScale({ w: 0, h: 0 }, box), 1, "vista sin medir: escala neutra");
assert.equal(Z.fitScale(view, { x: 0, y: 0, w: 0, h: 0 }), 1, "diagrama vacío");

// Con el nombre en 13 unidades, 11 px efectivos piden una escala de 0,846.
const z = Z.floorZoom(view, box);
close(Z.scaleAt(view, box, z) * Z.NAME_PX, Z.NAME_MIN_PX, 0.01, "el ajuste deja el nombre en 11 px");
assert.ok(z > 1, "no cabe con legibilidad: el ajuste acerca");
close(Z.namePx(Z.scaleAt(view, box, z)), Z.NAME_MIN_PX, 0.01);

// Si el diagrama ya se lee completo, el ajuste es el diagrama completo (nunca achica bajo 1).
assert.equal(Z.floorZoom({ w: 1090, h: 709 }, { x: 0, y: 0, w: 700, h: 500 }), 1);
assert.equal(Z.floorZoom({ w: 1090, h: 709 }, { x: 0, y: 0, w: 1100, h: 700 }), 1, "escala 0,99: ya pasa de 11 px");
assert.equal(Z.floorZoom(view, { x: 0, y: 0, w: 100, h: 80 }), 1, "diagrama chico");

// Muchos equipos: el piso pide más zoom que el tope y se queda en el tope.
assert.equal(Z.floorZoom({ w: 400, h: 300 }, { x: 0, y: 0, w: 60000, h: 40000 }), Z.ZOOM_MAX);
assert.ok(Z.ZOOM_MIN < 1 && Z.ZOOM_MAX > 4);

// Ver todo (zoom 1) puede dejar el nombre bajo el piso; el ajuste no.
assert.ok(Z.scaleAt(view, box, 1) * Z.NAME_PX < Z.NAME_MIN_PX);

// ---------- Contraescala del texto ----------

assert.equal(Z.textScale(1), 1, "con zoom suficiente el texto no cambia");
assert.equal(Z.textScale(Z.NAME_MIN_PX / Z.NAME_PX), 1, "justo en el piso");
assert.equal(Z.textScale(2), 1, "nunca achica");
assert.equal(Z.textScale(0.75), 1.15, "compensa lo justo, en pasos de 0,05 hacia arriba");
assert.ok(Z.namePx(0.75) >= Z.NAME_MIN_PX, "el nombre llega al piso mientras alcance la contraescala");
assert.equal(Z.textScale(0.3), Z.TEXT_SCALE_MAX, "con tope");
assert.equal(Z.textScale(0), 1);
assert.equal(Z.textScale(NaN), 1);
for (let k = 0.2; k < 2; k += 0.013) {
  const s = Z.textScale(k);
  assert.ok(s >= 1 && s <= Z.TEXT_SCALE_MAX, `rango ${k}`);
  assert.ok(Math.abs(s * 20 - Math.round(s * 20)) < 1e-9, `paso de 0,05 (${k})`);
  assert.ok(Z.textScale(k + 0.05) <= s + 1e-9, "monótona: más zoom, menos compensación");
  const sm = Z.smallScale(k);
  assert.ok(sm >= 1 && sm <= Z.TEXT_SCALE_MAX);
}

// ---------- Umbral de puertos e IP ----------

assert.equal(Z.labelsVisible(1), true);
assert.equal(Z.labelsVisible(0.846), true, "en el ajuste con piso se ven");
assert.equal(Z.labelsVisible(0.443), false, "con el diagrama completo a 1024 x 768 no se leen: se ocultan");
assert.equal(Z.labelsVisible(0.294), false);
assert.equal(Z.labelsVisible(0), false);
// En el umbral, ya compensados, quedan en LABELS_MIN_PX o más; un poco abajo se ocultan.
let kOn = 1;
while (Z.labelsVisible(kOn - 0.005) && kOn > 0.1) kOn -= 0.005;
close(Z.SMALL_PX * Z.smallScale(kOn) * kOn, Z.LABELS_MIN_PX, 0.6, "umbral");
assert.ok(Z.labelsVisible(kOn) && !Z.labelsVisible(kOn - 0.01));

// Piso de 11 px: mientras puertos e IP se muestran, nunca quedan bajo 11 px efectivos.
for (let k = 0.1; k < 4; k += 0.007) {
  if (Z.labelsVisible(k)) assert.ok(Z.SMALL_PX * Z.smallScale(k) * k >= 11 - 1e-6, `puertos bajo 11 px con k=${k}`);
}
assert.equal(Z.SMALL_MIN_PX, 11);

// ---------- Centrado y desplazamiento ----------

const b2 = { x: -100, y: -50, w: 2000, h: 1000 };
const v2 = { w: 600, h: 400 };
const zz = 3;
const sc = Z.scaleAt(v2, b2, zz);
// Centro del diagrama con zoom 3: queda en el centro de la vista.
const mid = { x: b2.x + b2.w / 2, y: b2.y + b2.h / 2 };
const c0 = Z.centerScroll(v2, b2, zz, mid);
close(c0.left, (v2.w * zz) / 2 - v2.w / 2, 0.5, "centro horizontal");
close(c0.top, (v2.h * zz) / 2 - v2.h / 2, 0.5, "centro vertical");
// Un punto de la esquina: no se pasa de los bordes del contenido.
const corner = Z.centerScroll(v2, b2, zz, { x: b2.x, y: b2.y });
assert.deepEqual(corner, { left: 0, top: 0 });
const far = Z.centerScroll(v2, b2, zz, { x: b2.x + b2.w, y: b2.y + b2.h });
close(far.left, v2.w * zz - v2.w, 0.5);
close(far.top, v2.h * zz - v2.h, 0.5);
assert.ok(sc > 0);
// Con zoom 1 el diagrama cabe: no hay a dónde desplazarse.
assert.deepEqual(Z.centerScroll(v2, b2, 1, mid), { left: 0, top: 0 });

// Panel superpuesto de 328 px a la derecha: el punto queda en el centro de la zona libre.
const inset = 328;
const withPanel = Z.centerScroll(v2, b2, zz, mid, inset);
close(withPanel.left, c0.left + inset / 2, 0.5, "centrado a la izquierda del panel");
// Con zoom 1 hay margen de scroll solo por el panel (el espaciador del mapa).
const tight = Z.centerScroll(v2, b2, 1, { x: b2.x + b2.w, y: mid.y }, inset);
assert.ok(tight.left > 0 && tight.left <= inset, "se puede desplazar hasta sacar el equipo de debajo del panel");

// Revelar: un equipo que ya se ve no mueve el mapa; uno bajo el panel o fuera de la vista sí.
const half = { w: 85, h: 27 };
assert.equal(Z.revealScroll(v2, b2, zz, mid, c0, half, 0), null, "ya está a la vista");
const under = Z.revealScroll(v2, b2, zz, mid, { left: c0.left - 250, top: c0.top }, half, inset);
assert.ok(under, "quedaba bajo el panel");
close(under.left, withPanel.left, 0.5);
assert.ok(Z.revealScroll(v2, b2, zz, { x: b2.x + 10, y: b2.y + 10 }, c0, half, 0), "fuera de la vista");

console.log("mapZoom OK");
