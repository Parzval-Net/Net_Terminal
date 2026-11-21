import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Posición y tamaño guardados como fracción de la ventana de la app: así la ventana flotante
 * acompaña a la app cuando esta cambia de tamaño (pantalla completa, monitor externo, etc.).
 */
interface Box {
  x: number; // desplazamiento desde la posición centrada, en fracción del ancho de la app
  y: number; // ídem, en fracción del alto
  w: number | null; // ancho en fracción del ancho de la app; null = tamaño natural
  h: number | null;
}

const EMPTY: Box = { x: 0, y: 0, w: null, h: null };
/** Formato anterior (píxeles): se convierte a fracción con el tamaño actual de la app. */
interface LegacyBox {
  x?: number;
  y?: number;
  w?: number | null;
  h?: number | null;
  v?: number;
}

const vw = () => Math.max(1, window.innerWidth);
const vh = () => Math.max(1, window.innerHeight);

function load(key: string): Box {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? "{}") as LegacyBox;
    if (raw.v === 2) return { ...EMPTY, ...raw } as Box;
    return {
      x: (raw.x ?? 0) / vw(),
      y: (raw.y ?? 0) / vh(),
      w: raw.w ? raw.w / vw() : null,
      h: raw.h ? raw.h / vh() : null,
    };
  } catch {
    return EMPTY;
  }
}

/** Sigue el tamaño de la ventana de la app (agrupado por cuadro). */
function useViewport() {
  const [vp, setVp] = useState(() => ({ w: vw(), h: vh() }));
  useEffect(() => {
    let frame = 0;
    const on = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setVp({ w: vw(), h: vh() });
      });
    };
    window.addEventListener("resize", on);
    return () => {
      window.removeEventListener("resize", on);
      cancelAnimationFrame(frame);
    };
  }, []);
  return vp;
}

/** Margen mínimo visible para poder recuperar la ventana. */
const KEEP_X = 80;
const KEEP_Y = 48;
/**
 * Desplazamiento máximo desde el centro: si la ventana cabe, queda entera dentro de la app (así
 * no se pierde al achicarla); si es más grande, al menos KEEP px siguen visibles.
 */
function limit(view: number, size: number, keep: number) {
  return size <= view ? (view - size) / 2 : Math.max(0, view / 2 + size / 2 - keep);
}

/**
 * Ventana flotante: se arrastra desde un "asa" y, si `resizable`, se redimensiona desde
 * la esquina (CSS resize). Recuerda posición y tamaño en proporción a la app, de modo que
 * se ajusta cuando la app cambia de tamaño; doble clic en el asa restaura.
 * El tamaño solo se guarda cuando el usuario lo cambia con la esquina, no cuando el
 * contenido crece o se achica.
 */
export function useDragResize<T extends HTMLElement = HTMLDivElement>(key: string, resizable = true) {
  const ref = useRef<T>(null);
  const [box, setBox] = useState<Box>(() => load(key));
  const vp = useViewport();
  // Arrastre en curso: el transform se escribe directo en el elemento (sin estado ni redibujo de
  // React) y la ventana pasa a su propia capa mientras se mueve; el estado se guarda al soltar.
  const drag = useRef<{ sx: number; sy: number; x: number; y: number; maxX: number; maxY: number; nx: number; ny: number } | null>(null);
  const sizeAtDown = useRef<{ w: number; h: number } | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify({ ...box, v: 2 }));
    } catch {
      /* sin almacenamiento: no se recuerda */
    }
  }, [key, box]);

  // Tamaño en píxeles para la app actual, sin pasar el 98 % / 96 % (el CSS también lo limita).
  const width = resizable && box.w ? Math.round(Math.min(box.w, 0.98) * vp.w) : undefined;
  const height = resizable && box.h ? Math.round(Math.min(box.h, 0.96) * vp.h) : undefined;
  // Posición en píxeles, acotada para que la ventana siga visible tras achicar la app.
  const elW = width ?? ref.current?.offsetWidth ?? 0;
  const elH = height ?? ref.current?.offsetHeight ?? 0;
  const limX = limit(vp.w, elW, KEEP_X);
  const limY = limit(vp.h, elH, KEEP_Y);
  const px = Math.max(-limX, Math.min(limX, box.x * vp.w));
  const py = Math.max(-limY, Math.min(limY, box.y * vp.h));

  // Detecta un redimensionado manual: tamaño distinto entre presionar y soltar el mouse.
  useEffect(() => {
    if (!resizable) return;
    const up = () => {
      const el = ref.current;
      const before = sizeAtDown.current;
      sizeAtDown.current = null;
      if (!el || !before || drag.current) return;
      if (Math.abs(el.offsetWidth - before.w) > 2 || Math.abs(el.offsetHeight - before.h) > 2)
        setBox((b) => ({ ...b, w: el.offsetWidth / vw(), h: el.offsetHeight / vh() }));
    };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, [resizable]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const el = ref.current;
      if (!el || e.button !== 0 || (e.target as HTMLElement).closest("button, input, select, textarea, a")) return;
      const maxX = limit(window.innerWidth, el.offsetWidth, KEEP_X);
      const maxY = limit(window.innerHeight, el.offsetHeight, KEEP_Y);
      drag.current = { sx: e.clientX, sy: e.clientY, x: px, y: py, maxX, maxY, nx: px, ny: py };
      el.style.willChange = "transform";
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [px, py],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !ref.current) return;
    d.nx = Math.max(-d.maxX, Math.min(d.maxX, d.x + e.clientX - d.sx));
    d.ny = Math.max(-d.maxY, Math.min(d.maxY, d.y + e.clientY - d.sy));
    // Escritura directa: con la ventana en su propia capa, el navegador solo recompone.
    ref.current.style.transform = `translate3d(${d.nx}px, ${d.ny}px, 0)`;
  }, []);

  const onPointerUp = useCallback(() => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const el = ref.current;
    if (el) {
      el.style.transform = `translate(${d.nx}px, ${d.ny}px)`;
      el.style.willChange = "";
    }
    if (d.nx !== d.x || d.ny !== d.y) setBox((b) => ({ ...b, x: d.nx / vw(), y: d.ny / vh() }));
  }, []);

  const reset = useCallback(() => setBox(EMPTY), []);

  return {
    /** Props para el contenedor de la ventana. */
    box: {
      ref,
      style: {
        transform: `translate(${px}px, ${py}px)`,
        width,
        height,
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
