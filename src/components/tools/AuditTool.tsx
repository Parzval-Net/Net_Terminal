import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import {
  ChevronRight,
  ClipboardCopy,
  Download,
  FileUp,
  Info,
  Play,
  RefreshCw,
  SquareTerminal,
  TriangleAlert,
} from "lucide-react";
import { Segmented } from "../controls";
import { Btn, CountBadge, Label, Metric, Step, Toggle, ToolHeader } from "./ui";
import type { TerminalRef } from "./FileManager";
import AuditLibrary, { type WaiverDraft } from "./AuditLibrary";
import { SeverityTag, StatusTag } from "./AuditTags";
import { runOnDeviceResult } from "../../lib/deviceRun";
import { backupLabel, prepareBackup } from "../../lib/backup";
import { openLab } from "../../lib/cliLab";
import { persist, stored } from "../../lib/prefs";
import { inOrder } from "../../lib/inOrder";
import { plural } from "../../lib/plural";
import type { Risk } from "../../lib/packs";
import { AUDIT_VENDORS, MAX_CONFIG_BYTES, VENDOR_LABEL, detectVendor, type AuditVendor } from "../../lib/auditParse";
import { ISO_TITLES, LAYER_LABEL, SEVERITY_LABEL, SEVERITY_WEIGHT, STATUS_LABEL, isIsoFramework, resolveRules, validateRulePack, type Layer, type ParamSpec, type RulePack, type Severity } from "../../lib/auditRules";
import { BUILTIN_RULE_PACKS } from "../../lib/auditBuiltin";
import { AUDIT_DISCLAIMER, RISK_LABEL, auditToCsv, auditToHtml, auditToJson, buildPlan, filterParams, fmtPct, paramValueError, type AuditResult, type Finding, type RiskLevel } from "../../lib/audit";
import { runAuditAsync } from "../../lib/auditAsync";
import {
  READ_COMMAND,
  USER_PACK_ID,
  defaultSelection,
  emptyUserPack,
  exportName,
  filterFindings,
  groupBySeverity,
  hostnameOf,
  loadStored,
  plannable,
  readCommandError,
  vendorOfSession,
  type LoadedPack,
  type StatusFilter,
  type StoredPack,
} from "../../lib/auditLib";

interface BackupFile {
  name: string;
  size: number;
}
interface DeviceBackups {
  device: string;
  files: BackupFile[];
}

type SourceKind = "backup" | "tab" | "text";
interface Loaded {
  text: string;
  /** Texto para el informe: "Respaldo core-sw01 21-10-2026 14:30", "Pestaña fw01 (show full-configuration)". */
  source: string;
  device: string;
}

const VIEW_KEY = "audit.view";
/** Parámetros de los filtros de las reglas por equipo: { "<equipo>": { wan_interfaces: "port1" } }. */
const FILTER_PARAMS_KEY = "audit.filterParams";
const AUDITRULES_LANE = "auditrules";
const USER_PACK_FILE = `user-${USER_PACK_ID}.json`;

/** Mis reglas y, si su archivo existe pero no se pudo cargar, el motivo (bloquea los guardados). */
function userPackOf(list: LoadedPack[]): { pack: RulePack; error: string | null } {
  const entry = list.find((p) => p.layer === "user" && (p.file === USER_PACK_FILE || p.pack?.id === USER_PACK_ID));
  if (entry?.pack && entry.pack.id === USER_PACK_ID) return { pack: entry.pack, error: null };
  if (entry)
    return {
      pack: emptyUserPack(),
      error: `El archivo de Mis reglas (${entry.file}) no se pudo cargar: ${entry.errors.join("; ") || "contenido inválido"}. No se guardan cambios para no reemplazarlo; corrígelo o elimínalo desde la carpeta de datos (audit-rules).`,
    };
  return { pack: emptyUserPack(), error: null };
}
const SOURCE_KEY = "audit.source";
/** Plazo para leer la configuración desde una pestaña (como Respaldos). */
const READ_TIMEOUT = 300;

const RISK_TONE: Record<RiskLevel, "danger" | "warn" | "ok"> = { critical: "danger", high: "danger", medium: "warn", low: "ok" };
const LINE_RISK: Record<Risk, { mark: string; cls: string; label: string }> = {
  read: { mark: "", cls: "text-muted", label: "consulta" },
  change: { mark: "▲", cls: "text-warn", label: "cambio" },
  disruptive: { mark: "✕", cls: "text-danger", label: "puede cortar servicio" },
};

function storedFilterVals(device: string): Record<string, string> {
  const v = stored<Record<string, Record<string, string>>>(FILTER_PARAMS_KEY, {})[device.trim()];
  return v && typeof v === "object" ? Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x === "string")) : {};
}

const isoChips = (f: Finding) => f.controls.filter((c) => isIsoFramework(c.framework)).map((c) => c.control);

/**
 * Auditoría de seguridad: revisa la configuración de un equipo contra reglas declarativas (packs
 * integrados, importados y del usuario), muestra puntaje, riesgo y hallazgos con evidencia
 * enmascarada, y arma un plan de corrección con rollback para revisar en CLI Lab. Todo es local
 * (sin red ni IA) y la herramienta nunca envía cambios al equipo: solo lee la configuración con un
 * comando de consulta validado por el motor de riesgo.
 */
export default function AuditTool({ terminals, onConfirm }: { terminals: TerminalRef[]; onConfirm: (req: { title: string; message: string; label: string; danger?: boolean; action: () => void }) => void }) {
  const [view, setViewState] = useState<"audit" | "library">(() => (stored<string>(VIEW_KEY, "audit") === "library" ? "library" : "audit"));
  const setView = (v: "audit" | "library") => {
    persist(VIEW_KEY, v);
    setViewState(v);
  };
  const [msg, setMsgState] = useState<{ text: string; error: boolean }>({ text: "", error: false });
  const setMsg = (text: string, error = false) => setMsgState({ text, error });
  const fail = (e: unknown) => setMsg(String(e instanceof Error ? e.message : e), true);

  // ---------- Packs de reglas ----------
  const [packs, setPacks] = useState<LoadedPack[]>([]);
  /** Último "Mis reglas" leído o guardado: cada cambio parte de aquí, no de un render anterior. */
  const userRef = useRef<{ pack: RulePack; error: string | null; loaded: boolean }>({ pack: emptyUserPack(), error: null, loaded: false });
  // Lee la lista sin pasar por la cola: solo se llama desde dentro de ella.
  const fetchPacks = useCallback(async () => {
    const list = loadStored((await invoke<StoredPack[]>("auditrules_list")) ?? []);
    userRef.current = { ...userPackOf(list), loaded: true };
    setPacks(list);
  }, []);
  const reload = useCallback(
    () => inOrder(AUDITRULES_LANE, fetchPacks).catch((e) => setMsgState({ text: `No se pudieron leer los packs guardados: ${e}`, error: true })),
    [fetchPacks],
  );
  useEffect(() => {
    reload();
  }, [reload]);
  const { pack: userPack, error: userPackError } = useMemo(() => userPackOf(packs), [packs]);
  const packInputs = useMemo(
    () => [
      ...BUILTIN_RULE_PACKS.map((pack) => ({ pack, layer: "builtin" as Layer })),
      ...packs.filter((p) => p.pack && p.layer === "imported").map((p) => ({ pack: p.pack!, layer: "imported" as Layer })),
      ...packs.filter((p) => p.pack && p.layer === "user" && p.pack.id !== USER_PACK_ID).map((p) => ({ pack: p.pack!, layer: "user" as Layer })),
      { pack: userPack, layer: "user" as Layer },
    ],
    [packs, userPack],
  );
  const resolved = useMemo(() => resolveRules(packInputs), [packInputs]);
  // Los guardados van de a uno y cada uno aplica su cambio sobre el último pack guardado: dos cambios
  // seguidos no se pisan. Si el archivo de Mis reglas existe pero no se pudo cargar, no se guarda nada
  // (se perderían sus reglas y excepciones al reemplazarlo por uno vacío).
  const saveUserPack = (update: (p: RulePack) => RulePack) =>
    inOrder(AUDITRULES_LANE, async () => {
      if (!userRef.current.loaded) await fetchPacks();
      const cur = userRef.current;
      if (cur.error) throw new Error(cur.error);
      const v = validateRulePack(update(cur.pack));
      if (!v.pack) throw new Error(v.errors.join("; "));
      await invoke("auditrules_save", { layer: "user", pack: v.pack });
      userRef.current = { pack: v.pack, error: null, loaded: true };
      await fetchPacks();
    });

  // ---------- Paso 1: fuente ----------
  const [kind, setKindState] = useState<SourceKind>(() => {
    const k = stored<string>(SOURCE_KEY, "backup");
    return k === "tab" || k === "text" ? k : "backup";
  });
  const setKind = (k: SourceKind) => {
    persist(SOURCE_KEY, k);
    setKindState(k);
  };
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [vendorChoice, setVendorChoice] = useState<"auto" | AuditVendor>("auto");
  const [busy, setBusy] = useState<string | null>(null);

  // Respaldos guardados.
  const [backups, setBackups] = useState<DeviceBackups[]>([]);
  const [bDevice, setBDevice] = useState("");
  const [bFile, setBFile] = useState("");
  const refreshBackups = useCallback(() => {
    invoke<DeviceBackups[]>("backup_list")
      .then((l) => setBackups(l ?? []))
      .catch((e) => setMsgState({ text: String(e), error: true }));
  }, []);
  useEffect(refreshBackups, [refreshBackups]);
  const bFiles = backups.find((d) => d.device === bDevice)?.files ?? [];
  // Cada lectura lleva un número: si el usuario cambia de respaldo antes de que termine, la respuesta vieja se descarta.
  const backupSeq = useRef(0);
  const loadBackup = async (device: string, file: string) => {
    const seq = ++backupSeq.current;
    if (!device || !file) return;
    setBusy("Leyendo respaldo…");
    try {
      const text = await invoke<string>("backup_read", { device, file });
      if (seq !== backupSeq.current) return;
      takeText({ text, source: `Respaldo ${device} ${backupLabel(file)}`, device });
    } catch (e) {
      if (seq === backupSeq.current) fail(e);
    } finally {
      if (seq === backupSeq.current) setBusy(null);
    }
  };

  // Pestaña conectada: una sesión abierta en varias pestañas se ofrece una vez.
  const tabs = useMemo(() => {
    const seen = new Set<string>();
    return terminals.filter((t) => (seen.has(t.session.id) ? false : (seen.add(t.session.id), true)));
  }, [terminals]);
  const [tabConn, setTabConn] = useState("");
  const tab = tabs.find((t) => t.connId === tabConn) ?? null;
  const [cmd, setCmd] = useState("");
  const tabVendor = tab ? vendorOfSession(tab.session) : null;
  const effCmd = cmd || READ_COMMAND[tabVendor ?? "cisco"];
  const cmdError = readCommandError(effCmd);
  const [alsoBackup, setAlsoBackup] = useState(true);
  const readTab = async () => {
    if (!tab || cmdError) return;
    setBusy(`Leyendo la configuración de ${tab.session.name}…`);
    setMsg("");
    try {
      // Con el resultado completo: una lectura cortada no se audita como si fuera la configuración.
      const { clean, problem } = prepareBackup(await runOnDeviceResult(tab.connId, effCmd, READ_TIMEOUT), effCmd);
      if (problem) return setMsg(problem, true);
      takeText({ text: clean, source: `Pestaña ${tab.session.name} (${effCmd})`, device: tab.session.name });
      if (alsoBackup) {
        const file = await invoke<string>("backup_save", { device: tab.session.name, content: clean, mask: true });
        setMsg(`Configuración leída y guardada en Respaldos (enmascarada): ${file}`);
        refreshBackups();
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  // Pegar o abrir archivo.
  const [pasted, setPasted] = useState("");
  const openFile = async () => {
    const path = await open({ multiple: false, directory: false, title: "Configuración para auditar", filters: [{ name: "Configuración", extensions: ["txt", "conf", "cfg", "log", "*"] }] }).catch(() => null);
    if (typeof path !== "string") return;
    setBusy("Leyendo archivo…");
    try {
      const text = await invoke<string>("audit_read_config", { path });
      const name = path.split(/[\\/]/).pop() ?? path;
      setPasted(text);
      takeText({ text, source: `Archivo ${name}`, device: hostnameOf(text) ?? name.replace(/\.[^.]+$/, "") });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  // ---------- Paso 2: resultado ----------
  const [result, setResult] = useState<AuditResult | null>(null);
  const [auditError, setAuditError] = useState("");
  const [device, setDevice] = useState("");
  /** Nueva configuración: se descarta el resultado anterior (no corresponde a este texto). */
  function takeText(l: Loaded) {
    setLoaded(l);
    const dev = hostnameOf(l.text) ?? l.device;
    setDevice(dev);
    setFilterVals(storedFilterVals(dev));
    setVendorChoice("auto");
    setResult(null);
    setAuditError("");
  }
  const detection = useMemo(() => (loaded ? detectVendor(loaded.text) : null), [loaded]);
  const vendor = vendorChoice === "auto" ? (detection?.vendor ?? null) : vendorChoice;

  // Parámetros de los filtros (interfaces WAN o externas): cambian qué bloques se evalúan, así que se
  // piden antes de auditar y se recuerdan por equipo. Solo los valores válidos llegan al motor.
  const [filterVals, setFilterVals] = useState<Record<string, string>>({});
  const filterSpecs = useMemo(() => (vendor ? filterParams(resolved, vendor) : []), [resolved, vendor]);
  const filterErrors = useMemo(() => {
    const out: Record<string, string> = {};
    for (const f of filterSpecs) {
      const v = (filterVals[f.name] ?? "").trim();
      const bad = v && vendor ? paramValueError(f.spec, v, vendor) : null;
      if (bad) out[f.name] = bad;
    }
    return out;
  }, [filterSpecs, filterVals, vendor]);
  const auditParams = useMemo(() => {
    const out: Record<string, string> = {};
    for (const f of filterSpecs) {
      const v = (filterVals[f.name] ?? "").trim();
      if (v && !filterErrors[f.name]) out[f.name] = v;
    }
    return out;
  }, [filterSpecs, filterVals, filterErrors]);
  const setFilterVal = (name: string, value: string) => {
    const next = { ...filterVals, [name]: value };
    setFilterVals(next);
    const key = device.trim();
    if (!key) return;
    const all = stored<Record<string, Record<string, string>>>(FILTER_PARAMS_KEY, {});
    const kept = Object.fromEntries(Object.entries(next).filter(([, v]) => v.trim()));
    if (Object.keys(kept).length) all[key] = kept;
    else delete all[key];
    persist(FILTER_PARAMS_KEY, all);
  };

  // La auditoría corre en un Web Worker (lib/auditAsync): la interfaz sigue respondiendo con
  // configuraciones grandes. Solo se aplica el resultado de la última pedida.
  const auditSeq = useRef(0);
  const audit = useCallback(
    async (l: Loaded, v: "auto" | AuditVendor, dev: string, quiet = false): Promise<AuditResult | null> => {
      const seq = ++auditSeq.current;
      try {
        const r = await runAuditAsync({ text: l.text, vendor: v === "auto" ? undefined : v, device: dev.trim() || undefined, source: l.source }, resolved, { params: auditParams });
        if (seq !== auditSeq.current) return null;
        setResult(r);
        setAuditError("");
        if (!quiet) setMsg("");
        return r;
      } catch (e) {
        if (seq !== auditSeq.current) return null;
        setResult(null);
        setAuditError(String(e instanceof Error ? e.message : e));
        return null;
      }
    },
    [resolved, auditParams],
  );
  const [running, setRunning] = useState(false);
  const runNow = async () => {
    if (!loaded) return;
    setRunning(true);
    const r = await audit(loaded, vendorChoice, device);
    setRunning(false);
    if (r) {
      setSelection(new Set(defaultSelection(r)));
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
    }
  };
  // La biblioteca o los parámetros de los filtros cambiaron: se vuelve a auditar el mismo texto.
  const lastAudit = useRef(audit);
  useEffect(() => {
    if (lastAudit.current === audit) return;
    lastAudit.current = audit;
    if (loaded && result) {
      void audit(loaded, vendorChoice, device, true).then((r) => {
        if (r) setSelection((s) => new Set([...s].filter((id) => plannable(r).some((f) => f.ruleId === id))));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audit]);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("attention");
  const [sevFilter, setSevFilter] = useState<Severity | "all">("all");
  const [query, setQuery] = useState("");
  const [openRules, setOpenRules] = useState<Set<string>>(new Set());
  const shown = useMemo(() => (result ? filterFindings(result.findings, { status: statusFilter, severity: sevFilter, query }) : []), [result, statusFilter, sevFilter, query]);
  const groups = useMemo(() => groupBySeverity(shown), [shown]);
  const resultRef = useRef<HTMLDivElement>(null);

  // ---------- Paso 3: plan ----------
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [params, setParams] = useState<Record<string, string>>({});
  const specOf = useCallback(
    (name: string, rules: string[]): ParamSpec | undefined => {
      for (const id of rules) {
        const spec = resolved.rules.find((r) => r.rule.id === id)?.rule.params?.[name];
        if (spec) return spec;
      }
      return undefined;
    },
    [resolved],
  );
  const planCandidates = useMemo(() => (result ? plannable(result).sort((a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity] || a.ruleId.localeCompare(b.ruleId)) : []), [result]);
  const chosen = planCandidates.filter((f) => selection.has(f.ruleId)).map((f) => f.ruleId);
  // Solo los valores válidos llegan al plan; los demás quedan como {{x}} para CLI Lab y se marcan en el campo.
  const plan = useMemo(() => {
    if (!result || !chosen.length) return null;
    const ok: Record<string, string> = {};
    for (const [k, v] of Object.entries(params)) {
      if (!v.trim()) continue;
      const rules = resolved.rules.filter((r) => r.rule.params?.[k]).map((r) => r.rule.id);
      if (!paramValueError(specOf(k, rules), v.trim(), result.vendor)) ok[k] = v.trim();
    }
    return buildPlan(result, resolved, chosen, { params: ok });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, resolved, chosen.join("|"), params, specOf]);

  // ---------- Exportaciones ----------
  const saveAs = async (content: string, name: string, ext: string, label: string) => {
    try {
      const dest = await save({ defaultPath: name, filters: [{ name: label, extensions: [ext] }] });
      if (!dest) return;
      await invoke("save_text", { dest, content });
      setMsg(`Guardado: ${dest}`);
    } catch (e) {
      fail(e);
    }
  };
  const exportReport = (fmt: "html" | "csv" | "json") => {
    if (!result) return;
    const content = fmt === "html" ? auditToHtml(result, plan ?? undefined) : fmt === "csv" ? auditToCsv(result) : auditToJson(result);
    void saveAs(content, exportName(result.device, fmt), fmt, fmt === "html" ? "Informe HTML" : fmt === "csv" ? "CSV" : "JSON");
  };

  // ---------- Excepción desde un hallazgo ----------
  const [waiverDraft, setWaiverDraft] = useState<WaiverDraft | null>(null);
  // La excepción se ata a la etiqueta completa del bloque (con su VDOM y su ruta), nunca queda vacía por
  // falta de " › " (Cisco): una excepción sin bloque cubriría toda la regla.
  const askWaiver = (ruleId: string, unitLabel?: string) => {
    const match = unitLabel && !unitLabel.startsWith("(") && unitLabel !== "Configuración global" ? unitLabel.replace(/\s+\(\+\d+\)$/, "") : "";
    setWaiverDraft({ rule: ruleId, match, n: Date.now() });
    setView("library");
  };

  const hintId = useId();
  const loadedLines = loaded ? loaded.text.split("\n").length : 0;
  const tooBig = !!loaded && loaded.text.length > MAX_CONFIG_BYTES;

  return (
    <div className="space-y-4">
      <ToolHeader
        title="Auditoría de seguridad"
        description="Revisa la configuración de Cisco IOS/IOS-XE y FortiOS contra reglas de hardening editables y arma un plan de corrección con rollback. Todo se procesa en este equipo, sin red ni IA, y nada se envía al equipo por sí solo."
        actions={
          <Segmented
            label="Vista de Auditoría"
            value={view}
            onChange={setView}
            options={[
              ["audit", "Auditar"],
              ["library", `Biblioteca de reglas (${resolved.rules.length})`],
            ]}
          />
        }
      />
      <div role="status" className={msg.text ? "" : "!mt-0"}>
        {msg.text && <p className={`text-body-sm ${msg.error ? "text-danger" : "text-muted"}`}>{msg.text}</p>}
      </div>

      {view === "library" ? (
        <AuditLibrary
          packs={packs}
          packInputs={packInputs}
          resolved={resolved}
          userPack={userPack}
          onSaveUserPack={saveUserPack}
          userPackError={userPackError}
          onReload={reload}
          sample={loaded && vendor ? { text: loaded.text, vendor, platform: vendorChoice === "auto" ? detection?.platform : undefined, source: loaded.source } : null}
          waiverDraft={waiverDraft}
          onMsg={setMsg}
          onConfirm={onConfirm}
        />
      ) : (
        <ol aria-label="Auditar una configuración en 3 pasos" className="space-y-4">
          {/* ---------- Paso 1 ---------- */}
          <Step n={1} title="Fuente" hint={loaded ? `${loaded.source} · ${plural(loadedLines, "línea", "líneas")}` : "Elige de dónde sale la configuración"} done={!!loaded}>
            <Segmented
              label="Fuente de la configuración"
              value={kind}
              onChange={setKind}
              options={[
                ["backup", "Respaldo guardado"],
                ["tab", "Pestaña conectada"],
                ["text", "Pegar o abrir archivo"],
              ]}
            />
            <div className="mt-3">
              {kind === "backup" &&
                (backups.length === 0 ? (
                  <p className="text-body-sm text-muted">
                    Aún no hay respaldos. Guárdalos en Herramientas › Respaldos (quedan enmascarados) o usa una pestaña conectada para leer la configuración ahora.
                  </p>
                ) : (
                  <div className="flex flex-wrap items-end gap-2">
                    <Label text="Equipo" className="w-56">
                      <select
                        className="field"
                        value={bDevice}
                        onChange={(e) => {
                          setBDevice(e.target.value);
                          const f = backups.find((d) => d.device === e.target.value)?.files[0]?.name ?? "";
                          setBFile(f);
                          void loadBackup(e.target.value, f);
                        }}
                      >
                        <option value="">Elegir equipo…</option>
                        {backups.map((d) => (
                          <option key={d.device} value={d.device}>
                            {d.device} ({d.files.length})
                          </option>
                        ))}
                      </select>
                    </Label>
                    <Label text="Fecha del respaldo" className="w-64">
                      <select
                        className="field"
                        value={bFile}
                        disabled={!bDevice}
                        onChange={(e) => {
                          setBFile(e.target.value);
                          void loadBackup(bDevice, e.target.value);
                        }}
                      >
                        {!bDevice && <option value="">Elige primero el equipo</option>}
                        {bFiles.map((f, i) => (
                          <option key={f.name} value={f.name}>
                            {backupLabel(f.name)}
                            {i === 0 ? " (más reciente)" : ""}
                          </option>
                        ))}
                      </select>
                    </Label>
                    <Btn kind="ghost" onClick={refreshBackups} title="Actualizar la lista de respaldos" aria-label="Actualizar la lista de respaldos">
                      <RefreshCw size={14} aria-hidden />
                    </Btn>
                  </div>
                ))}

              {kind === "tab" &&
                (tabs.length === 0 ? (
                  <p className="text-body-sm text-muted">Conecta la sesión del equipo desde el árbol. La configuración se lee con un comando de consulta; nada se cambia en el equipo.</p>
                ) : (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-end gap-2">
                      <Label text="Pestaña" className="w-56">
                        <select
                          className="field"
                          value={tabConn}
                          onChange={(e) => {
                            setTabConn(e.target.value);
                            setCmd("");
                          }}
                        >
                          <option value="">Elegir pestaña…</option>
                          {tabs.map((t) => (
                            <option key={t.connId} value={t.connId}>
                              {t.session.name}
                              {t.host ? ` (${t.host})` : ""}
                            </option>
                          ))}
                        </select>
                      </Label>
                      <Label text="Comando de lectura" className="flex-1 min-w-[16rem]">
                        <input
                          className="field font-mono"
                          value={effCmd}
                          onChange={(e) => setCmd(e.target.value)}
                          spellCheck={false}
                          aria-invalid={!!cmdError}
                          aria-describedby={hintId}
                        />
                      </Label>
                      <Btn kind="primary" disabled={!tab || !!cmdError || !!busy} onClick={readTab}>
                        <Play size={13} aria-hidden /> Leer configuración
                      </Btn>
                    </div>
                    <p id={hintId} className={`text-caption ${cmdError ? "text-danger font-medium" : "text-muted"}`}>
                      {cmdError ??
                        (tabVendor === "fortinet"
                          ? "FortiOS: show full-configuration incluye los valores por defecto y evita falsos positivos por líneas que show omite."
                          : "Solo se aceptan comandos que el motor de riesgo clasifica como consulta.")}
                    </p>
                    <Toggle checked={alsoBackup} onChange={setAlsoBackup} label="Guardar también como respaldo (enmascarado)" />
                  </div>
                ))}

              {kind === "text" && (
                <div className="space-y-2">
                  <textarea
                    className="field !h-40 py-2 font-mono text-body-sm leading-snug resize-y"
                    value={pasted}
                    onChange={(e) => setPasted(e.target.value)}
                    spellCheck={false}
                    aria-label="Configuración pegada"
                    placeholder={"Pega aquí la salida de show running-config (Cisco) o show full-configuration (FortiOS)"}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Btn onClick={openFile} disabled={!!busy}>
                      <FileUp size={14} aria-hidden /> Abrir archivo…
                    </Btn>
                    <Btn
                      kind={loaded?.text === pasted ? "default" : "primary"}
                      disabled={!pasted.trim() || loaded?.text === pasted}
                      onClick={() => takeText({ text: pasted, source: "Texto pegado", device: "" })}
                    >
                      Usar este texto
                    </Btn>
                    <span className="text-caption text-muted">Se procesa solo en este equipo. Evita compartir configuraciones con secretos sin enmascarar.</span>
                  </div>
                </div>
              )}
            </div>
            {busy && (
              <p className="mt-2 text-body-sm text-muted" aria-live="polite">
                {busy}
              </p>
            )}

            {loaded && (
              <div className="mt-3 pt-3 border-t border-line flex flex-wrap items-end gap-x-3 gap-y-2">
                <Label text="Fabricante" className="w-60">
                  <select className="field" value={vendorChoice} onChange={(e) => setVendorChoice(e.target.value as "auto" | AuditVendor)}>
                    <option value="auto">{detection?.vendor ? `Detectado: ${VENDOR_LABEL[detection.vendor]}${detection.version ? ` ${detection.version}` : ""}` : "Sin detectar: elige uno"}</option>
                    {AUDIT_VENDORS.map((v) => (
                      <option key={v} value={v}>
                        {VENDOR_LABEL[v]}
                      </option>
                    ))}
                  </select>
                </Label>
                <Label text="Equipo (para el informe)" className="w-52">
                  <input className="field" value={device} onChange={(e) => setDevice(e.target.value)} placeholder="Nombre del equipo" />
                </Label>
                {filterSpecs.map((f) => (
                  <Label key={f.name} text={f.spec.prompt} className="w-72">
                    <input
                      className="field font-mono"
                      value={filterVals[f.name] ?? ""}
                      onChange={(e) => setFilterVal(f.name, e.target.value)}
                      placeholder={f.spec.example ? `Ej.: ${f.spec.example}` : "Opcional"}
                      spellCheck={false}
                      aria-invalid={!!filterErrors[f.name]}
                      aria-describedby={`${hintId}-f`}
                      title={`Lo usan ${f.rules.join(", ")}`}
                    />
                  </Label>
                ))}
                <span className="flex-1" />
                <Btn kind="primary" disabled={!vendor || running || tooBig} onClick={runNow}>
                  <Play size={13} aria-hidden /> {running ? "Auditando…" : result ? "Volver a auditar" : "Auditar"}
                </Btn>
                {filterSpecs.length > 0 && (
                  <p id={`${hintId}-f`} className={`basis-full text-caption ${Object.keys(filterErrors).length ? "text-danger font-medium" : "text-muted"}`}>
                    {Object.keys(filterErrors).length
                      ? Object.entries(filterErrors)
                          .map(([k, e]) => `${filterSpecs.find((f) => f.name === k)?.spec.prompt ?? k}: ${e}`)
                          .join(" · ")
                      : `Datos que usan los filtros de ${filterSpecs.flatMap((f) => f.rules).join(", ")}: por ejemplo, interfaces WAN o externas que no lo indican en su rol ni en su descripción. Sin ellos esas interfaces no se revisan.${device.trim() ? " Se recuerdan para este equipo." : ""}`}
                  </p>
                )}
                <p className="basis-full text-caption text-muted">
                  {detection?.reason}
                  {vendor && !resolved.rules.some((r) => r.rule.vendor === vendor) ? ` · No hay reglas activas para ${VENDOR_LABEL[vendor]}: los packs integrados cubren Cisco IOS/IOS-XE y FortiOS.` : ""}
                </p>
                {auditError && (
                  <p role="alert" className="basis-full text-body-sm text-danger font-medium">
                    {auditError}
                  </p>
                )}
              </div>
            )}
          </Step>

          {/* ---------- Paso 2 ---------- */}
          <Step
            n={2}
            title="Resultado"
            hint={result ? `${VENDOR_LABEL[result.vendor]}${result.platform ? ` (${result.platform})` : ""} · ${plural(result.findings.length, "regla", "reglas")} · ${new Date(result.generatedAt).toLocaleString("es-CL")}` : "Puntaje, riesgo y hallazgos con evidencia"}
            done={!!result}
            right={
              result && (
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-caption text-muted mr-1">Exportar</span>
                  <Btn onClick={() => exportReport("html")} title="Informe HTML autocontenido (incluye el plan si hay uno)">
                    <Download size={13} aria-hidden /> HTML
                  </Btn>
                  <Btn onClick={() => exportReport("csv")} title="Una fila por bloque evaluado">
                    CSV
                  </Btn>
                  <Btn onClick={() => exportReport("json")} title="Resultado completo con hash del input y versión de los packs">
                    JSON
                  </Btn>
                </div>
              )
            }
          >
            <div ref={resultRef} className="scroll-mt-4" />
            {!result ? (
              <p className="text-body-sm text-muted">Carga una configuración en el paso 1 y pulsa Auditar. El resultado muestra el puntaje ponderado, el nivel de riesgo, la cobertura y cada hallazgo con su evidencia (secretos enmascarados).</p>
            ) : (
              <ResultView
                result={result}
                groups={groups}
                total={shown.length}
                statusFilter={statusFilter}
                onStatus={setStatusFilter}
                sevFilter={sevFilter}
                onSev={setSevFilter}
                query={query}
                onQuery={setQuery}
                open={openRules}
                onToggle={(id) =>
                  setOpenRules((s) => {
                    const n = new Set(s);
                    if (n.has(id)) n.delete(id);
                    else n.add(id);
                    return n;
                  })
                }
                onWaiver={askWaiver}
              />
            )}
          </Step>

          {/* ---------- Paso 3 ---------- */}
          <Step n={3} title="Plan de corrección" hint="Elige qué corregir; el plan se revisa y se ejecuta en CLI Lab, con su confirmación" done={!!plan && plan.lines.some((l) => !l.comment)}>
            {!result ? (
              <p className="text-body-sm text-muted">Primero audita una configuración.</p>
            ) : planCandidates.length === 0 ? (
              <p className="text-body-sm text-muted">No hay hallazgos que corregir: todo cumple, no aplica o tiene excepción vigente.</p>
            ) : (
              <PlanView
                result={result}
                candidates={planCandidates}
                selection={selection}
                onSelection={setSelection}
                params={params}
                onParam={(k, v) => setParams((p) => ({ ...p, [k]: v }))}
                specOf={specOf}
                plan={plan}
                onCopy={(t, what) =>
                  writeText(t)
                    .then(() => setMsg(`${what} copiado al portapapeles`))
                    .catch(fail)
                }
                onSave={(t, ext, rollback) => saveAs(t, exportName(result.device, ext).replace(/^auditoria-/, rollback ? "rollback-" : "plan-"), ext, "Texto")}
                onLab={(t) => {
                  openLab(t);
                  setMsg("Plan abierto en CLI Lab: revisa las líneas, completa las variables y elige el destino. CLI Lab confirma equipos y riesgo antes de enviar.");
                }}
              />
            )}
          </Step>
        </ol>
      )}
    </div>
  );
}

// ---------- Resultado ----------

function ScoreRing({ percent, tone }: { percent: number | null; tone: "danger" | "warn" | "ok" }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const p = percent ?? 0;
  const color = tone === "danger" ? "var(--danger)" : tone === "warn" ? "var(--warn)" : "var(--ok)";
  return (
    <svg width="68" height="68" viewBox="0 0 68 68" aria-hidden className="shrink-0">
      <circle cx="34" cy="34" r={r} fill="none" stroke="var(--border)" strokeWidth="7" />
      {percent !== null && (
        <circle cx="34" cy="34" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${(c * p) / 100} ${c}`} transform="rotate(-90 34 34)" />
      )}
      <text x="34" y="38" textAnchor="middle" fontSize="13" fontWeight="600" fill="var(--text)">
        {percent === null ? "s/d" : `${Math.round(p)}%`}
      </text>
    </svg>
  );
}

const STATUS_OPTIONS: readonly (readonly [StatusFilter, string])[] = [
  ["attention", "Por atender"],
  ["fail", "No cumple"],
  ["review", "Revisar"],
  ["waived", "Excepción"],
  ["pass", "Cumple"],
  ["all", "Todos"],
];

function ResultView({
  result,
  groups,
  total,
  statusFilter,
  onStatus,
  sevFilter,
  onSev,
  query,
  onQuery,
  open,
  onToggle,
  onWaiver,
}: {
  result: AuditResult;
  groups: [Severity, Finding[]][];
  total: number;
  statusFilter: StatusFilter;
  onStatus: (s: StatusFilter) => void;
  sevFilter: Severity | "all";
  onSev: (s: Severity | "all") => void;
  query: string;
  onQuery: (q: string) => void;
  open: Set<string>;
  onToggle: (id: string) => void;
  onWaiver: (ruleId: string, unitLabel?: string) => void;
}) {
  const c = result.counts;
  const tone = RISK_TONE[result.risk.level];
  const expired = result.findings.filter((f) => f.expiredWaivers.length).length;
  return (
    <div className="space-y-4">
      {/* Resumen: puntaje, riesgo y conteos. El anillo es decorativo: el valor va también en texto. */}
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <div className="flex items-center gap-3 min-w-[15rem] flex-1">
          <ScoreRing percent={result.score.percent} tone={result.score.percent === null ? "warn" : result.score.percent >= 85 ? "ok" : result.score.percent >= result.risk.threshold ? "warn" : "danger"} />
          <div className="min-w-0">
            <Metric label="Puntaje ponderado" value={result.score.percent === null ? "Sin datos" : fmtPct(result.score.percent)} />
            <p className="text-caption text-muted">{result.score.base}</p>
          </div>
        </div>
        <div className="min-w-[12rem] flex-1">
          <Metric label="Riesgo agregado" value={RISK_LABEL[result.risk.level]} tone={tone} />
          <ul className="text-caption text-muted list-disc pl-4">
            {result.risk.reasons.slice(0, 3).map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
        <div className="grid grid-cols-3 @[44rem]:grid-cols-5 gap-x-4 gap-y-2 flex-[2_1_20rem]">
          <Metric label="No cumplen" value={String(c.fail)} tone={c.fail ? "danger" : undefined} />
          <Metric label="Por revisar" value={String(c.review)} tone={c.review ? "warn" : undefined} />
          <Metric label="Cumplen" value={String(c.pass)} tone={c.pass ? "ok" : undefined} />
          <Metric label="Con excepción" value={String(c.waived)} />
          <Metric label="No aplican" value={String(c["n/a"])} />
        </div>
      </div>

      {/* Cobertura declarada y alcance honesto del puntaje. */}
      <div className="rounded-lg bg-hover px-3 py-2 text-body-sm flex gap-2">
        <Info size={14} aria-hidden className="mt-0.5 shrink-0 text-muted" />
        <div className="min-w-0 space-y-1">
          <p>
            <span className="font-medium">Cobertura declarada:</span> {result.coverage.text}.
          </p>
          {result.coverage.iso.length > 0 && (
            <p className="text-muted">
              Controles tocados: {result.coverage.iso.map((c) => (ISO_TITLES[c] ? `${c} ${ISO_TITLES[c]}` : c)).join(", ")}.
            </p>
          )}
          <p className="text-muted">
            {AUDIT_DISCLAIMER} Pesos: crítica 10, alta 5, media 3, baja 1, informativa 0; "revisar", "no aplica" y "excepción" quedan fuera del puntaje.
          </p>
          {result.notes.length > 0 && <p className="text-warn">Notas de los packs: {result.notes.join("; ")}</p>}
          {expired > 0 && <p className="text-warn">{plural(expired, "regla tiene", "reglas tienen")} excepciones vencidas que ya no aplican.</p>}
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <Segmented label="Estado de los hallazgos" size="sm" value={statusFilter} onChange={onStatus} options={STATUS_OPTIONS} />
        <select className="field !h-7 !w-40 !text-body-sm" value={sevFilter} onChange={(e) => onSev(e.target.value as Severity | "all")} aria-label="Severidad">
          <option value="all">Toda severidad</option>
          {(["critical", "high", "medium", "low", "info"] as Severity[]).map((s) => (
            <option key={s} value={s}>
              {SEVERITY_LABEL[s]}
            </option>
          ))}
        </select>
        <input className="field !h-7 !w-56 !text-body-sm" type="search" value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Buscar regla, control o bloque" aria-label="Buscar en los hallazgos" />
        <span className="text-caption text-muted" aria-live="polite">
          {plural(total, "hallazgo", "hallazgos")}
        </span>
      </div>

      {groups.length === 0 ? (
        <p className="text-body-sm text-muted">
          {statusFilter === "attention" ? "Nada por atender con estos filtros: no hay incumplimientos ni hallazgos por revisar." : "Ningún hallazgo coincide con los filtros."}
        </p>
      ) : (
        <div className="space-y-3">
          {groups.map(([sev, list]) => (
            <section key={sev} aria-label={`Severidad ${SEVERITY_LABEL[sev]}`}>
              <h4 className="flex items-center gap-2 mb-1 text-caption font-semibold uppercase tracking-wide text-muted">
                <SeverityTag severity={sev} /> <CountBadge n={list.length} tone="neutral" />
                <span className="font-normal normal-case tracking-normal">peso {SEVERITY_WEIGHT[sev]}</span>
              </h4>
              <ul className="rounded-lg border border-line divide-y divide-[var(--border)]">
                {list.map((f) => (
                  <FindingRow key={f.ruleId} f={f} open={open.has(f.ruleId)} onToggle={() => onToggle(f.ruleId)} onWaiver={onWaiver} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function FindingRow({ f, open, onToggle, onWaiver }: { f: Finding; open: boolean; onToggle: () => void; onWaiver: (ruleId: string, unitLabel?: string) => void }) {
  const bodyId = useId();
  const iso = isoChips(f);
  const units = f.units.filter((u) => u.status !== "pass" || f.units.length === 1);
  return (
    <li>
      <button type="button" aria-expanded={open} aria-controls={bodyId} onClick={onToggle} className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-hover">
        <ChevronRight size={14} aria-hidden className={`mt-0.5 shrink-0 text-muted transition-transform ${open ? "rotate-90" : ""}`} />
        <span className="flex-1 min-w-0">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <StatusTag status={f.status} />
            <span className="font-medium">{f.title}</span>
            <code className="text-caption text-muted">{f.ruleId}</code>
          </span>
          <span className="block text-body-sm text-muted">
            {f.reason}
            {iso.length ? ` · ISO ${iso.join(", ")}` : ""}
            {f.layer !== "builtin" ? ` · ${LAYER_LABEL[f.layer]}` : ""}
            {f.expiredWaivers.length ? " · excepción vencida" : ""}
          </span>
        </span>
      </button>
      <div id={bodyId} hidden={!open} className="px-3 pb-3 pl-9 space-y-2 text-body-sm">
        {f.description && <p>{f.description}</p>}
        {f.notes && <p className="text-muted">{f.notes}</p>}
        <p className="text-caption text-muted">
          Controles: {f.controls.map((c) => `${c.framework} ${c.control}${isIsoFramework(c.framework) && ISO_TITLES[c.control] ? ` (${ISO_TITLES[c.control]})` : ""}`).join("; ") || "sin mapeo"}
          {f.refs.length ? ` · Referencias: ${f.refs.join(", ")}` : ""} · Capa: {LAYER_LABEL[f.layer]} ({f.packId} {f.packVersion}) · Corrección: {f.fix === "auto" ? "automática" : f.fix === "guided" ? "guiada (revisar valores)" : "manual"}
        </p>
        {f.changes.length > 0 && <p className="text-caption text-muted">Cambios de capa: {f.changes.join("; ")}</p>}
        {f.expiredWaivers.length > 0 && (
          <p className="text-caption text-warn flex items-center gap-1">
            <TriangleAlert size={12} aria-hidden /> Excepción vencida: {f.expiredWaivers.map((w) => `${w.reason} (aprobó ${w.approvedBy}, venció ${w.expires})`).join("; ")}
          </p>
        )}
        {units.map((u, i) => (
          <div key={i} className="rounded-md border border-line">
            <div className="flex flex-wrap items-center gap-2 px-2 py-1 border-b border-line bg-chrome rounded-t-md">
              <StatusTag status={u.status} />
              <span className="font-medium min-w-0 [overflow-wrap:anywhere]">{u.label}</span>
              {u.lineNo > 0 && <span className="text-caption text-muted">línea {u.lineNo}</span>}
              <span className="flex-1" />
              {(u.status === "fail" || u.status === "review") && (
                <button type="button" onClick={() => onWaiver(f.ruleId, u.label)} aria-label={`Crear excepción de ${f.ruleId} para ${u.label}`} className="text-caption text-accent hover:underline px-1 h-6">
                  Crear excepción…
                </button>
              )}
            </div>
            {u.note && <p className="px-2 pt-1 text-caption text-muted">{u.note}</p>}
            {u.waiver && (
              <p className="px-2 pt-1 text-caption text-accent">
                Excepción: {u.waiver.reason} (aprobó {u.waiver.approvedBy}, vence {u.waiver.expires}
                {u.waiver.ticket ? `, ${u.waiver.ticket}` : ""})
              </p>
            )}
            {u.evidence.length > 0 ? (
              <pre className="px-2 py-1.5 font-mono text-caption leading-relaxed overflow-x-auto whitespace-pre-wrap [overflow-wrap:anywhere] select-text">
                {u.evidence.map((e, j) => (
                  <span key={j} className="block">
                    <span className="text-muted tabular-nums select-none">{e.lineNo ? String(e.lineNo).padStart(5) : "     "}  </span>
                    {e.text}
                    {e.note ? <span className="text-muted">  « {e.note}</span> : null}
                  </span>
                ))}
              </pre>
            ) : (
              <p className="px-2 py-1.5 text-caption text-muted">Sin líneas de evidencia (la configuración no tiene la línea buscada).</p>
            )}
          </div>
        ))}
      </div>
    </li>
  );
}

// ---------- Plan ----------

function PlanView({
  result,
  candidates,
  selection,
  onSelection,
  params,
  onParam,
  specOf,
  plan,
  onCopy,
  onSave,
  onLab,
}: {
  result: AuditResult;
  candidates: Finding[];
  selection: Set<string>;
  onSelection: (s: Set<string>) => void;
  params: Record<string, string>;
  onParam: (k: string, v: string) => void;
  specOf: (name: string, rules: string[]) => ParamSpec | undefined;
  plan: ReturnType<typeof buildPlan> | null;
  onCopy: (text: string, what: string) => void;
  onSave: (text: string, ext: string, rollback: boolean) => void;
  onLab: (text: string) => void;
}) {
  const [showRollback, setShowRollback] = useState(false);
  const toggle = (id: string, on: boolean) => {
    const n = new Set(selection);
    if (on) n.add(id);
    else n.delete(id);
    onSelection(n);
  };
  const auto = defaultSelection(result);
  const pending = plan?.params.filter((p) => p.state === "pending") ?? [];
  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center gap-2 mb-1.5">
          <span className="text-body-sm font-medium">
            Qué corregir ({selection.size} de {candidates.length})
          </span>
          <span className="flex-1" />
          <Btn kind="ghost" className="!h-7" onClick={() => onSelection(new Set(auto))} disabled={!auto.length} title="No cumplen y tienen corrección automática">
            Solo automáticas ({auto.length})
          </Btn>
          <Btn kind="ghost" className="!h-7" onClick={() => onSelection(new Set(candidates.map((f) => f.ruleId)))}>
            Todas
          </Btn>
          <Btn kind="ghost" className="!h-7" onClick={() => onSelection(new Set())} disabled={!selection.size}>
            Ninguna
          </Btn>
        </div>
        <ul className="rounded-lg border border-line divide-y divide-[var(--border)] max-h-72 overflow-y-auto">
          {candidates.map((f) => {
            const bad = f.units.filter((u) => u.status === "fail" || u.status === "review").length;
            return (
              <li key={f.ruleId}>
                <label className="flex items-start gap-2.5 px-3 py-1.5 text-body-sm hover:bg-hover">
                  <input type="checkbox" className="mt-0.5 w-4 h-4 accent-[var(--accent)]" checked={selection.has(f.ruleId)} onChange={(e) => toggle(f.ruleId, e.target.checked)} />
                  <span className="flex-1 min-w-0">
                    <span className="flex flex-wrap items-center gap-x-2">
                      <SeverityTag severity={f.severity} />
                      <span className="font-medium">{f.title}</span>
                      <code className="text-caption text-muted">{f.ruleId}</code>
                    </span>
                    <span className="block text-caption text-muted">
                      {STATUS_LABEL[f.status]}
                      {bad > 1 ? ` en ${bad} bloques` : ""} · corrección {f.fix === "auto" ? "automática" : f.fix === "guided" ? "guiada (revisar valores)" : "manual (queda como comentario)"}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>

      {plan && plan.params.length > 0 && (
        <div>
          <h4 className="text-body-sm font-medium mb-1">Parámetros</h4>
          <p className="text-caption text-muted mb-2">Lo que quede vacío va como variable {"{{x}}"} y CLI Lab lo pide antes de ejecutar. Los secretos nunca se escriben en el plan: CLI Lab los pide en un campo oculto.</p>
          <div className="grid grid-cols-1 @[40rem]:grid-cols-2 gap-x-4 gap-y-2">
            {plan.params.map((p) => {
              if (p.secret)
                return (
                  <div key={p.name} className="text-body-sm">
                    <span className="block mb-1 font-medium text-muted">{p.prompt}</span>
                    <span className="text-caption text-muted">
                      Secreto: queda como <code>{`{{${p.name}}}`}</code> y CLI Lab lo pide oculto.
                    </span>
                  </div>
                );
              const spec = specOf(p.name, p.rules);
              const v = params[p.name] ?? "";
              const err = v.trim() ? paramValueError(spec, v.trim(), result.vendor) : null;
              return (
                <ParamField key={p.name} name={p.name} prompt={p.prompt} example={p.example} fallback={spec?.default} required={p.required} value={v} error={err} onChange={(x) => onParam(p.name, x)} rules={p.rules} />
              );
            })}
          </div>
          {pending.length > 0 && <p className="mt-1 text-caption text-muted">Pendientes: {pending.map((p) => p.name).join(", ")}.</p>}
        </div>
      )}

      {plan && (
        <>
          {(plan.warnings.length > 0 || plan.manual.length > 0) && (
            <div className="rounded-lg border border-line px-3 py-2 text-body-sm space-y-1">
              {plan.warnings.map((w) => (
                <p key={w} className="flex gap-1.5 text-warn">
                  <TriangleAlert size={13} aria-hidden className="mt-0.5 shrink-0" />
                  <span className="text-fg">{w}</span>
                </p>
              ))}
              {plan.manual.map((m) => (
                <p key={m.ruleId} className="text-muted">
                  Manual: {m.ruleId} {m.title}. {m.note}
                </p>
              ))}
            </div>
          )}
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <h4 className="text-body-sm font-medium">Plan</h4>
              <span className="text-caption text-muted">
                {plan.riskCount.change} de cambio, {plan.riskCount.disruptive} que pueden cortar servicio, {plan.riskCount.read} de consulta
              </span>
              <span className="flex-1" />
              <Btn onClick={() => onCopy(plan.text, "Plan")}>
                <ClipboardCopy size={13} aria-hidden /> Copiar
              </Btn>
              <Btn onClick={() => onSave(plan.text, "txt", false)}>
                <Download size={13} aria-hidden /> Exportar .txt
              </Btn>
              <Btn kind="primary" onClick={() => onLab(plan.text)} title="Abre el plan en CLI Lab sin ejecutarlo (reemplaza el borrador del Lab)">
                <SquareTerminal size={13} aria-hidden /> Abrir en CLI Lab
              </Btn>
            </div>
            <PlanLines lines={plan.lines} label="Plan de corrección" />
          </div>
          {plan.rollback.length > 0 && (
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <button type="button" aria-expanded={showRollback} onClick={() => setShowRollback(!showRollback)} className="flex items-center gap-1 text-body-sm font-medium hover:underline">
                  <ChevronRight size={14} aria-hidden className={`transition-transform ${showRollback ? "rotate-90" : ""}`} /> Rollback ({plural(plan.rollback.filter((l) => !l.comment).length, "línea", "líneas")})
                </button>
                <span className="text-caption text-muted">En el plan va al final como comentario; aquí como script aparte.</span>
                <span className="flex-1" />
                <Btn kind="ghost" onClick={() => onCopy(plan.rollbackText, "Rollback")}>
                  <ClipboardCopy size={13} aria-hidden /> Copiar
                </Btn>
                <Btn kind="ghost" onClick={() => onSave(plan.rollbackText, "txt", true)}>
                  <Download size={13} aria-hidden /> Exportar
                </Btn>
              </div>
              {showRollback && <PlanLines lines={plan.rollback} label="Rollback" />}
            </div>
          )}
        </>
      )}
      {!plan && <p className="text-body-sm text-muted">Marca al menos un hallazgo para armar el plan.</p>}
    </div>
  );
}

function ParamField({
  name,
  prompt,
  example,
  fallback,
  required,
  value,
  error,
  onChange,
  rules,
}: {
  name: string;
  prompt: string;
  example?: string;
  /** Valor por defecto de la regla (o de un override): se usa si el campo queda vacío. */
  fallback?: string;
  required: boolean;
  value: string;
  error: string | null;
  onChange: (v: string) => void;
  rules: string[];
}) {
  const id = useId();
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block mb-1 text-body-sm font-medium text-muted">
        {prompt}
        {required ? " (requerido)" : ""}
      </label>
      <input
        id={id}
        className="field font-mono"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={fallback ?? example ?? `{{${name}}}`}
        spellCheck={false}
        aria-invalid={!!error}
        aria-describedby={`${id}-h`}
      />
      <p id={`${id}-h`} className={`text-caption ${error ? "text-danger font-medium" : "text-muted"}`}>
        {error ? `No se usa: ${error}` : !value.trim() && fallback ? `Vacío: se usa el valor por defecto ${fallback} · ${rules.join(", ")}` : `{{${name}}} · ${rules.join(", ")}`}
      </p>
    </div>
  );
}

function PlanLines({ lines, label }: { lines: { text: string; risk: Risk | null; comment: boolean }[]; label: string }) {
  return (
    <pre aria-label={label} className="rounded-lg bg-hover p-2 font-mono text-body-sm leading-[1.55] overflow-auto max-h-96 select-text">
      {lines.map((l, i) => {
        const r = l.risk && !l.comment ? LINE_RISK[l.risk] : null;
        return (
          <span key={i} className="flex gap-2">
            <span aria-hidden className={`w-3 shrink-0 text-center ${r?.cls ?? ""}`} title={r?.label}>
              {r?.mark}
            </span>
            {r && l.risk !== "read" && <span className="sr-only">({r.label}) </span>}
            <span className={`whitespace-pre-wrap [overflow-wrap:anywhere] ${l.comment ? "text-muted" : ""}`}>{l.text || " "}</span>
          </span>
        );
      })}
    </pre>
  );
}
