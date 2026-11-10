import type { MenuItem } from "../../tabMenu";
import type { HopJob, TabRoute } from "../../../lib/hopTab";
import type { LinkTraffic, TopoLink, TopoNode, linkGeometry } from "../../../lib/topology";
import type { UnknownL2 } from "../../../lib/topoInsights";
import type { PILL_TONE } from "./topoStyle";

export type Menu = { x: number; y: number; items: MenuItem[] };

/** Pregunta de llave de un salto, de a una (dos saltos que la piden a la vez no se pisan). */
export type KeyAsk = { tabId: string; conn: string; cmd: string; title: string; message: string };

/** Salto en curso en una pestaña (una pestaña, un salto). */
export interface HopRun {
  tabId: string;
  job: HopJob;
  /** Ruta completa que se reproduce: la sesión del pivote y todos los saltos. */
  route: TabRoute;
  /** Pasos de la ruta que la pestaña ya tenía recorridos (saltar en una pestaña existente). */
  base: number;
  /** La sesión del pivote tiene contraseña guardada: la credencial del pivote se puede escribir. */
  pivotCred: boolean;
  openedAt: number;
  inplace: boolean;
}

export type ManualForm =
  | { kind: "node"; editId?: string; name: string; ip: string; platform: string }
  | { kind: "link"; edit?: TopoLink; a: string; aPort: string; b: string; bPort: string };

export type ConfirmReq = { title: string; message: string; label: string; danger?: boolean; defaultCancel?: boolean; action: () => void };

/** Geometría de un enlace más su clave (linkKey), calculada una vez por enlace y no en cada redibujo. */
export type Geo = ReturnType<typeof linkGeometry>[number] & { k: string };

export interface TrafficRow {
  key: string;
  lt: LinkTraffic;
}

export type TrafficLevelName = "normal" | "high" | "saturated";

/** Qué enlaces muestra la ficha y dónde (coordenadas de pantalla del puntero, o del enlace enfocado). */
export interface TipState {
  keys: string[];
  x: number;
  y: number;
  focus: boolean;
}

export type L2Geo = { id: string; x: number; y: number; from: TopoNode; info: UnknownL2 };

/** Píldora sobre un enlace (o el centro de un par de paralelos): % de uso o "caído". */
export interface Pill {
  key: string;
  x: number;
  y: number;
  text: string;
  /** Color de la vista detallada (continuo por utilización). */
  color: string;
  /** Estado resaltado de la vista por excepción: alto, saturado o caído. */
  tone?: keyof typeof PILL_TONE;
  dim: boolean;
  keys: string[];
}

/** Marcador "!" de un problema de interfaz, en el extremo del puerto afectado. */
export interface Mark {
  key: string;
  k: string;
  x: number;
  y: number;
  /** Equipo del extremo afectado (al hacer clic se elige y se abre el panel). */
  node: string;
  dim: boolean;
}
