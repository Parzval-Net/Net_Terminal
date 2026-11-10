/**
 * Respuestas de la interfaz a las consultas del servidor MCP (evento "mcp-query" → mcp_query_reply).
 * El backend pregunta solo cuando un agente llama a una herramienta que lo necesita y espera 2,5 s;
 * sin servidor ni llamadas no corre nada. Lo que se entrega son datos que la interfaz ya tiene en
 * memoria (catálogo y riesgo, monitores, plataforma detectada, tráfico de Topología) y el diff de la
 * app. Nunca contraseñas, perfiles SNMP ni la bóveda: cada respuesta arma solo los campos que el
 * backend usa, y el backend vuelve a acotarlos.
 */
import type { CatalogVendor, Risk } from "./packs";
import type { MonitorStatus, MonitorTarget, Sample } from "./monitors";
import { diffLines, diffStats, markSecretChanges, splitLines, unifiedDiff, type SecretMarks } from "./diff";

/** Datos vivos de Topología (tráfico y "Requieren atención") que publica la vista mientras está abierta. */
export interface TopologyLive {
  ts: number;
  links: { a: string; aPort: string; b: string; bPort: string; ab: number | null; ba: number | null; speed?: number; util?: number; level: string }[];
  attention: { aName: string; bName: string; level: string; util?: number; phrase: string }[];
}

let live: TopologyLive | null = null;
let active = false;

/** El servidor MCP está encendido (lo fija useMcp): sin él, Topología no arma nada para publicar. */
export function setBridgeActive(on: boolean) {
  active = on;
  if (!on) live = null;
}

export const bridgeActive = () => active;

/** La vista Topología publica aquí su estado (null al cerrarse o con el tráfico apagado). */
export function setTopologyLive(v: TopologyLive | null) {
  live = active ? v : null;
}

export const topologyLive = () => live;

export interface BridgeCtx {
  catalog: CatalogVendor[];
  risk: (cmd: string) => Risk;
  monitors: { targets: MonitorTarget[]; status: Record<string, MonitorStatus>; samples: Record<string, Sample[]> };
  /** Pestaña de una conexión del backend (plataforma, estado, log). */
  tabOf: (connId: string) => { platform?: string; status?: string; logging?: boolean } | undefined;
}

const str = (v: unknown, max = 128) => (typeof v === "string" ? v.slice(0, max) : undefined);
const lc = (s: string | undefined) => (s ?? "").toLowerCase();

/** Catálogo filtrado (fabricante, plataforma, texto y riesgo); el backend pagina. */
export function catalogRows(catalog: CatalogVendor[], args: Record<string, unknown>) {
  const vendor = lc(str(args.vendor, 64));
  const platform = lc(str(args.platform, 64));
  const q = lc(str(args.query));
  const risk = str(args.risk, 16);
  const out: { vendor: string; cmd: string; desc: string; cat: string; risk: Risk; platforms?: string[] }[] = [];
  for (const v of catalog) {
    if (vendor && v.id.toLowerCase() !== vendor && v.name.toLowerCase() !== vendor) continue;
    for (const c of v.commands) {
      if (platform && c.platforms?.length && !c.platforms.some((p) => p.toLowerCase() === platform)) continue;
      if (q && !c.cmd.toLowerCase().includes(q) && !c.desc.toLowerCase().includes(q)) continue;
      if (risk && c.risk !== risk) continue;
      out.push({ vendor: v.id, cmd: c.cmd, desc: c.desc, cat: c.cat, risk: c.risk, platforms: c.platforms });
      if (out.length >= 20_000) return out;
    }
  }
  return out;
}

export function monitorRows(m: BridgeCtx["monitors"]) {
  return m.targets.map((t) => {
    const st = m.status[t.id];
    const s = m.samples[t.id] ?? [];
    const last = s[s.length - 1];
    const recent = s.slice(-100);
    const lost = recent.filter((x) => !x.ok).length;
    return {
      name: t.name,
      kind: t.kind,
      host: t.host,
      port: t.port ?? null,
      active: t.active,
      state: st?.state ?? "unknown",
      since: st?.since ?? null,
      failStreak: st?.failStreak ?? 0,
      lastError: st?.lastError ?? null,
      lastRtt: last?.rtt ?? null,
      lossPct: recent.length ? Math.round((lost / recent.length) * 1000) / 10 : null,
    };
  });
}

/** Diff de la app (el mismo de Respaldos) sobre los textos ya enmascarados por el backend. */
export function diffReply(args: Record<string, unknown>) {
  const a = splitLines(typeof args.a === "string" ? args.a : "");
  const b = splitLines(typeof args.b === "string" ? args.b : "");
  const marks = (v: unknown): SecretMarks | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as SecretMarks) : null);
  const rows = markSecretChanges(diffLines(a, b), marks(args.ha), marks(args.hb));
  const context = typeof args.context === "number" ? Math.max(0, Math.min(10, Math.floor(args.context))) : 3;
  return { unified: unifiedDiff(a, b, rows, str(args.nameA, 200) ?? "a", str(args.nameB, 200) ?? "b", context), stats: diffStats(rows) };
}

/** Respuesta a una consulta; undefined si el tipo no se conoce (el backend vence el plazo). */
export function answerQuery(kind: string, args: Record<string, unknown>, ctx: BridgeCtx): unknown {
  switch (kind) {
    case "catalog":
      return catalogRows(ctx.catalog, args);
    case "monitors":
      return monitorRows(ctx.monitors);
    case "topology_live":
      return live ? { active: true, ...live } : { active: false };
    case "session_info": {
      const t = ctx.tabOf(String(args.connection_id ?? ""));
      return t ? { platform: t.platform ?? null, status: t.status ?? null, logging: !!t.logging } : {};
    }
    case "diff":
      return diffReply(args);
    case "risk":
      return typeof args.command === "string" ? ctx.risk(args.command) : null;
    default:
      return undefined;
  }
}
