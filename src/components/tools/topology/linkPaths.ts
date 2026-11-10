import type { CSSProperties } from "react";
import { Pt, flowTiming } from "../../../lib/topology";

/** Duración y pasos del carril animado (ver flowTiming). */
export function flowStyle(bps: number | null, speed: number | undefined): CSSProperties {
  const { dur, steps } = flowTiming(bps, speed);
  return { animationDuration: `${dur}s`, animationTimingFunction: `steps(${steps})` };
}

/** Desplaza una curva cuadrática en paralelo (un carril por sentido). */
export function lanePath(a: Pt, c: Pt, b: Pt, off: number): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * off;
  const ny = (dx / len) * off;
  return `M ${a.x + nx} ${a.y + ny} Q ${c.x + nx} ${c.y + ny} ${b.x + nx} ${b.y + ny}`;
}

/** Punta de flecha sobre la curva en t, hacia B (forward) o hacia A, en su carril. */
export function arrowHead(a: Pt, c: Pt, b: Pt, t: number, forward: boolean, off: number): string {
  const px = (1 - t) ** 2 * a.x + 2 * (1 - t) * t * c.x + t ** 2 * b.x;
  const py = (1 - t) ** 2 * a.y + 2 * (1 - t) * t * c.y + t ** 2 * b.y;
  let tx = 2 * (1 - t) * (c.x - a.x) + 2 * t * (b.x - c.x);
  let ty = 2 * (1 - t) * (c.y - a.y) + 2 * t * (b.y - c.y);
  const tl = Math.hypot(tx, ty) || 1;
  tx /= tl;
  ty /= tl;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const cx = px + (-dy / len) * off;
  const cy = py + (dx / len) * off;
  const s = forward ? 1 : -1;
  const [ux, uy] = [tx * s, ty * s];
  const [nx, ny] = [-uy, ux];
  const pts = [
    [cx + ux * 6, cy + uy * 6],
    [cx - ux * 4 + nx * 4, cy - uy * 4 + ny * 4],
    [cx - ux * 4 - nx * 4, cy - uy * 4 - ny * 4],
  ];
  return pts.map((p) => p.map((v) => v.toFixed(1)).join(",")).join(" ");
}
