/**
 * Bloqueo automático de la bóveda con contraseña maestra (Ajustes › Credenciales). La interfaz solo
 * envía la configuración: el reloj, el borrado de la llave y el aviso `creds-changed` están en Rust
 * (credentials.rs), con un temporizador que existe solo mientras la bóveda está desbloqueada.
 */
import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

/** Opciones del selector (minutos; 0 = nunca). */
export const AUTOLOCK_CHOICES: [number, string][] = [
  [0, "Nunca"],
  [5, "5 minutos"],
  [15, "15 minutos"],
  [30, "30 minutos"],
  [60, "1 hora"],
  [240, "4 horas"],
];

/** Minutos válidos para el backend (0 a 24 h, enteros). */
export const autolockMinutes = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.min(1440, Math.max(0, Math.round(n))) : 0);

/** Envía la configuración al backend al iniciar y en cada cambio. */
export function useVaultAutoLock(minutes: number | undefined, onSleep: boolean | undefined) {
  useEffect(() => {
    if (minutes === undefined) return;
    invoke("vault_autolock_set", { minutes: autolockMinutes(minutes), onSleep: onSleep === true }).catch(console.error);
  }, [minutes, onSleep]);
}
