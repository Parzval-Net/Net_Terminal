import { memo, useEffect, useId, useMemo, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { Channel, invoke } from "@tauri-apps/api/core";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ChevronDown, ChevronUp, Lock, X } from "lucide-react";
import type { ITheme } from "@xterm/xterm";
import { ConnStatus, Session } from "../types";
import { fontStack } from "../lib/theme";
import { Settings, logOptions } from "../lib/settings";
import { alertHighlights } from "../lib/alerts";
import { StreamHighlighter, compile, effectiveRules } from "../lib/highlight";
import { backspaceMode, backspaceSeq, translateBackspace } from "../lib/backspace";
import { isMac, modLabel, shortcutFor } from "../lib/platform";
import { paneBodyStyle } from "../lib/split";
import { credStatus, needsUnlock } from "../lib/credentials";
import { VaultUnlock } from "./VaultUnlock";
import { SCP_EXIT_EVENT, type ScpExit } from "../lib/scpVerify";
import { recentRows } from "../lib/termBuffer";

/** Avisa al gestor de archivos que terminó (o se cerró) una pestaña de transferencia. */
const notifyScpExit = (transfer: string, reason: string | null, closed = false) =>
  window.dispatchEvent(new CustomEvent<ScpExit>(SCP_EXIT_EVENT, { detail: { transfer, reason, closed } }));
import { ConfirmDialog } from "./ConfirmDialog";
import { type CatalogVendor, riskLabel } from "../lib/packs";
import { HighlightEngine, MarkEngine, type MarkInfo } from "../lib/termDecor";
import { type PasteAnalysis, type PasteDecision, analyzePaste, pasteChunks, pasteDecision, sanitizePaste } from "../lib/pasteGuard";
import { type TermHl, validateHl } from "../lib/termHl";
import { HighlightDialog, LineSendBar, type LineSendOpts, type LineSendState, MarksDialog, PasteDialog, useAnnounce } from "./TermTools";
import {
  CREDENTIALS,
  InputTracker,
  PROMPT,
  type SuggestEntry,
  type SuggestIndex,
  configHint,
  endsWithTyped,
  getIndex,
  ghostColor,
  ghostFor,
  lookup,
  matchExecuted,
  matchSpans,
  nextWord,
  queryOf,
  remainderToInsert,
  safeInsert,
  saveTipsSoon,
  saveUsageSoon,
  suggestAllowed,
  suggestKey,
  suggestQuery,
  tabChained,
  tipStore,
  tipText,
  usageStore,
} from "../lib/suggest";

export interface TermController {
  /** Id de la conexión vigente en el backend (cambia en cada reconexión). */
  connId: () => string;
  reconnect: () => void;
  openFind: () => void;
  closeFind: () => void;
  focus: () => void;
  getSelection: () => string;
  isConnected: () => boolean;
  /** Envía texto como si se tecleara; con retardo > 0 lo hace línea a línea. */
  send: (text: string, lineDelayMs: number) => Promise<void>;
  /** Escribe texto en la sesión sin Enter (para completar antes de ejecutar). */
  type: (text: string) => void;
  /** Cierra la conexión dejando la pestaña abierta. */
  disconnect: () => void;
  clearScrollback: () => void;
  reset: () => void;
  /** Copia todo el historial al portapapeles; devuelve las líneas copiadas. */
  copyAll: () => Promise<number>;
  /** Últimas líneas del historial como texto (para detectar la plataforma sin enviar nada). */
  recentText: (lines: number) => string;
  /** Aviso local en la pestaña (no se envía al equipo). */
  notice: (text: string) => void;
  /** Resaltado al vuelo, marcadores (ver lib/termDecor): diálogos y acciones de la pestaña. */
  openHighlight: () => void;
  openMarks: () => void;
  markHere: () => void;
  jumpMark: (dir: "prev" | "next") => void;
}

/** Aviso al intentar escribir en una pestaña de solo lectura. */
export const READ_ONLY_MSG = "La pestaña está en solo lectura";

/** Coincidencias que cuenta la búsqueda (tope del addon: protege el rendimiento con historial grande). */
const FIND_LIMIT = 1000;
const NEWLINE = { cr: "\r", lf: "\n", crlf: "\r\n" } as const;
/**
 * Comandos que muestran modelo y versión (abreviados o no): show version, display version,
 * get system status/version, show sysinfo/info, fap-get-status. Tras uno, se lee la pantalla.
 */
const VERSION_CMD = /(?:^|[#>\]$%:]\s*)(?:sh\w* +(?:ver|inv)\w*|dis\w* +ver\w*|get +sys\w* +(?:stat|ver)\w*|show +(?:sysinfo|info)|fap-get-status)\b/i;
const MAX_RECONNECTS = 30;
/** Espera creciente (5, 10, 20, 40, 60 s…) para no gatillar bloqueos de cuenta en TACACS/RADIUS. */
const reconnectSecs = (attempt: number) => Math.min(60, 5 * 2 ** Math.max(0, attempt - 1));

interface Props {
  id: string;
  session: Session;
  /** Pestaña con el foco de teclado. */
  active: boolean;
  /** Se ve en pantalla (en vista dividida puede verse sin tener el foco). Por defecto = active. */
  visible?: boolean;
  /** Vista dividida: rectángulo "x,y,w,h" en % del área; sin él ocupa todo. */
  rect?: string;
  /** Vista dividida: clic en el panel para darle el foco. */
  onFocusPane?: (id: string) => void;
  settings: Settings;
  theme: ITheme;
  onStatus: (id: string, status: ConnStatus) => void;
  onLog: (id: string, path: string | null) => void;
  /** Log activo de la pestaña: al reconectar se sigue escribiendo en el mismo archivo. */
  logPath: string | null;
  /** Llegó salida mientras la pestaña no estaba visible. */
  onActivity: (id: string) => void;
  /** Activa "algoritmos legacy" en la sesión (y la guarda) tras un error de negociación SSH. */
  onEnableLegacy?: (id: string) => void;
  /**
   * La pantalla puede mostrar la versión del equipo (al conectar o tras un show version del
   * usuario): App la busca ahí sin enviar nada al equipo.
   */
  onScreenHint?: (id: string) => void;
  register: (id: string, ctrl: TermController | null) => void;
  /** La barra de búsqueda de la pestaña se abrió o cerró (la barra de estado refleja el botón Buscar). */
  onFindState?: (id: string, open: boolean) => void;
  /** Catálogo de comandos: fuente de las sugerencias. */
  catalog?: CatalogVendor[];
  /**
   * Modo monitoreo: la pestaña descarta teclado, pegado y envíos (botones, Notas, catálogo, historial,
   * CLI Lab, difusión, sugerencias). Copiar, buscar y desplazarse siguen. Solo gobierna la interfaz.
   */
  readOnly?: boolean;
  /** Enciende o apaga "Marcar cada comando al enviarlo" (ajuste global; también está en el diálogo de Marcadores). */
  onAutoMark?: (on: boolean) => void;
}

/** Lista de sugerencias (Ctrl+. por defecto, configurable). */
interface SuggestList {
  items: SuggestEntry[];
  sel: number;
  /** Lo tecleado al abrir: si cambia, la lista se cierra. */
  buf: string;
  /** Lo que se buscó (sin el escape `do `/`run ` del modo configuración). */
  q: string;
  left: number;
  top?: number;
  bottom?: number;
}

/** Ancho real de un carácter con la fuente dada (para alinear la sugerencia con las celdas). */
const charWidths = new Map<string, number>();
function charWidth(font: string): number {
  let w = charWidths.get(font);
  if (w === undefined) {
    const ctx = document.createElement("canvas").getContext("2d");
    if (ctx) ctx.font = font;
    w = ctx ? ctx.measureText("W").width : 0;
    charWidths.set(font, w);
  }
  return w;
}

/** OpenSSH rechaza un equipo que solo ofrece algoritmos antiguos (ssh-rsa, SHA1, CBC). */
const LEGACY_NEEDED = /no matching (host key type|key exchange method|cipher|MAC|signature algorithm) found/i;
/** OpenSSH 10 eliminó ssh-dss: ni el modo legacy lo recupera. */
const DSS_ONLY = /Their offer: ssh-dss\s*$/im;

/** Manejador vacío a nivel de módulo: uno creado dentro de la terminal retendría su contexto. */
const NOOP = () => {};

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

export const TerminalView = memo(function TerminalView({ id, session, active, visible = active, rect, onFocusPane, settings, theme, onStatus, onLog, logPath, onActivity, onEnableLegacy, onScreenHint, register, onFindState, catalog, readOnly = false, onAutoMark }: Props) {
  const screenHintRef = useRef(onScreenHint);
  screenHintRef.current = onScreenHint;
  // "Visible" decide WebGL y el aviso de actividad; "active" (foco) decide el teclado.
  const activeRef = useRef(visible);
  activeRef.current = visible;
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const searchRef = useRef<SearchAddon | null>(null);
  const statusRef = useRef<ConnStatus>("connecting");
  const connIdRef = useRef("");
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const logPathRef = useRef(logPath);
  logPathRef.current = logPath;
  const compiled = useMemo(
    () =>
      compile(
        effectiveRules(
          {
            enabled: settings.highlightEnabled,
            schemes: settings.highlightSchemes,
            custom: [...alertHighlights(settings.alertRules, session.folder), ...settings.customRules],
          },
          session.highlight,
        ),
        theme,
      ),
    [settings.highlightEnabled, settings.highlightSchemes, settings.customRules, settings.alertRules, session.highlight, session.folder, theme],
  );
  const compiledRef = useRef(compiled);
  compiledRef.current = compiled;
  const [findOpen, setFindOpen] = useState(false);
  /** Pegado que espera confirmación antes de llegar al equipo (con su análisis: líneas, caracteres especiales, riesgo). */
  const [pasteAsk, setPasteAsk] = useState<{ text: string; a: PasteAnalysis; d: PasteDecision } | null>(null);
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;
  /** La conexión actual ya tiene la marca de solo lectura del backend (set_read_only). */
  const roSent = useRef(false);
  const onAutoMarkRef = useRef(onAutoMark);
  onAutoMarkRef.current = onAutoMark;
  const [query, setQuery] = useState("");
  /** Coincidencias de la búsqueda (posición actual y total); el addon solo las cuenta con decoraciones. */
  const [found, setFound] = useState<{ index: number; count: number } | null>(null);
  /** Bóveda bloqueada al conectar una sesión con contraseña guardada: desbloquear u omitir. */
  const [unlockAsk, setUnlockAsk] = useState(false);
  const unlockResolve = useRef<((ok: boolean) => void) | null>(null);
  // Sugerencias de comandos: la sugerencia y el aviso de plataforma se dibujan directo en el
  // DOM (sin render de React por tecla); la lista y la confirmación sí usan estado.
  const focusRef = useRef(active);
  focusRef.current = active;
  const catalogRef = useRef(catalog);
  catalogRef.current = catalog;
  const wrapRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const ghostTextRef = useRef<HTMLSpanElement>(null);
  const ghostTipRef = useRef<HTMLSpanElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const [suggestList, setSuggestList] = useState<SuggestList | null>(null);
  const listRef = useRef<SuggestList | null>(null);
  const [suggestAsk, setSuggestAsk] = useState<{ entry: SuggestEntry; buf: string; q: string } | null>(null);
  const suggestRef = useRef<{ refresh: () => void; reset: () => void; pick: (e: SuggestEntry, buf: string, confirmed: boolean) => void } | null>(null);
  const listId = useId();
  // Resaltado al vuelo y marcadores: los motores se crean con la terminal pero no hacen nada (ni se suscriben
  // a la salida) hasta que el usuario agrega un resaltado o una marca.
  const [dialog, setDialog] = useState<"hl" | "marks" | null>(null);
  const dialogRef = useRef(dialog);
  dialogRef.current = dialog;
  const hlRef = useRef<HighlightEngine | null>(null);
  const marksRef = useRef<MarkEngine | null>(null);
  const [hlList, setHlList] = useState<(TermHl & { count: number })[]>([]);
  const [hlCapped, setHlCapped] = useState(false);
  const [markList, setMarkList] = useState<MarkInfo[]>([]);
  const hlSeq = useRef(0);
  const flashRef = useRef<HTMLDivElement>(null);
  const [lineSend, setLineSend] = useState<LineSendState | null>(null);
  const lineStopRef = useRef<(() => void) | null>(null);
  const lineStartRef = useRef<((text: string, o: LineSendOpts) => void) | null>(null);
  const announce = useAnnounce(lineSend);
  /** Devuelve el foco a la terminal tras cerrar un diálogo: un tick después, cuando su trampa de foco ya no existe. */
  const refocus = () => void window.setTimeout(() => termRef.current?.focus(), 0);

  useEffect(() => {
    const term = new Terminal({
      fontFamily: fontStack(settings.fontFamily),
      fontSize: settings.fontSize,
      lineHeight: settings.lineHeight,
      cursorStyle: settings.cursorStyle,
      cursorBlink: settings.cursorBlink,
      scrollback: settings.scrollback,
      allowProposedApi: true,
      macOptionIsMeta: true,
      // Enlaces OSC 8 que escribe el equipo: sin esto xterm usa confirm() + window.open con
      // cualquier esquema (file:, javascript:, propios del sistema). Solo http(s), en el navegador.
      linkHandler: {
        activate: (_e, uri) => {
          if (/^https?:\/\//i.test(uri)) openUrl(uri).catch(() => {});
        },
      },
      theme,
    });
    const fit = new FitAddon();
    const search = new SearchAddon({ highlightLimit: FIND_LIMIT });
    term.loadAddon(fit);
    term.loadAddon(search);
    term.loadAddon(new WebLinksAddon((_e, uri) => openUrl(uri)));
    term.open(hostRef.current!);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;
    searchRef.current = search;
    search.onDidChangeResults((r) => setFound({ index: r.resultIndex, count: r.resultCount }));

    // Resaltado: se decodifica UTF-8 en streaming y se colorea por líneas. En pantallas
    // completas (vim, top, less) no se toca nada.
    const hl = new StreamHighlighter(
      (text) => term.write(text),
      () => compiledRef.current,
      () => term.buffer.active.type === "alternate",
    );

    const setStatus = (s: ConnStatus) => {
      statusRef.current = s;
      onStatus(id, s);
    };

    let screenTimer: number | undefined;
    /** Pide a App una lectura de pantalla tras `ms` (un solo temporizador pendiente). */
    const screenSoon = (ms: number) => {
      window.clearTimeout(screenTimer);
      screenTimer = window.setTimeout(() => !disposed && screenHintRef.current?.(id), ms);
    };
    let disposed = false;
    // Resaltado al vuelo y marcadores (ver lib/termDecor): sin suscripciones hasta que se usan.
    const hlEngine = new HighlightEngine(term, () => {
      if (disposed || dialogRef.current !== "hl") return;
      setHlList(hlEngine.list());
      setHlCapped(hlEngine.capped);
    });
    const markEngine = new MarkEngine(term, () => {
      if (!disposed && dialogRef.current === "marks") setMarkList(markEngine.list());
    });
    hlRef.current = hlEngine;
    marksRef.current = markEngine;
    /** Aviso breve dentro de la pestaña (región role=status). El mismo aviso repetido en menos de 1,5 s no se vuelve a mostrar. */
    let flashTimer: number | undefined;
    let flashText = "";
    let flashAt = 0;
    const notify = (text: string) => {
      const el = flashRef.current;
      const now = performance.now();
      if (!el || (text === flashText && now - flashAt < 1500)) return;
      flashText = text;
      flashAt = now;
      el.textContent = text;
      el.style.opacity = "1";
      window.clearTimeout(flashTimer);
      flashTimer = window.setTimeout(() => {
        el.style.opacity = "0";
        el.textContent = "";
      }, 2600);
    };
    /** Envío línea a línea en curso (pegado seguro): `stop` lo detiene tras la línea actual. */
    let lineRun: { stop: boolean } | null = null;
    /** Última tecla del usuario: distingue lo que teclea de las respuestas que xterm genera solo (consultas del equipo, foco, ratón). */
    let lastKeyAt = 0;
    const refuse = () => {
      if (performance.now() - lastKeyAt < 120) notify(READ_ONLY_MSG);
    };
    /** Marca automática de la línea del cursor al ejecutar un comando (opción de Ajustes de terminal; apagada por defecto). */
    const autoMark = () => {
      if (settingsRef.current.autoMarkCommands) markEngine.mark("auto");
    };
    let attempt = 0;
    // Reconexión automática: se cancela con Esc o al desconectar a mano.
    let manualClose = false;
    let retries = 0;
    let retryTimer: number | undefined;
    let channels: Channel<unknown>[] = [];
    const releaseChannels = () => {
      for (const ch of channels) ch.onmessage = NOOP;
      channels = [];
    };
    let lastDataAt = 0;
    /** Tras un error de negociación SSH, "L" activa los algoritmos legacy y reconecta. */
    let legacyOffer = false;
    /** Activa legacy en la pestaña (y en la sesión guardada) y reconecta. */
    function enableLegacy(note: string) {
      legacyOffer = false;
      sessionRef.current = { ...sessionRef.current, legacy_ssh: true };
      onEnableLegacy?.(id);
      term.write(`\r\n${dim(note)}\r\n`);
      retries = 0;
      void connect();
    }
    /** Final de la salida reciente (sin ANSI), para reconocer el prompt. */
    let tail = "";
    /** El operador eligió conectar sin autocompletar: no se vuelve a preguntar en reconexiones. */
    let skipUnlock = false;

    const newline = () => NEWLINE[sessionRef.current.newline ?? "cr"];

    const cancelRetry = () => {
      window.clearTimeout(retryTimer);
      retryTimer = undefined;
    };

    /** Envía los "comandos al conectar" cuando el equipo deja de escribir (prompt listo). */
    // Prompt típico de equipos y shells (PROMPT); nunca se envía sobre un pedido de credenciales (CREDENTIALS).
    const cleanTail = () => tail.replace(/\x1b\[[0-9;?]*[ -\/]*[@-~]/g, "").replace(/\r/g, "");
    /** Espera a que el equipo muestre su prompt (o quede en silencio sin pedir credenciales). */
    const waitReady = async (connId: string, since: number, maxMs: number, stopped?: () => boolean) => {
      const start = Date.now();
      while (Date.now() - start < maxMs) {
        await new Promise((r) => setTimeout(r, 150));
        if (disposed || connIdRef.current !== connId || statusRef.current !== "connected" || stopped?.()) return false;
        if (lastDataAt <= since) continue;
        const quiet = Date.now() - lastDataAt;
        const t = cleanTail();
        if (CREDENTIALS.test(t)) continue;
        if ((PROMPT.test(t) && quiet > 200) || quiet > 1500) return true;
      }
      return false;
    };

    const runOnConnect = async (connId: string) => {
      const lines = (sessionRef.current.on_connect ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
      if (!lines.length) return;
      // Hasta 2 minutos: da tiempo a escribir la contraseña antes del primer comando.
      if (!(await waitReady(connId, 0, 120_000))) return;
      for (const line of lines) {
        if (disposed || connIdRef.current !== connId || statusRef.current !== "connected") return;
        // Solo lectura: los comandos al conectar tampoco se envían.
        if (readOnlyRef.current) return notify(`${READ_ONLY_MSG}: no se envían los comandos al conectar`);
        const sent = Date.now();
        await invoke("write", { id: connId, data: line + newline() }).catch(() => {});
        await waitReady(connId, sent, 5000);
      }
    };

    const connect = async () => {
      cancelRetry();
      manualClose = false;
      tail = "";
      tracker.clear();
      lastDataAt = 0;
      const prevConn = connIdRef.current;
      const connId = `${id}#${++attempt}`;
      connIdRef.current = connId;
      // Solo lectura también en el backend (MCP, scripts, CLI Lab, difusión): la marca va por conexión y se pone antes de conectar.
      if (prevConn && roSent.current) invoke("set_read_only", { id: prevConn, on: false }).catch(() => {});
      roSent.current = readOnlyRef.current;
      if (roSent.current) invoke("set_read_only", { id: connId, on: true }).catch(() => {});
      setStatus("connecting");
      const s = sessionRef.current;
      if (s.type !== "local") term.write(dim(`Conectando a ${s.name}…\r\n`));
      let decoder: TextDecoder;
      try {
        decoder = new TextDecoder(s.encoding || "utf-8");
      } catch {
        decoder = new TextDecoder();
      }
      // Los canales de la conexión anterior dejan de retener la terminal (y su historial)
      // aunque el aviso de cierre del backend no llegue.
      releaseChannels();
      // Datos en binario; el cierre llega por el mismo canal como texto, detrás de los
      // últimos datos (el canal entrega en orden aunque los bloques grandes viajen por fetch).
      const onData = new Channel<ArrayBuffer | string>();
      onData.onmessage = (buf) => {
        if (connIdRef.current !== connId) return;
        if (typeof buf === "string") return onExit(buf);
        lastDataAt = Date.now();
        const text = decoder.decode(new Uint8Array(buf), { stream: true });
        tail = (tail + text).slice(-400);
        if (tracking()) tracker.output(text, cleanTail);
        hl.push(text);
        if (!activeRef.current) onActivity(id);
      };
      channels = [onData as Channel<unknown>];
      const onExit = (reason: string) => {
        hl.flush();
        setStatus("closed");
        // Equipo antiguo: se ofrece activar los algoritmos legacy con una tecla.
        const t = cleanTail();
        legacyOffer = false;
        if (sessionRef.current.type === "ssh" && LEGACY_NEEDED.test(t)) {
          if (DSS_ONLY.test(t)) {
            term.write(
              `\r\n${dim("── El equipo solo ofrece claves ssh-dss (DSA), que OpenSSH 10 ya no soporta ni en modo legacy. Genera una clave RSA/ECDSA en el equipo o usa Telnet/consola ──")}\r\n`,
            );
          } else if (!sessionRef.current.legacy_ssh && settingsRef.current.autoLegacySsh && !manualClose) {
            // Un solo reintento: con legacy_ssh activo, un nuevo fallo cae en la rama de abajo.
            enableLegacy("── El equipo usa algoritmos antiguos: compatibilidad activada automáticamente (Ajustes › Terminal) ──");
            return;
          } else if (!sessionRef.current.legacy_ssh) {
            legacyOffer = true;
            term.write(
              `\r\n${dim("── El equipo usa algoritmos antiguos (ssh-rsa, SHA1 o CBC) que OpenSSH desactiva por defecto. Presiona L para activar la compatibilidad con equipos antiguos en esta sesión y reconectar · Enter: reintentar igual ──")}\r\n`,
            );
          } else {
            term.write(`\r\n${dim("── El equipo pide algoritmos que el OpenSSH instalado ya no incluye, ni con la compatibilidad activada ──")}\r\n`);
          }
          if (!activeRef.current) onActivity(id);
          return;
        }
        if (sessionRef.current.scp) {
          // El gestor de archivos verifica el MD5 si fue una subida terminada con código 0.
          notifyScpExit(sessionRef.current.id, reason);
          // Transferencia SCP: no se repite con Enter para no sobrescribir por accidente.
          term.write(`\r\n${dim(`── ${reason}. Transferencia terminada: puedes cerrar esta pestaña ──`)}\r\n`);
        } else if (!manualClose && sessionRef.current.auto_reconnect && retries < MAX_RECONNECTS) {
          retries++;
          const wait = reconnectSecs(retries);
          term.write(
            `\r\n${dim(`── ${reason}. Reconectando en ${wait} s (intento ${retries}/${MAX_RECONNECTS}) · Enter: ahora · Esc: cancelar ──`)}\r\n`,
          );
          retryTimer = window.setTimeout(connect, wait * 1000);
        } else {
          term.write(`\r\n${dim(`── ${reason}. Presiona Enter para reconectar ──`)}\r\n`);
        }
        if (!activeRef.current) onActivity(id);
      };
      // Contraseña guardada con la bóveda bloqueada: se pide la maestra antes de conectar.
      if (s.save_password && s.type !== "local" && !skipUnlock && needsUnlock(await credStatus().catch(() => null))) {
        const ok = await new Promise<boolean>((resolve) => {
          unlockResolve.current = resolve;
          setUnlockAsk(true);
        });
        unlockResolve.current = null;
        setUnlockAsk(false);
        if (!ok) skipUnlock = true;
        if (disposed || connIdRef.current !== connId) return;
        term.focus();
      }
      try {
        await invoke("connect", {
          id: connId,
          // Modo de Retroceso ya resuelto: con BS, la PTY de ssh borra con ^H y se lo informa al servidor.
          session: { ...s, backspace: backspaceMode(s) },
          cols: term.cols,
          rows: term.rows,
          onData,
        });
        if (disposed || connIdRef.current !== connId) {
          invoke("disconnect", { id: connId }).catch(() => {});
          return;
        }
        if (statusRef.current === "connecting") {
          setStatus("connected");
          retries = 0;
          runOnConnect(connId);
          // Banner y prompt inicial: una sola lectura de pantalla, fuera del camino de las teclas.
          screenSoon(2500);
          // Un log activado a mano (o el automático) continúa en su archivo tras reconectar.
          const resume = logPathRef.current;
          if (resume || settingsRef.current.autoLog) {
            invoke<string | null>("set_logging", {
              id: connId,
              enabled: true,
              ...logOptions(settingsRef.current),
              resume,
            })
              .then((path) => onLog(id, path))
              .catch(() => {});
          }
        }
      } catch (err) {
        if (disposed || connIdRef.current !== connId) return;
        setStatus("closed");
        if (sessionRef.current.auto_reconnect && !manualClose && retries < MAX_RECONNECTS) {
          retries++;
          const wait = reconnectSecs(retries);
          term.write(
            `\r\n\x1b[31m${err}\x1b[0m\r\n${dim(`── Reintentando en ${wait} s (intento ${retries}/${MAX_RECONNECTS}) · Esc: cancelar ──`)}\r\n`,
          );
          retryTimer = window.setTimeout(connect, wait * 1000);
        } else {
          term.write(`\r\n\x1b[31m${err}\x1b[0m\r\n${dim("── Presiona Enter para reintentar ──")}\r\n`);
        }
      }
    };

    const disconnect = () => {
      manualClose = true;
      cancelRetry();
      if (statusRef.current === "closed") return;
      invoke("disconnect", { id: connIdRef.current }).catch(() => {});
      hl.flush();
      setStatus("closed");
      term.write(`\r\n${dim("── Desconectado. Presiona Enter para reconectar ──")}\r\n`);
    };

    // ---------- Sugerencias de comandos ----------
    // Solo con el ajuste activo y en sesiones remotas. Apagado, ningún evento hace trabajo
    // extra (una comparación). Sin plataforma conocida se muestra un aviso una sola vez.
    const tracker = new InputTracker();
    const usage = usageStore();
    let swallowPress = false;
    /** Momento del último Tab que aceptó: un segundo Tab enseguida va al equipo. */
    let lastTabAccept = 0;
    const tips = tipStore();
    let suggestFrame = 0;
    /** Sugerencia visible: Tab y Flecha derecha solo aceptan lo que el usuario está viendo. */
    let shown: { buf: string; insert: string } | null = null;
    let ghostKey = "";
    /** Aviso "Detecta la plataforma": una vez por pestaña. */
    let hinted = false;
    let hintTimer: number | undefined;
    /** Medición opcional (solo la demo define los arreglos): tecla → sugerencia dibujada y costo de cada cuadro. */
    const { __ntSuggestPerf: perfLog, __ntSuggestCost: perfCost } = window as unknown as { __ntSuggestPerf?: number[]; __ntSuggestCost?: number[] };
    let keyAt = 0;
    const screenEl = term.element?.querySelector<HTMLElement>(".xterm-screen") ?? null;
    const tracking = () => !readOnlyRef.current && suggestAllowed(settingsRef.current.commandSuggest, sessionRef.current);
    const suggestIndex = () => {
      const platform = sessionRef.current.platform;
      const cat = catalogRef.current;
      return platform && cat && tracking() ? getIndex(cat, platform) : null;
    };
    /** Pesos de historial y favoritos: se recalculan solo cuando cambian. */
    let favSrc: string[] | null = null;
    let favSet: ReadonlySet<string> = new Set();
    const weightsFor = (idx: SuggestIndex) => {
      const f = settingsRef.current.favCommands;
      if (f !== favSrc) {
        favSrc = f;
        favSet = new Set(f);
      }
      return usage.weights(idx, favSet);
    };
    /** Guarda el uso de un comando del catálogo: solo su plantilla, nunca lo tecleado. */
    const remember = (idx: SuggestIndex, entry: SuggestEntry) => {
      usage.record(idx.platform, entry);
      saveUsageSoon();
    };
    const setList = (l: SuggestList | null) => {
      listRef.current = l;
      setSuggestList(l);
    };
    const closeList = () => {
      if (listRef.current) setList(null);
    };
    /**
     * Línea en pantalla hasta el cursor (con las filas envueltas de arriba hasta `need`
     * caracteres); null si hay texto a la derecha del cursor.
     */
    const lineToCursor = (need: number): string | null => {
      const b = term.buffer.active;
      let y = b.baseY + b.cursorY;
      const line = b.getLine(y);
      if (!line || b.cursorX >= term.cols || line.translateToString(true, b.cursorX).length) return null;
      let text = line.translateToString(false, 0, b.cursorX);
      while (text.length < need && y > 0 && b.getLine(y)?.isWrapped) text = (b.getLine(--y)?.translateToString(false) ?? "") + text;
      return text;
    };
    /** La línea en pantalla termina con lo tecleado y no hay nada a la derecha del cursor. */
    const lineMatches = (buf: string) => {
      const text = lineToCursor(buf.length);
      return text !== null && (!buf || endsWithTyped(text, buf));
    };
    const visibleConnected = () =>
      focusRef.current && activeRef.current && statusRef.current === "connected" && term.buffer.active.type !== "alternate";
    const usable = () => tracker.active && visibleConnected();
    /**
     * Lo que se busca según el modo del prompt: en configuración solo tras `do `/`run ` (o con
     * `display`/`show` completo según el fabricante); si no, null y no se sugiere nada.
     */
    const queryFor = (idx: SuggestIndex, buf: string) => suggestQuery(buf, tracker.prompt, idx);
    const currentGhost = () => {
      // Esc la descartó: nada hasta el próximo Enter (y Tab vuelve a ir al equipo).
      if (listRef.current || tracker.dismissed || !usable()) return null;
      const idx = suggestIndex();
      const q = idx && queryFor(idx, tracker.buf);
      const g = idx && q !== null ? ghostFor(idx, q, weightsFor(idx)) : null;
      return g && lineMatches(tracker.buf) ? g : null;
    };
    /**
     * Celda del cursor relativa al contenedor; null si el cursor no está a la vista. El
     * tamaño de celda sale de .xterm-screen, que xterm dimensiona a columnas × ancho de
     * celda (sin API interna).
     */
    const cursorBox = () => {
      const b = term.buffer.active;
      const row = b.baseY + b.cursorY - b.viewportY;
      const wrap = wrapRef.current;
      if (!screenEl || !wrap || row < 0 || row >= term.rows || b.cursorX >= term.cols) return null;
      const sr = screenEl.getBoundingClientRect();
      if (!sr.width || !sr.height) return null;
      const wr = wrap.getBoundingClientRect();
      const w = sr.width / term.cols;
      const h = sr.height / term.rows;
      return { left: sr.left - wr.left + b.cursorX * w, top: sr.top - wr.top + row * h, w, h, max: (term.cols - b.cursorX) * w, wrapW: wr.width, wrapH: wr.height };
    };
    const hideHint = () => {
      window.clearTimeout(hintTimer);
      const el = hintRef.current;
      if (el && el.style.display !== "none") el.style.display = "none";
    };
    /** Aviso discreto junto al cursor (no toma el foco ni las teclas). */
    const showHint = (text: string, ms: number) => {
      const el = hintRef.current;
      const box = cursorBox();
      if (!el || !box) return false;
      window.clearTimeout(hintTimer);
      el.textContent = text;
      const st = el.style;
      st.left = `${Math.max(4, Math.min(box.left - queryOf(tracker.buf).length * box.w, box.wrapW - 400))}px`;
      st.top = box.wrapH - (box.top + box.h) >= 40 ? `${box.top + box.h + 4}px` : `${box.top - 30}px`;
      st.display = "block";
      hintTimer = window.setTimeout(hideHint, ms);
      return true;
    };
    /** Plataforma desconocida: un aviso discreto la primera vez que se escribe en un prompt. */
    const maybeHint = () => {
      if (hinted || !catalogRef.current || !usable() || queryOf(tracker.buf).length < 2 || !lineMatches(tracker.buf)) return;
      if (showHint(`Detecta la plataforma para activar sugerencias: Comandos (${modLabel}L) › Detectar`, 6000)) hinted = true;
    };
    const renderSuggest = () => {
      suggestFrame = 0;
      if (!perfCost) return drawSuggest();
      const t0 = performance.now();
      drawSuggest();
      perfCost.push(performance.now() - t0);
    };
    const drawSuggest = () => {
      // Línea redibujada o prompt que llegó después de teclear: se confirma con la pantalla.
      // Tras Tab o "?" del equipo se relee la línea completa (prompt + lo que quedó escrito).
      if (tracker.canResync && visibleConnected()) {
        const text = lineToCursor(tracker.reread ? tracker.prompt.length + 300 : tracker.buf.length + 80);
        if (text !== null) tracker.resync(text);
      }
      const list = listRef.current;
      if (list && (!usable() || tracker.buf !== list.buf)) closeList();
      const el = ghostRef.current;
      if (!el) return;
      if (!hinted && !suggestIndex()) maybeHint();
      const g = currentGhost();
      const box = g && cursorBox();
      if (!g || !box) {
        shown = null;
        if (ghostKey) {
          ghostKey = "";
          if (ghostTextRef.current) ghostTextRef.current.textContent = "";
          el.style.display = "none";
        }
        return;
      }
      shown = { buf: tracker.buf, insert: g.insert };
      const o = term.options;
      const st0 = settingsRef.current;
      const font = `${o.fontSize}px ${o.fontFamily}`;
      // Color propio (acento del tema, cian o ámbar) con al menos 3:1 de contraste en todos los
      // temas y distinto del texto y del cursor (ver ghostColor).
      const color = ghostColor(o.theme, st0.suggestColor) ?? "";
      const style = st0.suggestStyle;
      // Ayuda "Tab o → acepta · Esc descarta": las primeras TIP_TIMES líneas por plataforma.
      const idx = suggestIndex();
      let tip = "";
      if (st0.suggestTip && g.insert && idx) {
        const before = tips.count(idx.platform);
        if (tips.allow(idx.platform, `${connIdRef.current}:${tracker.line}`)) tip = tipText(st0.suggestTabAccept);
        if (tips.count(idx.platform) !== before) saveTipsSoon();
      }
      const tipFont = `${Math.max(9, Math.round(o.fontSize! * 0.8))}px ${o.fontFamily}`;
      // Solo si cabe en la línea junto a la sugerencia (si no, se omite: nunca tapa nada).
      if (tip && [...g.rest].length * box.w + tip.length * charWidth(tipFont) + 2.5 * box.w > box.max) tip = "";
      const key = `${g.rest}|${box.left}|${box.top}|${box.w}|${box.h}|${box.max}|${font}|${color}|${style}|${tip}`;
      if (key !== ghostKey) {
        ghostKey = key;
        const textEl = ghostTextRef.current;
        const tipEl = ghostTipRef.current;
        if (textEl) {
          textEl.textContent = g.rest;
          textEl.style.fontStyle = style === "italic" ? "italic" : "";
          textEl.style.textDecoration = style === "underline" ? "underline dotted" : "";
        }
        if (tipEl) {
          tipEl.textContent = tip;
          const ts = tipEl.style;
          ts.display = tip ? "inline-block" : "none";
          ts.font = tipFont;
          // Arriba en la línea y más baja que la celda: no mueve la línea base de la sugerencia.
          ts.verticalAlign = "top";
          ts.marginTop = "2px";
          ts.height = `${Math.max(1, box.h - 4)}px`;
          ts.lineHeight = `${Math.max(1, box.h - 6)}px`;
          ts.marginLeft = `${box.w}px`;
          ts.borderColor = color || "currentColor";
        }
        const st = el.style;
        st.display = "block";
        st.left = `${box.left}px`;
        st.top = `${box.top}px`;
        st.height = `${box.h}px`;
        st.lineHeight = `${box.h}px`;
        st.maxWidth = `${box.max}px`;
        st.font = font;
        st.letterSpacing = `${box.w - charWidth(font)}px`;
        st.color = color || (o.theme?.foreground ?? "");
        st.opacity = color ? "1" : "0.6";
      }
      if (perfLog && keyAt) {
        perfLog.push(performance.now() - keyAt);
        keyAt = 0;
      }
    };
    const scheduleSuggest = () => {
      if (!suggestFrame) suggestFrame = requestAnimationFrame(renderSuggest);
    };
    /** Escribe en el equipo como si se tecleara: nunca Enter ni caracteres de control. */
    const typeInsert = (text: string) => {
      const safe = safeInsert(text);
      if (!safe || statusRef.current !== "connected") return;
      tracker.insert(safe);
      sendInput(safe);
      scheduleSuggest();
    };
    const openList = () => {
      const idx = suggestIndex();
      if (!idx || !usable() || !lineMatches(tracker.buf)) return;
      const q = queryFor(idx, tracker.buf);
      // Modo configuración sin escape: se explica cómo pedir sugerencias en vez de no hacer nada.
      if (q === null) return void showHint(configHint(idx), 4000);
      const items = lookup(idx, q, 8, { weights: weightsFor(idx) });
      const box = cursorBox();
      if (!items.length || !box) return;
      // Alineada con el inicio de lo tecleado; abajo del cursor o arriba si no cabe.
      const left = Math.max(0, Math.min(box.left - queryOf(tracker.buf).length * box.w, box.wrapW - 360));
      const below = box.wrapH - (box.top + box.h) >= 300 || box.top < box.wrapH / 2;
      setList({ items, sel: 0, buf: tracker.buf, q, left, ...(below ? { top: box.top + box.h + 2 } : { bottom: box.wrapH - box.top + 2 }) });
      scheduleSuggest();
    };
    const pickSuggestion = (entry: SuggestEntry, buf: string, confirmed: boolean) => {
      closeList();
      scheduleSuggest();
      const idx = suggestIndex();
      if (!idx || !tracker.active || tracker.buf !== buf) return;
      const q = queryFor(idx, buf);
      const rest = q === null ? "" : remainderToInsert(entry, q);
      if (!rest || q === null) return;
      // Lo que cambia configuración o puede cortar servicio se confirma antes de escribirlo.
      if (entry.risk !== "read" && !confirmed) return setSuggestAsk({ entry, buf, q });
      typeInsert(rest);
      remember(idx, entry);
    };
    /** Tecla con las sugerencias activas; true si la tomaron (no llega al equipo). */
    const suggestKeyDown = (e: KeyboardEvent) => {
      const list = listRef.current;
      if (e.key === "Escape") hideHint();
      const idx = statusRef.current === "connected" ? suggestIndex() : null;
      if (!idx) {
        closeList();
        return false;
      }
      const g = list ? null : currentGhost();
      const canAccept = !!g?.insert && shown?.insert === g.insert && shown.buf === tracker.buf;
      const st = settingsRef.current;
      // Doble Tab: si el anterior aceptó hace menos de 400 ms, este va al equipo (su autocompletado).
      const now = performance.now();
      const tabChain = e.key === "Tab" && tabChained(lastTabAccept, now);
      if (e.key !== "Tab") lastTabAccept = 0;
      const action = suggestKey(e, {
        enabled: true,
        listOpen: !!list,
        canAccept,
        ghostVisible: !!g && !!shown && shown.buf === tracker.buf,
        tabAccept: st.suggestTabAccept,
        tabChain,
        listKey: st.suggestListKey,
      });
      if (e.key === "Tab") lastTabAccept = action === "accept" ? now : 0;
      switch (action) {
        case "accept":
          typeInsert(g!.insert);
          remember(idx, g!.entry);
          return true;
        case "word":
          typeInsert(nextWord(g!.insert));
          return true;
        case "dismiss":
          // Esc oculta la sugerencia de esta línea; no llega al equipo.
          tracker.dismissed = true;
          scheduleSuggest();
          return true;
        case "open":
          openList();
          return true;
        case "up":
        case "down": {
          const n = list!.items.length;
          setList({ ...list!, sel: (list!.sel + (e.key === "ArrowUp" ? n - 1 : 1)) % n });
          return true;
        }
        case "pick":
          pickSuggestion(list!.items[list!.sel], list!.buf, false);
          return true;
        case "close":
          closeList();
          scheduleSuggest();
          return true;
        default:
          // Cualquier otra tecla (Tab sin sugerencia, Esc sin sugerencia, Retroceso) va al equipo y cierra la lista.
          closeList();
          return false;
      }
    };
    term.onWriteParsed(() => tracking() && scheduleSuggest());
    term.onScroll(() => tracking() && scheduleSuggest());
    term.onResize(() => tracking() && scheduleSuggest());
    suggestRef.current = {
      refresh: scheduleSuggest,
      reset: () => {
        tracker.reset();
        closeList();
        hideHint();
      },
      pick: pickSuggestion,
    };

    /** Secuencia de la última pulsación de Retroceso (ver lib/backspace); null si fue otra tecla. */
    let backspaceKey: string | null = null;

    term.onData((data) => {
      data = translateBackspace(data, backspaceKey);
      backspaceKey = null;
      if (statusRef.current === "closed") {
        if (sessionRef.current.scp) return;
        if (legacyOffer && (data === "l" || data === "L")) {
          enableLegacy("── Compatibilidad con equipos antiguos activada ──");
          return;
        }
        if (data === "\r") {
          term.write("\r\n");
          retries = 0;
          connect();
        } else if (data === "\x1b" && retryTimer !== undefined) {
          cancelRetry();
          manualClose = true;
          term.write(`${dim("── Reconexión cancelada. Enter para reconectar ──")}\r\n`);
        }
        return;
      }
      if (statusRef.current !== "connected") return;
      // Envío línea a línea en curso: lo tecleado no se mezcla con él (Esc lo detiene).
      if (lineRun) {
        if (data === "\x1b") lineRun.stop = true;
        else notify("Envío línea a línea en curso: Esc lo detiene");
        return;
      }
      // Solo lectura: se descarta todo (teclas, pegado y respuestas automáticas de xterm); solo avisa si fue una tecla.
      if (readOnlyRef.current) return refuse();
      if (data === "\r") autoMark();
      if (data === "\r" && screenHintRef.current) {
        // Solo al presionar Enter y solo si la línea es un comando de versión: costo cero por tecla.
        const buf = term.buffer.active;
        const line = buf.getLine(buf.baseY + buf.cursorY)?.translateToString(true) ?? "";
        if (VERSION_CMD.test(line)) screenSoon(2000);
      }
      if (tracking()) {
        if (data === "\r") {
          hideHint();
          // Historial: la plantilla del catálogo que corresponde a la línea ejecutada.
          const idx = tracker.active ? suggestIndex() : null;
          const q = idx && queryFor(idx, tracker.buf);
          const entry = idx && q ? matchExecuted(idx, q) : null;
          if (idx && entry) remember(idx, entry);
        }
        if (perfLog) keyAt = performance.now();
        tracker.input(data);
        scheduleSuggest();
      }
      sendInput(data);
    });

    /** Envía al equipo lo tecleado (o insertado por una sugerencia). */
    function sendInput(data: string) {
      if (readOnlyRef.current) return;
      const s = sessionRef.current;
      if (s.local_echo) term.write(data.replace(/\r/g, "\r\n").replace(/[\x7f\b]/g, "\b \b"));
      const out = s.newline && s.newline !== "cr" ? data.replace(/\r/g, newline()) : data;
      invoke("write", { id: connIdRef.current, data: out }).catch(() => {});
    }

    term.onResize(({ cols, rows }) => {
      invoke("resize", { id: connIdRef.current, cols, rows }).catch(() => {});
    });

    // Copiar al seleccionar, como PuTTY/SecureCRT.
    term.onSelectionChange(() => {
      if (!settingsRef.current.copyOnSelect) return;
      const sel = term.getSelection();
      if (sel) writeText(sel).catch(() => {});
    });

    // Pegado seguro. En un equipo remoto, lo que se ejecuta al pegar equivale a escribirlo: se analiza
    // (líneas, caracteres especiales, riesgo por línea con computeRisk) y se confirma con la misma regla que
    // Notas, catálogo y botones (ver lib/pasteGuard). Una sola línea sin Enter final no se ejecuta: pasa directo.
    // El texto llega sin ESC ni C1 (sanitizePaste): ningún marcador "ESC[201~", tampoco anidado, puede cerrar el
    // pegado entre corchetes antes de tiempo y hacer que la shell o vim ejecuten el resto como si se tecleara.
    const handlePaste = (text: string) => {
      if (readOnlyRef.current) return notify(READ_ONLY_MSG);
      if (lineRun) return notify("Envío línea a línea en curso: Esc lo detiene");
      const a = analyzePaste(text);
      // Terminal local y aplicaciones de pantalla completa (vim, nano, less: búfer alterno): no se evalúa el riesgo
      // (term.paste respeta el pegado entre corchetes que active la aplicación), pero los caracteres de control
      // (Ctrl-*, retroceso, invisibles) se confirman igual: remote false en pasteDecision.
      const remote = sessionRef.current.type !== "local" && term.buffer.active.type !== "alternate";
      const d = pasteDecision(a, { remote, confirmSend: settingsRef.current.confirmSend });
      if (d.ask) setPasteAsk({ text, a, d });
      else term.paste(text);
    };
    const paste = async () => {
      const text = sanitizePaste(await readText().catch(() => ""));
      if (!text) return;
      handlePaste(text);
    };
    // Cmd+V en macOS llega por el menú nativo como evento "paste", sin pasar por paste().
    const onNativePaste = (e: ClipboardEvent) => {
      if (readOnlyRef.current) {
        e.preventDefault();
        e.stopPropagation();
        return notify(READ_ONLY_MSG);
      }
      // Siempre se toma el evento: si xterm lo procesara, pegaría el texto sin limpiar (o lo que quede tras limpiarlo).
      e.preventDefault();
      e.stopPropagation();
      const text = sanitizePaste(e.clipboardData?.getData("text/plain") ?? "");
      if (!text) return;
      handlePaste(text);
    };
    /**
     * Envío línea a línea: escribe una línea, espera la pausa (y opcionalmente el prompt, con la misma espera que los
     * comandos al conectar) y sigue. Para consolas lentas. Esc o "Detener" lo cortan tras la línea en curso.
     */
    let progressAt = 0;
    const sendLines = async (text: string, o: LineSendOpts) => {
      if (lineRun || statusRef.current !== "connected" || readOnlyRef.current) return;
      const chunks = pasteChunks(text, "\r");
      if (!chunks.length) return;
      const run = { stop: false };
      lineRun = run;
      lineStopRef.current = () => {
        run.stop = true;
      };
      const connId = connIdRef.current;
      const total = chunks.length;
      let done = 0;
      let state: LineSendState["state"] = "done";
      let reason: string | undefined;
      setLineSend({ done: 0, total, state: "run" });
      for (const chunk of chunks) {
        if (run.stop) {
          state = "stopped";
          break;
        }
        if (disposed || connIdRef.current !== connId || statusRef.current !== "connected") {
          state = "stopped";
          reason = "se perdió la conexión";
          break;
        }
        if (readOnlyRef.current) {
          state = "stopped";
          reason = "la pestaña pasó a solo lectura";
          break;
        }
        const ends = chunk.endsWith("\r");
        if (ends) autoMark();
        const sent = Date.now();
        if (tracking()) tracker.input(chunk);
        sendInput(chunk);
        done++;
        const now = performance.now();
        if (now - progressAt > 60) {
          progressAt = now;
          setLineSend({ done, total, state: "run" });
        }
        if (!ends) continue;
        if (o.waitPrompt) await waitReady(connId, sent, 8000, () => run.stop);
        if (o.delayMs > 0) await new Promise((r) => setTimeout(r, o.delayMs));
      }
      lineRun = null;
      lineStopRef.current = null;
      if (!disposed) {
        setLineSend({ done, total, state, reason });
        window.setTimeout(() => setLineSend((cur) => (cur && cur.state !== "run" && cur.done === done ? null : cur)), 4000);
      }
    };
    lineStartRef.current = (text, o) => void sendLines(text, o);
    hostRef.current!.addEventListener("paste", onNativePaste, true);

    // Texto de la línea del cursor (para reconocer un prompt de Huawei sin plataforma detectada).
    const currentLineText = () => {
      const b = term.buffer.active;
      return b.getLine(b.baseY + b.cursorY)?.translateToString(true) ?? "";
    };
    term.attachCustomKeyEventHandler((e) => {
      // Una tecla que tomaron las sugerencias tampoco llega como "keypress" (Enter en la lista).
      if (e.type === "keydown") swallowPress = false;
      else if (e.type === "keypress" && swallowPress) return false;
      if (e.type !== "keydown") return true;
      lastKeyAt = performance.now();
      // Retroceso según la sesión (DEL o BS): xterm lo envía igual y onData lo traduce.
      backspaceKey =
        e.key === "Backspace"
          ? backspaceSeq(
              e,
              backspaceMode(sessionRef.current, currentLineText()),
              term.buffer.active.type !== "alternate",
            )
          : null;
      if (suggestKeyDown(e)) {
        e.preventDefault();
        e.stopPropagation();
        swallowPress = true;
        return false;
      }
      const key = e.key.toLowerCase();
      // Copiar/pegar explícito en Windows/Linux (en macOS lo resuelve el menú Edición nativo).
      if (!isMac && e.ctrlKey && e.shiftKey && key === "c") {
        const sel = term.getSelection();
        if (sel) writeText(sel).catch(() => {});
        return false;
      }
      if (!isMac && e.ctrlKey && e.shiftKey && key === "v") {
        paste();
        return false;
      }
      if (!isMac && e.shiftKey && key === "insert") {
        paste();
        return false;
      }
      // Los atajos de la app no llegan a la sesión remota.
      return shortcutFor(e) === null;
    });

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      if (settingsRef.current.rightClickPaste) paste();
    };
    hostRef.current!.addEventListener("contextmenu", onContextMenu);

    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (hostRef.current && hostRef.current.offsetWidth > 0) fit.fit();
      });
    });
    observer.observe(hostRef.current!);

    register(id, {
      connId: () => connIdRef.current,
      reconnect: () => {
        invoke("disconnect", { id: connIdRef.current }).catch(() => {});
        term.write("\r\n");
        connect();
      },
      openFind: () => setFindOpen(true),
      closeFind: () => closeFindRef.current(),
      focus: () => term.focus(),
      getSelection: () => term.getSelection(),
      isConnected: () => statusRef.current === "connected",
      send: async (text, lineDelayMs) => {
        // Solo lectura (o un envío línea a línea en curso): nada llega al equipo. App avisa antes; esto es la red de seguridad.
        if (readOnlyRef.current) {
          notify(READ_ONLY_MSG);
          throw new Error(READ_ONLY_MSG);
        }
        if (lineRun) throw new Error("Hay un envío línea a línea en curso en esta pestaña");
        const data = text.replace(/\r?\n/g, newline());
        if (lineDelayMs <= 0) {
          autoMark();
          await invoke("write", { id: connIdRef.current, data });
          return;
        }
        const lines = data.split(/(?<=\r\n|\r(?!\n)|(?<!\r)\n)/);
        for (const line of lines) {
          if (disposed || statusRef.current !== "connected" || readOnlyRef.current) break;
          autoMark();
          await invoke("write", { id: connIdRef.current, data: line });
          await new Promise((r) => setTimeout(r, lineDelayMs));
        }
      },
      type: (text) => {
        if (readOnlyRef.current) return notify(READ_ONLY_MSG);
        if (statusRef.current === "connected") invoke("write", { id: connIdRef.current, data: text }).catch(() => {});
        term.focus();
      },
      disconnect,
      notice: (text) => term.write(`\r\n${dim(`── ${text} ──`)}\r\n`),
      clearScrollback: () => term.clear(),
      reset: () => term.reset(),
      openHighlight: () => {
        setHlList(hlEngine.list());
        setHlCapped(hlEngine.capped);
        setDialog("hl");
      },
      openMarks: () => {
        setMarkList(markEngine.list());
        setDialog("marks");
      },
      markHere: () => {
        // Con texto seleccionado la marca va en su primera línea; si no, en la línea del cursor.
        const sel = term.hasSelection() ? term.getSelectionPosition() : undefined;
        const r = markEngine.mark("manual", sel?.start.y);
        notify(
          r === "add"
            ? "Línea marcada"
            : r === "remove"
              ? "Marca quitada"
              : r === "promote"
                ? "Marca fijada"
                : r === "alt"
                  ? "Las pantallas completas (vim, less) no admiten marcadores"
                  : "No se pudo marcar esta línea",
        );
        term.focus();
      },
      jumpMark: (dir) => {
        const r = markEngine.jump(dir);
        notify(
          r
            ? `Marcador ${r.index} de ${r.total}: ${r.info.text}`
            : markEngine.count
              ? `No hay marcadores ${dir === "prev" ? "anteriores" : "siguientes"}`
              : "No hay marcadores: usa «Marcar aquí»",
        );
        term.focus();
      },
      recentText: (n) => {
        // Hasta la fila del cursor: las filas en blanco del viewport bajo él no cuentan (ver recentRows).
        const buf = term.buffer.active;
        const [start, end] = recentRows(buf, n);
        const out: string[] = [];
        for (let i = start; i < end; i++) out.push(buf.getLine(i)?.translateToString(true) ?? "");
        return out.join("\n");
      },
      copyAll: async () => {
        const buf = term.buffer.active;
        const lines: string[] = [];
        for (let i = 0; i < buf.length; i++) lines.push(buf.getLine(i)?.translateToString(true) ?? "");
        while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
        await writeText(lines.join("\n"));
        return lines.length;
      },
    });

    connect();
    const host = hostRef.current!;

    return () => {
      // Pestaña de transferencia cerrada antes de que el proceso terminara: el gestor no verifica.
      if (sessionRef.current.scp && statusRef.current !== "closed") notifyScpExit(sessionRef.current.id, null, true);
      disposed = true;
      window.clearTimeout(screenTimer);
      unlockResolve.current?.(false);
      releaseChannels();
      cancelRetry();
      hl.dispose();
      if (lineRun) lineRun.stop = true;
      window.clearTimeout(flashTimer);
      hlEngine.dispose();
      markEngine.dispose();
      hlRef.current = null;
      marksRef.current = null;
      lineStartRef.current = null;
      lineStopRef.current = null;
      register(id, null);
      observer.disconnect();
      cancelAnimationFrame(frame);
      cancelAnimationFrame(suggestFrame);
      window.clearTimeout(hintTimer);
      suggestRef.current = null;
      host.removeEventListener("contextmenu", onContextMenu);
      host.removeEventListener("paste", onNativePaste, true);
      invoke("disconnect", { id: connIdRef.current }).catch(() => {});
      term.dispose();
    };
    // El terminal vive mientras exista la pestaña; tema y fuente se actualizan aparte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    const term = termRef.current;
    if (term) term.options.theme = theme;
  }, [theme]);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.fontFamily = fontStack(settings.fontFamily);
    term.options.fontSize = settings.fontSize;
    term.options.lineHeight = settings.lineHeight;
    term.options.cursorStyle = settings.cursorStyle;
    term.options.cursorBlink = settings.cursorBlink;
    term.options.scrollback = settings.scrollback;
    fitRef.current?.fit();
  }, [
    settings.fontFamily,
    settings.fontSize,
    settings.lineHeight,
    settings.cursorStyle,
    settings.cursorBlink,
    settings.scrollback,
  ]);

  // WebGL solo en la pestaña visible: Chromium limita los contextos WebGL activos y, con
  // muchas pestañas, perdía los más antiguos sin control. Al ocultarse se libera tras un
  // rato (cambiar de pestaña y volver no lo recrea) y se usa el renderizador DOM.
  const webglRef = useRef<WebglAddon | null>(null);
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    if (visible) {
      if (!webglRef.current) {
        try {
          const webgl = new WebglAddon();
          webgl.onContextLoss(() => {
            webgl.dispose();
            if (webglRef.current === webgl) webglRef.current = null;
          });
          term.loadAddon(webgl);
          webglRef.current = webgl;
        } catch {
          // Sin WebGL se usa el renderizador DOM.
        }
      }
      fitRef.current?.fit();
      return;
    }
    const release = window.setTimeout(() => {
      webglRef.current?.dispose();
      webglRef.current = null;
    }, 30_000);
    return () => window.clearTimeout(release);
  }, [visible]);

  useEffect(() => {
    if (active) termRef.current?.focus();
  }, [active]);
  // Un diálogo de la pestaña no sobrevive a que deje de verse (cambio de pestaña con el teclado): su trampa de foco
  // quedaría activa sin que se vea. Un pegado pendiente se cancela: no se escribe nada.
  useEffect(() => {
    if (!visible) {
      setDialog(null);
      setPasteAsk(null);
    }
  }, [visible]);

  // Sugerencias: al activarlas se parte sin seguimiento (hasta el próximo prompt); la
  // sugerencia se recalcula al cambiar foco, visibilidad, plataforma, catálogo, tema, fuente o sus ajustes.
  useEffect(() => {
    suggestRef.current?.reset();
  }, [settings.commandSuggest, readOnly]);
  // Al activar o desactivar el modo, el backend rechaza (o vuelve a aceptar) las escrituras de la conexión actual.
  useEffect(() => {
    if (!connIdRef.current || roSent.current === readOnly) return;
    roSent.current = readOnly;
    invoke("set_read_only", { id: connIdRef.current, on: readOnly }).catch(() => {});
  }, [readOnly]);
  useEffect(() => {
    suggestRef.current?.refresh();
  }, [active, visible, settings.commandSuggest, session.platform, catalog, theme, settings.fontFamily, settings.fontSize, settings.lineHeight, settings.suggestColor, settings.suggestStyle, settings.suggestTip, settings.suggestTabAccept]);
  // Lista abierta: el foco sigue en la terminal (su textarea), así que es ella la que anuncia
  // la opción activa a los lectores de pantalla (patrón combobox de ARIA 1.2).
  useEffect(() => {
    const ta = termRef.current?.textarea;
    if (!ta) return;
    if (!suggestList) {
      for (const a of ["aria-activedescendant", "aria-controls", "aria-expanded", "aria-autocomplete"]) ta.removeAttribute(a);
      return;
    }
    ta.setAttribute("aria-autocomplete", "list");
    ta.setAttribute("aria-controls", listId);
    ta.setAttribute("aria-expanded", "true");
    ta.setAttribute("aria-activedescendant", `${listId}-${suggestList.sel}`);
  }, [suggestList, listId]);

  /**
   * Busca `q` y deja el resultado a la vista. `incremental`: al escribir, la coincidencia actual se
   * mantiene mientras siga valiendo (no salta a otra con cada letra). Sin coincidencias el addon no
   * avisa en todos los casos: se marca aquí para que "Sin resultados" aparezca siempre.
   */
  const runFind = (q: string, back = false, incremental = false) => {
    const addon = searchRef.current;
    if (!addon) return;
    if (!q) {
      addon.clearDecorations();
      setFound(null);
      return;
    }
    const opts = {
      incremental,
      decorations: {
        matchOverviewRuler: "#e6c06b",
        activeMatchColorOverviewRuler: "#ef6b73",
        matchBackground: "#e6c06b55",
        activeMatchBackground: "#ef6b73aa",
      },
    };
    const ok = back ? addon.findPrevious(q, opts) : addon.findNext(q, opts);
    if (!ok) setFound({ index: -1, count: 0 });
  };
  const findNext = (back = false) => runFind(query, back);

  // Búsqueda en vivo mientras se escribe: con 150 ms de pausa, para no recorrer un historial grande
  // en cada letra. El addon cuenta como máximo FIND_LIMIT coincidencias (se muestra "1000+").
  useEffect(() => {
    if (!findOpen) return;
    const t = window.setTimeout(() => runFind(query, false, true), 150);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, findOpen]);

  const onFindStateRef = useRef(onFindState);
  onFindStateRef.current = onFindState;
  useEffect(() => {
    onFindStateRef.current?.(id, findOpen);
    return () => onFindStateRef.current?.(id, false);
  }, [id, findOpen]);

  const closeFind = () => {
    setFindOpen(false);
    setFound(null);
    searchRef.current?.clearDecorations();
    termRef.current?.focus();
  };
  const closeFindRef = useRef(closeFind);
  closeFindRef.current = closeFind;

  return (
    <div
      ref={wrapRef}
      className={rect ? "absolute" : "absolute inset-0"}
      style={{ ...(rect ? paneBodyStyle(rect) : null), visibility: visible ? "visible" : "hidden", background: theme.background }}
      onMouseDownCapture={rect && !active && onFocusPane ? () => onFocusPane(id) : undefined}
    >
      <div ref={hostRef} className="w-full h-full" />
      {/* Sugerencia y su ayuda: solo visual (aria-hidden, sin eventos), la dibuja la terminal sin render por tecla. */}
      <div ref={ghostRef} aria-hidden="true" className="absolute z-[5] pointer-events-none select-none whitespace-pre overflow-hidden" style={{ display: "none" }}>
        <span ref={ghostTextRef} style={{ textUnderlineOffset: "3px" }} />
        <span ref={ghostTipRef} className="rounded border px-1 tracking-normal" style={{ display: "none", letterSpacing: "normal" }} />
      </div>
      {/* Aviso de plataforma desconocida (una vez por pestaña): lo muestra la terminal. */}
      <div ref={hintRef} role="status" className="absolute z-[6] pointer-events-none rounded-md border border-line bg-panel px-2 py-1 text-[11px] text-muted shadow-pop whitespace-nowrap" style={{ display: "none" }} />
      {suggestList && (
        <SuggestPopup
          list={suggestList}
          listId={listId}
          fontFamily={fontStack(settings.fontFamily)}
          onPick={(e) => suggestRef.current?.pick(e, suggestList.buf, false)}
        />
      )}
      {suggestAsk && (
        <ConfirmDialog
          title={suggestAsk.entry.risk === "disruptive" ? "Este comando puede cortar servicio" : "Este comando cambia configuración o estado"}
          message={`${riskLabel[suggestAsk.entry.risk]} en ${session.name}. Se escribe en la línea sin ejecutarlo (sin Enter):\n\n${suggestAsk.buf.trimStart()}${remainderToInsert(suggestAsk.entry, suggestAsk.q)}`}
          confirmLabel="Insertar"
          danger={suggestAsk.entry.risk === "disruptive"}
          onCancel={() => {
            setSuggestAsk(null);
            termRef.current?.focus();
          }}
          onConfirm={() => {
            suggestRef.current?.pick(suggestAsk.entry, suggestAsk.buf, true);
            setSuggestAsk(null);
            termRef.current?.focus();
          }}
        />
      )}
      {unlockAsk && (
        <div
          role="dialog"
          aria-modal="true"
          className="absolute left-1/2 top-6 -translate-x-1/2 w-[min(440px,92%)] bg-panel border border-line rounded-xl shadow-pop p-4 z-20 space-y-2"
          onKeyDown={(e) => {
            if (e.key === "Escape") unlockResolve.current?.(false);
          }}
        >
          <h3 className="text-[13px] font-semibold">Bóveda de contraseñas bloqueada</h3>
          <p className="text-[12px] text-muted">
            {session.name} tiene una contraseña guardada. Desbloquea la bóveda para completarla al conectar.
          </p>
          <VaultUnlock autoFocus onUnlocked={() => unlockResolve.current?.(true)} />
          <div className="flex justify-end">
            <button
              onClick={() => unlockResolve.current?.(false)}
              className="px-3 h-7 rounded-md text-[12px] text-muted hover:text-fg hover:bg-hover"
            >
              Conectar sin autocompletar
            </button>
          </div>
        </div>
      )}
      {pasteAsk !== null && (
        <PasteDialog
          target={session.name}
          analysis={pasteAsk.a}
          decision={pasteAsk.d}
          defaultDelay={settings.sendLineDelay || 100}
          onPaste={() => {
            termRef.current?.paste(pasteAsk.text);
            setPasteAsk(null);
            refocus();
          }}
          onLineByLine={(o) => {
            lineStartRef.current?.(pasteAsk.text, o);
            setPasteAsk(null);
            refocus();
          }}
          onCancel={() => {
            setPasteAsk(null);
            refocus();
          }}
        />
      )}
      {dialog === "hl" && (
        <HighlightDialog
          tabName={session.name}
          items={hlList}
          capped={hlCapped}
          onAdd={(spec) => {
            const eng = hlRef.current;
            if (!eng) return "La terminal no está lista";
            const err = validateHl(spec, eng.list());
            if (err) return err;
            eng.add({ id: ++hlSeq.current, ...spec });
            setHlList(eng.list());
            return null;
          }}
          onRemove={(rid) => {
            hlRef.current?.remove(rid);
            setHlList(hlRef.current?.list() ?? []);
            setHlCapped(false);
          }}
          onClear={() => {
            hlRef.current?.clear();
            setHlList([]);
            setHlCapped(false);
          }}
          onClose={() => {
            setDialog(null);
            refocus();
          }}
        />
      )}
      {dialog === "marks" && (
        <MarksDialog
          tabName={session.name}
          items={markList}
          autoMark={!!settings.autoMarkCommands}
          onAutoMark={(v) => onAutoMarkRef.current?.(v)}
          onGoto={(line) => {
            marksRef.current?.goto(line);
            setDialog(null);
            refocus();
          }}
          onRemove={(mid) => {
            marksRef.current?.remove(mid);
            setMarkList(marksRef.current?.list() ?? []);
          }}
          onClear={() => {
            marksRef.current?.clear();
            setMarkList([]);
          }}
          onClose={() => {
            setDialog(null);
            refocus();
          }}
        />
      )}
      {lineSend && <LineSendBar s={lineSend} onStop={() => lineStopRef.current?.()} />}
      <p role="status" aria-live="polite" className="sr-only">
        {announce}
      </p>
      {/* Avisos breves de la pestaña (marcadores, solo lectura): se actualizan por DOM, sin render por tecla. */}
      <div
        ref={flashRef}
        role="status"
        aria-live="polite"
        className="absolute top-3 left-1/2 -translate-x-1/2 z-[14] max-w-[min(520px,90%)] truncate pointer-events-none rounded-md border border-line bg-panel px-3 py-1.5 text-[12px] shadow-pop transition-opacity"
        style={{ opacity: 0 }}
      />
      {readOnly && (
        <div
          aria-hidden
          className="absolute bottom-1.5 right-5 z-[4] pointer-events-none flex items-center gap-1 rounded-md border border-line bg-panel/90 px-1.5 py-0.5 text-[11px] text-muted"
          title="Solo lectura: la pestaña no envía nada al equipo"
        >
          <Lock size={11} />
          Solo lectura
        </div>
      )}
      {findOpen && (
        <div
          role="search"
          aria-label="Buscar en la terminal"
          className="absolute top-2 right-4 max-w-[calc(100%-2rem)] flex items-center gap-1 bg-panel border border-line rounded-lg shadow-pop px-2 py-1.5 z-10"
        >
          <input
            autoFocus
            className="field !h-7 !w-48 min-w-0"
            placeholder="Buscar en la terminal"
            aria-label="Buscar en la terminal"
            value={query}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => {
              setQuery(e.target.value);
              if (!e.target.value) setFound(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") findNext(e.shiftKey);
              if (e.key === "Escape") closeFind();
            }}
          />
          {/* Región siempre montada: un lector de pantalla anuncia el cambio del conteo o "Sin resultados". */}
          <span role="status" aria-live="polite" className="min-w-14 text-center text-[12px] tabular-nums">
            {query && found ? (
              found.count > 0 ? (
                <span className="text-muted">
                  {found.index >= 0 ? `${found.index + 1}/` : ""}
                  {found.count >= FIND_LIMIT ? `${FIND_LIMIT}+` : found.count}
                </span>
              ) : (
                <span className="text-warn font-medium">Sin resultados</span>
              )
            ) : null}
          </span>
          <IconBtn title="Coincidencia anterior (Shift+Enter)" onClick={() => findNext(true)}>
            <ChevronUp size={15} />
          </IconBtn>
          <IconBtn title="Coincidencia siguiente (Enter)" onClick={() => findNext()}>
            <ChevronDown size={15} />
          </IconBtn>
          <IconBtn title="Cerrar la búsqueda (Esc)" onClick={closeFind}>
            <X size={15} />
          </IconBtn>
        </div>
      )}
    </div>
  );
});

/** Lista de sugerencias: el foco sigue en la terminal, que maneja las flechas. */
function SuggestPopup({ list, listId, fontFamily, onPick }: { list: SuggestList; listId: string; fontFamily: string; onPick: (e: SuggestEntry) => void }) {
  const selRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    selRef.current?.scrollIntoView({ block: "nearest" });
  }, [list.sel]);
  return (
    <div
      className="absolute z-10 w-[min(560px,calc(100%-16px))] bg-panel border border-line rounded-lg shadow-pop text-[12px] overflow-hidden"
      style={{ left: list.left, top: list.top, bottom: list.bottom }}
      // Clic sin quitar el foco a la terminal.
      onMouseDown={(e) => e.preventDefault()}
    >
      <ul role="listbox" id={listId} aria-label="Sugerencias de comandos" className="max-h-64 overflow-y-auto py-1">
        {list.items.map((it, i) => (
          <li
            key={it.cmd}
            ref={i === list.sel ? selRef : undefined}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === list.sel}
            onClick={() => onPick(it)}
            className={`px-2.5 py-1 cursor-pointer ${i === list.sel ? "bg-selected" : "hover:bg-hover"}`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="truncate whitespace-pre" style={{ fontFamily }}>
                {matchSpans(it, list.q).map((p, j) => (p.hit ? <span key={j} className="font-semibold">{p.text}</span> : p.text))}
              </span>
              {it.risk !== "read" && (
                <span className="ml-auto shrink-0 rounded px-1.5 text-[11px] font-medium bg-danger text-danger-fg">{riskLabel[it.risk]}</span>
              )}
            </div>
            <div className="text-[11px] text-muted truncate">{it.desc}</div>
          </li>
        ))}
      </ul>
      <div className="px-2.5 py-1 border-t border-line text-[11px] text-muted">↑↓ elegir · Enter escribe sin ejecutar · Esc cerrar</div>
    </div>
  );
}

function IconBtn(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      aria-label={props.title}
      {...props}
      className="w-7 h-7 grid place-items-center rounded-md text-muted hover:text-fg hover:bg-hover"
    />
  );
}
