import type { TopoVendor } from "../../../lib/topology";

export const W = 170;
export const H = 54;
/** Nodo virtual "L2 desconocido" (puertos activos sin vecino). */
export const L2W = 128;
export const L2H = 38;
/** Sobre esta cantidad de equipos con puertos sin vecino, el nodo L2 se dibuja solo para el seleccionado. */
export const MAX_L2_NODES = 120;
/** Separación entre enlaces paralelos del mismo par de equipos. */
export const PARALLEL_GAP = 26;
/** Máximo de interfaces que se consultan en detalle (Junos) para no saturar la sesión. */
export const MAX_DETAIL = 32;
export const MAX_SNAPSHOTS = 20;
export const VENDORS: { id: TopoVendor; label: string }[] = [
  { id: "cisco", label: "Cisco (CDP + LLDP)" },
  { id: "huawei", label: "Huawei (LLDP)" },
  { id: "juniper", label: "Juniper (LLDP)" },
  { id: "fortinet", label: "Fortinet (LLDP)" },
];
/** Máximo de enlaces animados a la vez (los más cargados): medido en una topología de 400 equipos. */
export const FLOW_MAX = 60;
