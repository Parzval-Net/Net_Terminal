import { Dispatch, MutableRefObject, SetStateAction, useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Route, SquareTerminal } from "lucide-react";
import { atPrompt } from "../../../lib/cliText";
import { CredStatus, credStatus } from "../../../lib/credentials";
import {
  CameFrom,
  HopAction,
  HopWaiting,
  OpenChoice,
  PROMPT_WAIT_MS,
  PlanTab,
  TabRoute,
  classifyHopScreen,
  hopCredResult,
  hopTabSession,
  hopWaiting,
  isNxos,
  isReplayable,
  newHopChain,
  planNode,
  planOpen,
  reconcileRoute,
  routeNames,
  routeTitle,
  routeTooltip,
  setRunningHops,
  stepHop,
  tabAtDevice,
  tabDevice,
  truncateRoute,
  vendorOfPlatform,
} from "../../../lib/hopTab";
import { HopCredInfo, hopCredKey, isIpLiteral } from "../../../lib/hopCred";
import { TopoNode, TopoVendor, Topology, hopCommand, knownAddrs, nodeId } from "../../../lib/topology";
import type { Session } from "../../../types";
import type { MenuItem } from "../../tabMenu";
import type { TabBrief, TerminalRef } from "../FileManager";
import type { HopView } from "../TopoConnect";
import type { TopoUi } from "./topoUi";
import type { HopRun, KeyAsk } from "./topoTypes";

const HOP_BUSY = "Esa pestaña tiene un salto en curso: espera a que llegue o falle.";
const DISCOVERING = "Esa pestaña está descubriendo vecinos: espera a que termine.";
const NOT_AT_PROMPT = "La pestaña no está en su prompt (login, contraseña, paginador o un comando en curso): termina ahí primero.";

/**
 * Saltos entre equipos y "Abrir terminal": la ruta de cada pestaña, las credenciales guardadas de los
 * vecinos, el avance de cada salto (lee la pantalla de su pestaña y envía, pregunta, escribe
 * credenciales o avisa), qué pestañas están ocupadas y el plan de "Abrir terminal" de un equipo.
 */
export function useTopoHops({
  tabs,
  sessions,
  term,
  visible,
  topoRef,
  pivot,
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
}: {
  terminals: TerminalRef[];
  tabs: TabBrief[];
  sessions: Session[];
  /** Pestaña elegida en "Equipo". */
  term: TerminalRef | undefined;
  visible: boolean;
  topoRef: MutableRefObject<Topology>;
  /** Equipos marcados como no accesibles directo desde este PC (TopoUi.pivot). */
  pivot: TopoUi["pivot"];
  setUi: Dispatch<SetStateAction<TopoUi>>;
  vendor: TopoVendor;
  proto: "ssh" | "telnet";
  /** Pestañas y acciones vigentes de este render (para los temporizadores y los diálogos). */
  liveRef: MutableRefObject<{ terminals: TerminalRef[]; tabs: TabBrief[]; onFocusTab: (tabId: string) => void }>;
  /** Sesión guardada que corresponde al equipo (misma IP o mismo nombre). */
  savedFor: (n: TopoNode) => Session | undefined;
  /** Abre una conexión directa al equipo (sesión guardada o SSH/Telnet por su IP). */
  follow: (n: TopoNode) => void;
  onOpenSession: (s: Session, opts?: { background?: boolean; title?: string }) => string | void;
  onFocusTab: (tabId: string) => void;
  onReconnectTab: (tabId: string) => void;
  setMsg: (m: string) => void;
  setConnId: (id: string) => void;
}) {
  /**
   * Ruta de cada pestaña abierta por un salto (por id de pestaña): el pivote y los saltos hasta el
   * equipo donde está. Cada equipo de la ruta tiene su propia pestaña, así que el tráfico de toda la
   * ruta se lee por consola, cada uno por la suya. No se persiste: las pestañas tampoco.
   */
  const [routes, setRoutes] = useState<Record<string, TabRoute>>({});
  const routesRef = useRef(routes);
  routesRef.current = routes;
  /**
   * De dónde salió cada equipo descubierto (id): el equipo que lo descubrió y la ruta de la pestaña que estaba en él.
   * "Abrir terminal" salta con esa ruta más un paso, no con otra por el diagrama. No se persiste (las pestañas tampoco).
   */
  const cameFromRef = useRef(new Map<string, CameFrom>());
  const [hopUser, setHopUser] = useState("");
  /** Credencial del pivote en esta ruta: desmarcada por defecto y por cada salto (no se recuerda). */
  const [usePivotCred, setUsePivotCred] = useState(false);
  /** No usar las contraseñas guardadas de los vecinos en este salto (se desmarca solo tras cada salto). */
  const [skipSavedCred, setSkipSavedCred] = useState(false);
  /** Vecinos con contraseña guardada (IP|usuario) y estado de la bóveda. Solo claves: nunca contraseñas. */
  const [savedHops, setSavedHops] = useState<Set<string>>(new Set());
  const [vault, setVault] = useState<CredStatus | null>(null);
  const refreshCreds = useCallback(() => {
    credStatus().then(setVault).catch(() => setVault(null));
    invoke<HopCredInfo[]>("hop_cred_list")
      .then((l) => setSavedHops(new Set(l.map((x) => hopCredKey(x.ip, x.user)))))
      .catch(() => setSavedHops(new Set()));
  }, []);
  // Al volver a la vista y ante cada cambio de la bóveda o de las contraseñas de vecinos (desbloquear en
  // Ajustes después de abrir Topología, guardar o borrar una): sin esto se usaba el estado del montaje.
  useEffect(() => {
    if (visible) refreshCreds();
  }, [visible, refreshCreds]);
  useEffect(() => {
    const un = listen("creds-changed", () => refreshCreds());
    return () => void un.then((f) => f()).catch(() => {});
  }, [refreshCreds]);
  /** Contraseñas tecleadas por el usuario en un salto: se ofrece guardarlas (el campo oculto las pide aparte). */
  const [saveOffers, setSaveOffers] = useState<{ to: string; ip: string; user: string; update?: boolean }[]>([]);
  const [pwDialog, setPwDialog] = useState<{ to: string; ip: string; user: string; update?: boolean } | null>(null);
  /** Saltos en curso por pestaña (una pestaña, un salto): cada uno espera el prompt antes de enviar el comando. */
  const hopRuns = useRef(new Map<string, HopRun>());
  const [hopRunning, setHopRunning] = useState<string[]>([]);
  /** Pestañas que están descubriendo vecinos ahora (se les envían comandos): ni un salto ni "exit" en esa pestaña hasta que termine. */
  const discovering = useRef(new Set<string>());
  const [discoveringTabs, setDiscoveringTabs] = useState<string[]>([]);
  const markDiscovering = (tabId: string | undefined, on: boolean) => {
    if (!tabId) return;
    if (on) discovering.current.add(tabId);
    else discovering.current.delete(tabId);
    setDiscoveringTabs([...discovering.current]);
  };
  /** Lo que se muestra de cada salto (en curso o terminado hace poco) en el panel de Topología. */
  const [hopViews, setHopViews] = useState<HopView[]>([]);
  /** Contraseñas guardadas o del pivote que se rechazaron: se avisa y las escribe el usuario. */
  const [credAlerts, setCredAlerts] = useState<{ tabId: string; to: string; ip: string; user: string; source: "saved" | "pivot" }[]>([]);

  const termRoute = term?.tabId ? routes[term.tabId] : undefined;
  const syncRuns = () => {
    setHopRunning([...hopRuns.current.keys()]);
    // Para el aviso al cerrar Herramientas (App): cerrarla corta los saltos en curso.
    setRunningHops([...hopRuns.current.values()].map((r) => r.route.steps[r.route.steps.length - 1]?.name ?? r.route.origin));
  };
  useEffect(() => () => setRunningHops([]), []);

  /** Pestañas que no muestran su prompt (login, paginador, comando en curso): no se les envía nada. */
  const [notReady, setNotReady] = useState<string[]>([]);
  useEffect(() => {
    if (!visible) return;
    const check = () => {
      const ids = liveRef.current.terminals.filter((t) => t.tabId && t.screen && !atPrompt(t.screen(6))).map((t) => t.tabId!);
      setNotReady((cur) => (cur.join("|") === ids.join("|") ? cur : ids));
    };
    check();
    const timer = window.setInterval(check, 1000);
    return () => window.clearInterval(timer);
  }, [visible]);
  /** Por qué no se puede enviar nada ahora a esa pestaña (descubrir, "exit"), leyendo su pantalla en este momento. */
  const tabBlock = (tabId?: string): string | undefined => {
    if (!tabId) return undefined;
    if (hopRuns.current.has(tabId)) return HOP_BUSY;
    if (discovering.current.has(tabId)) return DISCOVERING;
    const t = liveRef.current.terminals.find((x) => x.tabId === tabId);
    return t?.screen && !atPrompt(t.screen(6)) ? NOT_AT_PROMPT : undefined;
  };
  /** Por qué no se puede enviar nada ahora a esa pestaña (salto en curso, descubriendo, sin prompt), según el estado de este render. */
  const tabWhy = (tabId?: string): string | undefined =>
    !tabId ? undefined : hopRunning.includes(tabId) ? HOP_BUSY : discoveringTabs.includes(tabId) ? DISCOVERING : notReady.includes(tabId) ? NOT_AT_PROMPT : undefined;

  /** Preguntas de llave de los saltos, de a una: dos saltos que la piden a la vez ya no se pisan. */
  const [keyAsks, setKeyAsks] = useState<KeyAsk[]>([]);

  /** Pestaña abierta (o caída) de la sesión con la IP del equipo: sirve de pivote candidato por IP. */
  const addrsOf = (id: string) => {
    const n = topoRef.current.nodes.find((x) => x.id === id);
    return n ? knownAddrs(n) : [];
  };

  /**
   * El backend solo escribe contraseñas en una pestaña que es copia de una sesión guardada (la del pivote):
   * con una conexión rápida sin guardar no se promete nada.
   */
  const isSavedSession = (s: Session) => !!s.id && sessions.some((x) => x.id === s.id);
  const pivotHasPassword = (s: Session) => isSavedSession(s) && sessions.find((x) => x.id === s.id)?.save_password === true;
  /** Credencial a escribir en el "Password:" de un paso: la guardada del vecino o, si se pidió, la del pivote. */
  const credFor = (st: { ip: string; user?: string }, pivotSaved: boolean, pivotOk: boolean): "saved" | "pivot" | undefined => {
    if (!pivotSaved) return undefined;
    if (!skipSavedCred && st.user && savedHops.has(hopCredKey(st.ip, st.user))) return "saved";
    if (usePivotCred && pivotOk) return "pivot";
    return undefined;
  };

  /**
   * Salto encadenado. Sin `tab`, abre una pestaña NUEVA en segundo plano que reproduce la ruta completa
   * (conecta la sesión del pivote, salta a h1, a h2, …, hasta el destino): las pestañas que ya estaban en
   * cada equipo de la ruta quedan intactas. Con `tab`, sigue en esa pestaña desde donde está.
   * Topología sigue a la vista: el avance se ve en el panel y el usuario va a la pestaña cuando quiera.
   */
  const runHop = (full: TabRoute, tab?: TerminalRef) => {
    if (!full.steps.length) return;
    const target = full.steps[full.steps.length - 1];
    // Un salto en la misma pestaña le escribiría en medio de un descubrimiento de vecinos.
    if (tab?.tabId && discovering.current.has(tab.tabId)) return setMsg(DISCOVERING);
    if ([...hopRuns.current.values()].some((r) => r.route.steps.length && r.route.steps[r.route.steps.length - 1].ip === target.ip && r.job.phase !== "done")) {
      setMsg(`Ya hay un salto a ${target.name} en curso.`);
      return;
    }
    const pivotSaved = isSavedSession(full.session);
    const pivotOk = full.session.save_password === true && pivotHasPassword(full.session);
    const base = tab ? Math.max(0, full.steps.length - 1) : 0;
    const steps = full.steps.slice(base).map((st) => ({ cmd: st.cmd, to: st.prompt ?? st.name, ip: st.ip, user: st.user, cred: credFor(st, pivotSaved, pivotOk) }));
    let tabId = tab?.tabId;
    let pivot: string | undefined;
    if (tab) {
      const seen = classifyHopScreen(tab.screen?.(8) ?? "");
      pivot = seen.kind === "prompt" ? seen.name : undefined;
      if (!tabId) return;
      setRoutes((m) => ({ ...m, [tabId!]: m[tabId!] ?? truncateRoute(full, base) }));
    } else {
      pivot = full.origin;
      // Nombre de la pestaña "N vía M"; el tooltip trae la ruta completa (nombre de la sesión).
      const id = onOpenSession(hopTabSession(full.session, routeTooltip(full).slice(0, 120)), { background: true, title: routeTitle(full) });
      if (!id) {
        setMsg("No se pudo abrir la pestaña del salto.");
        return;
      }
      tabId = id;
      setRoutes((m) => ({ ...m, [id]: truncateRoute(full, 0) }));
    }
    const job = newHopChain({ steps, pivot, now: Date.now() });
    hopRuns.current.set(tabId, { tabId, job, route: full, base, pivotCred: pivotOk, openedAt: Date.now(), inplace: !!tab });
    syncRuns();
    // Las casillas de credencial valen para este salto: no se recuerdan.
    setUsePivotCred(false);
    setSkipSavedCred(false);
    const used = steps.filter((s) => s.cred).length;
    setMsg(
      tab
        ? `Esperando el prompt de ${pivot ?? "la pestaña"} para saltar a ${target.name}.`
        : `Abriendo ${full.steps.length > 1 ? "la ruta" : "el salto"} ${routeTooltip(full)} en una pestaña nueva, en segundo plano.${used ? ` Se escribirá la contraseña de ${used === 1 ? "1 equipo" : `${used} equipos`} (un intento cada uno).` : ""}`,
    );
  };

  // Avance de los saltos: lee la pantalla de cada pestaña y envía, pregunta, escribe credenciales o avisa.
  useEffect(() => {
    if (!hopRunning.length) return;
    const setView = (r: HopRun, patch: Partial<HopView>) =>
      setHopViews((vs) => {
        const cur = vs.find((v) => v.tabId === r.tabId);
        const next: HopView = {
          tabId: r.tabId,
          target: r.route.steps[r.route.steps.length - 1]?.name ?? "",
          route: routeNames(r.route),
          step: r.job.index + 1,
          total: r.job.steps.length,
          waiting: "prompt",
          status: "running",
          text: "",
          ...cur,
          ...patch,
        };
        // Lo que se esperaba ya cambió: el aviso anterior (p. ej. "escribe la contraseña") deja de valer.
        if (cur && patch.waiting && patch.waiting !== cur.waiting && patch.text === undefined) next.text = "";
        return cur && JSON.stringify(cur) === JSON.stringify(next) ? vs : [...vs.filter((v) => v.tabId !== r.tabId), next];
      });
    const finish = (r: HopRun, view: Partial<HopView>) => {
      hopRuns.current.delete(r.tabId);
      syncRuns();
      setKeyAsks((l) => (l.some((k) => k.tabId === r.tabId) ? l.filter((k) => k.tabId !== r.tabId) : l));
      setView(r, { ...view, until: Date.now() + (view.status === "failed" ? 60_000 : 20_000) });
    };
    const reached = (r: HopRun, a: { step: number; at: string }) =>
      setRoutes((m) => {
        const upto = truncateRoute(r.route, r.base + a.step + 1);
        // Mismo equipo (dominio, mayúsculas): se registra con lo que mostró su prompt. Si el prompt no coincide con el
        // diagrama (guion bajo, otro hostname), el nombre del diagrama se mantiene y el prompt queda como alias.
        const steps = upto.steps.map((st, i) =>
          i !== upto.steps.length - 1 ? st : nodeId(a.at) === nodeId(st.name) ? { ...st, name: a.at, prompt: undefined } : { ...st, prompt: a.at },
        );
        return { ...m, [r.tabId]: { ...upto, steps } };
      });
    const apply = (r: HopRun, t: TerminalRef, a: HopAction) => {
      const id = t.connId;
      const st = r.job.steps[(a as { step?: number }).step ?? r.job.index];
      if (a.kind === "send") {
        // Antes del salto se desarma el autocompletado de la conexión (la pestaña es copia de la sesión del
        // pivote): si el pivote entró con llave, el primer "Password:" sería el del vecino y recibiría la del
        // pivote. Esa solo llega al vecino por hop_type_password, con la casilla marcada. Sin desarme no se envía.
        invoke("disarm_autofill", { conn: id })
          .then(() => invoke("write", { id, data: a.data }))
          .catch((e) => setMsg(String(e)));
        setMsg(`Enviado "${r.job.cmd}" en la pestaña "${t.name}"${r.job.steps.length > 1 ? ` (paso ${a.step + 1} de ${r.job.steps.length})` : ""}: ${st?.cred ? "se escribe la contraseña sola" : `autentícate en ${r.job.neighbor} si lo pide`}.`);
        // El pivote se registra con el nombre que mostró su prompt.
        if (a.step === 0 && !r.inplace && a.from && nodeId(a.from) !== nodeId(r.route.origin))
          setRoutes((m) => (m[r.tabId] ? { ...m, [r.tabId]: { ...m[r.tabId], origin: a.from } } : m));
      } else if (a.kind === "notify") {
        setMsg(a.text);
        setView(r, { text: a.text });
      } else if (a.kind === "ask") {
        const ask = {
          tabId: r.tabId,
          conn: id,
          cmd: r.job.cmd,
          title: `¿Aceptar la llave de ${r.job.neighbor}?`,
          message: `${a.line}\n\n${r.job.pivot ?? "El equipo de partida"} no conocía a ${r.job.neighbor} (${st?.ip ?? ""}). Compara la huella en la pestaña antes de aceptar. Si ya contestaste ahí, cancela.`,
        };
        // En cola: con dos saltos pidiendo la llave a la vez, cada pregunta se responde en su pestaña.
        setKeyAsks((l) => [...l.filter((k) => k.tabId !== r.tabId), ask]);
      }
      else if (a.kind === "fill") {
        // La contraseña la escribe el backend directo en la conexión (nunca pasa por aquí) y solo con el pedido a la vista.
        if (!st?.ip) {
          r.job = hopCredResult(r.job, false);
          return;
        }
        invoke("hop_type_password", {
          conn: id,
          source: a.source,
          pivotId: r.route.session.id || null,
          ip: st.ip,
          user: st.user ?? "",
          cmd: r.job.cmd,
          token: `${a.token}|${r.tabId}`,
        })
          .then(() => {
            r.job = hopCredResult(r.job, true);
            refreshCreds();
          })
          .catch((e) => {
            r.job = hopCredResult(r.job, false);
            setMsg(`No se escribió la contraseña de ${r.job.neighbor}: ${String(e)} Escríbela en la pestaña.`);
          });
      } else if (a.kind === "cred-rejected") {
        setMsg(a.text);
        setView(r, { text: a.text });
        if (st?.ip) setCredAlerts((l) => [...l.filter((x) => !(x.tabId === r.tabId && x.ip === st.ip)), { tabId: r.tabId, to: r.job.neighbor, ip: st.ip!, user: st.user ?? "", source: a.source }]);
      } else if (a.kind === "step") {
        reached(r, a);
        setView(r, { step: a.step + 2, text: `${a.at} alcanzado.` });
      } else if (a.kind === "done") {
        reached(r, { step: r.job.steps.length - 1, at: a.at });
        const last = r.route.steps[r.route.steps.length - 1];
        // Ya se llegó a este equipo saltando: la próxima vez "Abrir terminal" va por la ruta.
        if (last) setUi((u) => ({ ...u, pivot: { ...u.pivot, [nodeId(last.name)]: true, [nodeId(a.at)]: true } }));
        setConnId(id);
        const note = a.mismatch ? ` ${a.mismatch}` : "";
        setMsg(`${a.at} conectado en la pestaña "${t.name}" y elegido en "Equipo": pulsa "Descubrir vecinos" para seguir la ruta.${note}`);
        if (a.manual.length)
          setSaveOffers((l) => [...l.filter((o) => !a.manual.some((m) => m.ip === o.ip && m.user === o.user)), ...a.manual.map((m) => ({ ...m, update: savedHops.has(hopCredKey(m.ip, m.user)) }))]);
        finish(r, { status: "done", waiting: "done", text: `${a.at} conectado${note}` });
      } else if (a.kind === "fail") {
        // El salto no llegó: la pestaña queda en el último equipo alcanzado (los pasos anteriores ya están en su ruta).
        t.notice?.(a.reason);
        setMsg(a.reason);
        finish(r, { status: "failed", waiting: "failed", text: a.reason });
      }
    };
    const timer = window.setInterval(() => {
      const now = Date.now();
      for (const r of [...hopRuns.current.values()]) {
        const { terminals: terms, tabs: briefs } = liveRef.current;
        const t = terms.find((x) => x.tabId === r.tabId);
        if (!t) {
          const brief = briefs.find((b) => b.tabId === r.tabId);
          const to = r.route.steps[r.route.steps.length - 1]?.name ?? "";
          if (!brief) {
            setMsg(`La pestaña del salto a ${to} se cerró antes de terminar.`);
            finish(r, { status: "failed", waiting: "failed", text: "La pestaña se cerró antes de terminar el salto." });
          } else if (brief.status === "closed" || now - r.openedAt > 60_000) {
            const why = `La pestaña hacia ${r.route.origin} no llegó a conectar: no se envió el salto a ${to}.`;
            setMsg(why);
            finish(r, { status: "failed", waiting: "failed", text: why });
          } else setView(r, { waiting: "opening" as HopWaiting, text: `Conectando con ${r.route.origin}…` });
          continue;
        }
        // Sin acceso a la pantalla no se puede seguir el salto: se corta pasado el mismo plazo del prompt.
        if (!t.screen) {
          if (now - r.job.startedAt > PROMPT_WAIT_MS) {
            setMsg(`No se pudo leer la pestaña de ${r.route.steps[r.route.steps.length - 1]?.name}: se canceló el salto.`);
            finish(r, { status: "failed", waiting: "failed", text: "No se pudo leer la pestaña." });
          }
          continue;
        }
        const screen = t.screen(30);
        const step = stepHop(r.job, screen, now);
        r.job = step.job;
        for (const a of step.actions) apply(r, t, a);
        if (hopRuns.current.has(r.tabId)) {
          const waiting = hopWaiting(r.job, screen);
          setView(r, { waiting, step: r.job.index + 1, total: r.job.steps.length });
          // Contestada en la pestaña (o ya no se pregunta): su diálogo pendiente sobra.
          if (waiting !== "hostkey") setKeyAsks((l) => (l.some((k) => k.tabId === r.tabId) ? l.filter((k) => k.tabId !== r.tabId) : l));
        }
      }
      // Los terminados se quitan solos pasado su tiempo.
      setHopViews((vs) => (vs.some((v) => v.until && v.until < now) ? vs.filter((v) => !v.until || v.until >= now) : vs));
    }, 400);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hopRunning.length]);

  // Las pestañas cerradas dejan de tener ruta; las demás se ajustan a lo que dice su prompt (un "exit" a mano).
  useEffect(() => {
    const ids = new Set(tabs.map((b) => b.tabId));
    setRoutes((m) => (Object.keys(m).some((k) => !ids.has(k)) ? Object.fromEntries(Object.entries(m).filter(([k]) => ids.has(k))) : m));
  }, [tabs]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      const cur = routesRef.current;
      let changed: Record<string, TabRoute> | null = null;
      for (const t of liveRef.current.terminals) {
        const r = t.tabId ? cur[t.tabId] : undefined;
        if (!r || !t.screen || hopRuns.current.has(t.tabId!)) continue;
        const fixed = reconcileRoute(r, t.screen(8));
        if (fixed !== r) (changed ??= { ...cur })[t.tabId!] = fixed;
      }
      if (changed) setRoutes(changed);
    }, 3000);
    return () => window.clearInterval(timer);
  }, []);

  // Los avisos de saltos terminados se quitan solos (los que fallaron duran más).
  useEffect(() => {
    const next = Math.min(...hopViews.filter((v) => v.until).map((v) => v.until!));
    if (!Number.isFinite(next)) return;
    const t = window.setTimeout(() => setHopViews((vs) => vs.filter((v) => !v.until || v.until > Date.now())), Math.max(500, next - Date.now()));
    return () => window.clearTimeout(t);
  }, [hopViews]);

  /** Vuelve al equipo anterior de la ruta (exit en la misma pestaña). */
  const hopBack = () => {
    if (!term?.tabId || !termRoute?.steps.length) return;
    const why = tabBlock(term.tabId);
    if (why) return setMsg(why);
    invoke("write", { id: term.connId, data: "exit\r" }).catch((e) => setMsg(String(e)));
    const tabId = term.tabId;
    setRoutes((m) => ({ ...m, [tabId]: truncateRoute(termRoute, termRoute.steps.length - 1) }));
    const names = routeNames(termRoute);
    setMsg(`Enviado "exit": esa pestaña vuelve a ${names[names.length - 2]}.`);
  };

  // ---------- Abrir terminal: un botón que hace lo correcto ----------

  /** Equipo desde el que se arma cada comando de salto: su fabricante (por plataforma) y, si no se sabe, el elegido arriba. */
  const cmdFor = (from: { platform?: string } | undefined, to: { ip?: string }, session: Session) => {
    if (!to.ip) return null;
    const v = vendorOfPlatform(from?.platform) ?? vendor;
    const user = (hopUser || session.username || "").trim();
    const cmd = hopCommand(v, isNxos(from?.platform) ? "nxos" : session.platform, proto, user, to.ip);
    return cmd ? { cmd, user: proto === "ssh" && v !== "huawei" ? user : "" } : null;
  };

  /** Plan de "Abrir terminal" para un equipo con el estado de este momento (pestañas, rutas, sesiones guardadas). */
  const computePlan = (n: TopoNode) => {
    const { terminals: terms, tabs: briefs } = liveRef.current;
    const rts = routesRef.current;
    const planTabs: PlanTab[] = [];
    for (const t of terms) {
      if (!t.tabId) continue;
      const route = rts[t.tabId];
      const device = tabDevice(t, route);
      if (!device) continue;
      const prompt = classifyHopScreen(t.screen?.(8) ?? "").kind === "prompt";
      planTabs.push({ tabId: t.tabId, name: t.name, session: t.session, status: "connected", route, device, free: prompt && !hopRuns.current.has(t.tabId) && !discovering.current.has(t.tabId) });
    }
    const live = new Set(terms.map((t) => t.tabId));
    for (const b of briefs) {
      if (b.status !== "closed" || live.has(b.tabId)) continue;
      const route = rts[b.tabId];
      const name = route ? routeNames(route)[routeNames(route).length - 1] : b.host && knownAddrs(n).includes(b.host) ? n.name : b.name;
      planTabs.push({ tabId: b.tabId, name: b.name, session: b.session, status: "closed", route, device: { name, verified: false, index: route?.steps.length ?? 0 }, free: false });
    }
    const saved = new Map<string, Session>();
    for (const x of topoRef.current.nodes) {
      const s = savedFor(x);
      if (s) saved.set(x.id, s);
    }
    const directOk = !!saved.get(n.id) || (!!n.ip && isIpLiteral(n.ip) && !!term);
    return planOpen({
      target: planNode(n),
      nodes: topoRef.current.nodes.map(planNode),
      links: topoRef.current.links,
      tabs: planTabs,
      saved,
      cameFrom: cameFromRef.current,
      needsPivot: !!pivot[n.id],
      directOk,
      cmdFor,
    });
  };

  /** Ejecuta una de las formas de abrir el equipo. */
  const runChoice = (c: OpenChoice, n: TopoNode) => {
    if (c.kind === "focus" && c.tabId) return onFocusTab(c.tabId);
    if (c.kind === "direct") {
      setUi((u) => (u.pivot[n.id] ? { ...u, pivot: Object.fromEntries(Object.entries(u.pivot).filter(([k]) => k !== n.id)) } : u));
      return follow(n);
    }
    if ((c.kind === "route" || c.kind === "shortest") && c.route) {
      if (!isReplayable(c.route.session)) return setMsg("La sesión del pivote no es SSH ni Telnet: no se puede reproducir en otra pestaña.");
      return runHop(c.route);
    }
    if (c.kind === "inplace" && c.route && c.tabId) {
      const t = liveRef.current.terminals.find((x) => x.tabId === c.tabId);
      if (!t) return setMsg("Esa pestaña ya no está conectada.");
      return runHop(c.route, t);
    }
    if (c.kind === "reconnect" && c.tabId) {
      const r = routesRef.current[c.tabId];
      // Una pestaña de salto reconectaría al pivote y perdería la ruta: se reproduce la ruta en una nueva.
      if (r?.steps.length) return runHop(r);
      return onReconnectTab(c.tabId);
    }
  };
  /** Doble clic o menú: la acción principal del equipo. */
  const openTerminal = (n: TopoNode) => {
    const p = computePlan(n);
    if (!p.primary) return setMsg(p.reason ?? "No hay forma de abrir una terminal en este equipo.");
    runChoice(p.primary, n);
  };
  /** Las alternativas del equipo como ítems de menú, más la marca "solo por un vecino". */
  const openMenuItems = (n: TopoNode): MenuItem[] => {
    const p = computePlan(n);
    const items: MenuItem[] = [];
    if (p.primary) items.push(["Abrir terminal", <SquareTerminal size={13} />, () => runChoice(p.primary!, n), false, undefined, false]);
    for (const a of p.alternatives) items.push([a.label, <Route size={13} />, () => runChoice(a, n), false, undefined, false]);
    if (!p.primary && !p.alternatives.length) items.push([p.reason ?? "Sin forma de abrirlo", <SquareTerminal size={13} />, () => {}, true]);
    const marked = !!pivot[n.id];
    items.push([
      marked ? "Quitar la marca «solo por un vecino»" : "Marcar: no llego directo desde mi PC",
      <Route size={13} />,
      () => setUi((u) => ({ ...u, pivot: marked ? Object.fromEntries(Object.entries(u.pivot).filter(([k]) => k !== n.id)) : { ...u.pivot, [n.id]: true } })),
      false,
      undefined,
      true,
    ]);
    return items;
  };
  /** Estado de cada equipo de una ruta en el panel: con pestaña conectada (se enfoca), caída o sin pestaña. */
  const crumbState = (name: string): { state: "connected" | "down" | "none"; tabId?: string } => {
    const id = nodeId(name);
    const { terminals: terms, tabs: briefs } = liveRef.current;
    const hit = tabAtDevice(id, addrsOf(id), terms, routesRef.current, new Set(hopRuns.current.keys()));
    if (hit?.tab.tabId) return { state: "connected", tabId: hit.tab.tabId };
    const down = briefs.find((b) => b.status === "closed" && routesRef.current[b.tabId] && nodeId(routeNames(routesRef.current[b.tabId]).slice(-1)[0]) === id);
    return down ? { state: "down", tabId: down.tabId } : { state: "none" };
  };

  return {
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
  };
}
