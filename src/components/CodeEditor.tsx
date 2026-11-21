import { forwardRef, useId, useMemo, useRef } from "react";
import type { ITheme } from "@xterm/xterm";
import { Compiled, cssColor, runs } from "../lib/highlight";
import { type Risk, computeRisk, riskLabel } from "../lib/packs";

/**
 * Líneas que el gutter de riesgo no marca: vacías, comentarios (!, #, //) y salidas de modo. Es el mismo
 * criterio del diálogo de difusión (BroadcastDialog), más "//", que el CLI Lab trata como comentario.
 */
const NO_RISK = /^\s*(!|#|\/\/|(end|exit|quit|return)\s*$)/i;

/** Riesgo de una línea del editor con computeRisk (memorizado en packs.ts); comentarios y vacías son consulta. */
export function lineRisk(line: string): Risk {
  return !line.trim() || NO_RISK.test(line) ? "read" : computeRisk(line);
}

/** Ícono de riesgo, el mismo del catálogo: ▲ cambio, ✕ disruptivo. La consulta no se marca. */
export const RISK_MARK: Record<Risk, string> = { read: "", change: "▲", disruptive: "✕" };
/** Color del ícono con los tokens de la app (contraste AA en claro y oscuro). */
export const RISK_TEXT: Record<Risk, string> = { read: "text-muted", change: "text-warn", disruptive: "text-danger" };

export interface RiskCount {
  /** Líneas con texto (las que se envían). */
  lines: number;
  /** Líneas que cambian config/estado, incluidas las que pueden cortar servicio. */
  changes: number;
  /** Líneas que pueden cortar servicio. */
  disruptive: number;
}

/** Resumen de riesgo de un texto de varias líneas, para el botón de envío. */
export function riskCount(text: string): RiskCount {
  const c: RiskCount = { lines: 0, changes: 0, disruptive: 0 };
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    c.lines++;
    const r = lineRisk(line);
    if (r !== "read") c.changes++;
    if (r === "disruptive") c.disruptive++;
  }
  return c;
}

/** "líneas 3, 5 y 7" con un tope, para el texto accesible del gutter. */
function lineList(nums: number[]): string {
  const MAX = 20;
  const shown = nums.slice(0, MAX);
  const rest = nums.length - shown.length;
  const head = shown.length > 1 ? `${shown.slice(0, -1).join(", ")} y ${shown[shown.length - 1]}` : String(shown[0]);
  return `${nums.length === 1 ? "línea" : "líneas"} ${head}${rest > 0 ? ` y ${rest} más` : ""}`;
}

/** Una línea coloreada con las reglas de resaltado (las mismas de la terminal). */
export function renderHighlighted(line: string, compiled: Compiled[], theme: ITheme): React.ReactNode {
  const spans = runs(line, compiled);
  if (!spans.length) return line || " ";
  const parts: React.ReactNode[] = [];
  let pos = 0;
  spans.forEach(([s, e, i], k) => {
    if (s > pos) parts.push(line.slice(pos, s));
    const st = compiled[i].style;
    parts.push(
      <span
        key={k}
        style={{
          color: cssColor(st.color, theme),
          background: cssColor(st.bg, theme, true),
          fontWeight: st.bold ? 700 : undefined,
          fontStyle: st.italic ? "italic" : undefined,
          textDecoration: st.underline ? "underline" : undefined,
        }}
      >
        {line.slice(s, e)}
      </span>,
    );
    pos = e;
  });
  parts.push(line.slice(pos));
  return parts;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  compiled: Compiled[];
  theme: ITheme;
  font: string;
  fontSize: number;
  placeholder?: string;
  /** Columna con el número de cada línea (CLI Lab). */
  gutter?: boolean;
  /** Columna de riesgo por línea (▲ cambio, ✕ disruptivo) calculada con computeRisk. */
  risk?: boolean;
}

/**
 * Textarea con resaltado: el texto real es transparente y debajo se dibuja una copia
 * coloreada con el mismo motor que la terminal. Sin ajuste de línea, como un editor de config.
 */
export const CodeEditor = forwardRef<HTMLTextAreaElement, Props>(function CodeEditor(
  { value, onChange, onKeyDown, compiled, theme, font, fontSize, placeholder, gutter, risk },
  ref,
) {
  const preRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const riskRef = useRef<HTMLDivElement>(null);
  const riskId = useId();
  const lines = useMemo(() => value.split("\n"), [value]);
  const lineCount = gutter ? lines.length : 0;
  // Los números solo cambian al agregar o quitar líneas, no en cada tecla.
  const numbers = useMemo(() => Array.from({ length: lineCount }, (_, i) => <div key={i}>{i + 1}</div>), [lineCount]);

  // Caché por texto de línea: al teclear solo se vuelve a resaltar la línea que cambió.
  const cache = useMemo(() => new Map<string, React.ReactNode>(), [compiled, theme]);

  // Elemento por posición y texto: React omite las líneas cuyo elemento es el mismo objeto que en el
  // dibujo anterior, así que en un script de miles de líneas cada tecla solo toca la línea editada.
  const rows = useMemo(() => new Map<string, React.ReactElement>(), [compiled, theme]);

  // Marcas de riesgo con la misma caché por posición y texto que el resaltado: solo se dibujan las líneas
  // que no son consulta (posición absoluta), así un script largo no agrega un nodo por línea.
  const marks = useMemo(() => new Map<string, { r: Risk; el: React.ReactElement } | null>(), []);
  const riskView = useMemo(() => {
    if (!risk) return null;
    if (marks.size > 20000) marks.clear();
    const items: React.ReactElement[] = [];
    const change: number[] = [];
    const cut: number[] = [];
    lines.forEach((line, li) => {
      const key = `${li}\u0000${line}`;
      let m = marks.get(key);
      if (m === undefined) {
        const r = lineRisk(line);
        // La posición va en em del tamaño de letra del editor (lo fija la columna); el ícono, más chico, va adentro.
        m =
          r === "read"
            ? null
            : {
                r,
                el: (
                  <div
                    key={li}
                    title={`Línea ${li + 1}: ${riskLabel[r]}`}
                    className={`absolute inset-x-0 grid place-items-center ${RISK_TEXT[r]}`}
                    style={{ top: `${li * 1.5}em`, height: "1.5em" }}
                  >
                    <span className="text-[10px] leading-none">{RISK_MARK[r]}</span>
                  </div>
                ),
              };
        marks.set(key, m);
      }
      if (!m) return;
      items.push(m.el);
      (m.r === "disruptive" ? cut : change).push(li + 1);
    });
    const parts = [
      change.length ? `${lineList(change)}: ${riskLabel.change.toLowerCase()}` : "",
      cut.length ? `${lineList(cut)}: ${riskLabel.disruptive.toLowerCase()}` : "",
    ].filter(Boolean);
    return { items, summary: parts.length ? `Riesgo antes de enviar. ${parts.join(". ")}.` : "" };
  }, [risk, lines, marks]);

  const highlighted = useMemo(() => {
    if (cache.size > 5000) cache.clear();
    if (rows.size > 20000) rows.clear();
    return lines.map((line, li) => {
      const key = `${li}\u0000${line}`;
      let row = rows.get(key);
      if (row) return row;
      let body = cache.get(line);
      if (body === undefined) {
        body = renderHighlighted(line, compiled, theme);
        cache.set(line, body);
      }
      row = <div key={li}>{body}</div>;
      rows.set(key, row);
      return row;
    });

  }, [lines, cache, rows, compiled, theme]);

  const shared: React.CSSProperties = {
    fontFamily: font,
    fontSize,
    lineHeight: 1.5,
    padding: "10px 12px",
    whiteSpace: "pre",
    tabSize: 4,
    margin: 0,
  };

  const editor = (
    <div className="relative flex-1 min-h-0 min-w-0" style={{ background: theme.background }}>
      <pre
        ref={preRef}
        aria-hidden
        className="absolute inset-0 overflow-hidden pointer-events-none"
        style={{ ...shared, color: theme.foreground, fontWeight: 400 }}
      >
        {highlighted}
        {"\n"}
      </pre>
      <textarea
        ref={ref}
        value={value}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        placeholder={placeholder}
        aria-describedby={riskView?.summary ? riskId : undefined}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onScroll={(e) => {
          if (preRef.current) {
            preRef.current.scrollTop = e.currentTarget.scrollTop;
            preRef.current.scrollLeft = e.currentTarget.scrollLeft;
          }
          const y = `translateY(${-e.currentTarget.scrollTop}px)`;
          if (gutterRef.current) gutterRef.current.style.transform = y;
          if (riskRef.current) riskRef.current.style.transform = y;
        }}
        className="code-editor absolute inset-0 w-full h-full resize-none outline-none bg-transparent overflow-auto"
        style={{
          ...shared,
          // Vacío no hay texto que alinear con la capa resaltada: el placeholder puede ajustarse al ancho (panel de 260 px).
          whiteSpace: value ? "pre" : "pre-wrap",
          color: "transparent",
          caretColor: String(theme.cursor ?? theme.foreground),
          WebkitTextFillColor: "transparent",
        }}
      />
    </div>
  );
  if (!gutter && !risk) return editor;
  return (
    <div className="flex flex-1 min-h-0" style={{ background: theme.background }}>
      {riskView && (
        // Fondo y tokens de la app, no del tema de la terminal: el amarillo de algunos temas claros no llega a 3:1.
        // Es decorativo para el lector de pantalla (aria-hidden): el resumen va en la descripción del editor.
        <div className="relative shrink-0 w-5 overflow-hidden select-none bg-chrome border-r border-line" style={{ fontSize }}>
          <div aria-hidden ref={riskRef} className="absolute inset-x-0 top-[10px]">
            {riskView.items}
          </div>
          {riskView.summary && (
            <span id={riskId} className="sr-only">
              {riskView.summary}
            </span>
          )}
        </div>
      )}
      {gutter && <div
        aria-hidden
        className="shrink-0 overflow-hidden select-none text-right border-r"
        style={{
          fontFamily: font,
          fontSize,
          lineHeight: 1.5,
          padding: "10px 8px 10px 12px",
          minWidth: `${String(lineCount).length + 3}ch`,
          color: cssColor("gray", theme),
          borderColor: "var(--border)",
        }}
      >
        <div ref={gutterRef}>{numbers}</div>
      </div>}
      {editor}
    </div>
  );
});
