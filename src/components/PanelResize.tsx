/**
 * Borde arrastrable de un panel lateral (Comandos y Notas a la izquierda de su borde
 * derecho; la barra de sesiones usa `side="right"` en su borde derecho).
 */
export function PanelResize({
  width,
  onResize,
  side = "left",
  max,
  preview,
}: {
  width: number;
  onResize: (w: number) => void;
  side?: "left" | "right";
  /** Ancho máximo según el reparto actual de la ventana (se consulta al empezar el arrastre). */
  max?: () => number;
  /** Cada cuadro del arrastre con el ancho nuevo, y `null` al soltar: ajusta lo que depende de este ancho. */
  preview?: (w: number | null) => void;
}) {
  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    // Mientras se arrastra, el ancho se aplica directo al panel (una vez por cuadro) y recién al soltar
    // se avisa a la app: así cada movimiento del mouse no vuelve a dibujar toda la interfaz. Los límites
    // son los mismos que aplicará la app, para que al soltar el panel quede donde se ve.
    const panel = e.currentTarget.parentElement;
    const min = side === "left" ? 260 : 180;
    const limit = Math.max(width, max?.() ?? (side === "left" ? window.innerWidth * 0.7 : 480));
    let next = width;
    let frame = 0;
    // Panel a la derecha: arrastrar hacia la izquierda lo achica. Barra a la izquierda: al revés.
    const move = (ev: MouseEvent) => {
      const w = side === "left" ? width + (startX - ev.clientX) : width + (ev.clientX - startX);
      next = Math.round(Math.max(min, Math.min(w, limit)));
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (panel) panel.style.width = `${next}px`;
          preview?.(next);
        });
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      cancelAnimationFrame(frame);
      document.body.style.cursor = "";
      // Se repone el ancho que conoce React (si el final no cambia, React no lo volvería a escribir).
      if (panel) panel.style.width = `${width}px`;
      preview?.(null);
      if (next !== width) onResize(next);
    };
    document.body.style.cursor = "col-resize";
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };
  return (
    <div
      onMouseDown={startDrag}
      title="Arrastra para cambiar el ancho"
      className={`absolute top-0 bottom-0 w-2 cursor-col-resize z-10 hover:bg-[var(--selected)] ${side === "left" ? "-left-1" : "-right-1"}`}
    />
  );
}

/**
 * Clases del panel: acoplado junto a la terminal o, si no cabe el mínimo de terminal, superpuesto con
 * un borde marcado y sombra para que se vea que está encima (y no que la terminal se cortó).
 */
export const panelClass = (overlay: boolean) =>
  // @container: los paneles adaptan sus textos a su propio ancho (260 px o más), no al de la ventana.
  `@container shrink-0 flex flex-col bg-chrome ${
    overlay ? "absolute right-0 top-0 bottom-0 z-30 border-l-2 border-[var(--field-border)] shadow-pop" : "relative border-l border-line"
  }`;
