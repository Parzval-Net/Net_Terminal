import { useEffect, useId, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { Download, FlaskConical, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { Segmented, Switch } from "../controls";
import { Btn, CountBadge, Label, Section } from "./ui";
import { StatusTag } from "./AuditTags";
import { plural } from "../../lib/plural";
import { AUDIT_VENDORS, VENDOR_LABEL, parseConfig, type AuditVendor } from "../../lib/auditParse";
import {
  LAYER_LABEL,
  SEVERITIES,
  SEVERITY_LABEL,
  isIsoFramework,
  resolveRules,
  validateRulePack,
  type EffectiveRule,
  type Layer,
  type RulePack,
  type ResolvedRules,
  type Severity,
} from "../../lib/auditRules";
import { evaluateRule, testRule, type RuleTestFailure } from "../../lib/audit";
import {
  USER_PACK_ID,
  addWaiver,
  emptyForm,
  formFromRule,
  removeRule,
  removeWaiver,
  ruleFromForm,
  setRuleEnabled,
  setRuleSeverity,
  upsertRule,
  waiverErrors,
  type LoadedPack,
  type SimpleRuleForm,
} from "../../lib/auditLib";

/** Excepción pedida desde un hallazgo (Auditar › Resultado). `n` cambia en cada pedido. */
export interface WaiverDraft {
  rule: string;
  match: string;
  n: number;
}

interface Props {
  packs: LoadedPack[];
  packInputs: { pack: RulePack; layer: Layer }[];
  resolved: ResolvedRules;
  userPack: RulePack;
  onSaveUserPack: (p: RulePack) => Promise<void>;
  onReload: () => Promise<unknown> | void;
  /** Configuración cargada en Auditar, para la prueba en vivo del editor. */
  sample: { text: string; vendor: AuditVendor; platform?: string; source: string } | null;
  waiverDraft: WaiverDraft | null;
  onMsg: (text: string, error?: boolean) => void;
  onConfirm: (req: { title: string; message: string; label: string; danger?: boolean; action: () => void }) => void;
}

interface Preview {
  path: string;
  pack: RulePack | null;
  errors: string[];
  warnings: string[];
  tests: RuleTestFailure[];
  replaces?: string;
}

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Biblioteca de reglas: packs por capa (integrada < importada < usuario), activar y desactivar,
 * cambiar severidad, importar y exportar packs JSON, crear una regla simple con prueba en vivo y
 * registrar excepciones con motivo, aprobador y vencimiento. Todo lo que cambia el usuario va a su
 * pack "Mis reglas" (capa usuario): los packs integrados e importados no se modifican.
 */
export default function AuditLibrary({ packs, packInputs, resolved, userPack, onSaveUserPack, onReload, sample, waiverDraft, onMsg, onConfirm }: Props) {
  const fail = (e: unknown) => onMsg(String(e instanceof Error ? e.message : e), true);
  const saveUser = (p: RulePack, ok?: string) =>
    onSaveUserPack(p)
      .then(() => ok && onMsg(ok))
      .catch(fail);

  // Catálogo con todas las reglas, también las desactivadas: un pack extra (solo para listar) las reactiva.
  const catalog = useMemo(() => {
    const off = new Set(resolved.disabled.map((d) => d.id));
    const all = off.size
      ? resolveRules([...packInputs, { pack: { format: "netterminal-rules", formatVersion: 1, id: "listado", name: "listado", version: "0", overrides: [...off].map((rule) => ({ rule, enabled: true })) }, layer: "user" }]).rules
      : resolved.rules;
    return all.map((er) => ({ er, enabled: !off.has(er.rule.id), changes: er.changes.filter((c) => !c.includes("(listado)")) }));
  }, [packInputs, resolved]);

  // ---------- Packs ----------
  const [preview, setPreview] = useState<Preview | null>(null);
  const builtinIds = useMemo(() => packInputs.filter((p) => p.layer === "builtin").map((p) => p.pack.id), [packInputs]);
  const pickPack = async () => {
    const path = await open({ multiple: false, directory: false, title: "Pack de reglas para importar", filters: [{ name: "Pack de reglas (JSON)", extensions: ["json"] }] }).catch(() => null);
    if (typeof path !== "string") return;
    try {
      const text = await invoke<string>("auditrules_read", { path });
      const v = validateRulePack(text);
      const errors = [...v.errors];
      if (v.pack && (v.pack.id === USER_PACK_ID || builtinIds.includes(v.pack.id))) errors.push(`El id "${v.pack.id}" es de ${v.pack.id === USER_PACK_ID ? "Mis reglas" : "un pack integrado"}: cambia el id del pack`);
      const tests = v.pack && !errors.length ? (v.pack.rules ?? []).flatMap((r) => testRule(r)) : [];
      const prev = v.pack ? packs.find((p) => p.layer === "imported" && p.pack?.id === v.pack!.id)?.pack : undefined;
      setPreview({ path, pack: errors.length ? null : v.pack, errors, warnings: v.warnings, tests, replaces: prev ? `${prev.name} ${prev.version}` : undefined });
    } catch (e) {
      fail(e);
    }
  };
  const install = async () => {
    if (!preview?.pack) return;
    try {
      // Se guarda el pack ya validado, nunca el archivo tal cual.
      await invoke("auditrules_save", { layer: "imported", pack: preview.pack });
      onMsg(`Pack instalado: ${preview.pack.name} ${preview.pack.version}`);
      setPreview(null);
      await onReload();
    } catch (e) {
      fail(e);
    }
  };
  const exportPack = async (p: RulePack) => {
    try {
      const dest = await save({ defaultPath: `${p.id}.json`, filters: [{ name: "Pack de reglas (JSON)", extensions: ["json"] }] });
      if (!dest) return;
      await invoke("save_text", { dest, content: JSON.stringify(p, null, 2) + "\n" });
      onMsg(`Exportado: ${dest}`);
    } catch (e) {
      fail(e);
    }
  };
  const deletePack = (layer: "imported" | "user", id: string, name: string) =>
    onConfirm({
      title: "Eliminar pack de reglas",
      message: `Se elimina "${name}" de esta carpeta de datos. Sus reglas, cambios y excepciones dejan de aplicarse en las próximas auditorías.`,
      label: "Eliminar",
      danger: true,
      action: () => {
        invoke("auditrules_delete", { layer, id })
          .then(() => onReload())
          .then(() => onMsg(`Pack eliminado: ${name}`))
          .catch(fail);
      },
    });

  // ---------- Reglas ----------
  const vendorsWithRules = useMemo(() => AUDIT_VENDORS.filter((v) => catalog.some((c) => c.er.rule.vendor === v)), [catalog]);
  const [vendor, setVendor] = useState<AuditVendor>(() => sample?.vendor ?? "cisco");
  const listVendor = vendorsWithRules.includes(vendor) ? vendor : (vendorsWithRules[0] ?? "cisco");
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return catalog.filter(
      (c) =>
        c.er.rule.vendor === listVendor &&
        (!needle || [c.er.rule.id, c.er.rule.title, ...c.er.rule.controls.map((x) => x.control), ...(c.er.rule.refs ?? [])].join(" ").toLowerCase().includes(needle)),
    );
  }, [catalog, listVendor, q]);
  const ownIds = new Set((userPack.rules ?? []).map((r) => r.id));

  // ---------- Regla propia ----------
  const [form, setForm] = useState<SimpleRuleForm>(() => emptyForm(sample?.vendor === "fortinet" ? "fortinet" : "cisco"));
  const [editing, setEditing] = useState<string | null>(null);
  const [example, setExample] = useState("");
  const [saveTest, setSaveTest] = useState(true);
  const formRef = useRef<HTMLDivElement>(null);
  const set = <K extends keyof SimpleRuleForm>(k: K, v: SimpleRuleForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const built = useMemo(() => ruleFromForm(form), [form]);
  // La configuración de prueba se analiza una vez por texto, no en cada tecla del formulario.
  const testText = example.trim() ? example : sample?.vendor === form.vendor ? sample.text : "";
  const testRoots = useMemo(() => (testText ? parseConfig(testText, form.vendor) : null), [testText, form.vendor]);
  const live = useMemo(() => {
    if (!built.rule || !testRoots) return null;
    const er: EffectiveRule = { rule: built.rule, layer: "user", packId: USER_PACK_ID, packVersion: userPack.version, severity: built.rule.severity, changes: [], waivers: [], paramDefaults: {}, order: 0 };
    return evaluateRule(er, testRoots, form.vendor, { platform: example.trim() ? undefined : sample?.platform });
  }, [built.rule, testRoots, form.vendor, example, sample?.platform, userPack.version]);
  const clash = catalog.find((c) => c.er.rule.id === form.id.trim() && !ownIds.has(c.er.rule.id));
  const saveRule = () => {
    if (!built.rule) return;
    const rule = { ...built.rule, ...(example.trim() && saveTest && live && live.status !== "n/a" ? { tests: [{ name: "Ejemplo del editor", config: example.slice(0, 20_000), expect: live.status }] } : {}) };
    const exists = ownIds.has(rule.id);
    if (editing && editing !== rule.id) {
      void saveUser(upsertRule(removeRule(userPack, editing), rule), `Regla ${rule.id} guardada en Mis reglas`);
    } else void saveUser(upsertRule(userPack, rule), `Regla ${rule.id} ${exists ? "actualizada" : "guardada"} en Mis reglas`);
    setEditing(null);
    setForm(emptyForm(form.vendor));
    setExample("");
  };
  const editRule = (id: string) => {
    const r = userPack.rules?.find((x) => x.id === id);
    const f = r ? formFromRule(r) : null;
    if (!r || !f) return onMsg("Esta regla usa opciones avanzadas: edítala en el JSON (Exportar Mis reglas, editar e importar como pack).", true);
    setForm(f);
    setEditing(id);
    setExample(r.tests?.[0]?.config ?? "");
    formRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  // ---------- Excepciones ----------
  const [w, setW] = useState({ rule: "", match: "", reason: "", approvedBy: "", expires: "", ticket: "" });
  const [wTried, setWTried] = useState(false);
  const wRef = useRef<HTMLDivElement>(null);
  const reasonRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!waiverDraft) return;
    setW((x) => ({ ...x, rule: waiverDraft.rule, match: waiverDraft.match }));
    setWTried(false);
    requestAnimationFrame(() => {
      wRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
      reasonRef.current?.focus({ preventScroll: true });
    });
  }, [waiverDraft?.n]); // eslint-disable-line react-hooks/exhaustive-deps
  const wErrors = [...(w.rule ? [] : ["Elige la regla"]), ...waiverErrors(w, today())];
  const addW = () => {
    setWTried(true);
    if (wErrors.length) return;
    void saveUser(addWaiver(userPack, w), `Excepción registrada para ${w.rule} (vence ${w.expires})`);
    setW({ rule: "", match: "", reason: "", approvedBy: "", expires: "", ticket: "" });
    setWTried(false);
  };
  const otherWaivers = packInputs.filter((p) => p.pack.id !== USER_PACK_ID).reduce((n, p) => n + (p.pack.waivers?.length ?? 0) + (p.pack.rules ?? []).reduce((m, r) => m + (r.waivers?.length ?? 0), 0), 0);

  const ids = { q: useId(), test: useId(), werr: useId() };
  const layerOrder: Layer[] = ["builtin", "imported", "user"];

  return (
    <div className="space-y-4">
      {/* ---------- Packs ---------- */}
      <Section
        title="Packs de reglas"
        hint="Precedencia: integrada, luego importada, luego usuario. La última capa gana y el informe muestra qué capa definió cada regla."
        right={
          <div className="flex flex-wrap items-center gap-1">
            <Btn onClick={pickPack}>
              <Upload size={13} aria-hidden /> Importar pack…
            </Btn>
            <Btn onClick={() => exportPack(userPack)} title="Exporta tus reglas, cambios y excepciones como JSON">
              <Download size={13} aria-hidden /> Exportar Mis reglas
            </Btn>
          </div>
        }
      >
        {preview && (
          <div className="mb-3 rounded-lg border border-line p-3 text-body-sm space-y-1.5" role="region" aria-label="Vista previa del pack a importar">
            <p className="font-medium [overflow-wrap:anywhere]">Archivo: {preview.path.split(/[\\/]/).pop()}</p>
            {preview.pack ? (
              <>
                <p>
                  {preview.pack.name} <span className="text-muted">({preview.pack.id} {preview.pack.version}{preview.pack.owner ? `, dueño ${preview.pack.owner}` : ""})</span>
                </p>
                <p className="text-muted">
                  {plural(preview.pack.rules?.length ?? 0, "regla", "reglas")}, {plural(preview.pack.overrides?.length ?? 0, "cambio a reglas existentes", "cambios a reglas existentes")},{" "}
                  {plural(preview.pack.waivers?.length ?? 0, "excepción", "excepciones")}. Es solo JSON: no se ejecuta nada al importarlo y cada regex pasó la validación anti-ReDoS.
                </p>
                {preview.replaces && <p className="text-warn">Reemplaza el pack importado {preview.replaces}.</p>}
                {preview.tests.length > 0 && (
                  <div className="text-warn">
                    <p>{plural(preview.tests.length, "prueba embebida falla", "pruebas embebidas fallan")} (revisa la regla antes de confiar en su resultado):</p>
                    <ul className="list-disc pl-5 text-fg">
                      {preview.tests.slice(0, 6).map((t, i) => (
                        <li key={i}>
                          {t.ruleId} · {t.test}: se esperaba {t.expected} y dio {t.got}
                          {t.detail ? ` (${t.detail})` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {preview.warnings.length > 0 && (
                  <details className="text-muted">
                    <summary className="cursor-pointer">{plural(preview.warnings.length, "aviso", "avisos")}</summary>
                    <ul className="list-disc pl-5">
                      {preview.warnings.slice(0, 30).map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  </details>
                )}
                <div className="flex gap-2 pt-1">
                  <Btn kind="primary" onClick={install}>
                    Instalar
                  </Btn>
                  <Btn onClick={() => setPreview(null)}>Cancelar</Btn>
                </div>
              </>
            ) : (
              <>
                <p className="text-danger font-medium">No se puede importar: {plural(preview.errors.length, "error", "errores")}. No se cargó nada.</p>
                <ul className="list-disc pl-5 max-h-48 overflow-y-auto">
                  {preview.errors.slice(0, 40).map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                  {preview.errors.length > 40 && <li>y {preview.errors.length - 40} más</li>}
                </ul>
                <Btn onClick={() => setPreview(null)}>Cerrar</Btn>
              </>
            )}
          </div>
        )}
        <ul className="rounded-lg border border-line divide-y divide-[var(--border)]">
          {layerOrder.flatMap((layer) =>
            layer === "builtin"
              ? packInputs
                  .filter((p) => p.layer === "builtin")
                  .map((p) => <PackRow key={`b-${p.pack.id}`} pack={p.pack} layer="builtin" sha={resolved.packs.find((x) => x.id === p.pack.id && x.layer === "builtin")?.sha256} onExport={() => exportPack(p.pack)} />)
              : packs
                  .filter((p) => p.layer === layer)
                  .map((p) =>
                    p.pack ? (
                      <PackRow
                        key={p.file}
                        pack={p.pack}
                        layer={layer}
                        sha={resolved.packs.find((x) => x.id === p.pack!.id && x.layer === layer)?.sha256}
                        onExport={() => exportPack(p.pack!)}
                        onDelete={() => deletePack(layer as "imported" | "user", p.pack!.id, p.pack!.name)}
                      />
                    ) : (
                      <li key={p.file} className="px-3 py-2 text-body-sm">
                        <div className="flex items-center gap-2">
                          <span className="font-medium [overflow-wrap:anywhere]">{p.file}</span>
                          <span className="text-danger font-medium">No se carga</span>
                          <span className="flex-1" />
                          <Btn kind="ghost" className="!h-7 !px-2" aria-label={`Eliminar ${p.file}`} title="Eliminar" onClick={() => deletePack(layer as "imported" | "user", p.file.replace(/^(imported|user)-/, "").replace(/\.json$/, ""), p.file)}>
                            <Trash2 size={13} aria-hidden />
                          </Btn>
                        </div>
                        <p className="text-caption text-danger">{p.errors.slice(0, 3).join("; ")}</p>
                      </li>
                    ),
                  ),
          )}
          {!packs.some((p) => p.layer === "user" && p.pack?.id === USER_PACK_ID) && (
            <li className="px-3 py-2 text-body-sm text-muted">Mis reglas: aún sin cambios. Se crea al desactivar una regla, cambiar una severidad, guardar una regla propia o registrar una excepción.</li>
          )}
        </ul>
      </Section>

      {/* ---------- Reglas ---------- */}
      <Section title="Reglas" hint="Los cambios se guardan en Mis reglas y la auditoría cargada se recalcula sola.">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <Segmented label="Fabricante" size="sm" value={listVendor} onChange={setVendor} options={vendorsWithRules.map((v) => [v, VENDOR_LABEL[v]] as const)} />
          <input id={ids.q} className="field !h-7 !w-56 !text-body-sm" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar id, título o control" aria-label="Buscar reglas" />
          <span className="text-caption text-muted">
            {catalog.filter((c) => c.er.rule.vendor === listVendor && c.enabled).length} de {catalog.filter((c) => c.er.rule.vendor === listVendor).length} activas
          </span>
        </div>
        {rows.length === 0 ? (
          <p className="text-body-sm text-muted">Ninguna regla coincide con la búsqueda.</p>
        ) : (
          <ul className="rounded-lg border border-line divide-y divide-[var(--border)] max-h-[28rem] overflow-y-auto">
            {rows.map(({ er, enabled, changes }) => {
              const r = er.rule;
              const iso = r.controls.filter((c) => isIsoFramework(c.framework)).map((c) => c.control);
              const own = ownIds.has(r.id);
              return (
                <li key={r.id} className={`flex items-start gap-3 px-3 py-2 text-body-sm ${enabled ? "" : "bg-hover"}`}>
                  <span className="pt-0.5">
                    <Switch checked={enabled} onChange={(on) => void saveUser(setRuleEnabled(userPack, r.id, on), `${r.id} ${on ? "activada" : "desactivada"}`)} label={`${enabled ? "Desactivar" : "Activar"} ${r.id}`} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex flex-wrap items-center gap-x-2">
                      <span className={`font-medium ${enabled ? "" : "text-muted line-through"}`}>{r.title}</span>
                      <code className="text-caption text-muted">{r.id}</code>
                    </span>
                    <span className="block text-caption text-muted">
                      {LAYER_LABEL[er.layer]} · {er.packId}
                      {iso.length ? ` · ISO ${iso.join(", ")}` : ""}
                      {r.platforms?.length ? ` · ${r.platforms.join(", ")}` : ""}
                      {r.fix ? ` · corrección ${r.fix === "auto" ? "automática" : r.fix === "guided" ? "guiada" : "manual"}` : ""}
                    </span>
                    {changes.length > 0 && <span className="block text-caption text-muted">{changes.join("; ")}</span>}
                  </span>
                  <select
                    className="field !h-7 !w-32 !text-body-sm"
                    value={er.severity}
                    aria-label={`Severidad de ${r.id}`}
                    onChange={(e) => {
                      const sev = e.target.value as Severity;
                      void saveUser(setRuleSeverity(userPack, r.id, sev === r.severity && !own ? null : sev), `Severidad de ${r.id}: ${SEVERITY_LABEL[sev].toLowerCase()}`);
                    }}
                  >
                    {SEVERITIES.map((s) => (
                      <option key={s} value={s}>
                        {SEVERITY_LABEL[s]}
                        {s === r.severity && er.severity !== r.severity ? " (original)" : ""}
                      </option>
                    ))}
                  </select>
                  {own ? (
                    <span className="flex">
                      <Btn kind="ghost" className="!h-7 !px-2" title="Editar" aria-label={`Editar ${r.id}`} onClick={() => editRule(r.id)}>
                        <Pencil size={13} aria-hidden />
                      </Btn>
                      <Btn
                        kind="ghost"
                        className="!h-7 !px-2"
                        title="Eliminar"
                        aria-label={`Eliminar ${r.id}`}
                        onClick={() =>
                          onConfirm({ title: "Eliminar regla propia", message: `Se elimina ${r.id} (${r.title}) de Mis reglas, con sus excepciones.`, label: "Eliminar", danger: true, action: () => void saveUser(removeRule(userPack, r.id), `Regla ${r.id} eliminada`) })
                        }
                      >
                        <Trash2 size={13} aria-hidden />
                      </Btn>
                    </span>
                  ) : (
                    <span className="w-[3.75rem]" aria-hidden />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {/* ---------- Regla propia ---------- */}
      <div ref={formRef} className="scroll-mt-4">
        <Section title={editing ? `Editar regla ${editing}` : "Regla propia"} hint="Busca una línea (regex, sin distinguir mayúsculas) en la configuración global o dentro de cada bloque. La prueba en vivo usa la configuración cargada en Auditar o un ejemplo propio.">
          <div className="grid grid-cols-1 @[44rem]:grid-cols-2 gap-x-4 gap-y-2.5">
            <div className="flex gap-2">
              <Label text="Id" className="w-40">
                <input className="field font-mono" value={form.id} onChange={(e) => set("id", e.target.value)} spellCheck={false} />
              </Label>
              <Label text="Título" className="flex-1">
                <input className="field" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Ej.: Banner de login obligatorio" />
              </Label>
            </div>
            <div className="flex gap-2">
              <Label text="Fabricante" className="flex-1">
                <select className="field" value={form.vendor} onChange={(e) => set("vendor", e.target.value as AuditVendor)}>
                  {AUDIT_VENDORS.map((v) => (
                    <option key={v} value={v}>
                      {VENDOR_LABEL[v]}
                    </option>
                  ))}
                </select>
              </Label>
              <Label text="Severidad" className="w-36">
                <select className="field" value={form.severity} onChange={(e) => set("severity", e.target.value as Severity)}>
                  {SEVERITIES.map((s) => (
                    <option key={s} value={s}>
                      {SEVERITY_LABEL[s]}
                    </option>
                  ))}
                </select>
              </Label>
            </div>
            <Label text="Bloque (regex, opcional)">
              <input className="field font-mono" value={form.block} onChange={(e) => set("block", e.target.value)} placeholder={form.vendor === "fortinet" ? "^config system admin$" : "^line vty "} spellCheck={false} />
            </Label>
            <div className="flex gap-2">
              <Label text="Hijo del bloque (regex, opcional)" className="flex-1">
                <input className="field font-mono" value={form.child} onChange={(e) => set("child", e.target.value)} placeholder={form.vendor === "fortinet" ? "^edit " : ""} spellCheck={false} disabled={!form.block.trim()} />
              </Label>
              <Label text="Si el bloque no existe" className="w-40">
                <select className="field" value={form.missingScope} onChange={(e) => set("missingScope", e.target.value as SimpleRuleForm["missingScope"])} disabled={!form.block.trim()}>
                  <option value="n/a">No aplica</option>
                  <option value="fail">No cumple</option>
                  <option value="review">Revisar</option>
                  <option value="pass">Cumple</option>
                </select>
              </Label>
            </div>
            <div className="@[44rem]:col-span-2 flex flex-wrap items-end gap-2">
              <Segmented
                label="Condición"
                value={form.kind}
                onChange={(v) => set("kind", v)}
                options={[
                  ["present", "Debe existir"],
                  ["absent", "No debe existir"],
                ]}
              />
              <Label text="Línea (regex, sin la indentación)" className="flex-1 min-w-[16rem]">
                <input className="field font-mono" value={form.match} onChange={(e) => set("match", e.target.value)} placeholder={form.vendor === "fortinet" ? "^set trusthost1 " : "^transport input ssh$"} spellCheck={false} />
              </Label>
            </div>
            <Label text="Controles ISO/IEC 27001:2022 (separados por coma)">
              <input className="field" value={form.iso} onChange={(e) => set("iso", e.target.value)} placeholder="A.8.5, A.8.20" />
            </Label>
            <Label text="Control del estándar interno (opcional)">
              <input className="field" value={form.internal} onChange={(e) => set("internal", e.target.value)} placeholder="HRD-ADM-03" />
            </Label>
            <Label text="Corrección (una línea por comando; {{block}} reabre el bloque)">
              <textarea className="field !h-24 py-1.5 font-mono text-body-sm resize-y" value={form.remediation} onChange={(e) => set("remediation", e.target.value)} spellCheck={false} placeholder={form.vendor === "fortinet" ? "config system admin\nedit {{child}}\nset trusthost1 192.0.2.0 255.255.255.0\nnext\nend" : "{{block}}\n transport input ssh"} />
            </Label>
            <Label text="Rollback (opcional)">
              <textarea className="field !h-24 py-1.5 font-mono text-body-sm resize-y" value={form.rollback} onChange={(e) => set("rollback", e.target.value)} spellCheck={false} />
            </Label>
            <Label text="Nota para quien corrige (opcional)" className="@[44rem]:col-span-2">
              <input className="field" value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Ej.: requiere SSH operativo antes de aplicar" />
            </Label>
          </div>

          {/* Prueba en vivo */}
          <div className="mt-3 rounded-lg border border-line p-3 space-y-2" aria-labelledby={ids.test}>
            <div className="flex flex-wrap items-center gap-2">
              <FlaskConical size={14} aria-hidden className="text-muted" />
              <h4 id={ids.test} className="text-body-sm font-medium">
                Prueba en vivo
              </h4>
              <span className="text-caption text-muted">
                {example.trim() ? "Con el ejemplo propio" : sample?.vendor === form.vendor ? `Con ${sample.source}` : sample ? `La configuración cargada es ${VENDOR_LABEL[sample.vendor]}: pega un ejemplo ${VENDOR_LABEL[form.vendor]}` : "Carga una configuración en Auditar o pega un ejemplo"}
              </span>
            </div>
            <textarea
              className="field !h-20 py-1.5 font-mono text-body-sm resize-y"
              value={example}
              onChange={(e) => setExample(e.target.value)}
              spellCheck={false}
              aria-label="Ejemplo propio para probar la regla"
              placeholder="Ejemplo propio (opcional): pega unas líneas de configuración para probar la regla"
            />
            {!form.title.trim() && !form.match ? (
              <p className="text-body-sm text-muted">Completa el título y la línea a buscar para ver el resultado.</p>
            ) : built.errors.length > 0 ? (
              <ul role="alert" className="list-disc pl-5 text-body-sm text-danger">
                {built.errors.slice(0, 8).map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            ) : live ? (
              <div className="text-body-sm space-y-1" aria-live="polite">
                <p className="flex flex-wrap items-center gap-2">
                  <StatusTag status={live.status} /> <span>{live.reason}</span>
                </p>
                {live.units
                  .filter((u) => u.evidence.length)
                  .slice(0, 3)
                  .map((u, i) => (
                    <pre key={i} className="rounded-md bg-hover px-2 py-1 font-mono text-caption whitespace-pre-wrap [overflow-wrap:anywhere]">
                      {`${u.label}\n`}
                      {u.evidence.map((e) => `${e.lineNo ? String(e.lineNo).padStart(5) : "     "}  ${e.text}`).join("\n")}
                    </pre>
                  ))}
              </div>
            ) : (
              <p className="text-body-sm text-muted">Sin configuración para probar.</p>
            )}
            {example.trim() && live && live.status !== "n/a" && (
              <label className="flex items-center gap-2 text-body-sm">
                <input type="checkbox" className="w-4 h-4 accent-[var(--accent)]" checked={saveTest} onChange={(e) => setSaveTest(e.target.checked)} />
                Guardar el ejemplo como prueba de la regla (resultado esperado: {live.status})
              </label>
            )}
          </div>
          {clash && <p className="mt-2 text-body-sm text-warn">El id {clash.er.rule.id} ya existe en la capa {LAYER_LABEL[clash.er.layer].toLowerCase()}: tu regla la reemplaza en las auditorías.</p>}
          <div className="mt-3 flex flex-wrap gap-2 justify-end">
            {editing && (
              <Btn
                onClick={() => {
                  setEditing(null);
                  setForm(emptyForm(form.vendor));
                  setExample("");
                }}
              >
                Cancelar edición
              </Btn>
            )}
            <Btn kind="primary" disabled={!built.rule} onClick={saveRule}>
              <Plus size={13} aria-hidden /> {editing ? "Guardar cambios" : "Guardar en Mis reglas"}
            </Btn>
          </div>
        </Section>
      </div>

      {/* ---------- Excepciones ---------- */}
      <div ref={wRef} className="scroll-mt-4">
        <Section
          title="Excepciones"
          hint="Un hallazgo con excepción vigente queda fuera del puntaje y se informa aparte. Vencida, deja de aplicar y el informe lo muestra."
          right={otherWaivers ? <span className="text-caption text-muted">{plural(otherWaivers, "excepción más en otros packs", "excepciones más en otros packs")}</span> : undefined}
        >
          {(userPack.waivers ?? []).length === 0 ? (
            <p className="text-body-sm text-muted mb-3">Sin excepciones propias. Créalas aquí o con "Crear excepción…" en un hallazgo.</p>
          ) : (
            <ul className="mb-3 rounded-lg border border-line divide-y divide-[var(--border)]">
              {(userPack.waivers ?? []).map((x, i) => {
                const expired = x.expires < today();
                return (
                  <li key={`${x.rule}-${i}`} className="flex items-start gap-2 px-3 py-2 text-body-sm">
                    <span className="flex-1 min-w-0">
                      <span className="flex flex-wrap items-center gap-x-2">
                        <code className="font-medium">{x.rule}</code>
                        {x.match && <span className="text-muted [overflow-wrap:anywhere]">en «{x.match}»</span>}
                        {expired ? <span className="text-danger font-medium">Vencida</span> : <CountBadge n={Math.max(0, Math.ceil((Date.parse(`${x.expires}T00:00:00Z`) - Date.now()) / 86_400_000))} tone="neutral" />}
                        {!expired && <span className="text-caption text-muted">días</span>}
                      </span>
                      <span className="block text-caption text-muted">
                        {x.reason} · aprobó {x.approvedBy} · vence {x.expires}
                        {x.ticket ? ` · ${x.ticket}` : ""}
                      </span>
                    </span>
                    <Btn kind="ghost" className="!h-7 !px-2" title="Eliminar" aria-label={`Eliminar la excepción de ${x.rule}`} onClick={() => void saveUser(removeWaiver(userPack, i), `Excepción de ${x.rule} eliminada`)}>
                      <Trash2 size={13} aria-hidden />
                    </Btn>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="grid grid-cols-1 @[44rem]:grid-cols-3 gap-x-3 gap-y-2">
            <Label text="Regla">
              <select className="field" value={w.rule} onChange={(e) => setW({ ...w, rule: e.target.value })}>
                <option value="">Elegir regla…</option>
                {catalog.map(({ er }) => (
                  <option key={er.rule.id} value={er.rule.id}>
                    {er.rule.id} · {er.rule.title}
                  </option>
                ))}
              </select>
            </Label>
            <Label text="Bloque (texto literal, opcional)">
              <input className="field font-mono" value={w.match} onChange={(e) => setW({ ...w, match: e.target.value })} placeholder='edit "breakglass"' spellCheck={false} />
            </Label>
            <Label text="Vence">
              <input className="field" type="date" min={today()} value={w.expires} onChange={(e) => setW({ ...w, expires: e.target.value })} />
            </Label>
            <Label text="Motivo" className="@[44rem]:col-span-2">
              <input ref={reasonRef} className="field" value={w.reason} onChange={(e) => setW({ ...w, reason: e.target.value })} placeholder="Ej.: cuenta de emergencia con control compensatorio" />
            </Label>
            <Label text="Aprobado por">
              <input className="field" value={w.approvedBy} onChange={(e) => setW({ ...w, approvedBy: e.target.value })} placeholder="Ej.: CISO" />
            </Label>
            <Label text="Ticket (opcional)">
              <input className="field" value={w.ticket} onChange={(e) => setW({ ...w, ticket: e.target.value })} placeholder="CHG-0000" />
            </Label>
            <div className="@[44rem]:col-span-2 flex items-end justify-end gap-2">
              {wTried && wErrors.length > 0 && (
                <p id={ids.werr} role="alert" className="mr-auto text-body-sm text-danger font-medium">
                  {wErrors.join(". ")}.
                </p>
              )}
              <Btn kind="primary" onClick={addW} aria-describedby={wTried && wErrors.length ? ids.werr : undefined}>
                <Plus size={13} aria-hidden /> Registrar excepción
              </Btn>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}

function PackRow({ pack, layer, sha, onExport, onDelete }: { pack: RulePack; layer: Layer; sha?: string; onExport: () => void; onDelete?: () => void }) {
  const vendors = [...new Set((pack.rules ?? []).map((r) => r.vendor))];
  return (
    <li className="flex items-start gap-3 px-3 py-2 text-body-sm">
      <span className="flex-1 min-w-0">
        <span className="flex flex-wrap items-center gap-x-2">
          <span className="font-medium">{pack.id === USER_PACK_ID ? "Mis reglas" : pack.name}</span>
          <span className="inline-flex items-center px-1.5 h-5 rounded-full border border-line text-caption">{LAYER_LABEL[layer]}</span>
          <code className="text-caption text-muted">
            {pack.id} {pack.version}
          </code>
        </span>
        <span className="block text-caption text-muted">
          {plural(pack.rules?.length ?? 0, "regla", "reglas")}
          {vendors.length ? ` (${vendors.map((v) => VENDOR_LABEL[v]).join(", ")})` : ""}
          {pack.overrides?.length ? ` · ${plural(pack.overrides.length, "cambio", "cambios")}` : ""}
          {pack.waivers?.length ? ` · ${plural(pack.waivers.length, "excepción", "excepciones")}` : ""}
          {pack.owner ? ` · dueño ${pack.owner}` : ""}
          {sha ? ` · SHA-256 ${sha.slice(0, 12)}…` : ""}
        </span>
      </span>
      <Btn kind="ghost" className="!h-7 !px-2" title="Exportar JSON" aria-label={`Exportar ${pack.name}`} onClick={onExport}>
        <Download size={13} aria-hidden />
      </Btn>
      {onDelete ? (
        <Btn kind="ghost" className="!h-7 !px-2" title="Eliminar" aria-label={`Eliminar ${pack.name}`} onClick={onDelete}>
          <Trash2 size={13} aria-hidden />
        </Btn>
      ) : (
        <span className="w-7" aria-hidden />
      )}
    </li>
  );
}

