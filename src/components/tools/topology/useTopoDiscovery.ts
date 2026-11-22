import { Dispatch, MutableRefObject, SetStateAction, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { runOnDeviceResult } from "../../../lib/deviceRun";
import { plural } from "../../../lib/plural";
import { commandReader, pagerOffOnHop, partialNote } from "../../../lib/topoRun";
import { CameFrom, TabRoute, discoveryIdentity, newCameFrom, routeHere, routePosition, vendorOfPlatform } from "../../../lib/hopTab";
import { SnmpProfile, targetParams } from "../../../lib/snmp";
import { TopoScope, scopeNeighbors } from "../../../lib/topoInsights";
import {
  ARP_FALLBACK,
  LLDP_V2_FALLBACK,
  MAX_VLAN_READS,
  TopoRead,
  VLAN_FDB_WALKS,
  VLAN_LIST,
  VlanRead,
  activeVlans,
  needsArpFallback,
  needsLldpV2Fallback,
  needsVlanFdb,
  parseSnmpDiscovery,
  snmpDiscoveryPlan,
} from "../../../lib/topoSnmp";
import {
  ADDRESS_COMMANDS,
  CommandOutput,
  MAC_COMMANDS,
  MacPort,
  NEIGHBOR_COMMANDS,
  Neighbor,
  PORT_COMMANDS,
  PortInfo,
  ROUTING_COMMANDS,
  TopoVendor,
  Topology,
  buildMacPorts,
  completeProtos,
  deviceNode,
  isCliError,
  isIpv4,
  isIpv6,
  isStale,
  junosDetailCommand,
  knownAddrs,
  macPortsFromRows,
  mergeNeighbors,
  nameCollisions,
  nodeId,
  parseNeighbors,
  parseOwnAddresses,
  parsePortInfo,
  parseRoutingNeighbors,
  promptName,
  vendorFromPrompt,
} from "../../../lib/topology";
import type { TerminalRef } from "../FileManager";
import { MAX_DETAIL } from "./topoConst";
import { scopeNote } from "./topoText";

/**
 * Descubrimiento de vecinos, uno a la vez: por consola (comandos de consulta en la pestaña elegida, o
 * en la de un equipo de una ruta) o por SNMP con un perfil (GET y GETBULK, solo lectura). Mezcla lo
 * leído en el diagrama con el alcance elegido y deja el equipo descubierto seleccionado.
 */
export function useTopoDiscovery({
  term,
  vendor,
  setVendor,
  readPorts,
  routingOn,
  macOn,
  scope,
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
  prime,
}: {
  /** Pestaña elegida en "Equipo". */
  term: TerminalRef | undefined;
  vendor: TopoVendor;
  setVendor: (v: TopoVendor) => void;
  readPorts: boolean;
  /** Fuentes de descubrimiento activas: con la fuente apagada no se envía ningún comando. */
  routingOn: boolean;
  macOn: boolean;
  scope: TopoScope;
  /** Perfil SNMP elegido (v2c o v3). */
  profile: SnmpProfile | undefined;
  topo: Topology;
  /** Diagrama vigente: el descubrimiento tarda segundos y el alcance se evalúa contra el diagrama al terminar. */
  topoRef: MutableRefObject<Topology>;
  routesRef: MutableRefObject<Record<string, TabRoute>>;
  setRoutes: Dispatch<SetStateAction<Record<string, TabRoute>>>;
  cameFromRef: MutableRefObject<Map<string, CameFrom>>;
  onTopo: (t: Topology | ((t: Topology) => Topology)) => void;
  setSelected: (id: string | null) => void;
  setMsg: (m: string) => void;
  setConnId: (id: string) => void;
  liveRef: MutableRefObject<{ terminals: TerminalRef[] }>;
  tabBlock: (tabId?: string) => string | undefined;
  markDiscovering: (tabId: string | undefined, on: boolean) => void;
  /** Deja listo el índice de interfaces del equipo leído por SNMP para la lectura de tráfico. */
  prime: (id: string, profile: string, byPort: Map<string, number>) => void;
}) {
  const [busy, setBusy] = useState(false);
  /**
   * Un descubrimiento a la vez (consola o SNMP): dos en paralelo mezclaban sus comandos y salidas.
   * Ref además del estado: dos clics en el mismo render ven el valor al día.
   */
  const busyRef = useRef(false);

  /**
   * Lector de comandos de un descubrimiento en la conexión `conn` (ver topoRun.ts): prueba la sintaxis
   * alternativa si el equipo no reconoce el comando, pide la salida sin paginador donde se puede, quita
   * los restos del paginador (la primera línea de cada página llegaba como " --More-- <línea>" y los
   * parsers perdían vecinos, interfaces y rutas) y anota si una salida se cortó, para no tomarla por completa.
   */
  const readerFor = (conn: string, vendor: TopoVendor) =>
    commandReader(
      (cmd) => runOnDeviceResult(conn, cmd, 60, true, (text) => setMsg(`${text} (${cmd})`)),
      vendor,
      (cmd) => setMsg(`Ejecutando: ${cmd}`),
    );

  /** Cuántos enlaces quedan como "no vistos" que antes no lo estaban. */
  const staleNote = (before: Topology, after: Topology) => {
    const n = after.links.filter(isStale).length - before.links.filter(isStale).length;
    return n > 0
      ? `${plural(n, "enlace ya no se informa", "enlaces ya no se informan")}: ${n === 1 ? "queda" : "quedan"} en el mapa como no ${n === 1 ? "visto" : "vistos"} hasta que ${n === 1 ? "lo" : "los"} quites en "Requieren atención".`
      : "";
  };

  const selectedVendor = vendor;
  /** Descubre con la pestaña elegida en "Equipo" o con `over`: uno a la vez, y nunca en una pestaña ocupada. */
  const discover = async (over?: TerminalRef): Promise<void> => {
    const tab = over ?? term;
    if (!tab) return;
    if (busyRef.current) return setMsg("Ya hay un descubrimiento en curso: espera a que termine.");
    const why = tabBlock(tab.tabId);
    if (why) return setMsg(why);
    busyRef.current = true;
    setBusy(true);
    markDiscovering(tab.tabId, true);
    setMsg("");
    try {
      await discoverWith(tab, tab.connId);
    } finally {
      markDiscovering(tab.tabId, false);
      busyRef.current = false;
      setBusy(false);
    }
  };

  /** Comandos de descubrimiento en la conexión `conn` (la de la pestaña `tab`, fija durante todo el descubrimiento). */
  const discoverWith = async (tab: TerminalRef, conn: string, forced?: TopoVendor): Promise<void> => {
    const vendor = forced ?? selectedVendor;
    const reader = readerFor(conn, vendor);
    const run = reader.run;
    // El prompt a la vista antes de enviar nada: identifica al equipo si la primera salida se corta.
    const screen = tab.screen?.(4);
    const startPrompt = promptName((screen ?? "").replace(/\r/g, "").trimEnd());
    // Pestaña de salto de NetTerminal verificada en su último equipo: sin paginador en esa sesión vty
    // (una vez por salto; ver topoRun.ts). Fabricante por la plataforma del diagrama o, si no se
    // conoce, el elegido cuando el prompt tiene su forma. La pestaña del usuario no se toca.
    const hopRoute = tab.tabId ? routesRef.current[tab.tabId] : undefined;
    if (hopRoute?.steps.length && screen !== undefined && routePosition(hopRoute, screen) === hopRoute.steps.length) {
      const here = topoRef.current.nodes.find((x) => x.id === nodeId(routeHere(hopRoute)));
      const v = vendorOfPlatform(here?.platform) ?? (vendorFromPrompt(screen.replace(/\r/g, "")) === vendor ? vendor : undefined);
      const sent = await pagerOffOnHop(hopRoute, true, v, (cmd) => runOnDeviceResult(conn, cmd, 20));
      if (sent) setMsg(`Ejecutando: ${sent} (solo en esta sesión del salto)`);
    }
    try {
      const outputs: string[] = [];
      /** Salidas de los comandos de vecinos, para saber qué protocolo se leyó completo. */
      const nbOuts: { cmd: string; out: string; cut: boolean }[] = [];
      for (const cmd of NEIGHBOR_COMMANDS[vendor]) {
        const out = await run(cmd);
        nbOuts.push({ cmd, out, cut: reader.wasCut(cmd) });
        // Tras un salto el equipo puede ser de otra marca: su prompt lo dice y se repite con su sintaxis.
        if (!forced && !outputs.length) {
          const seen = vendorFromPrompt(out);
          if (seen && seen !== vendor) {
            setVendor(seen);
            return await discoverWith(tab, conn, seen);
          }
        }
        outputs.push(out);
      }
      // "% CDP is not enabled", "% LLDP is not enabled" o comando inexistente en todos.
      const l2Off = outputs.every(isCliError);
      let neighbors = parseNeighbors(vendor, outputs);
      // Junos: la tabla resumida no trae IP de gestión; se pide el detalle por interfaz.
      if (vendor === "juniper" && neighbors.some((n) => !n.ip)) {
        const ifaces = [...new Set(neighbors.filter((n) => !n.ip).map((n) => n.localPort))].slice(0, MAX_DETAIL);
        for (const iface of ifaces) {
          // La interfaz viene de la salida del equipo: solo se reenvía si es un nombre válido.
          const cmd = junosDetailCommand(iface);
          if (cmd) outputs.push(await run(cmd));
        }
        neighbors = parseNeighbors(vendor, outputs);
      }
      // Vecinos de ruteo: solo con la fuente activa (apagada no se envía ningún comando).
      let routing: Neighbor[] = [];
      let addrs: string[] | undefined;
      if (routingOn && ROUTING_COMMANDS[vendor].length) {
        const results: CommandOutput[] = [];
        for (const cmd of ROUTING_COMMANDS[vendor]) results.push({ cmd, out: await run(cmd) });
        const r = parseRoutingNeighbors(results);
        routing = r.neighbors;
        addrs = r.selfAddrs;
        outputs.push(...results.map((x) => x.out));
        // Direcciones propias: para reconocer este equipo cuando otro lo reporta por IP.
        const addrCmd = ADDRESS_COMMANDS[vendor];
        if (addrCmd && (routing.length || topo.nodes.some((n) => n.addrOnly))) {
          const out = await run(addrCmd);
          addrs = [...addrs, ...parseOwnAddresses([out])];
          outputs.push(out);
        }
      }
      let ports: Record<string, PortInfo> | undefined;
      if (readPorts && PORT_COMMANDS[vendor].length) {
        const portOuts: string[] = [];
        for (const cmd of PORT_COMMANDS[vendor]) portOuts.push(await run(cmd));
        ports = parsePortInfo(portOuts);
        outputs.push(...portOuts);
      }
      // Tablas MAC y ARP: solo con la fuente MAC/OUI activa (apagada no se envía ningún comando).
      // Los datos OUI se cargan recién aquí, en un módulo aparte, para no pesar en el arranque.
      let macs: Record<string, MacPort> | undefined;
      if (macOn && MAC_COMMANDS[vendor].length) {
        const results: CommandOutput[] = [];
        for (const cmd of MAC_COMMANDS[vendor]) results.push({ cmd, out: await run(cmd) });
        const { lookupOui } = await import("../../../lib/oui");
        // La tabla MAC es una foto que reemplaza a la anterior: una cortada no la reemplaza.
        macs = results.some((x) => reader.wasCut(x.cmd)) ? undefined : buildMacPorts(results, lookupOui);
        outputs.push(...results.map((x) => x.out));
      }
      // El prompt de la última salida que lo trae (una salida cortada no termina en el prompt).
      const seenName = [...outputs].reverse().map((o) => (o.trim() ? promptName(o) : null)).find(Boolean) ?? startPrompt ?? tab.name;
      // Dentro de un salto la IP es la del equipo de la ruta donde está la pestaña, no la de la sesión del PC.
      const route = tab.tabId ? routesRef.current[tab.tabId] : undefined;
      const who = discoveryIdentity({ name: tab.name, host: tab.host, session: tab.session, hasTabId: !!tab.tabId }, route, seenName);
      // Con el nombre del diagrama (el prompt puede traer otro dominio, guion bajo o mayúsculas): sin equipos duplicados.
      const { name, ip, upto } = who;
      // La ruta se ajusta a lo que dice el prompt (un "exit" tecleado a mano también cuenta).
      if (route && upto && who.at < route.steps.length) setRoutes((m) => ({ ...m, [tab.tabId!]: upto }));
      const before = topoRef.current;
      // El prompt puede no coincidir con el nombre que anunciaron los vecinos ("mx-edge-re0" y
      // "mx-edge.example.net"): si tiene su misma IP de gestión es ese equipo, no uno nuevo.
      const known = deviceNode(before, name, ip);
      const shown = known?.name ?? name;
      const selfId = known?.id ?? nodeId(name);
      const sc = scopeNeighbors(before, shown, [...neighbors, ...routing], scope);
      // Los equipos nuevos recuerdan desde dónde se descubrieron: saltar a ellos usa esa ruta más un paso.
      if (upto) {
        const fresh = newCameFrom({ ids: new Set(before.nodes.map((n) => n.id)), addrs: before.nodes.flatMap((n) => knownAddrs(n)) }, sc.kept, selfId, upto, cameFromRef.current);
        for (const [id, cf] of fresh) cameFromRef.current.set(id, cf);
        while (cameFromRef.current.size > 5000) cameFromRef.current.delete(cameFromRef.current.keys().next().value!);
      }
      // Solo de los protocolos leídos completos se da por retirado un enlace que el equipo dejó de
      // informar; `seen` lleva todo lo leído, antes del alcance (un vecino descartado también ocupa su puerto).
      const opts = { complete: completeProtos(vendor, nbOuts), seen: neighbors, now: Date.now() };
      const device = { name, ip, ports, addrs, macs };
      onTopo((t) => mergeNeighbors(t, device, sc.kept, opts));
      setSelected(selfId);
      const stale = staleNote(before, mergeNeighbors(before, device, sc.kept, opts));
      const collisions = nameCollisions(before, neighbors);
      const parts = [
        `${plural(neighbors.length, "vecino", "vecinos")} CDP/LLDP`,
        routingOn && ROUTING_COMMANDS[vendor].length ? `${routing.length} de ruteo` : "",
        macs ? `${Object.keys(macs).length} puertos con MAC` : "",
        scopeNote(sc.skipped),
      ].filter(Boolean);
      const l2Hint =
        vendor === "fortinet"
          ? "Habilita la recepción LLDP (set lldp-reception enable) en la interfaz."
          : l2Off
            ? "CDP/LLDP no está habilitado en el equipo."
            : "";
      const routingHint =
        !neighbors.length && !routing.length && !routingOn && ROUTING_COMMANDS[vendor].length
          ? 'Activa "Vecinos de ruteo" en Fuentes de descubrimiento o agrega los enlaces a mano.'
          : "";
      // Vecinos descartados por el alcance (profundidad, redes, teléfonos): se dice cómo traerlos, no queda en silencio.
      const scopeHint = sc.skipped.length ? 'Cambia el "Alcance del descubrimiento" (panel) y vuelve a descubrir para traerlos.' : "";
      const aliasNote = known && known.id !== nodeId(name) && !known.aliases?.includes(nodeId(name)) ? `El prompt dice ${name}: se tomó como ${known.name} (misma IP de gestión).` : "";
      const collisionNote = collisions.length ? `Aviso: ${collisions.join("; ")}: se dibujan como un solo equipo.` : "";
      // Una lectura cortada va primero y a la vista: lo leído es parcial.
      setMsg([partialNote(reader), `${shown}: ${parts.join(", ")}.`, aliasNote, stale, collisionNote, neighbors.length || reader.cut ? "" : l2Hint, routingHint, scopeHint].filter(Boolean).join(" "));
    } catch (e) {
      setMsg(String(e));
    }
  };

  /** "Descubrir vecinos de X": con la pestaña que está en ese equipo (la deja elegida en "Equipo"). */
  const discoverFromTab = (tabId: string) => {
    const t = liveRef.current.terminals.find((x) => x.tabId === tabId);
    if (!t) return setMsg("Esa pestaña ya no está conectada.");
    if (busyRef.current) return setMsg("Ya hay un descubrimiento en curso: espera a que termine.");
    const why = tabBlock(tabId);
    if (why) return setMsg(why);
    setConnId(t.connId);
    void discover(t);
  };

  /**
   * Descubrimiento con un perfil SNMP: solo lectura (GET y GETBULK de las tablas permitidas en el
   * backend), con las mismas fuentes activas que por consola. Los secretos salen de la bóveda.
   */
  const discoverSnmp = async () => {
    const p = profile;
    if (!p) return;
    if (!p.saved) {
      setMsg(`El perfil "${p.name || p.host}" no tiene secretos guardados: guárdalos en Herramientas › SNMP (bóveda cifrada).`);
      return;
    }
    if (busyRef.current) return setMsg("Ya hay un descubrimiento en curso: espera a que termine.");
    busyRef.current = true;
    setBusy(true);
    setMsg(`Leyendo por SNMP ${p.host} (LLDP, CDP${routingOn ? ", OSPF, BGP" : ""}${macOn ? ", tabla MAC y ARP" : ""})…`);
    try {
      const opts = { routing: routingOn, mac: macOn, ports: readPorts };
      const plan = snmpDiscoveryPlan(opts);
      const target = targetParams(p, { community: "", authPass: "", privPass: "" });
      let r = await invoke<TopoRead>("snmp_topo_read", { target, gets: plan.gets, walks: plan.walks });
      // Alternativas en lecturas aparte: ARP antiguo y LLDP-V2-MIB (802.1AB-2009) si la de 2005 vino vacía.
      const extra = [...(opts.mac && needsArpFallback(r) ? ARP_FALLBACK : []), ...(needsLldpV2Fallback(r) ? LLDP_V2_FALLBACK : [])];
      if (extra.length) {
        const r2 = await invoke<TopoRead>("snmp_topo_read", { target, gets: [], walks: extra });
        r = { ...r, walks: [...r.walks, ...r2.walks], ms: r.ms + r2.ms };
      }
      // Cisco: la tabla MAC de BRIDGE-MIB es por VLAN (community@vlan en v2c, contexto vlan-N en v3).
      const vlanReads: VlanRead[] = [];
      let vlanNote = "";
      if (opts.mac && needsVlanFdb(r)) {
        const list = await invoke<TopoRead>("snmp_topo_read", { target, gets: [], walks: VLAN_LIST });
        r = { ...r, walks: [...r.walks, ...list.walks], ms: r.ms + list.ms };
        const { vlans, total } = activeVlans(list);
        for (const [i, vlan] of vlans.entries()) {
          setMsg(`Leyendo la tabla MAC de la VLAN ${vlan} (${i + 1} de ${vlans.length})…`);
          try {
            const read = await invoke<TopoRead>("snmp_topo_read", { target, gets: [], walks: VLAN_FDB_WALKS, vlan });
            vlanReads.push({ vlan, read });
            r = { ...r, ms: r.ms + read.ms };
          } catch (e) {
            vlanNote = `VLAN ${vlan}: ${String(e)}`;
          }
        }
        if (total > vlans.length) vlanNote = `Tabla MAC: se leyeron ${vlans.length} de ${total} VLAN (tope ${MAX_VLAN_READS}).`;
      }
      const d = parseSnmpDiscovery(r, opts, vlanReads);
      if (vlanNote) d.notes.push(vlanNote);
      let macs: Record<string, MacPort> | undefined;
      if (opts.mac) {
        const { lookupOui } = await import("../../../lib/oui");
        macs = macPortsFromRows(d.macRows, d.arpRows, lookupOui);
      }
      const host = p.host.trim();
      const name = d.name ?? (p.name.trim() || host);
      const before = topoRef.current;
      const ip = isIpv4(host) || isIpv6(host) ? host : undefined;
      // Mismo criterio que por consola: sysName puede no coincidir con el nombre que anunciaron los vecinos.
      const known = deviceNode(before, name, ip);
      const selfId = known?.id ?? nodeId(name);
      const sc = scopeNeighbors(before, known?.name ?? name, [...d.neighbors, ...d.routing], scope);
      const mergeOpts = { complete: d.complete, seen: d.neighbors, now: Date.now() };
      const device = { name, ip, ports: d.ports, addrs: d.addrs, macs };
      onTopo((t) => mergeNeighbors(t, device, sc.kept, mergeOpts));
      setSelected(selfId);
      // El índice de interfaces solo se guarda para el tráfico si ifName e ifDescr vinieron completas.
      if (d.ifIndexComplete) prime(selfId, p.id, d.ifIndex);
      const stale = staleNote(before, mergeNeighbors(before, device, sc.kept, mergeOpts));
      const collisions = nameCollisions(before, d.neighbors);
      if (collisions.length) d.notes.push(`${collisions.join("; ")}: se dibujan como un solo equipo`);
      const parts = [
        `${plural(d.neighbors.length, "vecino", "vecinos")} CDP/LLDP`,
        routingOn ? `${d.routing.length} de ruteo` : "",
        macs ? `${Object.keys(macs).length} puertos con MAC` : "",
        scopeNote(sc.skipped),
      ].filter(Boolean);
      const l2 = d.l2Empty
        ? "LLDP y CDP vacíos por SNMP: el protocolo está apagado en el equipo (o su agente no publica LLDP-MIB, LLDP-V2-MIB ni CISCO-CDP-MIB)."
        : "";
      const notes = d.notes.length ? `Avisos: ${d.notes.slice(0, 3).join("; ")}${d.notes.length > 3 ? ` y ${d.notes.length - 3} más` : ""}.` : "";
      setMsg([`${known?.name ?? name}: ${parts.join(", ")} por SNMP en ${(r.ms / 1000).toFixed(1)} s.`, stale, l2, notes].filter(Boolean).join(" "));
    } catch (e) {
      setMsg(`SNMP: ${String(e)}`);
    }
    busyRef.current = false;
    setBusy(false);
  };

  return { busy, discover, discoverFromTab, discoverSnmp };
}
