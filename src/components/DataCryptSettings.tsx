import { useEffect, useState } from "react";
import { FileWarning, LockKeyhole, ShieldCheck, Unlock } from "lucide-react";
import { useModal } from "../lib/useModal";
import { masterStrength, strengthText } from "../lib/credentials";
import { datacryptAckDamaged, datacryptDisable, datacryptEnable, datacryptFixPlaintext, datacryptResume, datacryptSetPolicy, datacryptStatus, vaultCreate } from "../lib/api";
import { type DataOp, type DataReport, type DataStatus, ENABLE_WARNINGS, convError, enableCheck, reportText } from "../lib/dataCrypt";
import type { Settings } from "../lib/settings";
import { Item, Switch } from "./controls";
import { LossConfirm, ProgressBar, useConversionProgress } from "./DataGate";

/**
 * Ajustes › Credenciales › Cifrado de la carpeta portable. Opcional, apagado por defecto y solo en la
 * edición portable: cifra en reposo sesiones, ajustes, notas, historial, topología, respaldos, logs y
 * auditoría con la contraseña maestra de la bóveda.
 */
export function DataCryptSettings({ settings, onChange, onVaultChanged }: { settings?: Settings; onChange?: (p: Partial<Settings>) => void; onVaultChanged: () => void }) {
  const [st, setSt] = useState<DataStatus | null>(null);
  const [dialog, setDialog] = useState<"enable" | "disable" | null>(null);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [fixing, setFixing] = useState<DataOp | "fix" | null>(null);
  const [loss, setLoss] = useState<string[]>([]);
  const refresh = () =>
    datacryptStatus()
      .then((s) => setSt(s ? { ...s, damaged: s.damaged ?? [] } : null))
      .catch(() => setSt(null));
  useEffect(() => {
    refresh();
  }, []);
  if (!st) return null;

  const section = (body: React.ReactNode) => (
    <div className="space-y-2 pt-3 border-t border-line">
      <div className="flex items-center gap-2 font-medium">
        <ShieldCheck size={15} className="text-accent" aria-hidden /> Cifrado de la carpeta portable
      </div>
      {body}
    </div>
  );

  if (!st.available && !st.encrypted)
    return section(
      <p className="text-[11.5px] text-muted">
        Solo en la edición portable (carpeta <code>data</code> junto a la app, pensada para pendrive). En la edición instalada los datos viven en tu perfil
        del sistema: para protegerlos usa el cifrado de disco del sistema operativo.
      </p>,
    );

  const done = (r: DataReport, op: DataOp) => {
    setMsg({ text: reportText(r, op) });
    refresh();
    onVaultChanged();
  };
  const fail = (e: unknown) => {
    const ce = convError(e);
    setMsg({ text: ce.message, error: true });
    setLoss(ce.loss);
    refresh();
  };
  const resume = (op: DataOp, accept?: string[]) => {
    setFixing(op);
    datacryptResume(op, accept)
      .then((r) => (setLoss([]), done(r, op)))
      .catch(fail)
      .finally(() => setFixing(null));
  };

  const body = !st.encrypted ? (
    <>
      <p className="text-[11.5px] text-muted">
        Hoy solo las contraseñas van cifradas. Al activarlo, también quedan cifrados en el pendrive las sesiones, los ajustes, las notas, el historial, la
        topología, los respaldos de configuración, los logs de sesión y la auditoría de agentes, con la misma contraseña maestra de la bóveda. Al abrir la
        app se pide la contraseña antes de mostrar nada.
      </p>
      <div className="flex justify-end">
        <button onClick={() => (setMsg(null), setDialog("enable"))} className="flex items-center gap-1.5 px-3 h-7 rounded-md border border-line hover:bg-hover">
          <LockKeyhole size={13} aria-hidden /> Cifrar los datos de esta carpeta…
        </button>
      </div>
    </>
  ) : (
    <>
      <p className="text-[11.5px] flex items-center gap-1">
        Estado:{" "}
        <span className="inline-flex items-center gap-1 font-medium text-ok">
          <LockKeyhole size={12} aria-hidden /> activo
        </span>
        <span className="text-muted">· datos cifrados con la contraseña maestra. Bloquear la bóveda bloquea también los datos.</span>
      </p>
      {settings && onChange && (
        <Item
          label="Detener las grabaciones de log al bloquear"
          hint="Apagado: siguen grabándose cifrados con la llave de su archivo"
        >
          <Switch
            checked={settings.dataLockStopLogs}
            onChange={(v) => {
              onChange({ dataLockStopLogs: v });
              void datacryptSetPolicy(v).catch(() => {});
            }}
          />
        </Item>
      )}
      {st.journal && (
        <div className="rounded-lg border border-warn p-3 space-y-2" role="status">
          <p className="text-[12px]">Hay una conversión a medias ({st.journal === "encrypt" ? "cifrar" : "descifrar"}). Ningún archivo se perdió.</p>
          <div className="flex justify-end gap-2">
            {(["encrypt", "decrypt"] as DataOp[]).map((op) => (
              <button
                key={op}
                disabled={!!fixing}
                onClick={() => resume(op)}
                className="px-3 h-7 rounded-md border border-line hover:bg-hover disabled:opacity-50"
              >
                {op === "encrypt" ? "Terminar de cifrar" : "Dejar en claro"}
              </button>
            ))}
          </div>
          {loss.length > 0 && <LossConfirm loss={loss} busy={!!fixing} onAccept={() => resume("decrypt", loss)} />}
        </div>
      )}
      {st.damaged.length > 0 && (
        <div className="rounded-lg border border-warn p-3 space-y-2" role="status">
          <p className="text-[12px]">
            {st.damaged.length === 1 ? "Un archivo cifrado estaba dañado" : `${st.damaged.length} archivos cifrados estaban dañados`} y se apartaron (siguen cifrados,
            con «.dañado-» en el nombre); la app siguió en archivos nuevos. Al desactivar el cifrado se recupera lo que tenían de íntegro.
          </p>
          <ul className="text-[11.5px] font-mono break-all text-muted">
            {st.damaged.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <div className="flex justify-end">
            <button onClick={() => void datacryptAckDamaged().then(refresh)} className="px-3 h-7 rounded-md border border-line hover:bg-hover">
              Entendido
            </button>
          </div>
        </div>
      )}
      {st.plaintext.length > 0 && (
        <div className="rounded-lg border border-warn p-3 space-y-2">
          <p className="text-[12px] flex items-start gap-1.5">
            <FileWarning size={14} className="text-warn shrink-0 mt-0.5" aria-hidden />
            <span>
              {st.plaintext.length === 1 ? "Hay 1 archivo en claro" : `Hay ${st.plaintext.length} archivos en claro`} dentro de la carpeta cifrada (los dejó una
              versión anterior de la app u otra herramienta). No se leen. Al cifrarlos, uno que choque con su versión cifrada se guarda aparte con
              «.encontrado-» en el nombre: nada se pierde.
            </span>
          </p>
          <details className="text-[11.5px] text-muted">
            <summary className="cursor-default">Ver la lista</summary>
            <ul className="mt-1 font-mono break-all">
              {st.plaintext.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </details>
          <div className="flex justify-end">
            <button
              disabled={!!fixing}
              onClick={() => {
                setFixing("fix");
                datacryptFixPlaintext()
                  .then((r) => done(r, "encrypt"))
                  .catch(fail)
                  .finally(() => setFixing(null));
              }}
              className="px-3 h-7 rounded-md border border-line hover:bg-hover disabled:opacity-50"
            >
              {fixing === "fix" ? "Cifrando…" : "Cifrar estos archivos"}
            </button>
          </div>
        </div>
      )}
      <div className="flex justify-end">
        <button onClick={() => (setMsg(null), setDialog("disable"))} className="flex items-center gap-1.5 px-3 h-7 rounded-md border border-line hover:bg-hover">
          <Unlock size={13} aria-hidden /> Desactivar cifrado…
        </button>
      </div>
    </>
  );

  return (
    <>
      {section(
        <>
          {body}
          {msg && (
            <p role={msg.error ? "alert" : "status"} className={`text-[11.5px] ${msg.error ? "text-danger" : "text-accent"}`}>
              {msg.text}
            </p>
          )}
        </>,
      )}
      {dialog === "enable" && (
        <EnableDialog
          st={st}
          onClose={() => setDialog(null)}
          onDone={(r) => {
            setDialog(null);
            done(r, "encrypt");
          }}
          onFail={(e) => {
            refresh();
            onVaultChanged();
            return String(e);
          }}
        />
      )}
      {dialog === "disable" && (
        <DisableDialog
          onClose={() => setDialog(null)}
          onDone={(r) => {
            setDialog(null);
            done(r, "decrypt");
          }}
        />
      )}
    </>
  );
}

function Field({ label, value, onChange, autoComplete }: { label: string; value: string; onChange: (v: string) => void; autoComplete: string }) {
  return (
    <label className="block">
      <span className="block mb-1 text-[12px] font-medium text-muted">{label}</span>
      <input type="password" className="field" autoComplete={autoComplete} spellCheck={false} maxLength={1024} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/** Activación: advertencias, contraseña maestra (o su creación), confirmación explícita y avance. */
export function EnableDialog({ st, onClose, onDone, onFail }: { st: DataStatus; onClose: () => void; onDone: (r: DataReport) => void; onFail: (e: unknown) => string }) {
  const hasVault = st.vaultExists && st.vaultMaster;
  const [master, setMaster] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ack, setAck] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const p = useConversionProgress(running);
  const close = () => {
    if (running) return;
    setMaster("");
    setConfirm("");
    onClose();
  };
  const modal = useModal({ onClose: running ? undefined : close });
  const check = enableCheck({ hasVault, master, confirm, ack, logsActive: st.logsActive });
  const submit = async () => {
    if (!check.ok || running) return;
    setRunning(true);
    setError("");
    const pw = master;
    setMaster("");
    setConfirm("");
    try {
      if (!hasVault) await vaultCreate(pw);
      onDone(await datacryptEnable(pw));
    } catch (e) {
      setError(onFail(e));
    } finally {
      setRunning(false);
    }
  };
  const s = masterStrength(master);
  return (
    <div {...modal.overlay} className="fixed inset-0 z-50 grid place-items-center bg-black/25 p-4" onMouseDown={close}>
      <form
        {...modal.dialog}
        className="w-[520px] max-w-full max-h-[90vh] overflow-auto bg-panel border border-line rounded-xl shadow-pop p-5 space-y-3"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h2 id={modal.titleId} className="text-[14px] font-semibold">
          Cifrar los datos de esta carpeta
        </h2>
        <ul className="list-disc pl-5 space-y-1 text-[12px] text-muted">
          {ENABLE_WARNINGS.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
        {hasVault ? (
          <Field label="Contraseña maestra de la bóveda" value={master} onChange={setMaster} autoComplete="current-password" />
        ) : (
          <>
            <p className="text-[12px]">Todavía no hay contraseña maestra: créala ahora. Protegerá la bóveda y los datos (usa una frase larga, de 4 o más palabras).</p>
            <Field label="Contraseña maestra nueva" value={master} onChange={setMaster} autoComplete="new-password" />
            {master && <p className="text-[11px] text-muted">{strengthText[s]}</p>}
            <Field label="Confirmar contraseña maestra" value={confirm} onChange={setConfirm} autoComplete="new-password" />
          </>
        )}
        <label className="flex items-start gap-2 text-[12px]">
          <input type="checkbox" className="mt-0.5" checked={ack} onChange={(e) => setAck(e.target.checked)} />
          <span>Entiendo que sin la contraseña maestra no hay forma de recuperar los datos.</span>
        </label>
        {check.reason && <p className="text-[12px] text-danger">{check.reason}</p>}
        {running && <ProgressBar p={p} label="Cifrando" />}
        {error && (
          <p role="alert" className="text-[12px] text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={close} disabled={running} className="px-3.5 h-8 rounded-md border border-line hover:bg-hover disabled:opacity-50">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!check.ok || running}
            className="inline-flex items-center gap-1.5 px-3.5 h-8 rounded-md bg-accent text-accent-fg font-medium hover:opacity-90 disabled:opacity-50"
          >
            <LockKeyhole size={13} aria-hidden /> {running ? "Cifrando…" : "Cifrar"}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Desactivación: advierte que los datos quedan en claro y pide la contraseña. */
function DisableDialog({ onClose, onDone }: { onClose: () => void; onDone: (r: DataReport) => void }) {
  const [master, setMaster] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [loss, setLoss] = useState<string[]>([]);
  const [accepted, setAccepted] = useState<string[] | undefined>(undefined);
  const p = useConversionProgress(running);
  const close = () => {
    if (running) return;
    setMaster("");
    onClose();
  };
  const modal = useModal({ onClose: running ? undefined : close });
  const submit = async () => {
    if (!master || running) return;
    setRunning(true);
    setError("");
    const pw = master;
    setMaster("");
    try {
      onDone(await datacryptDisable(pw, accepted));
    } catch (e) {
      const ce = convError(e);
      setError(ce.message);
      setLoss(ce.loss);
      setAccepted(undefined);
    } finally {
      setRunning(false);
    }
  };
  return (
    <div {...modal.overlay} className="fixed inset-0 z-50 grid place-items-center bg-black/25 p-4" onMouseDown={close}>
      <form
        {...modal.dialog}
        className="w-[460px] max-w-full bg-panel border border-line rounded-xl shadow-pop p-5 space-y-3"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h2 id={modal.titleId} className="text-[14px] font-semibold">
          Desactivar el cifrado de la carpeta
        </h2>
        <p className="text-[12px] text-muted">
          Sesiones, ajustes, notas, historial, topología, respaldos, logs y auditoría quedarán en claro en la carpeta: cualquiera con el pendrive podrá
          leerlos. Antes de tocar nada se verifica que todos los archivos cifrados estén íntegros. Las contraseñas siguen en la bóveda cifrada.
        </p>
        <Field label="Contraseña maestra" value={master} onChange={setMaster} autoComplete="current-password" />
        {loss.length > 0 && !accepted && <LossConfirm loss={loss} busy={running} onAccept={() => setAccepted(loss)} />}
        {accepted && <p className="text-[12px] text-warn">Pérdida aceptada: vuelve a escribir la contraseña y confirma.</p>}
        {running && <ProgressBar p={p} label="Descifrando" />}
        {error && (
          <p role="alert" className="text-[12px] text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" data-autofocus onClick={close} disabled={running} className="px-3.5 h-8 rounded-md border border-line hover:bg-hover disabled:opacity-50">
            Cancelar
          </button>
          <button type="submit" disabled={!master || running} className="px-3.5 h-8 rounded-md bg-danger text-danger-fg font-medium hover:opacity-90 disabled:opacity-50">
            {running ? "Descifrando…" : "Dejar en claro"}
          </button>
        </div>
      </form>
    </div>
  );
}
