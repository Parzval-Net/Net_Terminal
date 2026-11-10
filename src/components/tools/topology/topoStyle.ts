import type { LinkLevel } from "../../../lib/topoTraffic";
import type { UtilLevel } from "../../../lib/topology";
import type { TrafficLevelName } from "./topoTypes";

export const CONFIDENCE_COLOR = { alta: "var(--ok)", media: "var(--warn)", baja: "var(--muted)" } as const;

/** Color del tema por nivel de utilización (sin velocidad conocida: gris violeta, distinto del azul de selección y ruta). */
export const UTIL_VAR: Record<UtilLevel, string> = { ok: "var(--ok)", warn: "var(--warn)", crit: "var(--danger)", none: "var(--util-unknown)" };

/** Color del tema por estado (normal: gris). El rojo es solo de saturado; caído va en gris oscuro punteado. */
export const LEVEL_COLOR: Record<TrafficLevelName, string> = { normal: "var(--muted)", high: "var(--warn)", saturated: "var(--danger)" };

/** Tono de las píldoras: fondo tenue del color, borde del color y texto del mismo tono más oscuro. */
export const PILL_TONE: Record<"high" | "saturated" | "down", string> = { high: "var(--warn)", saturated: "var(--danger)", down: "var(--muted)" };
export const pillStyle = (tone: keyof typeof PILL_TONE): React.CSSProperties => ({
  fill: `color-mix(in srgb, ${PILL_TONE[tone]} 16%, var(--panel))`,
  stroke: PILL_TONE[tone],
});
export const pillTextStyle = (tone: keyof typeof PILL_TONE): React.CSSProperties => ({
  fill: `color-mix(in srgb, ${PILL_TONE[tone]} 40%, var(--text))`,
  fontVariantNumeric: "tabular-nums",
});

export const LEVEL_LABEL: Record<LinkLevel, string> = { normal: "Normal", high: "Alto", saturated: "Saturado", down: "Caído" };

/**
 * Textos del dibujo con contraescala: el tamaño sale de la variable --ts que el SVG fija según el
 * zoom (mapZoom.textScale y smallScale), así el nombre del equipo se mantiene legible al achicar sin rehacer cada
 * equipo. Los textos chicos (puertos, IP) además se ocultan con --sm bajo el umbral de zoom. La
 * exportación SVG y draw.io no pasa por aquí.
 */
export const scaledText = (px: number): React.CSSProperties => ({ fontSize: `calc(${px}px * var(--ts, 1))` });
export const smallText = (px: number): React.CSSProperties => ({ fontSize: `calc(${px}px * var(--ss, 1))`, display: "var(--sm, inline)" as React.CSSProperties["display"] });
