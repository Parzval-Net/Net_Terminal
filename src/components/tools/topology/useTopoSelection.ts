import { useMemo, useState } from "react";
import { Topology, linkKey, pathToText, shortestPath } from "../../../lib/topology";

/** Equipo elegido en el mapa y ruta más corta entre dos equipos (Desde aquí / Hasta aquí). */
export function useTopoSelection(topo: Topology) {
  const [selected, setSelected] = useState<string | null>(null);
  const [path, setPath] = useState<{ from?: string; to?: string }>({});
  const route = useMemo(
    () => (path.from && path.to ? shortestPath(topo, path.from, path.to) : null),
    [path, topo],
  );
  const routeKeys = useMemo(() => new Set(route?.links.map(linkKey)), [route]);
  const routeNodes = useMemo(() => new Set(route?.nodes), [route]);
  const pathText = route ? pathToText(topo, route) : "";
  return { selected, setSelected, path, setPath, route, routeKeys, routeNodes, pathText };
}
