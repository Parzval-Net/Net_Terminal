// Posición de un panel emergente anclado bajo su botón, sin salirse de la ventana.
// Lógica pura (sin DOM): el componente mide el botón y la ventana y aplica el resultado.

export interface AnchorRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface PopoverPos {
  top: number;
  left: number;
  /** Alto máximo disponible desde top hasta el borde inferior (menos el margen). */
  maxHeight: number;
}

/** Alto de la barra de pestañas: sin botón visible, el panel abre arriba a la derecha bajo ella. */
export const FALLBACK_TOP = 44;

/**
 * Coloca un panel de ancho `width` bajo `anchor`, alineado con el borde derecho del botón.
 * Sin botón (por ejemplo, abierto con el atajo y la barra oculta) queda arriba a la derecha.
 * Siempre respeta `margin` contra los bordes de la ventana; si el panel es más ancho que el
 * espacio, se pega al margen izquierdo (el CSS limita el ancho con max-width).
 */
export function anchorBelow(
  anchor: AnchorRect | null,
  width: number,
  view: { width: number; height: number },
  margin = 12,
  gap = 6,
): PopoverPos {
  const maxLeft = Math.max(margin, view.width - margin - width);
  const visible = anchor && anchor.right > anchor.left && anchor.bottom > anchor.top;
  const top = visible ? Math.min(Math.max(margin, anchor.bottom + gap), Math.max(margin, view.height - margin - 120)) : FALLBACK_TOP;
  const left = visible ? Math.min(Math.max(margin, anchor.right - width), maxLeft) : maxLeft;
  return { top, left, maxHeight: Math.max(120, view.height - top - margin) };
}
