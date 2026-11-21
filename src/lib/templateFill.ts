/**
 * Plantillas con {{variables}}: nombres, relleno y versión para mostrar. Los valores de las
 * variables secretas (isSecretVar) se envían al equipo, pero no se muestran en confirmaciones ni
 * vistas previas (se ve ••••••) y el envío no se guarda en el historial de comandos.
 */
import { isSecretVar } from "./templateSecrets";

export const TEMPLATE_VAR = /\{\{\s*([\w.-]+)\s*\}\}/g;

/** Máscara de un valor secreto en la vista previa y las confirmaciones. */
export const SECRET_MASK = "••••••";

export function templateVars(text: string): string[] {
  return [...new Set([...text.matchAll(TEMPLATE_VAR)].map((m) => m[1]))];
}

export function fillTemplate(text: string, values: Record<string, string>): string {
  return text.replace(TEMPLATE_VAR, (_, name: string) => values[name] ?? "");
}

export interface FilledTemplate {
  /** Texto que se envía al equipo. */
  text: string;
  /** Texto que se muestra (confirmación, difusión, vista previa): secretos con ••••••. */
  shown: string;
  /** Hay al menos una variable secreta con valor: el envío no va al historial. */
  secret: boolean;
}

/** Rellena la plantilla y arma la versión enmascarada para mostrarla. */
export function fillTemplateMasked(text: string, values: Record<string, string>): FilledTemplate {
  const names = templateVars(text);
  const secret = names.some((n) => isSecretVar(n) && !!values[n]);
  const masked = Object.fromEntries(names.map((n) => [n, isSecretVar(n) && values[n] ? SECRET_MASK : (values[n] ?? "")]));
  return { text: fillTemplate(text, values), shown: fillTemplate(text, masked), secret };
}
