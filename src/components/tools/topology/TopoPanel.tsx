import { ArrowLeft, X } from "lucide-react";
import type { ReactNode } from "react";
import type { TopoNode } from "../../../lib/topology";
import { Btn } from "../ui";

/**
 * Panel lateral de la herramienta. Se acopla al lado del mapa ("dock"), se superpone en anchos
 * medianos ("overlay") u ocupa el mapa completo con "Volver al mapa" en ventanas chicas ("sheet").
 * Las secciones llegan como hijos (ver PanelConfig, PanelStatus y PanelItem).
 */
export function TopoPanel({
  id,
  mode,
  width,
  sel,
  onClose,
  children,
}: {
  id: string;
  mode: "dock" | "overlay" | "sheet";
  /** Ancho del panel superpuesto (px). */
  width: number;
  sel: TopoNode | undefined;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <aside
      id={id}
      aria-label="Panel de topología"
      style={mode === "overlay" ? { width } : undefined}
      onKeyDown={(e) => {
        if (e.key === "Escape" && mode !== "dock" && !(e.target as HTMLElement).closest('[role="listbox"],[role="dialog"]')) onClose();
      }}
      className={
        mode === "dock"
          ? "w-[320px] shrink-0 min-h-0 overflow-y-auto space-y-3"
          : mode === "overlay"
            ? "absolute top-0 right-0 bottom-0 z-10 min-h-0 overflow-y-auto space-y-3 rounded-xl bg-bg p-2 shadow-pop"
            : "absolute inset-0 z-10 min-h-0 overflow-y-auto space-y-3 rounded-xl bg-bg p-2"
      }
    >
      {mode !== "dock" && (
        <div className="sticky top-0 z-10 -mx-2 -mt-2 flex items-center gap-2 border-b border-line bg-bg px-2 py-1.5">
          <Btn kind="ghost" className="!px-2" onClick={onClose} title={mode === "sheet" ? "Volver al mapa" : "Cerrar el panel"}>
            {mode === "sheet" ? <ArrowLeft size={14} aria-hidden /> : <X size={14} aria-hidden />} {mode === "sheet" ? "Volver al mapa" : "Cerrar"}
          </Btn>
          <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{sel ? sel.name : "Panel"}</span>
        </div>
      )}
      {children}
    </aside>
  );
}
