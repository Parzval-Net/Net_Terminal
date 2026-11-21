import { useEffect, useRef } from "react";

/**
 * Mientras un panel se desplaza, sus elementos dejan de recibir el puntero (data-scrolling): las
 * filas que pasan bajo el cursor no activan su estado hover y no hay que repintarlas en cada cuadro
 * (en Auditoría eran unos 76 repintados por pasada). El puntero vuelve 150 ms después del último
 * desplazamiento. Solo para paneles con scroll nativo (no para xterm, que maneja la rueda él mismo).
 */
export function useScrollQuiet<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timer = 0;
    const onScroll = () => {
      if (!el.dataset.scrolling) el.dataset.scrolling = "";
      window.clearTimeout(timer);
      timer = window.setTimeout(() => delete el.dataset.scrolling, 150);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.clearTimeout(timer);
      delete el.dataset.scrolling;
    };
  }, []);
  return ref;
}
