/**
 * Pegado seguro: análisis puro del texto que se pega en un equipo remoto (sin xterm ni DOM).
 *
 * Qué se ejecuta de verdad: solo las líneas que terminan en salto de línea (Enter). La última, si el
 * texto no termina en salto, queda escrita en el prompt sin ejecutarse. El riesgo se calcula con el
 * mismo motor que Notas, catálogo y botones (computeRisk, que a su vez aplica editedLine a las teclas de
 * edición) y la confirmación sigue la misma regla que `sendResolved` de App (ver `pasteDecision`).
 *
 * Decisión de diseño: Tab y "?" dentro de una línea no fuerzan confirmación por sí solos (son
 * autocompletado y ayuda del equipo). Esc y Ctrl-D sí (computeRisk los trata como "puede cortar servicio").
 */
import { computeRisk, editedLine, type Risk } from "./packs";

export type FlagKind = "tab" | "esc" | "eof" | "ctrl" | "edit" | "cr" | "invisible";

/** Etiqueta y si fuerza la confirmación. */
export const FLAG_INFO: Record<FlagKind, { label: string; forces: boolean }> = {
  tab: { label: "Tabulación (el equipo la toma como autocompletar)", forces: false },
  esc: { label: "Esc (el equipo lo interpreta como tecla)", forces: true },
  eof: { label: "Ctrl-D (fin de entrada)", forces: true },
  ctrl: { label: "Caracteres de control (Ctrl-*)", forces: true },
  edit: { label: "Teclas de edición (retroceso, Ctrl-U, Ctrl-W, Ctrl-C): la línea que ejecuta el equipo difiere de la pegada", forces: true },
  cr: { label: "Retorno de carro suelto (CR sin LF): se toma como Enter", forces: false },
  invisible: { label: "Caracteres invisibles o de dirección de texto", forces: true },
};

export interface PasteLine {
  /** Texto de la línea sin el salto final. */
  raw: string;
  /** Como lo arma el equipo tras las teclas de edición (editedLine). */
  effective: string;
  /** Con los caracteres de control a la vista (␛, ⇥, ␈…), en texto plano. */
  shown: string;
  /** Lo mismo en partes (ver lineParts) para dibujar cada carácter especial como etiqueta. */
  parts: LinePart[];
  risk: Risk;
  flags: FlagKind[];
  /** Termina en salto de línea: el equipo la ejecuta. La última sin salto solo queda escrita. */
  executes: boolean;
}

export interface PasteAnalysis {
  lines: PasteLine[];
  /** Caracteres del texto pegado (puntos de código). */
  chars: number;
  endsWithNewline: boolean;
  /** Líneas que se ejecutan (terminan en salto de línea). */
  executed: number;
  /** Mayor riesgo entre las líneas que se ejecutan (y de ese bloque completo). */
  risk: Risk;
  /** Tipos de carácter especial presentes, con su cuenta. */
  flags: { kind: FlagKind; count: number; names?: string }[];
  /** Hay algo que obliga a confirmar aunque sea una sola línea sin Enter (todo menos Tab y CR suelto). */
  forced: boolean;
  /** Líneas separadas con CR suelto y también con LF: lo que se ve depende de quién lo lea. */
  mixedBreaks: boolean;
}

const RANK: Record<Risk, number> = { read: 0, change: 1, disruptive: 2 };
const maxRisk = (a: Risk, b: Risk): Risk => (RANK[a] >= RANK[b] ? a : b);

const EDIT = /[\x03\x08\x15\x17\x7f]/;
const CTRL = /[\x00-\x02\x05-\x07\x0b\x0c\x0e-\x14\x16\x18-\x1a\x1c-\x1f\x80-\x9f]/;
const INVISIBLE = /[​-‏‪-‮⁦-⁩]/;

/** Nombre corto de un carácter de control: Ctrl-A… Ctrl-Z, Esc, DEL. */
export function ctrlName(c: string): string {
  const n = c.charCodeAt(0);
  if (n === 0x1b) return "Esc";
  if (n === 0x09) return "Tab";
  if (n === 0x7f) return "DEL";
  if (n === 0x08) return "BS";
  if (n >= 1 && n <= 26) return `Ctrl-${String.fromCharCode(64 + n)}`;
  if (n < 0x20) return `0x${n.toString(16).padStart(2, "0")}`;
  return `U+${n.toString(16).toUpperCase().padStart(4, "0")}`;
}

export interface LinePart {
  text: string;
  /** Es un carácter especial: su nombre (Esc, Ctrl-D, Tab, U+202E…). */
  ctrl?: string;
  /** Obliga a confirmar (todos menos Tab). */
  forces?: boolean;
}

/** La línea partida en texto normal y caracteres especiales con nombre, para mostrarlos como etiquetas legibles. */
export function lineParts(line: string): LinePart[] {
  const out: LinePart[] = [];
  for (const piece of line.split(/([\x00-\x1f\x7f-\x9f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff])/)) {
    if (!piece) continue;
    if (piece.length === 1 && /[\x00-\x1f\x7f-\x9f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/.test(piece)) out.push({ text: "", ctrl: ctrlName(piece), forces: piece !== "\t" });
    else out.push({ text: piece });
  }
  return out;
}

/** Línea con los caracteres de control visibles (␛, ⇥, ␈…) para no ocultar nada en la vista previa. */
export function showControls(line: string): string {
  return line.replace(/[\x00-\x1f\x7f-\x9f​-‏‪-‮⁦-⁩﻿]/g, (c) => {
    const n = c.charCodeAt(0);
    if (n === 9) return "⇥";
    if (n < 0x20) return String.fromCharCode(0x2400 + n);
    if (n === 0x7f) return "␡";
    return `⟨U+${n.toString(16).toUpperCase().padStart(4, "0")}⟩`;
  });
}

/** Separa el texto en líneas con su terminador. Un "\r" suelto también es Enter para el equipo (xterm lo envía igual). */
export function splitPaste(text: string): { content: string; sep: "\n" | "\r\n" | "\r" | "" }[] {
  const out: { content: string; sep: "\n" | "\r\n" | "\r" | "" }[] = [];
  const re = /\r\n|\r|\n/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    out.push({ content: text.slice(last, m.index), sep: m[0] as "\n" | "\r\n" | "\r" });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ content: text.slice(last), sep: "" });
  return out;
}

function flagsOf(raw: string, first: boolean): FlagKind[] {
  const f: FlagKind[] = [];
  if (raw.includes("\t")) f.push("tab");
  if (raw.includes("\x1b")) f.push("esc");
  if (raw.includes("\x04")) f.push("eof");
  if (CTRL.test(raw)) f.push("ctrl");
  if (EDIT.test(raw)) f.push("edit");
  // Un BOM al comienzo del texto copiado es inocuo; en medio, o cualquier otro invisible, no.
  if (INVISIBLE.test(raw) || raw.includes("﻿", first && raw.startsWith("﻿") ? 1 : 0)) f.push("invisible");
  return f;
}

export function analyzePaste(text: string): PasteAnalysis {
  const parts = splitPaste(text);
  const lines: PasteLine[] = [];
  const counts = new Map<FlagKind, number>();
  const names = new Map<FlagKind, Set<string>>();
  let crLone = 0;
  let lfBreaks = 0;
  const bump = (k: FlagKind, n = 1) => counts.set(k, (counts.get(k) ?? 0) + n);
  parts.forEach((p, i) => {
    if (p.sep === "\r") crLone++;
    else if (p.sep) lfBreaks++;
    const flags = flagsOf(p.content, i === 0);
    for (const k of flags) {
      bump(k);
      if (k === "esc" || k === "eof" || k === "ctrl" || k === "edit") {
        const set = names.get(k) ?? new Set<string>();
        for (const c of p.content.match(k === "esc" ? /\x1b/g : k === "eof" ? /\x04/g : k === "edit" ? /[\x03\x08\x15\x17\x7f]/g : new RegExp(CTRL.source, "g")) ?? []) set.add(ctrlName(c));
        names.set(k, set);
      }
    }
    lines.push({
      raw: p.content,
      effective: editedLine(p.content),
      shown: showControls(p.content),
      parts: lineParts(p.content),
      // computeRisk ya aplica editedLine y trata Esc, Ctrl-D y los invisibles como "puede cortar servicio".
      risk: computeRisk(p.content),
      flags,
      executes: p.sep !== "",
    });
  });
  if (crLone) bump("cr", crLone);
  const exec = lines.filter((l) => l.executes);
  // El bloque completo también: el contexto de varias líneas puede cambiar la lectura de una sola.
  let risk: Risk = exec.length ? computeRisk(exec.map((l) => l.raw).join("\n")) : "read";
  for (const l of exec) risk = maxRisk(risk, l.risk);
  const mixedBreaks = crLone > 0 && lfBreaks > 0;
  const flags = [...counts.entries()].map(([kind, count]) => ({ kind, count, names: names.get(kind) ? [...names.get(kind)!].join(", ") : undefined }));
  return {
    lines,
    chars: [...text].length,
    endsWithNewline: parts.length > 0 && parts[parts.length - 1].sep !== "",
    executed: exec.length,
    risk,
    flags,
    forced: flags.some((f) => FLAG_INFO[f.kind].forces) || mixedBreaks,
    mixedBreaks,
  };
}

export interface PasteDecision {
  /** Pide confirmación antes de escribir en el equipo. */
  ask: boolean;
  /** Botón de peligro y foco inicial en Cancelar. */
  danger: boolean;
  reasons: string[];
}

/**
 * Misma regla que `sendResolved` (App): lo que puede cortar servicio se confirma siempre; el resto según
 * "Confirmar envío de varias líneas" (varias líneas o un cambio de configuración). Además, cualquier carácter
 * de control (salvo Tab y el CR suelto) obliga a confirmar. Un texto que no termina en salto de línea no se
 * ejecuta: una sola línea sin Enter se pega sin preguntar.
 */
export function pasteDecision(a: PasteAnalysis, o: { remote: boolean; confirmSend: boolean }): PasteDecision {
  const none: PasteDecision = { ask: false, danger: false, reasons: [] };
  if (!o.remote || !a.lines.length) return none;
  const nonBlank = a.lines.filter((l) => l.raw.trim()).length;
  const multi = nonBlank > 1;
  const reasons: string[] = [];
  if (a.forced) reasons.push("Contiene caracteres especiales que el equipo interpreta como teclas");
  if (a.risk === "disruptive") reasons.push("Puede cortar servicio");
  else if (o.confirmSend && a.risk === "change") reasons.push("Cambia configuración o estado");
  if (o.confirmSend && multi) reasons.push("Varias líneas: cada una se ejecuta como si la escribieras");
  const ask = reasons.length > 0;
  return { ask, danger: a.risk === "disruptive" || a.forced, reasons };
}

/** Trozos para enviar línea a línea: cada línea terminada con el Enter de la sesión; la última sin salto queda sin Enter. */
export function pasteChunks(text: string, newline: string): string[] {
  return splitPaste(text).map((p) => p.content + (p.sep ? newline : ""));
}
