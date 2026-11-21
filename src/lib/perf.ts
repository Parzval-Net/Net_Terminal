/** Lógica de Herramientas › Velocidad (speedtest e iperf3), sin dependencias de React. */

/** Puerto TCP escrito en un campo: entero de 1 a 65535, o null si no es válido. */
export function parsePort(text: string): number | null {
  const t = text.trim();
  if (!/^\d{1,5}$/.test(t)) return null;
  const n = Number(t);
  return n >= 1 && n <= 65535 ? n : null;
}

/** Mensaje junto al campo de puerto; vacío si es válido. */
export function portError(text: string): string {
  if (!text.trim()) return "Ingresa un puerto";
  return parsePort(text) == null ? "Puerto fuera de rango (1 a 65535)" : "";
}

/**
 * Peso de cada fase del speedtest en el avance total, según lo que transfiere el backend
 * (nettools.rs): bajada 72,1 MB y subida 22 MB; la latencia (20 consultas vacías) se toma como 5 %.
 */
const PHASES: Record<string, { from: number; weight: number; step: number }> = {
  latency: { from: 0, weight: 0.05, step: 1 },
  download: { from: 0.05, weight: 0.95 * (72.1 / 94.1), step: 2 },
  upload: { from: 0.05 + 0.95 * (72.1 / 94.1), weight: 0.95 * (22 / 94.1), step: 3 },
};

/** Avance global (0 a 1) y paso actual de 3 a partir del avance de la fase que informa el backend. */
export function speedProgress(phase: string | undefined, progress: number | undefined): { value: number; step: number } {
  const p = phase ? PHASES[phase] : undefined;
  if (!p) return { value: 0, step: 1 };
  const local = Math.min(1, Math.max(0, progress ?? 0));
  return { value: p.from + p.weight * local, step: p.step };
}
