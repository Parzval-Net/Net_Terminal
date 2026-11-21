import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { runOnDeviceResult } from "../../lib/deviceRun";
import { vendorFor } from "../../lib/commands";
import { computeRisk } from "../../lib/packs";
import { SnmpProfile, targetParams } from "../../lib/snmp";
import { PortInfo, TopoNode, TopoVendor, Topology, canonPort, isCliError, knownAddrs, nodeId, promptName } from "../../lib/topology";
import { atPrompt } from "../../lib/cliText";
import { OID, TopoRead, ifIndexByPort, ifNames, walksComplete } from "../../lib/topoSnmp";
import {
  CounterSample,
  MAX_TRAFFIC_IFACES,
  PortRate,
  counterOids,
  maxSampleGapMs,
  parseCliCounters,
  terminalFor,
  parseCounterGets,
  portRate,
  trafficCommands,
} from "../../lib/topoTraffic";
import type { TerminalRef } from "./FileManager";
import { promptIsDevice } from "../../lib/hopTab";
import type { TabRoute } from "../../lib/hopTab";

export type TrafficInterval = 15 | 30 | 60;
export const TRAFFIC_INTERVALS: TrafficInterval[] = [15, 30, 60];

export interface TrafficOptions {
  on: boolean;
  /** También por consola (envía comandos de consulta): apagado por defecto. */
  cli: boolean;
  interval: TrafficInterval;
}

export interface TrafficStatus {
  snmp: string[];
  cli: string[];
  /** Equipos explorados sin perfil SNMP ni sesión de consola habilitada. */
  none: string[];
  errors: string[];
  /** Pestañas que no estaban en un prompt (paginador, contraseña, comando en curso): no se les envió nada. */
  busy: string[];
  /** Lecturas por consola cuya salida se cortó: solo traen parte de las interfaces. */
  partial: string[];
  last?: number;
}

const EMPTY: TrafficStatus = { snmp: [], cli: [], none: [], errors: [], busy: [], partial: [] };
/** Plazo de la lectura de contadores por consola: "show interfaces" de un chasis con paginador pasa del minuto. */
const CLI_READ_SECS = 120;
/** Un índice de interfaces leído a medias se vuelve a leer pasado este tiempo. */
const IF_INDEX_RETRY_MS = 5 * 60_000;
const NO_SECRETS = { community: "", authPass: "", privPass: "" };

/** Interfaces del equipo con algún enlace en el diagrama (clave canonPort). */
function linkedPorts(t: Topology, id: string): string[] {
  const ports = new Set<string>();
  for (const l of t.links) {
    if (l.a === id && l.aPort) ports.add(canonPort(l.aPort));
    if (l.b === id && l.bPort) ports.add(canonPort(l.bPort));
  }
  return [...ports].slice(0, MAX_TRAFFIC_IFACES);
}

/** Perfil SNMP del equipo (misma IP o mismo nombre), con secretos en la bóveda y GETBULK. */
export function profileFor(n: TopoNode, profiles: SnmpProfile[]): SnmpProfile | undefined {
  const addrs = knownAddrs(n);
  return profiles.find((p) => p.saved && p.version !== "1" && (addrs.includes(p.host.trim()) || (!!p.name && nodeId(p.name) === n.id)));
}

class BusyTab extends Error {}

interface IfCache {
  profile: string;
  byPort: Map<string, number>;
  hc: boolean;
  /**
   * El recorrido de ifName o ifDescr se cortó (tiempo, tope de filas, error): el índice puede estar
   * incompleto y se vuelve a leer desde este momento (ms). Antes quedaba guardado hasta reiniciar.
   */
  retryAt?: number;
}

/**
 * Lee contadores de las interfaces con enlace de cada equipo explorado cada `interval` segundos,
 * solo mientras la herramienta está visible y la ventana no está oculta. Por SNMP: un GET con los
 * contadores de todas sus interfaces (la tabla ifName se lee una vez y se guarda). Por consola
 * (opcional): un comando de consulta por equipo. Como máximo una lectura en curso por equipo y un
 * solo cambio de estado por ronda (la animación va en CSS, sin renders por cuadro).
 */
export function useTopoTraffic({
  topo,
  profiles,
  terminals,
  opts,
  visible,
  routes,
}: {
  topo: Topology;
  profiles: SnmpProfile[];
  terminals: TerminalRef[];
  opts: TrafficOptions;
  visible: boolean;
  /**
   * Ruta de cada pestaña abierta por un salto (por id de pestaña): cada equipo de la ruta se lee por la
   * pestaña que está en él, verificada por su prompt; una que cambió de equipo no se usa.
   */
  routes?: Record<string, TabRoute>;
}) {
  const [rates, setRates] = useState<Map<string, Map<string, PortRate>>>(() => new Map());
  const [status, setStatus] = useState<TrafficStatus>(EMPTY);
  /**
   * Estado de interfaz que trae la misma lectura por consola (show interfaces: estado, dúplex, errores):
   * se superpone al estado guardado para las revisiones de enlaces, sin escribirlo en el diagrama.
   */
  const [live, setLive] = useState<Map<string, Map<string, PortInfo>>>(() => new Map());
  const ctx = useRef({ topo, profiles, terminals, cli: opts.cli, routes });
  ctx.current = { topo, profiles, terminals, cli: opts.cli, routes };
  const prev = useRef(new Map<string, Map<string, CounterSample>>());
  const ifCache = useRef(new Map<string, IfCache>());
  const inFlight = useRef(new Set<string>());
  /** Comando de contadores que respondió en cada equipo: no se reintentan los demás en cada ronda. */
  const cliCmd = useRef(new Map<string, string>());
  const ratesRef = useRef(rates);
  const liveRef = useRef(live);
  liveRef.current = live;

  /** El descubrimiento por SNMP ya leyó ifName: se reutiliza sin otra lectura. */
  const prime = useCallback((id: string, profile: string, byPort: Map<string, number>) => {
    ifCache.current.set(id, { profile, byPort, hc: ifCache.current.get(id)?.hc ?? true });
  }, []);

  useEffect(() => {
    if (!opts.on) {
      ratesRef.current = new Map();
      setRates(ratesRef.current);
      setLive(new Map());
      setStatus(EMPTY);
      prev.current.clear();
    }
  }, [opts.on]);

  useEffect(() => {
    if (!opts.on || !visible) return;
    let alive = true;
    let timer: number | undefined;

    const readSnmp = async (n: TopoNode, p: SnmpProfile, ports: string[]): Promise<Map<string, CounterSample>> => {
      const target = targetParams(p, NO_SECRETS);
      let cache = ifCache.current.get(n.id);
      const started = Date.now();
      if (!cache || cache.profile !== p.id || (cache.retryAt !== undefined && started >= cache.retryAt)) {
        const r = await invoke<TopoRead>("snmp_topo_read", { target, gets: [], walks: [OID.ifName, OID.ifDescr] });
        cache = {
          profile: p.id,
          byPort: ifIndexByPort(ifNames(r)),
          hc: cache?.profile === p.id ? cache.hc : true,
          ...(walksComplete(r) ? {} : { retryAt: started + IF_INDEX_RETRY_MS }),
        };
        ifCache.current.set(n.id, cache);
      }
      const idx = new Map<string, number>();
      for (const k of ports) {
        const i = cache.byPort.get(k);
        if (i !== undefined) idx.set(k, i);
      }
      if (!idx.size) return new Map();
      const list = [...new Set(idx.values())];
      const read = async (hc: boolean) => {
        const r = await invoke<TopoRead>("snmp_topo_read", { target, gets: counterOids(list, hc), walks: [] });
        // Un GET con error (tooBig, genErr, authorizationError) no dice que falten los contadores de
        // 64 bits: se informa y no se cambia de columna. Antes el equipo quedaba en Counter32.
        if (r.getError) throw new Error(`GET de contadores: ${r.getError}`);
        return parseCounterGets(r.gets, list, hc, Date.now());
      };
      let res = await read(cache.hc);
      // Agente sin ifXTable (solo contadores de 32 bits): se pide la otra columna y se recuerda solo
      // si respondió. Si tampoco, los ifIndex guardados ya no existen en el agente (reinicio o
      // reindexación) y el índice se vuelve a leer en la próxima ronda.
      if (res.hcMissing) {
        res = await read(false);
        if (res.samples.size) cache.hc = false;
        else ifCache.current.delete(n.id);
      }
      const out = new Map<string, CounterSample>();
      for (const [k, i] of idx) {
        const s = res.samples.get(i);
        if (s) out.set(k, s);
      }
      return out;
    };

    const readCli = async (n: TopoNode, term: TerminalRef, ports: string[], state: Map<string, PortInfo>, note: { partial?: string }): Promise<Map<string, CounterSample>> => {
      const h = term.highlight && term.highlight !== "off" ? (vendorFor(term.highlight) as TopoVendor) : undefined;
      // Nunca a ciegas: sin prompt en pantalla (paginador, contraseña, comando del usuario a medias)
      // el primer carácter se pierde y el comando llega mutilado.
      if (!atPrompt(term.screen?.(6))) throw new BusyTab();
      const known = cliCmd.current.get(n.id);
      // Defensa en profundidad: solo se envían comandos de consulta.
      const cmds = (known ? [known] : trafficCommands(term.session.platform, h)).filter((c) => computeRisk(c) === "read");
      if (!cmds.length) throw new Error("sin comando de contadores para este fabricante");
      let out = "";
      for (const cmd of cmds) {
        const r = await runOnDeviceResult(term.connId, cmd, CLI_READ_SECS);
        out = r.output;
        // Salida cortada (plazo, tope de páginas): trae solo parte de las interfaces. Se usan las que
        // alcanzaron a llegar, se avisa y el comando no se recuerda como bueno.
        if (r.cut) {
          note.partial = `${cmd}: ${r.cut}`;
          break;
        }
        if (!isCliError(out)) {
          cliCmd.current.set(n.id, cmd);
          break;
        }
      }
      if (!note.partial && isCliError(out)) {
        cliCmd.current.delete(n.id);
        throw new Error(`el equipo no reconoce ${cmds.join(" ni ")}`);
      }
      // Con saltos, la pestaña puede estar ahora en otro equipo: sus contadores no son de este. El
      // prompt puede ser un alias del equipo (otro nombre que el del diagrama) o el que guardó la ruta.
      const who = promptName(out);
      if (who && !promptIsDevice(who, n.id, n.aliases, term.tabId ? ctx.current.routes?.[term.tabId] : undefined)) throw new Error(`su pestaña está ahora en ${who}`);
      const ts = Date.now();
      const counters = parseCliCounters(out);
      const res = new Map<string, CounterSample>();
      for (const k of ports) {
        const c = counters.get(k);
        if (!c) continue;
        res.set(k, { inOctets: c.inOctets, outOctets: c.outOctets, bits: 64, speed: c.speed, ...(c.speedApprox ? { approx: true } : {}), ts, src: "cli" });
        const info: PortInfo = {};
        if (c.status) info.status = c.status;
        if (c.duplex) info.duplex = c.duplex;
        if (c.crc) info.crc = c.crc;
        if (c.inErr) info.inErr = c.inErr;
        if (c.speed && !c.speedApprox) info.speed = String(Math.round(c.speed / 1e6));
        if (Object.keys(info).length) state.set(k, info);
      }
      return res;
    };

    const tick = async () => {
      if (document.visibilityState === "hidden") return;
      const { topo: t, profiles: ps, terminals: ts, cli, routes: tabRoutes } = ctx.current;
      const st: TrafficStatus = { snmp: [], cli: [], none: [], errors: [], busy: [], partial: [], last: Date.now() };
      const maxGap = maxSampleGapMs(opts.interval);
      const liveNow = new Map<string, Map<string, PortInfo>>();
      const jobs = t.nodes
        .filter((n) => n.explored)
        .map(async (n): Promise<[string, Map<string, PortRate>] | null> => {
          const ports = linkedPorts(t, n.id);
          if (!ports.length) return null;
          const p = profileFor(n, ps);
          const term = !p && cli ? terminalFor(n, ts, tabRoutes) : undefined;
          if (!p && !term) {
            st.none.push(n.name);
            return null;
          }
          (p ? st.snmp : st.cli).push(n.name);
          // Una lectura en curso por equipo: si la anterior no terminó, se espera a la siguiente ronda.
          if (inFlight.current.has(n.id)) {
            const keep = liveRef.current.get(n.id);
            if (keep) liveNow.set(n.id, keep);
            return [n.id, ratesRef.current.get(n.id) ?? new Map()];
          }
          inFlight.current.add(n.id);
          try {
            const state = new Map<string, PortInfo>();
            const note: { partial?: string } = {};
            const samples = p ? await readSnmp(n, p, ports) : await readCli(n, term!, ports, state, note);
            if (state.size) liveNow.set(n.id, state);
            const before = prev.current.get(n.id) ?? new Map<string, CounterSample>();
            // Lectura cortada: las interfaces que no alcanzaron a llegar conservan su lectura anterior y su
            // tasa (mientras no supere la antigüedad máxima) en vez de desaparecer del mapa.
            const kept = note.partial ? [...(ratesRef.current.get(n.id) ?? [])].filter(([, r]) => Date.now() - r.ts <= maxGap) : [];
            const out = new Map<string, PortRate>(kept);
            // Una lectura anterior demasiado antigua (la herramienta estuvo oculta) no se usa para la tasa.
            for (const [k, s] of samples) out.set(k, portRate(before.get(k), s, maxGap));
            prev.current.set(n.id, note.partial ? new Map([...before, ...samples]) : samples);
            if (note.partial) st.partial.push(`${n.name}: ${ports.filter((k) => !samples.has(k)).length} de ${ports.length} interfaces sin leer (${note.partial.slice(0, 120)})`);
            return [n.id, out];
          } catch (e) {
            if (e instanceof BusyTab) {
              st.busy.push(n.name);
              const keep = liveRef.current.get(n.id);
              if (keep) liveNow.set(n.id, keep);
              return [n.id, ratesRef.current.get(n.id) ?? new Map()];
            }
            st.errors.push(`${n.name}: ${String(e).slice(0, 160)}`);
            return null;
          } finally {
            inFlight.current.delete(n.id);
          }
        });
      const done = (await Promise.all(jobs)).filter((x): x is [string, Map<string, PortRate>] => !!x);
      if (!alive) return;
      ratesRef.current = new Map(done);
      setRates(ratesRef.current);
      setLive(liveNow);
      setStatus(st);
    };

    const start = () => {
      if (timer !== undefined || document.visibilityState === "hidden") return;
      void tick();
      timer = window.setInterval(() => void tick(), opts.interval * 1000);
    };
    const stop = () => {
      if (timer !== undefined) window.clearInterval(timer);
      timer = undefined;
    };
    // Ventana minimizada u oculta: no se consulta; al volver se retoma de inmediato.
    const onVisibility = () => (document.visibilityState === "hidden" ? stop() : start());
    document.addEventListener("visibilitychange", onVisibility);
    start();
    return () => {
      alive = false;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [opts.on, opts.cli, opts.interval, visible]);

  return { rates, status, prime, live };
}
