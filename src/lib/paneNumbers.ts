/**
 * Números de panel de la vista dividida según el orden de las pestañas en la barra: la pestaña que
 * va más a la izquierda (o más arriba en vertical) es el panel 1. Así el badge de la pestaña y la
 * cabecera del panel muestran el mismo número y la barra se lee 1, 2, 3… sin reordenar pestañas.
 * Los paneles vacíos (o con una pestaña que ya no está) toman los números siguientes, por posición.
 * Devuelve el número de cada panel (índice = posición del panel).
 */
export function paneNumbers(panes: readonly (string | null)[], order: readonly string[]): number[] {
  const rank = new Map(order.map((id, i) => [id, i]));
  const filled = panes
    .map((id, i) => ({ i, r: id != null ? rank.get(id) : undefined }))
    .filter((p): p is { i: number; r: number } => p.r !== undefined)
    .sort((a, b) => a.r - b.r);
  const out = new Array<number>(panes.length).fill(0);
  let n = 1;
  for (const p of filled) out[p.i] = n++;
  for (let i = 0; i < panes.length; i++) if (!out[i]) out[i] = n++;
  return out;
}

/** Número de panel de cada pestaña que está en la vista dividida (id → número). */
export function tabPaneNumbers(panes: readonly (string | null)[] | null | undefined, order: readonly string[]): Map<string, number> {
  const m = new Map<string, number>();
  if (!panes) return m;
  const nums = paneNumbers(panes, order);
  panes.forEach((id, i) => id && m.set(id, nums[i]));
  return m;
}
