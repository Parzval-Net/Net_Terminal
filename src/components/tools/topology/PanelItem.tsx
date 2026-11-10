import { Camera, Copy, GitCompare, ListFilter, Pencil, Plus, Route, Trash2, TriangleAlert, X } from "lucide-react";
import type { ComponentProps, Dispatch, RefObject, SetStateAction } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { isMac } from "../../../lib/platform";
import { modelFromPlatform } from "../../../lib/lifecycle";
import { LinkIssue, TopoFilter, worstSev } from "../../../lib/topoInsights";
import {
  LIMITS,
  TopoNode,
  TopoResult,
  TopoSnapshot,
  Topology,
  deleteManualLink,
  deleteManualNode,
  diffTopology,
  isPhysicalProto,
  isUserProto,
  knownAddrs,
  linkKey,
  macPortLinked,
  macVendors,
  protoLabel,
  shortestPath,
} from "../../../lib/topology";
import { LifecycleChip } from "../../StatusBar";
import { Btn, Collapsible, Label } from "../ui";
import { ConnectPanel } from "../TopoConnect";
import { portLine } from "./topoText";
import type { ConfirmReq, ManualForm } from "./topoTypes";
import type { PanelSection } from "./topoUi";

type Diff = NonNullable<ReturnType<typeof diffTopology>>;

/** Detalle del equipo elegido: puertos, enlaces, MAC por puerto, ruta, vecindario y "Abrir terminal". */
export function DetailSection({
  sel,
  topo,
  node,
  checks,
  path,
  setPath,
  setSelected,
  setFilter,
  setOpen,
  apply,
  setForm,
  setFormErr,
  copyText,
  lifecycle,
  connect,
  open,
  onToggle,
}: {
  sel: TopoNode | undefined;
  topo: Topology;
  node: (id: string) => TopoNode | undefined;
  checks: Map<string, LinkIssue[]>;
  path: { from?: string; to?: string };
  setPath: (p: { from?: string; to?: string }) => void;
  setSelected: (id: string | null) => void;
  setFilter: Dispatch<SetStateAction<TopoFilter>>;
  setOpen: (s: PanelSection, open: boolean) => void;
  apply: (r: TopoResult, ok: string, onDone?: () => void) => boolean;
  setForm: (f: ManualForm | null) => void;
  setFormErr: (e: string) => void;
  copyText: (text: string, what: string) => Promise<void>;
  /** Ciclo de vida activado en Ajustes: muestra EoL y versión. */
  lifecycle: boolean;
  /** Lo que "Abrir terminal" necesita (todo salvo el equipo): plan, saltos, credenciales. */
  connect: Omit<ComponentProps<typeof ConnectPanel>, "n">;
  open: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <Collapsible
      title={sel ? sel.name : "Detalle"}
    summary={sel ? (sel.manual ? "Agregado a mano" : sel.addrOnly ? "Visto por ruteo, aún sin nombre" : sel.explored ? "Vecinos ya leídos" : "Aún no explorado") : "Selecciona un equipo"}
    right={
      sel?.manual && (
        <div className="flex gap-1">
          <Btn
            kind="ghost"
            className="!px-1.5"
            title="Editar equipo"
            onClick={() => (setFormErr(""), setForm({ kind: "node", editId: sel.id, name: sel.name, ip: sel.ip ?? "", platform: sel.platform ?? "" }))}
          >
            <Pencil size={13} />
          </Btn>
          <Btn
            kind="ghost"
            className="!px-1.5 hover:!text-danger"
            title="Eliminar equipo y sus enlaces"
            onClick={() => apply(deleteManualNode(topo, sel.id), `Equipo "${sel.name}" eliminado`, () => setSelected(null))}
          >
            <Trash2 size={13} />
          </Btn>
        </div>
      )
    }
      open={open}
      onToggle={onToggle}
    >
    {sel && (
      <div className="space-y-2 text-[12px]">
        {sel.ip && (
          <p>
            <span className="text-muted">{sel.addrOnly ? "Dirección:" : "Gestión:"}</span> <span className="font-mono">{sel.ip}</span>
          </p>
        )}
        {sel.addrOnly && knownAddrs(sel).length > 1 && (
          <p className="text-muted">
            Conocido por: <span className="font-mono">{knownAddrs(sel).slice(0, 6).join(", ")}</span>
          </p>
        )}
        {sel.platform && (
          <p className="text-muted leading-snug" title={sel.platform}>
            {sel.platform.length > 120 ? `${sel.platform.slice(0, 119)}…` : sel.platform}
          </p>
        )}
        {lifecycle && modelFromPlatform(sel.platform) && (
          <p className="text-[11.5px]">
            <LifecycleChip model={modelFromPlatform(sel.platform)!} name={sel.name} />
          </p>
        )}
        <div className="space-y-1 max-h-56 overflow-y-auto">
          {topo.links
            .filter((l) => l.a === sel.id || l.b === sel.id)
            .map((l, i) => {
              const mine = l.a === sel.id;
              const other = node(mine ? l.b : l.a);
              const myPort = mine ? l.aPort : l.bPort;
              const info = portLine(sel, myPort);
              const editable = isUserProto(l.proto);
              const linkIssues = checks.get(linkKey(l));
              return (
                <div key={i} className="flex items-start rounded-md hover:bg-hover">
                  <button onClick={() => setSelected(other?.id ?? null)} className="flex-1 min-w-0 text-left px-2 py-1">
                    <span className="font-mono text-[11.5px]">
                      {myPort || "?"} → {other?.name} {(mine ? l.bPort : l.aPort) || ""}
                    </span>
                    {!isPhysicalProto(l.proto) && <span className="ml-1.5 text-[11px] text-muted">{protoLabel(l)}</span>}
                    {linkIssues && (
                      <TriangleAlert
                        size={12}
                        className={`inline ml-1.5 -mt-0.5 ${worstSev(linkIssues) === "crit" ? "text-danger" : "text-warn"}`}
                        aria-label={linkIssues.map((i) => i.text).join(". ")}
                      >
                        <title>{linkIssues.map((i) => i.text).join("\n")}</title>
                      </TriangleAlert>
                    )}
                    {info && <span className="block text-[11px] text-muted truncate">{info}</span>}
                  </button>
                  {editable && (
                    <>
                      <Btn
                        kind="ghost"
                        className="!h-6 !px-1"
                        title="Editar enlace"
                        onClick={() => (setFormErr(""), setForm({ kind: "link", edit: l, a: l.a, aPort: l.aPort, b: l.b, bPort: l.bPort }))}
                      >
                        <Pencil size={12} />
                      </Btn>
                      <Btn kind="ghost" className="!h-6 !px-1 hover:!text-danger" title="Eliminar enlace" onClick={() => apply(deleteManualLink(topo, l), "Enlace eliminado")}>
                        <X size={12} />
                      </Btn>
                    </>
                  )}
                </div>
              );
            })}
        </div>
        {sel.macs && Object.keys(sel.macs).length > 0 && (
          <details className="rounded-md border border-line px-2 py-1">
            <summary className="cursor-pointer text-[11.5px] text-muted">MAC por puerto ({Object.keys(sel.macs).length})</summary>
            <ul className="mt-1 space-y-1 max-h-48 overflow-y-auto">
              {Object.entries(sel.macs)
                .sort(([, x], [, y]) => x.port.localeCompare(y.port, undefined, { numeric: true }))
                .map(([k, mp]) => {
                  const ips = mp.macs.map((e) => e.ip).filter(Boolean);
                  return (
                    <li key={k} className="text-[11px] leading-snug">
                      <span className="font-mono">{mp.port}</span>
                      <span className="text-muted">
                        {" "}
                        · {mp.total} MAC · {macVendors(mp).join(", ")}
                        {ips.length > 0 && ` · ${ips.slice(0, 2).join(", ")}${ips.length > 2 ? "…" : ""}`}
                        {macPortLinked(topo, sel, k) && " · con enlace"}
                      </span>
                    </li>
                  );
                })}
            </ul>
          </details>
        )}
        <div className="grid grid-cols-2 gap-1.5">
          <Btn className="!text-[11.5px]" onClick={() => setPath({ from: sel.id, to: path.to !== sel.id ? path.to : undefined })}>
            <Route size={13} /> Desde aquí
          </Btn>
          <Btn className="!text-[11.5px]" disabled={!path.from || path.from === sel.id} onClick={() => setPath({ ...path, to: sel.id })}>
            Hasta aquí
          </Btn>
        </div>
        <Btn
          className="w-full !text-[11.5px]"
          title="Muestra solo los equipos a 2 saltos de este (se ajusta en Filtros)"
          onClick={() => {
            setFilter((f) => ({ ...f, hops: f.hops || 2, focus: sel.id }));
            setOpen("filtros", true);
          }}
        >
          <ListFilter size={13} /> Ver su vecindario
        </Btn>
        <ConnectPanel n={sel} {...connect} />
        {sel.ip && (
          <Btn className="w-full" title={`Copia ${sel.ip} (también ${isMac ? "⌘" : "Ctrl"}+C con el equipo seleccionado en el mapa, o clic derecho sobre él)`} onClick={() => copyText(sel.ip!, "IP")}>
            <Copy size={13} /> Copiar IP
          </Btn>
        )}
      </div>
    )}
    </Collapsible>
  );
}

/** Ruta más corta entre dos equipos del diagrama. */
export function RouteSection({
  path,
  setPath,
  route,
  pathText,
  node,
  setMsg,
  open,
  onToggle,
}: {
  path: { from?: string; to?: string };
  setPath: (p: { from?: string; to?: string }) => void;
  route: ReturnType<typeof shortestPath>;
  pathText: string;
  node: (id: string) => TopoNode | undefined;
  setMsg: (m: string) => void;
  open: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <Collapsible
      title="Ruta"
      summary={`${path.from ? (node(path.from)?.name ?? path.from) : "?"} → ${path.to ? (node(path.to)?.name ?? path.to) : "elige destino"}`}
    right={
      <div className="flex gap-1">
        {route && (
          <Btn kind="ghost" className="!px-1.5" title="Copiar ruta" onClick={() => writeText(pathText).then(() => setMsg("Ruta copiada"))}>
            <Copy size={13} />
          </Btn>
        )}
        <Btn kind="ghost" className="!px-1.5" title="Quitar ruta" onClick={() => setPath({})}>
          <X size={13} />
        </Btn>
      </div>
    }
      open={open}
      onToggle={onToggle}
    >
    {path.from && path.to ? (
      route ? (
        <pre className="text-[11.5px] font-mono whitespace-pre-wrap leading-relaxed">
          {pathText}
          {"\n"}
          <span className="text-muted">{route.links.length} saltos</span>
        </pre>
      ) : (
        <p className="text-[12px] text-danger">No hay camino conocido entre ambos equipos.</p>
      )
    ) : (
      <p className="text-[12px] text-muted">Selecciona otro equipo y pulsa "Hasta aquí".</p>
    )}
    </Collapsible>
  );
}

/** Equipos y enlaces agregados a mano (formulario de alta y edición). */
export function ManualSection({
  form,
  setForm,
  formErr,
  setFormErr,
  submitForm,
  nodesByName,
  nodeCount,
  selected,
  wrapperRef,
  open,
  onToggle,
}: {
  form: ManualForm | null;
  setForm: (f: ManualForm | null) => void;
  formErr: string;
  setFormErr: (e: string) => void;
  submitForm: () => void;
  nodesByName: TopoNode[];
  nodeCount: number;
  selected: string | null;
  wrapperRef: RefObject<HTMLDivElement | null>;
  open: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <div ref={wrapperRef} className="scroll-mt-2">
      <Collapsible
        title="Manual"
        summary={form ? (form.kind === "node" ? "Equipo" : "Enlace") : "Equipos y enlaces agregados a mano"}
        open={open}
        onToggle={onToggle}
    right={
      !form && (
        <div className="flex gap-1">
          <Btn kind="ghost" className="!px-1.5 !text-[11.5px]" title="Agregar equipo" onClick={() => (setFormErr(""), setForm({ kind: "node", name: "", ip: "", platform: "" }))}>
            <Plus size={13} /> Equipo
          </Btn>
          <Btn
            kind="ghost"
            className="!px-1.5 !text-[11.5px]"
            title="Agregar enlace"
            disabled={nodeCount < 2}
            onClick={() => (setFormErr(""), setForm({ kind: "link", a: selected ?? "", aPort: "", b: "", bPort: "" }))}
          >
            <Plus size={13} /> Enlace
          </Btn>
        </div>
      )
    }
      >
    {form?.kind === "node" && (
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          submitForm();
        }}
      >
        <Label text="Nombre">
          <input autoFocus className="field" maxLength={LIMITS.name} value={form.name} placeholder="ej: sw-bodega-01" onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Label>
        <Label text="IP de gestión (opcional)">
          <input className="field font-mono" maxLength={45} value={form.ip} placeholder="192.0.2.10" onChange={(e) => setForm({ ...form, ip: e.target.value })} />
        </Label>
        <Label text="Plataforma (opcional)">
          <input className="field" maxLength={LIMITS.platform} value={form.platform} placeholder="ej: C9200L-24P" onChange={(e) => setForm({ ...form, platform: e.target.value })} />
        </Label>
        {formErr && <p className="text-[11.5px] text-danger">{formErr}</p>}
        <div className="flex gap-1.5">
          <Btn kind="primary" type="submit" className="flex-1">
            {form.editId ? "Guardar" : "Agregar equipo"}
          </Btn>
          <Btn type="button" onClick={() => setForm(null)}>
            Cancelar
          </Btn>
        </div>
      </form>
    )}
    {form?.kind === "link" && (
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          submitForm();
        }}
      >
        {(["a", "b"] as const).map((side) => (
          <div key={side} className="grid grid-cols-[1fr_92px] gap-1.5">
            <Label text={`Equipo ${side.toUpperCase()}`}>
              <select className="field" value={form[side]} onChange={(e) => setForm({ ...form, [side]: e.target.value })}>
                <option value="">Elegir…</option>
                {nodesByName.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </select>
            </Label>
            <Label text="Interfaz">
              <input
                className="field font-mono"
                maxLength={LIMITS.port}
                value={side === "a" ? form.aPort : form.bPort}
                placeholder="Gi1/0/1"
                onChange={(e) => setForm({ ...form, [side === "a" ? "aPort" : "bPort"]: e.target.value })}
              />
            </Label>
          </div>
        ))}
        {formErr && <p className="text-[11.5px] text-danger">{formErr}</p>}
        <div className="flex gap-1.5">
          <Btn kind="primary" type="submit" className="flex-1">
            {form.edit ? "Guardar" : "Agregar enlace"}
          </Btn>
          <Btn type="button" onClick={() => setForm(null)}>
            Cancelar
          </Btn>
        </div>
      </form>
    )}
    {!form && <p className="text-[12px] text-muted">Se guardan con el diagrama, entran en snapshots, rutas y exportaciones.</p>}
      </Collapsible>
    </div>
  );
}

/** Snapshots del diagrama: guardar, comparar, abrir y ver los cambios. */
export function SnapshotsSection({
  topo,
  onTopo,
  snapshots,
  onSnapshots,
  onConfirm,
  snapName,
  setSnapName,
  saveSnapshot,
  compareId,
  setCompareId,
  snapshot,
  diff,
  diffCount,
  node,
  anyName,
  setMsg,
  open,
  onToggle,
}: {
  topo: Topology;
  onTopo: (t: Topology | ((t: Topology) => Topology)) => void;
  snapshots: TopoSnapshot[];
  onSnapshots: (s: TopoSnapshot[]) => void;
  onConfirm: (req: ConfirmReq) => void;
  snapName: string | null;
  setSnapName: (n: string | null) => void;
  saveSnapshot: () => void;
  compareId: string;
  setCompareId: (id: string) => void;
  snapshot: TopoSnapshot | undefined;
  diff: Diff | null;
  diffCount: number;
  node: (id: string) => TopoNode | undefined;
  anyName: (id: string) => string;
  setMsg: (m: string) => void;
  open: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <Collapsible
      title="Snapshots y cambios"
      badge={diffCount || undefined}
      summary={snapshot ? `Comparando con "${snapshot.name}"` : snapshots.length ? `${snapshots.length} guardados` : "Guarda una copia para comparar después"}
      open={open}
      onToggle={onToggle}
    >
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center gap-1">
  {snapName === null ? (
    <Btn kind="ghost" title="Guardar una copia para comparar más adelante" disabled={!topo.nodes.length} onClick={() => setSnapName("")}>
      <Camera size={14} /> Snapshot
    </Btn>
  ) : (
    <form
      className="flex items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        saveSnapshot();
      }}
    >
      <input
        autoFocus
        className="field !h-7 w-48 !text-[12px]"
        placeholder="Nombre (ej: antes del cambio)"
        value={snapName}
        onChange={(e) => setSnapName(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setSnapName(null)}
      />
      <Btn kind="primary" type="submit" className="!h-7">
        Guardar
      </Btn>
    </form>
  )}
        </div>
        <div className="flex items-center gap-1">
  <label className="flex flex-1 min-w-0 items-center gap-1 text-[12px]" title="Compara el diagrama actual con un snapshot">
    <GitCompare size={14} className="text-muted" />
    <select className="field !h-7 !w-full flex-1 min-w-0 !text-[12px]" value={compareId} onChange={(e) => setCompareId(e.target.value)} disabled={!snapshots.length}>
      <option value="">{snapshots.length ? "Comparar con…" : "Sin snapshots"}</option>
      {snapshots.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  </label>
  {snapshot && (
    <>
      <Btn
        kind="ghost"
        title="Reemplazar el diagrama actual por este snapshot"
        onClick={() => {
          const open = () => {
            onTopo(snapshot.topo);
            setCompareId("");
            setMsg(`Snapshot "${snapshot.name}" abierto`);
          };
          if (!topo.nodes.length) return open();
          onConfirm({
            title: `¿Reemplazar el diagrama por "${snapshot.name}"?`,
            message: "El diagrama actual (equipos, enlaces manuales y posiciones) se pierde. Guarda un snapshot antes si lo necesitas.",
            label: "Reemplazar",
            danger: true,
            defaultCancel: true,
            action: open,
          });
        }}
      >
        Abrir
      </Btn>
      <Btn
        kind="ghost"
        className="hover:!text-danger"
        title="Eliminar snapshot"
        onClick={() =>
          onConfirm({
            title: `¿Eliminar el snapshot "${snapshot.name}"?`,
            message: "No se puede deshacer. El diagrama actual no cambia.",
            label: "Eliminar",
            danger: true,
            defaultCancel: true,
            action: () => {
              onSnapshots(snapshots.filter((s) => s.id !== snapshot.id));
              setCompareId("");
            },
          })
        }
      >
        <X size={14} />
      </Btn>
    </>
  )}
        </div>
        {diff && snapshot && (
          <div>
            <p className="mb-1 text-[11.5px] font-medium text-muted">Cambios respecto de "{snapshot.name}"</p>
      {!diff.addedLinks.length && !diff.removedLinks.length && !diff.addedNodes.length && !diff.removedNodes.length ? (
        <p className="text-[12px] text-muted">Sin diferencias.</p>
      ) : (
        <ul className="space-y-1 text-[11.5px] font-mono">
          {diff.removedNodes.map((n) => (
            <li key={`rn${n.id}`} className="text-danger">
              − {n.name}
            </li>
          ))}
          {diff.addedNodes.map((id) => (
            <li key={`an${id}`} className="text-ok">
              + {node(id)?.name ?? id}
            </li>
          ))}
          {diff.removedLinks.map((l, i) => (
            <li key={`rl${i}`} className="text-danger">
              − {anyName(l.a)} {l.aPort} ↔ {l.bPort} {anyName(l.b)}
            </li>
          ))}
          {diff.addedLinks.map((l, i) => (
            <li key={`al${i}`} className="text-ok">
              + {anyName(l.a)} {l.aPort} ↔ {l.bPort} {anyName(l.b)}
            </li>
          ))}
        </ul>
      )}
          </div>
        )}
      </div>
    </Collapsible>
  );
}
