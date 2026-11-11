// Modo portable cifrado: tipos y lógica pura de la interfaz (qué pantalla mostrar, validación del
// diálogo de activación, textos de avance y resultado, aviso de actividad). Sin llamadas al backend:
// esas están en lib/api.ts. Detalle del formato en docs/TECNICO.md, "Modo portable cifrado".

export type DataOp = "encrypt" | "decrypt";

/** Estado que devuelve `datacrypt_status`. Nunca trae contraseñas ni contenido. */
export interface DataStatus {
  /** Edición portable: el modo solo se ofrece ahí. */
  available: boolean;
  encrypted: boolean;
  unlocked: boolean;
  busy: boolean;
  /** Conversión interrumpida pendiente. */
  journal: DataOp | null;
  /** Archivos en claro dentro de la carpeta cifrada (no se leen). */
  plaintext: string[];
  /** La llave de datos no se pudo leer (dañada o de una versión más nueva). */
  error: string | null;
  vaultExists: boolean;
  /** La bóveda usa contraseña maestra (no el llavero del sistema). */
  vaultMaster: boolean;
  logsActive: number;
  dataDir: string;
  /** Archivos cifrados dañados que se apartaron (`.danado-<fecha>`) en esta ejecución. */
  damaged: string[];
  /** Logs en claro de carpetas propias que no calzan con los nombres de la app: no se cifraron. */
  uncertain: string[];
  /** Aviso que no impide abrir (bloqueo de instancia única no disponible). */
  warning: string | null;
}

export interface DataProgress {
  done: number;
  total: number;
  bytes: number;
  totalBytes: number;
}

export interface DataReport {
  converted: number;
  aside: string[];
  incomplete: string[];
  bytes: number;
  ms: number;
}

export interface UnlockReport {
  vault: boolean;
  vaultExists: boolean;
}

/** Estado de una carpeta sin cifrar (o sin backend, como en el navegador de desarrollo). */
export const PLAIN_STATUS: DataStatus = {
  available: false,
  encrypted: false,
  unlocked: true,
  busy: false,
  journal: null,
  plaintext: [],
  error: null,
  vaultExists: false,
  vaultMaster: false,
  logsActive: 0,
  dataDir: "",
  damaged: [],
  uncertain: [],
  warning: null,
};

/** Error de una conversión: el motivo y, si desactivar dejaría archivos sin llave, la lista exacta. */
export interface ConvError {
  message: string;
  loss: string[];
}

/** Normaliza el error de `datacrypt_disable`/`datacrypt_resume` (objeto) o de otro comando (texto). */
export function convError(e: unknown): ConvError {
  if (e && typeof e === "object" && typeof (e as ConvError).message === "string") {
    const loss = (e as ConvError).loss;
    return { message: (e as ConvError).message, loss: Array.isArray(loss) ? loss.filter((x) => typeof x === "string") : [] };
  }
  return { message: String(e), loss: [] };
}

export type GateView = "loading" | "app" | "unlock" | "resume" | "error";

/**
 * Qué muestra la app al abrir: la app (carpeta en claro o ya desbloqueada), la pantalla de
 * desbloqueo, la de conversión interrumpida o el error de la llave de datos. Con la carpeta cifrada
 * nada de la app se monta antes de desbloquear.
 */
export function gateView(st: DataStatus | null): GateView {
  if (!st) return "loading";
  if (!st.encrypted) return "app";
  if (st.error) return "error";
  if (!st.unlocked) return "unlock";
  if (st.journal) return "resume";
  return "app";
}

/** Advertencias del diálogo de activación (una por línea, tono sobrio). */
export const ENABLE_WARNINGS = [
  "Sin la contraseña maestra no hay forma de recuperar los datos: ni la app ni nadie puede abrirlos.",
  "Las versiones anteriores de NetTerminal no abren una carpeta cifrada: muestran una sola sesión que lo explica y no modifican los datos.",
  "Guardar ajustes, sesiones y logs toma un poco más (cifrado por bloques) y al abrir la app se pide la contraseña.",
  "Los originales en claro se borran después de verificar cada copia cifrada. En un pendrive o SSD eso no garantiza que desaparezcan físicamente: si la carpeta ya estuvo en claro, puede quedar rastro en el dispositivo.",
  "No se cifran: la carpeta compartida (TFTP, HTTP y FTP), los scripts, los plugins, los packs de comandos propios, los mensajes de Syslog guardados ni los nombres, tamaños y fechas de los archivos.",
];

export interface EnableForm {
  /** Ya existe la bóveda con contraseña maestra (si no, se crea en el mismo paso). */
  hasVault: boolean;
  master: string;
  /** Confirmación (solo al crear la contraseña maestra). */
  confirm: string;
  /** Casilla "Entiendo que sin la contraseña maestra no hay recuperación". */
  ack: boolean;
  logsActive: number;
}

/** Validación del diálogo de activación: si se puede enviar y, si no, por qué (texto para mostrar). */
export function enableCheck(f: EnableForm): { ok: boolean; reason: string | null } {
  if (f.logsActive > 0) return { ok: false, reason: `Detén la grabación de log en ${f.logsActive === 1 ? "1 pestaña" : `${f.logsActive} pestañas`} antes de cifrar.` };
  if (!f.master) return { ok: false, reason: null };
  if (!f.hasVault) {
    if ([...f.master].length < 8) return { ok: false, reason: "La contraseña maestra debe tener al menos 8 caracteres." };
    if (f.confirm !== f.master) return { ok: false, reason: f.confirm ? "Las contraseñas no coinciden." : null };
  }
  if (!f.ack) return { ok: false, reason: null };
  return { ok: true, reason: null };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

/** Avance de una conversión: "12 de 40 archivos · 3,1 MB de 18,0 MB". */
export function progressText(p: DataProgress | null): string {
  if (!p) return "Preparando…";
  return `${p.done} de ${p.total} archivo${p.total === 1 ? "" : "s"} · ${formatBytes(p.bytes)} de ${formatBytes(p.totalBytes)}`;
}

/** Fracción 0..1 del avance (por bytes; por archivos si no hay bytes). */
export function progressRatio(p: DataProgress | null): number {
  if (!p) return 0;
  if (p.totalBytes > 0) return Math.min(1, p.bytes / p.totalBytes);
  return p.total > 0 ? Math.min(1, p.done / p.total) : 1;
}

/** Resultado de una conversión en una o dos frases. */
export function reportText(r: DataReport, op: DataOp): string {
  const n = r.converted;
  const what = op === "encrypt" ? "cifrado" : "descifrado";
  const parts = [`${n === 1 ? "1 archivo" : `${n} archivos`} ${what}${n === 1 ? "" : "s"} y verificado${n === 1 ? "" : "s"}.`];
  if (r.aside.length)
    parts.push(
      op === "encrypt"
        ? `${r.aside.length} en claro no coincidía${r.aside.length === 1 ? "" : "n"} con su versión cifrada y quedó aparte: ${r.aside.join(", ")}.`
        : `${r.aside.length} archivo${r.aside.length === 1 ? "" : "s"} en claro con el mismo nombre quedó aparte: ${r.aside.join(", ")}.`,
    );
  if (r.incomplete.length) parts.push(`Sin bloque de cierre (grabación cortada), se recuperó lo íntegro: ${r.incomplete.join(", ")}.`);
  return parts.join(" ");
}

/**
 * Aviso de actividad para el bloqueo por inactividad: con la carpeta cifrada, usar la app (teclado
 * o ratón) cuenta como uso. Devuelve una función que llama a `send` como mucho una vez cada
 * `interval` ms.
 */
export function throttle(send: () => void, interval = 20_000, now: () => number = Date.now): () => void {
  let last = -Infinity;
  return () => {
    const t = now();
    if (t - last < interval) return;
    last = t;
    send();
  };
}
