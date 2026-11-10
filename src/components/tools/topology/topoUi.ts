import { TRAFFIC_INTERVALS, TrafficInterval } from "../useTopoTraffic";
import { DismissedMap, Topology, parseDismissed } from "../../../lib/topology";
import { NO_SCOPE, TopoScope } from "../../../lib/topoInsights";

/** Secciones del panel lateral. */
export type PanelSection = "fuentes" | "alcance" | "filtros" | "atencion" | "trafico" | "sugerencias" | "detalle" | "ruta" | "manual" | "snapshots" | "leyenda";
export type DiscoveryMode = "cli" | "snmp";

/**
 * Estado visual de la herramienta (panel, secciones, modo de descubrimiento, intervalo y animación
 * del tráfico). Es comodidad de interfaz: no va a Ajustes. El tráfico y la lectura por consola se
 * recuerdan (parten apagados la primera vez): sin eso había que activarlos en cada apertura.
 */
export interface TopoUi {
  panel: boolean;
  sec: Partial<Record<PanelSection, boolean>>;
  mode: DiscoveryMode;
  snmpProfile: string;
  interval: TrafficInterval;
  anim: boolean;
  /** Tráfico en enlaces encendido (se recuerda entre aperturas). */
  traffic: boolean;
  /** Lectura del tráfico también por consola (envía comandos de consulta a la sesión conectada). */
  cli: boolean;
  /** Puntas de flecha por sentido sobre cada enlace con tráfico. */
  arrows: boolean;
  /** Etiqueta de tasas (↑ ↓ y %) junto a cada enlace con tráfico. */
  rates: boolean;
  /** Color y grosor del enlace según su utilización (verde, amarillo, rojo). Solo en la vista detallada. */
  color: boolean;
  /**
   * Vista detallada (para expertos): colores continuos, rótulo en cada enlace con tráfico, flechas y
   * animación. Apagada, el mapa es por excepción: lo normal queda gris y solo se resalta lo alto,
   * saturado o caído.
   */
  detail: boolean;
  /** Puertos activos sin vecino dibujados como "L2 desconocido" junto a su equipo. */
  l2: boolean;
  /** Alcance del descubrimiento: qué vecinos nuevos se incorporan. */
  scope: TopoScope;
  /** Equipos que el usuario marcó (o que ya se alcanzaron por un salto) como no accesibles directo desde este PC. */
  pivot: Record<string, true>;
}
export const UI_KEY = "topoUi";
export const UI_DEFAULT: TopoUi = {
  panel: true,
  sec: { fuentes: false, atencion: true, trafico: false, sugerencias: false, detalle: true, ruta: true, manual: false, snapshots: false, leyenda: false },
  mode: "cli",
  snmpProfile: "",
  interval: 30,
  anim: false,
  traffic: false,
  cli: false,
  arrows: true,
  rates: true,
  color: true,
  detail: false,
  l2: true,
  scope: NO_SCOPE,
  pivot: {},
};

/** Versión de las preferencias de estilo del tráfico guardadas en topoUi. */
export const UI_VERSION = 4;

export function loadUi(): TopoUi {
  try {
    const v = JSON.parse(localStorage.getItem(UI_KEY) ?? "null") as Partial<TopoUi> | null;
    // Ventana angosta: el panel lateral se abre encima del diagrama y lo tapa; parte cerrado.
    const roomy = typeof window === "undefined" || window.innerWidth >= 1100;
    if (!v || typeof v !== "object") return { ...UI_DEFAULT, panel: roomy };
    const sec = v.sec && typeof v.sec === "object" ? v.sec : {};
    const ver = typeof (v as { ver?: unknown }).ver === "number" ? (v as { ver: number }).ver : 0;
    return {
      panel: v.panel !== false && roomy,
      sec: { ...UI_DEFAULT.sec, ...sec },
      mode: v.mode === "snmp" ? "snmp" : "cli",
      snmpProfile: typeof v.snmpProfile === "string" ? v.snmpProfile.slice(0, 64) : "",
      interval: TRAFFIC_INTERVALS.includes(v.interval as TrafficInterval) ? (v.interval as TrafficInterval) : 30,
      // Lo guardado antes de la versión 4 (flechas, tasas, color y animación) era de diseños
      // anteriores: se parte del estilo vigente (vista por excepción; el estilo previo es "Vista detallada").
      anim: ver >= UI_VERSION && v.anim === true,
      traffic: v.traffic === true,
      // La lectura por consola envía comandos sola: se confirma en cada apertura de la app (no se recuerda).
      cli: false,
      arrows: ver < UI_VERSION || v.arrows !== false,
      rates: ver < UI_VERSION || v.rates !== false,
      color: ver < UI_VERSION || v.color !== false,
      detail: v.detail === true,
      l2: v.l2 !== false,
      scope: {
        skipEndpoints: v.scope?.skipEndpoints === true,
        cidrs: typeof v.scope?.cidrs === "string" ? v.scope.cidrs.slice(0, 500) : "",
        maxDepth: Number.isInteger(v.scope?.maxDepth) && v.scope!.maxDepth > 0 && v.scope!.maxDepth <= 20 ? v.scope!.maxDepth : 0,
      },
      // Solo ids de equipo (texto corto): lo guardado en el navegador es editable.
      pivot: Object.fromEntries(
        Object.keys(v.pivot && typeof v.pivot === "object" ? v.pivot : {})
          .filter((k) => k.length <= 128)
          .slice(0, 500)
          .map((k) => [k, true as const]),
      ),
    };
  } catch {
    return UI_DEFAULT;
  }
}

/** Sugerencias descartadas por equipo: comodidad de este navegador, con tope. */
export const DISMISSED_KEY = "topoDismissed";
export function loadDismissed(): DismissedMap {
  try {
    return parseDismissed(JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "null"));
  } catch {
    return {};
  }
}

export function saveUi(ui: TopoUi) {
  try {
    localStorage.setItem(UI_KEY, JSON.stringify({ ...ui, ver: UI_VERSION }));
  } catch {
    // Almacenamiento bloqueado o lleno: la herramienta sigue funcionando sin recordar el estado.
  }
}

/** Topología guardada por versiones anteriores en el almacenamiento del navegador. */
export function legacyTopo(): Topology | null {
  try {
    const t = JSON.parse(localStorage.getItem("topology") ?? "null") as Topology | null;
    return t?.nodes?.length ? t : null;
  } catch {
    return null;
  }
}
