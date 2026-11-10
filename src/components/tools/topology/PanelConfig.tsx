import { X } from "lucide-react";
import { Dispatch, SetStateAction } from "react";
import { plural } from "../../../lib/plural";
import {
  NO_FILTER,
  NodeRole,
  NodeState,
  NodeVendor,
  ROLE_LABEL,
  STATE_LABEL,
  TopoFilter,
  TopoScope,
  VENDOR_LABEL,
  parseCidrs,
} from "../../../lib/topoInsights";
import { TOPO_SOURCES, TopoNode, TopoSources, sourceOn } from "../../../lib/topology";
import { Btn, Collapsible, Label, Toggle } from "../ui";
import { MAX_L2_NODES } from "./topoConst";

/** Fuentes de descubrimiento (CDP/LLDP y lo manual van siempre; el resto se activa aquí). */
export function SourcesSection({ sources, onSources, open, onToggle }: { sources: TopoSources; onSources: (s: TopoSources) => void; open: boolean; onToggle: (v: boolean) => void }) {
  const activeSources = TOPO_SOURCES.filter((s) => sourceOn(sources, s.id)).length;
  return (
    <Collapsible
      title="Fuentes de descubrimiento"
      summary={`${activeSources} de ${TOPO_SOURCES.length} activas · CDP/LLDP y lo manual, siempre`}
      open={open}
      onToggle={onToggle}
    >
  <div className="space-y-2.5">
  {TOPO_SOURCES.map((s) => (
    <div key={s.id}>
      <Toggle checked={sourceOn(sources, s.id)} onChange={(v) => onSources({ ...sources, [s.id]: v })} label={s.label} />
      <p className="mt-0.5 pl-10 text-[11px] text-muted leading-snug">{s.hint}</p>
    </div>
  ))}
  </div>
    </Collapsible>
  );
}

/** Alcance del descubrimiento: qué vecinos nuevos se incorporan. */
export function ScopeSection({ scope, onScope, open, onToggle }: { scope: TopoScope; onScope: (p: Partial<TopoScope>) => void; open: boolean; onToggle: (v: boolean) => void }) {
  const scopeErr = parseCidrs(scope.cidrs).error;
  const scopeSummary =
    [scope.skipEndpoints && "sin teléfonos ni AP", scope.cidrs.trim() && !scopeErr && scope.cidrs.trim(), scope.maxDepth && `hasta ${scope.maxDepth} saltos`]
      .filter(Boolean)
      .join(" · ") || "Sin restricciones";
  return (
    <Collapsible title="Alcance del descubrimiento" summary={scopeSummary} open={open} onToggle={onToggle}>
      <div className="space-y-2.5 text-[12px]">
        <p className="text-[11px] text-muted leading-snug">
          Qué vecinos nuevos se agregan al descubrir. Los que ya están en el diagrama conservan su enlace. No cambia los comandos que se envían.
        </p>
        <div>
          <Toggle checked={scope.skipEndpoints} onChange={(skipEndpoints) => onScope({ skipEndpoints })} label="Sin teléfonos IP ni access points" />
          <p className="mt-0.5 pl-10 text-[11px] text-muted leading-snug">Según la plataforma y las capacidades que anuncian por CDP/LLDP.</p>
        </div>
        <Label text="Solo estas redes (CIDR, separadas por coma)">
          <input
            className="field font-mono !text-[12px]"
            placeholder="10.0.0.0/8, 192.168.10.0/24"
            maxLength={500}
            aria-invalid={!!scopeErr}
            value={scope.cidrs}
            onChange={(e) => onScope({ cidrs: e.target.value })}
          />
        </Label>
        {scopeErr ? (
          <p className="text-[11.5px] text-danger">{scopeErr}. Mientras tanto no se filtra por red.</p>
        ) : (
          <p className="text-[11px] text-muted leading-snug">Un vecino sin IP de gestión informada se agrega igual.</p>
        )}
        <label className="flex items-center gap-2">
          <span className="text-muted">Profundidad máxima</span>
          <select className="field !h-7 !w-36 !text-[12px]" value={scope.maxDepth} onChange={(e) => onScope({ maxDepth: Number(e.target.value) })}>
            <option value={0}>Sin límite</option>
            {[1, 2, 3, 4, 5, 6, 8, 10].map((d) => (
              <option key={d} value={d}>
                {plural(d, "salto", "saltos")}
              </option>
            ))}
          </select>
        </label>
      </div>
    </Collapsible>
  );
}

/** Filtros del diagrama (rol, fabricante, origen, estado y vecindario): solo cambian lo que se dibuja. */
export function FiltersSection({
  filter,
  setFilter,
  filtering,
  shownCount,
  viewCount,
  roleCounts,
  vendorCounts,
  protoCounts,
  stateCounts,
  nodesByName,
  selected,
  l2,
  onL2,
  open,
  onToggle,
}: {
  filter: TopoFilter;
  setFilter: Dispatch<SetStateAction<TopoFilter>>;
  filtering: boolean;
  shownCount: number;
  viewCount: number;
  roleCounts: Map<NodeRole, number>;
  vendorCounts: Map<NodeVendor, number>;
  protoCounts: Map<string, number>;
  stateCounts: Map<NodeState, number>;
  nodesByName: TopoNode[];
  selected: string | null;
  /** Puertos activos sin vecino dibujados como "L2 desconocido". */
  l2: boolean;
  onL2: (v: boolean) => void;
  open: boolean;
  onToggle: (v: boolean) => void;
}) {
  /** Chips de un criterio de filtro: solo los valores presentes en el diagrama, con su cantidad. */
  const chipGroup = <K extends string>(label: string, field: "roles" | "vendors" | "protos" | "states", counts: Map<K, number>, names: (k: K) => string) =>
    counts.size > 0 && (
      <div>
        <p className="mb-1 text-[11.5px] font-medium text-muted">{label}</p>
        <div className="flex flex-wrap gap-1">
          {[...counts].map(([k, c]) => {
            const list = filter[field] as string[];
            const on = list.includes(k);
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                onClick={() => setFilter((f) => ({ ...f, [field]: on ? list.filter((x) => x !== k) : [...list, k] }))}
                className={`h-7 px-2 rounded-md border text-[11.5px] ${on ? "border-[var(--accent)] text-accent bg-[var(--selected)]" : "border-line hover:bg-hover"}`}
              >
                {names(k)} <span className="text-muted">{c}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  return (
    <Collapsible
      title="Filtros"
      summary={filtering ? `Mostrando ${shownCount} de ${viewCount} equipos` : "Todo a la vista"}
      open={open}
      onToggle={onToggle}
      right={
        filtering && (
          <Btn kind="ghost" className="!px-1.5 !text-[11.5px]" title="Quitar todos los filtros" onClick={() => setFilter(NO_FILTER)}>
            <X size={13} /> Quitar
          </Btn>
        )
      }
    >
      <div className="space-y-2.5 text-[12px]">
        {chipGroup("Rol (estimado por plataforma y capacidades)", "roles", roleCounts, (k) => ROLE_LABEL[k])}
        {chipGroup("Fabricante", "vendors", vendorCounts, (k) => VENDOR_LABEL[k])}
        {chipGroup("Origen del enlace", "protos", protoCounts, (k) => (k === "manual" ? "Manual" : k))}
        {chipGroup("Estado", "states", stateCounts, (k) => STATE_LABEL[k])}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted">Solo a</span>
          <select
            className="field !h-7 !w-28 !text-[12px]"
            aria-label="Saltos desde el equipo foco"
            value={filter.hops}
            onChange={(e) => {
              const hops = Number(e.target.value);
              setFilter((f) => ({ ...f, hops, focus: hops ? (f.focus ?? selected ?? nodesByName[0]?.id) : f.focus }));
            }}
          >
            <option value={0}>sin límite</option>
            {[1, 2, 3, 4, 5].map((d) => (
              <option key={d} value={d}>
                {plural(d, "salto", "saltos")}
              </option>
            ))}
          </select>
          <span className="text-muted">de</span>
          <select
            className="field !h-7 flex-1 min-w-0 !text-[12px]"
            aria-label="Equipo foco"
            disabled={!filter.hops}
            value={filter.focus ?? ""}
            onChange={(e) => setFilter((f) => ({ ...f, focus: e.target.value || undefined }))}
          >
            {nodesByName.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Toggle checked={l2} onChange={onL2} label="Puertos activos sin vecino" />
          <p className="mt-0.5 pl-10 text-[11px] text-muted leading-snug">
            Dibuja un nodo "L2 desconocido" junto a cada equipo con interfaces activas sin vecino CDP/LLDP (requiere "Estado de puertos"). Con más de {MAX_L2_NODES} equipos así, solo el del equipo seleccionado.
          </p>
        </div>
      </div>
    </Collapsible>
  );
}
