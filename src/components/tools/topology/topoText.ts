import { TopoNode, fmtBps, portOf } from "../../../lib/topology";

/** Resumen de los vecinos que quedaron fuera del alcance (los primeros tres, con su motivo). */
export const scopeNote = (skipped: string[]) =>
  skipped.length ? `${skipped.length} fuera de alcance: ${skipped.slice(0, 3).join(", ")}${skipped.length > 3 ? "…" : ""}` : "";

/** Estado de un puerto para el tooltip del enlace (estado, velocidad, grupo y descripción). */
export const portLine = (n: TopoNode | undefined, port: string) => {
  const p = port ? portOf(n, port) : undefined;
  return p ? [p.status, p.speed, p.group, p.desc].filter(Boolean).join(" · ") : "";
};
/** Segunda línea del equipo en el mapa: IP de gestión o cómo se conoce. */
export const nodeSub = (n: TopoNode, ghost: boolean) =>
  ghost
    ? "ya no aparece"
    : n.ip && n.ip !== n.name
      ? n.ip
      : n.addrOnly
        ? "visto por ruteo"
        : n.manual
          ? "manual"
          : n.explored
            ? "explorado"
            : "sin IP de gestión";

/** Bits por segundo con coma decimal ("9,7 Gb/s"). */
export const bpsEs = (bps: number | null | undefined) => fmtBps(bps).replace(".", ",");
