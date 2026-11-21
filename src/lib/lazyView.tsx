import { useEffect, useState, type ComponentType, type ReactNode } from "react";

/**
 * Componente en un chunk aparte, sin React.lazy: Suspense retiene hasta 300 ms el contenido que
 * reemplaza al fallback, así que una vista ya descargada igual tardaba en aparecer. Aquí, si el
 * chunk ya está (precargado cuando la app queda libre), se dibuja en el mismo render; si no, se
 * muestra `fallback` y se dibuja apenas llega.
 */
export function lazyView<P extends object>(load: () => Promise<ComponentType<P>>, fallback?: (props: P) => ReactNode) {
  let Comp: ComponentType<P> | null = null;
  let pending: Promise<void> | null = null;
  const preload = () =>
    (pending ??= load().then(
      (c) => void (Comp = c),
      (e) => {
        pending = null; // permite reintentar si falló la carga
        throw e;
      },
    ));
  function LazyView(props: P) {
    const [, loaded] = useState(false);
    useEffect(() => {
      if (!Comp) preload().then(() => loaded(true), console.error);
    }, []);
    return Comp ? <Comp {...props} /> : <>{fallback?.(props) ?? null}</>;
  }
  LazyView.preload = preload;
  return LazyView;
}

/** Precarga cuando el navegador queda libre (o tras `delay` ms si no hay requestIdleCallback). */
export function whenIdle(fn: () => void, timeout = 1500, delay = 200): () => void {
  if (typeof window.requestIdleCallback !== "function") {
    const t = window.setTimeout(fn, delay);
    return () => window.clearTimeout(t);
  }
  const id = window.requestIdleCallback(fn, { timeout });
  return () => window.cancelIdleCallback(id);
}
