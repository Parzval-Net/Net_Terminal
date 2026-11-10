import { Check } from "lucide-react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { plural } from "../../../lib/plural";
import { UTIL_HIGH, UTIL_SATURATED } from "../../../lib/topoTraffic";
import { AttentionRow, checkCoverage } from "../../../lib/topoInsights";
import { LinkSuggestion, TOPO_SOURCES } from "../../../lib/topology";
import { Btn, Collapsible, Toggle } from "../ui";
import { TRAFFIC_INTERVALS, TrafficInterval, useTopoTraffic } from "../useTopoTraffic";
import { AttentionList } from "./AttentionList";
import { FLOW_MAX } from "./topoConst";
import { CONFIDENCE_COLOR } from "./topoStyle";
import type { TopoUi } from "./topoUi";

/** Enlaces que requieren atención: alto, saturado, caído o con problemas de interfaz. */
export function AttentionSection({
  attention,
  counts,
  coverage,
  trafficOn,
  focusLink,
  onPick,
  open,
  onToggle,
}: {
  attention: AttentionRow[];
  counts: { down: number; load: number; issues: number };
  coverage: ReturnType<typeof checkCoverage>;
  trafficOn: boolean;
  focusLink: string | null;
  onPick: (key: string) => void;
  open: boolean;
  onToggle: (v: boolean) => void;
}) {
  const attentionCount = counts;
  return (
    <Collapsible
      title="Requieren atención"
      badge={attention.length || undefined}
      summary={
        attention.length
          ? [attentionCount.down && `${attentionCount.down} caído${attentionCount.down === 1 ? "" : "s"}`, attentionCount.load && `${attentionCount.load} por carga`, attentionCount.issues && plural(attentionCount.issues, "problema", "problemas")]
              .filter(Boolean)
              .join(" · ")
          : "Todo normal"
      }
      open={open}
      onToggle={onToggle}
    >
      <div className="space-y-2 text-[12px]">
        {attention.length > 0 ? (
          <AttentionList rows={attention} focusLink={focusLink} onPick={onPick} />
        ) : (
          <p className="text-muted">Todo normal{trafficOn ? "" : ": activa el tráfico para ver también la carga de los enlaces"}.</p>
        )}
        <p className="text-[11px] text-muted leading-snug">
          Alto desde {Math.round(UTIL_HIGH * 100)} %, saturado desde {Math.round(UTIL_SATURATED * 100)} % (sentido más cargado); caído es un puerto down o err-disabled en algún extremo. Los problemas de interfaz son dúplex o
          velocidad distintos, VLAN nativa, trunk contra access, miembros fuera del agregado, errores CRC y enlaces que solo ve un lado; los errores son acumulados desde el último clear counters.
        </p>
        <p className="text-[11px] text-muted leading-snug">
          {coverage.links
            ? `Revisados con datos de puertos: ${coverage.withData} de ${plural(coverage.links, "enlace físico", "enlaces físicos")} (${coverage.both} con ambos extremos).`
            : "Sin enlaces físicos que revisar."}
          {coverage.withData < coverage.links ? ' Activa "Estado de puertos" y explora también el otro extremo para completar la comparación.' : ""} Por SNMP solo se leen estado y velocidad; el dúplex, la VLAN nativa y los errores
          vienen de la consola y de lo que anuncia CDP.
        </p>
      </div>
    </Collapsible>
  );
}

/** Tráfico en enlaces: activar la lectura, intervalo, consola, vista detallada y estado de las lecturas. */
export function TrafficSection({
  summary,
  trafficOn,
  trafficCli,
  setTrafficOn,
  setTrafficCli,
  ui,
  setUi,
  status,
  hasTerminals,
  ratesCount,
  reducedMotion,
  open,
  onToggle,
}: {
  summary: string;
  trafficOn: boolean;
  trafficCli: boolean;
  setTrafficOn: (on: boolean) => void;
  setTrafficCli: (on: boolean) => void;
  ui: TopoUi;
  setUi: Dispatch<SetStateAction<TopoUi>>;
  status: ReturnType<typeof useTopoTraffic>["status"];
  /** Hay sesiones conectadas (ofrece leer por consola). */
  hasTerminals: boolean;
  /** Enlaces con tasa leída. */
  ratesCount: number;
  reducedMotion: boolean;
  open: boolean;
  onToggle: (v: boolean) => void;
}) {
  const traffic = { status };
  return (
    <Collapsible
      title="Tráfico en enlaces"
      summary={summary}
      open={open}
      onToggle={onToggle}
    >
      <div className="space-y-2.5 text-[12px]">
        <div>
          <Toggle checked={trafficOn} onChange={setTrafficOn} label="Tráfico en enlaces" />
          <p className="mt-0.5 pl-10 text-[11px] text-muted leading-snug">
            Lee los contadores de las interfaces con enlace de cada equipo explorado, solo mientras Topología está a la vista. Por SNMP usa el perfil del equipo (misma IP o
            nombre, con secretos guardados): un GET de ifHCInOctets, ifHCOutOctets e ifHighSpeed (IF-MIB), o los de 32 bits si el agente no los tiene.
          </p>
        </div>
        <label className="flex items-center gap-2 pl-10">
          <span className="text-muted">Cada</span>
          <select
            className="field !h-7 !w-24 !text-[12px]"
            value={ui.interval}
            onChange={(e) => setUi((u) => ({ ...u, interval: Number(e.target.value) as TrafficInterval }))}
          >
            {TRAFFIC_INTERVALS.map((i) => (
              <option key={i} value={i}>
                {i} s
              </option>
            ))}
          </select>
        </label>
        <div>
          <Toggle checked={trafficCli} onChange={setTrafficCli} label="También por consola" />
          <p className="mt-0.5 pl-10 text-[11px] text-muted leading-snug">
            Para equipos sin perfil SNMP: envía <span className="font-mono">show interfaces</span>, <span className="font-mono">display interface</span> o{" "}
            <span className="font-mono">show interfaces extensive</span> a su sesión conectada en cada lectura. Solo consulta, pero ocupa la sesión unos segundos. En Cisco la misma lectura trae el estado,
            el dúplex y los errores CRC de cada interfaz, que alimentan los problemas de interfaz.
          </p>
        </div>
        <div>
          <Toggle checked={ui.detail} onChange={(d) => setUi((u) => ({ ...u, detail: d }))} label="Vista detallada" />
          <p className="mt-0.5 pl-10 text-[11px] text-muted leading-snug">
            Para expertos. Por defecto el mapa es por excepción: lo normal (menos de {Math.round(UTIL_HIGH * 100)} %) queda en gris fino y solo se resaltan los enlaces altos, saturados o caídos. La vista detallada
            colorea todos los enlaces por utilización y agrega rótulos, flechas y animación.
          </p>
        </div>
        {ui.detail && (
          <div className="space-y-2.5 pl-4 border-l border-line">
            <div>
              <Toggle checked={ui.color} onChange={(color) => setUi((u) => ({ ...u, color }))} label="Color por utilización" />
              <p className="mt-0.5 pl-10 text-[11px] text-muted leading-snug">Verde, amarillo desde 70 % y rojo desde 90 %, con grosor según la carga.</p>
            </div>
            <div>
              <Toggle checked={ui.arrows} onChange={(arrows) => setUi((u) => ({ ...u, arrows }))} label="Flechas de dirección" />
              <p className="mt-0.5 pl-10 text-[11px] text-muted leading-snug">Una punta por sentido sobre cada enlace.</p>
            </div>
            <div>
              <Toggle checked={ui.rates} onChange={(rates) => setUi((u) => ({ ...u, rates }))} label="Rótulo en el enlace" />
              <p className="mt-0.5 pl-10 text-[11px] text-muted leading-snug">Una etiqueta corta sobre cada enlace con el % de uso (o la tasa, si no se conoce la velocidad).</p>
            </div>
            <div>
              <Toggle checked={ui.anim && ui.arrows} onChange={(anim) => setUi((u) => ({ ...u, anim, arrows: anim || u.arrows }))} label="Animación" />
              <p className="mt-0.5 pl-10 text-[11px] text-muted leading-snug">
                Puntos que viajan por cada sentido del enlace, más rápido cuanto más carga (se pausa con la herramienta oculta). Con más de {FLOW_MAX} enlaces con
                tráfico se animan los {FLOW_MAX} más cargados y el resto mantiene sus flechas.
                {reducedMotion ? " El sistema pide reducir movimiento: queda desactivada." : ""}
              </p>
            </div>
          </div>
        )}
        {trafficOn && (
          <div className="rounded-md border border-line px-2 py-1.5 space-y-0.5 text-[11.5px]">
            {!traffic.status.last && <p className="text-muted">Leyendo…</p>}
            {traffic.status.snmp.length > 0 && <p>SNMP: {traffic.status.snmp.join(", ")}</p>}
            {traffic.status.cli.length > 0 && <p>Consola: {traffic.status.cli.join(", ")}</p>}
            {traffic.status.none.length > 0 && (
              <div className="space-y-1">
                {/* Sin SNMP ni consola no hay tráfico: el motivo y la acción, a la vista. */}
                <p className="text-warn">
                  Sin datos de tráfico de {traffic.status.none.join(", ")}: {trafficCli ? "conecta su sesión o crea su perfil SNMP." : "no tiene perfil SNMP."}
                </p>
                {!trafficCli && hasTerminals && (
                  <button
                    onClick={() => setTrafficCli(true)}
                    className="h-7 px-2.5 rounded-md border border-line text-[12px] hover:bg-hover"
                    title="Envía show interfaces, display interface o show interfaces extensive a su sesión conectada en cada lectura (solo consulta)"
                  >
                    Leer por consola
                  </button>
                )}
              </div>
            )}
            {traffic.status.busy.length > 0 && (
              <p className="text-muted">
                Pestaña ocupada ({traffic.status.busy.join(", ")}): sin prompt a la vista (paginador, contraseña o un comando en curso); no se le envía nada y se reintenta en la próxima lectura.
              </p>
            )}
            {traffic.status.errors.map((e) => (
              <p key={e} className="text-danger">
                {e}
              </p>
            ))}
            {traffic.status.last && !ratesCount && !traffic.status.errors.length && (
              <p className="text-muted">La tasa aparece desde la segunda lectura ({ui.interval} s).</p>
            )}
            {traffic.status.last && <p className="text-muted">Última lectura: {new Date(traffic.status.last).toLocaleTimeString()}</p>}
          </div>
        )}
      </div>
    </Collapsible>
  );
}

/** Sugerencias de enlaces calculadas del diagrama ya leído: se confirman una a una. */
export function SuggestionsSection({
  suggestions,
  emptyHints,
  nameOf,
  onAccept,
  onDismiss,
  wrapperRef,
  open,
  onToggle,
}: {
  suggestions: LinkSuggestion[];
  emptyHints: string[];
  /** Nombre del equipo en el diagrama (si no está, el id). */
  nameOf: (id: string) => string | undefined;
  onAccept: (s: LinkSuggestion) => void;
  onDismiss: (id: string) => void;
  wrapperRef: RefObject<HTMLDivElement | null>;
  open: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <div ref={wrapperRef} className="scroll-mt-2">
      <Collapsible
        title="Sugerencias"
        badge={suggestions.length}
        summary={suggestions.length ? "Confirma cada una antes de dibujarla" : "Sin sugerencias por ahora"}
        open={open}
        onToggle={onToggle}
      >
    {suggestions.length ? (
      <ul className="space-y-2 max-h-56 overflow-y-auto">
        {suggestions.map((s) => (
          <li key={s.id} className="rounded-md border border-line px-2 py-1.5 text-[11.5px]">
            <div className="flex items-center gap-1.5">
              <span className="font-mono flex-1 min-w-0 [overflow-wrap:anywhere]" title={`${nameOf(s.a) ?? s.a} ${s.aPort} → ${s.target} ${s.bPort}`}>
                <span className="whitespace-nowrap">
                  {nameOf(s.a) ?? s.a} {s.aPort}
                </span>{" "}
                <span className="whitespace-nowrap">
                  → {s.target} {s.bPort}
                </span>
              </span>
              <span className="text-[11px] font-medium shrink-0" style={{ color: CONFIDENCE_COLOR[s.confidence] }} title={`Confianza ${s.confidence}`}>
                {s.confidence}
              </span>
            </div>
            <p className="text-muted truncate" title={s.reason}>
              {TOPO_SOURCES.find((x) => x.id === s.source)?.short ?? s.source}: {s.source === "descriptions" ? `"${s.reason}"` : s.reason}
            </p>
            {s.detail && (
              <p className="text-muted truncate" title={s.detail.vendors.join(", ")}>
                {s.detail.vendors.join(", ")} · {s.detail.macs} MAC{s.detail.ip && <span className="font-mono"> · {s.detail.ip}</span>}
              </p>
            )}
            <div className="flex gap-1 mt-1">
              <Btn kind="primary" className="!h-6 !px-2 !text-[11px]" onClick={() => onAccept(s)}>
                <Check size={12} /> Confirmar
              </Btn>
              <Btn kind="ghost" className="!h-6 !px-2 !text-[11px]" onClick={() => onDismiss(s.id)}>
                Descartar
              </Btn>
            </div>
          </li>
        ))}
      </ul>
    ) : (
      <div className="space-y-1 text-[12px] text-muted">
        {emptyHints.map((h) => (
          <p key={h}>{h}</p>
        ))}
      </div>
    )}
      </Collapsible>
    </div>
  );
}
