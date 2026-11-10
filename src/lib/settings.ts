import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { HlRule } from "./highlight";
import { type AlertRule, exampleAlerts } from "./alerts";
import type { MonitorTarget } from "./monitors";
import type { DeviceInfoMap } from "./lifecycle";
import type { TopoSnapshot, TopoSources, Topology } from "./topology";
import type { SnmpProfile } from "./snmp";
import { type GhostColor, type GhostStyle, type ListKey, SUGGEST_DEFAULT, migrateSuggest } from "./suggest";

export type ModuleId = "monitor" | "diag" | "topology" | "subnet" | "perf" | "transfer" | "syslog" | "plugins" | "backup" | "snmp" | "logsearch";

export interface SpeedResult {
  ts: string;
  download_mbps: number;
  upload_mbps: number;
  latency_ms: number;
  jitter_ms: number;
  server?: { colo?: string | null; city?: string | null };
}

/** Botón de comando rápido: envía texto (con {{variables}}) o ejecuta un script Python. */
export interface Macro {
  id: string;
  label: string;
  kind: "send" | "script";
  text?: string;
  script?: string;
}

export type TabLayout = "horizontal" | "vertical";

export interface Settings {
  appTheme: "system" | "light" | "dark";
  /** Pestañas arriba (por defecto) o en una columna a la izquierda. */
  tabLayout: TabLayout;
  terminalTheme: string;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  cursorStyle: "block" | "bar" | "underline";
  cursorBlink: boolean;
  scrollback: number;
  copyOnSelect: boolean;
  rightClickPaste: boolean;
  confirmClose: boolean;
  /** Reintenta solo con algoritmos legacy si el equipo SSH los exige (apagado por defecto: abre la puerta a un downgrade). */
  autoLegacySsh: boolean;
  /** Sugerencias de comandos del catálogo al escribir. */
  commandSuggest: boolean;
  /** El usuario eligió el valor de commandSuggest (si no, sigue al valor por defecto). */
  commandSuggestSet: boolean;
  /** Tecla que abre la lista de sugerencias. */
  suggestListKey: ListKey;
  /** Color de la sugerencia (automático según el tema o un tono fijo). */
  suggestColor: GhostColor;
  /** Estilo extra de la sugerencia: cursiva o subrayado punteado. */
  suggestStyle: GhostStyle;
  /** Tab acepta la sugerencia visible (sin sugerencia, Tab sigue yendo al equipo). */
  suggestTabAccept: boolean;
  /** Ayuda "Tab o → acepta · Esc descarta" junto a la sugerencia (sus primeras veces). */
  suggestTip: boolean;
  autoLog: boolean;
  highlightEnabled: boolean;
  /** Esquemas activos por defecto (las sesiones pueden fijar su fabricante). */
  highlightSchemes: string[];
  customRules: HlRule[];
  /** Pausa entre líneas al enviar desde Notas (consolas lentas). */
  sendLineDelay: number;
  /** Deja un marcador en la terminal al ejecutar cada comando (para saltar entre comandos). */
  autoMarkCommands: boolean;
  logTimestamps: boolean;
  /** Carpetas creadas a mano (pueden estar vacías). */
  extraFolders: string[];
  /** Orden manual de la lista de sesiones por carpeta (ver SidebarOrder en folders.ts). */
  sidebarOrder: Record<string, string[]>;
  /** Ciclo de vida (EoL) y versión de sistema operativo del equipo en la barra de estado (opcional). */
  lifecycleInfo: boolean;
  /** Modelo y versión vistos por destino (host), para el ciclo de vida en la barra de estado. */
  deviceInfo: DeviceInfoMap;
  confirmSend: boolean;
  macros: Macro[];
  showButtonBar: boolean;
  /** Con la barra de sesiones cerrada, el ícono Sesiones la abre superpuesta sin empujar la terminal. */
  floatingSidebar: boolean;
  mcpEnabled: boolean;
  mcpPort: number;
  mcpToken: string;
  mcpApproval: boolean;
  mcpReadOnly: boolean;
  modules: Record<ModuleId, boolean>;
  monitors: MonitorTarget[];
  tftpPort: number;
  httpPort: number;
  syslogPort: number;
  syslogSave: boolean;
  speedHistory: SpeedResult[];
  updateDismissed: string;
  /** Comandos favoritos del catálogo ("fabricante:comando"). */
  favCommands: string[];
  catalogVendor: string;
  /** Packs de comandos desactivados (incluidos o importados). */
  disabledPacks: string[];
  /** Diagrama de topología en curso (se guarda con los datos, también en modo portable). */
  topology: Topology;
  topoSnapshots: TopoSnapshot[];
  /** Fuentes opcionales de Topología (ruteo, descripciones); apagadas por defecto. */
  topoSources: TopoSources;
  /** Nombre del log: {session} {host} {folder} {date} {time}. */
  logPattern: string;
  /** Anexar si el archivo ya existe (si no, se crea uno nuevo). */
  logAppend: boolean;
  logRotateDaily: boolean;
  /** Reemplaza por **** contraseñas, secrets, communities y llaves en los logs. */
  logMask: boolean;
  /** Carpeta de logs elegida por el usuario (ruta absoluta); vacío: `data/logs`. */
  logsDir: string;
  alertRules: AlertRule[];
  /** SNMP: perfiles sin secretos (los secretos solo en la bóveda, si el usuario lo pide). */
  snmpProfiles: SnmpProfile[];
  snmpTrapPort: number;
  /** IP local del receptor de traps ("" = 127.0.0.1). */
  snmpTrapBind: string;
  ftpPort: number;
  /** Acceso de los servidores integrados por tipo (tftp, http, ftp, syslog): interfaz, clientes permitidos e inactividad. Ver lib/serverGuard.ts. */
  serverGuard: Record<string, { bind?: string; allow?: string; idle?: number }>;
  /** Bóveda con contraseña maestra: minutos sin usarla antes de bloquearla (0 = nunca). */
  vaultAutoLockMin: number;
  /** Bóveda con contraseña maestra: bloquear al notar que el equipo estuvo suspendido. */
  vaultLockOnSleep: boolean;
}

export interface UpdateInfo {
  current: string;
  latest: string;
  newer: boolean;
  url: string;
  notes: string;
  published: string;
  /** Si esta instalación puede actualizarse sola (portable y .deb no). */
  supported: boolean;
  reason: string | null;
}

export const defaultSettings: Settings = {
  appTheme: "system",
  tabLayout: "horizontal",
  terminalTheme: "auto",
  fontFamily: "",
  fontSize: 13,
  lineHeight: 1.15,
  cursorStyle: "block",
  cursorBlink: true,
  scrollback: 5000,
  copyOnSelect: true,
  rightClickPaste: true,
  confirmClose: true,
  autoLegacySsh: false,
  commandSuggest: SUGGEST_DEFAULT,
  commandSuggestSet: false,
  suggestListKey: "ctrl+period",
  suggestColor: "auto",
  suggestStyle: "underline",
  suggestTabAccept: true,
  suggestTip: true,
  autoLog: false,
  highlightEnabled: true,
  highlightSchemes: ["cisco", "common"],
  customRules: [],
  sendLineDelay: 0,
  autoMarkCommands: false,
  logTimestamps: false,
  extraFolders: [],
  sidebarOrder: {},
  lifecycleInfo: false,
  deviceInfo: {},
  confirmSend: true,
  macros: [
    { id: "m1", label: "terminal length 0", kind: "send", text: "terminal length 0" },
    { id: "m2", label: "Interfaces", kind: "send", text: "show ip interface brief" },
  ],
  showButtonBar: true,
  floatingSidebar: false,
  mcpEnabled: false,
  mcpPort: 47821,
  mcpToken: "",
  mcpApproval: true,
  mcpReadOnly: false,
  modules: { monitor: true, diag: true, topology: true, subnet: true, perf: true, transfer: true, syslog: true, plugins: true, backup: true, snmp: true, logsearch: true },
  monitors: [],
  tftpPort: 69,
  httpPort: 8080,
  syslogPort: 514,
  syslogSave: false,
  speedHistory: [],
  updateDismissed: "",
  favCommands: [],
  catalogVendor: "cisco",
  disabledPacks: [],
  topology: { nodes: [], links: [] },
  topoSnapshots: [],
  topoSources: {},
  logPattern: "{session}_{date}-{time}",
  logAppend: false,
  logRotateDaily: false,
  logMask: true,
  logsDir: "",
  alertRules: exampleAlerts,
  snmpProfiles: [],
  snmpTrapPort: 162,
  snmpTrapBind: "",
  ftpPort: 21,
  serverGuard: {},
  vaultAutoLockMin: 0,
  vaultLockOnSleep: false,
};

/** Opciones de log que se pasan a set_logging. */
export const logOptions = (s: Settings) => ({
  timestamps: s.logTimestamps,
  pattern: s.logPattern,
  append: s.logAppend,
  rotate: s.logRotateDaily,
  mask: s.logMask,
});

export function newToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Ajustes leídos del disco sobre los valores por defecto. Un valor de otro tipo que el
 * predeterminado (settings.json editado a mano o de otra versión) se reemplaza por este:
 * un `"alertRules": null` dejaba la ventana en blanco. Las claves desconocidas se conservan.
 */
export function mergeSettings(loaded: unknown): Settings {
  const out: Record<string, unknown> = { ...defaultSettings };
  if (!loaded || typeof loaded !== "object" || Array.isArray(loaded)) return out as unknown as Settings;
  const defaults = defaultSettings as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(loaded)) {
    const d = defaults[k];
    if (d === undefined || (v !== null && typeof v === typeof d && Array.isArray(v) === Array.isArray(d))) out[k] = v;
  }
  // topology.json y los equipos recordados se pueden compartir o editar: forma mínima para que un
  // archivo mal formado no deje la vista en blanco.
  out.topology = cleanTopology(out.topology) ?? defaultSettings.topology;
  out.topoSnapshots = Array.isArray(out.topoSnapshots)
    ? (out.topoSnapshots as unknown[]).flatMap((x) => {
        const s = isObj(x) ? x : null;
        const topo = s && cleanTopology(s.topo);
        return s && topo && typeof s.id === "string" && typeof s.name === "string" ? [{ ...s, topo, ts: Number(s.ts) || 0 }] : [];
      })
    : [];
  out.deviceInfo = Object.fromEntries(
    Object.entries(isObj(out.deviceInfo) ? out.deviceInfo : {}).filter(([, v]) => isObj(v) && (v.model === undefined || typeof v.model === "string") && (v.version === undefined || typeof v.version === "string")),
  );

  return out as unknown as Settings;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Topología con equipos y enlaces de forma válida (los que no la tienen se descartan); null si no es una topología. */
function cleanTopology(v: unknown): Settings["topology"] | null {
  if (!isObj(v) || !Array.isArray(v.nodes) || !Array.isArray(v.links)) return null;
  const nodes = v.nodes.filter(
    (n): n is Settings["topology"]["nodes"][number] =>
      isObj(n) && typeof n.id === "string" && typeof n.name === "string" && Number.isFinite(n.x) && Number.isFinite(n.y),
  );
  const links = v.links.filter(
    (l): l is Settings["topology"]["links"][number] =>
      isObj(l) && typeof l.a === "string" && typeof l.b === "string" && typeof l.aPort === "string" && typeof l.bPort === "string" && typeof l.proto === "string",
  );
  return { nodes, links };
}

// ---------- Versión de esquema, migraciones y avisos de datos ----------

/**
 * Versión de esquema de settings.json y topology.json que escribe esta versión (la misma que
 * `SCHEMA_VERSION` en src-tauri/src/datafiles.rs). Un archivo sin el campo es v0 (todo lo escrito
 * hasta la 0.9.20). El backend agrega y conserva el campo; la interfaz solo ejecuta sus pasos.
 */
export const SETTINGS_SCHEMA_VERSION = 1;

/** Lo que pasó al leer un archivo de datos (campo `__datafiles` de `get_settings`, ver datafiles.rs). */
export interface DataFileNotice {
  /** Versión del archivo en disco (0: sin el campo); null: no existía. */
  fileVersion: number | null;
  schemaVersion: number;
  /** El archivo es de una versión posterior a la que conoce esta app. */
  newer: boolean;
  migratedFrom: number | null;
  /** Respaldo desde el que se restauró un archivo ilegible. */
  restoredFrom: string | null;
  /** Claves o entradas inválidas que se descartaron al leer. */
  dropped: string[];
  tooLarge: boolean;
  corrupt: boolean;
  /** Se restauró desde un respaldo (que no guarda el token del API local) y se generó un token nuevo. */
  tokenRegenerated: boolean;
}

export interface DataFilesInfo {
  schemaVersion: number;
  settings: DataFileNotice;
  topology: DataFileNotice;
  /** sessions.json: solo si hubo algo que informar al abrirlo (una sola vez). */
  sessions: DataFileNotice | null;
}

/** Paso numerado de migración de los ajustes: pasa un settings.json crudo de `from` a `from + 1`. Idempotente. */
export interface SettingsMigration {
  from: number;
  name: string;
  run: (raw: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * Tabla de migraciones de la interfaz. El paso 0 -> 1 reúne lo que antes se hacía en cada arranque
 * sin versión: `migrateSuggest` (commandSuggestSet). La separación de la topología (`__topoStore`) la
 * decide el backend según exista topology.json y no depende de este número; la versión de los
 * estilos de tráfico (`UI_VERSION` de `topoUi`) vive aparte, en localStorage.
 */
export const SETTINGS_MIGRATIONS: SettingsMigration[] = [
  { from: 0, name: "sugerencias de comandos (commandSuggestSet)", run: (raw) => ({ ...raw, ...migrateSuggest(raw) }) },
];

/** Corre los pasos desde `fromVersion` hasta `target`. Un archivo ya en la versión actual (o posterior) no se toca. */
export function migrateRaw(raw: Record<string, unknown>, fromVersion: number, steps: readonly SettingsMigration[] = SETTINGS_MIGRATIONS, target = SETTINGS_SCHEMA_VERSION): Record<string, unknown> {
  let out = raw;
  for (let v = Math.max(0, Math.floor(fromVersion) || 0); v < target; v++) {
    const step = steps.find((m) => m.from === v);
    if (step) out = step.run(out);
  }
  return out;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function parseNotice(v: unknown): DataFileNotice | null {
  if (!isObj(v)) return null;
  return {
    fileVersion: num(v.fileVersion),
    schemaVersion: num(v.schemaVersion) ?? 0,
    newer: v.newer === true,
    migratedFrom: num(v.migratedFrom),
    restoredFrom: typeof v.restoredFrom === "string" ? v.restoredFrom : null,
    dropped: strList(v.dropped),
    tooLarge: v.tooLarge === true,
    corrupt: v.corrupt === true,
    tokenRegenerated: v.tokenRegenerated === true,
  };
}

/** `__datafiles` del backend a un valor tipado (null si falta o no tiene la forma esperada). */
export function parseDataFilesInfo(v: unknown): DataFilesInfo | null {
  if (!isObj(v)) return null;
  const settings = parseNotice(v.settings);
  const topology = parseNotice(v.topology);
  if (!settings || !topology) return null;
  return { schemaVersion: num(v.schemaVersion) ?? 0, settings, topology, sessions: parseNotice(v.sessions) };
}

export interface LoadedSettings {
  settings: Settings;
  /** Topología tal como quedó guardada (null: falta migrarla desde settings.json). */
  heavy: Pick<Settings, "topology" | "topoSnapshots"> | null;
  info: DataFilesInfo | null;
}

/**
 * Respuesta cruda de `get_settings` a ajustes listos: migra según la versión del archivo, completa con
 * los valores por defecto y separa las marcas del backend (`__topoStore`, `__datafiles`, `schemaVersion`).
 */
export function loadSettings(res: unknown): LoadedSettings {
  const raw = isObj(res) ? res : null;
  const info = parseDataFilesInfo(raw?.__datafiles);
  const from = info?.settings.fileVersion ?? 0;
  const settings = mergeSettings(raw ? migrateRaw(raw, from) : raw);
  const heavy = raw?.__topoStore === true ? { topology: settings.topology, topoSnapshots: settings.topoSnapshots } : null;
  const rec = settings as unknown as Record<string, unknown>;
  for (const k of ["__topoStore", "__datafiles", "schemaVersion"]) delete rec[k];
  return { settings, heavy, info };
}

/** Aviso para el usuario derivado de `__datafiles`. La clave evita repetirlo. */
export interface DataNotice {
  key: string;
  text: string;
}

const FILE_LABEL = { settings: "settings.json", topology: "topology.json", sessions: "sessions.json" } as const;

/**
 * Qué decirle al usuario tras leer los datos (cada aviso una sola vez, según `seen`). Nada si todo
 * está normal: las migraciones silenciosas no molestan.
 */
export function describeDataNotices(info: DataFilesInfo | null, seen: ReadonlySet<string> = new Set()): DataNotice[] {
  if (!info) return [];
  const out: DataNotice[] = [];
  for (const kind of ["settings", "topology", "sessions"] as const) {
    const n = info[kind];
    if (!n) continue;
    const file = FILE_LABEL[kind];
    const stem = file.replace(".json", "");
    if (n.restoredFrom) {
      out.push({ key: `restored:${file}:${n.restoredFrom}`, text: `${file} estaba dañado y se restauró desde el respaldo ${n.restoredFrom}. El archivo dañado quedó junto a tus datos como ${stem}.corrupt-<fecha>.json.` });
    } else if (n.tooLarge) {
      out.push({ key: `large:${file}`, text: `${file} superaba el tamaño máximo (64 MB) y se apartó como ${stem}.corrupt-<fecha>.json. La app partió con valores por defecto.` });
    } else if (n.corrupt) {
      out.push({ key: `corrupt:${file}`, text: `${file} estaba dañado y no había un respaldo válido. El archivo se conservó como ${stem}.corrupt-<fecha>.json.` });
    }
    if (n.tokenRegenerated) {
      out.push({
        key: `token:${file}:${n.restoredFrom}`,
        text: "Los respaldos no guardan el token del API local (MCP): al restaurar los ajustes se generó uno nuevo. Si usas clientes MCP, copia el token nuevo desde Ajustes › Agentes IA.",
      });
    }
    if (n.newer) {
      out.push({
        key: `newer:${file}:${n.fileVersion}`,
        text: `${file} lo guardó una versión más nueva de NetTerminal (esquema ${n.fileVersion}; esta versión conoce hasta ${n.schemaVersion}). Se conserva lo que esta versión no reconoce, pero conviene actualizar. Copia del original: ${stem}.v${n.fileVersion}.bak.json.`,
      });
    }
    if (n.dropped.length > 0 && !n.newer) {
      out.push({ key: `dropped:${file}:${n.dropped.join("|")}`, text: `Se descartaron datos inválidos de ${file} (${n.dropped.slice(0, 3).join(", ")}${n.dropped.length > 3 ? " y más" : ""}). El original quedó respaldado como ${stem}.corrupt-<fecha>.json.` });
    }
  }
  return out.filter((n) => !seen.has(n.key));
}

/** Texto de un guardado fallido (por ejemplo, la topología sobre 64 MB) para mostrar al usuario. */
export function saveErrorText(what: "topología" | "ajustes", err: unknown): string {
  const msg = typeof err === "string" ? err : err instanceof Error ? err.message : String(err);
  return /64 MB/.test(msg) ? msg : `No se pudo guardar ${what === "topología" ? "la topología" : "la configuración"}. Motivo: ${msg}`;
}

/** Avisos de datos para la interfaz: `messages` (una vez cada uno) y el último error de guardado, si lo hay. */
export interface DataNotices {
  messages: string[];
  saveError: string | null;
  /** Cierra los avisos (los de datos no se repiten en este equipo; el error se borra solo al guardar bien). */
  dismiss: () => void;
}

const SEEN_KEY = "dataNoticeSeen";

function loadSeen(): Set<string> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]");
    return new Set(strList(v));
  } catch {
    return new Set();
  }
}

function rememberSeen(keys: string[]) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...loadSeen(), ...keys].slice(-40)));
  } catch {
    /* sin almacenamiento: el aviso puede repetirse */
  }
}

/** Carga los ajustes desde el backend y los guarda (con debounce) en cada cambio. */
/** Claves que viven en topology.json: se guardan solo cuando cambian (pueden pesar varios MB). */
type Heavy = Pick<Settings, "topology" | "topoSnapshots">;

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [messages, setMessages] = useState<string[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  /** Topología tal como quedó guardada (null: falta migrarla desde settings.json). */
  const savedHeavy = useRef<Heavy | null>(null);

  useEffect(() => {
    invoke<unknown>("get_settings")
      .then((res) => {
        const { settings: loaded, heavy, info } = loadSettings(res);
        savedHeavy.current = heavy;
        const fresh = describeDataNotices(info, loadSeen());
        if (fresh.length > 0) {
          setMessages(fresh.map((n) => n.text));
          rememberSeen(fresh.map((n) => n.key));
        }
        setSettings(loaded);
      })
      .catch(() => setSettings(defaultSettings));
  }, []);

  const save = useCallback(async (next: Settings) => {
    const { topology, topoSnapshots, ...light } = next;
    const prev = savedHeavy.current;
    let error: string | null = null;
    const saveRest = (body: unknown) =>
      invoke("save_settings", { settings: body }).catch((e) => {
        console.error(e);
        error ??= saveErrorText("ajustes", e);
      });
    if (!prev || prev.topology !== topology || prev.topoSnapshots !== topoSnapshots) {
      try {
        await invoke("save_topology", { data: { topology, topoSnapshots } });
        savedHeavy.current = { topology, topoSnapshots };
      } catch (e) {
        console.error(e);
        error = saveErrorText("topología", e);
        // Sobre el tope no se copia a settings.json (lo haría igual de grande): se guarda el resto.
        // Sin topology.json la topología sigue en settings.json, como antes: no se pierde.
        await saveRest(String(e).includes("64 MB") ? light : next);
        setSaveError(error);
        return;
      }
    }
    await saveRest(light);
    setSaveError(error);
  }, []);

  const update = useCallback((patch: Partial<Settings> | ((s: Settings) => Partial<Settings>)) => {
    setSettings((prev) => {
      const base = prev ?? defaultSettings;
      const next = { ...base, ...(typeof patch === "function" ? patch(base) : patch) };
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void save(next), 300);
      return next;
    });
  }, [save]);

  const dismiss = useCallback(() => {
    setMessages([]);
    setSaveError(null);
  }, []);

  // Tercer elemento: avisos de datos (archivo más nuevo, restauración, tope de 64 MB). Quien solo
  // desestructure `[settings, update]` no cambia.
  return [settings, update, { messages, saveError, dismiss } satisfies DataNotices] as const;
}
