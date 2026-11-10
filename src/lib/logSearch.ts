/**
 * Lógica de Herramientas › Buscar en logs: validación del formulario, parámetros para el backend
 * (src-tauri/src/logsearch.rs), acumulación de resultados incrementales y textos. Sin React ni
 * Tauri, para probarla con Node.
 */

export type SearchKind = "logs" | "backups" | "notes";

export const KIND_LABEL: Record<SearchKind, string> = { logs: "Logs de sesión", backups: "Respaldos", notes: "Notas" };
export const KIND_SHORT: Record<SearchKind, string> = { logs: "Log", backups: "Respaldo", notes: "Nota" };

export const MAX_QUERY = 500;
export const MAX_RESULTS_CHOICES = [200, 500, 1000, 2000, 5000];
export const FILE_MB_CHOICES = [8, 16, 64, 256, 1024];

export interface SearchForm {
  query: string;
  regex: boolean;
  caseSensitive: boolean;
  kinds: Record<SearchKind, boolean>;
  from: string;
  to: string;
  scope: string;
  context: number;
  maxResults: number;
  maxFileMb: number;
}

export const defaultForm: SearchForm = {
  query: "",
  regex: false,
  caseSensitive: false,
  kinds: { logs: true, backups: true, notes: false },
  from: "",
  to: "",
  scope: "",
  context: 2,
  maxResults: 500,
  maxFileMb: 64,
};

/** Parámetros del comando `logsearch_start`. */
export interface SearchParams {
  query: string;
  regex: boolean;
  caseSensitive: boolean;
  kinds: SearchKind[];
  from?: string;
  to?: string;
  scope?: string;
  context: number;
  maxResults: number;
  maxFileMb: number;
}

export interface Hit {
  line: number;
  text: string;
  /** Rangos [inicio, fin) de la coincidencia dentro de `text`, en caracteres (puntos de código). */
  ranges: [number, number][];
  before: string[];
  after: string[];
}

export interface FileHits {
  kind: SearchKind;
  rel: string;
  size: number;
  modified: number;
  partial: boolean;
  more: boolean;
  hits: Hit[];
}

export interface Progress {
  scanned: number;
  total: number;
  matches: number;
}

export interface Summary {
  scanned: number;
  total: number;
  matches: number;
  filesWithHits: number;
  truncated: boolean;
  walkTruncated: boolean;
  skippedBinary: number;
  skippedErrors: number;
  partial: number;
  cancelled: boolean;
  ms: number;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function validDay(s: string): boolean {
  if (!DAY.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** Valida el formulario y arma los parámetros; si hay un problema devuelve el texto para el usuario. */
export function buildParams(f: SearchForm): { params: SearchParams } | { error: string } {
  if (!f.query.trim()) return { error: "Escribe un texto para buscar." };
  if ([...f.query].length > MAX_QUERY) return { error: `El texto es demasiado largo (máximo ${MAX_QUERY} caracteres).` };
  // La sintaxis de la expresión la valida el motor de Rust (difiere de la de JS): su error se muestra tal cual.
  const kinds = (Object.keys(f.kinds) as SearchKind[]).filter((k) => f.kinds[k]);
  if (!kinds.length) return { error: "Elige dónde buscar: logs, respaldos o notas." };
  const from = f.from.trim();
  const to = f.to.trim();
  if (from && !validDay(from)) return { error: "La fecha desde no es válida." };
  if (to && !validDay(to)) return { error: "La fecha hasta no es válida." };
  if (from && to && from > to) return { error: "El rango de fechas está invertido: desde es posterior a hasta." };
  return {
    params: {
      query: f.query,
      regex: f.regex,
      caseSensitive: f.caseSensitive,
      kinds,
      from: from || undefined,
      to: to || undefined,
      scope: f.scope.trim() || undefined,
      context: Math.min(5, Math.max(0, Math.round(f.context) || 0)),
      maxResults: f.maxResults,
      maxFileMb: f.maxFileMb,
    },
  };
}

/** Recupera el formulario recordado con forma válida (almacenamiento editado o de otra versión). */
export function sanitizeForm(raw: unknown): SearchForm {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const k = o.kinds && typeof o.kinds === "object" ? (o.kinds as Record<string, unknown>) : {};
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  const pick = (v: unknown, list: number[], d: number) => (typeof v === "number" && list.includes(v) ? v : d);
  return {
    // El texto buscado no se recuerda: puede traer un dato sensible.
    query: "",
    regex: bool(o.regex, defaultForm.regex),
    caseSensitive: bool(o.caseSensitive, defaultForm.caseSensitive),
    kinds: { logs: bool(k.logs, true), backups: bool(k.backups, true), notes: bool(k.notes, false) },
    from: "",
    to: "",
    scope: "",
    context: typeof o.context === "number" ? Math.min(5, Math.max(0, Math.round(o.context))) : defaultForm.context,
    maxResults: pick(o.maxResults, MAX_RESULTS_CHOICES, defaultForm.maxResults),
    maxFileMb: pick(o.maxFileMb, FILE_MB_CHOICES, defaultForm.maxFileMb),
  };
}

/** Lo que se recuerda del formulario entre sesiones (sin texto, fechas ni filtro de equipo). */
export function rememberable(f: SearchForm) {
  const { regex, caseSensitive, kinds, context, maxResults, maxFileMb } = f;
  return { regex, caseSensitive, kinds, context, maxResults, maxFileMb };
}

// ---------- Resultados incrementales ----------

export interface ResultsState {
  files: FileHits[];
  progress: Progress;
  summary: Summary | null;
}

export const emptyResults: ResultsState = { files: [], progress: { scanned: 0, total: 0, matches: 0 }, summary: null };

/** Evento "line" del backend: archivos con coincidencias nuevos y el avance. */
export interface LineData {
  files?: FileHits[];
  progress?: Progress;
}

/** Acumula un avance. Cada archivo llega una sola vez; si se repitiera (mismo tipo y ruta) se reemplaza. */
export function applyLine(state: ResultsState, data: LineData | null | undefined): ResultsState {
  if (!data) return state;
  let files = state.files;
  if (data.files?.length) {
    const next = files.slice();
    for (const f of data.files) {
      const i = next.findIndex((x) => x.kind === f.kind && x.rel === f.rel);
      if (i >= 0) next[i] = f;
      else next.push(f);
    }
    files = next;
  }
  return { ...state, files, progress: data.progress ?? state.progress };
}

export const totalHits = (files: FileHits[]) => files.reduce((n, f) => n + f.hits.length, 0);

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("es-CL")} ${n === 1 ? one : many}`;

export function progressText(p: Progress): string {
  return `${p.scanned.toLocaleString("es-CL")} de ${p.total.toLocaleString("es-CL")} archivos revisados · ${plural(p.matches, "coincidencia", "coincidencias")}`;
}

/** Resumen final y advertencias (topes, lecturas parciales, archivos omitidos). */
export function summaryLines(s: Summary): string[] {
  const out: string[] = [];
  const secs = s.ms >= 1000 ? `${(s.ms / 1000).toLocaleString("es-CL", { maximumFractionDigits: 1 })} s` : `${s.ms} ms`;
  out.push(
    `${s.cancelled ? "Búsqueda cancelada: " : ""}${plural(s.matches, "coincidencia", "coincidencias")} en ${plural(s.filesWithHits, "archivo", "archivos")} · ${s.scanned.toLocaleString("es-CL")} de ${s.total.toLocaleString("es-CL")} revisados en ${secs}.`,
  );
  if (s.truncated) out.push("Se alcanzó el tope de resultados: hay más coincidencias. Acota el texto, las fechas o el equipo.");
  if (s.walkTruncated) out.push("Hay más archivos que el máximo que se recorre; se revisaron los más recientes.");
  if (s.partial) out.push(`${plural(s.partial, "archivo supera", "archivos superan")} el tamaño máximo por archivo: se buscó solo en su inicio.`);
  if (s.skippedBinary) out.push(`${plural(s.skippedBinary, "archivo binario omitido", "archivos binarios omitidos")}.`);
  if (s.skippedErrors) out.push(`${plural(s.skippedErrors, "archivo no se pudo leer", "archivos no se pudieron leer")}.`);
  return out;
}

// ---------- Presentación ----------

export interface Segment {
  text: string;
  hit: boolean;
}

/** Parte `text` según los rangos (en puntos de código) para resaltar sin usar HTML. */
export function segments(text: string, ranges: [number, number][]): Segment[] {
  const chars = Array.from(text);
  const out: Segment[] = [];
  let pos = 0;
  for (const [s0, e0] of [...ranges].sort((a, b) => a[0] - b[0])) {
    const s = Math.max(pos, Math.min(s0, chars.length));
    const e = Math.min(Math.max(e0, s), chars.length);
    if (e <= s) continue;
    if (s > pos) out.push({ text: chars.slice(pos, s).join(""), hit: false });
    out.push({ text: chars.slice(s, e).join(""), hit: true });
    pos = e;
  }
  if (pos < chars.length) out.push({ text: chars.slice(pos).join(""), hit: false });
  return out.length ? out : [{ text, hit: false }];
}

/** Nombre del archivo y carpeta (sesión o equipo) a partir de la ruta relativa. */
export function fileParts(rel: string): { name: string; dir: string } {
  const i = rel.lastIndexOf("/");
  return i < 0 ? { name: rel, dir: "" } : { name: rel.slice(i + 1), dir: rel.slice(0, i) };
}

/** Texto para copiar de una coincidencia: la línea completa tal como se mostró. */
export const copyLine = (h: Hit) => h.text.replace(/^…|…$/g, "");

/** Hoy como AAAA-MM-DD en hora local (para el máximo de los selectores de fecha). */
export function todayISO(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Fecha y hora local de una marca Unix (segundos). */
export function stamp(secs: number): string {
  if (!secs) return "";
  const d = new Date(secs * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
