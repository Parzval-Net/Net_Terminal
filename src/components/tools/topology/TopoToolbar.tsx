import { Activity, ChevronDown, Download, Ellipsis, ListFilter, Lightbulb, PanelRight, PanelRightClose, Radar, Search, SlidersHorizontal, TriangleAlert } from "lucide-react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { SnmpProfile } from "../../../lib/snmp";
import { SearchHit } from "../../../lib/topoInsights";
import { TabRoute, routeNames, routeTooltip } from "../../../lib/hopTab";
import { TopoVendor } from "../../../lib/topology";
import { ContextMenu } from "../../Sidebar";
import type { MenuItem } from "../../tabMenu";
import type { TerminalRef } from "../FileManager";
import { Btn, CountBadge, Label } from "../ui";
import { VENDORS } from "./topoConst";
import type { Menu } from "./topoTypes";
import type { DiscoveryMode, PanelSection, TopoUi } from "./topoUi";

/**
 * Barra de la herramienta: elegir cómo y con qué equipo descubrir, buscar, tráfico, filtros, atención,
 * sugerencias, panel y el menú "Más". Según el ancho: "wide" dos filas con todos los campos; "mid" una
 * sola fila con lo secundario en "Opciones" y en el menú "Más"; "tiny" lo esencial.
 */
export function TopoToolbar({
  wide,
  tiny,
  labels,
  hint,
  mode,
  setUi,
  vendor,
  setVendor,
  readPorts,
  setReadPorts,
  connId,
  setConnId,
  terminals,
  hopRunning,
  profile,
  profiles,
  term,
  termWhy,
  termRoute,
  hopBack,
  busy,
  discoverWhy,
  whyId,
  discover,
  discoverSnmp,
  hasNodes,
  query,
  setQuery,
  searchOpen,
  setSearchOpen,
  searchBtn,
  setSearchBtn,
  hits,
  pickHit,
  nameOf,
  trafficOn,
  setTrafficOn,
  filtering,
  shownCount,
  viewCount,
  openSection,
  attentionTotal,
  attentionCount,
  showAttention,
  suggestionsCount,
  showSuggestions,
  panelOpen,
  panelId,
  setPanel,
  optsOpen,
  setOptsOpen,
  moreMenu,
  setMoreMenu,
  moreItems,
  exportMenu,
  setExportMenu,
  exportItems,
  nodeMenu,
  setNodeMenu,
  msg,
  children,
}: {
  /** Diseño de la barra según el ancho (ver bp en TopologyTool). */
  wide: boolean;
  tiny: boolean;
  /** Botones de la barra con texto (si no, solo ícono con tooltip). */
  labels: boolean;
  hint: string;
  mode: DiscoveryMode;
  setUi: Dispatch<SetStateAction<TopoUi>>;
  vendor: TopoVendor;
  setVendor: (v: TopoVendor) => void;
  readPorts: boolean;
  setReadPorts: (v: boolean) => void;
  connId: string;
  setConnId: (id: string) => void;
  terminals: TerminalRef[];
  hopRunning: string[];
  /** Perfil SNMP elegido y los disponibles (v2c o v3). */
  profile: SnmpProfile | undefined;
  profiles: SnmpProfile[];
  /** Pestaña elegida en "Equipo" y por qué no se puede usar ahora. */
  term: TerminalRef | undefined;
  termWhy: string | undefined;
  termRoute: TabRoute | undefined;
  hopBack: () => void;
  busy: boolean;
  /** Por qué "Descubrir vecinos" no se puede pulsar (visible bajo el botón). */
  discoverWhy: string | undefined;
  whyId: string;
  discover: () => Promise<void>;
  discoverSnmp: () => Promise<void>;
  hasNodes: boolean;
  query: string;
  setQuery: (q: string) => void;
  searchOpen: boolean;
  setSearchOpen: (v: boolean) => void;
  searchBtn: boolean;
  setSearchBtn: Dispatch<SetStateAction<boolean>>;
  hits: SearchHit[];
  pickHit: (h: SearchHit) => void;
  /** Nombre del equipo en el diagrama. */
  nameOf: (id: string) => string | undefined;
  trafficOn: boolean;
  setTrafficOn: (on: boolean) => void;
  filtering: boolean;
  shownCount: number;
  viewCount: number;
  openSection: (sec: PanelSection) => void;
  attentionTotal: number;
  attentionCount: { down: number; load: number; issues: number };
  showAttention: () => void;
  suggestionsCount: number;
  showSuggestions: () => void;
  panelOpen: boolean;
  panelId: string;
  setPanel: (open: boolean) => void;
  optsOpen: boolean;
  setOptsOpen: Dispatch<SetStateAction<boolean>>;
  moreMenu: Menu | null;
  setMoreMenu: (m: Menu | null) => void;
  moreItems: () => MenuItem[];
  exportMenu: Menu | null;
  setExportMenu: (m: Menu | null) => void;
  exportItems: MenuItem[];
  nodeMenu: Menu | null;
  setNodeMenu: (m: Menu | null) => void;
  /** Mensaje de estado de la herramienta. */
  msg: string;
  /** Avance de los saltos y sus diálogos (HopDialogs). */
  children: ReactNode;
}) {
  const modeSelect = (
    <select className="field" value={mode} onChange={(e) => setUi((u) => ({ ...u, mode: e.target.value as DiscoveryMode }))}>
      <option value="cli">Consola (CLI)</option>
      <option value="snmp">SNMP (perfil)</option>
    </select>
  );
  const vendorSelect = (
    <select className="field" value={vendor} onChange={(e) => setVendor(e.target.value as TopoVendor)}>
      {VENDORS.map((v) => (
        <option key={v.id} value={v.id}>
          {v.label}
        </option>
      ))}
    </select>
  );
  const portsCheck = (
    <label
      className="flex items-center gap-1.5 h-8 text-[12px]"
      title={mode === "cli" ? "Lee estado, velocidad, descripción y Port-channel de las interfaces (comandos de consulta)" : "Lee ifOperStatus, ifHighSpeed e ifAlias (IF-MIB)"}
    >
      <input type="checkbox" className="accent-[var(--accent)]" checked={readPorts} onChange={(e) => setReadPorts(e.target.checked)} />
      Estado de puertos
    </label>
  );
  const equipoSelect =
    mode === "cli" ? (
      <select aria-label="Equipo (sesión conectada)" aria-describedby={discoverWhy ? whyId : undefined} className="field" value={connId} onChange={(e) => setConnId(e.target.value)}>
        {!terminals.length && <option value="">{tiny ? "Sin sesiones" : "Sin sesiones conectadas"}</option>}
        {terminals.map((t) => (
          <option key={t.connId} value={t.connId}>
            {t.name}
            {t.host ? ` · ${t.host}` : ""}
            {t.tabId && hopRunning.includes(t.tabId) ? " (salto en curso)" : ""}
          </option>
        ))}
      </select>
    ) : (
      <select aria-label="Perfil SNMP del equipo (v2c o v3)" aria-describedby={discoverWhy ? whyId : undefined} className="field" value={profile?.id ?? ""} onChange={(e) => setUi((u) => ({ ...u, snmpProfile: e.target.value }))}>
        {!profiles.length && <option value="">{tiny ? "Sin perfiles SNMP" : "Sin perfiles: créalos en Herramientas › SNMP"}</option>}
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name || p.host} · {p.host} · {p.version === "3" ? `v3 ${p.level}` : "v2c"}
            {p.saved ? "" : " (sin secretos guardados)"}
          </option>
        ))}
      </select>
    );
  // Botón principal con el motivo visible debajo cuando no se puede pulsar (y con contraste legible).
  const discoverBtn = (iconOnly: boolean) => {
    const off = "disabled:!opacity-100 disabled:!bg-chrome disabled:!text-muted disabled:border disabled:border-line";
    return (
      <div className="relative shrink-0">
        {mode === "cli" ? (
          <Btn
            kind="primary"
            className={`${off} ${iconOnly ? "!px-2.5" : ""}`}
            disabled={!term || !!termWhy}
            aria-label="Descubrir vecinos"
            aria-describedby={discoverWhy ? whyId : undefined}
            onClick={() => void discover()}
            title={termWhy ?? hint}
          >
            <Radar size={14} className={busy ? "animate-pulse" : ""} aria-hidden /> {!iconOnly && (busy ? "Leyendo…" : "Descubrir vecinos")}
          </Btn>
        ) : (
          <Btn
            kind="primary"
            className={`${off} ${iconOnly ? "!px-2.5" : ""}`}
            disabled={!profile || busy}
            aria-label="Descubrir por SNMP"
            aria-describedby={discoverWhy ? whyId : undefined}
            onClick={discoverSnmp}
            title="Lee LLDP-MIB y CISCO-CDP-MIB (y las fuentes activas) con GETBULK, solo lectura"
          >
            <Radar size={14} className={busy ? "animate-pulse" : ""} aria-hidden /> {!iconOnly && (busy ? "Leyendo…" : "Descubrir por SNMP")}
          </Btn>
        )}
        {discoverWhy && (
          <p id={whyId} className="absolute right-0 top-full mt-1 whitespace-nowrap text-[11.5px] text-muted">
            {discoverWhy}
          </p>
        )}
      </div>
    );
  };
  const searchField = (cls: string, autoFocus = false) => (
    <div className="relative">
      <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted pointer-events-none" aria-hidden />
      <input
        type="search"
        className={`field !h-8 !pl-7 !text-[12px] ${cls}`}
        placeholder="Buscar (nombre, IP, MAC, puerto)"
        title="Busca por nombre, IP, MAC, interfaz o descripción; Enter va al primero"
        aria-label="Buscar en el diagrama"
        disabled={!hasNodes}
        autoFocus={autoFocus}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setSearchOpen(true);
        }}
        onFocus={() => setSearchOpen(true)}
        onBlur={() =>
          setTimeout(() => {
            setSearchOpen(false);
            setSearchBtn(false);
          }, 150)
        }
        onKeyDown={(e) => {
          if (e.key === "Enter" && hits[0]) pickHit(hits[0]);
          if (e.key === "Escape") {
            setSearchOpen(false);
            setSearchBtn(false);
          }
        }}
      />
      {searchOpen && query.trim().length >= 2 && (
        <ul className="absolute z-20 left-0 top-full mt-1 w-72 max-w-[calc(100vw-2rem)] max-h-72 overflow-y-auto rounded-lg border border-line bg-panel shadow-pop py-1 text-[12px]" role="listbox">
          {hits.length ? (
            hits.map((h, i) => (
              <li key={`${h.id}${i}`}>
                <button type="button" role="option" aria-selected={i === 0} onMouseDown={(e) => e.preventDefault()} onClick={() => pickHit(h)} className="w-full text-left px-3 py-1.5 hover:bg-hover">
                  <span className="font-medium">{nameOf(h.id) ?? h.id}</span>
                  <span className="block text-[11.5px] text-muted truncate">
                    {h.what}
                    {h.detail ? `: ${h.detail}` : ""}
                  </span>
                </button>
              </li>
            ))
          ) : (
            <li className="px-3 py-1.5 text-muted">Sin resultados</li>
          )}
        </ul>
      )}
    </div>
  );
  const trafficBtn = (label: boolean) => (
    <Btn
      kind={trafficOn ? "default" : "ghost"}
      aria-pressed={trafficOn}
      aria-label="Tráfico en enlaces"
      title={trafficOn ? "Dejar de leer el tráfico de los enlaces" : "Mostrar el tráfico de los enlaces (opciones en el panel)"}
      onClick={() => setTrafficOn(!trafficOn)}
      className={`${trafficOn ? "!text-accent" : ""} ${label ? "" : "!px-2.5"}`}
    >
      <Activity size={14} aria-hidden /> {label && "Tráfico"}
    </Btn>
  );
  const filterBtn = (label: boolean) =>
    filtering && (
      <Btn title="Hay filtros activos: el diagrama muestra una parte" aria-label={`Filtros activos: ${shownCount} de ${viewCount} equipos`} className={label ? "" : "!px-2.5"} onClick={() => openSection("filtros")}>
        <ListFilter size={14} className="text-accent" aria-hidden /> {label ? `${shownCount} de ${viewCount}` : <CountBadge n={shownCount} />}
      </Btn>
    );
  const attentionBtn = (label: boolean) =>
    attentionTotal > 0 && (
      <Btn title="Ver los enlaces que requieren atención en el panel" aria-label={`Ver ${attentionTotal} enlaces que requieren atención`} className={label ? "" : "!px-2.5"} onClick={showAttention}>
        <TriangleAlert size={14} className={attentionCount.down + attentionCount.load ? "text-danger" : "text-warn"} aria-hidden /> {label && "Atención"} <CountBadge n={attentionTotal} />
      </Btn>
    );
  const suggestBtn = (label: boolean) =>
    suggestionsCount > 0 && (
      <Btn title="Ver sugerencias en el panel" aria-label={`Ver ${suggestionsCount} sugerencias`} className={label ? "" : "!px-2.5"} onClick={showSuggestions}>
        <Lightbulb size={14} className="text-warn" aria-hidden /> {label && "Sugerencias"} <CountBadge n={suggestionsCount} />
      </Btn>
    );
  const panelBtn = (label: boolean) => (
    <Btn
      aria-expanded={panelOpen}
      aria-controls={panelId}
      aria-label={panelOpen ? "Ocultar panel lateral" : "Mostrar panel lateral"}
      title={panelOpen ? "Ocultar panel lateral" : "Mostrar panel lateral"}
      className={label ? "" : "!px-2.5"}
      onClick={() => setPanel(!panelOpen)}
    >
      {panelOpen ? <PanelRightClose size={14} aria-hidden /> : <PanelRight size={14} aria-hidden />} {label && "Panel"}
    </Btn>
  );
  const moreBtn = (
    <Btn
      kind="ghost"
      className="!px-2.5"
      aria-haspopup="menu"
      aria-expanded={!!moreMenu}
      aria-label="Más opciones: exportar, snapshots, fuentes"
      title="Más opciones: exportar, snapshots, fuentes de descubrimiento"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setMoreMenu({ x: r.right - 208, y: r.bottom + 4, items: moreItems() });
      }}
    >
      <Ellipsis size={14} aria-hidden />
    </Btn>
  );

  return (
    <section className={`rounded-xl border border-line bg-panel ${wide ? "px-4 py-3" : "px-3 py-2"}`}>
      {/* En anchos chicos se oculta: el menú lateral ya dice Topología y el texto queda en el botón. */}
      <header className="flex items-baseline gap-2 min-w-0 mb-2 @max-[860px]:hidden">
        <h2 className="text-[13px] font-semibold shrink-0">Topología</h2>
        <p className="text-[11.5px] text-muted truncate" title={hint}>
          {hint}
        </p>
      </header>
      {wide ? (
        <div className={`flex flex-wrap items-end gap-2 ${discoverWhy ? "mb-5" : ""}`}>
          <Label text="Descubrir con" className="w-36">
            {modeSelect}
          </Label>
          {mode === "cli" ? (
            <>
              <Label text="Equipo (sesión conectada)" className="flex-1 min-w-48">
                {equipoSelect}
              </Label>
              <Label text="Fabricante" className="w-40">
                {vendorSelect}
              </Label>
            </>
          ) : (
            <Label text="Perfil SNMP del equipo (v2c o v3)" className="flex-1 min-w-48">
              {equipoSelect}
            </Label>
          )}
          {portsCheck}
          {discoverBtn(false)}
        </div>
      ) : (
        <div className={`relative flex items-center gap-1.5 ${discoverWhy ? "mb-5" : ""}`} role="toolbar" aria-label="Descubrimiento y diagrama">
          <div className={`flex-1 ${tiny ? "min-w-[8rem]" : "min-w-[12.5rem]"}`}>{equipoSelect}</div>
          {discoverBtn(tiny)}
          <Btn
            kind="ghost"
            data-opts=""
            className="!px-2.5"
            aria-haspopup="dialog"
            aria-expanded={optsOpen}
            aria-label="Opciones de descubrimiento"
            title="Opciones de descubrimiento: modo, fabricante y estado de puertos"
            onClick={() => setOptsOpen((o) => !o)}
          >
            <SlidersHorizontal size={14} aria-hidden />
          </Btn>
          {!tiny && (
            <Btn kind="ghost" className="!px-2.5" aria-label="Buscar en el diagrama" aria-expanded={searchBtn} title="Buscar en el diagrama" disabled={!hasNodes} onClick={() => setSearchBtn((v) => !v)}>
              <Search size={14} aria-hidden />
            </Btn>
          )}
          {!tiny && trafficBtn(labels)}
          {!tiny && filterBtn(labels)}
          {!tiny && attentionBtn(labels)}
          {labels && suggestBtn(true)}
          {panelBtn(labels)}
          {moreBtn}
          {optsOpen && (
            <div data-opts="" role="dialog" aria-label="Opciones de descubrimiento" className="absolute right-0 top-full z-30 mt-1 w-72 max-w-full space-y-2.5 rounded-lg border border-line bg-panel p-3 shadow-pop">
              <Label text="Descubrir con">{modeSelect}</Label>
              {mode === "cli" && <Label text="Fabricante">{vendorSelect}</Label>}
              {portsCheck}
            </div>
          )}
          {searchBtn && (
            <div className="absolute left-0 right-0 top-full z-30 mt-1">{searchField("!w-full", true)}</div>
          )}
        </div>
      )}
      {mode === "cli" && term && termWhy && !busy && <p className="mt-1.5 text-[11.5px] text-warn">{`"${term.name}": ${termWhy}`}</p>}
      {mode === "cli" && term && termRoute && termRoute.steps.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11.5px]">
          <span className="text-muted">Pestaña de salto "{term.name}":</span>
          <span className="font-medium">{routeTooltip(termRoute)}</span>
          <Btn className="!h-6 !px-2 !text-[11.5px]" disabled={!!termWhy} onClick={hopBack} title={termWhy ?? 'Envía "exit" en esa pestaña: vuelve al equipo anterior de la ruta'}>
            Volver a {routeNames(termRoute).slice(-2)[0]}
          </Btn>
        </div>
      )}
      {mode === "snmp" && (
        <p className="mt-1.5 text-[11.5px] text-muted">
          Solo lectura con el perfil y sus secretos de la bóveda; tope de 10.000 filas y 20 s por tabla. Si LLDP y CDP vuelven vacíos por SNMP, el protocolo está apagado en el equipo.
        </p>
      )}
      {wide && (
        <div className="flex items-center gap-1 mt-2.5" role="toolbar" aria-label="Diagrama">
          {searchField("!w-64")}
          <span className="w-px h-5 bg-[var(--border)] mx-1" aria-hidden />
          <Btn
            kind="ghost"
            title="Exportar el diagrama: SVG, draw.io, CSV o Mermaid"
            aria-haspopup="menu"
            aria-expanded={!!exportMenu}
            disabled={!hasNodes}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setExportMenu({ x: r.left, y: r.bottom + 4, items: exportItems });
            }}
          >
            <Download size={14} /> Exportar <ChevronDown size={12} aria-hidden />
          </Btn>
          <div className="ml-auto flex items-center gap-1">
            {trafficBtn(true)}
            {filterBtn(true)}
            {attentionBtn(true)}
            {suggestBtn(true)}
            {panelBtn(true)}
            {moreBtn}
          </div>
        </div>
      )}
      {exportMenu && <ContextMenu menu={exportMenu} onClose={() => setExportMenu(null)} />}
      {nodeMenu && <ContextMenu menu={nodeMenu} onClose={() => setNodeMenu(null)} />}
      {moreMenu && <ContextMenu menu={moreMenu} onClose={() => setMoreMenu(null)} />}
      {msg && <p className="mt-2 text-[12px] text-accent">{msg}</p>}
      {children}
    </section>
  );
}
