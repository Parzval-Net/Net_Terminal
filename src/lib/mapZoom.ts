/**
 * Rueda del mapa de Topología. La rueda vertical hace zoom sin distinguir mouse de touchpad (no hay
 * forma fiable: WebKit entrega la rueda en múltiplos de 4,000244 px solo sin aceleración, y Magic Mouse
 * o los mouse con desplazamiento suave dan deltas continuos). Se desplaza con Shift + rueda, con el
 * movimiento horizontal del touchpad o arrastrando el fondo; el pellizco (rueda con Ctrl) hace zoom.
 */
export interface WheelLike {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

export function wheelIntent(e: WheelLike): "zoom" | "pinch" | "pan" {
  if (e.ctrlKey || e.metaKey) return "pinch";
  return e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY) ? "pan" : "zoom";
}

/** Factor de zoom de un evento de rueda: un paso de rueda (100 px) cambia un 16 %; el pellizco es más fino. */
export function wheelFactor(e: Pick<WheelLike, "deltaY" | "deltaMode">, pinch: boolean): number {
  if (pinch) {
    const d = Math.max(-50, Math.min(50, e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY));
    return Math.exp(-d * 0.01);
  }
  const d = Math.max(-300, Math.min(300, e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY));
  return Math.exp(-d * 0.0015);
}

/**
 * Pantallas táctiles: zoom con dos dedos (Pointer Events). Con un dedo se arrastra el mapa como con
 * el mouse. Aquí solo va la geometría; el estado de los punteros activos vive en el componente.
 */
export interface Pt {
  x: number;
  y: number;
}

export function pinchMetrics(a: Pt, b: Pt): { dist: number; mid: Pt } {
  return { dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
}

/**
 * Zoom objetivo de un gesto de dos dedos: el zoom inicial por la razón de distancias, con los topes
 * dados. Una distancia inicial casi nula (dedos juntos) no produce zoom, para no dividir por cero.
 */
export function pinchZoom(base: number, startDist: number, dist: number, min: number, max: number): number {
  if (!(startDist >= 8) || !Number.isFinite(dist)) return base;
  return Math.max(min, Math.min(max, base * (dist / startDist)));
}

/**
 * Legibilidad del mapa. El zoom del mapa es relativo al tamaño de la vista: 1 deja el diagrama
 * completo dentro del contenedor y, en ventanas medianas o con muchos equipos, eso deja el nombre del
 * equipo en 5 a 7 px. "Ajustar a la vista" usa entonces un zoom con piso (el nombre del equipo en
 * NAME_MIN_PX efectivos) y, si el diagrama no cabe, queda desplazable; "Ver todo" es el zoom 1.
 */
/** Tamaño del nombre del equipo y de los textos chicos (puertos, IP) en unidades del dibujo. */
export const NAME_PX = 13;
export const SMALL_PX = 11;
/** Piso de legibilidad del nombre del equipo, en px de pantalla. */
export const NAME_MIN_PX = 11;
/** Tamaño que se busca para los textos chicos (puertos, IP) y el mínimo con el que aún se muestran. */
export const SMALL_MIN_PX = 10;
export const LABELS_MIN_PX = 9.5;
/** Máximo que se agranda el texto para compensar la escala (más ancho que la caja del equipo). */
export const TEXT_SCALE_MAX = 1.2;
export const ZOOM_MIN = 0.4;
export const ZOOM_MAX = 12;

export interface MapBox {
  w: number;
  h: number;
}
export interface Size {
  w: number;
  h: number;
}

/** Escala (px de pantalla por unidad del dibujo) del diagrama completo dentro de la vista, con zoom 1. */
export function fitScale(view: Size, box: MapBox): number {
  if (!(view.w > 0) || !(view.h > 0) || !(box.w > 0) || !(box.h > 0)) return 1;
  return Math.min(view.w / box.w, view.h / box.h);
}

/** Escala efectiva con un zoom dado. */
export function scaleAt(view: Size, box: MapBox, zoom: number): number {
  return fitScale(view, box) * zoom;
}

/**
 * Zoom de "Ajustar a la vista": el diagrama completo (1) si el nombre queda legible; si no, el mínimo
 * con el nombre en NAME_MIN_PX efectivos, sin pasar de ZOOM_MAX. Nunca achica bajo 1.
 */
export function floorZoom(view: Size, box: MapBox, minPx = NAME_MIN_PX): number {
  const k1 = fitScale(view, box);
  const need = minPx / NAME_PX / k1;
  return Math.min(ZOOM_MAX, Math.max(1, need));
}

/**
 * Factor que se aplica al texto del dibujo para compensar la escala: lo justo para que un texto de
 * `px` unidades llegue a `target` px de pantalla, entre 1 y TEXT_SCALE_MAX. Va en pasos de 0,05 hacia
 * arriba (no baja del objetivo) para que el estilo del mapa cambie pocas veces mientras se hace zoom.
 */
function scaleFor(px: number, target: number, k: number): number {
  if (!(k > 0)) return 1;
  const raw = Math.min(TEXT_SCALE_MAX, Math.max(1, target / (px * k)));
  return Math.min(TEXT_SCALE_MAX, Math.ceil(raw * 20 - 1e-6) / 20);
}

/** Factor del nombre del equipo (llega a NAME_MIN_PX efectivos mientras alcance TEXT_SCALE_MAX). */
export function textScale(k: number): number {
  return scaleFor(NAME_PX, NAME_MIN_PX, k);
}

/** Factor de los textos chicos (puertos, IP). */
export function smallScale(k: number): number {
  return scaleFor(SMALL_PX, SMALL_MIN_PX, k);
}

/**
 * Puertos e IP se muestran solo si, ya compensados, quedan en LABELS_MIN_PX o más; bajo ese zoom se
 * ocultan del dibujo y quedan en la ficha al pasar el mouse.
 */
export function labelsVisible(k: number): boolean {
  return SMALL_PX * smallScale(k) * k >= LABELS_MIN_PX;
}

/** Tamaño en px de pantalla del nombre del equipo a la escala `k`. */
export function namePx(k: number): number {
  return NAME_PX * textScale(k) * k;
}

/** Un punto del dibujo (coordenadas del viewBox) en píxeles del contenido desplazable. */
function toContent(view: Size, box: MapBox & { x: number; y: number }, zoom: number, p: { x: number; y: number }) {
  const w = view.w * zoom;
  const h = view.h * zoom;
  const k = Math.min(w / box.w, h / box.h);
  return { x: (w - box.w * k) / 2 + (p.x - box.x) * k, y: (h - box.h * k) / 2 + (p.y - box.y) * k, k, w, h };
}

/**
 * Posición de scroll que deja `p` en el centro de la zona libre de la vista (la vista menos
 * `insetRight` px a la derecha, donde puede ir el panel lateral encima).
 */
export function centerScroll(view: Size, box: MapBox & { x: number; y: number }, zoom: number, p: { x: number; y: number }, insetRight = 0): { left: number; top: number } {
  const c = toContent(view, box, zoom, p);
  const free = Math.max(0, view.w - insetRight);
  const maxL = Math.max(0, c.w + insetRight - view.w);
  const maxT = Math.max(0, c.h - view.h);
  return { left: Math.min(maxL, Math.max(0, c.x - free / 2)), top: Math.min(maxT, Math.max(0, c.y - view.h / 2)) };
}

/**
 * Scroll mínimo para que un equipo (media caja `half` en unidades del dibujo) quede dentro de la zona
 * libre de la vista; null si ya está a la vista. Sirve para que el panel lateral superpuesto no tape
 * al equipo elegido.
 */
export function revealScroll(
  view: Size,
  box: MapBox & { x: number; y: number },
  zoom: number,
  p: { x: number; y: number },
  scroll: { left: number; top: number },
  half: Size,
  insetRight = 0,
  margin = 12,
): { left: number; top: number } | null {
  const c = toContent(view, box, zoom, p);
  const sx = c.x - scroll.left;
  const sy = c.y - scroll.top;
  const hx = half.w * c.k + margin;
  const hy = half.h * c.k + margin;
  const free = view.w - insetRight;
  if (sx - hx >= 0 && sx + hx <= free && sy - hy >= 0 && sy + hy <= view.h) return null;
  return centerScroll(view, box, zoom, p, insetRight);
}
