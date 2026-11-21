/**
 * Reparto del ancho entre la barra de sesiones, la terminal y el panel derecho (Comandos o Notas).
 * Regla única para la barra de sesiones (árbol): con un panel derecho abierto o con Herramientas a la
 * vista, si falta ancho se pliega primero el árbol, que queda a un clic como barra superpuesta. Falta
 * ancho cuando la ventana mide `NARROW_W` o menos, o cuando el área de la terminal (o de Herramientas)
 * quedaría bajo ~80 columnas (`comfortTerm`) con el árbol y el panel a su ancho elegido. La preferencia
 * del usuario no cambia: al cerrar el panel, volver a una terminal o ensanchar la ventana, vuelve sola.
 * Después, con el árbol plegado:
 *  1) el panel se acopla y la terminal se reajusta (el panel se achica hasta PANEL_MIN antes que superponerse);
 *  2) si ni así cabe `minTerm` (~60 columnas), el panel se acopla a PANEL_MIN y la terminal se reajusta al espacio restante;
 *  3) solo si la terminal quedaría bajo ~30 columnas (`hardTerm`), el panel se superpone con un ancho reducido.
 */
export const PANEL_MIN = 260;
/** Ancho de la barra de actividad (w-11). */
export const ACTIVITY_W = 44;
/** Ventana angosta: con un panel derecho o Herramientas a la vista, en este ancho o menos el árbol se pliega. */
export const NARROW_W = 1100;
/** Nombre anterior del mismo umbral (Herramientas usaba uno propio). */
export const TOOLS_NARROW = NARROW_W;
/** Terminal a la vista que se deja cuando el panel va superpuesto. */
export const OVERLAY_TERM = 400;

export interface PanelLayoutIn {
  /** Ancho del contenedor raíz (0 mientras no se midió). */
  rootW: number;
  /** Ancho de las pestañas verticales (0 si no hay). */
  vtabsW: number;
  /** Modo foco: sin barra de actividad, sesiones ni paneles. */
  focusMode: boolean;
  /** Preferencia del usuario: barra de sesiones acoplada. */
  sidebarOpen: boolean;
  sidebarW: number;
  /** La vista de Herramientas es la que se ve ahora. */
  toolsActive?: boolean;
  /** Comandos o Notas abierto. */
  panelOpen: boolean;
  /** Ancho elegido para el panel. */
  panelW: number;
  /** Ancho mínimo de terminal (~60 columnas más el relleno de xterm). */
  minTerm: number;
  /** Mínimo absoluto de terminal (~30 columnas) bajo el cual el panel se superpone. Por defecto, la mitad de las columnas de `minTerm`. */
  hardTerm?: number;
  /** Ancho cómodo de terminal (~80 columnas): bajo él, con panel o Herramientas, se pliega el árbol. Por defecto, 80/60 de las columnas de `minTerm`. */
  comfortTerm?: number;
}

export interface PanelLayout {
  /** La barra de sesiones acoplada está oculta por la app (no por el usuario). */
  sidebarAutoHidden: boolean;
  /** Por qué la app la ocultó: un panel derecho o la vista de Herramientas sin ancho suficiente. */
  sidebarHiddenBy: "panel" | "tools" | null;
  /** La barra de sesiones se dibuja acoplada. */
  sidebarShown: boolean;
  /** El panel va encima de la terminal en vez de a su lado. */
  panelOverlay: boolean;
  /** Ancho con el que se dibuja el panel. */
  panelWidth: number;
  /** Ancho que queda a la terminal (acoplado) o a la vista (superpuesto). */
  termWidth: number;
}

/** Ancho mínimo de terminal para ~60 columnas del tamaño de letra dado (0,602 em por columna + relleno y barra de xterm). */
export const minTermFor = (fontSize: number) => Math.round(60 * fontSize * 0.602 + 30);

/** ~80 columnas del mismo tamaño de letra que `minTerm` (60 columnas más el relleno de xterm). */
const comfortOf = (i: PanelLayoutIn) => i.comfortTerm ?? Math.round(((i.minTerm - 30) * 80) / 60) + 30;
/** Ancho libre para árbol, terminal y panel: la ventana menos la barra de actividad y las pestañas verticales. */
const freeOf = (i: PanelLayoutIn) => i.rootW - (i.focusMode ? 0 : ACTIVITY_W) - i.vtabsW;
/** Ancho que pide el panel derecho acoplado junto al árbol (nunca bajo PANEL_MIN). */
const panelAsked = (i: PanelLayoutIn) => Math.max(PANEL_MIN, i.panelW);

/**
 * La regla única de plegado: con panel derecho o Herramientas a la vista, falta ancho si la ventana
 * mide `NARROW_W` o menos o si lo que queda junto al árbol baja de ~80 columnas. `null` si el árbol cabe.
 */
export function sidebarFold(i: PanelLayoutIn): "panel" | "tools" | null {
  if (i.rootW <= 0 || i.focusMode || !i.sidebarOpen) return null;
  const free = freeOf(i) - i.sidebarW;
  const comfort = comfortOf(i);
  if (i.toolsActive && (i.rootW <= NARROW_W || free < comfort)) return "tools";
  if (i.panelOpen && (i.rootW <= NARROW_W || free - panelAsked(i) < comfort)) return "panel";
  return null;
}

export function panelLayout(i: PanelLayoutIn): PanelLayout {
  const measured = i.rootW > 0;
  const panelOpen = !i.focusMode && i.panelOpen;
  const free = freeOf(i);
  const dock = (sidebarPx: number) => Math.min(i.panelW, free - sidebarPx - i.minTerm);
  const sidebarHiddenBy = sidebarFold(i);
  const sidebarAutoHidden = sidebarHiddenBy !== null;
  const sidebarShown = i.sidebarOpen && !sidebarAutoHidden;
  const sb = sidebarShown && !i.focusMode ? i.sidebarW : 0;
  const dockW = dock(sb);
  const hardTerm = i.hardTerm ?? Math.round((i.minTerm - 30) / 2) + 30;
  const panelOverlay = measured && panelOpen && dockW < PANEL_MIN && free - sb - PANEL_MIN < hardTerm;
  const panelWidth = panelOverlay ? Math.min(i.panelW, Math.max(PANEL_MIN, free - OVERLAY_TERM)) : Math.max(PANEL_MIN, Math.min(i.panelW, dockW));
  const termWidth = panelOpen && !panelOverlay ? free - sb - panelWidth : free - sb;
  return { sidebarAutoHidden, sidebarHiddenBy, sidebarShown, panelOverlay, panelWidth, termWidth };
}

/** Límites del ancho de la barra de sesiones al arrastrar su borde. */
export const SIDEBAR_MIN = 180;
export const SIDEBAR_MAX = 480;

/**
 * Ancho máximo al arrastrar el borde de la barra de sesiones. Con un panel derecho acoplado o con
 * Herramientas a la vista, la barra llega hasta donde todavía quedan ~80 columnas a su lado: más allá
 * la app la plegaría al soltar.
 */
export function sidebarDragMax(i: PanelLayoutIn): number {
  const l = panelLayout(i);
  const panelOpen = !i.focusMode && i.panelOpen;
  if (!l.sidebarShown || i.focusMode || (!panelOpen && !i.toolsActive)) return SIDEBAR_MAX;
  const room = freeOf(i) - comfortOf(i) - (panelOpen ? panelAsked(i) : 0);
  return Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, Math.max(i.sidebarW, room)));
}

/**
 * Ancho máximo con que se dibujaría el panel derecho (el reparto lo limita aunque el usuario pida más).
 * Con el árbol a la vista, el arrastre se detiene donde el árbol todavía cabe: ensanchar el panel no lo pliega.
 */
export function panelDragMax(i: PanelLayoutIn): number {
  const all = panelLayout({ ...i, panelW: Number.MAX_SAFE_INTEGER }).panelWidth;
  const l = panelLayout(i);
  if (!l.sidebarShown || i.focusMode || !i.panelOpen || l.panelOverlay) return all;
  const room = freeOf(i) - i.sidebarW - comfortOf(i);
  return Math.max(l.panelWidth, Math.min(all, room));
}
