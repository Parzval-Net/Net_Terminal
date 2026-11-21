/**
 * Saltos en curso (destino de cada uno), para que quien cierra Herramientas avise antes de cortarlos:
 * Topología los publica al cambiar y los borra al desmontarse. Solo nombres, nunca credenciales.
 * Vive aparte de hopTab.ts para que App lo use sin cargar hopTab ni topology en el paquete principal;
 * hopTab.ts lo reexporta (mismo módulo, mismo estado).
 */
let running: string[] = [];
export const runningHops = (): string[] => running;
export const setRunningHops = (names: string[]) => {
  running = [...names];
};
/** Frase para el aviso al cerrar Herramientas: los saltos en curso se cortan (vacía si no hay). */
export const hopCloseNote = (names: string[]): string =>
  names.length
    ? `${names.length === 1 ? `Hay un salto en curso hacia ${names[0]}` : `Hay ${names.length} saltos en curso (${names.slice(0, 4).join(", ")}${names.length > 4 ? "…" : ""})`}: al cerrar Herramientas se detiene${names.length === 1 ? "" : "n"} y su pestaña queda en el último equipo alcanzado, sin escribir contraseñas. `
    : "";
