/**
 * Lectura de comandos de consulta para el descubrimiento de Topología: prueba las alternativas de
 * cada comando, desactiva el paginador donde el fabricante lo permite por comando y, sobre todo,
 * no deja pasar una salida cortada como si fuera completa. Lógica pura (recibe quién ejecuta), para
 * poder probarla sin sesión ni backend.
 */
import { stripPager } from "./cliText";
import { FALLBACK_COMMANDS, isCliError, withNoPager } from "./topology";
import type { TopoVendor } from "./topology";

/** Lo que devuelve la ejecución de un comando: su salida y, si se cortó, el motivo (ver deviceRun.ts). */
export interface ExecResult {
  output: string;
  cut?: string;
}
export type Exec = (cmd: string) => Promise<ExecResult>;

export interface CommandReader {
  /**
   * Ejecuta `cmd` (y sus alternativas si el equipo no lo reconoce) y devuelve la salida sin restos
   * del paginador. Tras un corte no se envía nada más: devuelve "" y anota el comando en `skipped`.
   */
  run: (cmd: string) => Promise<string>;
  /** La salida de ese comando se cortó (o no se llegó a enviar por un corte anterior). */
  wasCut: (cmd: string) => boolean;
  /** Comando cuya salida se cortó y por qué (plazo vencido, tope de páginas o de salida, sesión cerrada). */
  cut?: { cmd: string; why: string };
  /** Comandos que no se enviaron por el corte. */
  skipped: string[];
}

/** NX-OS: la variante en singular de un comando de IOS ("show interface status"). */
const NXOS_FORM = /^show interface /;

/**
 * Lector de comandos de un descubrimiento. `exec` ejecuta un comando en la sesión y dice si la
 * lectura se cortó. Por comando:
 * - En Junos y Huawei va con el filtro sin paginador ("| no-more"); si el equipo no reconoce el
 *   filtro se reenvía solo y no se vuelve a usar en este descubrimiento.
 * - Si el equipo no reconoce el comando, prueba sus alternativas (FALLBACK_COMMANDS) en orden. Una
 *   vez que respondió una variante de NX-OS ("show interface …"), las siguientes parten por ella.
 * - Una salida cortada (plazo, tope de páginas) se devuelve tal cual, queda anotada en `cut` y
 *   detiene la lectura: el equipo puede seguir enviando esa salida y el comando siguiente se
 *   mezclaría con ella. Antes se procesaba como completa.
 */
export function commandReader(exec: Exec, vendor: TopoVendor, onSend?: (cmd: string) => void): CommandReader {
  /** undefined: aún no se sabe si el equipo acepta el filtro sin paginador. */
  let noPagerOk: boolean | undefined;
  let nxos = false;
  const cutCmds = new Set<string>();
  const reader: CommandReader = {
    skipped: [],
    wasCut: (cmd) => cutCmds.has(cmd),
    run: async (cmd) => {
      if (reader.cut) {
        reader.skipped.push(cmd);
        cutCmds.add(cmd);
        return "";
      }
      /** Envía una variante; `done` si su salida se cortó (queda anotada y no se sigue). */
      const send = async (variant: string): Promise<{ out: string; done: boolean }> => {
        onSend?.(variant);
        const r = await exec(variant);
        const out = stripPager(r.output);
        if (r.cut) {
          reader.cut = { cmd: variant, why: r.cut };
          cutCmds.add(cmd);
        }
        return { out, done: !!r.cut };
      };
      const alts = FALLBACK_COMMANDS[cmd] ?? [];
      const variants = nxos ? [...alts.filter((a) => NXOS_FORM.test(a)), cmd, ...alts.filter((a) => !NXOS_FORM.test(a))] : [cmd, ...alts];
      let out = "";
      for (const v of variants) {
        const filtered = noPagerOk === false ? v : withNoPager(vendor, v);
        let r = await send(filtered);
        if (r.done) return r.out;
        if (filtered !== v) {
          if (!isCliError(r.out)) noPagerOk = true;
          else if (noPagerOk === undefined) {
            // Rechazado con el filtro y sin saber aún si el equipo lo acepta: se prueba el comando solo.
            r = await send(v);
            if (r.done) return r.out;
            if (!isCliError(r.out)) noPagerOk = false;
          }
        }
        out = r.out;
        if (!isCliError(out)) {
          if (v !== cmd && NXOS_FORM.test(v)) nxos = true;
          return out;
        }
      }
      return out;
    },
  };
  return reader;
}

/** Aviso visible de una lectura cortada: qué comando, por qué y qué se hizo con lo leído. */
export function partialNote(reader: Pick<CommandReader, "cut" | "skipped">): string {
  if (!reader.cut) return "";
  const rest = reader.skipped.length ? ` y no se ${reader.skipped.length === 1 ? "envió 1 comando más" : `enviaron ${reader.skipped.length} comandos más`}` : "";
  return `Resultado parcial: la salida de "${reader.cut.cmd}" se cortó (${reader.cut.why.replace(/\.$/, "")})${rest}. Se sumó lo que alcanzó a leerse, sin dar por retirado ningún enlace. Vuelve a descubrir para completar.`;
}

/**
 * Comando que apaga el paginador en la sesión: Cisco IOS/IOS-XE/NX-OS "terminal length 0" (Cisco IOS
 * Configuration Fundamentals Command Reference, "terminal length") y Huawei VRP "screen-length 0
 * temporary" (Huawei, Command Reference de VRP, "screen-length temporary"). Junos y Huawei ya van con
 * "| no-more" por comando; FortiOS no tiene uno de consulta verificado.
 */
export const PAGER_OFF: Partial<Record<TopoVendor, string>> = { cisco: "terminal length 0", huawei: "screen-length 0 temporary" };

/** Rutas de salto (por objeto) en cuyo último equipo ya se envió el comando: una vez por sesión vty. */
const pagerSent = new WeakSet<object>();

/**
 * Apaga el paginador en el equipo al que saltó una pestaña de NetTerminal, antes de leerlo. Solo con
 * la ruta en un equipo saltado (`steps` no vacío) y la pestaña verificada en él (`atLast`): la sesión
 * del usuario en el pivote no se toca. Es seguro porque "terminal length 0" y "screen-length 0
 * temporary" valen solo para esa sesión vty, no cambian la configuración guardada ni la de otras
 * sesiones y se pierden al salir del equipo. Se envía una vez por ruta (un salto nuevo es otro objeto
 * de ruta) y, si el equipo lo rechaza o falla, se sigue igual: el lector ya avanza el paginador.
 * Devuelve el comando enviado, o undefined si no correspondía.
 */
export async function pagerOffOnHop(
  route: { steps: unknown[] } | undefined,
  atLast: boolean,
  vendor: TopoVendor | undefined,
  exec: Exec,
): Promise<string | undefined> {
  const cmd = vendor ? PAGER_OFF[vendor] : undefined;
  if (!route || !route.steps.length || !atLast || !cmd || pagerSent.has(route)) return undefined;
  pagerSent.add(route);
  try {
    await exec(cmd);
  } catch {
    // Rechazado o sin respuesta: se sigue con el paginador del equipo.
  }
  return cmd;
}
