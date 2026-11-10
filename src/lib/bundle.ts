/**
 * Archivo cifrado de NetTerminal (.ntx): tipos de los comandos del backend y la parte de la
 * importación que vive en la interfaz (qué ajustes se aplican, cómo se combinan botones, reglas,
 * carpetas y notas). El cifrado, el descifrado y las contraseñas de la bóveda están solo en Rust
 * (src-tauri/src/bundle.rs): ninguna contraseña guardada pasa por aquí.
 */
import { type Settings, type Macro, defaultSettings } from "./settings";
import type { Session } from "../types";
import type { HlRule } from "./highlight";
import { regexError, riskyRegex } from "./highlight";
import { type AlertRule, alertError } from "./alerts";
import { masterStrength } from "./credentials";
import { joinPath, normPath } from "./folders";

/** Palabra que se escribe para aceptar que el archivo lleve contraseñas (la misma que exige Rust). */
export const CONFIRM_WORD = "EXPORTAR";
export const MIN_BUNDLE_PASSWORD = 12;

/**
 * Claves de ajustes que nunca viajan ni se aplican. Copia de `SETTINGS_EXCLUDED` en bundle.rs (una
 * prueba de Node exige que sean iguales): secretos, funciones sensibles apagadas por defecto (API
 * local, servidores, algoritmos legacy, bloqueo de la bóveda), rutas locales y datos del equipo.
 */
export const SETTINGS_EXCLUDED = [
  "mcpToken",
  "mcpEnabled",
  "mcpPort",
  "mcpApproval",
  "mcpReadOnly",
  "tftpPort",
  "httpPort",
  "syslogPort",
  "syslogSave",
  "ftpPort",
  "snmpTrapPort",
  "snmpTrapBind",
  "autoLegacySsh",
  "vaultAutoLockMin",
  "vaultLockOnSleep",
  "logsDir",
  "monitors",
  "topoSources",
  "topology",
  "topoSnapshots",
  "sidebarOrder",
  "deviceInfo",
  "speedHistory",
  "updateDismissed",
  "macros",
  "customRules",
  "extraFolders",
] as const;

/** Protecciones que el archivo solo puede encender (copia de `SETTINGS_SAFE_ONLY`). */
export const SETTINGS_SAFE_ONLY: Record<string, boolean> = { logMask: true, confirmSend: true, confirmClose: true };

export interface PasswordCounts {
  sessions: number;
  hops: number;
  snmp: number;
}

/** Resultado de `bundle_export`. */
export interface BundleSummary {
  sessions: number;
  folders: number;
  settings: number;
  macros: number;
  packs: number;
  notes: number;
  rules: number;
  passwords: PasswordCounts;
  bytes: number;
}

export interface BundleNote {
  name: string;
  content: string;
}

/** Vista previa de `bundle_inspect`: nunca trae contraseñas, solo cuántas hay y de qué. */
export interface BundlePreview {
  token: string;
  app: string;
  created: string;
  sessions: Session[];
  advanced: number[];
  with_password: number[];
  folders: string[];
  settings: Record<string, unknown> | null;
  ignored_settings: string[];
  macros: unknown[] | null;
  packs: unknown[] | null;
  notes: BundleNote[] | null;
  highlight: unknown[] | null;
  passwords: PasswordCounts;
  hops: [string, string][];
  snmp_profiles: string[];
  warnings: string[];
}

export interface ApplyResult {
  sessions: Session[];
  added: number;
  updated: number;
  passwords: { sessions: number; snmp: number; hops: number; skipped: number };
  warnings: string[];
}

/** Opciones de `bundle_export` (en snake_case, como las lee Rust). */
export interface ExportOpts {
  session_ids: string[];
  all_sessions: boolean;
  settings: boolean;
  macros: boolean;
  packs: boolean;
  notes: boolean;
  highlight: boolean;
  passwords: { sessions: boolean; hops: { ip: string; user: string }[]; snmp: boolean; confirm: string } | null;
}

/** Fuerza de la contraseña del archivo: 0 si no llega al mínimo de 12; si no, la de la maestra. */
export function bundleStrength(pw: string): number {
  return [...pw].length < MIN_BUNDLE_PASSWORD ? 0 : masterStrength(pw);
}
export const bundleStrengthText = ["Muy corta (mínimo 12)", "Aceptable", "Buena", "Fuerte"];

/** Nombre corto de un ajuste para la lista de lo que se sobrescribe. */
const LABELS: Record<string, string> = {
  appTheme: "Tema de la interfaz",
  tabLayout: "Disposición de pestañas",
  terminalTheme: "Tema de la terminal",
  fontFamily: "Fuente",
  fontSize: "Tamaño de fuente",
  lineHeight: "Interlineado",
  cursorStyle: "Cursor",
  cursorBlink: "Cursor parpadeante",
  scrollback: "Historial de la terminal",
  copyOnSelect: "Copiar al seleccionar",
  rightClickPaste: "Pegar con clic derecho",
  confirmClose: "Confirmar al cerrar",
  confirmSend: "Confirmar envío de varias líneas",
  commandSuggest: "Sugerencias de comandos",
  autoLog: "Grabar logs automáticamente",
  logMask: "Ocultar secretos en logs",
  logPattern: "Nombre del log",
  highlightEnabled: "Resaltado",
  highlightSchemes: "Esquemas de resaltado",
  showButtonBar: "Barra de botones",
  modules: "Módulos de Herramientas",
  alertRules: "Reglas de alerta",
  snmpProfiles: "Perfiles SNMP",
  favCommands: "Comandos favoritos",
  disabledPacks: "Packs desactivados",
  mcpToken: "token del API local (MCP)",
  mcpEnabled: "API local (MCP)",
  mcpPort: "puerto del API local",
  mcpApproval: "aprobación del API local",
  mcpReadOnly: "solo lectura del API local",
  autoLegacySsh: "algoritmos SSH legacy",
  logsDir: "carpeta de logs",
  tftpPort: "servidor TFTP",
  httpPort: "servidor HTTP",
  syslogPort: "servidor Syslog",
  syslogSave: "guardado de Syslog",
  ftpPort: "servidor FTP",
  snmpTrapPort: "receptor de traps",
  snmpTrapBind: "IP del receptor de traps",
  monitors: "monitores",
  topoSources: "fuentes de Topología",
  vaultAutoLockMin: "bloqueo automático de la bóveda",
  vaultLockOnSleep: "bloqueo al suspender",
};
export const settingLabel = (k: string) => LABELS[k] ?? k;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const sameType = (v: unknown, d: unknown) => v !== null && typeof v === typeof d && Array.isArray(v) === Array.isArray(d);

/** Listas que se combinan por `id` (las del archivo reemplazan a las del mismo id) en vez de reemplazarse. */
const BY_ID = new Set(["snmpProfiles", "alertRules"]);

function mergeById<T extends { id: string }>(cur: T[], incoming: T[]): T[] {
  const ids = new Set(incoming.map((x) => x.id));
  return [...cur.filter((x) => !ids.has(x.id)), ...incoming];
}

/** Un valor de ajuste del archivo, ya validado para esta clave; undefined si no se aplica. */
function cleanValue(k: string, v: unknown): unknown {
  const d = (defaultSettings as unknown as Record<string, unknown>)[k];
  if (d === undefined || (SETTINGS_EXCLUDED as readonly string[]).includes(k) || !sameType(v, d)) return undefined;
  if (k in SETTINGS_SAFE_ONLY && v !== SETTINGS_SAFE_ONLY[k]) return undefined;
  if (k === "alertRules")
    return (v as unknown[]).filter((r): r is AlertRule => isObj(r) && typeof r.id === "string" && typeof r.pattern === "string" && !alertError(r as unknown as AlertRule));
  if (k === "snmpProfiles")
    return (v as unknown[]).filter((p) => isObj(p) && typeof p.id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(p.id) && typeof p.host === "string");
  return v;
}

/**
 * Ajustes del archivo que cambiarían algo aquí: solo claves que esta versión conoce, del mismo tipo,
 * fuera de la lista excluida y sin apagar protecciones. Lo demás se ignora.
 */
export function settingsChanges(current: Settings, imported: Record<string, unknown> | null): { key: string; label: string }[] {
  if (!imported) return [];
  const cur = current as unknown as Record<string, unknown>;
  const out: { key: string; label: string }[] = [];
  for (const [k, v] of Object.entries(imported)) {
    const val = cleanValue(k, v);
    if (val === undefined) continue;
    const next = BY_ID.has(k) ? mergeById(cur[k] as { id: string }[], val as { id: string }[]) : val;
    if (!same(cur[k], next)) out.push({ key: k, label: settingLabel(k) });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

/** Claves del archivo que no se aplican (desconocidas, excluidas, de otro tipo o que apagarían una protección). */
export function ignoredSettings(imported: Record<string, unknown> | null): string[] {
  if (!imported) return [];
  return Object.entries(imported)
    .filter(([k, v]) => cleanValue(k, v) === undefined)
    .map(([k]) => k);
}

function validMacros(list: unknown[] | null): Macro[] {
  return (list ?? []).filter(
    (m): m is Macro =>
      isObj(m) &&
      typeof m.id === "string" &&
      !!m.id &&
      typeof m.label === "string" &&
      (m.kind === "send" || m.kind === "script") &&
      (m.text === undefined || typeof m.text === "string") &&
      (m.script === undefined || typeof m.script === "string"),
  );
}

/** Reglas de resaltado con forma válida y sin patrones peligrosos (mismas reglas que al crearlas). */
export function validRules(list: unknown[] | null): HlRule[] {
  return (list ?? []).filter(
    (r): r is HlRule =>
      isObj(r) &&
      typeof r.id === "string" &&
      typeof r.name === "string" &&
      typeof r.pattern === "string" &&
      isObj(r.style) &&
      !regexError(r.pattern) &&
      !riskyRegex(r.pattern),
  );
}

export interface ApplyChoice {
  settings: boolean;
  macros: boolean;
  highlight: boolean;
  /** Carpeta de destino de la importación (vacía: la estructura original). */
  dest: string;
}

/**
 * Cambio de ajustes que aplica la importación: los ajustes elegidos (validados), botones y reglas
 * combinados por id, y las carpetas vacías del archivo bajo la carpeta de destino.
 */
export function settingsPatch(current: Settings, p: BundlePreview, choice: ApplyChoice): Partial<Settings> {
  const out: Record<string, unknown> = {};
  const cur = current as unknown as Record<string, unknown>;
  if (choice.settings && p.settings) {
    for (const [k, v] of Object.entries(p.settings)) {
      const val = cleanValue(k, v);
      if (val === undefined) continue;
      const next = BY_ID.has(k) ? mergeById(cur[k] as { id: string }[], val as { id: string }[]) : val;
      if (!same(cur[k], next)) out[k] = next;
    }
  }
  if (choice.macros && p.macros) out.macros = mergeById(current.macros, validMacros(p.macros));
  if (choice.highlight && p.highlight) out.customRules = mergeById(current.customRules, validRules(p.highlight));
  const base = normPath(choice.dest);
  const folders = p.folders.map((f) => joinPath(base, f)).filter((f) => f && !current.extraFolders.includes(f));
  if (folders.length) out.extraFolders = [...current.extraFolders, ...new Set(folders)];
  return out as Partial<Settings>;
}

/** Perfiles SNMP del archivo que efectivamente se importan (sus secretos solo entran con ellos). */
export function importedSnmpProfiles(p: BundlePreview, applySettings: boolean): string[] {
  if (!applySettings || !p.settings) return [];
  const list = cleanValue("snmpProfiles", p.settings.snmpProfiles);
  return Array.isArray(list) ? (list as { id: string }[]).map((x) => x.id).filter((id) => p.snmp_profiles.includes(id)) : [];
}

/** Notas a crear: un nombre que ya existe recibe " (importada)" (o " (importada 2)", …). */
export function planNotes(existing: string[], notes: BundleNote[] | null): BundleNote[] {
  const taken = new Set(existing.map((n) => n.toLowerCase()));
  const out: BundleNote[] = [];
  for (const n of notes ?? []) {
    let name = n.name;
    for (let i = 1; taken.has(name.toLowerCase()); i++) name = `${n.name} (importada${i > 1 ? ` ${i}` : ""})`;
    taken.add(name.toLowerCase());
    out.push({ name, content: n.content });
  }
  return out;
}

/** Sesiones del archivo con su carpeta final (dentro de la carpeta de destino). */
export function withDest(sessions: Session[], dest: string): Session[] {
  const base = normPath(dest);
  return sessions.map((s) => ({ ...s, folder: joinPath(base, s.folder ?? "") || undefined }));
}
