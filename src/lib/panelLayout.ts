/**
 * Reparto del ancho entre la barra de sesiones, la terminal y el panel derecho (Comandos o Notas).
 * Orden de preferencia cuando la terminal se angosta:
 *  1) el panel se acopla y la terminal se reajusta (el panel se achica hasta PANEL_MIN antes que superponerse);
 *  2) se oculta la barra de sesiones acoplada mientras el panel está abierto (la preferencia del usuario no cambia);
 *  3) si ni así cabe `minTerm`, el panel se acopla a PANEL_MIN y la terminal se reajusta al espacio restante (bajo ~60 columnas, pero sin texto tapado);
 *  4) solo si la terminal quedaría bajo ~30 columnas (`hardTerm`), el panel se superpone con un ancho reducido.
 */
export const PANEL_MIN = 260;
/** Ancho de la barra de actividad (w-11). */
export const ACTIVITY_W = 44;
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
  const sidebarAutoHidden = measured && panelOpen && i.sidebarOpen && dock(i.sidebarW) < PANEL_MIN;
  const sidebarShown = i.sidebarOpen && !sidebarAutoHidden;
  const sb = sidebarShown && !i.focusMode ? i.sidebarW : 0;
  const dockW = dock(sb);
  const hardTerm = i.hardTerm ?? Math.round((i.minTerm - 30) / 2) + 30;
  const panelOverlay = measured && panelOpen && dockW < PANEL_MIN && free - sb - PANEL_MIN < hardTerm;
  const panelWidth = panelOverlay ? Math.min(i.panelW, Math.max(PANEL_MIN, free - OVERLAY_TERM)) : Math.max(PANEL_MIN, Math.min(i.panelW, dockW));
  const termWidth = panelOpen && !panelOverlay ? free - sb - panelWidth : free - sb;
  return { sidebarAutoHidden, sidebarShown, panelOverlay, panelWidth, termWidth };
}
