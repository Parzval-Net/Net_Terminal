import { type ReactNode, useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { CircleAlert, LockKeyhole, RotateCcw, ShieldCheck } from "lucide-react";
import { useModal } from "../lib/useModal";
import { dataTouch, dataUnlock, datacryptResume, datacryptStatus } from "../lib/api";
import { type DataOp, type DataProgress, type DataStatus, PLAIN_STATUS, convError, gateView, progressRatio, progressText, reportText, throttle } from "../lib/dataCrypt";

/**
 * Puerta del modo portable cifrado. Con la carpeta cifrada la app no se monta (no lee sesiones,
 * ajustes ni nada) hasta desbloquear. Si se bloquea después (a mano, por inactividad o al suspender),
 * la app queda montada pero oculta e inerte bajo la pantalla de desbloqueo: las conexiones y los logs
 * en curso siguen, y nada de lo que muestran se ve.
 */
export function DataGate({ children }: { children: ReactNode }) {
  const [st, setSt] = useState<DataStatus | null>(null);
  const [mounted, setMounted] = useState(false);
  const refresh = useCallback(
    () =>
      datacryptStatus()
        .then((s) => setSt(s ?? PLAIN_STATUS))
        // Sin backend (navegador de desarrollo) o una versión que no lo tiene: carpeta en claro.
        .catch(() => setSt(PLAIN_STATUS)),
    [],
  );
  useEffect(() => {
    refresh();
    const subs = [listen("data-locked", refresh), listen("creds-changed", refresh)];
    return () => subs.forEach((u) => u.then((f) => f()).catch(() => {}));
  }, [refresh]);

  const view = gateView(st);
  useEffect(() => {
    if (view === "app") setMounted(true);
  }, [view]);

  // Con la carpeta cifrada y abierta, usar la app (teclado o ratón) cuenta para el bloqueo por inactividad.
  const active = !!st?.encrypted && st.unlocked;
  useEffect(() => {
    if (!active) return;
    const ping = throttle(() => void dataTouch().catch(() => {}));
    const opts = { capture: true, passive: true } as const;
    window.addEventListener("keydown", ping, opts);
    window.addEventListener("pointerdown", ping, opts);
    return () => {
      window.removeEventListener("keydown", ping, opts);
      window.removeEventListener("pointerdown", ping, opts);
    };
  }, [active]);

  const screen =
    view === "unlock" ? (
      <UnlockScreen st={st!} onDone={refresh} overlay={mounted} />
    ) : view === "resume" ? (
      <ResumeScreen op={st!.journal!} onDone={refresh} />
    ) : view === "error" ? (
      <ErrorScreen message={st!.error!} dataDir={st!.dataDir} />
    ) : null;

  if (!mounted) return screen;
  const hidden = view !== "app";
  return (
    <>
      {/* Oculta e inerte mientras está bloqueada: sin foco, sin lectores de pantalla y sin verse. */}
      <div style={{ display: "contents", visibility: hidden ? "hidden" : undefined }} inert={hidden} aria-hidden={hidden || undefined}>
        {children}
      </div>
      {screen}
    </>
  );
}

function Shell({ children, labelledBy }: { children: ReactNode; labelledBy?: string }) {
  return (
    <div className="fixed inset-0 z-[1000] grid place-items-center bg-bg p-4" data-datagate>
      <div aria-labelledby={labelledBy} className="w-[420px] max-w-full bg-panel border border-line rounded-xl shadow-pop p-6 space-y-4">
        {children}
      </div>
    </div>
  );
}

/** Pantalla de desbloqueo: lo primero que se ve al abrir una carpeta cifrada y lo que tapa la app al bloquear. */
export function UnlockScreen({ st, onDone, overlay }: { st: DataStatus; onDone: () => void; overlay?: boolean }) {
  const [master, setMaster] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  // Sin onClose: Esc no cierra (no hay nada detrás que mostrar sin la contraseña).
  const modal = useModal({});
  const submit = async () => {
    if (!master || busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await dataUnlock(master);
      setMaster("");
      if (r.vaultExists && !r.vault) setNote("Los datos se abrieron, pero la bóveda de contraseñas no: desbloquéala en Ajustes › Credenciales.");
      onDone();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div {...modal.overlay} className="fixed inset-0 z-[1000] grid place-items-center bg-bg p-4" data-datagate>
      <form
        {...modal.dialog}
        className="w-[420px] max-w-full bg-panel border border-line rounded-xl shadow-pop p-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="flex items-center gap-2.5">
          <LockKeyhole size={20} className="text-accent shrink-0" aria-hidden />
          <h1 id={modal.titleId} className="text-[15px] font-semibold">
            {overlay ? "NetTerminal está bloqueado" : "Datos cifrados"}
          </h1>
        </div>
        <p className="text-[12.5px] text-muted">
          {overlay
            ? "Las sesiones abiertas siguen conectadas en segundo plano. Ingresa la contraseña maestra para volver a verlas."
            : "Esta carpeta portable está cifrada. Ingresa la contraseña maestra para abrir sesiones, ajustes, notas y logs."}
        </p>
        <label className="block">
          <span className="block mb-1 text-[12px] font-medium text-muted">Contraseña maestra</span>
          <input
            type="password"
            className="field"
            autoFocus
            autoComplete="off"
            spellCheck={false}
            maxLength={1024}
            value={master}
            onChange={(e) => setMaster(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="text-[12px] text-danger">
            {error}
          </p>
        )}
        {note && (
          <p role="status" className="text-[12px] text-warn">
            {note}
          </p>
        )}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!master || busy}
            className="inline-flex items-center gap-1.5 px-3.5 h-8 rounded-md bg-accent text-accent-fg font-medium hover:opacity-90 disabled:opacity-50"
          >
            <LockKeyhole size={13} aria-hidden />
            {busy ? "Verificando…" : "Desbloquear"}
          </button>
        </div>
        <details className="text-[12px] text-muted">
          <summary className="cursor-default">¿Olvidaste la contraseña?</summary>
          <p className="mt-1.5">
            No hay forma de recuperarla ni de abrir los datos sin ella. Para empezar de cero, cierra NetTerminal y mueve o renombra la carpeta de
            datos{st.dataDir ? ` (${st.dataDir})` : ""}; la app creará una nueva vacía.
          </p>
        </details>
      </form>
    </div>
  );
}

/** Escucha el avance de una conversión (evento `datacrypt-progress`). */
export function useConversionProgress(active: boolean) {
  const [p, setP] = useState<DataProgress | null>(null);
  useEffect(() => {
    if (!active) {
      setP(null);
      return;
    }
    const sub = listen<DataProgress>("datacrypt-progress", (e) => setP(e.payload));
    return () => void sub.then((f) => f()).catch(() => {});
  }, [active]);
  return p;
}

export function ProgressBar({ p, label }: { p: DataProgress | null; label: string }) {
  const pct = Math.round(progressRatio(p) * 100);
  return (
    <div className="space-y-1">
      <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-1.5 rounded bg-line overflow-hidden">
        <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[11.5px] text-muted" aria-live="polite">
        {progressText(p)}
      </p>
    </div>
  );
}

/** Conversión interrumpida (corte de energía, pendrive extraído): continuar o revertir antes de abrir la app. */
function ResumeScreen({ op, onDone }: { op: DataOp; onDone: () => void }) {
  const [running, setRunning] = useState<DataOp | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [loss, setLoss] = useState<string[]>([]);
  const p = useConversionProgress(!!running);
  const modal = useModal({});
  const run = async (which: DataOp, accept?: string[]) => {
    setRunning(which);
    setError("");
    try {
      const r = await datacryptResume(which, accept);
      setLoss([]);
      setDone(reportText(r, which));
      onDone();
    } catch (e) {
      const ce = convError(e);
      setError(ce.message);
      setLoss(ce.loss);
    } finally {
      setRunning(null);
    }
  };
  const encrypting = op === "encrypt";
  return (
    <div {...modal.overlay} className="fixed inset-0 z-[1000] grid place-items-center bg-bg p-4" data-datagate>
      <div {...modal.dialog} className="w-[460px] max-w-full bg-panel border border-line rounded-xl shadow-pop p-6 space-y-4">
        <div className="flex items-center gap-2.5">
          <RotateCcw size={20} className="text-warn shrink-0" aria-hidden />
          <h1 id={modal.titleId} className="text-[15px] font-semibold">
            Conversión interrumpida
          </h1>
        </div>
        <p className="text-[12.5px] text-muted">
          {encrypting
            ? "El cifrado de la carpeta no terminó (por ejemplo, la app se cerró o se desconectó el pendrive). Ningún archivo se perdió: cada original se borra solo después de verificar su copia."
            : "El descifrado de la carpeta no terminó. Ningún archivo se perdió: cada copia se verifica antes de borrar la anterior."}{" "}
          Elige cómo seguir antes de abrir la app.
        </p>
        {running && <ProgressBar p={p} label={running === "encrypt" ? "Cifrando" : "Descifrando"} />}
        {error && (
          <p role="alert" className="text-[12px] text-danger">
            {error}
          </p>
        )}
        {loss.length > 0 && <LossConfirm loss={loss} busy={!!running} onAccept={() => void run("decrypt", loss)} />}
        {done && (
          <p role="status" className="text-[12px] text-ok">
            {done}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            disabled={!!running}
            onClick={() => void run(encrypting ? "decrypt" : "encrypt")}
            className="px-3.5 h-8 rounded-md border border-line hover:bg-hover disabled:opacity-50"
          >
            {encrypting ? "Revertir (dejar en claro)" : "Revertir (volver a cifrar)"}
          </button>
          <button
            type="button"
            data-autofocus
            disabled={!!running}
            onClick={() => void run(op)}
            className="px-3.5 h-8 rounded-md bg-accent text-accent-fg font-medium hover:opacity-90 disabled:opacity-50"
          >
            {encrypting ? "Terminar de cifrar" : "Terminar de descifrar"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Lo que se perdería al dejar la carpeta en claro (una carpeta de logs que no está, archivos cifrados
 * fuera de lo que se convierte): se muestra la lista y solo se sigue con una confirmación explícita.
 */
export function LossConfirm({ loss, busy, onAccept }: { loss: string[]; busy: boolean; onAccept: () => void }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="rounded-lg border border-danger p-3 space-y-2">
      <p className="text-[12px]">Sin la llave estos archivos no se podrán abrir nunca más:</p>
      <ul className="text-[11.5px] font-mono break-all max-h-32 overflow-auto">
        {loss.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <label className="flex items-start gap-2 text-[12px]">
        <input type="checkbox" className="mt-0.5" checked={ok} onChange={(e) => setOk(e.target.checked)} />
        <span>Acepto perder estos archivos y dejar el resto en claro.</span>
      </label>
      <div className="flex justify-end">
        <button type="button" disabled={!ok || busy} onClick={onAccept} className="px-3 h-7 rounded-md bg-danger text-danger-fg font-medium hover:opacity-90 disabled:opacity-50">
          Continuar de todas formas
        </button>
      </div>
    </div>
  );
}

/** La carpeta no se puede abrir (llave dañada, ausente o de otra versión, u otra ventana la tiene abierta). */
function ErrorScreen({ message, dataDir }: { message: string; dataDir: string }) {
  const modal = useModal({});
  return (
    <Shell>
      <div {...modal.overlay} className="contents">
        <div {...modal.dialog} className="space-y-3">
          <div className="flex items-center gap-2.5">
            <CircleAlert size={20} className="text-danger shrink-0" aria-hidden />
            <h1 id={modal.titleId} className="text-[15px] font-semibold">
              No se puede abrir la carpeta cifrada
            </h1>
          </div>
          <p role="alert" className="text-[12.5px]">
            {message}
          </p>
          <p className="text-[12px] text-muted">No se leyó ni se modificó ningún archivo{dataDir ? ` en ${dataDir}` : ""}.</p>
          <p className="text-[12px] text-muted inline-flex items-center gap-1.5">
            <ShieldCheck size={13} aria-hidden /> Los datos siguen cifrados.
          </p>
        </div>
      </div>
    </Shell>
  );
}
