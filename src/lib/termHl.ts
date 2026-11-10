/**
 * Resaltados temporales de una pestaña (lógica pura, sin xterm). El usuario escribe un texto o una
 * expresión regular y elige un color; el motor de decoraciones (termDecor.ts) los pinta sobre la salida
 * ya recibida y la nueva. No tocan las reglas guardadas de resaltado por fabricante ni se persisten.
 */
import { regexError, riskyRegex } from "./highlight";

/** Máximo de resaltados activos por pestaña. */
export const MAX_HL = 8;
/** Largo máximo de un texto literal (las expresiones regulares siguen el tope de riskyRegex: 500). */
export const MAX_LITERAL = 200;
/** Líneas más largas que esto no se examinan (mismo criterio que el resaltado por fabricante, evita backtracking en líneas enormes). */
export const MAX_SCAN_LINE = 1000;

/** Fondo y texto por color: pares de alto contraste (texto casi negro sobre fondos claros) que valen en tema claro y oscuro. */
export const HL_COLORS = [
  { id: "yellow", label: "Amarillo", bg: "#fde047", fg: "#111111" },
  { id: "cyan", label: "Celeste", bg: "#67e8f9", fg: "#111111" },
  { id: "green", label: "Verde", bg: "#86efac", fg: "#111111" },
  { id: "pink", label: "Rosado", bg: "#f9a8d4", fg: "#111111" },
  { id: "orange", label: "Naranjo", bg: "#fdba74", fg: "#111111" },
  { id: "violet", label: "Violeta", bg: "#c4b5fd", fg: "#111111" },
] as const;

export type HlColorId = (typeof HL_COLORS)[number]["id"];

export interface TermHl {
  id: number;
  pattern: string;
  regex: boolean;
  matchCase: boolean;
  color: HlColorId;
}

export const colorOf = (id: HlColorId) => HL_COLORS.find((c) => c.id === id) ?? HL_COLORS[0];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** RegExp global del resaltado (texto literal escapado; sin distinguir mayúsculas salvo que se pida). */
export function buildRegex(h: Pick<TermHl, "pattern" | "regex" | "matchCase">): RegExp {
  return new RegExp(h.regex ? h.pattern : escapeRe(h.pattern), h.matchCase ? "g" : "gi");
}

/**
 * Segunda red contra backtracking catastrófico (ReDoS), más estricta que `riskyRegex`: un grupo que se repite sin
 * tope (`+`, `*`, `{n,}`) y que por dentro tiene alternativas o cuantificadores, como `(a|aa)+`, `(\w+\s?)+` o
 * `(\d+\.)*`, puede tardar un tiempo exponencial en una línea larga y congelar la interfaz. `riskyRegex` no ve los
 * que terminan en `?` ni los de alternativas. Un grupo repetido con cuenta fija (`{3}`, `{1,4}`) o sin nada
 * repetible por dentro (`(ab)+`) es seguro. Devuelve el mensaje de error o null.
 */
export function repeatedGroupRisk(pattern: string): string | null {
  const stack: number[] = [];
  let inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "\\") {
      i++;
      continue;
    }
    if (inClass) {
      if (c === "]") inClass = false;
      continue;
    }
    if (c === "[") inClass = true;
    else if (c === "(") stack.push(i);
    else if (c === ")") {
      const start = stack.pop();
      if (start === undefined) continue;
      const rest = pattern.slice(i + 1);
      if (!/^(?:[+*]|\{\d+,\})/.test(rest)) continue;
      // Cuerpo sin el prefijo del grupo ((?:, (?=, (?<n>) y sin escapes ni clases de caracteres.
      const body = pattern
        .slice(start + 1, i)
        .replace(/^\?(?::|=|!|<=|<!|<[A-Za-z_]\w*>)/, "")
        .replace(/\\./g, "")
        .replace(/\[(?:[^\]\\]|\\.)*\]/g, "");
      if (/[|+*?{]/.test(body)) return "Un grupo repetido con alternativas o cuantificadores dentro, como (a|b)+ o (a+b?)*, puede congelar la app. Simplifica el patrón.";
    }
  }
  return null;
}

/**
 * Valida lo que escribió el usuario; devuelve el mensaje de error o null. Reutiliza las validaciones de
 * las reglas de resaltado (regexError, riskyRegex: cuantificadores anidados que congelarían la app) y agrega
 * `repeatedGroupRisk` para los casos que esas no ven.
 */
export function validateHl(
  input: Pick<TermHl, "pattern" | "regex" | "matchCase">,
  existing: readonly TermHl[] = [],
): string | null {
  const { pattern, regex } = input;
  if (!pattern.trim()) return "Escribe el texto o la expresión que quieres resaltar";
  if (existing.length >= MAX_HL) return `Máximo ${MAX_HL} resaltados por pestaña: quita alguno primero`;
  if (existing.some((h) => h.pattern === pattern && h.regex === regex && h.matchCase === input.matchCase)) return "Ese resaltado ya está en la lista";
  if (!regex) return pattern.length > MAX_LITERAL ? `Texto demasiado largo (máx. ${MAX_LITERAL} caracteres)` : null;
  const bad = regexError(pattern) ?? riskyRegex(pattern) ?? repeatedGroupRisk(pattern);
  if (bad) return bad;
  // Una expresión que coincide con texto vacío (a*, x?) marcaría todo: no resalta nada útil.
  if (buildRegex(input).test("")) return "La expresión coincide con texto vacío: haz que exija al menos un carácter";
  return null;
}

/** Tramos [inicio, fin) de las coincidencias en un texto (sin vacíos); `max` acota la cantidad por línea. */
export function findSpans(text: string, re: RegExp, max = 100): [number, number][] {
  const out: [number, number][] = [];
  if (!text || text.length > MAX_SCAN_LINE * 4) return out;
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) && out.length < max) {
    if (m[0] === "") {
      re.lastIndex++;
      continue;
    }
    out.push([m.index, m.index + m[0].length]);
  }
  return out;
}

/** Texto de celdas de ancho 1 y una sola unidad por celda (ASCII y latino): la posición en el texto es la columna. */
const NARROW = /^[\x20-\x7e\u00a0-\u024f]*$/;
/** La fila es solo de celdas de ancho 1 (ver NARROW). */
export const isNarrow = (s: string) => NARROW.test(s);

/** Una fila del búfer vista como texto: por cada unidad UTF-16, su fila, columna y ancho en celdas. */
export interface RowText {
  text: string;
  rows: number[];
  cols: number[];
  widths: number[];
}

/** Celda tal como la lee `IBufferLine.getCell`: sus caracteres y su ancho (0: continuación de un carácter ancho). */
export interface CellLike {
  getChars(): string;
  getWidth(): number;
}

/**
 * Texto de una fila lógica (varias filas si la línea se envolvió) con el mapa unidad de texto → celda.
 * `cell(row, x)` entrega la celda; `cols` es el ancho de la terminal. Caracteres anchos, emoji y
 * combinados ocupan más o menos celdas que unidades de texto: por eso se arma el mapa celda a celda.
 */
export function rowText(
  rowsList: number[],
  cols: number,
  cell: (row: number, x: number) => CellLike | undefined,
  /** Texto completo de la fila (translateToString(false)): si es solo latino ancho 1 se usa tal cual, sin leer celda a celda. */
  plain?: (row: number) => string | undefined,
): RowText {
  let text = "";
  const rows: number[] = [];
  const cs: number[] = [];
  const widths: number[] = [];
  for (const row of rowsList) {
    const s = plain?.(row);
    if (s !== undefined && s.length <= cols && NARROW.test(s)) {
      for (let x = 0; x < s.length; x++) {
        rows.push(row);
        cs.push(x);
        widths.push(1);
      }
      text += s;
      continue;
    }
    for (let x = 0; x < cols; x++) {
      const c = cell(row, x);
      if (!c) break;
      const w = c.getWidth();
      if (w === 0) continue;
      const chars = c.getChars() || " ";
      for (let k = 0; k < chars.length; k++) {
        rows.push(row);
        cs.push(x);
        widths.push(w);
      }
      text += chars;
    }
  }
  return { text, rows, cols: cs, widths };
}

export interface CellSegment {
  row: number;
  x: number;
  width: number;
}

/** Celdas que cubre el tramo [start, end) del texto, una entrada por fila (un tramo puede cruzar el salto de una línea envuelta). */
export function segmentsOf(rt: Pick<RowText, "rows" | "cols" | "widths">, start: number, end: number): CellSegment[] {
  const out: CellSegment[] = [];
  let i = start;
  while (i < end) {
    const row = rt.rows[i];
    const x = rt.cols[i];
    let right = x + rt.widths[i];
    let j = i + 1;
    while (j < end && rt.rows[j] === row) {
      right = Math.max(right, rt.cols[j] + rt.widths[j]);
      j++;
    }
    out.push({ row, x, width: Math.max(1, right - x) });
    i = j;
  }
  return out;
}
