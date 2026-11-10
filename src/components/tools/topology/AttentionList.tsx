import { AttentionRow } from "../../../lib/topoInsights";
import { shortName } from "../../../lib/topology";

/** Lista de "Requieren atención": un clic ubica y resalta el enlace en el mapa. */
export function AttentionList({ rows, focusLink, onPick }: { rows: AttentionRow[]; focusLink: string | null; onPick: (key: string) => void }) {
  return (
    <ul className="space-y-0.5 max-h-72 overflow-y-auto">
      {rows.map((r) => {
        const pct = r.util === undefined ? undefined : Math.round(r.util * 100);
        const c = r.level === "down" ? "var(--muted)" : r.level === "saturated" ? "var(--danger)" : "var(--warn)";
        return (
          <li key={r.key}>
            <button
              type="button"
              onClick={() => onPick(r.key)}
              aria-pressed={focusLink === r.key}
              className={`w-full text-left rounded-md px-1.5 py-1 hover:bg-hover ${focusLink === r.key ? "bg-selected" : ""}`}
              title="Ubicar y resaltar en el diagrama"
            >
              <span className="flex items-center gap-2">
                <span className="flex-1 min-w-0 truncate font-medium">
                  {shortName(r.aName, 18)} <span className="text-muted">↔</span> {shortName(r.bName, 18)}
                </span>
                <span className="shrink-0 tabular-nums font-semibold" style={{ color: `color-mix(in srgb, ${c} 45%, var(--text))` }}>
                  {r.level === "down" ? "caído" : pct === undefined ? "!" : `${pct} %`}
                </span>
              </span>
              {pct !== undefined && r.level !== "down" && (
                <span className="mt-0.5 block h-1 rounded-full bg-line overflow-hidden" aria-hidden>
                  <span className="block h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: r.level === "issues" ? "var(--muted)" : c }} />
                </span>
              )}
              <span className="block text-[11.5px] text-muted [overflow-wrap:anywhere]">{r.phrase}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
