/**
 * Diálogos de la terminal: resaltado al vuelo, marcadores y pegado seguro (más la barra de avance del
 * envío línea a línea). La lógica vive en lib/termHl, lib/termMarks y lib/pasteGuard; aquí solo la interfaz.
 */
import { useEffect, useId, useRef, useState } from "react";
import { Bookmark, Highlighter, Trash2, X } from "lucide-react";
import { useModal } from "../lib/useModal";
import { persist, stored } from "../lib/prefs";
import { Switch } from "./controls";
import { HL_COLORS, type HlColorId, MAX_HL, type TermHl } from "../lib/termHl";
import type { MarkInfo } from "../lib/termDecor";
import { FLAG_INFO, type PasteAnalysis, type PasteDecision } from "../lib/pasteGuard";
import { riskLabel } from "../lib/packs";
import { plural } from "../lib/plural";

const BTN = "px-3.5 h-8 rounded-md border border-line hover:bg-hover";
const PRIMARY = "px-3.5 h-8 rounded-md bg-accent text-accent-fg font-medium hover:opacity-90";

/** Marco común: fondo que cubre la pantalla, caja con título y botón de cerrar. */
function Frame({ title, icon, onClose, children, wide, initialFocus }: { title: string; icon: React.ReactNode; onClose: () => void; children: React.ReactNode; wide?: boolean; initialFocus?: string }) {
  const modal = useModal({ onClose, initialFocus });
  return (
    <div {...modal.overlay} className="fixed inset-0 z-50 grid place-items-center bg-black/25 p-4" onMouseDown={onClose}>
      <div
        {...modal.dialog}
        className={`${wide ? "w-[560px]" : "w-[480px]"} max-w-full max-h-[90vh] flex flex-col bg-panel border border-line rounded-xl shadow-pop p-5`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-3">
          <span aria-hidden className="text-muted">{icon}</span>
          <h2 id={modal.titleId} className="flex-1 text-[14px] font-semibold">
            {title}
          </h2>
          <button onClick={onClose} aria-label="Cerrar" data-modal-close className="w-7 h-7 grid place-items-center rounded-md text-muted hover:text-fg hover:bg-hover">
            <X size={15} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------- Resaltar ----------

export interface HlSpec {
  pattern: string;
  regex: boolean;
  matchCase: boolean;
  color: HlColorId;
}

interface HlProps {
  tabName: string;
  items: (TermHl & { count: number })[];
  capped: boolean;
  /** Devuelve el mensaje de error o null si quedó agregado. */
  onAdd: (spec: HlSpec) => string | null;
  onRemove: (id: number) => void;
  onClear: () => void;
  onClose: () => void;
}

export function HighlightDialog({ tabName, items, capped, onAdd, onRemove, onClear, onClose }: HlProps) {
  const [pattern, setPattern] = useState("");
  const [regex, setRegex] = useState(false);
  const [matchCase, setMatchCase] = useState(false);
  // Primer color que no usa ningún resaltado activo.
  const nextColor = (): HlColorId => (HL_COLORS.find((c) => !items.some((i) => i.color === c.id)) ?? HL_COLORS[items.length % HL_COLORS.length]).id;
  const [color, setColor] = useState<HlColorId>(nextColor);
  const [error, setError] = useState<string | null>(null);
  const [said, setSaid] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const errId = useId();
  const full = items.length >= MAX_HL;

  const add = () => {
    // Enter con el campo vacío (p. ej. el Enter que abrió el diálogo desde la paleta) no hace nada.
    if (!pattern.trim()) return input.current?.focus();
    const err = onAdd({ pattern, regex, matchCase, color });
    setError(err);
    if (err) return input.current?.focus();
    setSaid(`Resaltado agregado: ${pattern}`);
    setPattern("");
    // El siguiente color libre para el próximo (el estado ya incluye el recién agregado en el próximo render).
    setColor(HL_COLORS[(HL_COLORS.findIndex((c) => c.id === color) + 1) % HL_COLORS.length].id);
    input.current?.focus();
  };

  return (
    <Frame title="Resaltar en la salida" icon={<Highlighter size={15} />} onClose={onClose}>
      <p className="text-[12px] text-muted mb-3">
        Pinta un texto o una expresión regular en la salida de <b className="font-medium text-fg">{tabName}</b>: la que ya recibió y la nueva. Es solo de esta pestaña: no cambia las reglas guardadas
        y se pierde al cerrarla.
      </p>
      <form
        className="space-y-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          ref={input}
          autoFocus
          className="field !h-8 w-full"
          style={regex ? { fontFamily: "var(--font-mono, ui-monospace, monospace)" } : undefined}
          placeholder={regex ? "Expresión regular, por ejemplo err(or|disabled)" : "Texto a resaltar, por ejemplo down"}
          aria-label={regex ? "Expresión regular a resaltar" : "Texto a resaltar"}
          aria-invalid={!!error}
          aria-describedby={error ? errId : undefined}
          value={pattern}
          onChange={(e) => {
            setPattern(e.target.value);
            if (error) setError(null);
          }}
        />
        {error && (
          <p id={errId} role="alert" className="text-[12px] text-danger">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px]">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={regex} onChange={(e) => setRegex(e.target.checked)} />
            Expresión regular
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={matchCase} onChange={(e) => setMatchCase(e.target.checked)} />
            Distinguir mayúsculas
          </label>
        </div>
        <fieldset className="min-w-0">
          <legend className="text-[12px] text-muted mb-1">Color</legend>
          <div className="flex flex-wrap gap-1.5">
            {HL_COLORS.map((c) => (
              <label key={c.id} className="cursor-pointer">
                <input type="radio" name="hl-color" className="sr-only peer" checked={color === c.id} onChange={() => setColor(c.id)} />
                <span
                  className="flex items-center gap-1.5 h-7 px-2 rounded-md border border-line text-[12px] peer-checked:ring-2 peer-checked:ring-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent hover:bg-hover"
                >
                  <span aria-hidden className="w-5 h-4 rounded-sm grid place-items-center text-[10px] font-semibold" style={{ background: c.bg, color: c.fg }}>
                    Aa
                  </span>
                  {c.label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex items-center justify-end gap-2">
          <span className="mr-auto text-[11.5px] text-muted">{full ? `Máximo ${MAX_HL} resaltados` : "Enter agrega"}</span>
          <button type="submit" className={`${PRIMARY} disabled:opacity-40`} disabled={full || !pattern.trim()}>
            Agregar resaltado
          </button>
        </div>
      </form>

      <div className="mt-4 pt-3 border-t border-line min-h-0 flex flex-col">
        <div className="flex items-center mb-1.5">
          <h3 className="flex-1 text-[12px] font-medium">Resaltados activos ({items.length})</h3>
          {items.length > 0 && (
            <button onClick={onClear} className="text-[12px] text-muted hover:text-fg hover:underline">
              Quitar todos
            </button>
          )}
        </div>
        {items.length === 0 ? (
          <p className="text-[12px] text-muted">Ninguno. Lo que agregues se ve al instante en la terminal.</p>
        ) : (
          <ul className="max-h-44 overflow-y-auto space-y-1" aria-label="Resaltados activos">
            {items.map((h) => {
              const c = HL_COLORS.find((x) => x.id === h.color) ?? HL_COLORS[0];
              return (
                <li key={h.id} className="flex items-center gap-2 text-[12px]">
                  <span aria-hidden className="w-5 h-4 rounded-sm grid place-items-center text-[10px] font-semibold shrink-0" style={{ background: c.bg, color: c.fg }}>
                    Aa
                  </span>
                  <span className="truncate font-mono" title={h.pattern}>
                    {h.pattern}
                  </span>
                  <span className="text-muted shrink-0">
                    {h.regex ? "regex" : "texto"} · {c.label}
                    {h.matchCase ? " · Aa" : ""} · {plural(h.count, "coincidencia", "coincidencias")}
                  </span>
                  <button
                    onClick={() => onRemove(h.id)}
                    aria-label={`Quitar el resaltado ${h.pattern}`}
                    title="Quitar"
                    className="ml-auto w-6 h-6 shrink-0 grid place-items-center rounded text-muted hover:text-fg hover:bg-hover"
                  >
                    <Trash2 size={13} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {capped && <p className="mt-2 text-[11.5px] text-warn">Hay demasiadas coincidencias: se pintan las primeras. Afina el patrón o limpia el historial.</p>}
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {said}
      </p>
    </Frame>
  );
}

// ---------- Marcadores ----------

interface MarksProps {
  tabName: string;
  items: MarkInfo[];
  autoMark: boolean;
  onAutoMark: (v: boolean) => void;
  onGoto: (line: number) => void;
  onRemove: (id: number) => void;
  onClear: () => void;
  onClose: () => void;
}

export function MarksDialog({ tabName, items, autoMark, onAutoMark, onGoto, onRemove, onClear, onClose }: MarksProps) {
  return (
    <Frame title="Marcadores" icon={<Bookmark size={15} />} onClose={onClose} wide initialFocus='[role="dialog"]'>
      <p className="text-[12px] text-muted mb-3">
        Marcadores de <b className="font-medium text-fg">{tabName}</b> en el historial de la terminal. Se van al limpiar el historial o al salir de él.
      </p>
      <div className="flex items-center justify-between gap-4 mb-3 text-[12px]">
        <span id="automark-label">
          Marcar cada comando al enviarlo
          <span className="block text-[11.5px] text-muted">Para saltar de un comando al siguiente. Vale para todas las pestañas.</span>
        </span>
        <Switch checked={autoMark} onChange={onAutoMark} label="Marcar cada comando al enviarlo" />
      </div>
      <div className="flex items-center mb-1.5">
        <h3 className="flex-1 text-[12px] font-medium">{plural(items.length, "marcador", "marcadores")}</h3>
        {items.length > 0 && (
          <button onClick={onClear} className="text-[12px] text-muted hover:text-fg hover:underline">
            Quitar todos
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-[12px] text-muted">No hay marcadores. Usa «Marcar aquí» en el menú de la pestaña para dejar uno en la línea del cursor.</p>
      ) : (
        <ul className="max-h-72 overflow-y-auto -mx-1 px-1" aria-label="Marcadores">
          {items.map((m) => (
            <li key={m.id} className="flex items-center gap-1 rounded-md hover:bg-hover">
              <button onClick={() => onGoto(m.line)} className="flex-1 min-w-0 flex items-center gap-2 h-8 px-2 text-left text-[12px]" title={`Ir a la línea ${m.line + 1}`}>
                <span className="w-14 shrink-0 text-muted tabular-nums">Línea {m.line + 1}</span>
                <span className="truncate font-mono">{m.text}</span>
                {m.kind === "auto" && <span className="shrink-0 rounded border border-line px-1 text-[10.5px] text-muted">comando</span>}
              </button>
              <button
                onClick={() => onRemove(m.id)}
                aria-label={`Quitar el marcador de la línea ${m.line + 1}`}
                title="Quitar"
                className="w-7 h-7 shrink-0 grid place-items-center rounded text-muted hover:text-fg"
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Frame>
  );
}

// ---------- Pegado seguro ----------

const MAX_PREVIEW = 300;
const DELAYS = [0, 25, 50, 100, 250, 500, 1000, 2000];

export interface LineSendOpts {
  delayMs: number;
  waitPrompt: boolean;
}

interface PasteProps {
  target: string;
  analysis: PasteAnalysis;
  decision: PasteDecision;
  defaultDelay: number;
  onPaste: () => void;
  onLineByLine: (o: LineSendOpts) => void;
  onCancel: () => void;
}

/** Vista previa del pegado: cantidad, caracteres especiales, riesgo por línea y las dos formas de enviarlo. */
export function PasteDialog({ target, analysis: a, decision: d, defaultDelay, onPaste, onLineByLine, onCancel }: PasteProps) {
  const modal = useModal({ role: "alertdialog", onClose: onCancel });
  const [delay, setDelay] = useState(() => stored<number>("pasteLineDelay", defaultDelay));
  const [wait, setWait] = useState(() => stored<boolean>("pasteWaitPrompt", false));
  const shown = a.lines.slice(0, MAX_PREVIEW);
  const hidden = a.lines.slice(MAX_PREVIEW);
  const hiddenRisky = hidden.filter((l) => l.executes && l.risk !== "read").length;
  const hiddenFlagged = hidden.filter((l) => l.flags.some((f) => FLAG_INFO[f].forces)).length;
  const danger = d.danger;
  const n = a.lines.length;
  const head = a.risk === "disruptive" ? "Este pegado puede cortar servicio" : d.reasons.length ? `¿Pegar ${plural(n, "línea", "líneas")} en ${target}?` : `Pegar en ${target}`;
  const start = () => {
    persist("pasteLineDelay", delay);
    persist("pasteWaitPrompt", wait);
    onLineByLine({ delayMs: delay, waitPrompt: wait });
  };

  return (
    <div {...modal.overlay} className="fixed inset-0 z-50 grid place-items-center bg-black/25 p-4" onMouseDown={onCancel}>
      <div
        {...modal.dialog}
        aria-describedby={`${modal.titleId}-d`}
        className="w-[600px] max-w-full max-h-[92vh] flex flex-col bg-panel border border-line rounded-xl shadow-pop p-5"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id={modal.titleId} className="text-[14px] font-semibold mb-1">
          {head}
        </h2>
        <div id={`${modal.titleId}-d`} className="text-[12px] text-muted space-y-1 mb-2">
          <p>
            <span className="text-fg">{plural(n, "línea", "líneas")}</span> · <span className="text-fg">{plural(a.chars, "carácter", "caracteres")}</span>
            {a.executed > 0 && <> · se ejecutan {a.executed}</>}
          </p>
          {!a.endsWithNewline && n > 0 && <p>No termina en salto de línea: la última línea queda escrita en el prompt, sin ejecutarse.</p>}
          {d.reasons.length > 0 && (
            <ul className="list-disc pl-4">
              {d.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
        </div>
        {a.flags.length > 0 && (
          <ul aria-label="Caracteres especiales detectados" className="mb-2 space-y-0.5 text-[12px]">
            {a.flags.map((f) => (
              <li key={f.kind} className={FLAG_INFO[f.kind].forces ? "text-danger" : "text-warn"}>
                <span aria-hidden>{FLAG_INFO[f.kind].forces ? "⚠ " : "ℹ "}</span>
                {FLAG_INFO[f.kind].label}
                {f.names && (f.kind === "ctrl" || f.kind === "edit") ? ` (${f.names})` : ""}: {plural(f.count, "vez", "veces")}
              </li>
            ))}
            {a.mixedBreaks && <li className="text-danger">⚠ Mezcla CR suelto con LF: otros programas la leerían distinta.</li>}
          </ul>
        )}
        <div role="group" aria-label="Vista previa" tabIndex={0} className="min-h-0 max-h-56 overflow-auto rounded-md bg-hover p-2 font-mono text-[12px]">
          {shown.map((l, i) => (
            <div key={i} className="flex gap-2 items-start min-w-0">
              <span aria-hidden className="w-7 shrink-0 text-right text-muted select-none tabular-nums">
                {i + 1}
              </span>
              <span className="whitespace-pre-wrap break-all flex-1 min-w-0">
                {l.parts.length ? (
                  l.parts.map((pt, k) =>
                    pt.ctrl ? (
                      <span key={k} className={`mx-px rounded px-1 text-[10.5px] font-sans font-medium align-baseline ${pt.forces ? "bg-danger text-danger-fg" : "border border-line bg-panel text-warn"}`} title={pt.forces ? `Carácter especial: ${pt.ctrl}` : "Tabulación"}>
                        {pt.ctrl}
                      </span>
                    ) : (
                      pt.text
                    ),
                  )
                ) : (
                  <span className="text-muted">(vacía)</span>
                )}
                {l.effective !== l.raw && (
                  <span className="block text-muted">
                    → el equipo ejecuta: <span className="text-fg">{l.effective || "(nada)"}</span>
                  </span>
                )}
              </span>
              {l.executes && l.risk !== "read" && (
                <span className={`shrink-0 rounded px-1.5 text-[11px] font-medium font-sans ${l.risk === "disruptive" ? "bg-danger text-danger-fg" : "border border-line text-fg"}`}>{riskLabel[l.risk]}</span>
              )}
              {!l.executes && <span className="shrink-0 rounded border border-line px-1.5 text-[11px] text-muted font-sans">sin Enter</span>}
            </div>
          ))}
          {hidden.length > 0 && (
            <div className="pt-1 text-muted font-sans">
              … y {plural(hidden.length, "línea más", "líneas más")}
              {hiddenRisky + hiddenFlagged > 0 && (
                <span className="text-danger">
                  {" "}
                  · entre ellas {hiddenRisky ? plural(hiddenRisky, "de riesgo", "de riesgo") : ""}
                  {hiddenRisky && hiddenFlagged ? " y " : ""}
                  {hiddenFlagged ? plural(hiddenFlagged, "con caracteres especiales", "con caracteres especiales") : ""}
                </span>
              )}
            </div>
          )}
        </div>
        <fieldset className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px]">
          <legend className="sr-only">Opciones de envío línea a línea</legend>
          <span className="text-muted">Línea a línea:</span>
          <label className="flex items-center gap-1.5">
            Pausa
            <select className="field !h-7 !w-24" value={delay} onChange={(e) => setDelay(Number(e.target.value))} aria-label="Pausa entre líneas en milisegundos">
              {(DELAYS.includes(delay) ? DELAYS : [...DELAYS, delay].sort((x, y) => x - y)).map((v) => (
                <option key={v} value={v}>
                  {v === 0 ? "Sin pausa" : `${v} ms`}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={wait} onChange={(e) => setWait(e.target.checked)} />
            Esperar el prompt entre líneas
          </label>
        </fieldset>
        <div className="flex flex-wrap justify-end gap-2 mt-4">
          <button onClick={onCancel} autoFocus={danger} className={BTN}>
            Cancelar
          </button>
          <button onClick={start} className={BTN} title="Escribe una línea, espera y sigue con la siguiente: para consolas lentas. Esc detiene el envío">
            Enviar línea a línea
          </button>
          <button onClick={onPaste} autoFocus={!danger} className={`px-3.5 h-8 rounded-md font-medium hover:opacity-90 ${danger ? "bg-danger text-danger-fg" : "bg-accent text-accent-fg"}`}>
            {d.ask ? "Pegar todo" : "Pegar"}
          </button>
        </div>
      </div>
    </div>
  );
}

export interface LineSendState {
  done: number;
  total: number;
  state: "run" | "stopped" | "done" | "error";
  reason?: string;
}

/** Barra de avance del envío línea a línea (no bloquea: el foco sigue en la terminal). */
export function LineSendBar({ s, onStop }: { s: LineSendState; onStop: () => void }) {
  const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
  const running = s.state === "run";
  const text =
    s.state === "run"
      ? `Enviando línea ${Math.min(s.done + 1, s.total)} de ${s.total}`
      : s.state === "done"
        ? `Envío terminado: ${plural(s.total, "línea", "líneas")}`
        : s.state === "stopped"
          ? `Envío detenido tras ${s.done} de ${s.total}${s.reason ? ` (${s.reason})` : ""}`
          : `Error en la línea ${s.done + 1} de ${s.total}${s.reason ? `: ${s.reason}` : ""}`;
  return (
    <div className="absolute left-1/2 bottom-3 -translate-x-1/2 z-[15] w-[min(460px,92%)] flex items-center gap-3 rounded-lg border border-line bg-panel px-3 py-2 shadow-pop text-[12px]">
      <div className="flex-1 min-w-0">
        <div className="flex justify-between mb-1">
          <span className="truncate">{text}</span>
          <span className="tabular-nums text-muted">{pct}%</span>
        </div>
        <div
          role="progressbar"
          aria-label="Envío línea a línea"
          aria-valuemin={0}
          aria-valuemax={s.total}
          aria-valuenow={s.done}
          aria-valuetext={`${s.done} de ${s.total} líneas`}
          className="h-1.5 rounded-full bg-hover overflow-hidden"
        >
          <div className={`h-full ${s.state === "error" ? "bg-danger" : "bg-accent"}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
      {running && (
        <button onClick={onStop} className="px-2.5 h-7 rounded-md border border-line hover:bg-hover shrink-0" title="Detener el envío (Esc)">
          Detener
        </button>
      )}
    </div>
  );
}

/** Anuncio para lectores de pantalla (inicio y fin del envío): la barra se actualiza línea a línea y no se anuncia. */
export function useAnnounce(s: LineSendState | null): string {
  const [msg, setMsg] = useState("");
  const state = s?.state;
  useEffect(() => {
    if (!s) return setMsg("");
    if (s.state === "run") setMsg(`Enviando ${s.total} líneas`);
    else if (s.state === "done") setMsg("Envío terminado");
    else if (s.state === "stopped") setMsg(`Envío detenido tras ${s.done} de ${s.total} líneas`);
    else setMsg("Error en el envío");
    // Solo al cambiar de estado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return msg;
}
