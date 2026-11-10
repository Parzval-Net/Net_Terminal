import { memo, useMemo, useState } from "react";
import { LinkTraffic, Pt, TopoNode, TopoSnapshot, isRoutingProto, linkDash, portOf, protoLabel, quad, utilLevel } from "../../../lib/topology";
import { LinkLevel } from "../../../lib/topoTraffic";
import { LinkIssue, linkLevelOf, markEnds } from "../../../lib/topoInsights";
import { plural } from "../../../lib/plural";
import { TipStore } from "./LinkTip";
import { arrowHead, flowStyle, lanePath } from "./linkPaths";
import { UTIL_VAR, pillStyle, pillTextStyle, scaledText, smallText } from "./topoStyle";
import { nodeSub } from "./topoText";
import { H, L2H, L2W, W } from "./topoConst";
import type { Geo, L2Geo, Mark, Pill } from "./topoTypes";

/**
 * Un sentido del tráfico: puntos que viajan junto al enlace (un trazo de largo cero con punta
 * redonda es un círculo), con un borde del color del fondo para que se lean sobre cualquier línea.
 */
function FlowLane({ d, color, style, reverse }: { d: string; color: string; style: React.CSSProperties; reverse?: boolean }) {
  const cls = `topo-flow${reverse ? " topo-flow-rev" : ""}`;
  return (
    <>
      <path className={cls} style={style} d={d} fill="none" stroke="var(--panel)" strokeWidth={6} strokeLinecap="round" />
      <path className={cls} style={style} d={d} fill="none" stroke={color} strokeWidth={4} strokeLinecap="round" />
    </>
  );
}

/**
 * Un enlace del diagrama. Memorizado: al arrastrar un equipo solo se redibujan sus enlaces (los
 * demás conservan la misma geometría y props). El detalle (interfaces, tráfico, hallazgos) sale en la
 * ficha propia (LinkTip) y no en un <title>: el tooltip nativo del SVG depende del webview, tarda
 * y desaparece con cada redibujo del mapa.
 */
const LinkView = memo(function LinkView({
  g,
  aName,
  bName,
  ga,
  gb,
  state,
  isRoute,
  hot,
  dim,
  lt,
  level,
  nIssues,
  detail,
  color: byUtil,
  arrows,
  animate,
  noGroup,
  tips,
}: {
  g: Geo;
  aName: string;
  bName: string;
  /** Extremos a la vista (con fantasma): el grupo (Port-channel) del enlace. */
  ga: TopoNode | undefined;
  gb: TopoNode | undefined;
  state: "removed" | "added" | null;
  isRoute: boolean;
  hot: boolean;
  dim: boolean;
  lt: LinkTraffic | undefined;
  /** Estado del enlace: normal, alto, saturado o caído. */
  level: LinkLevel;
  nIssues: number;
  /** Vista detallada: colores continuos por utilización, flechas y animación. */
  detail: boolean;
  color: boolean;
  arrows: boolean;
  animate: boolean;
  /** El par lleva píldora de tráfico: su rótulo de agregado ("Po1 ×2") ya va dentro de ella. */
  noGroup: boolean;
  tips: TipStore;
}) {
  // Textos por enlace aquí y no en el padre: con cientos de enlaces, cada redibujo del mapa solo
  // los rehace para los que cambiaron (al arrastrar un equipo, los suyos).
  const grp = noGroup ? undefined : (portOf(ga, g.l.aPort)?.group ?? portOf(gb, g.l.bPort)?.group);
  const [lit, setLit] = useState(false);
  const detailLevel = detail && lt && byUtil ? utilLevel(lt.util) : undefined;
  const down = level === "down" && !state;
  const color = state === "removed" ? "var(--danger)" : state === "added" ? "var(--ok)" : down ? "var(--text)" : detail ? (detailLevel ? UTIL_VAR[detailLevel] : hot ? "var(--accent)" : "var(--muted)") : level === "saturated" ? "var(--danger)" : level === "high" ? "var(--warn)" : hot ? "var(--accent)" : "var(--muted)";
  const base = g.l.logical ? 1.25 : 1.5;
  const width = down ? 2 : detail ? (lt && byUtil ? 1.75 + 3 * Math.min(1, lt.util ?? 0) : hot || state ? 2.5 : base) : level === "saturated" ? 5 : level === "high" ? 4 : hot || state ? 2.5 : base;
  const strokeWidth = isRoute ? Math.max(3.5, width) : width;
  const showGroup = grp && g.pair.length > 1 && g.pair.indexOf(g.l) === 0;
  const dash = state === "removed" ? "6 5" : down ? "5 5" : linkDash(g.l);
  // Sin color de utilización, las flechas van en el tono neutro del texto.
  const dirColor = (bps: number | null) => (byUtil ? UTIL_VAR[lt?.speed && bps !== null ? utilLevel(bps / lt.speed) : "none"] : "var(--muted)");
  const label = `${aName} ${g.l.aPort || "?"} a ${bName} ${g.l.bPort || "?"}, ${protoLabel(g.l)}${down ? ", caído" : level === "high" ? ", uso alto" : level === "saturated" ? ", saturado" : ""}${nIssues ? `, ${nIssues} ${nIssues === 1 ? "hallazgo" : "hallazgos"}` : ""}`;
  const key = g.k;
  return (
    <g
      opacity={dim ? 0.25 : 1}
      tabIndex={0}
      role="group"
      aria-label={label}
      style={{ outline: "none" }}
      onPointerEnter={() => setLit(true)}
      onPointerMove={(e) => tips.show([key], e.clientX, e.clientY)}
      onPointerLeave={() => {
        setLit(false);
        tips.hide();
      }}
      onFocus={(e) => {
        // Solo con el teclado: un clic también enfoca el elemento y no debe abrir la ficha.
        let kb = false;
        try {
          kb = e.currentTarget.matches(":focus-visible");
        } catch {
          kb = true;
        }
        if (!kb) return;
        setLit(true);
        const r = e.currentTarget.getBoundingClientRect();
        tips.show([key], r.left + r.width / 2, r.top + r.height / 2, true);
      }}
      onBlur={() => {
        setLit(false);
        tips.hide();
      }}
      onKeyDown={(e) => e.key === "Escape" && tips.hide()}
    >
      {lit && <path d={g.d} fill="none" stroke={down || detailLevel || level !== "normal" ? color : "var(--accent)"} strokeOpacity={0.25} strokeWidth={strokeWidth + 8} strokeLinecap="round" />}
      <path
        d={g.d}
        fill="none"
        stroke={color}
        strokeOpacity={down ? 0.65 : undefined}
        strokeWidth={strokeWidth}
        strokeDasharray={dash}
        strokeLinecap={dash ? "round" : undefined}
      />
      {detail && lt && (
        <>
          {/* Un carril por sentido (A→B y B→A): puntos en movimiento con animación, flechas fijas sin ella. */}
          {animate && !!lt.ab && <FlowLane d={lanePath(g.a, g.c, g.b, 5)} color={dirColor(lt.ab)} style={flowStyle(lt.ab, lt.speed)} />}
          {animate && !!lt.ba && <FlowLane d={lanePath(g.a, g.c, g.b, -5)} color={dirColor(lt.ba)} style={flowStyle(lt.ba, lt.speed)} reverse />}
          {arrows && !animate && (
            <>
              <polygon points={arrowHead(g.a, g.c, g.b, 0.4, true, 5)} fill={dirColor(lt.ab)} stroke="var(--panel)" strokeWidth={0.75} />
              <polygon points={arrowHead(g.a, g.c, g.b, 0.6, false, -5)} fill={dirColor(lt.ba)} stroke="var(--panel)" strokeWidth={0.75} />
            </>
          )}
        </>
      )}
      {/* Área de hover y clic más ancha que la línea: 14 px de pantalla a cualquier zoom. */}
      <path d={g.d} fill="none" stroke="transparent" strokeWidth={14} vectorEffect="non-scaling-stroke" />
      {(
        [
          [g.pa, g.l.aPort],
          [g.pb, g.l.bPort],
        ] as [Pt, string][]
      )
        .filter(([, label]) => label)
        .map(([pt, label], j) => (
          <text key={j} x={pt.x} y={pt.y} style={smallText(11)} textAnchor="middle" fill="var(--text)" stroke="var(--panel)" strokeWidth={4} paintOrder="stroke">
            {label}
          </text>
        ))}
      {showGroup ? (
        <text x={g.mid.x} y={g.mid.y + 4} style={smallText(11)} fontWeight={600} textAnchor="middle" fill="var(--accent)" stroke="var(--panel)" strokeWidth={4} paintOrder="stroke">
          {grp} ×{g.pair.length}
        </text>
      ) : (
        (isRoutingProto(g.l.proto) || g.l.proto === "MAC/OUI") && (
          <text x={g.mid.x} y={g.mid.y + 4} style={smallText(11)} fontWeight={600} textAnchor="middle" fill="var(--muted)" stroke="var(--panel)" strokeWidth={4} paintOrder="stroke">
            {protoLabel(g.l)}
          </text>
        )
      )}
    </g>
  );
});

/** Nodo virtual "L2 desconocido": puertos activos sin vecino de un equipo explorado. */
const L2View = memo(function L2View({ v, faded, onPick }: { v: L2Geo; faded: boolean; onPick: (id: string) => void }) {
  const { ports, macs, vendors } = v.info;
  return (
    <g style={{ cursor: "pointer" }} opacity={faded ? 0.35 : 1} onClick={() => onPick(v.id)}>
      <title>
        {[
          `${v.from.name}: ${plural(ports.length, "puerto activo", "puertos activos")} sin vecino CDP/LLDP`,
          `${ports.slice(0, 24).join(", ")}${ports.length > 24 ? "…" : ""}`,
          macs ? `${macs} MAC${vendors.length ? `: ${vendors.join(", ")}` : ""}` : "",
          "Hay algo conectado que no anuncia CDP/LLDP (PC, AP, cámara, switch no administrable). Con la fuente MAC/OUI se ve qué es.",
        ]
          .filter(Boolean)
          .join("\n")}
      </title>
      <line x1={v.from.x} y1={v.from.y} x2={v.x} y2={v.y} stroke="var(--muted)" strokeWidth={1.25} strokeDasharray="2 4" />
      <rect x={v.x - L2W / 2} y={v.y - L2H / 2} width={L2W} height={L2H} rx={8} fill="var(--panel)" stroke="var(--field-border)" strokeDasharray="3 3" />
      <text x={v.x} y={v.y - 2} style={scaledText(11.5)} fontWeight={600} textAnchor="middle" fill="var(--text)">
        L2 desconocido
      </text>
      <text x={v.x} y={v.y + 12} style={smallText(11)} textAnchor="middle" fill="var(--muted)">
        {plural(ports.length, "puerto", "puertos")}
        {macs ? ` · ${macs} MAC` : ""}
      </text>
    </g>
  );
});

/** Un equipo del diagrama (memorizado: al arrastrar solo se redibuja el que se mueve). */
const NodeView = memo(function NodeView({
  n,
  ghost,
  isNew,
  onRoute,
  selected,
  faded,
  onDown,
  onMenu,
  onOpen,
}: {
  n: TopoNode;
  ghost: boolean;
  isNew: boolean;
  onRoute: boolean;
  selected: boolean;
  faded: boolean;
  onDown: (e: React.PointerEvent<SVGGElement>, n: TopoNode) => void;
  onMenu: (e: React.MouseEvent<SVGGElement>, n: TopoNode) => void;
  onOpen: (n: TopoNode) => void;
}) {
  const tentative = n.manual || n.addrOnly;
  const sub = nodeSub(n, ghost);
  return (
    <g style={{ cursor: ghost ? "default" : "grab" }} opacity={faded ? 0.35 : 1} onPointerDown={(e) => !ghost && e.button === 0 && onDown(e, n)}
      onDoubleClick={() => !ghost && onOpen(n)}
      onContextMenu={(e) => {
        e.preventDefault();
        if (!ghost) onMenu(e, n);
      }}
    >
      {/* Fondo opaco: el relleno de los explorados es translúcido y dejaba ver los enlaces. */}
      {/* Ficha al pasar el mouse: con poco zoom la IP y la plataforma se ocultan del dibujo. */}
      <title>{[n.name, sub].filter(Boolean).join("\n")}</title>
      <rect x={n.x - W / 2} y={n.y - H / 2} width={W} height={H} rx={10} fill="var(--panel)" />
      <rect
        x={n.x - W / 2}
        y={n.y - H / 2}
        width={W}
        height={H}
        rx={10}
        fill={n.explored ? "var(--selected)" : "var(--chrome)"}
        stroke={ghost ? "var(--danger)" : isNew ? "var(--ok)" : selected || onRoute ? "var(--accent)" : n.explored ? "var(--accent)" : "var(--field-border)"}
        strokeDasharray={ghost ? "5 4" : tentative ? "4 3" : undefined}
        strokeWidth={selected || onRoute || ghost || isNew ? 2.5 : 1.5}
      />
      <text x={n.x} y={n.y - 4} style={scaledText(13)} fontWeight={600} textAnchor="middle" fill="var(--text)">
        {n.name.length > 22 ? `${n.name.slice(0, 21)}…` : n.name}
      </text>
      <text x={n.x} y={n.y + 14} style={smallText(11)} textAnchor="middle" fill="var(--muted)">
        {sub}
      </text>
    </g>
  );
});

/**
 * Capas del mapa (enlaces, nodos L2, equipos, píldoras y marcadores). Memorizadas: el zoom, el
 * arrastre del fondo, los mensajes y el panel cambian el estado de la herramienta sin tocar el
 * diagrama, y con cientos de equipos rehacer y comparar los elementos de cada enlace y equipo
 * costaba decenas de ms por redibujo.
 */
export const TopoLayers = memo(function TopoLayers({
  geometry,
  nodes,
  l2Nodes,
  pills,
  byId,
  shownById,
  snapshot,
  hasRoute,
  routeKeys,
  routeNodes,
  removed,
  added,
  ghostIds,
  newIds,
  selected,
  focusLink,
  linkRates,
  detail,
  color,
  arrows,
  animate,
  animKeys,
  pillPairs,
  checks,
  tips,
  onIssue,
  onNodeDown,
  onNodeMenu,
  onNodeOpen,
  onPick,
}: {
  geometry: Geo[];
  nodes: TopoNode[];
  l2Nodes: L2Geo[];
  /** Píldoras de los enlaces que lo merecen (alto, saturado, caído; en la vista detallada, todos con tráfico). */
  pills: Pill[];
  byId: Map<string, TopoNode>;
  shownById: Map<string, TopoNode>;
  snapshot: TopoSnapshot | undefined;
  hasRoute: boolean;
  routeKeys: Set<string>;
  routeNodes: Set<string>;
  removed: Set<string>;
  added: Set<string>;
  ghostIds: Set<string>;
  newIds: Set<string>;
  selected: string | null;
  focusLink: string | null;
  linkRates: Map<string, LinkTraffic>;
  detail: boolean;
  color: boolean;
  arrows: boolean;
  animate: boolean;
  animKeys: Set<string>;
  pillPairs: Set<string>;
  checks: Map<string, LinkIssue[]>;
  tips: TipStore;
  onIssue: (id: string) => void;
  onNodeDown: (e: React.PointerEvent<SVGGElement>, n: TopoNode) => void;
  onNodeMenu: (e: React.MouseEvent<SVGGElement>, n: TopoNode) => void;
  onNodeOpen: (n: TopoNode) => void;
  onPick: (id: string) => void;
}) {
  /** Nombre del equipo en el diagrama o en el snapshot (los ids son nombres normalizados en minúscula). */
  const anyName = (id: string) => byId.get(id)?.name ?? snapshot?.topo.nodes.find((n) => n.id === id)?.name ?? id;
  // Marcadores "!" en el extremo del puerto afectado, a un tercio del trazo desde su equipo.
  const marks = useMemo(() => {
    const out: Mark[] = [];
    for (const g of geometry) {
      const k = g.k;
      if (removed.has(k)) continue;
      const m = markEnds(checks.get(k));
      if (!m.a && !m.b) continue;
      const t = g.pair.length > 1 ? 0.4 : 0.33;
      const dim = hasRoute && !routeKeys.has(k);
      if (m.a) out.push({ key: `${k}|a|${g.l.proto}`, k, ...quad(g.a, g.c, g.b, t), node: g.l.a, dim });
      if (m.b) out.push({ key: `${k}|b|${g.l.proto}`, k, ...quad(g.a, g.c, g.b, 1 - t), node: g.l.b, dim });
    }
    return out;
  }, [geometry, checks, removed, hasRoute, routeKeys]);
  return (
    <>
      {geometry.map((g) => {
        const k = g.k;
        const isRoute = routeKeys.has(k);
        const state = removed.has(k) ? "removed" : added.has(k) ? "added" : null;
        const a = byId.get(g.l.a);
        const b = byId.get(g.l.b);
        const issues = state === "removed" ? undefined : checks.get(k);
        const lt = state ? undefined : linkRates.get(k);
        return (
          <LinkView
            key={`${k}|${g.l.proto}`}
            g={g}
            aName={a?.name ?? anyName(g.l.a)}
            bName={b?.name ?? anyName(g.l.b)}
            ga={shownById.get(g.l.a)}
            gb={shownById.get(g.l.b)}
            state={state}
            isRoute={isRoute}
            hot={isRoute || focusLink === k || selected === g.l.a || selected === g.l.b}
            dim={hasRoute && !isRoute}
            lt={lt}
            level={linkLevelOf(issues, lt)}
            nIssues={issues?.length ?? 0}
            detail={detail}
            color={color}
            arrows={arrows}
            animate={animate && animKeys.has(k)}
            noGroup={pillPairs.has(k)}
            tips={tips}
          />
        );
      })}
      {l2Nodes.map((v) => (
        <L2View key={`l2:${v.id}`} v={v} faded={hasRoute && !routeNodes.has(v.id)} onPick={onPick} />
      ))}
      {nodes.map((n) => {
        const ghost = ghostIds.has(n.id);
        const onRoute = routeNodes.has(n.id);
        return (
          <NodeView
            key={n.id}
            n={n}
            ghost={ghost}
            isNew={newIds.has(n.id)}
            onRoute={onRoute}
            selected={selected === n.id}
            faded={hasRoute && !onRoute && !ghost}
            onDown={onNodeDown}
            onMenu={onNodeMenu}
            onOpen={onNodeOpen}
          />
        );
      })}
      {/* Las píldoras van en una capa propia sobre los equipos: un enlace corto no las tapa. Reciben el puntero para mostrar la ficha. */}
      {pills.map((t) => {
        const w = t.text.length * 6.4 + 12;
        return (
          <g
            key={t.key}
            opacity={t.dim ? 0.25 : 1}
            onPointerMove={(e) => tips.show(t.keys, e.clientX, e.clientY)}
            onPointerLeave={tips.hide}
          >
            <rect x={t.x - w / 2} y={t.y - 9} width={w} height={18} rx={9} fill="var(--panel)" stroke={t.color} strokeWidth={1.25} style={t.tone ? pillStyle(t.tone) : undefined} />
            <text x={t.x} y={t.y + 3.8} fontSize={11} fontWeight={600} textAnchor="middle" fill={t.color} style={t.tone ? pillTextStyle(t.tone) : { fontVariantNumeric: "tabular-nums" }} pointerEvents="none">
              {t.text}
            </text>
          </g>
        );
      })}
      {/* Marcadores de problemas de interfaz: sobre equipos y píldoras, en el extremo del puerto. */}
      {marks.map((m) => (
        <g
          key={m.key}
          style={{ cursor: "pointer" }}
          opacity={m.dim ? 0.35 : 1}
          onClick={() => onIssue(m.node)}
          onPointerMove={(e) => tips.show([m.k], e.clientX, e.clientY)}
          onPointerLeave={tips.hide}
        >
          <circle cx={m.x} cy={m.y} r={8.5} fill="var(--warn)" stroke="var(--panel)" strokeWidth={2} />
          <text x={m.x} y={m.y + 4} fontSize={12} fontWeight={800} textAnchor="middle" fill="var(--panel)" pointerEvents="none">
            !
          </text>
        </g>
      ))}
    </>
  );
});
