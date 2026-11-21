import { useEffect, useRef } from "react";

/**
 * Medidor de fluidez: cuadros por segundo y el cuadro más lento del último medio segundo.
 * Escribe el texto directo en el DOM (sin estado de React) para no alterar lo que mide.
 * Se activa desde la paleta de comandos ("Medidor de fluidez").
 */
export function PerfMeter({ onClose }: { onClose: () => void }) {
  const text = useRef<HTMLSpanElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    let start = last;
    let frames = 0;
    let worst = 0;
    const tick = (t: number) => {
      const dt = t - last;
      last = t;
      frames++;
      if (dt > worst) worst = dt;
      if (t - start >= 500) {
        const fps = Math.round((frames * 1000) / (t - start));
        if (text.current) text.current.textContent = `${fps} fps · peor cuadro ${Math.round(worst)} ms`;
        if (box.current) box.current.dataset.state = fps >= 58 && worst <= 34 ? "ok" : fps >= 45 ? "warn" : "err";
        start = t;
        frames = 0;
        worst = 0;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <div
      ref={box}
      role="status"
      aria-live="off"
      className="fixed bottom-9 right-3 z-[60] flex items-center gap-2 rounded-md border border-line bg-panel px-2.5 py-1 text-[11px] font-mono shadow-pop data-[state=ok]:text-ok data-[state=warn]:text-warn data-[state=err]:text-danger"
    >
      <span ref={text}>midiendo…</span>
      <button type="button" className="text-muted hover:text-fg" aria-label="Cerrar medidor de fluidez" onClick={onClose}>
        ×
      </button>
    </div>
  );
}
