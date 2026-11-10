import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CircleAlert, CircleCheck, KeyRound, Lock, ShieldCheck } from "lucide-react";
import { CredStatus, credStatus, masterStrength, needsUnlock, strengthText } from "../lib/credentials";
import { HopCredInfo, lastUsedText } from "../lib/hopCred";
import { VaultUnlock } from "./VaultUnlock";
import { HopPasswordDialog } from "./tools/HopPasswordDialog";
import type { Settings } from "../lib/settings";
import { AUTOLOCK_CHOICES, autolockMinutes } from "../lib/vaultLock";
import { Item, Switch } from "./controls";
import { DataCryptSettings } from "./DataCryptSettings";

const KEYCHAIN = "llavero del sistema operativo";

interface Props {
  /** Ajustes del bloqueo automático (opcionales: sin ellos no se muestra esa sección). */
  settings?: Settings;
  onChange?: (patch: Partial<Settings>) => void;
}

/** Ajustes › Credenciales: estado de la bóveda, contraseña maestra y bloqueo automático. */
export function CredentialSettings({ settings, onChange }: Props = {}) {
  const [st, setSt] = useState<CredStatus | null>(null);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const refresh = () => credStatus().then(setSt).catch((e) => setMsg({ text: String(e), error: true }));
  useEffect(() => {
    refresh();
  }, []);

  const run = async (cmd: string, args: Record<string, unknown>, ok: string) => {
    setMsg(null);
    try {
      await invoke(cmd, args);
      setMsg({ text: ok });
      await refresh();
      return true;
    } catch (e) {
      setMsg({ text: String(e), error: true });
      return false;
    }
  };

  if (!st) return <p className="text-muted">Consultando…</p>;
  const keychain = st.backend === "keychain";

  return (
    <div className="space-y-4">
      <div className="flex gap-3 p-3 rounded-lg border border-line">
        <ShieldCheck size={18} className="text-accent shrink-0 mt-0.5" />
        <div className="space-y-1 text-[12.5px]">
          <p className="font-medium">
            {keychain
              ? `Bóveda cifrada con llave en el ${KEYCHAIN}`
              : `Bóveda cifrada con contraseña maestra${st.portable ? " (modo portable)" : ""}`}
          </p>
          <p className="text-[11.5px] text-muted">
            Las contraseñas de sesión se guardan cifradas (XChaCha20-Poly1305) en <code>credentials.vault</code> dentro de
            la carpeta de datos. Nunca se muestran ni van en logs o respaldos; solo viajan en una exportación si lo pides en el archivo cifrado (.ntx). Se usan solo
            para completar el login al conectar.{" "}
            {keychain
              ? "La llave vive en el llavero del sistema: el archivo copiado a otro equipo no sirve."
              : "La llave se deriva de tu contraseña maestra (Argon2id) y queda en memoria solo mientras la app está abierta y desbloqueada."}
          </p>
          {/* Estado con ícono y color de estado (no el del enlace): verde si está lista, gris si no. */}
          <p className="text-[11.5px] flex items-center gap-1">
            Estado:{" "}
            {st.exists && (keychain || st.unlocked) ? (
              <span className="inline-flex items-center gap-1 font-medium text-ok">
                <CircleCheck size={12} aria-hidden /> {keychain ? "activa" : "desbloqueada"}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 font-medium text-muted">
                {st.exists ? <Lock size={12} aria-hidden /> : <CircleAlert size={12} aria-hidden />} {!st.exists ? "sin bóveda" : "bloqueada"}
              </span>
            )}
          </p>
        </div>
      </div>

      {!keychain && !st.exists && <CreateVault onCreate={(m) => run("vault_create", { master: m }, "Bóveda creada y desbloqueada")} />}

      {!keychain && st.exists && !st.unlocked && (
        <div className="space-y-1.5">
          <Label>Desbloquear</Label>
          <VaultUnlock
            onUnlocked={() => {
              setMsg({ text: "Bóveda desbloqueada" });
              refresh();
            }}
          />
        </div>
      )}

      {!keychain && st.exists && st.unlocked && (
        <>
          <div className="flex items-center justify-between gap-4">
            <span>
              Bloquear ahora
              <span className="block text-[11.5px] text-muted">Borra la llave de memoria. También se bloquea al cerrar la app.</span>
            </span>
            <button
              onClick={() => run("vault_lock", {}, "Bóveda bloqueada")}
              className="flex items-center gap-1.5 px-3 h-7 rounded-md border border-line hover:bg-hover"
            >
              <Lock size={13} /> Bloquear
            </button>
          </div>
          <ChangeMaster onChange={(o, n) => run("vault_change", { old: o, new: n }, "Contraseña maestra cambiada")} />
        </>
      )}

      {settings && onChange && <AutoLock keychain={keychain} exists={st.exists} settings={settings} onChange={onChange} />}

      <DataCryptSettings settings={settings} onChange={onChange} onVaultChanged={refresh} />

      {msg && (
        <p role={msg.error ? "alert" : "status"} className={`text-[11.5px] ${msg.error ? "text-danger" : "text-accent"}`}>
          {msg.text}
        </p>
      )}

      <HopCreds st={st} />

      {st.exists && (
        <div className="pt-3 border-t border-line flex items-center justify-between gap-4">
          <span>
            Restablecer bóveda
            <span className="block text-[11.5px] text-muted">
              Si olvidaste la contraseña maestra o cambiaste de equipo. Borra todas las contraseñas guardadas.
            </span>
          </span>
          {confirmReset ? (
            <div className="flex gap-1.5 shrink-0">
              <button onClick={() => setConfirmReset(false)} className="px-3 h-7 rounded-md border border-line hover:bg-hover">
                Cancelar
              </button>
              <button
                onClick={async () => {
                  setConfirmReset(false);
                  await run("vault_reset", {}, "Bóveda eliminada. Las sesiones piden la contraseña en la terminal.");
                }}
                className="px-3 h-7 rounded-md bg-danger text-danger-fg font-medium hover:opacity-90"
              >
                Borrar todo
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmReset(true)}
              className="px-3 h-7 rounded-md border border-line text-danger hover:bg-hover shrink-0"
            >
              Restablecer bóveda…
            </button>
          )}
        </div>
      )}

      <p className="text-[11.5px] text-muted">
        Recomendación: para SSH prefiere llaves y agente. Guarda contraseñas solo en equipos corporativos con disco cifrado y
        sesión bloqueada al ausentarte. No compartas tu contraseña maestra.
      </p>
    </div>
  );
}

/**
 * Bloqueo automático. Solo aplica con contraseña maestra: con el llavero del sistema la llave se
 * vuelve a leer sola del llavero en cada uso (no hay nada que pedir), así que bloquear la app no
 * agrega protección; lo que la protege es bloquear la sesión del equipo.
 */
function AutoLock({ keychain, exists, settings, onChange }: { keychain: boolean; exists: boolean; settings: Settings; onChange: (p: Partial<Settings>) => void }) {
  if (keychain)
    return (
      <p className="text-[11.5px] text-muted">
        Bloqueo automático: con el llavero del sistema la bóveda se abre con tu sesión del sistema operativo, así que no aplica. Bloquea
        el equipo al ausentarte.
      </p>
    );
  if (!exists) return null;
  const min = autolockMinutes(settings.vaultAutoLockMin);
  const choices = AUTOLOCK_CHOICES.some(([v]) => v === min) ? AUTOLOCK_CHOICES : [...AUTOLOCK_CHOICES, [min, `${min} minutos`] as [number, string]];
  return (
    <div className="space-y-2 pt-3 border-t border-line">
      <Item label="Bloquear tras inactividad" hint="Minutos sin usar la bóveda (autocompletar, guardar o consultar contraseñas)">
        <select className="field !w-auto" aria-label="Bloquear tras inactividad" value={min} onChange={(e) => onChange({ vaultAutoLockMin: Number(e.target.value) })}>
          {choices.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </Item>
      <Item label="Bloquear al suspender el equipo" hint="Se nota al despertar: la app no ve el bloqueo de pantalla sin suspensión">
        <Switch checked={settings.vaultLockOnSleep} onChange={(v) => onChange({ vaultLockOnSleep: v })} />
      </Item>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[11.5px] font-medium text-muted">{children}</div>;
}

function Strength({ pw }: { pw: string }) {
  if (!pw) return null;
  const s = masterStrength(pw);
  const color = ["bg-danger", "bg-warn", "bg-accent", "bg-accent"][s];
  return (
    <div className="flex items-center gap-2 text-[11px] text-muted">
      <div className="flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className={`w-8 h-1 rounded ${i < Math.max(1, s) ? color : "bg-line"}`} />
        ))}
      </div>
      {strengthText[s]}
    </div>
  );
}

export function CreateVault({ onCreate }: { onCreate: (master: string) => Promise<boolean> }) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const ok = a.length >= 8 && a === b;
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (ok && (await onCreate(a))) {
          setA("");
          setB("");
        }
      }}
    >
      <Label>Crear bóveda</Label>
      <p className="text-[11.5px] text-muted">
        Elige una contraseña maestra larga (una frase de 4 o más palabras funciona bien). Si la olvidas, las contraseñas
        guardadas no se pueden recuperar.
      </p>
      <input type="password" aria-label="Contraseña maestra" autoComplete="new-password" className="field" placeholder="Contraseña maestra" value={a} onChange={(e) => setA(e.target.value)} />
      <Strength pw={a} />
      <input type="password" aria-label="Confirmar contraseña maestra" autoComplete="new-password" className="field" placeholder="Confirmar" value={b} onChange={(e) => setB(e.target.value)} />
      {b && a !== b && <p className="text-[11.5px] text-danger">No coinciden</p>}
      <button
        disabled={!ok}
        className="flex items-center gap-1.5 px-3 h-8 rounded-md bg-accent text-accent-fg font-medium hover:opacity-90 disabled:opacity-50"
      >
        <KeyRound size={13} /> Crear bóveda
      </button>
    </form>
  );
}

function ChangeMaster({ onChange }: { onChange: (old: string, next: string) => Promise<boolean> }) {
  const [old, setOld] = useState("");
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const ok = !!old && a.length >= 8 && a === b;
  return (
    <details className="rounded-lg border border-line">
      <summary className="px-3 h-9 flex items-center text-[12.5px] cursor-default">Cambiar contraseña maestra</summary>
      <form
        className="px-3 pb-3 space-y-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (ok && (await onChange(old, a))) {
            setOld("");
            setA("");
            setB("");
          }
        }}
      >
        <input type="password" aria-label="Contraseña maestra actual" autoComplete="current-password" className="field" placeholder="Actual" value={old} onChange={(e) => setOld(e.target.value)} />
        <input type="password" aria-label="Contraseña maestra nueva" autoComplete="new-password" className="field" placeholder="Nueva" value={a} onChange={(e) => setA(e.target.value)} />
        <Strength pw={a} />
        <input type="password" aria-label="Confirmar contraseña maestra nueva" autoComplete="new-password" className="field" placeholder="Confirmar nueva" value={b} onChange={(e) => setB(e.target.value)} />
        {b && a !== b && <p className="text-[11.5px] text-danger">No coinciden</p>}
        <button disabled={!ok} className="px-3 h-8 rounded-md border border-line hover:bg-hover disabled:opacity-50">
          Cambiar
        </button>
      </form>
    </details>
  );
}

/**
 * Vecinos (saltos): contraseñas de equipos a los que Topología salta desde otro equipo, una por IP y
 * usuario, en la misma bóveda. Se listan sin la contraseña; se reemplazan o se agregan desde un campo
 * oculto y se eliminan con confirmación.
 */
function HopCreds({ st }: { st: CredStatus }) {
  const [list, setList] = useState<HopCredInfo[] | null>(null);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState<{ ip?: string; user?: string; edit?: boolean } | null>(null);
  const [confirm, setConfirm] = useState<HopCredInfo | null>(null);
  const locked = needsUnlock(st);
  const refresh = () => {
    if (locked) {
      setList(null);
      return;
    }
    invoke<HopCredInfo[]>("hop_cred_list")
      .then((l) => {
        setList(l);
        setError("");
      })
      .catch((e) => setError(String(e)));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(refresh, [locked, st.exists, st.unlocked]);

  const canAdd = st.backend === "keychain" || st.exists;
  return (
    <div className="space-y-2 pt-3 border-t border-line">
      <div className="flex items-center justify-between gap-3">
        <span>
          Vecinos (saltos)
          <span className="block text-[11.5px] text-muted">
            Contraseñas de equipos a los que Topología salta desde otro, por IP y usuario. Se escriben solas, una vez por salto, cuando el equipo
            pide la contraseña. Nunca se muestran.
          </span>
        </span>
        <button
          disabled={locked || !canAdd}
          onClick={() => setDialog({})}
          title={locked ? "Desbloquea la bóveda" : !canAdd ? "Crea la bóveda primero" : "Guardar la contraseña de un vecino"}
          className="px-3 h-7 rounded-md border border-line hover:bg-hover disabled:opacity-50 shrink-0"
        >
          Agregar…
        </button>
      </div>
      {locked ? (
        <p className="text-[11.5px] text-muted">La bóveda está bloqueada: desbloquéala arriba para ver y editar esta lista.</p>
      ) : error ? (
        <p className="text-[11.5px] text-danger">{error}</p>
      ) : list && list.length ? (
        <ul className="rounded-lg border border-line divide-y divide-[var(--border)]">
          {list.map((h) => (
            <li key={`${h.ip}|${h.user}`} className="flex items-center gap-3 px-3 py-1.5 text-[12px]">
              <span className="font-mono">{h.ip}</span>
              <span>{h.user}</span>
              <span className="text-muted text-[11.5px]">último uso: {lastUsedText(h.last_used)}</span>
              <span className="ml-auto flex items-center gap-1.5">
                {confirm?.ip === h.ip && confirm.user === h.user ? (
                  <>
                    <span className="text-[11.5px]">¿Eliminar?</span>
                    <button onClick={() => setConfirm(null)} className="px-2 h-6 rounded-md border border-line hover:bg-hover">
                      No
                    </button>
                    <button
                      onClick={() =>
                        invoke("hop_cred_delete", { ip: h.ip, user: h.user })
                          .then(() => (setConfirm(null), refresh()))
                          .catch((e) => (setConfirm(null), setError(String(e))))
                      }
                      className="px-2 h-6 rounded-md bg-danger text-danger-fg font-medium hover:opacity-90"
                    >
                      Eliminar
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => setDialog({ ip: h.ip, user: h.user, edit: true })} aria-label={`Editar la contraseña de ${h.user} en ${h.ip}`} className="px-2 h-6 rounded-md border border-line hover:bg-hover">
                      Editar…
                    </button>
                    <button onClick={() => setConfirm(h)} aria-label={`Eliminar la contraseña de ${h.user} en ${h.ip}`} className="px-2 h-6 rounded-md border border-line text-danger hover:bg-hover">
                      Eliminar…
                    </button>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11.5px] text-muted">No hay contraseñas de vecinos guardadas.</p>
      )}
      {dialog && (
        <HopPasswordDialog
          title={dialog.edit ? "Reemplazar la contraseña del vecino" : "Agregar la contraseña de un vecino"}
          ip={dialog.ip}
          user={dialog.user}
          editable={!dialog.edit}
          note={dialog.edit ? "La contraseña nueva reemplaza a la guardada." : "Se guarda para esa IP y ese usuario. Máximo 100 vecinos."}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
