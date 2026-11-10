/**
 * Borde arrastrable de un panel lateral (Comandos y Notas a la izquierda de su borde
 * derecho; la barra de sesiones usa `side="right"` en su borde derecho).
 */
export function PanelResize({
  width,
  onResize,
  side = "left",
}: {
  width: number;
  onResize: (w: number) => void;
  side?: "left" | "right";
}) {
  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    // Panel a la derecha: arrastrar hacia la izquierda lo achica. Barra a la izquierda: al revés.
    const move = (ev: MouseEvent) =>
      onResize(side === "left" ? width + (startX - ev.clientX) : width + (ev.clientX - startX));
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      document.body.style.cursor = "";
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
