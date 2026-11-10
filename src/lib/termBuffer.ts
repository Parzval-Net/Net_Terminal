/**
 * Filas del búfer de xterm que se leen como "lo último que muestra la pantalla". En xterm
 * `buffer.length` incluye las filas en blanco del viewport bajo el cursor: en una pestaña recién
 * abierta (o tras clear) con un viewport de 40 filas y 4 líneas escritas, contar desde
 * `length - n` devuelve solo filas vacías y nadie ve el prompt. Se cuenta hacia atrás desde la
 * fila del cursor (`baseY + cursorY`), que es donde está el prompt o lo último que llegó.
 * Devuelve el rango [start, end) de filas absolutas.
 */
export function recentRows(buf: { length: number; baseY: number; cursorY: number }, n: number): [number, number] {
  const end = Math.max(0, Math.min(buf.length, buf.baseY + buf.cursorY + 1));
  return [Math.max(0, end - Math.max(0, Math.floor(n))), end];
}
