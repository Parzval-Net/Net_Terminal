import { RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Pt, Topology } from "../../../lib/topology";
import {
  ZOOM_MAX,
  ZOOM_MIN,
  centerScroll,
  floorZoom,
  pinchMetrics,
  pinchZoom,
  revealScroll,
  scaleAt,
  wheelFactor,
  wheelIntent,
} from "../../../lib/mapZoom";
import { H, W } from "./topoConst";

/** Ancho de la herramienta y tamaño de la vista del mapa: de ellos salen la barra, el panel y el zoom. */
export function useTopoSize(rootRef: RefObject<HTMLDivElement | null>, scroller: RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ rw: 0, mw: 0, mh: 0 });
  // Diseño según el ancho de la herramienta (ver bp y panelMode en TopologyTool): se mide la raíz y la vista del mapa.
  useLayoutEffect(() => {
    const root = rootRef.current;
    const sc = scroller.current;
    if (!root || !sc) return;
    const measure = () => {
      const next = { rw: Math.round(root.clientWidth), mw: Math.round(sc.clientWidth), mh: Math.round(sc.clientHeight) };
      setSize((p) => (p.rw === next.rw && p.mw === next.mw && p.mh === next.mh ? p : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    ro.observe(sc);
    return () => ro.disconnect();
  }, []);
  return size;
}

/**
 * Zoom y desplazamiento del mapa: botones, ajuste automático, centrar un equipo o un punto, pellizco
 * (touchpad, WebKit y pantallas táctiles), Ctrl/⌘ + rueda y arrastre del fondo. El zoom de un
 * ajuste automático sale del tamaño de la vista y del diagrama; el manual lo guarda `zoom`.
 */
export function useTopoZoom({
  scroller,
  size,
  box,
  shown,
  selected,
  insetRight,
  reducedMotion,
}: {
  scroller: RefObject<HTMLDivElement | null>;
  size: { rw: number; mw: number; mh: number };
  /** Encuadre del diagrama (coordenadas del mapa). */
  box: { x: number; y: number; w: number; h: number };
  /** Lo que se dibuja (ya filtrado). */
  shown: Topology;
  selected: string | null;
  /** Franja de la derecha del mapa que tapa el panel superpuesto (px). */
  insetRight: number;
  reducedMotion: boolean;
}) {
  // Zoom manual; mientras `fit` no sea "manual" el zoom sale del tamaño de la vista y del diagrama
  // ("floor": ajustado con piso de legibilidad; "all": el diagrama completo).
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState<"floor" | "all" | "manual">("floor");
  const [fitNonce, setFitNonce] = useState(0);
  const [focusReq, setFocusReq] = useState<string | Pt | null>(null);
  const vsize = { w: size.mw, h: size.mh };
  const zoomUsed = fit === "all" ? 1 : fit === "floor" ? floorZoom(vsize, box) : zoom;
  const mapK = scaleAt(vsize, box, zoomUsed);

  /** Ajustar a la vista: zoom con piso de legibilidad, centrado en el equipo elegido o en el primero. */
  const fitView = () => {
    setFit("floor");
    setFitNonce((n) => n + 1);
  };
  /** Ver todo: el diagrama completo dentro de la vista, aunque los textos queden chicos. */
  const fitAll = () => {
    setFit("all");
    scroller.current?.scrollTo({ left: 0, top: 0 });
  };
  const zoomUsedRef = useRef(zoomUsed);
  zoomUsedRef.current = zoomUsed;
  /** Cambio de zoom pedido por el usuario: deja el ajuste automático y parte del zoom que se ve. */
  const changeZoom = useCallback((f: (z: number) => number) => {
    setFit("manual");
    setZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, f(zoomUsedRef.current))));
  }, []);

  // Se centra después del render con el zoom nuevo (el SVG ya tiene su tamaño final).
  useEffect(() => {
    if (!focusReq) return;
    setFocusReq(null);
    const el = scroller.current;
    const n = typeof focusReq === "string" ? shown.nodes.find((x) => x.id === focusReq) : focusReq;
    if (!el || !n) return;
    const to = centerScroll({ w: el.clientWidth, h: el.clientHeight }, box, zoomUsed, n, insetRight);
    el.scrollTo({ ...to, behavior: reducedMotion ? "auto" : "smooth" });
  }, [focusReq, shown, zoomUsed, box, reducedMotion, insetRight]);

  // Mientras el ajuste es automático ("floor"), se centra en el equipo elegido o en el primero cuando
  // cambia el tamaño de la vista, la cantidad de equipos o se pulsa "Ajustar". Mover un equipo no
  // recentra (cambiaría el encuadre mientras se arrastra).
  const fitRef = useRef({ shown, selected, box, zoomUsed, insetRight });
  fitRef.current = { shown, selected, box, zoomUsed, insetRight };
  useLayoutEffect(() => {
    const el = scroller.current;
    if (fit !== "floor" || !el || !size.mw) return;
    const f = fitRef.current;
    const n = (f.selected && f.shown.nodes.find((x) => x.id === f.selected)) || f.shown.nodes[0];
    if (!n) return;
    const to = centerScroll({ w: el.clientWidth, h: el.clientHeight }, f.box, f.zoomUsed, n, f.insetRight);
    el.scrollLeft = to.left;
    el.scrollTop = to.top;
  }, [fit, size.mw, size.mh, shown.nodes.length, fitNonce, insetRight]);

  // Al elegir un equipo el mapa se desplaza lo justo para que no quede fuera de la vista ni debajo
  // del panel superpuesto (si ya se ve, no se mueve).
  useEffect(() => {
    const el = scroller.current;
    const f = fitRef.current;
    if (!selected || !el) return;
    const n = f.shown.nodes.find((x) => x.id === selected);
    if (!n) return;
    const to = revealScroll({ w: el.clientWidth, h: el.clientHeight }, f.box, f.zoomUsed, n, { left: el.scrollLeft, top: el.scrollTop }, { w: W / 2, h: H / 2 }, f.insetRight);
    if (to) el.scrollTo({ ...to, behavior: reducedMotion ? "auto" : "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // Zoom con pellizco (touchpad) o Ctrl/⌘ + rueda, hacia el punto bajo el puntero.
  // Un pellizco o la rueda entregan varios eventos por cuadro: se junta todo en un redibujo por
  // cuadro (cada uno relayouta el mapa completo al cambiar el tamaño del SVG).
  const zoomFrame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(zoomFrame.current), []);
  const zoomRef = useRef(zoom);
  // Con un redibujo pendiente, el valor que manda es el del último evento, no el del estado.
  if (!zoomFrame.current) zoomRef.current = zoomUsed;
  const zoomAnchor = useRef<{ cx: number; cy: number; sx: number; sy: number; from: number } | null>(null);
  const zoomAt = useCallback((next: number, cx: number, cy: number) => {
    const el = scroller.current;
    const from = zoomRef.current;
    const to = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
    if (!el || Math.abs(to - from) < 0.001) return;
    // Varios eventos antes de redibujar (lo normal en un touchpad): el ancla parte del último zoom dibujado.
    const pending = zoomAnchor.current;
    zoomAnchor.current = pending ? { ...pending, cx, cy } : { cx, cy, sx: el.scrollLeft, sy: el.scrollTop, from };
    zoomRef.current = to;
    if (!zoomFrame.current) {
      zoomFrame.current = requestAnimationFrame(() => {
        zoomFrame.current = 0;
        setFit("manual");
        setZoom(zoomRef.current);
      });
    }
  }, []);
  // El dibujo crece en proporción al zoom: se corre el scroll para que el punto bajo el puntero no se mueva.
  useLayoutEffect(() => {
    const a = zoomAnchor.current;
    const el = scroller.current;
    if (!a || !el) return;
    zoomAnchor.current = null;
    const f = zoomUsed / a.from;
    el.scrollLeft = (a.sx + a.cx) * f - a.cx;
    el.scrollTop = (a.sy + a.cy) * f - a.cy;
  }, [zoomUsed]);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const local = (x: number, y: number) => {
      const r = el.getBoundingClientRect();
      return [x - r.left, y - r.top] as const;
    };
    // Rueda vertical: zoom anclado al puntero, como un mapa, sin distinguir mouse de touchpad (no
    // hay forma fiable: Magic Mouse y los mouse con desplazamiento suave dan deltas continuos).
    // Pellizco en Chromium, WebView2 y WebKit: rueda con ctrlKey. Se desplaza con Shift + rueda, con
    // movimiento horizontal del touchpad, o arrastrando el fondo.
    let gesturing = false;
    // Último puntero sobre el mapa: los gestos de WebKit no siempre traen clientX/clientY.
    let pointer: [number, number] | null = null;
    const onMove = (e: PointerEvent) => (pointer = [e.clientX, e.clientY]);
    const onWheel = (e: WheelEvent) => {
      const intent = wheelIntent(e);
      if (intent === "pan") return;
      e.preventDefault();
      if (gesturing) return;
      const [cx, cy] = local(e.clientX, e.clientY);
      zoomAt(zoomRef.current * wheelFactor(e, intent === "pinch"), cx, cy);
    };
    // macOS (WebKit): el pellizco llega como gesto con su escala.
    let base = 1;
    type Gesture = Event & { scale: number; clientX: number; clientY: number };
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      gesturing = true;
      base = zoomRef.current;
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const g = e as Gesture;
      const at = Number.isFinite(g.clientX) && Number.isFinite(g.clientY) ? ([g.clientX, g.clientY] as const) : (pointer ?? ([0, 0] as const));
      const [cx, cy] = local(at[0], at[1]);
      if (Number.isFinite(g.scale)) zoomAt(base * g.scale, cx, cy);
    };
    const onGestureEnd = (e: Event) => {
      e.preventDefault();
      gesturing = false;
    };
    // Pantallas táctiles: dos dedos hacen zoom (distancia entre ellos) anclado al punto medio. Un dedo
    // sigue siendo arrastrar el mapa (startPan). Los punteros "touch" se siguen aquí, en fase de captura.
    const touches = new Map<number, { x: number; y: number }>();
    let pinch: { dist: number; base: number } | null = null;
    const pair = () => {
      const [a, b] = [...touches.values()];
      return pinchMetrics(a, b);
    };
    const onTouchDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) {
        pinch = { dist: pair().dist, base: zoomRef.current };
        // El segundo dedo cancela el arrastre del primero y no inicia otro (startPan no lo recibe).
        endPan.current?.();
      }
      if (touches.size >= 2) e.stopPropagation();
    };
    const onTouchMove = (e: PointerEvent) => {
      const t = touches.get(e.pointerId);
      if (!t) return;
      t.x = e.clientX;
      t.y = e.clientY;
      if (touches.size !== 2 || !pinch) return;
      e.preventDefault();
      const { dist, mid } = pair();
      const [cx, cy] = local(mid.x, mid.y);
      zoomAt(pinchZoom(pinch.base, pinch.dist, dist, ZOOM_MIN, ZOOM_MAX), cx, cy);
    };
    const onTouchUp = (e: PointerEvent) => {
      if (!touches.delete(e.pointerId)) return;
      pinch = null;
      if (touches.size === 2) pinch = { dist: pair().dist, base: zoomRef.current };
    };
    el.addEventListener("pointerdown", onTouchDown, { capture: true });
    el.addEventListener("pointermove", onTouchMove, { passive: false });
    el.addEventListener("pointerup", onTouchUp);
    el.addEventListener("pointercancel", onTouchUp);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointermove", onMove);
    el.addEventListener("gesturestart", onGestureStart, { passive: false });
    el.addEventListener("gesturechange", onGestureChange, { passive: false });
    el.addEventListener("gestureend", onGestureEnd, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", onTouchDown, { capture: true });
      el.removeEventListener("pointermove", onTouchMove);
      el.removeEventListener("pointerup", onTouchUp);
      el.removeEventListener("pointercancel", onTouchUp);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("gesturestart", onGestureStart);
      el.removeEventListener("gesturechange", onGestureChange);
      el.removeEventListener("gestureend", onGestureEnd);
    };
  }, [zoomAt]);

  // Arrastrar el fondo (o con el botón del medio, en cualquier parte) mueve el mapa: con la rueda
  // dedicada al zoom, es la forma de desplazarse con mouse.
  const [panning, setPanning] = useState(false);
  const endPan = useRef<(() => void) | null>(null);
  // Si la herramienta se cierra a mitad de un arrastre, no quedan escuchas en la ventana.
  useEffect(() => () => endPan.current?.(), []);
  const startPan = (e: React.PointerEvent<SVGSVGElement>) => {
    const el = scroller.current;
    const onBackground = e.button === 0 && e.target === e.currentTarget;
    if (!el || !(onBackground || e.button === 1)) return;
    e.preventDefault();
    endPan.current?.();
    const start = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop };
    setPanning(true);
    const move = (ev: PointerEvent) => {
      el.scrollLeft = start.sl - (ev.clientX - start.x);
      el.scrollTop = start.st - (ev.clientY - start.y);
    };
    // pointercancel: en pantallas táctiles el navegador puede quedarse con el gesto sin pointerup.
    const up = () => {
      endPan.current = null;
      setPanning(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    endPan.current = up;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  return { zoomUsed, mapK, fit, panning, changeZoom, fitView, fitAll, startPan, endPan, setFocusReq };
}
