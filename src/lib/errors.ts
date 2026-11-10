/** Texto legible de un error del backend (cadena, Error u objeto), sin el prefijo "Error:". */
export function errText(e: unknown): string {
  let raw: string;
  if (e instanceof Error) raw = e.message;
  else if (typeof e === "string") raw = e;
  else {
    try {
      raw = JSON.stringify(e) ?? "";
    } catch {
      raw = "";
    }
  }
  return raw.replace(/^Error:\s*/i, "").trim() || "error desconocido";
}

/** "No se pudo <acción>. Motivo: <error>": el error del backend siempre va con su contexto. */
export function failText(action: string, e: unknown): string {
  return `No se pudo ${action}. Motivo: ${errText(e)}`;
}
