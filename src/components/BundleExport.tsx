import { useEffect, useId, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { ShieldAlert } from "lucide-react";
import { type CredStatus, credStatus, needsUnlock } from "../lib/credentials";
import type { HopCredInfo } from "../lib/hopCred";
import { type BundleSummary, type ExportOpts, CONFIRM_WORD, MIN_BUNDLE_PASSWORD, bundleStrength, bundleStrengthText } from "../lib/bundle";
import { plural } from "../lib/plural";
import { VaultUnlock } from "./VaultUnlock";

interface Props {
  /** id del formulario: el botón "Guardar" del pie del diálogo lo envía. */
  formId: string;
  sessionIds: string[];
  allSessions: boolean;
  onBusy: (busy: boolean) => void;
  onMessage: (text: string, error?: boolean) => void;
}

/** Medidor simple de la contraseña del archivo. */
function Strength({ pw }: { pw: string }) {
  if (!pw) return null;
  const s = bundleStrength(pw);
  const color = ["bg-danger", "bg-warn", "bg-accent", "bg-accent"][s];
  return (
    <div className="flex items-center gap-2 text-[11px] text-muted" aria-live="polite">
      <div className="flex gap-0.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className={`w-8 h-1 rounded ${i < Math.max(1, s) ? color : "bg-line"}`} />
        ))}
      </div>
      Fortaleza: {bundleStrengthText[s]}
    </div>
  );
}

function Check({ checked, onChange, children, disabled }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <label className={`flex items-start gap-2 text-[12.5px] ${disabled ? "opacity-50" : ""}`}>
      <input type="checkbox" className="accent-[var(--accent)] mt-0.5" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

/**
 * Exportación a "Archivo cifrado de NetTerminal (.ntx)": qué incluir, contraseña del archivo y, si
 * se pide, las contraseñas de la bóveda (apagado por defecto, con aviso y confirmación escrita). La
 * interfaz nunca ve una contraseña guardada: Rust las lee de la bóveda y cifra el archivo.
 */
export function BundleExportPanel({ formId, sessionIds, allSessions, onBusy, onMessage }: Props) {
  const ids = useId();
  const [inc, setInc] = useState({ settings: true, macros: true, packs: true, highlight: true, notes: false });
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [withPw, setWithPw] = useState(false);
  const [pwSessions, setPwSessions] = useState(true);
  const [pwHops, setPwHops] = useState(true);
  const [pwSnmp, setPwSnmp] = useState(true);
  const [hops, setHops] = useState<HopCredInfo[] | null>(null);
  const [confirm, setConfirm] = useState("");
  const [master, setMaster] = useState("");
  const [st, setSt] = useState<CredStatus | null>(null);

  const refresh = () => credStatus().then(setSt).catch(() => setSt(null));
  useEffect(() => {
    if (withPw) refresh();
  }, [withPw]);
  const locked = needsUnlock(st);
  const noVault = !!st && st.backend === "vault" && !st.exists;
  useEffect(() => {
    if (!withPw || !st || locked || noVault) return setHops(null);
    invoke<HopCredInfo[]>("hop_cred_list").then(setHops, () => setHops([]));
  }, [withPw, st, locked, noVault]);

  const set = (k: keyof typeof inc) => (v: boolean) => setInc((x) => ({ ...x, [k]: v }));
  const pwLen = [...pw].length;
  const pwOk = pwLen >= MIN_BUNDLE_PASSWORD && pw === pw2;
  const askMaster = withPw && st?.backend === "vault";
  const anyPw = pwSessions || (pwHops && !!hops?.length) || (pwSnmp && inc.settings);
  const pwReady = !withPw || (!!st && !locked && !noVault && confirm.trim() === CONFIRM_WORD && (!askMaster || !!master) && anyPw);
  const ready = pwOk && pwReady && (sessionIds.length > 0 || allSessions);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) {
      onMessage(
        !pwOk
          ? `La contraseña del archivo debe tener al menos ${MIN_BUNDLE_PASSWORD} caracteres y coincidir en ambos campos`
          : withPw && confirm.trim() !== CONFIRM_WORD
            ? `Escribe ${CONFIRM_WORD} para aceptar que el archivo lleve contraseñas`
            : "Revisa las opciones de exportación",
        true,
      );
      return;
    }
    let dest = await save({
      title: "Guardar archivo cifrado de NetTerminal",
      defaultPath: "netterminal.ntx",
      filters: [{ name: "Archivo cifrado de NetTerminal", extensions: ["ntx"] }],
    }).catch(() => null);
    if (!dest) return;
    if (!/\.ntx$/i.test(dest)) dest += ".ntx";
    const opts: ExportOpts = {
      session_ids: sessionIds,
      all_sessions: allSessions,
      ...inc,
      passwords: withPw
        ? {
            sessions: pwSessions,
            hops: pwHops ? (hops ?? []).map((h) => ({ ip: h.ip, user: h.user })) : [],
            snmp: pwSnmp && inc.settings,
            confirm: confirm.trim(),
          }
        : null,
    };
    onBusy(true);
    onMessage("Cifrando… (la derivación de la llave toma unos segundos a propósito)");
    try {
      const r = await invoke<BundleSummary>("bundle_export", { dest, password: pw, master: askMaster ? master : null, opts });
      const parts = [plural(r.sessions, "sesión", "sesiones")];
      if (r.folders) parts.push(plural(r.folders, "carpeta vacía", "carpetas vacías"));
      if (inc.settings) parts.push(plural(r.settings, "ajuste", "ajustes"));
      if (r.macros) parts.push(plural(r.macros, "botón", "botones"));
      if (r.packs) parts.push(plural(r.packs, "pack de comandos", "packs de comandos"));
      if (r.notes) parts.push(plural(r.notes, "nota", "notas"));
      if (r.rules) parts.push(plural(r.rules, "regla de resaltado", "reglas de resaltado"));
      const npw = r.passwords.sessions + r.passwords.hops + r.passwords.snmp;
      if (withPw) parts.push(plural(npw, "contraseña", "contraseñas"));
      onMessage(`Archivo cifrado guardado (${parts.join(", ")}): ${dest}`);
      setPw("");
      setPw2("");
    } catch (err) {
      onMessage(String(err), true);
    } finally {
      // La maestra y la confirmación no se reutilizan: se piden en cada exportación.
      setMaster("");
      setConfirm("");
      onBusy(false);
    }
  };

  return (
    <form id={formId} onSubmit={submit} className="space-y-3 pt-3 mt-2 border-t border-line" aria-label="Opciones del archivo cifrado">
      <fieldset className="space-y-1.5">
        <legend className="text-[11.5px] font-medium text-muted mb-1">Incluir además de las sesiones y sus carpetas</legend>
        <Check checked={inc.settings} onChange={set("settings")}>
          Ajustes <span className="text-muted text-[11.5px]">(sin el token del API local, servidores, algoritmos legacy ni rutas locales)</span>
        </Check>
        <Check checked={inc.macros} onChange={set("macros")}>Botones</Check>
        <Check checked={inc.packs} onChange={set("packs")}>Comandos propios (packs)</Check>
        <Check checked={inc.highlight} onChange={set("highlight")}>Reglas de resaltado propias</Check>
        <Check checked={inc.notes} onChange={set("notes")}>
          Notas no protegidas <span className="text-muted text-[11.5px]">(las protegidas con contraseña nunca se incluyen)</span>
        </Check>
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor={`${ids}-pw`} className="block text-[11.5px] font-medium text-muted">
          Contraseña del archivo (mínimo {MIN_BUNDLE_PASSWORD} caracteres)
        </label>
        <input id={`${ids}-pw`} type="password" autoComplete="new-password" className="field" value={pw} onChange={(e) => setPw(e.target.value)} aria-describedby={`${ids}-pwhelp`} />
        <Strength pw={pw} />
        <label htmlFor={`${ids}-pw2`} className="block text-[11.5px] font-medium text-muted">
          Confirmar contraseña del archivo
        </label>
        <input id={`${ids}-pw2`} type="password" autoComplete="new-password" className="field" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        {pw2 && pw !== pw2 && <p className="text-[11.5px] text-danger">No coinciden</p>}
        <p id={`${ids}-pwhelp`} className="text-[11.5px] text-muted">
          Sin esta contraseña el archivo no se puede abrir y no hay forma de recuperarla. Una frase de varias palabras funciona bien.
        </p>
      </div>

      <div className="space-y-2">
        <Check checked={withPw} onChange={setWithPw}>
          Incluir las contraseñas guardadas de la bóveda
        </Check>
        {withPw && (
          <div className="ml-5 space-y-2">
            <div role="note" className="flex gap-2 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-[11.5px]">
              <ShieldAlert size={15} className="text-warn shrink-0 mt-0.5" aria-hidden />
              <p>
                El archivo contendrá las contraseñas de tus equipos. Quien tenga el archivo y su contraseña podrá usarlas. La custodia del
                archivo y de su contraseña es responsabilidad de quien lo exporta. En entornos corporativos, exportar credenciales puede
                estar regulado por la política de seguridad de tu organización: confírmalo antes.
              </p>
            </div>
            {!st ? (
              <p className="text-[11.5px] text-muted">Consultando la bóveda…</p>
            ) : noVault ? (
              <p className="text-[11.5px] text-muted">No hay bóveda creada: no hay contraseñas que exportar.</p>
            ) : locked ? (
              <div className="space-y-1">
                <p className="text-[11.5px] text-muted">La bóveda está bloqueada. Desbloquéala para continuar:</p>
                <VaultUnlock onUnlocked={refresh} />
              </div>
            ) : (
              <>
                <fieldset className="space-y-1.5">
                  <legend className="sr-only">Contraseñas a incluir</legend>
                  <Check checked={pwSessions} onChange={setPwSessions}>
                    De las sesiones exportadas
                  </Check>
                  <Check checked={pwHops && !!hops?.length} onChange={setPwHops} disabled={!hops?.length}>
                    De vecinos (saltos de Topología){hops ? ` · ${plural(hops.length, "guardado", "guardados")}` : ""}
                  </Check>
                  <Check checked={pwSnmp && inc.settings} onChange={setPwSnmp} disabled={!inc.settings}>
                    De perfiles SNMP {!inc.settings && <span className="text-muted text-[11.5px]">(requiere incluir los ajustes)</span>}
                  </Check>
                </fieldset>
                {askMaster && (
                  <div className="space-y-1">
                    <label htmlFor={`${ids}-master`} className="block text-[11.5px] font-medium text-muted">
                      Contraseña maestra de la bóveda (se verifica de nuevo)
                    </label>
                    <input id={`${ids}-master`} type="password" autoComplete="off" className="field" value={master} onChange={(e) => setMaster(e.target.value)} />
                  </div>
                )}
                <div className="space-y-1">
                  <label htmlFor={`${ids}-confirm`} className="block text-[11.5px] font-medium text-muted">
                    Escribe {CONFIRM_WORD} para aceptar
                  </label>
                  <input
                    id={`${ids}-confirm`}
                    className="field font-mono"
                    autoComplete="off"
                    spellCheck={false}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    aria-invalid={!!confirm && confirm.trim() !== CONFIRM_WORD}
                  />
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </form>
  );
}
