import { useMemo, useState } from "react";
import { TopoSnapshot, Topology, diffTopology, linkKey } from "../../../lib/topology";
import { MAX_SNAPSHOTS } from "./topoConst";
import type { ConfirmReq } from "./topoTypes";

/**
 * Snapshots del diagrama: guardar una copia (con tope), compararla con el diagrama actual (equipos y
 * enlaces que cambiaron, los que ya no están se dibujan fantasma) y contar los cambios.
 */
export function useTopoSnapshots({
  topo,
  snapshots,
  onSnapshots,
  onConfirm,
  setMsg,
}: {
  topo: Topology;
  snapshots: TopoSnapshot[];
  onSnapshots: (s: TopoSnapshot[]) => void;
  onConfirm: (req: ConfirmReq) => void;
  setMsg: (m: string) => void;
}) {
  const [compareId, setCompareId] = useState("");
  const [snapName, setSnapName] = useState<string | null>(null);
  // Comparación con un snapshot: los enlaces y equipos que ya no están se dibujan fantasma.
  const snapshot = snapshots.find((s) => s.id === compareId);
  const diff = useMemo(() => (snapshot ? diffTopology(snapshot.topo, topo) : null), [snapshot, topo]);
  const added = useMemo(() => new Set(diff?.addedLinks.map(linkKey)), [diff]);
  const removed = useMemo(() => new Set(diff?.removedLinks.map(linkKey)), [diff]);
  const ghostIds = useMemo(() => new Set(diff?.removedNodes.map((n) => n.id)), [diff]);
  const newIds = useMemo(() => new Set(diff?.addedNodes), [diff]);

  const saveSnapshot = () => {
    const name = snapName?.trim() || `Topología ${new Date().toLocaleString()}`;
    const snap: TopoSnapshot = { id: `s${Date.now()}`, name, ts: Date.now(), topo };
    const save = () => {
      onSnapshots([snap, ...snapshots].slice(0, MAX_SNAPSHOTS));
      setSnapName(null);
      setMsg(`Snapshot guardado: ${name}`);
    };
    // Sobre el tope se descarta el más antiguo: se avisa cuál antes de guardar.
    const dropped = snapshots.slice(MAX_SNAPSHOTS - 1);
    if (dropped.length)
      onConfirm({
        title: "¿Guardar y eliminar el snapshot más antiguo?",
        message: `Se guardan hasta ${MAX_SNAPSHOTS} snapshots. Al guardar "${name}" se elimina ${dropped.length === 1 ? "el más antiguo" : `los ${dropped.length} más antiguos`}: ${dropped.map((d) => `"${d.name}"`).join(", ")}.`,
        label: "Guardar",
        danger: true,
        defaultCancel: true,
        action: save,
      });
    else save();
  };
  const diffCount = diff ? diff.addedLinks.length + diff.removedLinks.length + diff.addedNodes.length + diff.removedNodes.length : 0;
  return { compareId, setCompareId, snapName, setSnapName, snapshot, diff, added, removed, ghostIds, newIds, diffCount, saveSnapshot };
}
