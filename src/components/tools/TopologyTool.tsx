import { ComponentProps, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import {
  Copy,
  Download,
  FileCode2,
  ListFilter,
} from "lucide-react";
import {
  LINK_LEGEND,
  LinkSuggestion,
  LinkTraffic,
  Pt,
  SUGGESTERS,
  TOPO_SOURCES,
  DismissedMap,
  PendingFollow,
  TopoLink,
  TopoNode,
  TopoResult,
  TopoSnapshot,
  TopoSources,
  TopoVendor,
  Topology,
  acceptSuggestion,
  addDismissed,
  addManualLink,
  addManualNode,
  collectSuggestions,
  dismissedSet,
  followedTerminal,
  isIpv4,
  isIpv6,
  isUserProto,
  knownAddrs,
  layout,
  linkDash,
  linkGeometry,
  linkGroup,
  linkKey,
  nodeId,
  sourceOn,
  toCsv,
  toDrawio,
  toMermaid,
  toSvg,
  trafficShort,
  updateManualLink,
  updateManualNode,
  utilLevel,
} from "../../lib/topology";
import { ConnectPanel } from "./TopoConnect";
import { LEVEL_RANK, LinkLevel, linkTraffic } from "../../lib/topoTraffic";
import {
  LinkDetail,
  NO_FILTER,
  NodeRole,
  NodeState,
  NodeVendor,
  SearchHit,
  TopoFilter,
  TopoScope,
  filterActive,
  filterView,
  attentionRows,
  checkCoverage,
  linkChecks,
  linkDetail,
  linkLevelOf,
  nodeRole,
  nodeState,
  nodeVendor,
  searchTopo,
  unknownL2,
} from "../../lib/topoInsights";
import { SnmpProfile } from "../../lib/snmp";
import { useTopoTraffic } from "./useTopoTraffic";
import { vendorFor } from "../../lib/commands";
import type { Session } from "../../types";
import type { TabBrief, TerminalRef } from "./FileManager";
import { modelFromPlatform } from "../../lib/lifecycle";
import type { MenuItem } from "../tabMenu";
import { plural } from "../../lib/plural";
import { TopoLayers } from "./topology/TopoLayers";
import { TopoCanvas } from "./topology/TopoCanvas";
import { TopoToolbar } from "./topology/TopoToolbar";
import { HopDialogs } from "./topology/HopDialogs";
import { TopoPanel } from "./topology/TopoPanel";
import { FiltersSection, ScopeSection, SourcesSection } from "./topology/PanelConfig";
import { AttentionSection, SuggestionsSection, TrafficSection } from "./topology/PanelStatus";
import { DetailSection, ManualSection, RouteSection, SnapshotsSection } from "./topology/PanelItem";
import { useTopoSnapshots } from "./topology/useTopoSnapshots";
import { useTopoHops } from "./topology/useTopoHops";
import { useTopoDiscovery } from "./topology/useTopoDiscovery";
import { useTopoSelection } from "./topology/useTopoSelection";
import { useTopoSize, useTopoZoom } from "./topology/useTopoZoom";
import { TipStore } from "./topology/LinkTip";
import { MapSummary } from "./topology/MapSummary";
import { MapLegend } from "./topology/MapLegend";
import { ZoomControls } from "./topology/ZoomControls";
import { moreMenuItems } from "./topology/moreMenu";
import { useNodeData, useReducedMotion } from "./topology/topoHooks";
import { DISMISSED_KEY, PanelSection, TopoUi, loadDismissed, legacyTopo, loadUi, saveUi } from "./topology/topoUi";
import { FLOW_MAX, H, MAX_L2_NODES, PARALLEL_GAP, VENDORS, W } from "./topology/topoConst";
import { UTIL_VAR } from "./topology/topoStyle";
import type { ConfirmReq, Geo, L2Geo, ManualForm, Menu, Pill, TrafficRow } from "./topology/topoTypes";

export function TopologyTool({
  terminals,
  sessions,
  topo,
  snapshots,
  sources,
  snmpProfiles,
  visible,
  onTopo,
  onSnapshots,
  onSources,
  onOpenSession,
  tabs,
  onFocusTab,
  onReconnectTab,
  onConfirm,
  lifecycle = false,
}: {
  terminals: TerminalRef[];
  sessions: Session[];
  topo: Topology;
  snapshots: TopoSnapshot[];
  sources: TopoSources;
  /** Perfiles de Herramientas › SNMP (sin secretos: viven en la bóveda). */
  snmpProfiles: SnmpProfile[];
  /** La herramienta está a la vista: sin ella no se leen contadores de tráfico. */
  visible: boolean;
  onTopo: (t: Topology | ((t: Topology) => Topology)) => void;
  onSnapshots: (s: TopoSnapshot[]) => void;
  onSources: (s: TopoSources) => void;
  /** `background`: abre la pestaña sin activarla (Topología sigue a la vista). Devuelve el id de la pestaña. */
  onOpenSession: (s: Session, opts?: { background?: boolean; title?: string }) => string | void;
  /** Todas las pestañas con su estado (las caídas no están en `terminals`). */
  tabs: TabBrief[];
  /** Activa una pestaña: sale de Herramientas, a pedido del usuario. */
  onFocusTab: (tabId: string) => void;
  onReconnectTab: (tabId: string) => void;
  /** Confirmación de la app (ConfirmDialog) para borrar o reemplazar el diagrama y los snapshots. */
  onConfirm: (req: ConfirmReq) => void;
  /** Ciclo de vida activado en Ajustes: muestra EoL y versión en el detalle del equipo. */
  lifecycle?: boolean;
}) {
  const [connId, setConnId] = useState("");
  const term = terminals.find((t) => t.connId === connId);
  const [vendor, setVendor] = useState<TopoVendor>("cisco");
  const [readPorts, setReadPorts] = useState(true);
  const [msg, setMsg] = useState("");
  const [exportMenu, setExportMenu] = useState<Menu | null>(null);
  const { selected, setSelected, path, setPath, route, routeKeys, routeNodes, pathText } = useTopoSelection(topo);
  const rootRef = useRef<HTMLDivElement>(null);
  const [optsOpen, setOptsOpen] = useState(false);
  const [moreMenu, setMoreMenu] = useState<Menu | null>(null);
  const [searchBtn, setSearchBtn] = useState(false);
  const [proto, setProto] = useState<"ssh" | "telnet">("ssh");
  const { compareId, setCompareId, snapName, setSnapName, snapshot, diff, added, removed, ghostIds, newIds, diffCount, saveSnapshot } = useTopoSnapshots({ topo, snapshots, onSnapshots, onConfirm, setMsg });
  const [form, setForm] = useState<ManualForm | null>(null);
  const [formErr, setFormErr] = useState("");
  const [dismissedMap, setDismissedMap] = useState<DismissedMap>(loadDismissed);
  const dismissed = useMemo(() => dismissedSet(dismissedMap), [dismissedMap]);
  const dismiss = (id: string) =>
    setDismissedMap((m) => {
      const next = addDismissed(m, id);
      try {
        localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
      } catch {
        /* solo comodidad */
      }
      return next;
    });
  const [pendingFollow, setPendingFollow] = useState<PendingFollow | null>(null);
  const drag = useRef<{ id: string; sx: number; sy: number; x: number; y: number; w: number; h: number } | null>(null);
  const [dragPos, setDragPos] = useState<{ id: string; x: number; y: number } | null>(null);
  const [ui, setUi] = useState<TopoUi>(loadUi);
  // El descubrimiento tarda segundos: el alcance se evalúa contra el diagrama vigente al terminar.
  const topoRef = useRef(topo);
  topoRef.current = topo;

  const liveRef = useRef({ terminals, tabs, onConfirm, onFocusTab });
  liveRef.current = { terminals, tabs, onConfirm, onFocusTab };

  /** Sesión guardada que corresponde al equipo (misma IP o mismo nombre). */
  const savedFor = (n: TopoNode) =>
    sessions.find((s) => (s.type === "ssh" || s.type === "telnet") && ((n.ip && s.host === n.ip) || nodeId(s.name) === n.id));

  const follow = (n: TopoNode) => {
    const saved = savedFor(n);
    const known = terminals.map((t) => t.connId);
    if (saved) {
      setPendingFollow({ sessionId: saved.id, host: saved.host, known });
      onOpenSession(saved);
      setMsg(`Abriendo la sesión guardada "${saved.name}": autentícate en su pestaña. Al conectar queda elegida aquí; vuelve y pulsa "Descubrir vecinos".`);
      return;
    }
    if (!term || !n.ip) return;
    // La IP viene de un vecino (dato del equipo): solo una IPv4/IPv6 literal, nunca un nombre ni "-o…".
    if (!isIpv4(n.ip) && !isIpv6(n.ip)) {
      setMsg(`IP de gestión no válida: ${n.ip.slice(0, 64)}`);
      return;
    }
    const base = term.session;
    // Solo lo necesario para llegar al vecino: usuario, llave, jump host y compatibilidad. No se copian
    // comandos al conectar, túneles ni argumentos extra hacia una IP que informó otro equipo.
    const ssh = proto === "ssh";
    setPendingFollow({ host: n.ip, known });
    onOpenSession({
      id: "",
      name: n.name,
      type: proto,
      host: n.ip,
      port: ssh ? (base.type === "ssh" ? base.port : 22) : base.type === "telnet" ? base.port : 23,
      username: ssh ? base.username : undefined,
      identity_file: ssh ? base.identity_file : undefined,
      jump_host: ssh ? base.jump_host : undefined,
      legacy_ssh: ssh ? base.legacy_ssh : undefined,
      highlight: base.highlight,
      created_at: new Date().toISOString(),
    });
    setMsg(`Abriendo ${proto.toUpperCase()} a ${n.name}: autentícate en su pestaña. Al conectar queda elegida aquí; vuelve y pulsa "Descubrir vecinos".`);
  };
  const {
    routes,
    setRoutes,
    routesRef,
    cameFromRef,
    termRoute,
    hopUser,
    setHopUser,
    usePivotCred,
    setUsePivotCred,
    skipSavedCred,
    setSkipSavedCred,
    savedHops,
    vault,
    refreshCreds,
    saveOffers,
    setSaveOffers,
    pwDialog,
    setPwDialog,
    hopRuns,
    hopRunning,
    discoveringTabs,
    markDiscovering,
    hopViews,
    setHopViews,
    credAlerts,
    setCredAlerts,
    keyAsks,
    setKeyAsks,
    tabBlock,
    tabWhy,
    hopBack,
    computePlan,
    runChoice,
    openTerminal,
    openMenuItems,
    crumbState,
    isSavedSession,
    pivotHasPassword,
  } = useTopoHops({
    terminals,
    tabs,
    sessions,
    term,
    visible,
    topoRef,
    pivot: ui.pivot,
    setUi,
    vendor,
    proto,
    liveRef,
    savedFor,
    follow,
    onOpenSession,
    onFocusTab,
    onReconnectTab,
    setMsg,
    setConnId,
  });
  // Arrastrar un equipo solo cambia x/y: revisiones, sugerencias, conteos y búsqueda no se recalculan.
  const dataNodes = useNodeData(topo.nodes);
  const topoData = useMemo(() => ({ nodes: dataNodes, links: topo.links }), [dataNodes, topo.links]);
  const [filter, setFilter] = useState<TopoFilter>(NO_FILTER);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  /** Enlace elegido en la tabla de tráfico: se resalta y se centra en el mapa. */
  const [focusLink, setFocusLink] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const size = useTopoSize(rootRef, scroller);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const manualRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const legendId = useId();
  const whyId = useId();
  const isOpen = (s: PanelSection) => !!ui.sec[s];
  const setOpen = (s: PanelSection, open: boolean) => setUi((u) => ({ ...u, sec: { ...u.sec, [s]: open } }));
  const setPanel = (panel: boolean) => setUi((u) => ({ ...u, panel }));

  useEffect(() => saveUi(ui), [ui]);

  // Descubrimiento por SNMP: perfiles v2c o v3 (GETBULK); v1 no se ofrece.
  const mode = ui.mode;
  const profiles = useMemo(() => snmpProfiles.filter((p) => p.version !== "1" && p.host.trim()), [snmpProfiles]);
  const profile = profiles.find((p) => p.id === ui.snmpProfile) ?? profiles[0];

  // Tráfico en enlaces y lectura por consola (envía comandos de consulta): parten apagados la primera
  // vez y después se recuerdan, para no activarlos en cada apertura.
  const trafficOn = ui.traffic;
  const trafficCli = ui.cli;
  const setTrafficOn = (traffic: boolean) => setUi((u) => ({ ...u, traffic }));
  const setTrafficCli = (cli: boolean) => setUi((u) => ({ ...u, cli }));
  const reducedMotion = useReducedMotion();
  const trafficTerminals = useMemo(() => terminals.filter((t) => !t.tabId || !hopRunning.includes(t.tabId)), [terminals, hopRunning]);
  const traffic = useTopoTraffic({
    topo,
    profiles: snmpProfiles,
    // Una pestaña con un salto en curso no se lee: está cambiando de equipo y recibiendo comandos.
    terminals: trafficTerminals,
    opts: { on: trafficOn, cli: trafficCli, interval: ui.interval },
    visible,
    routes,
  });

  // Migra el diagrama de versiones anteriores (antes vivía en el navegador, fuera de la carpeta de datos).
  useEffect(() => {
    const old = legacyTopo();
    if (old && !topo.nodes.length) onTopo(old);
    if (old) localStorage.removeItem("topology");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Por defecto la sesión más reciente, sin contar las que tienen un salto en curso (están cambiando de equipo).
  useEffect(() => {
    if (term) return;
    const free = terminals.filter((t) => !t.tabId || (!hopRunning.includes(t.tabId) && !discoveringTabs.includes(t.tabId)));
    if (free.length) setConnId(free[free.length - 1].connId);
  }, [terminals, term, hopRunning, discoveringTabs]);
  // "Conectar y seguir la ruta": en cuanto la sesión abierta queda conectada, se elige sola en "Equipo".
  useEffect(() => {
    if (!pendingFollow) return;
    const t = followedTerminal(terminals, pendingFollow);
    if (!t) return;
    setConnId(t.connId);
    setPendingFollow(null);
    setMsg(`${t.name} conectado y elegido en "Equipo": pulsa "Descubrir vecinos" para seguir la ruta.`);
  }, [terminals, pendingFollow]);
  useEffect(() => {
    if (!term) return;
    const v = vendorFor(term.highlight);
    if (VENDORS.some((x) => x.id === v)) setVendor(v as TopoVendor);
  }, [term]);

  const routingOn = sourceOn(sources, "routing");
  const macOn = sourceOn(sources, "mac");

  const { busy, discover, discoverFromTab, discoverSnmp } = useTopoDiscovery({
    term,
    vendor,
    setVendor,
    readPorts,
    routingOn,
    macOn,
    scope: ui.scope,
    profile,
    topo,
    topoRef,
    routesRef,
    setRoutes,
    cameFromRef,
    onTopo,
    setSelected,
    setMsg,
    setConnId,
    liveRef,
    tabBlock,
    markDiscovering,
    prime: traffic.prime,
  });

  // Índice por id: buscar con find por cada enlace era O(enlaces × equipos) en cada render.
  const topoById = useMemo(() => new Map(topo.nodes.map((n) => [n.id, n])), [topo.nodes]);
  const node = (id: string) => topoById.get(id);
  const sel = selected ? node(selected) : undefined;

  /** Nombre del equipo en el diagrama o en el snapshot (los ids son nombres normalizados en minúscula). */
  const anyName = (id: string) => node(id)?.name ?? snapshot?.topo.nodes.find((n) => n.id === id)?.name ?? id;
  // Arrastre: la posición vive aquí mientras se mueve y se guarda una vez al soltar (antes cada
  // cuadro actualizaba los ajustes de toda la app).
  const liveTopo = useMemo(
    () => (dragPos ? { ...topo, nodes: topo.nodes.map((n) => (n.id === dragPos.id ? { ...n, x: dragPos.x, y: dragPos.y } : n)) } : topo),
    [topo, dragPos],
  );
  const view: Topology = useMemo(() => {
    const topo = liveTopo;
    if (!diff || !snapshot) return topo;
    // Los equipos que ya no están usan la posición del snapshot; si quedan encima de uno
    // actual se corren a la derecha para que ambos se lean.
    const placed = [...topo.nodes];
    const ghosts = diff.removedNodes.map((n) => {
      const g = { ...n, explored: false };
      while (placed.some((o) => Math.abs(o.x - g.x) < W + 10 && Math.abs(o.y - g.y) < H + 10)) g.x += W + 30;
      placed.push(g);
      return g;
    });
    return { nodes: [...topo.nodes, ...ghosts], links: [...topo.links, ...diff.removedLinks] };
  }, [diff, snapshot, liveTopo]);
  // Filtros: solo cambian lo que se dibuja; el diagrama guardado, las rutas y las exportaciones siguen completos.
  const shown = useMemo(() => filterView(view, filter), [view, filter]);
  const filtering = filterActive(filter);
  // Con la lectura de tráfico por consola, el estado de interfaz de "show interfaces" (dúplex, errores, estado) se suma al guardado.
  const checks = useMemo(() => linkChecks(topoData, traffic.live), [topoData, traffic.live]);
  // Puertos activos sin vecino: un nodo virtual por equipo, del lado opuesto a sus vecinos.
  const l2 = useMemo(() => (ui.l2 ? unknownL2(topoData) : null), [ui.l2, topoData]);
  const l2Cache = useRef(new Map<string, L2Geo>());
  const l2Nodes = useMemo(() => {
    if (!l2?.size) return [];
    // Con muchos equipos se dibuja solo el del seleccionado: cientos de nodos virtuales tapan el mapa
    // y duplican lo que el navegador tiene que pintar.
    const only = l2.size > MAX_L2_NODES ? selected : null;
    if (l2.size > MAX_L2_NODES && !only) return [];
    const pos = new Map(shown.nodes.map((n) => [n.id, n]));
    const pull = new Map<string, [number, number]>();
    const add = (id: string, o: TopoNode | undefined) => {
      const n = pos.get(id);
      if (!n || !o) return;
      const [x, y] = pull.get(id) ?? [0, 0];
      pull.set(id, [x + o.x - n.x, y + o.y - n.y]);
    };
    for (const l of shown.links) {
      if (l2.has(l.a)) add(l.a, pos.get(l.b));
      if (l2.has(l.b)) add(l.b, pos.get(l.a));
    }
    const out: L2Geo[] = [];
    const next = new Map<string, L2Geo>();
    for (const [id, info] of l2) {
      if (only && id !== only) continue;
      const n = pos.get(id);
      if (!n) continue;
      const [dx, dy] = pull.get(id) ?? [0, 0];
      const len = Math.hypot(dx, dy);
      const [ux, uy] = len ? [-dx / len, -dy / len] : [0, 1];
      const x = n.x + ux * 130;
      const y = n.y + uy * 95;
      // Mismo objeto si no se movió: su L2View no se redibuja.
      const prev = l2Cache.current.get(id);
      const v = prev && prev.x === x && prev.y === y && prev.from.x === n.x && prev.from.y === n.y && prev.info === info ? prev : { id, x, y, from: n, info };
      next.set(id, v);
      out.push(v);
    }
    l2Cache.current = next;
    return out;
  }, [l2, shown, selected]);
  const hits: SearchHit[] = useMemo(() => (searchOpen ? searchTopo(topoData, query) : []), [topoData, query, searchOpen]);

  // Geometría estable: un enlace cuyo trazo no cambió conserva su objeto y su LinkView no se redibuja.
  const geoCache = useRef(new Map<TopoLink, Geo>());
  const geometry = useMemo(() => {
    const prev = geoCache.current;
    const next = new Map<TopoLink, Geo>();
    const out = linkGeometry(shown, shown.links, PARALLEL_GAP).map((g0) => {
      const p = prev.get(g0.l);
      // La clave se conserva mientras el enlace sea el mismo con los mismos extremos: al arrastrar
      // un equipo la geometría se rehace en cada cuadro y no hay que normalizar los puertos de nuevo.
      const k = p && p.l.a === g0.l.a && p.l.b === g0.l.b && p.l.aPort === g0.l.aPort && p.l.bPort === g0.l.bPort ? p.k : linkKey(g0.l);
      const g: Geo = Object.assign(g0, { k });
      const keep = p && p.d === g.d && p.pair.length === g.pair.length ? p : g;
      next.set(g.l, keep);
      return keep;
    });
    geoCache.current = next;
    return out;
  }, [shown]);
  const shownById = useMemo(() => new Map(shown.nodes.map((n) => [n.id, n])), [shown.nodes]);
  const onIssue = useCallback((id: string) => {
    setSelected(id);
    setUi((u) => ({ ...u, panel: true, sec: { ...u.sec, atencion: true } }));
  }, []);
  /** Copia al portapapeles y lo confirma en el mensaje de la herramienta. */
  const copyText = (text: string, what: string) =>
    writeText(text)
      .then(() => setMsg(`${what} copiada: ${text.length > 80 ? `${text.slice(0, 79)}…` : text}`))
      .catch((e) => setMsg(`No se pudo copiar: ${String(e)}`));
  const [nodeMenu, setNodeMenu] = useState<Menu | null>(null);
  // Menú del equipo (clic derecho): la función cambia con el diagrama; NodeView recibe una estable.
  const nodeMenuRef = useRef<(e: React.MouseEvent<SVGGElement>, n: TopoNode) => void>(() => {});
  nodeMenuRef.current = (e, n) => {
    setSelected(n.id);
    const addrs = knownAddrs(n);
    setNodeMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        ...openMenuItems(n),
        [n.ip ? `Copiar IP (${n.ip})` : "Copiar IP (sin IP de gestión)", <Copy size={13} />, () => n.ip && copyText(n.ip, "IP"), !n.ip, undefined, true],
        ["Copiar nombre", <Copy size={13} />, () => copyText(n.name, "Nombre")],
        ["Copiar nombre e IP", <Copy size={13} />, () => copyText(n.ip ? `${n.name} ${n.ip}` : n.name, "Nombre e IP"), !n.ip],
        ...(addrs.length > 1 ? [[`Copiar sus ${addrs.length} direcciones`, <Copy size={13} />, () => copyText(addrs.join("\n"), "Direcciones")] as MenuItem] : []),
        ["Ver su vecindario", <ListFilter size={13} />, () => setFilter((f) => ({ ...f, hops: f.hops || 2, focus: n.id }))],
      ],
    });
  };
  const onNodeMenu = useCallback((e: React.MouseEvent<SVGGElement>, n: TopoNode) => nodeMenuRef.current(e, n), []);
  // Doble clic en un equipo = "Abrir terminal" (la acción principal del panel).
  const nodeOpenRef = useRef<(n: TopoNode) => void>(() => {});
  nodeOpenRef.current = (n) => openTerminal(n);
  const onNodeOpen = useCallback((n: TopoNode) => nodeOpenRef.current(n), []);
  const onNodeDown = useCallback((e: React.PointerEvent<SVGGElement>, n: TopoNode) => {
    const svg = e.currentTarget.ownerSVGElement as SVGSVGElement;
    svg.setPointerCapture(e.pointerId);
    // El tamaño en px del SVG se toma una vez: medirlo en cada movimiento forzaba un layout extra
    // del mapa por cuadro (el tamaño no cambia durante el arrastre; el viewBox sí puede).
    const r = svg.getBoundingClientRect();
    drag.current = { id: n.id, sx: e.clientX, sy: e.clientY, x: n.x, y: n.y, w: r.width, h: r.height };
    setSelected(n.id);
  }, []);

  // Última tasa por enlace (se recalcula una vez por lectura, no por cuadro).
  const linkRates = useMemo(() => {
    const m = new Map<string, LinkTraffic>();
    if (!trafficOn) return m;
    for (const l of topo.links) {
      const lt = linkTraffic(l, traffic.rates);
      if (lt) m.set(linkKey(l), lt);
    }
    return m;
  }, [trafficOn, traffic.rates, topo.links]);
  // Vista detallada (estilo previo): color continuo, flechas por sentido y animación en los carriles.
  // La vista por defecto es por excepción y no anima ni dibuja flechas.
  const detail = ui.detail;
  const arrowsOn = detail && ui.arrows;
  const animate = detail && ui.anim && ui.arrows && !reducedMotion && visible;
  /**
   * Píldoras del mapa. Por excepción: solo los enlaces altos (70 a 89 %), saturados (90 % o más) o
   * caídos llevan una sobre el centro de la línea, con el % de uso o "caído". En la vista detallada
   * llevan una todos los enlaces con tráfico (si "Rótulo" está activo). Los paralelos entre el mismo
   * par comparten una, con el agregado y el peor estado; el detalle por sentido va en la ficha.
   */
  const trafficPills = useMemo(() => {
    const pairKey = (l: TopoLink) => [l.a, l.b].sort().join("~");
    const pairs = new Map<string, { mids: Pt[]; keys: string[]; items: { g: Geo; lt?: LinkTraffic; level: LinkLevel }[] }>();
    for (const g of geometry) {
      const k = g.k;
      if (removed.has(k)) continue;
      const lt = linkRates.get(k);
      const level = linkLevelOf(checks.get(k), lt);
      const pk = pairKey(g.l);
      let e = pairs.get(pk);
      if (!e) pairs.set(pk, (e = { mids: [], keys: [], items: [] }));
      e.mids.push(g.mid);
      e.keys.push(k);
      if (level === "down" || (detail ? !!lt && ui.rates : level !== "normal")) e.items.push({ g, lt, level });
    }
    const out: Pill[] = [];
    for (const [pk, { mids, keys, items }] of pairs) {
      if (!items.length) continue;
      const worst = items.reduce((a, b) => (LEVEL_RANK[b.level] > LEVEL_RANK[a.level] || (LEVEL_RANK[b.level] === LEVEL_RANK[a.level] && (b.lt?.util ?? -1) > (a.lt?.util ?? -1)) ? b : a));
      const multi = items[0].g.pair.length > 1;
      const grp = multi ? linkGroup(shown, items[0].g.l, shownById) : undefined;
      const short = worst.level === "down" ? "caído" : worst.lt ? trafficShort(worst.lt) : "";
      const tone: Pill["tone"] = worst.level === "down" ? "down" : detail ? undefined : worst.level === "high" || worst.level === "saturated" ? worst.level : undefined;
      out.push({
        key: pk,
        x: mids.reduce((a, m) => a + m.x, 0) / mids.length,
        y: mids.reduce((a, m) => a + m.y, 0) / mids.length,
        text: multi ? `${grp ? `${grp} ×${items[0].g.pair.length}` : "máx"} · ${short}` : short,
        color: detail && ui.color && worst.lt ? UTIL_VAR[utilLevel(worst.lt.util)] : "var(--text)",
        tone,
        dim: !!route && !keys.some((k) => routeKeys.has(k)),
        keys,
      });
    }
    return out;
  }, [geometry, linkRates, checks, removed, route, routeKeys, detail, ui.color, ui.rates, shown, shownById]);
  /** Pares con píldora (todos sus enlaces): su rótulo de agregado ("Po1 ×2") ya va dentro de ella. */
  const pillPairs = useMemo(() => new Set(trafficPills.flatMap((p) => p.keys)), [trafficPills]);

  /**
   * Enlaces con tráfico, del más cargado al menos, solo para la animación de la vista detallada.
   * Sin posiciones: al arrastrar un equipo la geometría cambia en cada cuadro, pero las filas no, y
   * se devuelve el mismo arreglo para que la animación no se recalcule.
   */
  const rowsRef = useRef<TrafficRow[]>([]);
  const trafficRows = useMemo(() => {
    const rows: TrafficRow[] = [];
    if (!animate) return rows;
    for (const g of geometry) {
      const lt = linkRates.get(g.k);
      if (lt && !removed.has(g.k)) rows.push({ key: g.k, lt });
    }
    const peak = (lt: LinkTraffic) => Math.max(lt.ab ?? 0, lt.ba ?? 0);
    rows.sort((x, y) => (y.lt.util ?? -1) - (x.lt.util ?? -1) || peak(y.lt) - peak(x.lt));
    const prev = rowsRef.current;
    const same = prev.length === rows.length && prev.every((r, i) => r.key === rows[i].key && r.lt === rows[i].lt);
    if (!same) rowsRef.current = rows;
    return rowsRef.current;
  }, [animate, geometry, linkRates, removed]);
  /** Geometría a la vista, para ubicar el enlace que se elige en "Requieren atención" (sin un índice por cuadro). */
  const geometryRef = useRef(geometry);
  geometryRef.current = geometry;
  /**
   * Enlaces animados: solo los FLOW_MAX más cargados. Cada paso de la animación repinta el mapa, y
   * con cientos de enlaces animados una topología grande baja de 60 a pocos cuadros por segundo;
   * el resto conserva las flechas fijas.
   */
  const animKeys = useMemo(() => new Set(animate ? trafficRows.slice(0, FLOW_MAX).map((r) => r.key) : []), [animate, trafficRows]);

  /** Requieren atención: alto, saturado, caído o con problemas de interfaz, por severidad y luego uso. */
  const attention = useMemo(() => attentionRows(topoData, checks, linkRates, removed), [topoData, checks, linkRates, removed]);
  const attentionCount = useMemo(() => {
    let down = 0;
    let load = 0;
    let issues = 0;
    for (const r of attention) r.level === "down" ? down++ : r.level === "issues" ? issues++ : load++;
    return { down, load, issues };
  }, [attention]);
  const coverage = useMemo(() => checkCoverage(topoData, traffic.live), [topoData, traffic.live]);

  // Ficha del enlace: se arma solo para el enlace bajo el puntero (o enfocado). Las funciones leen
  // datos vigentes sin cambiar de identidad en cada arrastre: la ficha no depende de posiciones.
  const tips = useMemo(() => new TipStore(), []);
  tips.blocked = () => !!drag.current || !!endPan.current;
  useEffect(() => {
    if (!visible) tips.hide();
  }, [visible, tips]);
  const mapBox = useRef<HTMLDivElement>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const detailsFor = useCallback(
    (keys: string[]): LinkDetail[] => {
      const v = viewRef.current;
      const byId = new Map(v.nodes.map((n) => [n.id, n]));
      const out: LinkDetail[] = [];
      const want = new Set(keys);
      for (const l of v.links) {
        const k = linkKey(l);
        if (!want.has(k)) continue;
        const st = removed.has(k) ? "removed" : added.has(k) ? "added" : null;
        out.push(linkDetail(v, l, { byId, lt: st ? undefined : linkRates.get(k), issues: st === "removed" ? undefined : checks.get(k), live: traffic.live, state: st }));
      }
      // Los peores primero (caído y saturado), como en la lista de atención.
      return out.sort((x, y) => LEVEL_RANK[y.level] - LEVEL_RANK[x.level]);
    },
    [checks, linkRates, removed, added, traffic.live],
  );
  /** Clic en "Requieren atención": resalta el enlace y lo centra (otro clic en el mismo lo suelta). */
  const focusLinkRef = useRef(focusLink);
  focusLinkRef.current = focusLink;
  const pickLink = useCallback((key: string) => {
    if (focusLinkRef.current === key) return setFocusLink(null);
    setFocusLink(key);
    const mid = geometryRef.current.find((g) => g.k === key)?.mid;
    if (!mid) return;
    changeZoom((z) => Math.max(z, 1.4));
    setFocusReq(mid);
  }, []);
  // El enlace elegido dejó de estar a la vista: se suelta el resaltado.
  useEffect(() => {
    if (focusLink && !geometry.some((g) => g.k === focusLink)) setFocusLink(null);
  }, [focusLink, geometry]);

  // Sugerencias: se calculan del diagrama ya leído, sin comandos, y solo con su fuente activa.
  const suggestions = useMemo(() => collectSuggestions(topoData, sources, dismissed), [topoData, sources, dismissed]);
  const suggestionSources = TOPO_SOURCES.filter((s) => SUGGESTERS[s.id] && sourceOn(sources, s.id));
  const emptyHints = [
    sourceOn(sources, "descriptions") &&
      (topo.nodes.some((n) => n.ports && Object.keys(n.ports).length)
        ? "Ninguna descripción menciona un equipo sin enlace."
        : 'Descubre con "Estado de puertos" para leer las descripciones.'),
    macOn &&
      (topo.nodes.some((n) => n.macs && Object.keys(n.macs).length)
        ? "Ningún puerto sin enlace tiene HSRP/VRRP, MAC de equipo de red o varias MAC."
        : 'Pulsa "Descubrir vecinos" para leer las tablas MAC y ARP.'),
  ].filter((x): x is string => !!x);

  const box = useMemo(() => {
    if (!shown.nodes.length) return { x: 0, y: 0, w: 800, h: 400 };
    // En mapas grandes el nodo L2 es solo el del seleccionado: no cuenta para el encuadre, que si
    // no cambiaría (y se redibujaría todo el mapa) con cada selección.
    const l2Box = l2 && l2.size > MAX_L2_NODES ? [] : l2Nodes;
    const xs = [...shown.nodes.map((n) => n.x), ...l2Box.map((n) => n.x)];
    const ys = [...shown.nodes.map((n) => n.y), ...l2Box.map((n) => n.y)];
    const pad = 30;
    const x = Math.min(...xs) - W / 2 - pad;
    const y = Math.min(...ys) - H / 2 - pad;
    return { x, y, w: Math.max(...xs) - x + W / 2 + pad, h: Math.max(...ys) - y + H / 2 + pad };
  }, [shown.nodes, l2Nodes, l2]);

  // Diseño según el ancho de la herramienta: "wide" barra en dos filas con todos los campos; "mid" una
  // fila con lo secundario en Opciones; "tiny" solo lo esencial. El panel se acopla si hay ancho, se
  // superpone en anchos medianos y ocupa el mapa completo ("Volver al mapa") en ventanas chicas.
  const bp: "wide" | "mid" | "tiny" = size.rw >= 1040 ? "wide" : size.rw >= 520 || !size.rw ? "mid" : "tiny";
  const panelMode: "none" | "dock" | "overlay" | "sheet" = !ui.panel ? "none" : size.rw >= 860 || !size.rw ? "dock" : size.rw >= 560 && size.mh >= 280 ? "overlay" : "sheet";
  const panelW = Math.max(0, Math.min(320, size.rw - 32));
  /** Franja de la derecha del mapa que tapa el panel superpuesto. */
  const insetRight = panelMode === "overlay" ? panelW + 8 : 0;
  const { zoomUsed, mapK, fit, panning, changeZoom, fitView, fitAll, startPan, endPan, setFocusReq } = useTopoZoom({ scroller, size, box, shown, selected, insetRight, reducedMotion });

  /** Suelta el equipo: la posición final se guarda en el diagrama una sola vez. */
  const endDrag = () => {
    drag.current = null;
    if (!dragPos) return;
    const { id, x, y } = dragPos;
    onTopo((t) => ({ ...t, nodes: t.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)) }));
    setDragPos(null);
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    // El SVG se ajusta al contenedor manteniendo proporción: manda el eje más ajustado.
    const scale = Math.max(box.w / d.w, box.h / d.h);
    const x = d.x + (e.clientX - d.sx) * scale;
    const y = d.y + (e.clientY - d.sy) * scale;
    setDragPos({ id: d.id, x, y });
  };

  const exportFile = async (ext: "svg" | "csv" | "drawio", content: string) => {
    const name = ext === "drawio" ? "draw.io" : ext.toUpperCase();
    const dest = await save({ defaultPath: `topologia.${ext}`, filters: [{ name, extensions: [ext] }] });
    if (!dest) return;
    await invoke("save_text", { dest, content }).then(() => setMsg(`Guardado: ${dest}`)).catch((e) => setMsg(String(e)));
  };

  /**
   * draw.io con los íconos de red de su biblioteca Cisco, zonas por carpeta de la sesión guardada
   * y, con el ciclo de vida activo, la etapa EoL bajo cada equipo.
   */
  const exportDrawioIcons = async () => {
    const [{ toDrawioIcons }, life] = await Promise.all([
      import("../../lib/topoDrawio"),
      lifecycle ? import("../../lib/lifecycle").then(async (L) => ({ L, db: await L.loadLifecycle() })) : null,
    ]);
    const zones = new Map<string, string>();
    const notes = new Map<string, string>();
    const today = new Date().toISOString().slice(0, 10);
    for (const n of topo.nodes) {
      const folder = savedFor(n)?.folder?.trim();
      if (folder) zones.set(n.id, folder);
      const model = life && modelFromPlatform(n.platform);
      if (life && model) {
        const level = life.L.lifeLevel(life.L.findLifecycle(life.db, model), today);
        if (level !== "none") notes.set(n.id, life.L.LIFE_LABEL[level]);
      }
    }
    await exportFile("drawio", toDrawioIcons(topo, { zones, notes, l2: ui.l2 }));
  };

  /** Por qué no se puede descubrir ni enviar nada a esa pestaña, para pintar los botones (estado de este render), con el descubrimiento en curso primero. */
  const blockWhy = (tabId?: string): string | undefined => (busy ? "Ya hay un descubrimiento en curso: espera a que termine." : tabWhy(tabId));

  /** Aplica una edición manual: si falla, muestra el error en el formulario o en el mensaje. */
  const apply = (r: TopoResult, ok: string, onDone?: () => void) => {
    if (!r.topo) {
      if (form) setFormErr(r.error);
      else setMsg(r.error);
      return false;
    }
    onTopo(r.topo);
    setMsg(ok);
    setFormErr("");
    onDone?.();
    return true;
  };

  const submitForm = () => {
    if (!form) return;
    if (form.kind === "node") {
      const input = { name: form.name, ip: form.ip, platform: form.platform };
      const r = form.editId ? updateManualNode(topo, form.editId, input) : addManualNode(topo, input);
      apply(r, form.editId ? "Equipo actualizado" : `Equipo "${form.name.trim()}" agregado`, () => {
        setForm(null);
        setSelected(nodeId(form.name));
      });
    } else {
      const input = { a: form.a, aPort: form.aPort, b: form.b, bPort: form.bPort };
      const r = form.edit ? updateManualLink(topo, form.edit, input) : addManualLink(topo, input);
      apply(r, form.edit ? "Enlace actualizado" : "Enlace manual agregado", () => setForm(null));
    }
  };

  const accept = (s: LinkSuggestion) => apply(acceptSuggestion(topo, s), `Enlace confirmado: ${node(s.a)?.name ?? s.a} ${s.aPort} ↔ ${s.target}`);

  const nodesByName = useMemo(() => [...topo.nodes].sort((a, b) => a.name.localeCompare(b.name)), [topo.nodes]);

  // Detalle a demanda: al seleccionar un equipo se abre su sección.
  useEffect(() => {
    if (selected) setOpen("detalle", true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const formKey = form ? (form.kind === "node" ? `n:${form.editId ?? ""}` : `l:${form.edit ? linkKey(form.edit) : ""}`) : "";
  // Un formulario manual (nuevo o editar desde Detalle) abre su sección y la deja a la vista.
  useEffect(() => {
    if (!form) return;
    setOpen("manual", true);
    requestAnimationFrame(() => manualRef.current?.scrollIntoView({ block: "nearest" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formKey]);

  // La primera vez que aparecen sugerencias (de 0 a más de 0) la sección se despliega sola.
  const autoOpened = useRef(false);
  const prevCount = useRef(0);
  useEffect(() => {
    if (!autoOpened.current && prevCount.current === 0 && suggestions.length > 0) {
      autoOpened.current = true;
      setOpen("sugerencias", true);
    }
    prevCount.current = suggestions.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestions.length]);

  const showSuggestions = () => {
    setUi((u) => ({ ...u, panel: true, sec: { ...u.sec, sugerencias: true } }));
    requestAnimationFrame(() => suggestionsRef.current?.scrollIntoView({ block: "start", behavior: reducedMotion ? "auto" : "smooth" }));
  };

  /** Selecciona un equipo, acerca y lo centra en la vista (si un filtro lo oculta, se quitan los filtros). */
  const focusOn = (id: string) => {
    if (!shown.nodes.some((n) => n.id === id)) setFilter(NO_FILTER);
    setSelected(id);
    changeZoom((z) => Math.max(z, 1.6));
    setFocusReq(id);
  };
  useEffect(() => {
    if (!optsOpen) return;
    const onDown = (e: MouseEvent) => !(e.target as Element).closest("[data-opts]") && setOptsOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOptsOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [optsOpen]);

  // Ctrl/⌘+C con un equipo seleccionado en el mapa copia su IP, salvo que haya texto
  // seleccionado o el foco esté en un campo (ahí manda la copia normal).
  const selIp = selected ? topoById.get(selected)?.ip : undefined;
  useEffect(() => {
    if (!visible || !selIp) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== "c") return;
      const a = document.activeElement as HTMLElement | null;
      if (a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return;
      if (window.getSelection()?.toString()) return;
      e.preventDefault();
      void copyText(selIp, "IP");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, selIp]);

  const pickHit = (h: SearchHit) => {
    focusOn(h.id);
    setSearchOpen(false);
    setSearchBtn(false);
    setMsg(`${node(h.id)?.name ?? h.id}: ${h.what}${h.detail ? ` ${h.detail}` : ""}`);
  };

  const countBy = <K extends string>(items: K[]) => {
    const m = new Map<K, number>();
    for (const k of items) m.set(k, (m.get(k) ?? 0) + 1);
    return new Map([...m].sort((a, b) => b[1] - a[1]));
  };
  const roleCounts = useMemo(() => countBy<NodeRole>(dataNodes.map((n) => nodeRole(n))), [dataNodes]);
  const vendorCounts = useMemo(() => countBy<NodeVendor>(dataNodes.map((n) => nodeVendor(n))), [dataNodes]);
  const stateCounts = useMemo(() => countBy<NodeState>(dataNodes.map(nodeState)), [dataNodes]);
  const protoCounts = useMemo(() => countBy<string>(topo.links.map((l) => String(l.proto))), [topo.links]);
  const setScope = (p: Partial<TopoScope>) => setUi((u) => ({ ...u, scope: { ...u.scope, ...p } }));
  const showAttention = () => {
    setUi((u) => ({ ...u, panel: true, sec: { ...u.sec, atencion: true } }));
  };

  // Leyenda solo con lo que hay en la vista y solo si hay algo más que CDP/LLDP.
  const legendKinds = LINK_LEGEND.filter(([, s]) => linkDash(s) && shown.links.some((l) => linkDash(l) === linkDash(s)));
  const hasPhysical = shown.links.some((l) => !linkDash(l));
  const hasTentative = shown.nodes.some((n) => n.manual || n.addrOnly);
  const hasTraffic = linkRates.size > 0;
  // Leyenda de estados: con lecturas de tráfico, o cuando hay algo que resaltar (caído, problemas de interfaz).
  const showStatusLegend = hasTraffic || attention.length > 0;
  const showLegend = legendKinds.length > 0 || hasTentative || showStatusLegend;

  const trafficSummary = !trafficOn
    ? "Apagado"
    : !visible
      ? "En pausa (herramienta oculta)"
      : `Cada ${ui.interval} s · ${plural(linkRates.size, "enlace", "enlaces")} con datos${trafficCli ? " · también por consola" : ""}`;
  // Por qué no se puede descubrir ni enviar "exit" en la pestaña elegida en "Equipo" (se muestra bajo el botón).
  const termWhy = term ? blockWhy(term.tabId) : undefined;
  const hint = "Descubre los vecinos del equipo conectado y sigue la ruta salto a salto: clic en un vecino y 'Abrir terminal' (o doble clic). Solo usa comandos de consulta.";

  // ---- Barra de controles según el ancho: "wide" dos filas con todos los campos; "mid" una sola fila
  // con lo secundario en "Opciones" y en el menú "Más"; "tiny" lo esencial (equipo, descubrir, panel).
  const wide = bp === "wide";
  const tiny = bp === "tiny";
  /** Botones de la barra con texto (si no, solo ícono con tooltip). */
  const labels = wide || (!tiny && size.rw >= 900);
  // Por qué "Descubrir vecinos" no se puede pulsar, visible bajo el botón.
  const discoverWhy =
    mode === "cli" ? (!terminals.length ? "Conéctate a un equipo para descubrir" : !term ? "Elige un equipo de la lista" : undefined) : !profile ? "Crea un perfil SNMP en Herramientas › SNMP" : undefined;
  const openSection = (sec: PanelSection) => setUi((u) => ({ ...u, panel: true, sec: { ...u.sec, [sec]: true } }));
  const askClear = () => {
    const manual = topo.nodes.filter((n) => n.manual).length + topo.links.filter((l) => isUserProto(l.proto)).length;
    onConfirm({
      title: "¿Borrar el diagrama?",
      message: `Se borran ${topo.nodes.length} ${topo.nodes.length === 1 ? "equipo" : "equipos"} y ${topo.links.length} ${topo.links.length === 1 ? "enlace" : "enlaces"}${manual ? `, incluidos ${manual} ${manual === 1 ? "elemento agregado" : "elementos agregados"} a mano o desde sugerencias` : ""}. Los snapshots no se tocan: guarda uno antes si quieres recuperarlo.`,
      label: "Borrar diagrama",
      danger: true,
      defaultCancel: true,
      action: () => {
        onTopo({ nodes: [], links: [] });
        setSelected(null);
        setPath({});
      },
    });
  };
  const reorder = () => onTopo((t) => layout({ ...t, nodes: t.nodes.map((n) => ({ ...n, x: 0, y: 0 })) }));
  const exportItems: MenuItem[] = [
    ["Imagen SVG", <Download size={13} />, () => exportFile("svg", toSvg(topo, W, H, linkRates))],
    ["draw.io con íconos de red", <Download size={13} />, () => void exportDrawioIcons()],
    ["draw.io simple (cajas)", <Download size={13} />, () => exportFile("drawio", toDrawio(topo, W, H))],
    ["CSV de enlaces y puertos", <Download size={13} />, () => exportFile("csv", toCsv(topo, linkRates)), !topo.links.length],
    ["Copiar como Mermaid", <FileCode2 size={13} />, () => writeText(toMermaid(topo)).then(() => setMsg("Diagrama Mermaid copiado al portapapeles"))],
  ];
  /** Menú "Más": lo secundario (exportar, snapshots, fuentes) y, en anchos chicos, lo que no cabe en la barra. */
  const moreItems = () =>
    moreMenuItems({
      tiny,
      wide,
      labels,
      hasNodes: !!topo.nodes.length,
      trafficOn,
      filtering,
      shownCount: shown.nodes.length,
      viewCount: view.nodes.length,
      attentionCount: attention.length,
      suggestionsCount: suggestions.length,
      exportItems,
      onSearch: () => setSearchBtn(true),
      onToggleTraffic: () => setTrafficOn(!trafficOn),
      openSection,
      onShowAttention: showAttention,
      onShowSuggestions: showSuggestions,
      onReorder: reorder,
      onClear: askClear,
    });
  // Props de lo que dibuja TopoCanvas. Las de las capas (TopoLayers, memorizadas) conservan sus identidades.
  const layers: ComponentProps<typeof TopoLayers> = {
    geometry,
    nodes: shown.nodes,
    l2Nodes,
    pills: trafficPills,
    byId: topoById,
    shownById,
    snapshot,
    hasRoute: !!route,
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
    color: ui.color,
    arrows: arrowsOn,
    animate,
    animKeys,
    pillPairs,
    checks,
    tips,
    onIssue,
    onNodeDown,
    onNodeMenu,
    onNodeOpen,
    onPick: setSelected,
  };
  const summary: ComponentProps<typeof MapSummary> = {
    trafficOn,
    visible,
    last: traffic.status.last,
    snmp: traffic.status.snmp.length > 0,
    cli: traffic.status.cli.length > 0,
    count: attention.length,
    hasData: linkRates.size > 0,
    inset: insetRight,
    onOpen: showAttention,
  };
  const zoomControls: ComponentProps<typeof ZoomControls> = { inset: insetRight, fit, changeZoom, onFit: fitView, onFitAll: fitAll };
  const legend: ComponentProps<typeof MapLegend> = {
    open: isOpen("leyenda"),
    legendId,
    mw: size.mw,
    mh: size.mh,
    hasPhysical,
    legendKinds,
    hasTentative,
    showStatusLegend,
    detail,
    hasTraffic,
    color: ui.color,
    arrows: ui.arrows,
    onToggle: () => setUi((u) => ({ ...u, sec: { ...u.sec, leyenda: !u.sec.leyenda } })),
  };

  /** Lo que "Abrir terminal" del detalle necesita (todo salvo el equipo): plan, saltos, credenciales. */
  const connect: Omit<ComponentProps<typeof ConnectPanel>, "n"> = {
    getPlan: computePlan,
    crumb: crumbState,
    onRun: runChoice,
    onFocus: onFocusTab,
    onDiscover: discoverFromTab,
    canDiscover: mode === "cli",
    discoverWhy: blockWhy,
    pivotSaved: isSavedSession,
    pivotHasPassword,
    onMenu: (e, n) => {
      const r = e.currentTarget.getBoundingClientRect();
      setNodeMenu({ x: r.left, y: r.bottom + 4, items: openMenuItems(n) });
    },
    hopping: !!sel && [...hopRuns.current.values()].some((r) => r.route.steps.length > 0 && nodeId(r.route.steps[r.route.steps.length - 1].name) === sel.id),
    proto,
    onProto: setProto,
    hopUser,
    onHopUser: setHopUser,
    userHint: term?.session.username ?? "",
    askUser: vendor !== "huawei",
    savedHops,
    vault,
    onUnlocked: refreshCreds,
    usePivotCred,
    onUsePivotCred: setUsePivotCred,
    skipSaved: skipSavedCred,
    onSkipSaved: setSkipSavedCred,
  };

  return (
    <div ref={rootRef} className="@container h-full min-h-[280px] flex flex-col gap-3">
      <TopoToolbar
        wide={wide}
        tiny={tiny}
        labels={labels}
        hint={hint}
        mode={mode}
        setUi={setUi}
        vendor={vendor}
        setVendor={setVendor}
        readPorts={readPorts}
        setReadPorts={setReadPorts}
        connId={connId}
        setConnId={setConnId}
        terminals={terminals}
        hopRunning={hopRunning}
        profile={profile}
        profiles={profiles}
        term={term}
        termWhy={termWhy}
        termRoute={termRoute}
        hopBack={hopBack}
        busy={busy}
        discoverWhy={discoverWhy}
        whyId={whyId}
        discover={discover}
        discoverSnmp={discoverSnmp}
        hasNodes={topo.nodes.length > 0}
        query={query}
        setQuery={setQuery}
        searchOpen={searchOpen}
        setSearchOpen={setSearchOpen}
        searchBtn={searchBtn}
        setSearchBtn={setSearchBtn}
        hits={hits}
        pickHit={pickHit}
        nameOf={(id) => node(id)?.name}
        trafficOn={trafficOn}
        setTrafficOn={setTrafficOn}
        filtering={filtering}
        shownCount={shown.nodes.length}
        viewCount={view.nodes.length}
        openSection={openSection}
        attentionTotal={attention.length}
        attentionCount={attentionCount}
        showAttention={showAttention}
        suggestionsCount={suggestions.length}
        showSuggestions={showSuggestions}
        panelOpen={ui.panel}
        panelId={panelId}
        setPanel={setPanel}
        optsOpen={optsOpen}
        setOptsOpen={setOptsOpen}
        moreMenu={moreMenu}
        setMoreMenu={setMoreMenu}
        moreItems={moreItems}
        exportMenu={exportMenu}
        setExportMenu={setExportMenu}
        exportItems={exportItems}
        nodeMenu={nodeMenu}
        setNodeMenu={setNodeMenu}
        msg={msg}
      >
        <HopDialogs
          visible={visible}
          hopViews={hopViews}
          setHopViews={setHopViews}
          credAlerts={credAlerts}
          setCredAlerts={setCredAlerts}
          saveOffers={saveOffers}
          setSaveOffers={setSaveOffers}
          keyAsks={keyAsks}
          setKeyAsks={setKeyAsks}
          pwDialog={pwDialog}
          setPwDialog={setPwDialog}
          liveRef={liveRef}
          onFocusTab={onFocusTab}
          discoverFromTab={discoverFromTab}
          blockWhy={blockWhy}
          setMsg={setMsg}
          refreshCreds={refreshCreds}
        />
      </TopoToolbar>

      <div className="relative flex-1 min-h-[200px] flex gap-3">
        <TopoCanvas
          mapBox={mapBox}
          scroller={scroller}
          viewCount={view.nodes.length}
          shownCount={shown.nodes.length}
          onClearFilters={() => setFilter(NO_FILTER)}
          box={box}
          zoomUsed={zoomUsed}
          mapK={mapK}
          panning={panning}
          insetRight={insetRight}
          onPanStart={startPan}
          onPointerMove={onPointerMove}
          onEndDrag={endDrag}
          layers={layers}
          panelOpen={ui.panel}
          sel={sel}
          copyText={copyText}
          onShowDetail={() => setUi((u) => ({ ...u, panel: true, sec: { ...u.sec, detalle: true } }))}
          summary={summary}
          zoom={zoomControls}
          tips={tips}
          detailsFor={detailsFor}
          legend={showLegend ? legend : null}
        />

        {panelMode !== "none" && (
          <TopoPanel id={panelId} mode={panelMode} width={panelW} sel={sel} onClose={() => setPanel(false)}>
            <SourcesSection sources={sources} onSources={onSources} open={isOpen("fuentes")} onToggle={(v) => setOpen("fuentes", v)} />
            <ScopeSection scope={ui.scope} onScope={setScope} open={isOpen("alcance")} onToggle={(v) => setOpen("alcance", v)} />
            <FiltersSection
              filter={filter}
              setFilter={setFilter}
              filtering={filtering}
              shownCount={shown.nodes.length}
              viewCount={view.nodes.length}
              roleCounts={roleCounts}
              vendorCounts={vendorCounts}
              protoCounts={protoCounts}
              stateCounts={stateCounts}
              nodesByName={nodesByName}
              selected={selected}
              l2={ui.l2}
              onL2={(l2v) => setUi((u) => ({ ...u, l2: l2v }))}
              open={isOpen("filtros")}
              onToggle={(v) => setOpen("filtros", v)}
            />
            <AttentionSection
              attention={attention}
              counts={attentionCount}
              coverage={coverage}
              trafficOn={trafficOn}
              focusLink={focusLink}
              onPick={pickLink}
              open={isOpen("atencion")}
              onToggle={(v) => setOpen("atencion", v)}
            />
            <TrafficSection
              summary={trafficSummary}
              trafficOn={trafficOn}
              trafficCli={trafficCli}
              setTrafficOn={setTrafficOn}
              setTrafficCli={setTrafficCli}
              ui={ui}
              setUi={setUi}
              status={traffic.status}
              hasTerminals={terminals.length > 0}
              ratesCount={linkRates.size}
              reducedMotion={reducedMotion}
              open={isOpen("trafico")}
              onToggle={(v) => setOpen("trafico", v)}
            />
            {suggestionSources.length > 0 && (
              <SuggestionsSection
                suggestions={suggestions}
                emptyHints={emptyHints}
                nameOf={(id) => node(id)?.name}
                onAccept={accept}
                onDismiss={dismiss}
                wrapperRef={suggestionsRef}
                open={isOpen("sugerencias")}
                onToggle={(v) => setOpen("sugerencias", v)}
              />
            )}
            <DetailSection
              sel={sel}
              topo={topo}
              node={node}
              checks={checks}
              path={path}
              setPath={setPath}
              setSelected={setSelected}
              setFilter={setFilter}
              setOpen={setOpen}
              apply={apply}
              setForm={setForm}
              setFormErr={setFormErr}
              copyText={copyText}
              lifecycle={lifecycle}
              connect={connect}
              open={isOpen("detalle")}
              onToggle={(v) => setOpen("detalle", v)}
            />
            {(path.from || path.to) && (
              <RouteSection path={path} setPath={setPath} route={route} pathText={pathText} node={node} setMsg={setMsg} open={isOpen("ruta")} onToggle={(v) => setOpen("ruta", v)} />
            )}
            <ManualSection
              form={form}
              setForm={setForm}
              formErr={formErr}
              setFormErr={setFormErr}
              submitForm={submitForm}
              nodesByName={nodesByName}
              nodeCount={topo.nodes.length}
              selected={selected}
              wrapperRef={manualRef}
              open={isOpen("manual")}
              onToggle={(v) => setOpen("manual", v)}
            />
            <SnapshotsSection
              topo={topo}
              onTopo={onTopo}
              snapshots={snapshots}
              onSnapshots={onSnapshots}
              onConfirm={onConfirm}
              snapName={snapName}
              setSnapName={setSnapName}
              saveSnapshot={saveSnapshot}
              compareId={compareId}
              setCompareId={setCompareId}
              snapshot={snapshot}
              diff={diff}
              diffCount={diffCount}
              node={node}
              anyName={anyName}
              setMsg={setMsg}
              open={isOpen("snapshots")}
              onToggle={(v) => setOpen("snapshots", v)}
            />
          </TopoPanel>
        )}
      </div>
    </div>
  );
}
