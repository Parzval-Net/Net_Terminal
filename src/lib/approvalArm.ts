/**
 * Retardo de seguridad de los diálogos de aprobación (agentes IA y scripts). Las solicitudes
 * se encolan y la siguiente aparece en la misma posición: sin este retardo, el segundo clic
 * de un doble clic en «Permitir» aprobaba también la solicitud siguiente, que puede ser un
 * cambio de configuración. «Permitir» queda deshabilitado un momento cada vez que se muestra
 * una solicitud nueva.
 */
import { useCallback, useEffect, useRef, useState } from "react";

/** Más que el intervalo de doble clic por defecto de Windows (500 ms) y macOS. */
export const ARM_DELAY_MS = 600;

/** true si ya pasó el retardo desde que se mostró la solicitud. */
export function isArmed(shownAt: number, now: number, delay = ARM_DELAY_MS): boolean {
  return now - shownAt >= delay;
}

/**
 * `armed` es false durante ARM_DELAY_MS cada vez que cambia `requestKey` (una solicitud nueva),
 * aunque el diálogo no se vuelva a montar; sirve para deshabilitar «Permitir». `canApprove()`
 * repite la comprobación con el reloj al momento del clic, por si el estado aún no se aplicó.
 */
export function useArmed(requestKey: string, delay = ARM_DELAY_MS): { armed: boolean; canApprove: () => boolean } {
  const shown = useRef({ key: requestKey, at: performance.now() });
  if (shown.current.key !== requestKey) shown.current = { key: requestKey, at: performance.now() };
  const [armedKey, setArmedKey] = useState<string | null>(null);
  useEffect(() => {
    const t = window.setTimeout(() => setArmedKey(requestKey), delay);
    return () => window.clearTimeout(t);
  }, [requestKey, delay]);
  const canApprove = useCallback(
    () => shown.current.key === requestKey && isArmed(shown.current.at, performance.now(), delay),
    [requestKey, delay],
  );
  // En el render en que cambia la clave, armedKey aún es la anterior: ya cuenta como no armado.
  return { armed: armedKey === requestKey, canApprove };
}
