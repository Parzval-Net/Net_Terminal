import { useCallback, useEffect, useRef, useState } from "react";

interface Box {
  x: number; // desplazamiento desde la posición centrada
  y: number;
  w: number | null; // null = tamaño natural
  h: number | null;
}

const EMPTY: Box = { x: 0, y: 0, w: null, h: null };

function load(key: string): Box {
  try {
    return { ...EMPTY, ...JSON.parse(localStorage.getItem(key) ?? "{}") };
  } catch {
    return EMPTY;
  }
}

/**
 * Ventana flotante: se arrastra desde un "asa" y, si `resizable`, se redimensiona desde
 * la esquina (CSS resize). Recuerda posición y tamaño; doble clic en el asa restaura.
 * El tamaño solo se guarda cuando el usuario lo cambia con la esquina, no cuando el
 * contenido crece o se achica.
 */
export function useDragResize<T extends HTMLElement = HTMLDivElement>(key: string, resizable = true) {
  const ref = useRef<T>(null);
  const [box, setBox] = useState<Box>(() => load(key));
  // Arrastre en curso: origen, límites y última posición. La ventana se mueve escribiendo el transform
  // directo en el elemento, una vez por cuadro; el estado (y el guardado) se actualizan al soltar. Así
  // mover una ventana con mucho contenido no la vuelve a dibujar en cada movimiento del mouse.
  const drag = useRef<{ sx: number; sy: number; x: number; y: number; maxX: number; maxY: number; nx: number; ny: number; frame: number } | null>(null);
  const sizeAtDown = useRef<{ w: number; h: number } | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(box));
    } catch {
      /* sin almacenamiento: no se recuerda */
    }
  }, [key, box]);

  // Detecta un redimensionado manual: tamaño distinto entre presionar y soltar el mouse.
  useEffect(() => {
    if (!resizable) return;
    const up = () => {
      const el = ref.current;
      const before = sizeAtDown.current;
      sizeAtDown.current = null;
      if (!el || !before || drag.current) return;
      if (Math.abs(el.offsetWidth - before.w) > 2 || Math.abs(el.offsetHeight - before.h) > 2)
        setBox((b) => ({ ...b, w: el.offsetWidth, h: el.offsetHeight }));
    };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, [resizable]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const el = ref.current;
      if (!el || e.button !== 0 || (e.target as HTMLElement).closest("button, input, select, textarea, a")) return;
      // Siempre queda parte de la ventana visible para poder recuperarla.
      const maxX = window.innerWidth / 2 + el.offsetWidth / 2 - 80;
      const maxY = window.innerHeight / 2 + el.offsetHeight / 2 - 48;
      drag.current = { sx: e.clientX, sy: e.clientY, x: box.x, y: box.y, maxX, maxY, nx: box.x, ny: box.y, frame: 0 };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [box.x, box.y],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    d.nx = Math.max(-d.maxX, Math.min(d.maxX, d.x + e.clientX - d.sx));
    d.ny = Math.max(-d.maxY, Math.min(d.maxY, d.y + e.clientY - d.sy));
    if (!d.frame)
      d.frame = requestAnimationFrame(() => {
        d.frame = 0;
        if (drag.current === d && ref.current) ref.current.style.transform = `translate(${d.nx}px, ${d.ny}px)`;
      });
  }, []);

  const onPointerUp = useCallback(() => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    cancelAnimationFrame(d.frame);
    if (ref.current) ref.current.style.transform = `translate(${d.nx}px, ${d.ny}px)`;
    if (d.nx !== d.x || d.ny !== d.y) setBox((b) => ({ ...b, x: d.nx, y: d.ny }));
  }, []);

  const reset = useCallback(() => setBox(EMPTY), []);

  return {
    /** Props para el contenedor de la ventana. */
    box: {
      ref,
      style: {
        transform: `translate(${box.x}px, ${box.y}px)`,
        width: resizable && box.w ? box.w : undefined,
        height: resizable && box.h ? box.h : undefined,
      } as React.CSSProperties,
      onPointerDownCapture: () => {
        const el = ref.current;
        if (el && resizable) sizeAtDown.current = { w: el.offsetWidth, h: el.offsetHeight };
      },
    },
    /** Props para la barra de título (asa de arrastre). */
    handle: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onLostPointerCapture: onPointerUp,
      onDoubleClick: reset,
      style: { cursor: "move", touchAction: "none" } as React.CSSProperties,
      title: "Arrastra para mover · doble clic para restaurar",
    },
  };
}
