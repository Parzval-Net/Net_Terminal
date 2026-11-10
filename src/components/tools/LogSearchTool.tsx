import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { ChevronRight, Copy, ExternalLink, FolderOpen, Search, Square } from "lucide-react";
import { persist, stored } from "../../lib/prefs";
import {
  FILE_MB_CHOICES,
  FileHits,
  Hit,
  KIND_LABEL,
  KIND_SHORT,
  LineData,
  MAX_QUERY,
  MAX_RESULTS_CHOICES,
  ResultsState,
  SearchForm,
  SearchKind,
  Summary,
  applyLine,
  buildParams,
  copyLine,
  emptyResults,
  fileParts,
  progressText,
  rememberable,
  sanitizeForm,
  segments,
  stamp,
  summaryLines,
  todayISO,
  totalHits,
} from "../../lib/logSearch";
import { fmtBytes, Btn, Collapsible, Label, Section } from "./ui";

const FORM_KEY = "logSearchForm";

interface JobEvent {
  job: string;
  kind: "line" | "done" | "error" | "result";
  text: string;
  data?: unknown;
}

/** Sigue la búsqueda del backend por los eventos "tool-job" (los resultados llegan por lotes). */
function useLogSearch() {
  const [state, setState] = useState<ResultsState>(emptyResults);
  const [running, setRunning] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState("");
  const job = useRef<string | null>(null);
  // Eventos que llegan antes de conocer el id (una búsqueda muy rápida).
  const early = useRef<JobEvent[] | null>(null);
  const handle = useRef<(e: JobEvent) => void>(() => {});

  useEffect(() => {
    const un = listen<JobEvent>("tool-job", ({ payload: e }) => {
      if (early.current) early.current.push(e);
      else if (e.job === job.current) handle.current(e);
    });
    return () => {
      un.then((f) => f());
    };
  }, []);

  handle.current = (e) => {
    if (e.kind === "line") setState((s) => applyLine(s, e.data as LineData));
    else if (e.kind === "result") setState((s) => ({ ...s, summary: e.data as Summary }));
    else if (e.kind === "error") setError(e.text);
    else if (e.kind === "done") {
      job.current = null;
      setRunning(false);
      setCancelling(false);
    }
  };

  const start = useCallback(async (params: unknown) => {
    setState(emptyResults);
    setError("");
    setRunning(true);
    setCancelling(false);
    early.current = [];
    try {
      const id = await invoke<string>("logsearch_start", { params });
      job.current = id;
      const pending = early.current;
      early.current = null;
      pending.filter((e) => e.job === id).forEach((e) => handle.current(e));
    } catch (e) {
      early.current = null;
      setRunning(false);
      setError(String(e));
    }
  }, []);

  const stop = useCallback(() => {
    if (!job.current) return;
    setCancelling(true);
    invoke("tool_stop", { job: job.current }).catch(() => {});
  }, []);

  useEffect(
    () => () => {
      if (job.current) invoke("tool_stop", { job: job.current }).catch(() => {});
    },
    [],
  );

  return { state, running, cancelling, error, setError, start, stop };
}

function Check({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <label className="inline-flex items-center gap-1.5 text-[12.5px] cursor-default select-none">
      <input type="checkbox" className="accent-[var(--accent)]" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function HitRow({ hit, onCopy }: { hit: Hit; onCopy: (h: Hit) => void }) {
  const ctx = (text: string, n: number, key: string) => (
    <div key={key} className="flex gap-2 text-muted">
      <span className="w-12 shrink-0 text-right tabular-nums select-none">{n}</span>
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-all">{text}</span>
    </div>
  );
  return (
    <div className="group py-1 border-t border-line first:border-0 font-mono text-[11.5px] leading-[1.45]">
      {hit.before.map((t, i) => ctx(t, hit.line - hit.before.length + i, `b${i}`))}
      <div className="flex gap-2">
        <span className="w-12 shrink-0 text-right tabular-nums text-muted select-none">{hit.line}</span>
        <span className="min-w-0 flex-1 whitespace-pre-wrap break-all select-text">
          {segments(hit.text, hit.ranges).map((s, i) =>
            s.hit ? (
              <mark key={i} className="rounded-sm bg-accent text-accent-fg px-0.5">
                {s.text}
              </mark>
            ) : (
              <span key={i}>{s.text}</span>
            ),
          )}
        </span>
        <button
          type="button"
          onClick={() => onCopy(hit)}
          title="Copiar línea"
          aria-label={`Copiar la línea ${hit.line}`}
          className="shrink-0 w-6 h-6 grid place-items-center rounded-md text-muted hover:text-fg hover:bg-hover focus-visible:opacity-100 opacity-60 group-hover:opacity-100"
        >
          <Copy size={12} />
        </button>
      </div>
      {hit.after.map((t, i) => ctx(t, hit.line + 1 + i, `a${i}`))}
    </div>
  );
}

function FileGroup({
  file,
  open,
  onToggle,
  onOpen,
  onCopy,
}: {
  file: FileHits;
  open: boolean;
  onToggle: () => void;
  onOpen: (f: FileHits, reveal: boolean) => void;
  onCopy: (h: Hit) => void;
}) {
  const { name, dir } = fileParts(file.rel);
  return (
    <section className="rounded-lg border border-line">
      <div className="flex items-center gap-1 pr-1.5">
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          className="flex-1 min-w-0 flex items-center gap-2 pl-2 pr-1 py-1.5 text-left rounded-lg hover:bg-hover"
        >
          <ChevronRight size={14} aria-hidden className={`shrink-0 text-muted transition-transform ${open ? "rotate-90" : ""}`} />
          <span className="shrink-0 px-1.5 h-5 inline-flex items-center rounded-full border border-line text-[10.5px] text-muted">{KIND_SHORT[file.kind]}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] font-medium" title={file.rel}>
              {dir && <span className="text-muted font-normal">{dir}/</span>}
              {name}
            </span>
            <span className="block truncate text-[11px] text-muted">
              {stamp(file.modified)} · {fmtBytes(file.size)}
              {file.partial ? " · leído solo el inicio" : ""}
            </span>
          </span>
          <span className="shrink-0 text-[11.5px] text-muted tabular-nums">
            {file.hits.length}
            {file.more ? "+" : ""}
          </span>
        </button>
        <button
          type="button"
          onClick={() => onOpen(file, false)}
          title="Abrir archivo con la aplicación del sistema"
          aria-label={`Abrir ${name}`}
          className="h-7 px-1.5 inline-flex items-center gap-1 rounded-md text-[12px] text-muted hover:text-fg hover:bg-hover"
        >
          <ExternalLink size={13} />
          <span className="hidden @[52rem]:inline">Abrir archivo</span>
        </button>
        <button
          type="button"
          onClick={() => onOpen(file, true)}
          title="Mostrar en la carpeta"
          aria-label={`Mostrar ${name} en la carpeta`}
          className="h-7 px-1.5 inline-flex items-center gap-1 rounded-md text-[12px] text-muted hover:text-fg hover:bg-hover"
        >
          <FolderOpen size={13} />
          <span className="hidden @[52rem]:inline">Mostrar en carpeta</span>
        </button>
      </div>
      {open && (
        <div className="px-2 pb-2">
          {file.hits.map((h, i) => (
            <HitRow key={`${h.line}-${i}`} hit={h} onCopy={onCopy} />
          ))}
          {file.more && <p className="pt-1 text-[11.5px] text-warn">Hay más coincidencias en este archivo que las mostradas. Acota la búsqueda.</p>}
        </div>
      )}
    </section>
  );
}

export default function LogSearchTool({ visible }: { visible?: boolean }) {
  const [form, setForm] = useState<SearchForm>(() => sanitizeForm(stored<unknown>(FORM_KEY, null)));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [logsDir, setLogsDir] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const formEl = useRef<HTMLFormElement>(null);
  const shown = useRef(visible);
  shown.current = visible;
  const { state, running, cancelling, error, setError, start, stop } = useLogSearch();
  // El foco sigue al botón que cambia: Cancelar mientras corre (Esc también cancela) y el campo al terminar.
  const wasRunning = useRef(false);
  useEffect(() => {
    if (running) formEl.current?.querySelector<HTMLButtonElement>("[data-cancel]")?.focus();
    else if (wasRunning.current && shown.current && (!document.activeElement || document.activeElement === document.body)) input.current?.focus();
    wasRunning.current = running;
  }, [running]);

  const patch = (p: Partial<SearchForm>) => setForm((f) => ({ ...f, ...p }));
  useEffect(() => {
    persist(FORM_KEY, rememberable(form));
  }, [form]);
  useEffect(() => {
    invoke<{ path: string }>("logs_dir_get")
      .then((i) => setLogsDir(i.path))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (visible) input.current?.focus();
  }, [visible]);

  const run = () => {
    if (running) return;
    const r = buildParams(form);
    if ("error" in r) return setError(r.error);
    setNote("");
    setCollapsed(new Set());
    start(r.params);
  };

  const key = (f: FileHits) => `${f.kind}:${f.rel}`;
  const toggle = (f: FileHits) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (!n.delete(key(f))) n.add(key(f));
      return n;
    });
  const openFile = (f: FileHits, reveal: boolean) => {
    setError("");
    invoke("logsearch_open", { kind: f.kind, rel: f.rel, reveal }).catch((e) => setError(String(e)));
  };
  const copy = (h: Hit) => {
    writeText(copyLine(h))
      .then(() => setNote("Línea copiada."))
      .catch(() => setError("No se pudo copiar al portapapeles."));
  };

  const { files, progress, summary } = state;
  const hits = useMemo(() => totalHits(files), [files]);
  const pct = progress.total ? Math.min(100, (progress.scanned / progress.total) * 100) : null;
  const kinds = Object.keys(KIND_LABEL) as SearchKind[];
  const lines = summary ? summaryLines(summary) : [];

  return (
    <div className="space-y-4" onKeyDown={(e) => e.key === "Escape" && running && (e.stopPropagation(), stop())}>
      <Section
        title="Buscar en logs y respaldos"
        hint="Texto o regex en logs, respaldos y notas. Sin índice: lee archivo por archivo."
      >
        <form
          ref={formEl}
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            run();
          }}
        >
          <div className="flex flex-wrap items-end gap-2">
            <Label text="Texto a buscar" className="flex-1 min-w-[220px]">
              <input
                ref={input}
                className="field font-mono"
                type="search"
                spellCheck={false}
                autoComplete="off"
                maxLength={MAX_QUERY}
                placeholder={form.regex ? "Expresión regular, ej. %LINK-3-UPDOWN.*Gi1/0/\\d+" : "Ej. changed state to down"}
                value={form.query}
                readOnly={running}
                onChange={(e) => patch({ query: e.target.value })}
              />
            </Label>
            {running ? (
              <Btn type="button" data-cancel onClick={stop} aria-disabled={cancelling}>
                <Square size={13} /> {cancelling ? "Cancelando…" : "Cancelar"}
              </Btn>
            ) : (
              <Btn type="submit" kind="primary">
                <Search size={14} /> Buscar
              </Btn>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <Check checked={form.regex} onChange={(v) => patch({ regex: v })} label="Expresión regular" disabled={running} />
            <Check checked={form.caseSensitive} onChange={(v) => patch({ caseSensitive: v })} label="Distinguir mayúsculas" disabled={running} />
            <span className="hidden @[40rem]:block w-px h-4 bg-line" aria-hidden />
            {kinds.map((k) => (
              <Check key={k} checked={form.kinds[k]} onChange={(v) => patch({ kinds: { ...form.kinds, [k]: v } })} label={KIND_LABEL[k]} disabled={running} />
            ))}
          </div>
          <Collapsible
            title="Filtros y límites"
            summary={[form.from || form.to ? `${form.from || "…"} a ${form.to || "…"}` : "", form.scope ? `equipo: ${form.scope}` : "", `contexto ${form.context}`, `máx. ${form.maxResults}`].filter(Boolean).join(" · ")}
            open={filtersOpen}
            onToggle={setFiltersOpen}
          >
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(170px,100%),1fr))]">
              <Label text="Desde (fecha del archivo)">
                <input className="field" type="date" max={todayISO()} value={form.from} disabled={running} onChange={(e) => patch({ from: e.target.value })} />
              </Label>
              <Label text="Hasta">
                <input className="field" type="date" max={todayISO()} value={form.to} disabled={running} onChange={(e) => patch({ to: e.target.value })} />
              </Label>
              <Label text="Sesión o equipo (contiene)">
                <input className="field" value={form.scope} spellCheck={false} placeholder="Ej. core-sw01" disabled={running} onChange={(e) => patch({ scope: e.target.value })} />
              </Label>
              <Label text="Líneas de contexto">
                <select className="field" value={form.context} disabled={running} onChange={(e) => patch({ context: Number(e.target.value) })}>
                  {[0, 1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n === 0 ? "Sin contexto" : `${n} antes y después`}
                    </option>
                  ))}
                </select>
              </Label>
              <Label text="Máximo de resultados">
                <select className="field" value={form.maxResults} disabled={running} onChange={(e) => patch({ maxResults: Number(e.target.value) })}>
                  {MAX_RESULTS_CHOICES.map((n) => (
                    <option key={n} value={n}>
                      {n.toLocaleString("es-CL")}
                    </option>
                  ))}
                </select>
              </Label>
              <Label text="Tamaño máximo por archivo">
                <select className="field" value={form.maxFileMb} disabled={running} onChange={(e) => patch({ maxFileMb: Number(e.target.value) })}>
                  {FILE_MB_CHOICES.map((n) => (
                    <option key={n} value={n}>
                      {n >= 1024 ? "1 GB" : `${n} MB`}
                    </option>
                  ))}
                </select>
              </Label>
            </div>
            <p className="mt-2 text-[11.5px] text-muted">
              La fecha de un respaldo es la de su nombre; la de un log o una nota, la de su última modificación. De un archivo más grande que el máximo se lee solo el inicio.
            </p>
          </Collapsible>
        </form>
        <p className="mt-3 text-[11.5px] text-muted">
          Solo lee dentro de las carpetas de datos de la app: logs{logsDir ? ` (${logsDir})` : ""}, respaldos y, si lo eliges, notas. No sigue enlaces simbólicos, no abre notas protegidas ni la bóveda, y los secretos de los logs siguen enmascarados como se guardaron.
        </p>
      </Section>

      <div role="status" aria-live="polite" className="space-y-1.5">
        {running && (
          <div>
            <p className="text-[12px]">{progress.total ? progressText(progress) : "Recorriendo carpetas…"}</p>
            <div className="h-1 mt-1 rounded-full bg-hover overflow-hidden">
              <div className={`h-full bg-accent ${pct == null ? "animate-pulse w-1/3" : ""}`} style={pct != null ? { width: `${pct}%` } : undefined} />
            </div>
            <p className="mt-1 text-[11.5px] text-muted">Esc cancela la búsqueda. Los resultados aparecen a medida que se encuentran.</p>
          </div>
        )}
        {!running && lines.map((l, i) => (
          <p key={i} className={`text-[12px] ${i === 0 ? "" : "text-warn"}`}>
            {l}
          </p>
        ))}
        {note && !error && <p className="text-[12px] text-muted">{note}</p>}
        {error && <p className="text-[12px] text-danger">{error}</p>}
      </div>

      {files.length > 0 && (
        <Section
          title={`Resultados (${hits.toLocaleString("es-CL")} en ${files.length.toLocaleString("es-CL")} ${files.length === 1 ? "archivo" : "archivos"})`}
          right={
            files.length > 1 ? (
              <Btn kind="ghost" onClick={() => setCollapsed(collapsed.size ? new Set() : new Set(files.map(key)))}>
                {collapsed.size ? "Expandir todo" : "Contraer todo"}
              </Btn>
            ) : undefined
          }
        >
          <div className="space-y-2">
            {files.map((f) => (
              <FileGroup key={key(f)} file={f} open={!collapsed.has(key(f))} onToggle={() => toggle(f)} onOpen={openFile} onCopy={copy} />
            ))}
          </div>
        </Section>
      )}
      {!running && summary && files.length === 0 && !error && <p className="text-[12.5px] text-muted">Sin coincidencias.</p>}
    </div>
  );
}
