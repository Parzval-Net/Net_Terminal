import { type ReactNode, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { moveItem } from "./lib/tabDrag";
import {
  addSessions,
  cmdHistoryAdd,
  cmdpackDelete,
  cmdpackSave,
  cmdpacksList,
  credDelete,
  credSet,
  deleteSession as apiDeleteSession,
  importScript,
  listSessions,
  logsDirSet,
  mcpConfigure,
  mcpDecide,
  runScript as apiRunScript,
  saveSession as apiSaveSession,
  sendBreak,
  serverRunning,
  setLogging,
  stopScript,
  updateSessions as apiUpdateSessions,
} from "./lib/api";
import { Sidebar } from "./components/Sidebar";
import { TabBar, type TabBarProps } from "./components/TabBar";
import { VerticalTabs } from "./components/VerticalTabs";
import { StatusBar } from "./components/StatusBar";
import { ActivityBar } from "./components/ActivityBar";
import { HistoryMenu } from "./components/HistoryMenu";
import { Toasts, type ToastItem, type ToastKind } from "./components/Toasts";
import { errText, failText } from "./lib/errors";
import { TerminalView, TermController } from "./components/TerminalView";
import type { CredChange } from "./components/SessionModal";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { hopCloseNote, runningHops } from "./lib/hopTab";
import { CloseManyMessage } from "./components/CloseManyMessage";
import { CloseScope, summarizeClose, tabsToClose } from "./lib/closeAll";
import { NotesPanel } from "./components/NotesPanel";
import { CommandsPanel } from "./components/CommandsPanel";
import { vendorFor } from "./lib/commands";
import { CatalogEntry, Pack, PackCommand, Risk, buildCatalog, computeRisk, orderPacks, riskLabel, validatePack } from "./lib/packs";
import type { ScpRequest } from "./components/tools/FileManager";

import { TemplateDialog, templateVars } from "./components/TemplateDialog";
import { compile, effectiveRules } from "./lib/highlight";
import { allFolders } from "./lib/folders";
import { useMonitors } from "./lib/monitors";
import { ButtonBar } from "./components/ButtonBar";
import type { ApprovalRequest } from "./components/ApprovalDialog";
import { ScriptPrompts } from "./components/ScriptPrompts";
import type { ScriptLaunch } from "./components/ScriptLaunchDialog";
import type { Section } from "./components/SettingsModal";
import type { Macro } from "./lib/settings";
import { openUrl } from "@tauri-apps/plugin-opener";
import { BookOpen, NotebookPen, Pin, Search as SearchIcon, Sparkles, SquareTerminal, Wrench, X as XIcon, Zap, Plus } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { ConnStatus, Session, Tab, TabState, historyKey, tabTitle } from "./types";
import { closeAllLabel, focusLabel, historyLabel, isMac, localOsVendor, modLabel } from "./lib/platform";
import { presets, resolvePreset, useSystemDark } from "./lib/theme";
import { DataNotices, Settings, logOptions, useSettings } from "./lib/settings";
import { useAlerts } from "./lib/alerts";
import { useUpdater } from "./lib/useUpdater";
import { useShortcuts } from "./lib/useShortcuts";
import { useAppLayout } from "./lib/useAppLayout";
import { useTabPlatform } from "./lib/useTabPlatform";
import { BroadcastBar, BroadcastDialog } from "./components/BroadcastDialog";
import { Resolved, getBroadcastRun, isBroadcastRunning, publishWorkspace, stopBroadcast, resolveTargets, runBroadcast, targetLabel, useBroadcastTarget, useWorkspace } from "./lib/broadcast";
import { closeLab, isLabRunning, labOwns, openLab, useLabOpen } from "./lib/cliLab";
import { persist, stored } from "./lib/prefs";
import { SplitPanes } from "./components/SplitPanes";
import { SplitLayout, SplitState, fillPanes, paneRect } from "./lib/split";
import logo from "./assets/logo.svg";
import { plural } from "./lib/plural";
import { useVaultAutoLock } from "./lib/vaultLock";
import { isQuickSession } from "./components/SessionIcon";
import "./App.css";

// Vistas pesadas y de uso ocasional: se cargan aparte para aligerar el arranque.
const ToolsView = lazy(() => import("./components/tools/ToolsView").then((m) => ({ default: m.ToolsView })));
const SettingsModal = lazy(() => import("./components/SettingsModal").then((m) => ({ default: m.SettingsModal })));
const ImportDialog = lazy(() => import("./components/ImportDialog").then((m) => ({ default: m.ImportDialog })));

/**
 * Diálogos que solo se montan al abrirse: fuera del arranque, en chunks propios que se precargan
 * cuando la app queda libre (abrirlos después no espera la descarga).
 */
const DIALOGS = {
  session: () => import("./components/SessionModal").then((m) => m.SessionModal),
  palette: () => import("./components/CommandPalette").then((m) => m.CommandPalette),
  quick: () => import("./components/QuickConnectDialog").then((m) => m.QuickConnectDialog),
  packs: () => import("./components/PacksModal").then((m) => m.PacksModal),
  cmdEditor: () => import("./components/CommandEditor").then((m) => m.CommandEditor),
  macro: () => import("./components/MacroModal").then((m) => m.MacroModal),
  approval: () => import("./components/ApprovalDialog").then((m) => m.ApprovalDialog),
  script: () => import("./components/ScriptLaunchDialog").then((m) => m.ScriptLaunchDialog),
  exportSessions: () => import("./components/ExportSessionsDialog").then((m) => m.ExportSessionsDialog),
  cliLab: () => import("./components/CliLab").then((m) => m.CliLab),
};
function lazyDialog<P extends object>(load: () => Promise<React.ComponentType<P>>) {
  // Sin React.lazy: Suspense retiene hasta 300 ms el contenido que reemplaza al fallback, y el
  // diálogo tardaba en aparecer aunque ya estuviera precargado.
  let Comp: React.ComponentType<P> | null = null;
  let pending: Promise<void> | null = null;
  const preload = () => (pending ??= load().then((c) => void (Comp = c)));
  function LazyDialog(props: P) {
    const [, loaded] = useState(false);
    useEffect(() => {
      if (!Comp) preload().then(() => loaded(true), console.error);
    }, []);
    return Comp ? <Comp {...props} /> : null;
  }
  LazyDialog.preload = preload;
  return LazyDialog;
}
const SessionModal = lazyDialog(DIALOGS.session);
const CommandPalette = lazyDialog(DIALOGS.palette);
const QuickConnectDialog = lazyDialog(DIALOGS.quick);
const PacksModal = lazyDialog(DIALOGS.packs);
const CommandEditor = lazyDialog(DIALOGS.cmdEditor);
const MacroModal = lazyDialog(DIALOGS.macro);
const ApprovalDialog = lazyDialog(DIALOGS.approval);
const ScriptLaunchDialog = lazyDialog(DIALOGS.script);
const ExportSessionsDialog = lazyDialog(DIALOGS.exportSessions);
const CliLab = lazyDialog(DIALOGS.cliLab);
const LAZY_DIALOGS = [SessionModal, CommandPalette, QuickConnectDialog, PacksModal, CommandEditor, MacroModal, ApprovalDialog, ScriptLaunchDialog];

const LOCAL: Session = { id: "local", name: "Terminal local", type: "local", created_at: "" };

/**
 * Manejadores con identidad estable que siempre llaman a la versión más reciente: los
 * paneles memorizados no se vuelven a dibujar cada vez que App lo hace.
 */
function useHandlers<T extends Record<string, (...args: never[]) => unknown>>(handlers: T): T {
  const ref = useRef(handlers);
  ref.current = handlers;
  return useMemo(() => {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(ref.current)) out[k] = (...args: never[]) => ref.current[k](...args);
    return out as T;
  }, []);
}

let tabSeq = 0;

export default function App() {
  const [settings, update, dataNotices] = useSettings();
  useVaultAutoLock(settings?.vaultAutoLockMin, settings?.vaultLockOnSleep);
  // Espera los ajustes para no mostrar un tema y luego cambiarlo.
  if (!settings) return null;
  return <Workspace settings={settings} update={update} dataNotices={dataNotices} />;
}

function Workspace({
  settings,
  update,
  dataNotices,
}: {
  settings: Settings;
  update: (p: Partial<Settings> | ((s: Settings) => Partial<Settings>)) => void;
  /** Avisos de los archivos de datos: restaurado desde respaldo, versión posterior, error al guardar. */
  dataNotices: DataNotices;
}) {
  const systemDark = useSystemDark();
  const dark = settings.appTheme === "system" ? systemDark : settings.appTheme === "dark";
  const preset = resolvePreset(settings.terminalTheme, dark);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<Section | undefined>();
  const [macroEdit, setMacroEdit] = useState<Macro | null | undefined>(undefined);
  const [scriptRun, setScriptRun] = useState<{ run: string; script: string; targets: number } | null>(null);
  const scriptRunRef = useRef(scriptRun);
  scriptRunRef.current = scriptRun;
  const [scriptLaunch, setScriptLaunch] = useState<string | null>(null);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [mcpStatus, setMcpStatus] = useState("");
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastSeq = useRef(0);
  /** Misma firma de siempre; el cierre (y su pausa al leer) lo maneja cada aviso en Toasts.tsx. */
  const toast = useCallback((text: string, kind: ToastKind = "info") => {
    const id = ++toastSeq.current;
    // Un aviso idéntico reemplaza al anterior (un monitor caído no apila el mismo error).
    setToasts((t) => [...t.filter((x) => !(x.text === text && x.kind === kind)).slice(-3), { id, text, kind }]);
  }, []);
  const closeToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  // Avisos de una sola vez sobre los datos (ya vienen deduplicados) y error del último guardado.
  useEffect(() => {
    if (!dataNotices.messages.length) return;
    for (const m of dataNotices.messages) toast(m, m.includes("dañado") ? "error" : "info");
    dataNotices.dismiss();
  }, [dataNotices, toast]);
  useEffect(() => {
    if (dataNotices.saveError) toast(dataNotices.saveError, "error");
  }, [dataNotices.saveError, toast]);
  /** Error del backend con su contexto: "No se pudo <acción>. Motivo: …". */
  const toastFail = useCallback((action: string, e: unknown) => toast(failText(action, e), "error"), [toast]);
  const [confirm, setConfirm] = useState<{
    title: string;
    message: ReactNode;
    label: string;
    danger?: boolean;
    defaultCancel?: boolean;
    action: () => void;
  } | null>(null);
  const [template, setTemplate] = useState<{ text: string; then: (filled: string) => void } | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [states, setStates] = useState<Record<string, TabState>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  /** `tabId`: la pestaña de conexión rápida que pasa a usar la sesión guardada. */
  const [modal, setModal] = useState<{ session?: Session; folder?: string; tabId?: string } | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const labOpen = useLabOpen();
  /** Exportar sesiones: undefined cerrado, "" todas, o la carpeta preseleccionada. */
  const [exportFolder, setExportFolder] = useState<string | undefined>(undefined);
  const {
    sidebarWidth,
    focusMode,
    setFocusMode,
    peek,
    setPeek,
    peekRef,
    notesOpen,
    setNotesOpen,
    commandsOpen,
    setCommandsOpen,
    rootRef,
    rowRef,
    areaRef,
    sidebarAutoHidden,
    sidebarHiddenBy,
    sidebarShown,
    panelOverlay,
    panelWidth,
    actions: layoutActions,
  } = useAppLayout({ fontSize: settings.fontSize, floatingSidebar: settings.floatingSidebar, activeId });
  const controllers = useRef(new Map<string, TermController>());

  /** La barra de botones se oculta sola sin botones; esto la muestra igual (scripts) desde la paleta. */
  const [barForced, setBarForced] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = dark ? "dark" : "light";
    root.style.setProperty("--term-bg", String(preset.theme.background));
    root.style.setProperty("--term-fg", String(preset.theme.foreground));
  }, [dark, preset]);

  // Servidor MCP: se (re)configura cuando cambian sus ajustes.
  useEffect(() => {
    mcpConfigure({
      enabled: settings.mcpEnabled,
      port: settings.mcpPort,
      token: settings.mcpToken,
      requireApproval: settings.mcpApproval,
      readOnly: settings.mcpReadOnly,
    })
      .then(setMcpStatus)
      .catch((e) => {
        setMcpStatus(String(e));
        if (settings.mcpEnabled) toastFail("iniciar el servidor MCP", e);
      });
  }, [settings.mcpEnabled, settings.mcpPort, settings.mcpToken, settings.mcpApproval, settings.mcpReadOnly, toastFail]);

  useEffect(() => {
    const un = listen("open-settings", () => setSettingsOpen(true));
    return () => {
      un.then((f) => f());
    };
  }, []);

  // Carpeta de logs elegida por el usuario: el backend la valida y la usa para los logs nuevos.
  // Si no está disponible (pendrive o unidad de red sin montar al abrir) se usa la
  // predeterminada solo en esta ejecución: el ajuste se conserva para la próxima vez.
  useEffect(() => {
    logsDirSet(settings.logsDir || null).catch((e) =>
      toast(failText("usar la carpeta de logs", e) + " En esta ejecución se usa la predeterminada.", "error"),
    );
  }, [settings.logsDir, toast]);

  useEffect(() => {
    listSessions().then(setSessions).catch(console.error);
  }, []);

  /**
   * `background`: la pestaña se abre sin activarla (Topología sigue a la vista). `title`: nombre de la
   * pestaña (el de la sesión queda en el tooltip). Devuelve el id de la pestaña.
   */
  const openTab = useCallback((session: Session, opts?: { background?: boolean; title?: string }) => {
    const id = `t${++tabSeq}`;
    setTabs((t) => [...t, { id, session, ...(opts?.title ? { title: opts.title } : {}) }]);
    setStates((s) => ({ ...s, [id]: { status: "connecting", logPath: null } }));
    if (!opts?.background) setActiveId(id);
    return id;
  }, []);

  // Aviso único por ejecución: con muchas pestañas el historial de pantalla domina la memoria
  // (medido: unos 3 MB por cada 1.000 líneas llenas por pestaña).
  const memoryHinted = useRef(false);
  useEffect(() => {
    if (memoryHinted.current || tabs.length <= 15) return;
    memoryHinted.current = true;
    const mb = Math.round((tabs.length * settings.scrollback * 3) / 1000);
    toast(
      `Tienes ${tabs.length} sesiones abiertas: con el historial lleno pueden ocupar hasta ~${mb} MB. ` +
        "Si el equipo anda lento, cierra las que no uses o baja el historial en Ajustes › Terminal.",
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs.length]);

  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;

  useEffect(() => {
    const subs = [
      listen<ApprovalRequest>("mcp-approval", (e) => setApprovals((a) => [...a, e.payload])),
      listen<string>("mcp-approval-closed", (e) => setApprovals((a) => a.filter((x) => x.id !== e.payload))),
      listen<string>("mcp-open-session", (e) => {
        const s = sessionsRef.current.find((x) => x.id === e.payload);
        if (s) openTab(s);
      }),
      listen<{ tool: string; target: string; detail: string; ok: boolean }>("mcp-activity", (e) => {
        const { tool, target, detail, ok } = e.payload;
        if (tool === "send_command" || tool === "open_session")
          toast(`IA · ${ok ? "" : "rechazado: "}${detail.split("\n")[0]}${target ? ` → ${target}` : ""}`, "ai");
      }),
      listen<{ run: string; script: string; kind: string; message: string }>("script-event", (e) => {
        const { kind, message, script, run } = e.payload;
        if (kind === "log") toast(`${script}: ${message}`);
        else {
          // Los plugins usan el mismo evento: solo el fin del script lanzado libera el botón.
          if (scriptRunRef.current?.run === run) setScriptRun(null);
          toast(`${script}: ${message}`, kind === "error" ? "error" : "info");
        }
      }),
    ];
    return () => subs.forEach((u) => u.then((f) => f()));
  }, [openTab, toast]);


  const [toolsOpen, setToolsOpen] = useState(false);
  /** Pestaña cuyo historial de comandos enviados se muestra (null: cerrado). */
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const pendingFind = useRef<string | null>(null);
  useEffect(() => {
    if (!activeId || pendingFind.current !== activeId) return;
    pendingFind.current = null;
    // Un cuadro después: la terminal ya está visible y la caja de búsqueda puede tomar el foco.
    const raf = requestAnimationFrame(() => controllers.current.get(activeId)?.openFind());
    return () => cancelAnimationFrame(raf);
  }, [activeId]);
  // El panel pertenece a su pestaña: si esa pestaña se cierra, el panel se cierra con ella.
  useEffect(() => {
    if (historyFor && !tabs.some((t) => t.id === historyFor)) setHistoryFor(null);
  }, [tabs, historyFor]);

  // Pestañas en segundo plano con salida nueva (se limpia al verlas).
  const [activity, setActivity] = useState<Set<string>>(new Set());
  const markActivity = useCallback((id: string) => {
    setActivity((a) => (a.has(id) ? a : new Set(a).add(id)));
  }, []);
  useEffect(() => {
    if (activeId) setActivity((a) => (a.has(activeId) ? new Set([...a].filter((x) => x !== activeId)) : a));
  }, [activeId]);

  // Alertas por palabra clave: aviso, sonido y marca en la pestaña (se limpia al verla).
  const [alerted, setAlerted] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (activeId) setAlerted((a) => (a.has(activeId) ? new Set([...a].filter((x) => x !== activeId)) : a));
  }, [activeId]);
  useAlerts(
    settings.alertRules,
    (hit, rule) => {
      const tab = tabs.find((t) => t.id === hit.conn.split("#")[0]);
      if (!tab) return;
      if (rule.toast) toast(`${tabTitle(tab)} · ${rule.name || rule.pattern}: ${hit.line}`, "error");
      if (rule.markTab && tab.id !== activeId) setAlerted((a) => (a.has(tab.id) ? a : new Set(a).add(tab.id)));
    },
    (msg) => toast(msg, "error"),
  );

  const { update_, setUpdate, showNotes, setShowNotes, installing, installUpdate } = useUpdater({
    dismissed: settings.updateDismissed,
    states,
    setConfirm,
    toastFail,
  });
  const lastTermRef = useRef<string | null>(null);
  useEffect(() => {
    if (activeId && activeId !== "tools") lastTermRef.current = activeId;
  }, [activeId]);

  const monitors = useMonitors(settings.monitors, toast);

  const openTools = useCallback(() => {
    setToolsOpen(true);
    setActiveId("tools");
  }, []);

  /**
   * ⌘E y el botón de Herramientas: si la vista ya se ve, vuelve a la última terminal SIN cerrarla
   * (los servidores, el syslog y las mediciones siguen vivos); si no, la abre o la activa.
   */
  const toggleTools = () => (activeId === "tools" ? setActiveId(lastTermRef.current) : openTools());

  /**
   * Cierra Herramientas de verdad (botón X de su encabezado, menú del botón o ⌘W sobre la vista).
   * Los monitoreos de Monitoreo/Diagnóstico viven en App (useMonitors) y no se cortan; lo que se
   * pierde al desmontar es lo que cada módulo muestra en pantalla (mensajes de syslog, transferencias,
   * mediciones, un SNMP en curso). Los servidores activos sí se pueden consultar: se avisa por ellos.
   */
  const requestCloseTools = async () => {
    const running = await serverRunning().catch(() => [] as string[]);
    const hops = runningHops();
    if (!running.length && !hops.length) return closeTab("tools");
    const names: Record<string, string> = { tftp: "TFTP", http: "HTTP", ftp: "FTP", syslog: "Syslog", snmptrap: "traps SNMP" };
    setConfirm({
      title: "¿Cerrar Herramientas?",
      message: `${running.length ? `Hay servidores activos (${running.map((k) => names[k] ?? k).join(", ")}). Siguen funcionando, pero Herramientas dejará de mostrar sus mensajes, transferencias y mediciones. ` : ""}${hopCloseNote(hops)}Para salir sin cerrar Herramientas, usa ${modLabel}E.`,
      label: "Cerrar Herramientas",
      danger: true,
      defaultCancel: true,
      action: () => closeTab("tools"),
    });
  };

  const closeTab = useCallback((id: string) => {
    if (id === "tools") {
      setToolsOpen(false);
      setActiveId((cur) => (cur === "tools" ? lastTermRef.current : cur));
      return;
    }
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      const next = prev.filter((t) => t.id !== id);
      setActiveId((cur) => {
        if (cur !== id) return cur;
        const fallback = next[Math.min(idx, next.length - 1)]?.id ?? null;
        if (lastTermRef.current === id) lastTermRef.current = fallback;
        return fallback;
      });
      return next;
    });
    setStates(({ [id]: _, ...rest }) => rest);
    // Ciclo de vida: lo visto en la pestaña cerrada no se conserva.
    setTabDevice((d) => (id in d ? (({ [id]: _d, ...rest }) => rest)(d) : d));
    tabHome.current.delete(id);
  }, []);

  // Evita cortar por accidente una sesión remota activa.
  const requestClose = (id: string) => {
    if (id === "tools") return requestCloseTools();
    const tab = tabs.find((t) => t.id === id);
    const risky = tab && tab.session.type !== "local" && states[id]?.status === "connected";
    // Una conexión rápida sin guardar se pierde al cerrar: se avisa siempre, aunque "Confirmar al cerrar" esté apagado.
    const quick = !!tab && isQuickSession(tab.session);
    if (tab && ((settings.confirmClose && risky) || quick))
      setConfirm({
        title: risky ? "¿Cerrar la sesión?" : "¿Cerrar la conexión rápida?",
        message: [
          risky && `Se cortará la conexión con ${tabTitle(tab)}.`,
          quick && "Es una conexión rápida sin guardar: sus datos se pierden. Para conservarla, usa «Guardar como sesión…» en el menú de la pestaña.",
        ]
          .filter(Boolean)
          .join("\n\n"),
        label: risky ? "Cerrar sesión" : "Cerrar",
        danger: true,
        action: () => closeTab(id),
      });
    else closeTab(id);
  };

  const onLog = useCallback((id: string, path: string | null) => {
    setStates((s) => (s[id] ? { ...s, [id]: { ...s[id], logPath: path } } : s));
  }, []);

  const onStatus = useCallback((id: string, status: ConnStatus) => {
    setStates((s) =>
      s[id]
        ? { ...s, [id]: { ...s[id], status } }
        : s,
    );
  }, []);

  const register = useCallback((id: string, ctrl: TermController | null) => {
    if (ctrl) controllers.current.set(id, ctrl);
    else controllers.current.delete(id);
  }, []);

  const newLocal = useCallback(
    () => openTab(sessions.find((s) => s.type === "local") ?? LOCAL),
    [sessions, openTab],
  );

  /** Pestañas con la barra de búsqueda abierta (el botón Buscar de la barra de estado lo refleja). */
  const [findOpenIds, setFindOpenIds] = useState<Record<string, boolean>>({});
  const onFindState = useCallback(
    (tabId: string, open: boolean) => setFindOpenIds((m) => (!!m[tabId] === open ? m : { ...m, [tabId]: open })),
    [],
  );
  const activeTab = tabs.find((t) => t.id === activeId);
  const activeCtrl = () => (activeId ? controllers.current.get(activeId) : undefined);
  const activeConnected = !!activeTab && states[activeTab.id]?.status === "connected";

  // ---------- Vista dividida ----------
  const [split, setSplit] = useState<SplitState | null>(null);
  /** Panel que recibe la pestaña elegida en la barra cuando no está en ningún panel. */
  const focusPaneRef = useRef(0);
  const splitOn = !!split && activeId !== "tools";
  const tabIdsKey = tabs.map((t) => t.id).join(",");
  // Pestañas cerradas dejan su panel vacío.
  useEffect(() => {
    setSplit((s) =>
      s && s.panes.some((id) => id && !tabs.some((t) => t.id === id))
        ? { ...s, panes: s.panes.map((id) => (id && tabs.some((t) => t.id === id) ? id : null)) }
        : s,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabIdsKey]);
  // Elegir en la barra una pestaña que no está a la vista la pone en el panel con foco.
  useEffect(() => {
    if (!split || !activeId || activeId === "tools") return;
    const i = split.panes.indexOf(activeId);
    if (i >= 0) focusPaneRef.current = i;
    else setSplit({ ...split, panes: split.panes.map((id, k) => (k === focusPaneRef.current ? activeId : id)) });
  }, [activeId, split]);
  const changeSplit = (layout: SplitLayout | null) => {
    if (!layout) return setSplit(null);
    const ids = tabs.map((t) => t.id);
    setSplit((s) => ({ layout, panes: fillPanes(layout, s?.panes ?? [], ids, activeId !== "tools" ? activeId : null) }));
    if (activeId === "tools") setActiveId(lastTermRef.current);
  };
  const pickPane = (pane: number, tabId: string | null) => {
    setSplit((s) => {
      if (!s) return s;
      const panes = [...s.panes];
      const other = tabId ? panes.indexOf(tabId) : -1;
      if (other >= 0) panes[other] = panes[pane];
      panes[pane] = tabId;
      return { ...s, panes };
    });
    focusPaneRef.current = pane;
    if (tabId) setActiveId(tabId);
  };
  const visibleKey = splitOn ? split!.panes.filter(Boolean).join(",") : null;
  const visiblePanes = useMemo(() => (visibleKey === null ? null : visibleKey.split(",").filter(Boolean)), [visibleKey]);

  // ---------- Cerrar varias pestañas ----------
  /**
   * Cierra en tandas de 6 por cuadro: cada pestaña se libera igual que con closeTab (al
   * desmontarse TerminalView corta la conexión, cierra el log y libera xterm), sin congelar
   * la interfaz con decenas de terminales a la vez. Herramientas no se toca.
   */
  const closeMany = (scope: CloseScope, ids: string[], refId?: string) => {
    if (!ids.length) return;
    const gone = new Set(ids);
    // La pestaña de referencia (o Herramientas, o ninguna) queda activa antes de empezar,
    // así closeTab no salta de una pestaña que se va a cerrar a otra.
    const keep = scope === "all" ? (toolsOpen ? "tools" : null) : (refId ?? null);
    setActiveId((cur) => (cur && !gone.has(cur) ? cur : keep));
    if (lastTermRef.current && gone.has(lastTermRef.current)) lastTermRef.current = scope === "all" ? null : (refId ?? null);
    if (scope === "all") {
      setSplit(null);
      if (isBroadcastRunning()) stopBroadcast();
    }
    const queue = [...ids];
    const step = () => {
      queue.splice(0, 6).forEach(closeTab);
      if (queue.length) window.setTimeout(step, 16);
    };
    step();
  };

  /** Avisa qué se corta antes de cerrar varias pestañas; sin nada conectado, sin conexiones rápidas y sin "Confirmar al cerrar", cierra directo. */
  const requestCloseMany = (scope: CloseScope, refId?: string) => {
    const list = tabsToClose(tabs, scope, refId);
    if (!list.length) return;
    const ids = list.map((t) => t.id);
    const summary = summarizeClose(list, states);
    const run = () => closeMany(scope, ids, refId);
    // Las conexiones rápidas sin guardar se avisan siempre: cerrarlas pierde su configuración.
    if (!settings.confirmClose && summary.connected.length === 0 && summary.transfers === 0 && summary.quick === 0) return run();
    const bc = getBroadcastRun();
    const broadcast =
      !!bc?.running && bc.items.some((x) => (x.status === "pending" || x.status === "sending") && ids.includes(x.tabId));
    const inSplit = !!split && split.panes.some((id) => id && ids.includes(id));
    const n = list.length;
    setConfirm({
      title:
        scope === "all"
          ? "¿Cerrar todas las pestañas?"
          : scope === "others"
            ? "¿Cerrar las demás pestañas?"
            : `¿Cerrar las pestañas ${settings.tabLayout === "vertical" ? "de abajo" : "de la derecha"}?`,
      message: <CloseManyMessage scope={scope} summary={summary} broadcast={broadcast} split={inSplit} toolsOpen={toolsOpen} />,
      label: `Cerrar ${n} ${n === 1 ? "pestaña" : "pestañas"}`,
      danger: true,
      defaultCancel: true,
      action: run,
    });
  };

  // ---------- Difusión (envío a varias sesiones) ----------
  const bcTarget = useBroadcastTarget();
  const broadcastMode = bcTarget.mode !== "current";
  const workspace = useWorkspace();
  const [broadcast, setBroadcast] = useState<{ text: string; resolved: Resolved; declared?: Risk } | null>(null);
  const [bcDelay, setBcDelay] = useState(() => stored("broadcastDelay", 300));
  useEffect(() => persist("broadcastDelay", bcDelay), [bcDelay]);
  useEffect(() => {
    publishWorkspace({
      tabs: tabs.map((t) => ({ id: t.id, title: tabTitle(t), session: t.session, status: states[t.id]?.status ?? "connecting" })),
      panes: visiblePanes,
      activeId,
    });
  }, [tabs, states, activeId, visiblePanes]);
  /** Destino que muestran Notas y catálogo: la pestaña activa o el grupo de difusión. */
  const sendTarget = broadcastMode ? targetLabel(bcTarget, workspace) : activeConnected ? tabTitle(activeTab!) : null;
  /**
   * Por qué Notas y Catálogo no pueden enviar ahora. Con Herramientas a la vista nunca se envía a la
   * "última terminal": el destino sería una pestaña que el usuario no está viendo. Se le dice y se le
   * ofrece volver a ella (la sesión sigue conectada).
   */
  const lastTermTab = tabs.find((t) => t.id === lastTermRef.current);
  const sendBlocked = sendTarget
    ? null
    : activeId === "tools"
      ? lastTermTab
        ? `Estás en Herramientas. Vuelve a ${tabTitle(lastTermTab)} para ejecutar.`
        : "Estás en Herramientas. Abre una sesión para ejecutar."
      : !activeTab
        ? "Abre una sesión para ejecutar comandos."
        : states[activeTab.id]?.status === "connecting"
          ? `Conectando ${tabTitle(activeTab)}…`
          : `${tabTitle(activeTab)} está desconectada. Reconecta para ejecutar.`;
  const returnToTerminal = activeId === "tools" && lastTermTab ? () => setActiveId(lastTermTab.id) : undefined;
  const openBroadcast = (text: string, declared?: Risk) => {
    if (isBroadcastRunning()) return toast("Hay un envío a varias sesiones en curso", "error");
    if (isLabRunning()) return toast("El CLI Lab está ejecutando un script: espera a que termine o usa Detener", "error");
    const resolved = resolveTargets(bcTarget, tabs, (id) => states[id]?.status, activeId, visiblePanes);
    setBroadcast({ text, resolved, declared });
  };
  const startBroadcast = (deviceDelayMs: number) => {
    if (!broadcast) return;
    if (isLabRunning()) return toast("El CLI Lab está ejecutando un script: espera a que termine o usa Detener", "error");
    setBcDelay(deviceDelayMs);
    const { text, resolved } = broadcast;
    setBroadcast(null);
    // Mismo cuerpo que el envío normal: cada línea con Enter, también la última.
    const body = text.replace(/\s+$/, "") + "\n";
    runBroadcast(resolved.targets, resolved.skipped, body, { lineDelayMs: settings.sendLineDelay, deviceDelayMs }, (id) =>
      controllers.current.get(id),
    ).catch((e) => toastFail("enviar a varias sesiones", e));
  };

  // Notas: resaltado según el fabricante de la sesión activa.
  const notesRules = useMemo(
    () =>
      compile([
        {
          id: "template-var",
          name: "Variable de plantilla",
          pattern: String.raw`\{\{\s*[\w.-]+\s*\}\}`,
          style: { color: "brightMagenta", bold: true, underline: true },
        },
        ...effectiveRules(
          { enabled: settings.highlightEnabled, schemes: settings.highlightSchemes, custom: settings.customRules },
          activeTab?.session.highlight,
        ),
      ], preset.theme),
    [settings.highlightEnabled, settings.highlightSchemes, settings.customRules, activeTab?.session.highlight, preset.theme],
  );

  /** Envía texto de Notas a la sesión activa, confirmando bloques en equipos remotos. */
  /** Abre el diálogo para elegir destinos y modo del script. */
  const runScript = (script: string) => {
    if (scriptRun) return toast(`Ya se está ejecutando ${scriptRun.script}`, "error");
    setScriptLaunch(script);
  };

  const startScript = async (script: string, l: ScriptLaunch) => {
    setScriptLaunch(null);
    const targets = l.targets.flatMap((t) => {
      const ctrl = controllers.current.get(t.id);
      return ctrl && ctrl.isConnected() ? [{ conn: ctrl.connId(), platform: t.session.platform ?? null }] : [];
    });
    if (!targets.length) return toast("Conecta una sesión antes de ejecutar el script", "error");
    try {
      const run = await apiRunScript(script, targets, {
        allowChanges: l.allowChanges,
        parallel: l.parallel,
        maxMinutes: l.maxMinutes,
        vaultType: l.vaultType,
      });
      setScriptRun({ run, script, targets: targets.length });
      const modes = [l.allowChanges ? "permite cambios" : "", l.vaultType ? "puede escribir contraseñas guardadas" : ""].filter(Boolean);
      toast(`Ejecutando ${script}${targets.length > 1 ? ` en ${targets.length} sesiones` : ""}${modes.length ? ` (${modes.join(", ")})` : ""}`);
    } catch (e) {
      toastFail(`ejecutar ${script}`, e);
    }
  };

  // ---------- Catálogo: packs incluidos + packs del usuario ----------
  const [userPacks, setUserPacks] = useState<Pack[]>([]);
  const [packsOpen, setPacksOpen] = useState(false);
  const [cmdEdit, setCmdEdit] = useState<{ vendor: string; initial?: PackCommand } | null>(null);
  const loadPacks = useCallback(() => {
    cmdpacksList()
      .then((raw) =>
        setUserPacks(
          raw
            .map((r) => validatePack(r).pack)
            .filter((p): p is Pack => !!p),
        ),
      )
      .catch(() => {});
  }, []);
  useEffect(loadPacks, [loadPacks]);

  // Los packs incluidos (~900 KB) van en un chunk aparte que se carga cuando la app queda libre
  // tras el primer render (a lo más 1,5 s después), para no competir con el arranque.
  const [builtinPacks, setBuiltinPacks] = useState<Pack[]>([]);
  useEffect(() => {
    const load = () => {
      import("./lib/builtinPacks").then((m) => setBuiltinPacks(m.builtinPacks)).catch(console.error);
      for (const d of LAZY_DIALOGS) d.preload().catch(() => {});
    };
    if (typeof window.requestIdleCallback !== "function") {
      const t = window.setTimeout(load, 200);
      return () => window.clearTimeout(t);
    }
    const id = window.requestIdleCallback(load, { timeout: 1500 });
    return () => window.cancelIdleCallback(id);
  }, []);

  const allPacks = useMemo(
    () => orderPacks(builtinPacks, userPacks),
    [builtinPacks, userPacks],
  );
  const catalog = useMemo(() => buildCatalog(allPacks, settings.disabledPacks), [allPacks, settings.disabledPacks]);

  const updateSessions = async (changed: Session[]) => {
    try {
      setSessions(await apiUpdateSessions(changed));
    } catch (err) {
      toastFail("guardar los cambios de las sesiones", err);
    }
  };

  const { detecting, tabDevice, setTabDevice, tabHome, noteDevice, setTabPlatform, detectPlatformNow, detectFromScreen } = useTabPlatform({
    settings,
    update,
    controllers,
    tabs,
    setTabs,
    activeTab,
    activeCtrl,
    sessions,
    updateSessions,
    catalog,
    toast,
    toastFail,
  });

  /** Agrega, edita o borra un comando en "Mis comandos" del fabricante. */
  const saveUserCommand = async (vendorId: string, cmd: PackCommand | null, replace?: string) => {
    const vendor = catalog.find((v) => v.id === vendorId);
    const id = `user-${vendorId}`;
    const current = userPacks.find((p) => p.id === id);
    let commands = (current?.commands ?? []).filter((c) => c.cmd !== (replace ?? cmd?.cmd));
    if (cmd) commands = [...commands, cmd];
    const pack: Pack = {
      format: "netterminal-commands",
      formatVersion: 1,
      id,
      name: `Mis comandos (${vendor?.name ?? vendorId})`,
      vendor: vendorId,
      vendorName: vendor?.name ?? vendorId,
      author: "Usuario",
      detectCommand: vendor?.detectCommand,
      platforms: vendor?.platforms ?? [],
      commands,
    };
    try {
      if (commands.length) await cmdpackSave(pack);
      else await cmdpackDelete(id);
      loadPacks();
      setCmdEdit(null);
    } catch (e) {
      toastFail("guardar el pack de comandos", e);
    }
  };

  /** Abre el catálogo con el fabricante de la sesión activa, si tiene uno definido. */
  const toggleCommands = () => {
    if (!commandsOpen && activeTab?.session.type === "local" && !activeTab.session.scp)
      update({ catalogVendor: localOsVendor() });
    else if (!commandsOpen && activeTab) {
      const h = activeTab.session.highlight;
      // Aruba, Grandstream y Check Point tienen catálogo con el mismo id que su resaltado.
      const byHighlight = h && h !== "default" && h !== "off" ? (catalog.some((v) => v.id === h) ? h : vendorFor(h)) : undefined;
      const found = !activeTab.session.platform ? detectFromScreen(activeTab.id, byHighlight ?? settings.catalogVendor) : null;
      if (found) {
        update({ catalogVendor: found.vendor.id });
        setTabPlatform(activeTab.id, found.platform.id, found.vendor.id);
        toast(`Plataforma reconocida en pantalla: ${found.vendor.name} ${found.platform.label}`);
      } else if (byHighlight) update({ catalogVendor: byHighlight });
    }
    setCommandsOpen((o) => !o);
  };

  /** `checked`: el riesgo ya se confirmó (catálogo) y no se vuelve a preguntar. */
  const sendToSession = (text: string, checked = false, declared?: Risk) => {
    // Las variables {{...}} se piden una sola vez, también al enviar a varias sesiones.
    const then = (t: string) => (broadcastMode ? openBroadcast(t, declared) : sendResolved(t, checked));
    if (templateVars(text).length) return setTemplate({ text, then });
    then(text);
  };

  /**
   * Envía a una pestaña concreta (el historial de una pestaña no activa reenvía a ella, no a la
   * activa) con el mismo control de riesgo y confirmación. Nunca usa el modo difusión: el destino
   * es esa pestaña y ninguna otra.
   */
  const sendToTab = (tabId: string, text: string, checked = false) => {
    const then = (t: string) => sendResolved(t, checked, tabId);
    if (templateVars(text).length) return setTemplate({ text, then });
    then(text);
  };

  const sendResolved = (text: string, checked = false, tabId: string | null = activeId) => {
    const target = tabs.find((t) => t.id === tabId);
    const ctrl = tabId ? controllers.current.get(tabId) : undefined;
    if (!ctrl || !target || !ctrl.isConnected()) return;
    if (labOwns(target.id)) return toast("El CLI Lab está ejecutando en esta pestaña: espera a que termine o usa Detener", "error");
    // Cada línea se ejecuta con Enter, también la última.
    const trimmed = text.replace(/\s+$/, "");
    if (!trimmed) return;
    const body = trimmed + "\n";
    const lines = trimmed.split("\n");
    const session = target.session;
    const go = () => {
      ctrl.send(body, settings.sendLineDelay).catch(console.error);
      // Si se reenvió a una pestaña que no es la activa, se muestra para ver el resultado.
      if (target.id !== activeId) setActiveId(target.id);
      ctrl.focus();
      // Historial por equipo: solo envíos explícitos (Notas, catálogo, botones), nunca teclas.
      if (!session.scp) cmdHistoryAdd(historyKey(session), trimmed).catch(() => {});
    };
    const remote = session.type !== "local";
    // Notas y botones pasan por el mismo motor de riesgo que el catálogo. Lo que puede
    // cortar servicio se confirma siempre; el resto según "Confirmar envío de varias líneas".
    const risk = remote && !checked ? computeRisk(trimmed) : "read";
    const ask = remote && (risk === "disruptive" || (settings.confirmSend && (lines.length > 1 || risk === "change")));
    if (ask) {
      const preview = lines.slice(0, 6).join("\n") + (lines.length > 6 ? "\n…" : "");
      setConfirm({
        title:
          risk === "disruptive"
            ? `Puede cortar servicio en ${tabTitle(target)}`
            : lines.length > 1
              ? `¿Enviar ${lines.length} líneas a ${tabTitle(target)}?`
              : `¿Enviar a ${tabTitle(target)}?`,
        message: `${risk !== "read" ? `${riskLabel[risk]}.\n\n` : ""}${preview}`,
        label: "Enviar",
        danger: risk === "disruptive",
        action: go,
      });
    } else go();
  };

  // Atajos globales
  useShortcuts({
    tabs,
    activeId,
    activeTab,
    setActiveId,
    update,
    onPalette: () => setPaletteOpen((o) => !o),
    onNewTab: newLocal,
    onCloseTab: requestClose,
    onCloseAll: () => requestCloseMany("all"),
    onSettings: () => setSettingsOpen(true),
    onNotes: () => setNotesOpen((o) => !o),
    onCommands: toggleCommands,
    onTools: toggleTools,
    onDuplicateTab: (t) => openTab(t.session),
    onNewSession: () => setModal({}),
    onQuickConnect: () => setQuickOpen(true),
    onCliLab: () => openLab(),
    onToggleSidebar: () => h.toggleSidebar(),
    onFocusMode: () => setFocusMode((f) => !f),
    onFind: () => activeCtrl()?.openFind(),
    onHistory: () => h.openHistory(),
  });

  const saveSession = async (session: Session, connect: boolean, cred: CredChange = { action: "keep" }) => {
    try {
      let saved = await apiSaveSession(session);
      // La contraseña va directo a la bóveda del backend; la sesión solo guarda el indicador.
      if (cred.action === "set") {
        try {
          await credSet(saved.id, cred.password);
        } catch (err) {
          toast(`La sesión se guardó, pero no la contraseña. Motivo: ${errText(err)}`, "error");
          // Sin una contraseña previa, el indicador no debe quedar activo.
          const before = sessions.find((x) => x.id === saved.id);
          if (!before?.save_password)
            saved = await apiSaveSession({ ...saved, save_password: undefined });
        }
      } else if (cred.action === "delete") {
        await credDelete(saved.id).catch((err) =>
          toastFail("borrar la contraseña guardada", err),
        );
      }
      setSessions((prev) =>
        prev.some((s) => s.id === saved.id) ? prev.map((s) => (s.id === saved.id ? saved : s)) : [...prev, saved],
      );
      // "Guardar como sesión…": la pestaña abierta pasa a ser la sesión guardada (sin reconectar).
      const tabId = modal?.tabId;
      if (tabId) setTabs((ts) => ts.map((t) => (t.id === tabId ? { ...t, session: saved } : t)));
      setModal(null);
      if (connect && !tabId) openTab(saved);
    } catch (err) {
      toastFail("guardar la sesión", err);
    }
  };

  /** Importa sesiones omitiendo las que ya existen (mismo tipo, host/puerto o nombre). `updates`
   * son sesiones existentes ya combinadas con lo importado (reimportación con cambios). */
  const importSessions = async (list: Session[], updates: Session[] = []) => {
    const key = (s: Session) =>
      [s.type, s.host ?? "", s.port ?? "", s.serial_port ?? "", s.name.trim().toLowerCase()].join("|");
    const existing = new Set(sessions.map(key));
    const fresh: Session[] = [];
    for (const s of list) {
      if (existing.has(key(s))) continue;
      // No se importan los argumentos extra de ssh, los comandos al conectar ni los túneles:
      // una sesión compartida no debe poder inyectar opciones al cliente SSH, abrir puertos
      // ni enviar configuración al equipo sin que quien la importa lo revise.
      const { ssh_args: _dropped, on_connect: _cmds, scp: _scp, tunnels: _tunnels, save_password: _pw, ...safe } = s;
      fresh.push({ ...safe, id: "", created_at: "" });
      existing.add(key(s));
    }
    if (updates.length) {
      await apiUpdateSessions(updates);
      // Cambió el destino: la contraseña guardada no debe seguir al host nuevo.
      for (const u of updates) {
        if (!u.save_password && sessions.find((s) => s.id === u.id)?.save_password)
          await credDelete(u.id).catch(() => {});
      }
    }
    // Una sola escritura aunque sean cientos de sesiones.
    setSessions(await addSessions(fresh));
    return fresh.length;
  };

  const deleteSession = async (id: string) => {
    await apiDeleteSession(id).catch(console.error);
    setSessions((prev) => prev.filter((s) => s.id !== id));
  };

  const toggleLog = async () => {
    const ctrl = activeCtrl();
    if (!ctrl || !activeId) return;
    const enabled = !states[activeId]?.logPath;
    // Sesión cerrada: apagar el log solo evita que se reanude al reconectar.
    if (!enabled && states[activeId]?.status !== "connected") {
      const id = activeId;
      setStates((s) => (s[id] ? { ...s, [id]: { ...s[id], logPath: null } } : s));
      return;
    }
    try {
      const path = await setLogging(ctrl.connId(), enabled, logOptions(settings));
      const id = activeId;
      setStates((s) => (s[id] ? { ...s, [id]: { ...s[id], logPath: path } } : s));
    } catch (err) {
      toastFail("activar el log", err);
    }
    ctrl.focus();
  };

  const folders = useMemo(() => allFolders(sessions, settings.extraFolders), [sessions, settings.extraFolders]);

  // Estado de conexión por sesión guardada, para el punto verde en el árbol.
  const live = useMemo(() => {
    const rank: Record<ConnStatus, number> = { closed: 0, connecting: 1, connected: 2 };
    const out: Record<string, ConnStatus> = {};
    for (const t of tabs) {
      const st = states[t.id]?.status;
      if (st && (!out[t.session.id] || rank[st] > rank[out[t.session.id]])) out[t.session.id] = st;
    }
    return out;
  }, [tabs, states]);

  const duplicateSession = async (s: Session) => {
    try {
      const saved = await apiSaveSession({ ...s, id: "", name: `${s.name} (copia)`, created_at: "", save_password: undefined });
      setSessions((prev) => [...prev, saved]);
      setModal({ session: saved });
    } catch (err) {
      toastFail("duplicar la sesión", err);
    }
  };

  // Sesiones conectadas para las herramientas; memorizado para no cambiar en cada render.
  const terminals = useMemo(
    () =>
      tabs
        .filter((t) => t.session.type !== "local" && states[t.id]?.status === "connected")
        .map((t) => ({
          connId: controllers.current.get(t.id)?.connId() ?? "",
          tabId: t.id,
          name: tabTitle(t),
          host: t.session.host,
          highlight: t.session.highlight,
          session: t.session,
          screen: (n: number) => controllers.current.get(t.id)?.recentText(n) ?? "",
          notice: (text: string) => controllers.current.get(t.id)?.notice(text),
        }))
        .filter((t) => t.connId),
    [tabs, states],
  );

  // Todas las pestañas con su estado (Topología muestra cuáles de su ruta están caídas y las enfoca).
  const tabBriefs = useMemo(
    () => tabs.map((t) => ({ tabId: t.id, name: tabTitle(t), host: t.session.host, status: states[t.id]?.status ?? "connecting", session: t.session })),
    [tabs, states],
  );
  const focusTab = useCallback((tabId: string) => setActiveId(tabId), []);
  const reconnectTab = useCallback((tabId: string) => controllers.current.get(tabId)?.reconnect(), []);

  const h = useHandlers({
    // En tandas de 5 cada 1,5 s: abrir 40 sesiones de golpe satura AAA/TACACS y la CPU.
    openMany: (list: Session[]) =>
      list.forEach((s, i) => (i < 5 ? openTab(s) : window.setTimeout(() => openTab(s), Math.floor(i / 5) * 1500))),
    newSession: (folder?: string) => setModal({ folder }),
    openQuick: () => setQuickOpen(true),
    saveTabAs: (id: string) => {
      const t = tabs.find((x) => x.id === id);
      if (t) setModal({ session: { ...t.session, name: t.title?.trim() || t.session.name }, tabId: id });
    },
    editSession: (session: Session) => setModal({ session }),
    duplicateSession,
    deleteSession: (s: Session) => deleteSession(s.id),
    updateSessions,
    setExtraFolders: (extraFolders: string[]) => update({ extraFolders }),
    setSidebarOrder: (sidebarOrder: Record<string, string[]>) => update({ sidebarOrder }),
    requestClose,
    requestCloseMany,
    ...layoutActions,
    newButton: () => setMacroEdit(null),
    setTabLayout: (tabLayout: Settings["tabLayout"]) => update({ tabLayout }),
    reorderTab: (from: string, to: string, after: boolean) => setTabs((ts) => moveItem(ts, from, to, after)),
    renameTab: (id: string, title: string | undefined) => setTabs((ts) => ts.map((t) => (t.id === id ? { ...t, title } : t))),
    duplicateTab: (id: string) => {
      const t = tabs.find((x) => x.id === id);
      if (t) openTab(t.session);
    },
    reconnectTab: (id: string) => controllers.current.get(id)?.reconnect(),
    disconnectTab: (id: string) => controllers.current.get(id)?.disconnect(),
    clearScrollback: (id: string) => controllers.current.get(id)?.clearScrollback(),
    resetTerminal: (id: string) => controllers.current.get(id)?.reset(),
    copyAll: (id: string) =>
      controllers.current
        .get(id)
        ?.copyAll()
        .then((n) => toast(`${plural(n, "línea copiada", "líneas copiadas")} al portapapeles`)),
    toolsConnId: () => {
      const c = lastTermRef.current ? controllers.current.get(lastTermRef.current) : undefined;
      return c?.isConnected() ? c.connId() : null;
    },
    scp: (req: ScpRequest) => {
      const s = req.session;
      openTab({
        ...s,
        // El gestor de archivos reconoce el fin de su transferencia por este id.
        id: req.transferId ?? `scp-${Date.now()}`,
        type: "local",
        name: req.mode === "shell" ? `SFTP ${s.name}` : `${req.mode === "sftp" ? "SFTP" : "SCP"} ${req.upload ? "→" : "←"} ${s.name}`,
        // Telnet/TCP usan su propio puerto: SCP siempre va por SSH.
        port: s.type === "ssh" ? s.port : 22,
        highlight: "off",
        on_connect: undefined,
        auto_reconnect: false,
        scp: { upload: req.upload, files: req.files, remote_dir: req.remoteDir, mode: req.mode ?? "scp" },
      });
      toast(`Pestaña ${req.mode && req.mode !== "scp" ? "SFTP" : "SCP"} abierta: escribe la contraseña del equipo ahí`);
    },
    setVendor: (catalogVendor: string) => update({ catalogVendor }),
    setPlatform: (platform: string | null) => activeTab && setTabPlatform(activeTab.id, platform),
    detect: () => detectPlatformNow(),
    setFavorites: (favCommands: string[]) => update({ favCommands }),
    closeCommands: () => {
      setCommandsOpen(false);
      activeCtrl()?.focus();
    },
    runCommand: (c: CatalogEntry, cmd: string) => {
      // En difusión el diálogo propio confirma el riesgo con la cantidad de equipos.
      if (broadcastMode) return sendToSession(cmd, false, c.risk);
      if (c.risk === "read") return sendToSession(cmd);
      setConfirm({
        title: c.risk === "disruptive" ? "Este comando puede cortar servicio" : "Este comando cambia configuración o estado",
        message: `${riskLabel[c.risk]} en ${activeTab ? tabTitle(activeTab) : "la sesión"}:\n\n${cmd}`,
        label: "Ejecutar",
        danger: c.risk === "disruptive",
        action: () => sendToSession(cmd, true),
      });
    },
    typeCommand: (cmd: string) => {
      const type = (text: string) => activeCtrl()?.type(text);
      if (templateVars(cmd).length) setTemplate({ text: cmd, then: type });
      else type(cmd);
    },
    addCommand: (vendor: string) => setCmdEdit({ vendor }),
    editCommand: (c: CatalogEntry) => setCmdEdit({ vendor: settings.catalogVendor, initial: c }),
    openPacks: () => setPacksOpen(true),
    closeNotes: () => {
      setNotesOpen(false);
      activeCtrl()?.focus();
    },
    sendToSession,
    sendToTab,
    capture: () => activeCtrl()?.getSelection() ?? "",
    runMacro: (m: Macro) => (m.kind === "script" ? m.script && runScript(m.script) : m.text && sendToSession(m.text)),
    runScript,
    /** Copia un .py elegido en el equipo a la carpeta de scripts (el diálogo lo abre el backend). */
    addScript: async () => {
      try {
        const name = await importScript();
        if (name) toast(`${name} quedó en la carpeta de scripts`);
      } catch (err) {
        toastFail("agregar el script", err);
      }
    },
    stopScript: () => scriptRun && stopScript(scriptRun.run).catch(() => {}),
    deleteMacro: (m: Macro) => update((s) => ({ macros: s.macros.filter((x) => x.id !== m.id) })),
    toggleLog,
    sendBreak: (id: string | undefined = activeId ?? undefined) => {
      const ctrl = id ? controllers.current.get(id) : undefined;
      if (!ctrl) return;
      sendBreak(ctrl.connId()).catch((e) => toastFail("enviar Break", e));
      ctrl.focus();
    },
    reconnect: () => activeCtrl()?.reconnect(),
    disconnect: () => activeCtrl()?.disconnect(),
    /** Buscar: si la pestaña no es la activa se activa primero (su terminal está oculta) y la búsqueda se abre al mostrarse. */
    find: (id: string | undefined = activeId ?? undefined) => {
      if (!id) return;
      if (id === activeId) return controllers.current.get(id)?.openFind();
      pendingFind.current = id;
      setActiveId(id);
    },
    openHistory: (id: string | undefined = activeId ?? undefined) => id && setHistoryFor(id),
    toggleTools,
    requestCloseTools,
    closeHistory: () => setHistoryFor(null),
    openSettings: () => setSettingsOpen(true),
    openAi: () => {
      setSettingsSection("ai");
      setSettingsOpen(true);
    },
    toggleNotes: () => setNotesOpen((o) => !o),
    toggleCommands,
    changeSplit,
    pickPane,
    cancelBroadcast: () => setBroadcast(null),
    startBroadcast,
    openImport: () => setImportOpen(true),
    openExport: (folder?: string) => setExportFolder(folder ?? ""),
    labTargets: () => resolveTargets(bcTarget, tabs, (id) => states[id]?.status, activeId, visiblePanes),
    labConn: (id: string) => {
      const c = controllers.current.get(id);
      return c?.isConnected() ? c.connId() : undefined;
    },
    // Activa "algoritmos legacy" en la pestaña y, si es una sesión guardada, la deja guardada.
    /** Lectura pasiva de pantalla (al conectar o tras un show version): fija plataforma y resaltado. */
    screenHint: (tabId: string) => {
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab || tab.session.type === "local" || tab.session.scp) return;
      const text = controllers.current.get(tabId)?.recentText(150);
      // Ciclo de vida apagado (por defecto): no se lee nada más de la pantalla.
      if (text && settings.lifecycleInfo) noteDevice(tab, text);
      if (tab.session.platform) return;
      const h = tab.session.highlight;
      const preferred = h && h !== "off" ? (catalog.some((v) => v.id === h) ? h : vendorFor(h)) : settings.catalogVendor;
      const found = detectFromScreen(tabId, preferred);
      if (!found) return;
      setTabPlatform(tabId, found.platform.id, found.vendor.id);
      if (tabId === activeId) update({ catalogVendor: found.vendor.id });
      toast(`${tab.title ?? tab.session.name}: ${found.vendor.name} ${found.platform.label}`);
    },
    enableLegacy: (tabId: string) => {
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab) return;
      const session = { ...tab.session, legacy_ssh: true };
      setTabs((ts) => ts.map((t) => (t.id === tabId ? { ...t, session } : t)));
      if (sessions.some((x) => x.id === session.id)) updateSessions([session]);
      toast(`Compatibilidad con equipos antiguos activada en ${session.name}`);
    },
  });

  // Mismos datos y acciones para la barra horizontal y la columna de pestañas verticales.
  const tabBarProps: TabBarProps = {
    tabs,
    states,
    activeId,
    onSelect: setActiveId,
    onFocusTab: (id) => {
      if (id === activeId) controllers.current.get(id)?.focus();
    },
    onClose: h.requestClose,
    onCloseMany: h.requestCloseMany,
    onNew: newLocal,
    onQuickConnect: h.openQuick,
    onNewSession: h.newSession,
    onSaveAs: h.saveTabAs,
    onNewButton: settings.showButtonBar ? h.newButton : undefined,
    focusMode,
    onToggleFocus: h.toggleFocus,
    onBreak: h.sendBreak,
    onFind: h.find,
    onHistory: h.openHistory,
    onRename: h.renameTab,
    onReorder: h.reorderTab,
    onDuplicate: h.duplicateTab,
    onReconnect: h.reconnectTab,
    onDisconnect: h.disconnectTab,
    onClearScrollback: h.clearScrollback,
    onResetTerminal: h.resetTerminal,
    onCopyAll: h.copyAll,
    activity,
    split: split?.layout ?? null,
    onSplit: h.changeSplit,
    alerted,
    tabLayout: settings.tabLayout,
    onTabLayout: h.setTabLayout,
  };

  const sidebarEl = (extra: Partial<React.ComponentProps<typeof Sidebar>> = {}) => (
    <Sidebar
          sessions={sessions}
          extraFolders={settings.extraFolders}
          width={sidebarWidth}
          onResize={h.resizeSidebar}
          order={settings.sidebarOrder}
          onSetOrder={h.setSidebarOrder}
          live={live}
          onOpen={openTab}
          onOpenMany={h.openMany}
          onNew={h.newSession}
          onQuickConnect={h.openQuick}
          onEdit={h.editSession}
          onDuplicate={h.duplicateSession}
          onDelete={h.deleteSession}
          onUpdateSessions={h.updateSessions}
          onSetExtraFolders={h.setExtraFolders}
          onConfirm={setConfirm}
          onImportFile={h.openImport}
          onExportFile={h.openExport}
          {...extra}
        />
  );

  return (
    <div ref={rootRef} className="h-full flex bg-bg text-fg relative overflow-clip">
      {!focusMode && (
        <ActivityBar
          sidebarOpen={sidebarShown || peek}
          floatingSessions={settings.floatingSidebar && !sidebarShown}
          sessionsHiddenBy={sidebarHiddenBy}
          toolsActive={activeId === "tools"}
          toolsOpen={toolsOpen}
          alerts={monitors.downCount}
          labOpen={!!labOpen}
          commandsOpen={commandsOpen}
          notesOpen={notesOpen}
          settingsOpen={settingsOpen}
          onSessions={h.clickSessions}
          onSessionsEnter={h.peekEnter}
          onSessionsLeave={h.peekLeave}
          onTools={h.toggleTools}
          onCloseTools={h.requestCloseTools}
          onLab={openLab}
          onCommands={h.toggleCommands}
          onNotes={h.toggleNotes}
          onSettings={h.openSettings}
        />
      )}
      {!focusMode && sidebarShown && sidebarEl()}
      {/* Barra de sesiones flotante: encima de la terminal, sin empujarla. */}
      {!focusMode && !sidebarShown && peek && (
        <div
          ref={peekRef}
          onMouseEnter={h.peekEnter}
          onMouseLeave={h.peekLeave}
          style={{ width: sidebarWidth }}
          className="absolute left-11 top-0 bottom-0 z-30 max-w-[calc(100%-2.75rem)] flex flex-col bg-chrome border-r border-line shadow-pop"
        >
          <div className="h-8 shrink-0 flex items-center gap-1 pl-3 pr-1.5 border-b border-line text-[11px] font-semibold uppercase tracking-wide text-muted">
            <span className="flex-1">Sesiones</span>
            {/* Con la barra oculta por un panel derecho no se puede fijar: no cabría junto a la terminal. */}
            {!sidebarAutoHidden && (
              <button
                onClick={h.pinSessions}
                title="Fijar: acoplar la barra de sesiones junto a la terminal"
                aria-label="Fijar la barra de sesiones"
                className="h-6 px-1.5 flex items-center gap-1 rounded-md normal-case font-normal text-[12px] hover:text-fg hover:bg-hover"
              >
                <Pin size={13} />
                Fijar
              </button>
            )}
          </div>
          <div className="flex-1 min-h-0">
            {sidebarEl({
              onOpen: (x: Session) => (setPeek(false), openTab(x)),
              onOpenMany: (x: Session[]) => (setPeek(false), h.openMany(x)),
              onNew: (f?: string) => (setPeek(false), h.newSession(f)),
              onQuickConnect: () => (setPeek(false), h.openQuick()),
              onEdit: (x: Session) => (setPeek(false), h.editSession(x)),
            })}
          </div>
        </div>
      )}
      <main className="flex-1 min-w-0 flex flex-col overflow-clip">
        {update_ && (
          <div className="shrink-0 border-b border-line bg-selected">
            <div className="flex items-center gap-3 px-3 h-9 text-[13px]">
              <Sparkles size={14} className="text-accent shrink-0" />
              <span className="flex-1 truncate">
                Nueva versión <b>{update_.latest}</b> disponible (tienes {update_.current}).
              </span>
              {update_.notes && (
                <button className="text-accent hover:underline" onClick={() => setShowNotes(!showNotes)}>
                  {showNotes ? "Ocultar novedades" : "Ver novedades"}
                </button>
              )}
              {installing !== null ? (
                <span className="text-accent font-medium tabular-nums">Descargando… {installing}%</span>
              ) : update_.supported ? (
                <>
                  <button className="text-muted hover:text-fg hover:underline" onClick={() => openUrl(update_.url)}>
                    Ver release
                  </button>
                  <button className="px-2.5 h-6 rounded-md bg-accent text-accent-fg font-medium hover:opacity-90" onClick={installUpdate}>
                    Actualizar y reiniciar
                  </button>
                </>
              ) : (
                <button
                  className="text-accent font-medium hover:underline"
                  title={update_.reason ?? undefined}
                  onClick={() => openUrl(update_.url)}
                >
                  Descargar
                </button>
              )}
              <button
                className="text-muted hover:text-fg"
                title="Omitir esta versión"
                onClick={() => {
                  update({ updateDismissed: update_.latest });
                  setUpdate(null);
                }}
              >
                <XIcon size={14} />
              </button>
            </div>
            {showNotes && (
              <pre className="px-10 pb-3 max-h-48 overflow-y-auto text-[12px] whitespace-pre-wrap font-sans select-text">{update_.notes}</pre>
            )}
          </div>
        )}
        <BroadcastBar />
        <TabBar {...tabBarProps} />

        <div ref={rowRef} className="relative flex-1 min-h-0 flex">
        {settings.tabLayout === "vertical" && <VerticalTabs {...tabBarProps} />}
        <div ref={areaRef} className="relative flex-1 min-w-0 overflow-clip">
          {tabs.map((t) => {
            const pane = splitOn ? split!.panes.indexOf(t.id) : -1;
            return (
            <TerminalView
              key={t.id}
              id={t.id}
              session={t.session}
              active={t.id === activeId}
              visible={splitOn ? pane >= 0 : t.id === activeId}
              rect={pane >= 0 ? paneRect(split!.layout, pane) : undefined}
              onFocusPane={setActiveId}
              settings={settings}
              theme={preset.theme}
              onStatus={onStatus}
              onLog={onLog}
              logPath={states[t.id]?.logPath ?? null}
              onActivity={markActivity}
              onEnableLegacy={h.enableLegacy}
              onScreenHint={h.screenHint}
              register={register}
              onFindState={onFindState}
              catalog={catalog}
            />
            );
          })}
          {splitOn && (
            <SplitPanes split={split!} tabs={tabs} states={states} activeId={activeId} onPick={h.pickPane} onFocus={setActiveId} />
          )}
          {toolsOpen && (
            <Suspense fallback={<ToolsLoading active={activeId === "tools"} />}>
              <ToolsView
                active={activeId === "tools"}
                onBack={h.toggleTools}
                onClose={h.requestCloseTools}
                settings={settings}
                update={update}
                monitors={monitors}
                connId={h.toolsConnId}
                onConfirm={setConfirm}
                onOpenSession={openTab}
                tabs={tabBriefs}
                onFocusTab={focusTab}
                onReconnectTab={reconnectTab}
                sessions={sessions}
                onScp={h.scp}
                terminals={terminals}
              />
            </Suspense>
          )}
          {tabs.length === 0 && activeId !== "tools" && (
            <EmptyState
              onLocal={newLocal}
              onPalette={() => setPaletteOpen(true)}
              onQuick={h.openQuick}
              onNew={() => setModal({})}
              onTools={h.toggleTools}
              onCommands={h.toggleCommands}
              onNotes={h.toggleNotes}
            />
          )}
        </div>
        {!focusMode && commandsOpen && (
          <CommandsPanel
            width={panelWidth}
            overlay={panelOverlay}
            blocked={sendBlocked}
            onReturn={returnToTerminal}
            returnLabel={lastTermTab ? tabTitle(lastTermTab) : undefined}
            onResize={h.resizeNotes}
            catalog={catalog}
            vendor={settings.catalogVendor}
            onVendor={h.setVendor}
            platform={activeTab?.session.platform ?? null}
            onPlatform={h.setPlatform}
            onDetect={activeConnected ? h.detect : null}
            detecting={detecting}
            favorites={settings.favCommands}
            onFavorites={h.setFavorites}
            target={sendTarget}
            onClose={h.closeCommands}
            onRun={h.runCommand}
            onType={h.typeCommand}
            onAdd={h.addCommand}
            onEdit={h.editCommand}
            onPacks={h.openPacks}
          />
        )}
        {!focusMode && notesOpen && (
          <NotesPanel
            width={panelWidth}
            overlay={panelOverlay}
            blocked={sendBlocked}
            onReturn={returnToTerminal}
            returnLabel={lastTermTab ? tabTitle(lastTermTab) : undefined}
            onResize={h.resizeNotes}
            onClose={h.closeNotes}
            compiled={notesRules}
            theme={preset.theme}
            font={settings.fontFamily}
            fontSize={Math.max(11, settings.fontSize - 1)}
            target={broadcastMode ? sendTarget : activeConnected ? activeTab!.session.name : null}
            onSend={h.sendToSession}
            onCapture={h.capture}
          />
        )}
        </div>

        {/* En Herramientas no hay terminal a la que enviar: la barra solo ocuparía espacio. */}
        {/* Se oculta sola sin sesión activa o sin botones (los scripts siguen en la paleta). En modo
            foco solo queda mientras corre un script, para poder detenerlo. */}
        {settings.showButtonBar && activeId !== "tools" && !!activeTab && (settings.macros.length > 0 || barForced) && (!focusMode || !!scriptRun) && (
          <ButtonBar
            macros={settings.macros}
            connected={activeConnected || broadcastMode}
            running={scriptRun}
            onRun={h.runMacro}
            onRunScript={h.runScript}
            onStopScript={h.stopScript}
            onEdit={setMacroEdit}
            onDelete={h.deleteMacro}
            onNotice={toast}
            onDeleteMacros={(ids) => update((s) => ({ macros: s.macros.filter((x) => !ids.includes(x.id)) }))}
          />
        )}

        {!focusMode && <StatusBar
          tab={activeTab}
          device={settings.lifecycleInfo && activeId ? tabDevice[activeId] : undefined}
          state={activeId ? states[activeId] : undefined}
          onToggleLog={h.toggleLog}
          onReconnect={h.reconnect}
          onDisconnect={h.disconnect}
          aiEnabled={settings.mcpEnabled}
          onAi={h.openAi}
          onSaveAs={activeTab ? () => h.saveTabAs(activeTab.id) : undefined}
          findOpen={!!activeId && !!findOpenIds[activeId]}
          onFind={() => (activeId && findOpenIds[activeId] ? controllers.current.get(activeId)?.closeFind() : h.find())}
          onHistory={() => (historyFor ? h.closeHistory() : h.openHistory())}
          historyOpen={!!historyFor}
        />}
      </main>

      {modal && (
        <SessionModal
          initial={modal.session}
          title={modal.tabId ? "Guardar como sesión" : undefined}
          defaultFolder={modal.folder}
          folders={folders}
          onClose={() => setModal(null)}
          onSave={saveSession}
        />
      )}
      {settingsOpen && (
        <Suspense fallback={null}>
          <SettingsModal
            settings={settings}
            appDark={dark}
            termTheme={preset.theme}
            sessions={sessions}
            onImportSessions={importSessions}
            onImportFile={h.openImport}
            onExportFile={() => h.openExport()}
            initialSection={settingsSection}
            mcpStatus={mcpStatus}
            onChange={update}
            onClose={() => {
              setSettingsOpen(false);
              setSettingsSection(undefined);
              activeCtrl()?.focus();
            }}
          />
        </Suspense>
      )}
      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.label}
          danger={confirm.danger}
          defaultCancel={confirm.defaultCancel}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            confirm.action();
            setConfirm(null);
          }}
        />
      )}
      {macroEdit !== undefined && (
        <MacroModal
          initial={macroEdit}
          onClose={() => setMacroEdit(undefined)}
          onSave={(m) => {
            update((s) => ({
              macros: s.macros.some((x) => x.id === m.id)
                ? s.macros.map((x) => (x.id === m.id ? m : x))
                : [...s.macros, m],
            }));
            setMacroEdit(undefined);
          }}
        />
      )}
      {broadcast && (
        <BroadcastDialog
          text={broadcast.text}
          resolved={broadcast.resolved}
          declared={broadcast.declared}
          delayMs={bcDelay}
          onCancel={h.cancelBroadcast}
          onConfirm={h.startBroadcast}
        />
      )}
      <ScriptPrompts toast={toast} />
      {scriptLaunch && (
        <ScriptLaunchDialog script={scriptLaunch} onCancel={() => setScriptLaunch(null)} onRun={(l) => startScript(scriptLaunch, l)} />
      )}
      {approvals[0] && (
        <ApprovalDialog
          key={approvals[0].id}
          request={approvals[0]}
          pending={approvals.length}
          onDecide={(approved) => {
            mcpDecide(approvals[0].id, approved).catch((e) => toastFail("registrar la decisión sobre la solicitud MCP", e));
            setApprovals((a) => a.slice(1));
          }}
        />
      )}
      <Toasts toasts={toasts} onClose={closeToast} rightInset={!focusMode && (commandsOpen || notesOpen) ? panelWidth : 0} />
      {packsOpen && (
        <PacksModal
          packs={allPacks}
          disabled={settings.disabledPacks}
          onToggle={(id, enabled) =>
            update((s) => ({ disabledPacks: enabled ? s.disabledPacks.filter((x) => x !== id) : [...s.disabledPacks, id] }))
          }
          onChanged={loadPacks}
          onClose={() => setPacksOpen(false)}
        />
      )}
      {cmdEdit && (
        <CommandEditor
          vendorName={catalog.find((v) => v.id === cmdEdit.vendor)?.name ?? cmdEdit.vendor}
          platforms={catalog.find((v) => v.id === cmdEdit.vendor)?.platforms ?? []}
          initial={cmdEdit.initial}
          onClose={() => setCmdEdit(null)}
          onSave={(c) => saveUserCommand(cmdEdit.vendor, c, cmdEdit.initial?.cmd)}
          onDelete={cmdEdit.initial ? () => saveUserCommand(cmdEdit.vendor, null, cmdEdit.initial!.cmd) : undefined}
        />
      )}
      {template !== null && (
        <TemplateDialog
          text={template.text}
          onCancel={() => setTemplate(null)}
          onSubmit={(filled) => {
            const then = template.then;
            setTemplate(null);
            then(filled);
          }}
        />
      )}
      {labOpen && (
        <CliLab
          key={labOpen.n}
          // Comando de guardado según el fabricante de la pestaña activa (su resaltado), no el del catálogo.
          vendor={activeTab && activeTab.session.highlight && activeTab.session.highlight !== "default" ? vendorFor(activeTab.session.highlight) : settings.catalogVendor}
          compiled={notesRules}
          // Sigue el modo claro u oscuro de la app (no el tema de la terminal), como un editor.
          theme={(presets.find((x) => x.id === (dark ? "nt-dark" : "nt-light")) ?? preset).theme}
          font={settings.fontFamily}
          fontSize={Math.max(11, settings.fontSize - 1)}
          resolve={h.labTargets}
          connOf={h.labConn}
          onClose={closeLab}
        />
      )}
      {exportFolder !== undefined && (
        <ExportSessionsDialog sessions={sessions} folder={exportFolder || undefined} onClose={() => setExportFolder(undefined)} />
      )}
      {importOpen && (
        <Suspense fallback={null}>
          <ImportDialog folders={folders} sessions={sessions} onImport={importSessions} onClose={() => setImportOpen(false)} settings={settings} onSettings={update} onPacks={loadPacks} />
        </Suspense>
      )}
      {paletteOpen && (
        <CommandPalette
          sessions={sessions}
          onClose={() => setPaletteOpen(false)}
          onOpen={openTab}
          actions={[
            // Acciones de la sesión activa que ya no están en la barra de estado.
            ...(activeTab
              ? [
                  { label: "Buscar en la terminal", detail: "Busca texto en la salida de la pestaña activa", shortcut: `${modLabel}F`, run: () => h.find() },
                  ...(!activeTab.session.scp
                    ? [{ label: "Historial de comandos enviados", detail: "Últimos comandos de Notas, catálogo y botones para este equipo", shortcut: historyLabel, run: () => h.openHistory() }]
                    : []),
                  ...(activeTab.session.type === "serial" || activeTab.session.type === "telnet"
                    ? [{ label: "Enviar Break", detail: "Señal Break a la consola de la pestaña activa", run: () => h.sendBreak() }]
                    : []),
                  states[activeTab.id]?.status === "closed"
                    ? { label: "Reconectar sesión", detail: "Vuelve a conectar la pestaña activa", run: () => h.reconnect() }
                    : { label: "Desconectar sesión", detail: "Corta la conexión; la pestaña queda abierta", run: () => h.disconnect() },
                ]
              : []),
            { label: "Modo foco", detail: focusMode ? "Salir: vuelve a mostrar barras y paneles" : "Oculta barras y paneles: solo pestañas y terminal", shortcut: focusLabel, run: h.toggleFocus },
            { label: "Agregar script desde el equipo…", detail: "Copia un .py de cualquier carpeta a la carpeta de scripts", run: h.addScript },
            ...(settings.showButtonBar
              ? [
                  { label: "Nuevo botón de comando", detail: "Crea un botón en la barra de botones (comando o script)", run: h.newButton },
                  ...(settings.macros.length === 0
                    ? [
                        barForced
                          ? { label: "Ocultar barra de botones", detail: "Sin botones, la barra se oculta sola", run: () => setBarForced(false) }
                          : { label: "Scripts y barra de botones", detail: "Muestra la barra de botones para ejecutar o importar scripts", run: () => setBarForced(true) },
                      ]
                    : []),
                ]
              : []),
            { label: "Herramientas de red", detail: activeId === "tools" ? "Volver a la última terminal (Herramientas sigue abierta)" : "Monitoreo, diagnóstico, topología, syslog, SNMP, respaldos, plugins", shortcut: `${modLabel}E`, run: h.toggleTools },
            ...(toolsOpen ? [{ label: "Cerrar Herramientas", detail: "Cierra la vista y sus módulos (avisa si hay servidores activos)", run: h.requestCloseTools }] : []),
            { label: "Notas", detail: "Panel de notas con envío a la sesión", shortcut: `${modLabel}J`, run: h.toggleNotes },
            { label: "Catálogo de comandos", detail: "Comandos por fabricante", shortcut: `${modLabel}L`, run: h.toggleCommands },
            { label: "Barra de sesiones", detail: "Mostrar u ocultar la lista de sesiones", shortcut: `${modLabel}B`, run: h.toggleSidebar },
            { label: "Ajustes", detail: "Preferencias de la aplicación", shortcut: isMac ? "⌘," : "Ctrl+,", run: h.openSettings },
            { label: "Nueva terminal local", detail: "Abre una pestaña con la terminal de este equipo", shortcut: `${modLabel}T`, run: newLocal },
            { label: "Conexión rápida", detail: "SSH o Telnet sin guardar la sesión", shortcut: `${modLabel}O`, run: h.openQuick },
            { label: "Nueva sesión guardada", detail: "Crea una sesión en la barra de sesiones", shortcut: `${modLabel}N`, run: () => h.newSession() },
            {
              label: "CLI Lab: script multilínea",
              detail: "Ejecuta varios comandos en orden en una o varias sesiones, leyendo cada respuesta",
              shortcut: `${modLabel}I`,
              run: () => openLab(),
            },
            {
              label: "Exportar sesiones",
              detail: "Elige qué sesiones: XML compatible con SecureCRT o JSON",
              run: () => setExportFolder(""),
            },
            ...(tabs.length
              ? [
                  {
                    label: "Cerrar todas las sesiones",
                    detail: `${tabs.length} ${tabs.length === 1 ? "pestaña abierta" : "pestañas abiertas"}; pide confirmación si hay conexiones activas`,
                    shortcut: closeAllLabel,
                    run: () => requestCloseMany("all"),
                  },
                ]
              : []),
          ]}
        />
      )}
      {historyFor && tabs.some((t) => t.id === historyFor) && (
        <HistoryMenu
          historyKey={historyKey(tabs.find((t) => t.id === historyFor)!.session)}
          tabName={tabTitle(tabs.find((t) => t.id === historyFor)!)}
          isActiveTab={historyFor === activeId}
          connected={states[historyFor]?.status === "connected"}
          onResend={(cmd) => h.sendToTab(historyFor, cmd)}
          onClose={h.closeHistory}
          focusFallback={() => activeCtrl()?.focus()}
        />
      )}
      {quickOpen && <QuickConnectDialog onClose={() => setQuickOpen(false)} onOpen={openTab} />}
    </div>
  );
}

/** Mientras se descarga el módulo de Herramientas (primera apertura): estado visible y anunciado, no un hueco en blanco. */
function ToolsLoading({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div role="status" className="absolute inset-0 grid place-items-center text-muted">
      <div className="flex items-center gap-2">
        <span aria-hidden className="w-4 h-4 rounded-full border-2 border-line border-t-accent animate-spin" />
        Cargando Herramientas…
      </div>
    </div>
  );
}

function EmptyState({
  onLocal,
  onPalette,
  onQuick,
  onNew,
  onTools,
  onCommands,
  onNotes,
}: {
  onLocal: () => void;
  onPalette: () => void;
  onQuick: () => void;
  onNew: () => void;
  onTools: () => void;
  onCommands: () => void;
  onNotes: () => void;
}) {
  // Mismos nombres, íconos y atajos que la barra de actividad y la paleta: una sola forma de llamar a cada cosa.
  const items: [React.ReactNode, React.ReactNode, string, () => void][] = [
    [<Zap size={15} />, "Conexión rápida sin guardar", `${modLabel}O`, onQuick],
    [<SearchIcon size={15} />, "Buscar sesión", `${modLabel}K`, onPalette],
    [<Plus size={15} />, "Nueva sesión guardada", `${modLabel}N`, onNew],
    [<SquareTerminal size={15} />, "Terminal local", `${modLabel}T`, onLocal],
    [<Wrench size={15} />, "Herramientas de red", `${modLabel}E`, onTools],
    [<BookOpen size={15} />, "Catálogo de comandos", `${modLabel}L`, onCommands],
    [<NotebookPen size={15} />, "Notas", `${modLabel}J`, onNotes],
  ];
  // m-auto en vez de place-items-center: con poca altura la lista se desplaza en lugar de cortarse arriba.
  return (
    <div className="absolute inset-0 flex overflow-y-auto">
      <div className="w-[340px] max-w-full m-auto px-4 py-4">
        <img src={logo} alt="" className="w-16 h-16 -ml-2 mb-2 [@media(max-height:560px)]:hidden" draggable={false} />
        <h1 className="text-[18px] font-semibold mb-1">NetTerminal</h1>
        <p className="text-muted mb-4">SSH, Telnet y Serial sin complicaciones.</p>
        <div className="space-y-0.5">
          {items.map(([icon, label, key, fn], i) => (
            <button
              key={i}
              onClick={fn}
              title={`${label} (${key})`}
              className="w-full flex items-center gap-2.5 px-3 h-9 rounded-lg hover:bg-hover text-left"
            >
              <span aria-hidden className="text-muted shrink-0">{icon}</span>
              <span className="flex-1 min-w-0 truncate">{label}</span>
              <kbd className="text-[11px] text-muted font-sans">{key}</kbd>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
