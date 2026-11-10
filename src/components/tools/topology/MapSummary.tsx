import { memo } from "react";
import { ageText } from "../../../lib/topoInsights";
import { plural } from "../../../lib/plural";
import { useNow } from "./topoHooks";

/**
 * Resumen del mapa (arriba a la derecha): "Todo normal salvo N enlaces", de dónde y cuándo se leyó.
 * Un clic abre "Requieren atención" en el panel.
 */
export const MapSummary = memo(function MapSummary({
  trafficOn,
  visible,
  last,
  snmp,
  cli,
  count,
  hasData,
  inset,
  onOpen,
}: {
  trafficOn: boolean;
  visible: boolean;
  last: number | undefined;
  snmp: boolean;
  cli: boolean;
  count: number;
  hasData: boolean;
  /** Franja de la derecha que tapa el panel superpuesto (px). */
  inset: number;
  onOpen: () => void;
}) {
  const now = useNow(5000, trafficOn && visible && !!last);
  if (!trafficOn && !count) return null;
  const src = snmp && cli ? "SNMP y consola" : snmp ? "SNMP" : cli ? "Consola" : "";
  const head = trafficOn && !hasData ? (last ? "Sin tasas aún" : "Leyendo tráfico…") : count ? `${plural(count, "enlace requiere", "enlaces requieren")} atención` : "Todo normal";
  return (
    <button
      type="button"
      onClick={onOpen}
      title="Ver los enlaces que requieren atención"
      style={{ right: 8 + inset }}
      className="absolute top-2 z-10 max-w-[calc(100%-1rem)] inline-flex items-center gap-2 rounded-lg border border-line bg-panel shadow-pop px-2.5 h-7 text-[11.5px] hover:bg-hover"
    >
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: count ? "var(--warn)" : "var(--ok)" }} aria-hidden />
      <span className="font-medium truncate">{head}</span>
      {trafficOn && last && src && (
        <span className="text-muted truncate">
          {src} · {ageText(last, now)}
        </span>
      )}
    </button>
  );
});
