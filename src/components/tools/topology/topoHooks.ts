import { useEffect, useRef, useState } from "react";
import type { TopoNode } from "../../../lib/topology";

/** El sistema pide reducir movimiento (se respeta aunque "Animación" esté activa). */
export const reducedQuery = () =>
  typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => !!reducedQuery()?.matches);
  // Una sola suscripción: la topología se vuelve a dibujar con cada muestra del monitoreo.
  useEffect(() => {
    const q = reducedQuery();
    if (!q) return;
    const on = () => setReduced(q.matches);
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** Mismo equipo salvo la posición (los objetos anidados se conservan al mover un nodo). */
export function samePayload(a: TopoNode, b: TopoNode): boolean {
  if (a === b) return true;
  for (const k in b) if (k !== "x" && k !== "y" && a[k as keyof TopoNode] !== b[k as keyof TopoNode]) return false;
  for (const k in a) if (!(k in b)) return false;
  return true;
}

/**
 * Los nodos como datos: devuelve el arreglo anterior mientras solo cambien posiciones, para que
 * lo que no depende de x/y no se recalcule en cada cuadro de un arrastre.
 */
export function useNodeData(nodes: TopoNode[]): TopoNode[] {
  const ref = useRef(nodes);
  const prev = ref.current;
  if (prev !== nodes && !(prev.length === nodes.length && prev.every((p, i) => samePayload(p, nodes[i])))) ref.current = nodes;
  return ref.current;
}

/** Hora actual refrescada cada `ms` mientras `on`: el "hace N s" del encabezado envejece sin lecturas nuevas. */
export function useNow(ms: number, on: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms, on]);
  return now;
}
