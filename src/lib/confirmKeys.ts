/**
 * Enter en un diálogo de confirmación (difusión y CLI Lab). Enter activa lo que tiene el foco:
 * sobre "Cancelar" cancela y nunca envía. Solo con el foco fuera de los controles (la caja del
 * diálogo) vale la acción por defecto, y únicamente si el envío no exige escribir la cantidad.
 */
export type EnterOn = "confirm" | "cancel" | "button" | "field" | "other";

/** Qué hace Enter según dónde está el foco. "native": se deja al control (otro botón). */
export function enterAction(on: EnterOn, needsCount: boolean, ok: boolean): "confirm" | "cancel" | "native" | null {
  switch (on) {
    case "cancel":
      return "cancel";
    case "confirm":
      return ok ? "confirm" : null;
    case "button":
      return "native";
    case "field":
      // En los campos (cantidad de equipos, pausa) Enter no envía: se confirma con el botón.
      return null;
    default:
      return !needsCount && ok ? "confirm" : null;
  }
}
