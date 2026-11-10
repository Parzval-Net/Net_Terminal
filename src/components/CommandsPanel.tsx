import { memo, useCallback, useDeferredValue, useId, useMemo, useRef, useState } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  ChevronRight,
  Copy,
  CornerDownLeft,
  ExternalLink,
  Package,
  Pencil,
  Play,
  Plus,
  Radar,
  Search,
  Star,
  TextCursorInput,
  X,
} from "lucide-react";
import { CATEGORIES, CatalogEntry, CatalogVendor, OS_VENDORS, Risk, appliesTo, commandFor, riskLabel } from "../lib/packs";
import { modLabel } from "../lib/platform";
import { stepIndex } from "../lib/kbNav";
import { PanelResize, panelClass } from "./PanelResize";

interface Props {
  width: number;
  onResize: (w: number) => void;
  /** Ventana angosta: el panel se superpone a la terminal. */
  overlay?: boolean;
  /** Por qué no se puede ejecutar ahora (Herramientas a la vista, sin conexión…); null si se puede. */
  blocked?: string | null;
  /** Vuelve a la última terminal (solo con Herramientas a la vista) y el nombre de esa pestaña. */
  onReturn?: () => void;
  returnLabel?: string;
  catalog: CatalogVendor[];
  vendor: string;
  onVendor: (v: string) => void;
  /** Plataforma de la sesión activa para este fabricante (detectada o elegida). */
  platform: string | null;
  onPlatform: (p: string | null) => void;
  onDetect: (() => void) | null;
  detecting: boolean;
  favorites: string[];
  onFavorites: (f: string[]) => void;
  target: string | null;
  onRun: (c: CatalogEntry, cmd: string) => void;
  onType: (cmd: string) => void;
  onAdd: (vendor: string) => void;
  onEdit: (c: CatalogEntry) => void;
  onPacks: () => void;
  onClose: () => void;
}

// Familia Fortinet agrupada: el pack "fortinet" es FortiGate (FortiOS) y gestiona al resto.
const FORTI_ORDER = ["fortinet", "fortiswitch", "fortiap", "fortiextender"];
const FORTI_LABEL: Record<string, string> = { fortinet: "FortiGate (FortiOS)" };
const isForti = (id: string) => FORTI_ORDER.includes(id);

const riskStyle: Record<Risk, string> = { read: "text-ok", change: "text-warn", disruptive: "text-danger" };
const riskBorder: Record<Risk, string> = { read: "border-transparent", change: "border-[var(--warn)]", disruptive: "border-[var(--danger)]" };
const riskIcon: Record<Risk, string> = { read: "●", change: "▲", disruptive: "✕" };

function CmdText({ cmd }: { cmd: string }) {
  const parts = cmd.split(/(\{\{[^}]+\}\})/);
  return (
    <code className="block font-mono text-[12px] whitespace-pre-wrap break-all">
      {parts.map((p, i) =>
        p.startsWith("{{") ? (
          <span key={i} className="text-accent font-semibold">
            {p}
          </span>
        ) : (
          p
        ),
      )}
    </code>
  );
}

/** Texto de búsqueda en minúsculas, calculado una vez por comando. */
const haystacks = new WeakMap<CatalogEntry, string>();
function haystack(c: CatalogEntry): string {
  let h = haystacks.get(c);
  if (h === undefined) {
    h = `${c.cmd}\n${c.desc}\n${c.note ?? ""}`.toLowerCase();
    haystacks.set(c, h);
  }
  return h;
}

interface RowActions {
  run: (c: CatalogEntry, cmd: string) => void;
  type: (cmd: string) => void;
  copy: (c: CatalogEntry, cmd: string) => void;
  fav: (key: string, fav: boolean) => void;
  edit: (c: CatalogEntry) => void;
  /** Tarjeta seleccionada (sus acciones quedan a la vista) y tarjeta que entra en el orden de Tab. */
  select: (key: string) => void;
  focus: (key: string) => void;
}

export const CommandsPanel = memo(function CommandsPanel(p: Props) {
  const [query, setQuery] = useState("");
  // El filtro usa el valor diferido: el campo responde al instante aunque la lista sea larga.
  const deferredQuery = useDeferredValue(query);
  const [onlyRead, setOnlyRead] = useState(false);
  const [onlyFav, setOnlyFav] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({ Sistema: true });
  const [copied, setCopied] = useState<string | null>(null);
  const footId = useId();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const vendor = p.catalog.find((v) => v.id === p.vendor) ?? p.catalog[0];
  const platform = vendor?.platforms.some((x) => x.id === p.platform) ? p.platform : null;
  const favSet = useMemo(() => new Set(p.favorites), [p.favorites]);

  // Acciones estables para que las filas memorizadas no se vuelvan a dibujar en cada render.
  const pRef = useRef(p);
  pRef.current = p;
  const actions = useMemo<RowActions>(
    () => ({
      run: (c, cmd) => pRef.current.onRun(c, cmd),
      type: (cmd) => pRef.current.onType(cmd),
      copy: async (c, cmd) => {
        await writeText(cmd);
        setCopied(c.cmd);
        window.setTimeout(() => setCopied(null), 1500);
      },
      fav: (key, fav) => {
        const f = pRef.current.favorites;
        pRef.current.onFavorites(fav ? f.filter((x) => x !== key) : [...f, key]);
      },
      edit: (c) => pRef.current.onEdit(c),
      select: (key) => setSelectedKey((cur) => (cur === key ? null : key)),
      focus: (key) => setFocusKey(key),
    }),
    [],
  );

  const groups = useMemo(() => {
    if (!vendor) return [];
    const q = deferredQuery.trim().toLowerCase();
    const list = vendor.commands.filter(
      (c) =>
        appliesTo(c, platform) &&
        (!q || haystack(c).includes(q)) &&
        (!onlyRead || c.risk === "read") &&
        (!onlyFav || favSet.has(`${vendor.id}:${c.cmd}`)),
    );
    const byCat = new Map<string, CatalogEntry[]>();
    for (const c of list) {
      const l = byCat.get(c.cat);
      if (l) l.push(c);
      else byCat.set(c.cat, [c]);
    }
    return CATEGORIES.filter((cat) => byCat.has(cat)).map((cat) => [cat, byCat.get(cat)!] as const);
  }, [vendor, platform, deferredQuery, onlyRead, onlyFav, favSet]);

  const filtering = !!deferredQuery.trim() || onlyFav;
  const total = groups.reduce((n, [, l]) => n + l.length, 0);
  // Tabindex móvil: una sola tarjeta entra en el orden de Tab (la última con foco o, si no, la primera).
  const visibleKeys = useMemo(
    () => (vendor ? groups.flatMap(([cat, list]) => (filtering || open[cat] ? list.map((c) => `${vendor.id}:${c.cmd}`) : [])) : []),
    [groups, filtering, open, vendor],
  );
  const tabKey = focusKey && visibleKeys.includes(focusKey) ? focusKey : (visibleKeys[0] ?? null);
  const platLabel = useCallback((id: string) => vendor?.platforms.find((x) => x.id === id)?.label ?? id, [vendor]);

  return (
    <aside role="complementary" aria-label="Catálogo de comandos" className={panelClass(!!p.overlay)} style={{ width: p.width }}>
      <PanelResize width={p.width} onResize={p.onResize} />
      <header className="flex items-center gap-1 px-2 h-9 border-b border-line">
        {/* Lista agrupada: con equipos de red y sistemas operativos ya no caben como pestañas. */}
        <select
          aria-label="Catálogo"
          className="field !h-7 flex-1 min-w-0 !text-[12px] font-medium"
          value={vendor?.id ?? ""}
          onChange={(e) => p.onVendor(e.target.value)}
        >
          {[
            ["Equipos de red", p.catalog.filter((v) => !OS_VENDORS.includes(v.id) && !isForti(v.id))],
            ["Fortinet", FORTI_ORDER.map((id) => p.catalog.find((v) => v.id === id)).filter((v): v is CatalogVendor => !!v)],
            ["Sistemas operativos", p.catalog.filter((v) => OS_VENDORS.includes(v.id))],
          ].map(([label, list]) =>
            (list as CatalogVendor[]).length ? (
              <optgroup key={label as string} label={label as string}>
                {(list as CatalogVendor[]).map((v) => (
                  <option key={v.id} value={v.id}>
                    {(label === "Fortinet" && FORTI_LABEL[v.id]) || v.name} · {v.commands.length}
                  </option>
                ))}
              </optgroup>
            ) : null,
          )}
        </select>
        <HeadBtn title="Packs de comandos" aria-label="Packs de comandos" onClick={p.onPacks}>
          <Package size={14} />
        </HeadBtn>
        <HeadBtn title={`Cerrar (${modLabel}L)`} aria-label="Cerrar el catálogo" onClick={p.onClose}>
          <X size={15} />
        </HeadBtn>
      </header>

      <div className="px-2 pt-2 space-y-1.5">
        {vendor && vendor.platforms.length > 0 && (
          <div className="flex gap-1.5">
            <select
              aria-label="Plataforma"
              className="field !h-7 !text-[12px] flex-1 min-w-0"
              value={platform ?? ""}
              onChange={(e) => p.onPlatform(e.target.value || null)}
              title="La sintaxis y los comandos se ajustan a la plataforma"
            >
              <option value="">Todas las plataformas</option>
              {vendor.platforms.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
            {p.onDetect && (
              <button
                onClick={p.onDetect}
                disabled={p.detecting}
                title={`Detectar ejecutando "${vendor.detectCommand}" en la sesión`}
                aria-label="Detectar la plataforma"
                aria-busy={p.detecting}
                className="shrink-0 flex items-center gap-1 px-2 h-7 rounded-md border border-line text-[12px] hover:bg-hover disabled:opacity-40"
              >
                <Radar size={12} className={p.detecting ? "animate-pulse" : ""} />
                {/* Panel angosto: solo el ícono, para que el selector de plataforma se lea. */}
                <span className="hidden @[19rem]:inline">Detectar</span>
              </button>
            )}
          </div>
        )}
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            className="field !h-7 !pl-8 !text-[12px]"
            placeholder="Buscar comando o tarea"
            aria-label="Buscar comando o tarea"
            title="Por comando o por tarea: vecinos, óptico, CPU, VLAN…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQuery("")}
          />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-muted">
          <label className="flex items-center gap-1.5 min-h-6 whitespace-nowrap" title="Solo consultas: oculta lo que cambia configuración o puede cortar servicio">
            <input type="checkbox" className="accent-[var(--accent)]" checked={onlyRead} onChange={(e) => setOnlyRead(e.target.checked)} />
            <span className="@[19rem]:hidden">Consultas</span>
            <span className="hidden @[19rem]:inline">Solo consultas</span>
          </label>
          <label className="flex items-center gap-1.5 min-h-6 whitespace-nowrap">
            <input type="checkbox" className="accent-[var(--accent)]" checked={onlyFav} onChange={(e) => setOnlyFav(e.target.checked)} />
            Favoritos
          </label>
          <span className="ml-auto whitespace-nowrap" role="status" aria-live="polite">
            {total}
            <span className="sr-only"> {total === 1 ? "comando" : "comandos"}</span>
          </span>
          {vendor && (
            <button title="Agregar un comando propio" onClick={() => p.onAdd(vendor.id)} className="h-6 px-1 text-accent hover:underline flex items-center gap-0.5 whitespace-nowrap">
              <Plus size={12} /> Propio
            </button>
          )}
        </div>
      </div>

      <div data-cmdlist className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        {groups.map(([cat, list]) => {
          const isOpen = filtering || open[cat];
          return (
            <div key={cat}>
              <button
                onClick={() => setOpen((o) => ({ ...o, [cat]: !o[cat] }))}
                aria-expanded={!!isOpen}
                className="w-full flex items-center gap-1 px-1 h-7 text-[11px] font-semibold uppercase tracking-wide text-muted hover:text-fg"
              >
                <ChevronRight size={12} className={`transition-transform ${isOpen ? "rotate-90" : ""}`} />
                {cat}
                <span className="ml-auto font-normal">{list.length}</span>
              </button>
              {isOpen &&
                list.map((c) => (
                  <CommandRow
                    key={c.cmd}
                    c={c}
                    cmd={commandFor(c, platform)}
                    favKey={`${vendor.id}:${c.cmd}`}
                    fav={favSet.has(`${vendor.id}:${c.cmd}`)}
                    showVariants={!platform}
                    platLabel={platLabel}
                    target={p.target}
                    blocked={p.blocked ?? "Conecta una sesión para ejecutar."}
                    blockedId={footId}
                    copied={copied === c.cmd}
                    selected={selectedKey === `${vendor.id}:${c.cmd}`}
                    tabbable={tabKey === `${vendor.id}:${c.cmd}`}
                    actions={actions}
                  />
                ))}
            </div>
          );
        })}
        {total === 0 && <p className="p-4 text-center text-[12px] text-muted">Sin resultados</p>}
      </div>

      <footer className="px-3 py-1.5 border-t border-line text-[11px] text-muted">
        {/* Sin destino se dice por qué y cómo seguir; con Herramientas a la vista, un botón vuelve a la terminal. */}
        <div id={footId} role="status" className="flex items-center gap-2 min-w-0">
          {p.target ? (
            <span className="flex-1 min-w-0 truncate" title={`Destino: ${p.target}${platform ? ` · ${platLabel(platform)}` : ""}`}>
              Destino: {p.target}
              {platform ? ` · ${platLabel(platform)}` : ""}
            </span>
          ) : (
            <span className="flex-1 min-w-0 text-warn leading-snug">{p.blocked ?? "Conecta una sesión para ejecutar."}</span>
          )}
          {!p.target && p.onReturn && (
            <button
              onClick={p.onReturn}
              className="shrink-0 h-6 px-2 rounded-md border border-line bg-panel text-fg text-[11px] hover:bg-hover max-w-[55%] truncate"
            >
              Volver a {p.returnLabel ?? "la terminal"}
            </button>
          )}
        </div>
        <div className="mt-0.5 leading-snug">Verifica la sintaxis en tu versión{platform && !p.target ? ` · ${platLabel(platform)}` : ""}.</div>
      </footer>
    </aside>
  );
});

const CommandRow = memo(function CommandRow({
  c,
  cmd,
  favKey,
  fav,
  showVariants,
  platLabel,
  target,
  blocked,
  blockedId,
  copied,
  selected,
  tabbable,
  actions,
}: {
  c: CatalogEntry;
  cmd: string;
  favKey: string;
  fav: boolean;
  showVariants: boolean;
  platLabel: (id: string) => string;
  target: string | null;
  blocked: string;
  blockedId: string;
  copied: boolean;
  selected: boolean;
  tabbable: boolean;
  actions: RowActions;
}) {
  const id = useId();
  // Los botones de la tarjeta con foco entran en el orden de Tab; los de las demás, no (tabindex móvil).
  const ti = tabbable ? 0 : -1;
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      return actions.select(favKey);
    }
    const cards = Array.from(e.currentTarget.closest("[data-cmdlist]")?.querySelectorAll<HTMLElement>("[data-cmdrow]") ?? []);
    const to = stepIndex(e.key, cards.indexOf(e.currentTarget), cards.length, { orientation: "vertical", wrap: false, page: 6 });
    if (to < 0) return;
    e.preventDefault();
    cards[to].focus();
  };
  // Acciones superpuestas en la esquina inferior derecha (fondo del panel) con el mouse encima, el foco dentro o la tarjeta
  // seleccionada: no reservan alto y la lista no salta. Invisibles (no hidden) para no cambiar nada al aparecer.
  const showActions = selected ? "visible" : "invisible group-hover:visible group-focus-within:visible";
  return (
    <div
      role="group"
      aria-label={cmd}
      aria-describedby={`${id}-d ${id}-r`}
      data-cmdrow
      tabIndex={ti}
      onFocus={() => actions.focus(favKey)}
      onKeyDown={onKeyDown}
      onClick={(e) => !(e.target as HTMLElement).closest("button") && actions.select(favKey)}
      className={`group relative rounded-lg px-2 py-1.5 border-l-2 focus-visible:outline-offset-[-2px] [content-visibility:auto] [contain-intrinsic-size:auto_92px] ${riskBorder[c.risk]} ${
        selected ? "bg-selected ring-1 ring-inset ring-[var(--accent)]" : "hover:bg-hover"
      }`}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <CmdText cmd={cmd} />
          <p id={`${id}-d`} className="text-[12px] text-muted mt-0.5 leading-snug">{c.desc}</p>
          {showVariants && c.variants?.length ? (
            <div className="mt-1 space-y-0.5">
              {c.variants.map((v) => (
                <div key={v.cmd} className="text-[11px] text-muted">
                  <span className="font-medium">{v.platforms.map(platLabel).join(", ")}:</span>{" "}
                  <code className="font-mono">{v.cmd}</code>
                </div>
              ))}
            </div>
          ) : null}
          {c.note && <p className="text-[11px] text-muted mt-0.5 italic leading-snug">{c.note}</p>}
          <div className="flex flex-wrap items-center gap-x-2 mt-0.5 min-h-6 text-[11px]">
            <span id={`${id}-r`} className={riskStyle[c.risk]} title={c.escalated ? `El pack lo declaró "${riskLabel[c.declaredRisk]}"; la app lo subió por seguridad` : undefined}>
              <span aria-hidden>{riskIcon[c.risk]}</span> {riskLabel[c.risk]}
              {c.escalated ? " (ajustado)" : ""}
            </span>
            {showVariants && c.platforms?.length ? <span className="text-muted">{c.platforms.map(platLabel).join(", ")}</span> : null}
            {!c.builtin && <span className="text-accent">{c.packName}</span>}
          </div>
        </div>
        {/* Área de 24 x 24 px (el ícono es de 14); a la vista con foco, mouse o selección, y siempre si es favorito. */}
        <button
          title={fav ? "Quitar de favoritos" : "Agregar a favoritos"}
          aria-label={`Favorito: ${c.cmd.split("\n")[0]}`}
          aria-pressed={fav}
          tabIndex={ti}
          onClick={() => actions.fav(favKey, fav)}
          className={`shrink-0 -mt-0.5 -mr-1 w-6 h-6 grid place-items-center rounded focus-visible:opacity-100 ${
            fav ? "text-warn" : `text-muted hover:text-fg ${selected ? "" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"}`
          }`}
        >
          <Star size={14} fill={fav ? "currentColor" : "none"} />
        </button>
      </div>
      <div
        role="toolbar"
        aria-label="Acciones del comando"
        className={`absolute right-1.5 bottom-1.5 flex gap-1 p-0.5 rounded-lg bg-panel border border-line shadow-pop ${showActions}`}
      >
        <PanelBtn
          tabIndex={ti}
          disabled={!target}
          aria-describedby={target ? undefined : blockedId}
          aria-label={`Ejecutar ${c.cmd.split("\n")[0]}`}
          onClick={() => actions.run(c, cmd)}
          title={target ? `Ejecutar en ${target}` : blocked}
        >
          <Play size={12} /> <span className="hidden @[19rem]:inline">Ejecutar</span>
        </PanelBtn>
        {!cmd.includes("\n") && (
          <PanelBtn
            tabIndex={ti}
            disabled={!target}
            aria-describedby={target ? undefined : blockedId}
            aria-label="Escribir en la terminal sin Enter"
            onClick={() => actions.type(cmd)}
            title={target ? "Escribir en la terminal sin Enter" : blocked}
          >
            <TextCursorInput size={12} />
          </PanelBtn>
        )}
        <PanelBtn tabIndex={ti} aria-label={copied ? "Copiado" : "Copiar el comando"} title={copied ? "Copiado" : "Copiar el comando"} onClick={() => actions.copy(c, cmd)}>
          {copied ? <CornerDownLeft size={12} /> : <Copy size={12} />}
        </PanelBtn>
        {c.source && (
          <PanelBtn tabIndex={ti} aria-label="Abrir la fuente" onClick={() => openUrl(c.source!)} title={`Fuente: ${c.source}`}>
            <ExternalLink size={12} />
          </PanelBtn>
        )}
        {c.packId.startsWith("user-") && (
          <PanelBtn tabIndex={ti} aria-label="Editar el comando" title="Editar el comando" onClick={() => actions.edit(c)}>
            <Pencil size={12} />
          </PanelBtn>
        )}
      </div>
    </div>
  );
});

function HeadBtn(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className="w-7 h-7 shrink-0 grid place-items-center rounded-md text-muted hover:text-fg hover:bg-hover" />;
}

function PanelBtn(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="inline-flex items-center justify-center gap-1 min-w-6 px-1.5 h-6 rounded-md border border-line bg-panel text-[12px] hover:bg-hover disabled:opacity-40"
    />
  );
}
