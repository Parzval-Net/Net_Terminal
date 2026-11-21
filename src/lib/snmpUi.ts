/**
 * Estado de la interfaz SNMP sin React: eventos de un trabajo del backend que llegan antes de
 * conocer su id, e ids estables para los traps recibidos. Lógica pura, probada en
 * scripts/tests/snmpUi.test.mjs.
 */
import type { Trap } from "./snmp";

export interface JobEvent {
  job: string;
  kind: string;
  text: string;
  data?: unknown;
}

/**
 * Seguimiento de un trabajo "tool-job". El backend lanza el hilo antes de devolver el id, así que
 * con un agente local o un subárbol vacío los eventos (incluido "done") pueden llegar antes de que
 * invoke resuelva. Mientras no hay id se guardan y, al conocerlo, se reproducen los de ese trabajo.
 * Mismo patrón que la búsqueda en logs (LogSearchTool).
 */
export class JobTracker {
  id: string | null = null;
  private early: JobEvent[] | null = null;

  /** Antes de invocar el comando que crea el trabajo. */
  begin() {
    this.id = null;
    this.early = [];
  }

  /** Evento recibido: devuelve los que se deben procesar ahora (vacío si se guardó o es de otro trabajo). */
  push(e: JobEvent): JobEvent[] {
    if (this.early) {
      this.early.push(e);
      return [];
    }
    return this.id !== null && e.job === this.id ? [e] : [];
  }

  /** Id conocido: devuelve los eventos guardados de ese trabajo, en orden. */
  resolve(id: string): JobEvent[] {
    const pending = this.early ?? [];
    this.early = null;
    this.id = id;
    return pending.filter((e) => e.job === id);
  }

  /** El comando falló o el trabajo terminó: se descartan los eventos guardados. */
  reset() {
    this.early = null;
    this.id = null;
  }
}

/** Trap con un id propio, asignado al recibirlo: la fila expandida no cambia al llegar traps nuevos. */
export type TrapRow = Trap & { id: number };

/**
 * Agrega un lote de traps (el backend los manda del más antiguo al más nuevo) al inicio de la lista,
 * con ids crecientes desde `next`, y recorta a `max`. Devuelve la lista y el próximo id.
 */
export function prependTraps(list: TrapRow[], batch: Trap[], next: number, max: number): { list: TrapRow[]; next: number } {
  const rows = batch.map((t, k) => ({ ...t, id: next + k }));
  return { list: [...rows.reverse(), ...list].slice(0, max), next: next + batch.length };
}
