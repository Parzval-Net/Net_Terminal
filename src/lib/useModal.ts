/**
 * Comportamiento común de los diálogos modales (WAI-ARIA Authoring Practices, "Dialog (Modal)"):
 * roles y nombre accesible, foco inicial, trampa de foco (Tab no sale), Esc que cierra aunque el
 * foco haya quedado en el fondo y devolución del foco al elemento que lo abrió.
 *
 * Uso: el contenedor que cubre la pantalla lleva `{...modal.overlay}` y la caja del diálogo
 * `{...modal.dialog}`; el título lleva `id={modal.titleId}`.
 *
 *   const modal = useModal({ onClose });
 *   <div {...modal.overlay} className="fixed inset-0 ..." onMouseDown={onClose}>
 *     <form {...modal.dialog} ...><h2 id={modal.titleId}>Título</h2> ...
 */
import { useEffect, useId, useRef, useState } from "react";
import { createStack, trapIndex } from "./kbNav";

/** Pila de diálogos abiertos: solo el de arriba atiende Esc y Tab. */
const stack = createStack<object>();

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const FIELD = 'input:not([disabled]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([readonly]), textarea:not([disabled]), select:not([disabled])';

const visible = (el: HTMLElement) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";

/** Elementos enfocables con Tab dentro de `root`, en orden de documento. */
export function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(visible);
}

// En macOS (WebKit) un clic no enfoca los botones: el último clic recuerda quién disparó el diálogo.
let lastPointer: HTMLElement | null = null;
if (typeof document !== "undefined")
  document.addEventListener(
    "pointerdown",
    (e) => {
      lastPointer = (e.target as HTMLElement | null)?.closest?.<HTMLElement>('button, a[href], input, select, textarea, [tabindex]') ?? null;
    },
    true,
  );

/** Elemento al que devolver el foco al cerrar un diálogo o un menú: el enfocado ahora o, si no hay, el último clic. */
export function focusOrigin(): HTMLElement | null {
  const a = document.activeElement as HTMLElement | null;
  if (a && a !== document.body) return a;
  return lastPointer?.isConnected ? lastPointer : null;
}

// Un diálogo abierto desde un menú contextual: el botón del menú desaparece, el foco vuelve a quien abrió el menú.
let menuOrigin: HTMLElement | null = null;
export const setMenuOrigin = (el: HTMLElement | null) => {
  menuOrigin = el;
};

function returnTarget(): HTMLElement | null {
  const a = focusOrigin();
  return a?.closest('[role="menu"]') ? menuOrigin : a;
}

export interface ModalOptions {
  /** Esc cierra. Los diálogos con su propio manejo de Esc (avisos con Enter, pasos internos) lo omiten. */
  onClose?: () => void;
  /** `alertdialog` para avisos y confirmaciones que exigen una respuesta. */
  role?: "dialog" | "alertdialog";
  /** id del texto que describe el diálogo (alertdialog). */
  describedBy?: string;
  /** Selector (dentro del diálogo) del elemento con el foco inicial. Por defecto, `[data-autofocus]` o el primer campo. */
  initialFocus?: string;
}

export function useModal({ onClose, role = "dialog", describedBy, initialFocus }: ModalOptions = {}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const token = useRef<object>({}).current;
  const [trigger] = useState(returnTarget);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    stack.push(token);
    return () => stack.remove(token);
  }, [token]);

  // Foco inicial: lo que ya tomó autoFocus se respeta; si no, un campo de texto y, si no hay, el primer botón.
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const dialog = root.querySelector<HTMLElement>('[role="dialog"], [role="alertdialog"]') ?? root;
    const cur = document.activeElement;
    if (cur && cur !== dialog && root.contains(cur)) return;
    const pick =
      (initialFocus && root.querySelector<HTMLElement>(initialFocus)) ||
      root.querySelector<HTMLElement>("[data-autofocus]") ||
      Array.from(root.querySelectorAll<HTMLElement>(FIELD)).find(visible) ||
      focusables(root).find((el) => !el.hasAttribute("data-modal-close") && el.getAttribute("aria-label") !== "Cerrar");
    (pick ?? dialog).focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Al cerrar, el foco vuelve a quien abrió el diálogo, salvo que ya esté en otro diálogo.
  useEffect(
    () => () => {
      const cur = document.activeElement;
      if (cur?.closest('[aria-modal="true"]')) return;
      if (trigger?.isConnected && (!cur || cur === document.body || !cur.isConnected)) trigger.focus({ preventScroll: true });
    },
    [trigger],
  );

  useEffect(() => {
    let inside: HTMLElement | null = null;
    let pulls: number[] = [];
    const onKey = (e: KeyboardEvent) => {
      if (!stack.isTop(token)) return;
      const root = ref.current;
      if (!root) return;
      if (e.key === "Escape") {
        // Un menú abierto o un control que ya atendió Esc van primero.
        if (e.defaultPrevented || !closeRef.current || document.querySelector('[role="menu"]')) return;
        e.preventDefault();
        closeRef.current();
      } else if (e.key === "Tab" && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const list = focusables(root);
        const to = trapIndex(list.length, list.indexOf(document.activeElement as HTMLElement), e.shiftKey);
        if (to === null) return;
        e.preventDefault();
        (to < 0 ? (root.querySelector<HTMLElement>('[role="dialog"], [role="alertdialog"]') ?? root) : list[to]).focus();
      }
    };
    // Si algo ajeno (la terminal de atrás) roba el foco, vuelve al último elemento del diálogo.
    const onFocusIn = (e: FocusEvent) => {
      const root = ref.current;
      const t = e.target as HTMLElement | null;
      if (!root || !t || !stack.isTop(token)) return;
      if (root.contains(t)) {
        inside = t;
        return;
      }
      if (t.closest('[role="menu"], [aria-modal="true"], [data-modal-allow]')) return;
      const now = Date.now();
      pulls = pulls.filter((x) => now - x < 100);
      if (pulls.length >= 3) return; // otro componente insiste: no se entra en un ciclo de robos de foco
      pulls.push(now);
      (inside?.isConnected ? inside : (focusables(root)[0] ?? root)).focus({ preventScroll: true });
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [token]);

  return {
    /** Id del título (`<h2 id={modal.titleId}>`): da nombre accesible al diálogo. */
    titleId,
    /** Contenedor que cubre la pantalla (fondo): delimita la trampa de foco. */
    overlay: { ref },
    /** Caja del diálogo. */
    dialog: {
      role,
      "aria-modal": true as const,
      "aria-labelledby": titleId,
      "aria-describedby": describedBy,
      tabIndex: -1,
    },
  };
}
