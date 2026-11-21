/**
 * Nombre de la sesión donde se ejecutará un plugin con permiso "session". La conexión tiene el
 * id `<pestaña>#<intento>` (TerminalView lo arma así en cada conexión o reconexión): se busca la
 * pestaña por la parte anterior al último «#». null si no hay conexión o la pestaña no aparece.
 */
export function pluginSessionName(conn: string | null, tabs: readonly { tabId: string; name: string }[] | undefined): string | null {
  if (!conn || !tabs) return null;
  const cut = conn.lastIndexOf("#");
  const tabId = cut > 0 ? conn.slice(0, cut) : conn;
  return tabs.find((t) => t.tabId === tabId)?.name ?? null;
}
