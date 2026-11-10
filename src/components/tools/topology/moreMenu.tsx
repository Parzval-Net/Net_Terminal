import { Activity, Camera, Lightbulb, ListFilter, Network, Radar, Search, Trash2, TriangleAlert } from "lucide-react";
import type { MenuItem } from "../../tabMenu";
import type { PanelSection } from "./topoUi";

/** Lo que el menú "Más" necesita saber del estado de la herramienta y qué hacer con cada ítem. */
export interface MoreMenuCtx {
  /** Diseño de la barra: en "tiny" y "mid" pasa al menú lo que no cabe en ella. */
  tiny: boolean;
  wide: boolean;
  /** Botones de la barra con texto (si no, solo ícono). */
  labels: boolean;
  hasNodes: boolean;
  trafficOn: boolean;
  filtering: boolean;
  shownCount: number;
  viewCount: number;
  attentionCount: number;
  suggestionsCount: number;
  exportItems: MenuItem[];
  onSearch: () => void;
  onToggleTraffic: () => void;
  openSection: (sec: PanelSection) => void;
  onShowAttention: () => void;
  onShowSuggestions: () => void;
  onReorder: () => void;
  onClear: () => void;
}

/** Menú "Más": lo secundario (exportar, snapshots, fuentes) y, en anchos chicos, lo que no cabe en la barra. */
export function moreMenuItems(c: MoreMenuCtx): MenuItem[] {
  const items: MenuItem[] = [];
  if (c.tiny) {
    items.push(["Buscar en el diagrama…", <Search size={13} />, c.onSearch, !c.hasNodes]);
    items.push([c.trafficOn ? "Dejar de leer el tráfico" : "Mostrar el tráfico", <Activity size={13} />, c.onToggleTraffic]);
    if (c.filtering) items.push([`Filtros activos: ${c.shownCount} de ${c.viewCount}`, <ListFilter size={13} />, () => c.openSection("filtros")]);
    if (c.attentionCount) items.push([`Requieren atención (${c.attentionCount})`, <TriangleAlert size={13} />, c.onShowAttention]);
  }
  if (!c.wide) {
    if (c.suggestionsCount && !c.labels) items.push([`Sugerencias (${c.suggestionsCount})`, <Lightbulb size={13} />, c.onShowSuggestions]);
    c.exportItems.forEach(([l, i, a, d], n) => items.push([`Exportar: ${l}`, i, a, d || (n < 3 && !c.hasNodes), undefined, n === 0]));
  }
  items.push(["Snapshots y cambios…", <Camera size={13} />, () => c.openSection("snapshots"), false, undefined, true]);
  items.push(["Fuentes de descubrimiento…", <Radar size={13} />, () => c.openSection("fuentes")]);
  items.push(["Reordenar automáticamente", <Network size={13} />, c.onReorder, !c.hasNodes]);
  items.push(["Eliminar diagrama…", <Trash2 size={13} />, c.onClear, !c.hasNodes, undefined, true]);
  return items;
}
