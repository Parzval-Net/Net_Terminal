import { useEffect, useRef, useState } from "react";
import { minTermFor, panelLayout } from "./panelLayout";
import { persist, stored } from "./prefs";

/**
 * Distribución de la ventana: barra de sesiones (acoplada o flotante), paneles derechos de Notas y
 * Comandos (comparten el lado derecho), modo foco y el ancho disponible para la terminal (panelLayout).
 * Todo lo que el usuario deja a su gusto se recuerda entre aperturas.
 */
export function useAppLayout({ fontSize, floatingSidebar, activeId }: { fontSize: number; floatingSidebar: boolean; activeId: string | null }) {
  const [sidebarOpen, setSidebarOpen] = useState(() => stored("sidebar", true));
  useEffect(() => persist("sidebar", sidebarOpen), [sidebarOpen]);
  // Ancho de la barra de sesiones: 256 px por defecto (w-64), entre 180 y 480 px.
  const [sidebarWidth, setSidebarWidth] = useState(() => stored("sidebarWidth", 256));
  // Se guarda al soltar (300 ms sin cambios), no en cada movimiento del arrastre.
  useEffect(() => {
    const t = window.setTimeout(() => persist("sidebarWidth", sidebarWidth), 300);
    return () => window.clearTimeout(t);
  }, [sidebarWidth]);
  // Un solo cambio de ancho por cuadro: el arrastre emite mousemove más rápido que el refresco.
  const sidebarPending = useRef<number | null>(null);
  /** Modo foco: solo pestañas y terminal (sin barra de actividad, sesiones, paneles, botones ni estado). Se recuerda. */
  const [focusMode, setFocusMode] = useState(() => stored("focusMode", false));
  useEffect(() => persist("focusMode", focusMode), [focusMode]);
  /** Barra de sesiones flotante abierta (solo con el ajuste activo y la barra acoplada cerrada). */
  const [peek, setPeek] = useState(false);
  const peekTimer = useRef<number | undefined>(undefined);
  const peekRef = useRef<HTMLDivElement>(null);
  /** Abierta con teclado o clic (no por el mouse encima): el foco entra al filtro y se cierra al salir de ella. */
  const peekKb = useRef(false);
  const [peekFocusReq, setPeekFocusReq] = useState(0);
  const [notesOpen, setNotesOpenRaw] = useState(() => stored("notesOpen", false));
  const [commandsOpen, setCommandsOpenRaw] = useState(() => stored("commandsOpen", false));
  useEffect(() => persist("commandsOpen", commandsOpen), [commandsOpen]);
  // Notas y Comandos comparten el lado derecho: abrir uno cierra el otro.
  const setNotesOpen = (v: boolean | ((o: boolean) => boolean)) =>
    setNotesOpenRaw((o) => {
      const next = typeof v === "function" ? v(o) : v;
      if (next) setCommandsOpenRaw(false);
      return next;
    });
  const setCommandsOpen = (v: boolean | ((o: boolean) => boolean)) =>
    setCommandsOpenRaw((o) => {
      const next = typeof v === "function" ? v(o) : v;
      if (next) setNotesOpenRaw(false);
      return next;
    });
  const [notesWidth, setNotesWidth] = useState(() =>
    stored("notesWidth", Math.round(Math.max(300, Math.min(380, window.innerWidth * 0.3)))),
  );
  // Paneles derechos (Comandos y Notas). Orden de preferencia cuando la terminal se angosta:
  // 1) el panel se acopla y la terminal se reajusta; 2) si no cabe el mínimo, se oculta la barra de
  // sesiones acoplada mientras el panel está abierto (la preferencia del usuario no cambia: al cerrar
  // el panel vuelve sola); 3) si aun así no cabe, el panel se superpone con un ancho reducido.
  // Mínimo de terminal: ~60 columnas del tamaño de letra actual más el relleno de xterm.
  const minTerm = minTermFor(fontSize);
  const [rootW, setRootW] = useState(0);
  const [vtabsW, setVtabsW] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const areaRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const root = rootRef.current;
    const row = rowRef.current;
    if (!root || !row) return;
    const measure = () => {
      setRootW(root.clientWidth);
      // Las pestañas verticales ocupan el borde izquierdo de la fila: el área de terminal empieza tras ellas.
      setVtabsW(areaRef.current?.offsetLeft ?? 0);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    ro.observe(row);
    // El área cambia sola al arrastrar el borde de las pestañas verticales (la fila no cambia de ancho).
    if (areaRef.current) ro.observe(areaRef.current);
    return () => ro.disconnect();
  }, []);
  const { sidebarAutoHidden, sidebarHiddenBy, sidebarShown, panelOverlay, panelWidth } = panelLayout({
    rootW,
    vtabsW,
    focusMode,
    sidebarOpen,
    sidebarW: sidebarWidth,
    toolsActive: activeId === "tools",
    panelOpen: commandsOpen || notesOpen,
    panelW: notesWidth,
    minTerm,
  });
  useEffect(() => persist("notesOpen", notesOpen), [notesOpen]);
  useEffect(() => persist("notesWidth", notesWidth), [notesWidth]);

  /** Alterna la barra superpuesta con teclado o clic: al abrirla, el foco va a su filtro. */
  const togglePeek = () => {
    if (peek) return setPeek(false);
    peekKb.current = true;
    setPeek(true);
    setPeekFocusReq((n) => n + 1);
  };

  // Con la barra acoplada a la vista no queda barra flotante pendiente.
  useEffect(() => {
    if (sidebarShown) setPeek(false);
  }, [sidebarShown]);

  // Abierta con teclado o clic: el foco entra al filtro de sesiones (flecha abajo pasa al árbol).
  useEffect(() => {
    if (!peekFocusReq || !peek) return;
    const id = requestAnimationFrame(() =>
      peekRef.current?.querySelector<HTMLElement>('input[aria-label^="Filtrar sesiones"]')?.focus({ preventScroll: true }),
    );
    return () => cancelAnimationFrame(id);
  }, [peekFocusReq, peek]);
  useEffect(() => {
    if (!peek) peekKb.current = false;
  }, [peek]);

  // Barra flotante: Esc o un clic fuera la cierran. Con el foco dentro, Esc la cierra y devuelve el foco al botón
  // Sesiones (con texto en el filtro, el primer Esc lo limpia); desde fuera no consume la tecla (la terminal la recibe).
  useEffect(() => {
    if (!peek) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const a = document.activeElement as HTMLElement | null;
      if (a && peekRef.current?.contains(a)) {
        if (a instanceof HTMLInputElement && a.value) return;
        if (document.querySelector('[role="menu"]')) return;
        e.preventDefault();
        setPeek(false);
        document.querySelector<HTMLElement>("[data-sessions-btn]")?.focus({ preventScroll: true });
        return;
      }
      setPeek(false);
    };
    // Con el foco puesto por teclado, salir de la barra (Tab) la cierra: es un panel emergente, no un modal.
    const onOut = (e: FocusEvent) => {
      const to = e.relatedTarget as Element | null;
      if (!peekKb.current || !to || peekRef.current?.contains(to) || to.closest('[role="menu"], [data-sessions-btn]')) return;
      setPeek(false);
    };
    peekRef.current?.addEventListener("focusout", onOut);
    const box = peekRef.current;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (t?.closest('[role="menu"], [data-sessions-btn]') || peekRef.current?.contains(t)) return;
      setPeek(false);
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("mousedown", onDown, true);
    return () => {
      box?.removeEventListener("focusout", onOut);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("mousedown", onDown, true);
    };
  }, [peek]);

  /** Acciones de la barra de sesiones, los paneles derechos y el modo foco (App las registra en su `useHandlers`). */
  const actions = {
    toggleSidebar: () => {
      // Con un panel derecho abierto en ventana angosta la barra queda oculta por la app: el atajo la
      // muestra superpuesta (sin tocar la preferencia) en vez de alternar algo que no se ve.
      if (sidebarAutoHidden) return togglePeek();
      setPeek(false);
      setSidebarOpen((o) => !o);
    },

    toggleFocus: () => setFocusMode((f) => !f),
    /**
     * Clic en Sesiones: con el modo flotante y la barra cerrada deja abierta la superpuesta (el
     * mouseenter ya la abrió: alternar aquí la cerraba justo al hacer clic; se cierra con Esc, un
     * clic fuera o al salir el mouse); si no, acopla u oculta.
     */
    clickSessions: () => {
      if (sidebarAutoHidden) togglePeek();
      else if (floatingSidebar && !sidebarOpen) {
        window.clearTimeout(peekTimer.current);
        peekKb.current = true;
        setPeek(true);
        setPeekFocusReq((n) => n + 1);
      } else {
        setPeek(false);
        setSidebarOpen((o) => !o);
      }
    },
    peekEnter: () => {
      window.clearTimeout(peekTimer.current);
      if (floatingSidebar && !sidebarShown && !focusMode) setPeek(true);
    },
    peekLeave: () => {
      window.clearTimeout(peekTimer.current);
      peekTimer.current = window.setTimeout(() => {
        // No se cierra con un menú contextual abierto ni mientras se escribe en el filtro.
        const box = peekRef.current;
        if (document.querySelector('[role="menu"]') || (box && box.contains(document.activeElement) && (peekKb.current || document.activeElement?.tagName === "INPUT"))) return;
        setPeek(false);
      }, 300);
    },
    pinSessions: () => {
      setPeek(false);
      setSidebarOpen(true);
    },
    resizeNotes: (w: number) => setNotesWidth(Math.max(260, Math.min(w, window.innerWidth * 0.7))),
    resizeSidebar: (w: number) => {
      const first = sidebarPending.current === null;
      sidebarPending.current = Math.max(180, Math.min(w, 480));
      if (first)
        requestAnimationFrame(() => {
          if (sidebarPending.current !== null) setSidebarWidth(sidebarPending.current);
          sidebarPending.current = null;
        });
    },
  };

  return {
    sidebarOpen,
    sidebarWidth,
    focusMode,
    setFocusMode,
    peek,
    setPeek,
    peekRef,
    notesOpen,
    setNotesOpen,
    commandsOpen,
    setCommandsOpen,
    rootRef,
    rowRef,
    areaRef,
    sidebarAutoHidden,
    sidebarHiddenBy,
    sidebarShown,
    panelOverlay,
    panelWidth,
    actions,
  };
}
