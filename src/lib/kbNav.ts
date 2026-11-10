/**
 * Navegación por teclado como funciones puras (sin DOM): las usan el árbol de sesiones, las
 * pestañas y la trampa de foco de los diálogos. Patrones de WAI-ARIA Authoring Practices 1.2
 * (Tabs, Tree View, Dialog Modal).
 */

export interface StepOptions {
  /** Teclas de flecha que avanzan: izquierda/derecha (horizontal) o arriba/abajo (vertical). */
  orientation: "horizontal" | "vertical";
  /** Al pasar del último al primero (y al revés). Los árboles no dan la vuelta. */
  wrap?: boolean;
  /** Filas que salta Re Pág/Av Pág (solo si se indica). */
  page?: number;
}

/** Índice al que lleva `key` desde `i` en una lista de `n`; -1 si la tecla no navega o no hay a dónde ir. */
export function stepIndex(key: string, i: number, n: number, o: StepOptions): number {
  if (n <= 0) return -1;
  const wrap = o.wrap ?? true;
  const [back, fwd] = o.orientation === "horizontal" ? ["ArrowLeft", "ArrowRight"] : ["ArrowUp", "ArrowDown"];
  let next: number;
  if (key === fwd) next = i + 1;
  else if (key === back) next = i - 1;
  else if (key === "Home") next = 0;
  else if (key === "End") next = n - 1;
  else if (o.page && key === "PageDown") next = i + o.page;
  else if (o.page && key === "PageUp") next = i - o.page;
  else return -1;
  if (key === fwd || key === back) {
    if (wrap) next = (next + n) % n;
    else if (next < 0 || next >= n) return -1;
  } else next = Math.max(0, Math.min(n - 1, next));
  return next === i ? -1 : next;
}

/** Quién recibe el foco al quitar el elemento `i` de una lista de `n` (antes de quitarlo): el siguiente o, si era el último, el anterior. -1: queda vacía. */
export function afterRemoval(n: number, i: number): number {
  if (n <= 1) return -1;
  return i < n - 1 ? i + 1 : i - 1;
}

export interface TreeRow {
  /** Nivel de anidación (1 = raíz). */
  level: number;
  folder: boolean;
  /** Carpeta que se puede plegar: abierta o cerrada. `undefined` = siempre abierta (p. ej. con un filtro activo). */
  expanded?: boolean;
}

export type TreeMove = { focus: number } | { expand: number } | { collapse: number } | { activate: number };

/**
 * Qué hace una tecla sobre la fila `i` de un árbol aplanado (solo filas visibles):
 * Abajo/Arriba/Inicio/Fin/Re Pág/Av Pág mueven el foco; Derecha abre la carpeta o entra en su
 * primer hijo; Izquierda la cierra o sube a la carpeta padre; Enter activa (conecta o alterna).
 */
export function treeKey(rows: TreeRow[], i: number, key: string, page = 10): TreeMove | null {
  const row = rows[i];
  if (!row) return null;
  if (key === "Enter") return { activate: i };
  if (key === "ArrowRight") {
    if (!row.folder) return null;
    if (row.expanded === false) return { expand: i };
    return rows[i + 1] && rows[i + 1].level > row.level ? { focus: i + 1 } : null;
  }
  if (key === "ArrowLeft") {
    if (row.folder && row.expanded === true) return { collapse: i };
    for (let j = i - 1; j >= 0; j--) if (rows[j].level < row.level) return { focus: j };
    return null;
  }
  const to = stepIndex(key, i, rows.length, { orientation: "vertical", wrap: false, page });
  return to < 0 ? null : { focus: to };
}

/**
 * Trampa de foco de un diálogo: dónde cae el foco con Tab (o Mayús+Tab) dado el elemento actual
 * `i` entre `n` enfocables (`i` = -1 si el foco está fuera). `null`: lo resuelve el navegador.
 * `-1` en el resultado: no hay enfocables y el foco va al propio diálogo.
 */
export function trapIndex(n: number, i: number, shift: boolean): number | null {
  if (n === 0) return -1;
  if (i < 0) return shift ? n - 1 : 0;
  if (!shift && i === n - 1) return 0;
  if (shift && i === 0) return n - 1;
  return null;
}

/** Pila de diálogos abiertos: solo el último atiende Esc y Tab (un aviso sobre Ajustes, por ejemplo). */
export function createStack<T>() {
  const items: T[] = [];
  return {
    push: (x: T) => void items.push(x),
    remove: (x: T) => {
      const i = items.indexOf(x);
      if (i >= 0) items.splice(i, 1);
    },
    isTop: (x: T) => items[items.length - 1] === x,
    get size() {
      return items.length;
    },
  };
}
