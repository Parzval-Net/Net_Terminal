import { Copy } from "lucide-react";
import type { ComponentProps, PointerEvent, RefObject } from "react";
import { labelsVisible, smallScale, textScale } from "../../../lib/mapZoom";
import { TopoNode } from "../../../lib/topology";
import { Btn } from "../ui";
import { LinkTip, TipStore } from "./LinkTip";
import { MapLegend } from "./MapLegend";
import { MapSummary } from "./MapSummary";
import { TopoLayers } from "./TopoLayers";
import { ZoomControls } from "./ZoomControls";

/**
 * El mapa: el diagrama SVG con zoom y arrastre, el resumen de atención, los controles de zoom, la
 * ficha del enlace y la leyenda. Las capas del diagrama (TopoLayers) están memorizadas: llegan con
 * las mismas props de siempre, sin tocarlas (ver "layers").
 */
export function TopoCanvas({
  mapBox,
  scroller,
  viewCount,
  shownCount,
  onClearFilters,
  box,
  zoomUsed,
  mapK,
  panning,
  insetRight,
  onPanStart,
  onPointerMove,
  onEndDrag,
  layers,
  panelOpen,
  sel,
  copyText,
  onShowDetail,
  summary,
  zoom,
  tips,
  detailsFor,
  legend,
}: {
  mapBox: RefObject<HTMLDivElement | null>;
  scroller: RefObject<HTMLDivElement | null>;
  /** Equipos del diagrama y de lo que se dibuja (con filtros). */
  viewCount: number;
  shownCount: number;
  onClearFilters: () => void;
  /** Encuadre del diagrama (coordenadas del mapa) y zoom aplicado. */
  box: { x: number; y: number; w: number; h: number };
  zoomUsed: number;
  mapK: number;
  panning: boolean;
  /** Franja de la derecha que tapa el panel superpuesto (px). */
  insetRight: number;
  onPanStart: (e: PointerEvent<SVGSVGElement>) => void;
  onPointerMove: (e: PointerEvent<SVGSVGElement>) => void;
  onEndDrag: () => void;
  layers: ComponentProps<typeof TopoLayers>;
  panelOpen: boolean;
  sel: TopoNode | undefined;
  copyText: (text: string, what: string) => Promise<void>;
  onShowDetail: () => void;
  summary: ComponentProps<typeof MapSummary>;
  zoom: ComponentProps<typeof ZoomControls>;
  tips: TipStore;
  detailsFor: ComponentProps<typeof LinkTip>["detailsFor"];
  /** Leyenda (null si no hay nada que explicar en la vista). */
  legend: ComponentProps<typeof MapLegend> | null;
}) {
  return (
    <div ref={mapBox} className="relative flex-1 min-w-0 rounded-xl border border-line bg-panel overflow-hidden">
      <div ref={scroller} className="absolute inset-0 overflow-auto" style={{ touchAction: "none" }}>
        {!viewCount ? (
          <div className="h-full grid place-items-center text-[12.5px] text-muted p-6 text-center">
            Conecta una sesión con un equipo y pulsa "Descubrir vecinos", o agrega equipos y enlaces a mano.
          </div>
        ) : !shownCount ? (
          <div className="h-full grid place-items-center text-[12.5px] text-muted p-6 text-center">
            <div className="space-y-2">
              <p>Ningún equipo coincide con los filtros.</p>
              <Btn onClick={onClearFilters}>Quitar filtros</Btn>
            </div>
          </div>
        ) : (
          <svg
            viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
            // --ts y --sm: contraescala de los textos y ocultar puertos e IP con poco zoom (ver scaledText).
            style={{ width: `${zoomUsed * 100}%`, height: `${zoomUsed * 100}%`, cursor: panning ? "grabbing" : "grab", "--ts": textScale(mapK), "--ss": smallScale(mapK), "--sm": labelsVisible(mapK) ? "inline" : "none" } as React.CSSProperties}
            onPointerDown={onPanStart}
            onPointerMove={onPointerMove}
            onPointerUp={onEndDrag}
            onPointerLeave={onEndDrag}
          >
            <TopoLayers {...layers} />
          </svg>
        )}
        {insetRight > 0 && <div aria-hidden className="pointer-events-none absolute left-0 top-0 h-px" style={{ width: `calc(${zoomUsed * 100}% + ${insetRight}px)` }} />}
      </div>
      {!panelOpen && sel && (
        <div className="absolute top-2 left-2 flex items-center gap-2 max-w-[calc(100%-1rem)] rounded-lg border border-line bg-panel shadow-pop pl-3 pr-1 py-1 text-[12px]">
          <span className="font-medium truncate">{sel.name}</span>
          {sel.ip && (
            <Btn kind="ghost" className="!h-6 !px-2 !text-[11.5px]" title={`Copiar IP (${sel.ip})`} aria-label={`Copiar IP ${sel.ip}`} onClick={() => copyText(sel.ip!, "IP")}>
              <Copy size={12} /> <span className="font-mono">{sel.ip}</span>
            </Btn>
          )}
          <Btn kind="ghost" className="!h-6 !px-2 !text-[11.5px] !text-accent" onClick={onShowDetail}>
            Ver detalle
          </Btn>
        </div>
      )}
      <MapSummary {...summary} />
      {viewCount > 0 && shownCount > 0 && <ZoomControls {...zoom} />}
      <LinkTip store={tips} box={mapBox} detailsFor={detailsFor} />
      {legend && <MapLegend {...legend} />}
    </div>
  );
}
