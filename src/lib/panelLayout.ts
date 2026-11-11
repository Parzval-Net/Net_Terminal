/**
 * Reparto del ancho entre la barra de sesiones, la terminal y el panel derecho (Comandos o Notas).
 * Orden de preferencia cuando la terminal se angosta:
 *  1) el panel se acopla y la terminal se reajusta (el panel se achica hasta PANEL_MIN antes que superponerse);
 *  2) se oculta la barra de sesiones acoplada mientras el panel está abierto (la preferencia del usuario no cambia);
 *  3) si ni así cabe `minTerm`, el panel se acopla a PANEL_MIN y la terminal se reajusta al espacio restante (bajo ~60 columnas, pero sin texto tapado);
 *  4) solo si la terminal quedaría bajo ~30 columnas (`hardTerm`), el panel se superpone con un ancho reducido.
 * Herramientas (Topología, Monitoreo…) necesita ancho para sus mapas y tablas: en ventanas bajo `TOOLS_NARROW`
 * la barra de sesiones acoplada también se oculta sola (siempre por la app; la preferencia del usuario no cambia).
 */
export const PANEL_MIN = 260;
/** Ancho de la barra de actividad (w-11). */
export const ACTIVITY_W = 44;
/** Ancho de ventana bajo el cual la vista de Herramientas oculta sola la barra de sesiones acoplada. */
export const TOOLS_NARROW = 900;
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
}

export interface PanelLayout {
  /** La barra de sesiones acoplada está oculta por la app (no por el usuario). */
  sidebarAutoHidden: boolean;
  /** Por qué la app la ocultó: un panel derecho o la vista de Herramientas en ventana angosta. */
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

export function panelLayout(i: PanelLayoutIn): PanelLayout {
  const measured = i.rootW > 0;
  const panelOpen = !i.focusMode && i.panelOpen;
  const free = i.rootW - (i.focusMode ? 0 : ACTIVITY_W) - i.vtabsW;
  const dock = (sidebarPx: number) => Math.min(i.panelW, free - sidebarPx - i.minTerm);
  const toolsNarrow = measured && !i.focusMode && !!i.toolsActive && i.rootW < TOOLS_NARROW;
  const byTools = toolsNarrow && i.sidebarOpen;
  const byPanel = measured && panelOpen && i.sidebarOpen && dock(i.sidebarW) < PANEL_MIN;
  const sidebarAutoHidden = byTools || byPanel;
  const sidebarHiddenBy = byTools ? "tools" : byPanel ? "panel" : null;
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
 * Ancho máximo al arrastrar el borde de la barra de sesiones. Con un panel derecho acoplado, la barra
 * llega hasta donde el panel todavía cabe con su mínimo: más allá la app la ocultaría al soltar.
 */
export function sidebarDragMax(i: PanelLayoutIn): number {
  const l = panelLayout(i);
  if (!l.sidebarShown || i.focusMode || !i.panelOpen) return SIDEBAR_MAX;
  const free = i.rootW - ACTIVITY_W - i.vtabsW;
  return Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, Math.max(i.sidebarW, free - i.minTerm - PANEL_MIN)));
}

/** Ancho máximo con que se dibujaría el panel derecho (el reparto lo limita aunque el usuario pida más). */
export const panelDragMax = (i: PanelLayoutIn): number => panelLayout({ ...i, panelW: Number.MAX_SAFE_INTEGER }).panelWidth;
