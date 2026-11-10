import { Expand, Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { Btn } from "../ui";

/** Controles de zoom del mapa: acercar, alejar, ajustar a la vista y ver todo. */
export function ZoomControls({
  inset,
  fit,
  changeZoom,
  onFit,
  onFitAll,
}: {
  /** Franja de la derecha que tapa el panel superpuesto (px). */
  inset: number;
  fit: "floor" | "all" | "manual";
  changeZoom: (f: (z: number) => number) => void;
  onFit: () => void;
  onFitAll: () => void;
}) {
  return (
    <div className="absolute bottom-2 z-10 flex items-center gap-0.5 rounded-lg border border-line bg-panel p-0.5 shadow-pop" style={{ right: 8 + inset }} role="group" aria-label="Zoom del mapa">
      <Btn kind="ghost" className="!h-7 !w-7 !px-0" aria-label="Acercar" title="Acercar (o rueda del mouse o pellizco del touchpad sobre el mapa; arrastra el fondo para moverlo)" onClick={() => changeZoom((z) => z * 1.25)}>
        <ZoomIn size={14} aria-hidden />
      </Btn>
      <Btn kind="ghost" className="!h-7 !w-7 !px-0" aria-label="Alejar" title="Alejar (o rueda del mouse o pellizco del touchpad sobre el mapa; arrastra el fondo para moverlo)" onClick={() => changeZoom((z) => z / 1.25)}>
        <ZoomOut size={14} aria-hidden />
      </Btn>
      <Btn
        kind="ghost"
        className={`!h-7 !w-7 !px-0 ${fit === "floor" ? "!text-accent" : ""}`}
        aria-label="Ajustar a la vista"
        aria-pressed={fit === "floor"}
        title="Ajustar a la vista: tamaño legible, centrado en el equipo elegido o en el primero"
        onClick={onFit}
      >
        <Maximize2 size={14} aria-hidden />
      </Btn>
      <Btn
        kind="ghost"
        className={`!h-7 !w-7 !px-0 ${fit === "all" ? "!text-accent" : ""}`}
        aria-label="Ver todo"
        aria-pressed={fit === "all"}
        title="Ver todo: el diagrama completo, aunque los textos queden chicos"
        onClick={onFitAll}
      >
        <Expand size={14} aria-hidden />
      </Btn>
    </div>
  );
}
