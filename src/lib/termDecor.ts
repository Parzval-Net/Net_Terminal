/**
 * Resaltados al vuelo y marcadores sobre un Terminal de xterm, con decoraciones y marcadores del propio
 * xterm. Sin costo en reposo: nada se registra mientras no haya resaltados ni marcas, y el recorrido de la
 * salida nueva solo existe mientras hay al menos un resaltado activo (se suscribe al primero y se suelta
 * al quitar el último). El camino de la salida (StreamHighlighter) no se toca.
 */
import type { IDecoration, IDisposable, IMarker, Terminal } from "@xterm/xterm";
import { type RowText, type TermHl, MAX_SCAN_TEXT, buildRegex, colorOf, findSpans, isNarrow, rowText, segmentsOf } from "./termHl";
import { SLOW_LINE_MS, disableSlowRule, isSlowRule } from "./highlight";
import { MAX_AUTO, MAX_MANUAL, jumpFrom, markAction, markLabel, markTarget } from "./termMarks";

/** Tope de decoraciones de resaltado por pestaña (protege la memoria con un patrón muy frecuente). */
export const MAX_DECOS = 3000;
/** Tiempo máximo por cuadro recorriendo el búfer: un historial grande se examina en varios cuadros. */
const BUDGET_MS = 8;

interface Item {
  hl: TermHl;
  re: RegExp;
  /** Se pasó del presupuesto de tiempo en una línea: deja de examinarse (con aviso). */
  slow?: boolean;
}
interface Deco {
  deco: IDecoration;
  hl: number;
}

export class HighlightEngine {
  private items: Item[] = [];
  private decos: Deco[] = [];
  /** Primera fila aún sin examinar de forma estable (inicio de la última línea lógica). */
  private pos: IMarker | null = null;
  private frame = 0;
  private resizeTimer: number | undefined;
  private subs: IDisposable[] = [];
  /** Se alcanzó MAX_DECOS: faltan coincidencias por pintar. */
  capped = false;

  constructor(
    private term: Terminal,
    private onChange: () => void,
  ) {}

  list(): (TermHl & { count: number })[] {
    this.decos = this.decos.filter((d) => !d.deco.isDisposed);
    return this.items.map(({ hl, slow }) => ({ ...hl, count: this.decos.filter((d) => d.hl === hl.id).length, ...(slow ? { slow } : {}) }));
  }

  get size() {
    return this.items.length;
  }

  add(hl: TermHl) {
    const re = buildRegex(hl);
    this.items.push({ hl, re, slow: isSlowRule(`hl/${re.flags}/${re.source}`) || undefined });
    if (this.items.length === 1) {
      this.subs.push(
        this.term.onWriteParsed(() => this.schedule()),
        this.term.onResize(() => this.rebuildSoon()),
      );
    }
    this.rebuild();
  }

  remove(id: number) {
    this.items = this.items.filter((i) => i.hl.id !== id);
    for (const d of this.decos) if (d.hl === id) d.deco.dispose();
    this.decos = this.decos.filter((d) => !d.deco.isDisposed);
    if (!this.items.length) this.stop();
    this.capped = false;
    this.onChange();
  }

  clear() {
    this.items = [];
    this.stop();
    this.capped = false;
    this.onChange();
  }

  dispose() {
    this.items = [];
    this.stop();
  }

  /** Suelta decoraciones, marcador y suscripciones: vuelve al costo cero. */
  private stop() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    window.clearTimeout(this.resizeTimer);
    for (const d of this.decos) d.deco.dispose();
    this.decos = [];
    this.pos?.dispose();
    this.pos = null;
    for (const s of this.subs) s.dispose();
    this.subs = [];
  }

  /** Vuelve a recorrer todo el búfer (alta de un resaltado o cambio de ancho: las líneas envueltas se mueven). */
  private rebuild() {
    for (const d of this.decos) d.deco.dispose();
    this.decos = [];
    this.pos?.dispose();
    this.pos = null;
    this.capped = false;
    this.schedule();
    this.onChange();
  }

  private rebuildSoon() {
    window.clearTimeout(this.resizeTimer);
    this.resizeTimer = window.setTimeout(() => this.items.length && this.rebuild(), 150);
  }

  private schedule() {
    if (!this.frame) this.frame = requestAnimationFrame(this.run);
  }

  private run = () => {
    this.frame = 0;
    const buf = this.term.buffer.active;
    // En pantallas completas (alterno) xterm no admite decoraciones: al volver se retoma.
    if (!this.items.length || buf.type !== "normal") return;
    const t0 = performance.now();
    const before = this.decos.length;
    let from = this.pos ? this.pos.line : 0;
    if (from < 0) from = 0;
    // Lo pintado desde la última línea lógica se rehace: pudo seguir escribiéndose (prompt, eco).
    while (this.decos.length && (this.decos[this.decos.length - 1].deco.isDisposed || this.decos[this.decos.length - 1].deco.marker.line >= from)) this.decos.pop()!.deco.dispose();
    const last = buf.length - 1;
    const cursorAbs = buf.baseY + buf.cursorY;
    // Inicio de la línea lógica del cursor: desde ahí se vuelve a examinar la próxima vez.
    let pending = Math.min(cursorAbs, last);
    while (pending > 0 && buf.getLine(pending)?.isWrapped) pending--;
    let r = from;
    let early = false;
    while (r <= last) {
      let e = r;
      while (e < last && buf.getLine(e + 1)?.isWrapped) e++;
      this.scan(r, e);
      r = e + 1;
      if (r <= last && performance.now() - t0 > BUDGET_MS) {
        early = true;
        break;
      }
    }
    this.moveMarker(early ? r : pending);
    if (early) this.schedule();
    if (this.decos.length !== before || early) this.onChange();
  };

  private moveMarker(row: number) {
    const buf = this.term.buffer.active;
    this.pos?.dispose();
    this.pos = this.term.registerMarker(Math.max(0, Math.min(buf.length - 1, row)) - (buf.baseY + buf.cursorY)) ?? null;
  }

  /**
   * Ejecuta `fn` con el regex de un resaltado y lo cronometra: si tarda más de SLOW_LINE_MS en una línea,
   * el resaltado deja de examinarse en esta pestaña y se avisa (segunda red tras validateHl).
   */
  private timed<T>(it: Item, fn: () => T): T {
    const t0 = performance.now();
    const r = fn();
    if (performance.now() - t0 > SLOW_LINE_MS && !it.slow) {
      it.slow = true;
      disableSlowRule(`hl/${it.re.flags}/${it.re.source}`, `Resaltado "${it.hl.pattern}"`);
      queueMicrotask(this.onChange);
    }
    return r;
  }

  /** Examina las filas [first, last] (una línea lógica) y pinta las coincidencias. */
  private scan(first: number, last: number) {
    const buf = this.term.buffer.active;
    const rowsList: number[] = [];
    let quick = "";
    let narrow = true;
    for (let r = first; r <= last; r++) {
      rowsList.push(r);
      const s = buf.getLine(r)?.translateToString(false) ?? "";
      quick += s;
      if (narrow && !isNarrow(s)) narrow = false;
    }
    // Una línea lógica enorme (sin saltos, miles de filas envueltas) no se examina: findSpans tampoco lo haría
    // y el prefiltro sobre 100 KB con un patrón como .*x tarda segundos.
    if (quick.length > MAX_SCAN_TEXT) return;
    // Lo habitual (texto latino y ninguna coincidencia): se descarta sin armar el mapa de celdas.
    if (narrow && (!quick.trim() || !this.items.some((it) => !it.slow && this.timed(it, () => ((it.re.lastIndex = 0), it.re.test(quick)))))) return;
    const rt: RowText = rowText(
      rowsList,
      this.term.cols,
      (row, x) => buf.getLine(row)?.getCell(x),
      (row) => buf.getLine(row)?.translateToString(false),
    );
    if (!rt.text.trim()) return;
    const cursorAbs = buf.baseY + buf.cursorY;
    for (const it of this.items) {
      if (it.slow) continue;
      const { hl, re } = it;
      const c = colorOf(hl.color);
      for (const [s, e] of this.timed(it, () => findSpans(rt.text, re))) {
        for (const seg of segmentsOf(rt, s, e)) {
          if (this.decos.length >= MAX_DECOS) {
            this.capped = true;
            return;
          }
          const marker = this.term.registerMarker(seg.row - cursorAbs);
          if (!marker) continue;
          const deco = this.term.registerDecoration({ marker, x: seg.x, width: seg.width, backgroundColor: c.bg, foregroundColor: c.fg });
          if (deco) this.decos.push({ deco, hl: hl.id });
          else marker.dispose();
        }
      }
    }
  }
}

export interface MarkInfo {
  id: number;
  line: number;
  kind: "manual" | "auto";
  text: string;
}

interface Mark {
  id: number;
  marker: IMarker;
  kind: "manual" | "auto";
  deco?: IDecoration;
}

/** Marcadores de línea: visibles en el margen (barra de acento) y navegables. Viven en el búfer de xterm. */
export class MarkEngine {
  private marks: Mark[] = [];
  private seq = 0;
  /** Último salto: marca y fila superior de la vista tras él (ver jumpFrom). */
  private last: { line: number; viewportY: number } | null = null;

  constructor(
    private term: Terminal,
    private onChange: () => void,
  ) {}

  private live() {
    return this.marks.filter((m) => !m.marker.isDisposed && m.marker.line >= 0);
  }

  get count() {
    return this.live().length;
  }

  /** Marcas ordenadas por línea con el texto actual de cada una. */
  list(): MarkInfo[] {
    const buf = this.term.buffer.active;
    return this.live()
      .map((m) => ({ id: m.id, line: m.marker.line, kind: m.kind, text: markLabel(buf.getLine(m.marker.line)?.translateToString(true) ?? "") }))
      .sort((a, b) => a.line - b.line);
  }

  /**
   * Marca una línea absoluta del búfer (la del cursor si no se indica). Devuelve qué pasó: "add", "remove"
   * (la línea ya tenía una marca manual: se quita), "promote" (una automática pasó a manual), "skip" o
   * "alt" si hay una pantalla completa (no admite marcadores).
   */
  mark(kind: "manual" | "auto", line?: number): "add" | "remove" | "promote" | "skip" | "alt" {
    const buf = this.term.buffer.active;
    if (buf.type !== "normal") return "alt";
    const abs = line ?? buf.baseY + buf.cursorY;
    this.prune();
    const existing = this.marks.find((m) => m.marker.line === abs);
    const act = markAction(existing?.kind, kind);
    if (act === "skip") return act;
    if (act === "remove") {
      this.drop(existing!);
      this.onChange();
      return act;
    }
    if (act === "promote") {
      existing!.kind = "manual";
      this.decorate(existing!);
      this.onChange();
      return act;
    }
    const marker = this.term.registerMarker(abs - (buf.baseY + buf.cursorY));
    if (!marker) return "skip";
    const m: Mark = { id: ++this.seq, marker, kind };
    marker.onDispose(() => {
      m.deco?.dispose();
      this.marks = this.marks.filter((x) => x !== m);
      this.onChange();
    });
    this.marks.push(m);
    this.decorate(m);
    this.trim(kind);
    this.onChange();
    return "add";
  }

  /** Quita una marca por id. */
  remove(id: number) {
    const m = this.marks.find((x) => x.id === id);
    if (m) this.drop(m);
    this.onChange();
  }

  clear() {
    for (const m of [...this.marks]) this.drop(m);
    this.marks = [];
    this.onChange();
  }

  /** Salta a la marca anterior o siguiente respecto de la primera fila visible; devuelve su información o null si no hay en esa dirección. */
  jump(dir: "prev" | "next"): { info: MarkInfo; index: number; total: number } | null {
    const list = this.list();
    const buf = this.term.buffer.active;
    const from = jumpFrom({ dir, viewportY: buf.viewportY, baseY: buf.baseY, length: buf.length, last: this.last });
    const line = markTarget(list.map((m) => m.line), from, dir);
    if (line === null) return null;
    this.term.scrollToLine(line);
    this.last = { line, viewportY: this.term.buffer.active.viewportY };
    return this.at(line);
  }

  /** Salta a una línea concreta (desde la lista). */
  goto(line: number) {
    this.term.scrollToLine(line);
    this.last = { line, viewportY: this.term.buffer.active.viewportY };
  }

  private at(line: number) {
    const list = this.list();
    const i = list.findIndex((m) => m.line === line);
    return { info: list[i], index: i + 1, total: list.length };
  }

  /** Dibuja la marca: barra de acento en el margen izquierdo (más gruesa y con tinte si es manual). */
  private decorate(m: Mark) {
    m.deco?.dispose();
    const deco = this.term.registerDecoration({ marker: m.marker, x: 0, width: this.term.cols });
    if (!deco) return;
    deco.onRender((el) => {
      const manual = m.kind === "manual";
      el.style.pointerEvents = "none";
      el.style.width = "100%";
      el.style.boxSizing = "border-box";
      el.style.borderLeft = manual ? "4px solid var(--accent)" : "2px solid var(--accent)";
      el.style.background = manual ? "color-mix(in srgb, var(--accent) 16%, transparent)" : "transparent";
    });
    m.deco = deco;
  }

  private drop(m: Mark) {
    m.deco?.dispose();
    this.marks = this.marks.filter((x) => x !== m);
    m.marker.dispose();
  }

  private prune() {
    this.marks = this.marks.filter((m) => !m.marker.isDisposed && m.marker.line >= 0);
  }

  /** Respeta los topes: se sueltan las más antiguas del mismo tipo. */
  private trim(kind: "manual" | "auto") {
    const max = kind === "auto" ? MAX_AUTO : MAX_MANUAL;
    const same = this.marks.filter((m) => m.kind === kind).sort((a, b) => a.marker.line - b.marker.line);
    for (const m of same.slice(0, Math.max(0, same.length - max))) this.drop(m);
  }

  dispose() {
    for (const m of [...this.marks]) this.drop(m);
    this.marks = [];
  }
}
