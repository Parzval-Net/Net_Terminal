import { useEffect, useId, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AlertTriangle, KeyRound, LockKeyhole } from "lucide-react";
import { Session, sessionTarget } from "../types";
import { SessionIcon, typeLabel } from "./SessionIcon";
import { mergeImported, planImport } from "../lib/importMerge";
import type { Settings } from "../lib/settings";
import { type CredStatus, credStatus, needsUnlock } from "../lib/credentials";
import {
  type ApplyResult,
  type BundlePreview,
  ignoredSettings,
  importedSnmpProfiles,
  planNotes,
  settingLabel,
  settingsChanges,
  settingsPatch,
  validRules,
  withDest,
} from "../lib/bundle";
import { type Pack, validatePack } from "../lib/packs";
import { plural } from "../lib/plural";
import { VaultUnlock } from "./VaultUnlock";
import { CreateVault } from "./CredentialSettings";

interface Props {
  path: string;
  folders: string[];
  sessions: Session[];
  settings?: Settings;
  /** Refresca la lista de sesiones de la app (`onImport([], [])` relee las guardadas). */
  onImport: (list: Session[], updates: Session[]) => Promise<number>;
  onSettings?: (patch: (s: Settings) => Partial<Settings>) => void;
  onPacks?: () => void;
  /** Volver a elegir archivo. */
  onBack: () => void;
  onDone: (msg: string) => void;
}

const NOTE_NAMES = (list: { name: string }[]) => list.map((n) => n.name);

/**
 * Importación de un archivo cifrado (.ntx): contraseña del archivo, vista previa con el mismo plan
 * de reimportación (Nueva / Ya existe / Cambia) y opciones; nada se escribe hasta confirmar. Las
 * contraseñas del archivo nunca llegan aquí: Rust las guarda directo en la bóveda.
 */
export function BundleImport({ path, folders, sessions, settings, onImport, onSettings, onPacks, onBack, onDone }: Props) {
  const ids = useId();
  const [password, setPassword] = useState("");
  const [preview, setPreview] = useState<BundlePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dest, setDest] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [overwrite, setOverwrite] = useState(true);
  const [advanced, setAdvanced] = useState(false);
  const [applySettings, setApplySettings] = useState(false);
  const [extras, setExtras] = useState({ macros: true, packs: true, notes: true, highlight: true });
  const [withPw, setWithPw] = useState(true);
  const [withHops, setWithHops] = useState(true);
  const [st, setSt] = useState<CredStatus | null>(null);

  const summaryRef = useRef<HTMLParagraphElement>(null);
  // El campo de contraseña desaparece al abrir el archivo: el foco pasa al resumen (se lee primero).
  useEffect(() => {
    if (preview) summaryRef.current?.focus();
  }, [preview]);
  const refreshVault = () => credStatus().then(setSt).catch(() => setSt(null));
  // Si el diálogo se cierra sin importar, el contenido descifrado se descarta en el backend.
  useEffect(() => () => void invoke("bundle_import_cancel").catch(() => {}), []);

  const open = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError("");
    const pw = password;
    // La contraseña del archivo no queda en el estado de la interfaz: viaja una vez a Rust.
    setPassword("");
    try {
      const p = await invoke<BundlePreview>("bundle_inspect", { path, password: pw });
      setPreview(p);
      setSelected(new Set(p.sessions.map((_, i) => i)));
      setWithPw(p.passwords.sessions > 0);
      setWithHops(p.passwords.hops > 0);
      if (p.passwords.sessions + p.passwords.hops + p.passwords.snmp > 0) refreshVault();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  const resolved = useMemo(() => (preview ? withDest(preview.sessions, dest) : []), [preview, dest]);
  const plan = useMemo(() => planImport(sessions, resolved), [sessions, resolved]);
  const changing = plan.filter((p, i) => p.status === "update" && selected.has(i)).length;
  const risky = plan.flatMap((p, i) => (p.status === "update" && p.drops && selected.has(i) ? [{ p, s: resolved[i] }] : []));
  useEffect(() => setOverwrite(risky.length === 0), [risky.length]);

  const changes = useMemo(() => (settings && preview ? settingsChanges(settings, preview.settings) : []), [settings, preview]);
  const ignored = useMemo(() => [...new Set([...(preview?.ignored_settings ?? []), ...ignoredSettings(preview?.settings ?? null)])], [preview]);
  const packs = useMemo(() => (preview?.packs ?? []).map((r) => validatePack(r).pack).filter((p): p is Pack => !!p), [preview]);
  const rules = useMemo(() => validRules(preview?.highlight ?? null), [preview]);
  const advancedSel = (preview?.advanced ?? []).filter((i) => selected.has(i)).length;
  const pwSel = (preview?.with_password ?? []).filter((i) => selected.has(i)).length;
  const snmpIds = preview ? importedSnmpProfiles(preview, applySettings) : [];
  const wantsVault = (withPw && pwSel > 0) || (withHops && (preview?.passwords.hops ?? 0) > 0) || snmpIds.length > 0;
  const vaultBlocked = wantsVault && (!st || needsUnlock(st) || (st.backend === "vault" && !st.exists));

  const toggle = (i: number) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });

  const doImport = async () => {
    if (!preview) return;
    const fresh: { index: number; folder: string | null }[] = [];
    const updates: { index: number; session: Session }[] = [];
    let same = 0;
    let kept = 0;
    resolved.forEach((s, i) => {
      if (!selected.has(i)) return;
      const p = plan[i];
      if (p.status === "new") fresh.push({ index: i, folder: s.folder ?? null });
      else if (p.status === "same") same++;
      else if (overwrite && p.existing) updates.push({ index: i, session: mergeImported(p.existing, s) });
      else kept++;
    });
    setBusy(true);
    setError("");
    try {
      const r = await invoke<ApplyResult>("bundle_import_apply", {
        token: preview.token,
        fresh,
        updates,
        opts: { advanced, passwords: withPw, hops: withHops, snmp_profiles: snmpIds },
      });
      // Relee las sesiones guardadas en la app (sin agregar nada).
      await onImport([], []);
      const parts = [plural(r.added, "sesión nueva", "sesiones nuevas")];
      if (r.updated) parts.push(plural(r.updated, "actualizada", "actualizadas"));
      if (same) parts.push(plural(same, "ya existía igual", "ya existían iguales"));
      if (kept) parts.push(`${plural(kept, "existente", "existentes")} sin cambios por tu elección`);
      const npw = r.passwords.sessions + r.passwords.hops + r.passwords.snmp;
      if (npw) parts.push(`${plural(npw, "contraseña guardada", "contraseñas guardadas")} en la bóveda`);

      const choice = { settings: applySettings, macros: extras.macros, highlight: extras.highlight, dest };
      if (onSettings && settings) {
        const patch = settingsPatch(settings, preview, choice);
        if (Object.keys(patch).length) onSettings((cur) => settingsPatch(cur, preview, choice));
        if (applySettings && changes.length) parts.push(plural(changes.length, "ajuste aplicado", "ajustes aplicados"));
        if (extras.macros && preview.macros?.length) parts.push(plural(preview.macros.length, "botón", "botones"));
        if (extras.highlight && rules.length) parts.push(plural(rules.length, "regla de resaltado", "reglas de resaltado"));
      }
      if (extras.packs && packs.length) {
        let ok = 0;
        for (const p of packs) await invoke("cmdpack_save", { pack: p }).then(() => ok++, () => {});
        if (ok) parts.push(plural(ok, "pack de comandos", "packs de comandos"));
        onPacks?.();
      }
      if (extras.notes && preview.notes?.length) {
        const existing = await invoke<{ name: string }[]>("list_notes").catch(() => []);
        let ok = 0;
        for (const n of planNotes(NOTE_NAMES(existing), preview.notes)) await invoke("save_note", { name: n.name, content: n.content }).then(() => ok++, () => {});
        if (ok) parts.push(plural(ok, "nota", "notas"));
      }
      const warn = r.warnings.length ? ` Avisos: ${r.warnings.slice(0, 3).join("; ")}${r.warnings.length > 3 ? "…" : ""}` : "";
      onDone(`Importación lista: ${parts.join(", ")}.${warn}`);
    } catch (err) {
      setError(`No se importó nada: ${err}`);
      if (String(err).includes("bóveda")) refreshVault();
    } finally {
      setBusy(false);
    }
  };

  if (!preview)
    return (
      <form onSubmit={open} className="space-y-2" aria-describedby={`${ids}-help`}>
        <p className="text-[12px]">
          Archivo: <span className="font-mono text-[11.5px] break-all">{path}</span>
        </p>
        <label htmlFor={`${ids}-pw`} className="block text-[11.5px] font-medium text-muted">
          Contraseña del archivo
        </label>
        <div className="flex gap-1.5">
          <input
            id={`${ids}-pw`}
            type="password"
            autoComplete="off"
            className="field flex-1"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            aria-invalid={!!error}
            aria-describedby={error ? `${ids}-err` : undefined}
          />
          <button
            type="submit"
            disabled={!password || busy}
            className="flex items-center gap-1.5 px-3 h-8 rounded-md bg-accent text-accent-fg font-medium hover:opacity-90 disabled:opacity-50"
          >
            <LockKeyhole size={13} /> {busy ? "Descifrando…" : "Abrir"}
          </button>
          <button type="button" onClick={onBack} className="px-3 h-8 rounded-md border border-line hover:bg-hover">
            Otro archivo
          </button>
        </div>
        {error && (
          <p id={`${ids}-err`} role="alert" className="text-[11.5px] text-danger">
            {error}
          </p>
        )}
        <p id={`${ids}-help`} className="text-[11.5px] text-muted">
          Se descifra en memoria y se muestra una vista previa. Nada se guarda hasta que confirmes. Cada intento toma unos segundos a
          propósito (protege el archivo ante ataques de diccionario).
        </p>
      </form>
    );

  const total = preview.passwords.sessions + preview.passwords.hops + preview.passwords.snmp;
  return (
    <div className="space-y-3">
      <p ref={summaryRef} tabIndex={-1} className="text-[12px] outline-none" role="status">
        Archivo de NetTerminal {preview.app || ""}
        {preview.created ? ` del ${preview.created.slice(0, 10)}` : ""}: {plural(preview.sessions.length, "sesión", "sesiones")}
        {preview.folders.length ? `, ${plural(preview.folders.length, "carpeta vacía", "carpetas vacías")}` : ""}
        {preview.settings ? `, ajustes` : ""}
        {preview.macros?.length ? `, ${plural(preview.macros.length, "botón", "botones")}` : ""}
        {packs.length ? `, ${plural(packs.length, "pack de comandos", "packs de comandos")}` : ""}
        {preview.notes?.length ? `, ${plural(preview.notes.length, "nota", "notas")}` : ""}
        {rules.length ? `, ${plural(rules.length, "regla de resaltado", "reglas de resaltado")}` : ""}
        {total ? `, ${plural(total, "contraseña", "contraseñas")}` : ", sin contraseñas"}.
      </p>

      {preview.sessions.length > 0 && (
        <>
          <div className="flex items-center gap-2 text-[12px]">
            <label htmlFor={`${ids}-dest`} className="text-muted shrink-0">
              Carpeta de destino
            </label>
            <input id={`${ids}-dest`} className="field !h-7 flex-1" list={`${ids}-folders`} value={dest} placeholder="Raíz (estructura original)" onChange={(e) => setDest(e.target.value)} />
            <datalist id={`${ids}-folders`}>
              {folders.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </div>
          {changing > 0 && (
            <div className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-[12px] space-y-1.5">
              <p className="flex items-center gap-1.5 font-medium">
                <AlertTriangle size={13} className="text-warn" aria-hidden />
                {plural(changing, "sesión ya existe", "sesiones ya existen")} en esa carpeta con datos de conexión distintos
              </p>
              <label className="flex items-center gap-2">
                <input type="radio" name={`${ids}-ow`} className="accent-[var(--accent)]" checked={overwrite} onChange={() => setOverwrite(true)} />
                Sobrescribir con lo importado (host, puerto, usuario, tipo y serial)
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name={`${ids}-ow`} className="accent-[var(--accent)]" checked={!overwrite} onChange={() => setOverwrite(false)} />
                Conservar las existentes y omitirlas
              </label>
              {risky.length > 0 && (
                <p className="text-[11.5px] font-medium text-warn">
                  {plural(risky.length, "sesión cambia", "sesiones cambian")} de destino y tiene contraseña guardada, túneles o comandos al
                  conectar. Al sobrescribir se quitan para que no lleguen a otro equipo.
                </p>
              )}
            </div>
          )}
          <div className="rounded-lg border border-line overflow-hidden">
            <div className="flex items-center gap-2 px-3 h-8 bg-chrome border-b border-line text-[11.5px] text-muted">
              <input
                type="checkbox"
                className="accent-[var(--accent)]"
                checked={selected.size === preview.sessions.length}
                aria-label="Seleccionar todas"
                onChange={() => setSelected(selected.size === preview.sessions.length ? new Set() : new Set(preview.sessions.map((_, i) => i)))}
              />
              <span className="flex-1 truncate">Sesiones del archivo</span>
            </div>
            <ul className="max-h-[220px] overflow-y-auto">
              {preview.sessions.map((s, i) => (
                <li key={i}>
                  <label className="flex items-center gap-2 px-3 h-8 text-[12px] hover:bg-hover">
                    <input type="checkbox" className="accent-[var(--accent)]" checked={selected.has(i)} onChange={() => toggle(i)} />
                    <SessionIcon type={s.type} size={13} />
                    <span className="w-[28%] truncate">{s.name}</span>
                    <span className="flex-1 truncate text-muted font-mono text-[11.5px]">{sessionTarget(s)}</span>
                    <span className="w-[22%] truncate text-muted text-[11.5px]">{resolved[i]?.folder ?? ""}</span>
                    {preview.with_password.includes(i) ? (
                      <KeyRound size={12} className="text-muted shrink-0" aria-label="Con contraseña en el archivo" />
                    ) : (
                      <span className="w-3" />
                    )}
                    <Badge status={plan[i]?.status} overwrite={overwrite} />
                    <span className="w-12 text-right text-[11px] text-muted uppercase">{typeLabel[s.type]}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      <fieldset className="space-y-1.5 text-[12.5px]">
        <legend className="text-[11.5px] font-medium text-muted mb-1">Qué más importar</legend>
        {advancedSel > 0 && (
          <label className="flex items-start gap-2">
            <input type="checkbox" className="accent-[var(--accent)] mt-0.5" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} />
            <span>
              Comandos al conectar, túneles, argumentos extra de SSH y SSH legacy de {plural(advancedSel, "sesión", "sesiones")}
              <span className="block text-[11.5px] text-muted">
                Ya validados (mismas reglas que al conectar). Revísalos si el archivo no es tuyo: se envían o se aplican al conectar.
              </span>
            </span>
          </label>
        )}
        {preview.settings && (
          <div>
            <label className="flex items-start gap-2">
              <input type="checkbox" className="accent-[var(--accent)] mt-0.5" checked={applySettings} onChange={(e) => setApplySettings(e.target.checked)} />
              <span>
                Aplicar los ajustes del archivo
                <span className="block text-[11.5px] text-muted">
                  {changes.length ? `Se sobrescriben: ${changes.map((c) => c.label).join(", ")}.` : "No cambian nada aquí."}
                </span>
              </span>
            </label>
            {ignored.length > 0 && (
              <p className="ml-5 text-[11.5px] text-muted">
                Nunca se importan (seguridad o datos de otro equipo): {ignored.slice(0, 12).map(settingLabel).join(", ")}
                {ignored.length > 12 ? "…" : ""}.
              </p>
            )}
          </div>
        )}
        {!!preview.macros?.length && (
          <label className="flex items-center gap-2">
            <input type="checkbox" className="accent-[var(--accent)]" checked={extras.macros} onChange={(e) => setExtras((x) => ({ ...x, macros: e.target.checked }))} />
            {plural(preview.macros.length, "botón", "botones")} (los del mismo id se reemplazan)
          </label>
        )}
        {packs.length > 0 && (
          <label className="flex items-center gap-2">
            <input type="checkbox" className="accent-[var(--accent)]" checked={extras.packs} onChange={(e) => setExtras((x) => ({ ...x, packs: e.target.checked }))} />
            {plural(packs.length, "pack de comandos propio", "packs de comandos propios")} (validados; uno con el mismo id se reemplaza)
          </label>
        )}
        {!!preview.notes?.length && (
          <label className="flex items-center gap-2">
            <input type="checkbox" className="accent-[var(--accent)]" checked={extras.notes} onChange={(e) => setExtras((x) => ({ ...x, notes: e.target.checked }))} />
            {plural(preview.notes.length, "nota", "notas")} (si el nombre existe se agrega "(importada)")
          </label>
        )}
        {rules.length > 0 && (
          <label className="flex items-center gap-2">
            <input type="checkbox" className="accent-[var(--accent)]" checked={extras.highlight} onChange={(e) => setExtras((x) => ({ ...x, highlight: e.target.checked }))} />
            {plural(rules.length, "regla de resaltado", "reglas de resaltado")}
          </label>
        )}
      </fieldset>

      {total > 0 && (
        <fieldset className="space-y-1.5 text-[12.5px] rounded-lg border border-line p-3">
          <legend className="px-1 text-[11.5px] font-medium text-muted">Contraseñas del archivo</legend>
          <p className="text-[11.5px] text-muted">
            Entran directo a la bóveda de este equipo, nunca se muestran. Solo para las sesiones importadas con el mismo destino que en
            el archivo; esas quedan con "Guardar contraseña" activo.
          </p>
          {preview.passwords.sessions > 0 && (
            <label className="flex items-center gap-2">
              <input type="checkbox" className="accent-[var(--accent)]" checked={withPw} onChange={(e) => setWithPw(e.target.checked)} />
              {plural(pwSel, "contraseña de sesión", "contraseñas de sesión")}
            </label>
          )}
          {preview.passwords.hops > 0 && (
            <label className="flex items-center gap-2">
              <input type="checkbox" className="accent-[var(--accent)]" checked={withHops} onChange={(e) => setWithHops(e.target.checked)} />
              {plural(preview.passwords.hops, "contraseña de vecino", "contraseñas de vecinos")} (saltos de Topología)
            </label>
          )}
          {preview.passwords.snmp > 0 && (
            <p className="text-[11.5px] text-muted">
              {plural(preview.passwords.snmp, "perfil SNMP con secretos", "perfiles SNMP con secretos")}: se importan con los ajustes
              {applySettings ? ` (${snmpIds.length})` : " (marca Aplicar los ajustes)"}.
            </p>
          )}
          {wantsVault && st && needsUnlock(st) && (
            <div className="space-y-1">
              <p className="text-[11.5px]">La bóveda está bloqueada. Desbloquéala o desmarca las contraseñas:</p>
              <VaultUnlock onUnlocked={refreshVault} />
            </div>
          )}
          {wantsVault && st && st.backend === "vault" && !st.exists && (
            <p className="text-[11.5px]">No hay bóveda en este equipo. Créala aquí o desmarca las contraseñas para importar sin ellas.</p>
          )}
          {wantsVault && st && st.backend === "vault" && !st.exists && (
            <CreateVault
              onCreate={(m) =>
                invoke("vault_create", { master: m })
                  .then(() => (refreshVault(), true))
                  .catch((e) => (setError(String(e)), false))
              }
            />
          )}
        </fieldset>
      )}

      {preview.warnings.length > 0 && (
        <details className="rounded-lg border border-line text-[11.5px]">
          <summary className="flex items-center gap-1.5 px-3 h-8 cursor-default">
            <AlertTriangle size={13} className="text-warn" aria-hidden />
            {plural(preview.warnings.length, "aviso", "avisos")}: lo que no se importa y por qué
          </summary>
          <ul className="px-3 pb-2 max-h-32 overflow-y-auto space-y-0.5 text-muted">
            {preview.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </details>
      )}

      {error && (
        <p role="alert" className="text-[11.5px] text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onBack} className="px-3.5 h-8 rounded-md border border-line hover:bg-hover">
          Otro archivo
        </button>
        <button
          type="button"
          onClick={doImport}
          disabled={busy || vaultBlocked}
          title={vaultBlocked ? "Desbloquea o crea la bóveda, o desmarca las contraseñas" : undefined}
          className="px-3.5 h-8 rounded-md bg-accent text-accent-fg font-medium hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Importando…" : `Importar ${selected.size ? plural(selected.size, "sesión", "sesiones") : "lo elegido"}`}
        </button>
      </div>
    </div>
  );
}

function Badge({ status, overwrite }: { status?: string; overwrite: boolean }) {
  if (status === "same") return <span className="w-16 text-right text-[11px] text-muted">Ya existe</span>;
  if (status === "update") return <span className={`w-16 text-right text-[11px] ${overwrite ? "text-warn font-medium" : "text-muted line-through"}`}>Cambia</span>;
  return <span className="w-16 text-right text-[11px] text-accent">Nueva</span>;
}
