/**
 * Marcadores de la salida de una pestaña (lógica pura). Los marcadores viven en el búfer de xterm
 * (registerMarker): se desplazan con el texto y desaparecen al limpiar el historial o salir del búfer.
 */

/** Tope de marcas manuales y automáticas por pestaña (las automáticas más antiguas se sueltan primero). */
export const MAX_MANUAL = 200;
export const MAX_AUTO = 500;

/**
 * Línea a la que saltar desde `from` (primera fila visible): "next" es la primera marca estrictamente
 * después; "prev" la última estrictamente antes. Sin marca en esa dirección devuelve null (no da la
 * vuelta: el aviso dice que no hay más). `lines` puede venir sin ordenar y con repetidas.
 */
export function markTarget(lines: readonly number[], from: number, dir: "prev" | "next"): number | null {
  let best: number | null = null;
  for (const l of lines) {
    if (l < 0) continue;
    if (dir === "next" ? l > from && (best === null || l < best) : l < from && (best === null || l > best)) best = l;
  }
  return best;
}

/**
 * Fila de referencia del salto. Normalmente la primera fila visible. Dos casos especiales:
 *  - La vista no se movió desde el último salto (la marca cayó en las últimas filas y xterm no puede
 *    subirla al borde): se sigue desde esa marca, si no el salto se repetiría para siempre.
 *  - "Anterior" con la vista pegada al final y sin salto previo: la referencia es el final del búfer, así
 *    la primera pulsación va a la marca más reciente aunque esté a la vista.
 */
export function jumpFrom(o: {
  dir: "prev" | "next";
  viewportY: number;
  baseY: number;
  length: number;
  last: { line: number; viewportY: number } | null;
}): number {
  if (o.last && o.last.viewportY === o.viewportY) return o.last.line;
  if (o.dir === "prev" && o.viewportY >= o.baseY) return o.length;
  return o.viewportY;
}

/** Posición de una línea entre las marcas ordenadas (1 a n), o 0 si no está. */
export function markIndex(lines: readonly number[], line: number): number {
  return [...new Set(lines)].sort((a, b) => a - b).indexOf(line) + 1;
}

/** Texto corto de una línea para la lista: sin espacios de más y recortado. */
export function markLabel(text: string, max = 100): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return "(línea en blanco)";
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * Qué hacer con una marca nueva en una línea: sin marca ("add"), con una marca manual ("remove": volver a
 * marcar la quita) o, si la que hay es automática, convertirla en manual ("promote"). `auto` no hace nada
 * si ya hay una marca.
 */
export function markAction(existing: "manual" | "auto" | undefined, kind: "manual" | "auto"): "add" | "remove" | "promote" | "skip" {
  if (!existing) return "add";
  if (kind === "auto") return "skip";
  return existing === "manual" ? "remove" : "promote";
}

/** Cuántas automáticas sobran para respetar el tope tras agregar una (se sueltan las más antiguas). */
export const autoOverflow = (autoCount: number, max = MAX_AUTO) => Math.max(0, autoCount - max);
