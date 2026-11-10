/**
 * Archivo cifrado de NetTerminal (.ntx): tipos de los comandos del backend y la parte de la
 * importación que vive en la interfaz (qué ajustes se aplican, cómo se combinan botones, reglas,
 * carpetas y notas). El cifrado, el descifrado y las contraseñas de la bóveda están solo en Rust
 * (src-tauri/src/bundle.rs): ninguna contraseña guardada pasa por aquí.
 */
import { type Settings, type Macro, type ModuleId, defaultSettings } from "./settings";
import type { Session, Tunnel } from "../types";
import type { HlRule } from "./highlight";
import { regexError, riskyRegex, schemes } from "./highlight";
import { type Pack, type Risk, buildCatalog, computeRisk } from "./packs";
import { GHOST_COLORS, GHOST_STYLES, LIST_KEYS } from "./suggest";
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
  "mcpVisibility",
  "mcpMarked",
  "mcpScopes",
  "mcpAudit",
  "mcpWindowMin",
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
  "serverGuard",
  "disabledPacks",
] as const;

/**
 * Valor que el archivo puede fijar en estos ajustes: el seguro (copia de `SETTINGS_SAFE_ONLY` en Rust).
 * Las protecciones (logMask, confirmSend, confirmClose) solo se encienden; lo que copia o pega solo, o
 * graba todo a disco (copyOnSelect, rightClickPaste, autoLog), solo se apaga.
 */
export const SETTINGS_SAFE_ONLY: Record<string, boolean> = {
  logMask: true,
  confirmSend: true,
  confirmClose: true,
  copyOnSelect: false,
  rightClickPaste: false,
  autoLog: false,
};

/**
 * Qué hace la importación con cada ajuste de `Settings` (tabla completa en docs/TECNICO.md):
 * - `excluded`: nunca viaja ni se aplica (SETTINGS_EXCLUDED).
 * - `safeOnly`: solo se acepta el valor seguro (SETTINGS_SAFE_ONLY).
 * - `onlyOff`: objeto de interruptores; el archivo solo puede apagar (módulos).
 * - `check`: se acepta si pasa la validación (rango, lista de valores o formato).
 * - `free`: apariencia o preferencias inocuas; basta con que sea del mismo tipo.
 * El tipo exige una entrada por clave: una clave nueva en settings.ts sin clasificar no compila, y
 * scripts/tests/bundle.test.mjs falla si las listas no coinciden.
 */
export type SettingPolicy =
  | { kind: "excluded" }
  | { kind: "safeOnly" }
  | { kind: "onlyOff" }
  | { kind: "check"; ok: (v: unknown) => boolean; rule: string }
  | { kind: "free" };

const EXCLUDED: SettingPolicy = { kind: "excluded" };
const SAFE: SettingPolicy = { kind: "safeOnly" };
const FREE: SettingPolicy = { kind: "free" };
const oneOf = (values: readonly string[]): SettingPolicy => ({ kind: "check", ok: (v) => typeof v === "string" && values.includes(v), rule: values.join(" | ") });
const intIn = (min: number, max: number): SettingPolicy => ({ kind: "check", ok: (v) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max, rule: `entero ${min}..${max}` });
const numIn = (min: number, max: number): SettingPolicy => ({ kind: "check", ok: (v) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max, rule: `${min}..${max}` });
const text = (re: RegExp, max: number, rule: string): SettingPolicy => ({ kind: "check", ok: (v) => typeof v === "string" && v.length <= max && re.test(v), rule });
const strList = (max: number, each: (x: string) => boolean, rule: string): SettingPolicy => ({
  kind: "check",
  ok: (v) => Array.isArray(v) && v.length <= max && v.every((x) => typeof x === "string" && each(x)),
  rule,
});
const NO_CONTROL = /^[^\u0000-\u001f\u007f]*$/;

export const SETTINGS_POLICY: { [K in keyof Settings]: SettingPolicy } = {
  // Apariencia.
  appTheme: oneOf(["system", "light", "dark"]),
  tabLayout: oneOf(["horizontal", "vertical"]),
  terminalTheme: text(/^[\w.-]{1,64}$/, 64, "id de tema"),
  fontFamily: text(/^[\p{L}\p{N} ,'"._-]*$/u, 120, "nombre de fuente sin símbolos"),
  fontSize: intIn(9, 28),
  lineHeight: numIn(1, 2),
  cursorStyle: oneOf(["block", "bar", "underline"]),
  cursorBlink: FREE,
  showButtonBar: FREE,
  floatingSidebar: FREE,
  highlightEnabled: FREE,
  highlightSchemes: strList(20, (x) => schemes.some((s) => s.id === x), "esquemas conocidos"),
  suggestColor: oneOf(Object.keys(GHOST_COLORS)),
  suggestStyle: oneOf(Object.keys(GHOST_STYLES)),
  suggestTip: FREE,
  // Comportamiento de la terminal.
  scrollback: intIn(1000, 100_000),
  sendLineDelay: intIn(0, 500),
  copyOnSelect: SAFE,
  rightClickPaste: SAFE,
  confirmClose: SAFE,
  confirmSend: SAFE,
  commandSuggest: FREE,
  commandSuggestSet: FREE,
  suggestListKey: oneOf(Object.keys(LIST_KEYS)),
  suggestTabAccept: FREE,
  autoMarkCommands: FREE,
  lifecycleInfo: FREE,
  catalogVendor: text(/^[a-z0-9][a-z0-9_.-]{0,63}$/, 64, "id de fabricante"),
  favCommands: strList(1000, (x) => x.length <= 300 && NO_CONTROL.test(x), "hasta 1.000 textos de 300"),
  modules: { kind: "onlyOff" },
  // Logs.
  autoLog: SAFE,
  logMask: SAFE,
  logTimestamps: FREE,
  logAppend: FREE,
  logRotateDaily: FREE,
  // Nombre relativo: sin rutas absolutas, unidades ni "..", sin caracteres de control (Rust además lo sanea).
  logPattern: text(/^(?![\\/])(?![a-zA-Z]:)(?!.*(?:^|[\\/])\.\.(?:[\\/]|$))[^\u0000-\u001f\u007f]*$/, 200, "nombre relativo sin .."),
  // Listas validadas (se combinan por id).
  alertRules: { kind: "check", ok: Array.isArray, rule: "cada regla validada (alertError)" },
  snmpProfiles: { kind: "check", ok: Array.isArray, rule: "id y host válidos, sin secretos" },
  // Nunca.
  autoLegacySsh: EXCLUDED,
  mcpEnabled: EXCLUDED,
  mcpPort: EXCLUDED,
  mcpToken: EXCLUDED,
  mcpApproval: EXCLUDED,
  mcpReadOnly: EXCLUDED,
  mcpVisibility: EXCLUDED,
  mcpMarked: EXCLUDED,
  mcpScopes: EXCLUDED,
  mcpAudit: EXCLUDED,
  mcpWindowMin: EXCLUDED,
  tftpPort: EXCLUDED,
  httpPort: EXCLUDED,
  syslogPort: EXCLUDED,
  syslogSave: EXCLUDED,
  ftpPort: EXCLUDED,
  snmpTrapPort: EXCLUDED,
  snmpTrapBind: EXCLUDED,
  serverGuard: EXCLUDED,
  vaultAutoLockMin: EXCLUDED,
  vaultLockOnSleep: EXCLUDED,
  logsDir: EXCLUDED,
  monitors: EXCLUDED,
  topoSources: EXCLUDED,
  topology: EXCLUDED,
  topoSnapshots: EXCLUDED,
  sidebarOrder: EXCLUDED,
  deviceInfo: EXCLUDED,
  speedHistory: EXCLUDED,
  updateDismissed: EXCLUDED,
  disabledPacks: EXCLUDED,
  macros: EXCLUDED,
  customRules: EXCLUDED,
  extraFolders: EXCLUDED,
};

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
  /** Ruta escrita (con contraseñas la elige Rust en su propio diálogo). */
  path: string;
}

/** Mensaje de Rust cuando el usuario cancela su diálogo de guardado o la confirmación (copia de `EXPORT_CANCELLED`). */
export const EXPORT_CANCELLED = "Exportación cancelada: no se escribió ningún archivo";

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
  /** Extras de las sesiones avanzadas (índice en `sessions`), para revisarlos antes de importarlos. */
  extras?: SessionExtras[];
  warnings: string[];
}

/** Lo que una sesión del archivo trae además de los datos de conexión (ya validado por Rust). */
export interface SessionExtras {
  index: number;
  ssh_args?: string | null;
  tunnels?: Tunnel[] | null;
  on_connect?: string | null;
  legacy_ssh?: boolean | null;
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
  mcpVisibility: "sesiones visibles para agentes",
  mcpMarked: "sesiones marcadas para agentes",
  mcpScopes: "datos que un agente puede leer",
  mcpAudit: "registro de auditoría de agentes",
  mcpWindowMin: "duración de la ventana de consultas",
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
  serverGuard: "acceso a los servidores integrados",
  sendLineDelay: "Pausa entre líneas",
  lifecycleInfo: "Ciclo de vida en la barra de estado",
  floatingSidebar: "Barra de sesiones superpuesta",
  catalogVendor: "Fabricante del catálogo",
  logTimestamps: "Marcas de tiempo en logs",
  logAppend: "Anexar a logs existentes",
  logRotateDaily: "Log nuevo cada día",
  autoMarkCommands: "Marcar comandos",
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
function cleanValue(k: string, v: unknown, current?: Settings): unknown {
  const d = (defaultSettings as unknown as Record<string, unknown>)[k];
  const policy = Object.hasOwn(SETTINGS_POLICY, k) ? SETTINGS_POLICY[k as keyof Settings] : undefined;
  if (d === undefined || !policy || policy.kind === "excluded" || (SETTINGS_EXCLUDED as readonly string[]).includes(k) || !sameType(v, d)) return undefined;
  if (policy.kind === "safeOnly" || k in SETTINGS_SAFE_ONLY) return v === SETTINGS_SAFE_ONLY[k] ? v : undefined;
  if (policy.kind === "onlyOff") {
    // Módulos: solo se aplican los que el archivo apaga; encender uno lo decide el usuario aquí.
    const offs = Object.entries(v as Record<string, unknown>).filter(([m, on]) => Object.hasOwn(defaultSettings.modules, m) && on === false);
    if (!offs.length) return undefined;
    return { ...(current?.modules ?? defaultSettings.modules), ...Object.fromEntries(offs) } as Record<ModuleId, boolean>;
  }
  if (policy.kind === "check" && !policy.ok(v)) return undefined;
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
    const val = cleanValue(k, v, current);
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

export function validMacros(list: unknown[] | null): Macro[] {
  return (list ?? [])
    .filter(
      (m): m is Macro =>
        isObj(m) &&
        typeof m.id === "string" &&
        !!m.id &&
        typeof m.label === "string" &&
        (m.kind === "send" || m.kind === "script") &&
        (m.text === undefined || typeof m.text === "string") &&
        (m.script === undefined || typeof m.script === "string"),
    )
    .map((m) => ({ id: m.id, label: m.label, kind: m.kind, ...(m.text !== undefined ? { text: m.text } : {}), ...(m.script !== undefined ? { script: m.script } : {}) }));
}

const STYLE_KEYS = ["color", "bg", "bold", "italic", "underline"] as const;

/**
 * Reglas de resaltado con forma válida y sin patrones peligrosos (mismo validador que al crearlas,
 * ver regexSafety.ts). Solo se conservan los campos conocidos.
 */
export function validRules(list: unknown[] | null): HlRule[] {
  const out: HlRule[] = [];
  for (const r of list ?? []) {
    if (!isObj(r) || typeof r.id !== "string" || typeof r.name !== "string" || typeof r.pattern !== "string" || !isObj(r.style)) continue;
    if (regexError(r.pattern) || riskyRegex(r.pattern, r.ignoreCase === true)) continue;
    const style = Object.fromEntries(STYLE_KEYS.filter((k) => r.style && (r.style as Record<string, unknown>)[k] !== undefined).map((k) => [k, (r.style as Record<string, unknown>)[k]]));
    out.push({
      id: r.id,
      name: r.name.slice(0, 120),
      pattern: r.pattern,
      style,
      ...(r.ignoreCase === true ? { ignoreCase: true } : {}),
      ...(Number.isInteger(r.group) && (r.group as number) > 0 && (r.group as number) <= 9 ? { group: r.group as number } : {}),
      ...(r.enabled === false ? { enabled: false } : {}),
    });
  }
  return out;
}

// ---------- Botones, reglas y packs del archivo: siempre se agregan, nunca reemplazan ----------

function randomTag(): string {
  const b = new Uint8Array(4);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

/** Id nuevo que no choca con ninguno existente (ni con los ya asignados en esta importación). */
function freshId(taken: Set<string>, prefix: string): string {
  let id: string;
  do id = `${prefix}${randomTag()}`;
  while (taken.has(id));
  taken.add(id);
  return id;
}

/** "Interfaces" que ya existe pasa a "Interfaces (importado)", "Interfaces (importado 2)", … */
function freshLabel(taken: Set<string>, label: string): string {
  let out = label;
  for (let i = 1; taken.has(out.toLowerCase()); i++) out = `${label} (importado${i > 1 ? ` ${i}` : ""})`;
  taken.add(out.toLowerCase());
  return out;
}

/**
 * Botones del archivo como botones nuevos: id nuevo siempre (los ids predecibles m1, m2 de un archivo
 * nunca pisan uno propio) y, si la etiqueta ya existe, con sufijo.
 */
export function planMacros(current: Macro[], incoming: Macro[]): Macro[] {
  const ids = new Set(current.map((m) => m.id));
  const labels = new Set(current.map((m) => m.label.toLowerCase()));
  return incoming.map((m) => ({ ...m, id: freshId(ids, "imp-"), label: freshLabel(labels, m.label) }));
}

/** Reglas de resaltado del archivo como reglas nuevas (mismo criterio que los botones). */
export function planRules(current: HlRule[], incoming: HlRule[]): HlRule[] {
  const ids = new Set(current.map((r) => r.id));
  const names = new Set(current.map((r) => r.name.toLowerCase()));
  return incoming.map((r) => ({ ...r, id: freshId(ids, "c"), name: freshLabel(names, r.name || r.pattern) }));
}

/**
 * Packs del archivo: un id que ya existe (pack propio o incluido) recibe un sufijo para no reemplazar
 * el pack local. `existing`: ids de los packs propios ya guardados.
 */
export function planPacks(existing: string[], incoming: Pack[]): Pack[] {
  const taken = new Set(existing);
  return incoming.map((p) => {
    let id = p.id;
    if (taken.has(id) || id.startsWith("builtin")) {
      const base = id.replace(/^builtin-?/, "").slice(0, 50) || "pack";
      for (let i = 1; taken.has((id = `${base}-imp${i > 1 ? i : ""}`)); i++);
    }
    taken.add(id);
    return id === p.id ? p : { ...p, id, name: `${p.name} (importado)` };
  });
}

/** Riesgo del texto de un botón: el de su línea más riesgosa; un botón de script se trata como cambio. */
export function macroRisk(m: Macro): Risk {
  if (m.kind === "script") return "change";
  return lineRisks(m.text ?? "").reduce<Risk>((a, l) => (RANK[l.risk] > RANK[a] ? l.risk : a), "read");
}

const RANK: Record<Risk, number> = { read: 0, change: 1, disruptive: 2 };

/** Cada línea no vacía de un texto que se envía al equipo, con su riesgo (computeRisk de packs.ts). */
export function lineRisks(text: string): { line: string; risk: Risk }[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 500)
    .map((line) => ({ line, risk: computeRisk(line) }));
}

/** Comandos de un pack con su riesgo efectivo: el mayor entre el declarado y el calculado (buildCatalog). */
export function packRisks(p: Pack): { cmd: string; risk: Risk; escalated: boolean }[] {
  return (buildCatalog([p], [])[0]?.commands ?? []).map((c) => ({ cmd: c.cmd, risk: c.risk, escalated: c.escalated }));
}

/** Los extras traen comandos al conectar que cambian configuración o pueden cortar servicio. */
export function extrasNeedConfirm(list: SessionExtras[] | undefined, selected: Set<number>): boolean {
  return (list ?? []).some((e) => selected.has(e.index) && lineRisks(e.on_connect ?? "").some((l) => l.risk !== "read"));
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
      const val = cleanValue(k, v, current);
      if (val === undefined) continue;
      const next = BY_ID.has(k) ? mergeById(cur[k] as { id: string }[], val as { id: string }[]) : val;
      if (!same(cur[k], next)) out[k] = next;
    }
  }
  if (choice.macros && p.macros) {
    const add = planMacros(current.macros, validMacros(p.macros));
    if (add.length) out.macros = [...current.macros, ...add];
  }
  if (choice.highlight && p.highlight) {
    const add = planRules(current.customRules, validRules(p.highlight));
    if (add.length) out.customRules = [...current.customRules, ...add];
  }
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
