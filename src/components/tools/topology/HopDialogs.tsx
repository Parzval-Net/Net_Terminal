import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { invoke } from "@tauri-apps/api/core";
import { afterEcho, classifyHopScreen } from "../../../lib/hopTab";
import { ConfirmDialog } from "../../ConfirmDialog";
import type { TerminalRef } from "../FileManager";
import { HopPasswordDialog } from "../HopPasswordDialog";
import { CredAlert, HopCards, HopView, SaveOffer } from "../TopoConnect";
import type { KeyAsk } from "./topoTypes";

/**
 * Avance de los saltos, avisos de contraseñas rechazadas, oferta de guardar las que tecleó el usuario
 * y los diálogos de llave de host y de contraseña. Va dentro de la barra de la herramienta.
 */
export function HopDialogs({
  visible,
  hopViews,
  setHopViews,
  credAlerts,
  setCredAlerts,
  saveOffers,
  setSaveOffers,
  keyAsks,
  setKeyAsks,
  pwDialog,
  setPwDialog,
  liveRef,
  onFocusTab,
  discoverFromTab,
  blockWhy,
  setMsg,
  refreshCreds,
}: {
  visible: boolean;
  hopViews: HopView[];
  setHopViews: Dispatch<SetStateAction<HopView[]>>;
  credAlerts: CredAlert[];
  setCredAlerts: Dispatch<SetStateAction<CredAlert[]>>;
  saveOffers: SaveOffer[];
  setSaveOffers: Dispatch<SetStateAction<SaveOffer[]>>;
  keyAsks: KeyAsk[];
  setKeyAsks: Dispatch<SetStateAction<KeyAsk[]>>;
  pwDialog: SaveOffer | null;
  setPwDialog: Dispatch<SetStateAction<SaveOffer | null>>;
  /** Pestañas vigentes de este render (la pantalla pudo cambiar mientras se decidía). */
  liveRef: MutableRefObject<{ terminals: TerminalRef[] }>;
  onFocusTab: (tabId: string) => void;
  discoverFromTab: (tabId: string) => void;
  blockWhy: (tabId?: string) => string | undefined;
  setMsg: (m: string) => void;
  refreshCreds: () => void;
}) {
  return (
    <>
      <HopCards
        views={hopViews}
        alerts={credAlerts}
        offers={saveOffers}
        onView={(tabId) => onFocusTab(tabId)}
        onDiscover={discoverFromTab}
        discoverWhy={blockWhy}
        onDismiss={(tabId) => setHopViews((vs) => vs.filter((v) => v.tabId !== tabId))}
        onUpdate={(a) => setPwDialog({ to: a.to, ip: a.ip, user: a.user, update: true })}
        onAlertDone={(a) => setCredAlerts((l) => l.filter((x) => x !== a))}
        onOffer={(o) => setPwDialog(o)}
        onOfferDone={(o) => setSaveOffers((l) => l.filter((x) => x !== o))}
      />
      {visible && keyAsks[0] && (
        <ConfirmDialog
          title={keyAsks[0].title}
          message={keyAsks.length > 1 ? `${keyAsks[0].message}\n\nDespués: ${keyAsks.length - 1} pregunta${keyAsks.length > 2 ? "s" : ""} más de otros saltos.` : keyAsks[0].message}
          confirmLabel="Aceptar y continuar"
          defaultCancel
          onCancel={() => setKeyAsks((l) => l.slice(1))}
          onConfirm={() => {
            const k = keyAsks[0];
            setKeyAsks((l) => l.slice(1));
            // La pantalla pudo cambiar mientras se decidía: solo se contesta si la pregunta sigue ahí.
            const cur = liveRef.current.terminals.find((x) => x.connId === k.conn);
            const s = classifyHopScreen(afterEcho(cur?.screen?.(30) ?? "", k.cmd));
            if (s.kind === "hostkey") invoke("write", { id: k.conn, data: `${s.answer}\r` }).catch((e) => setMsg(String(e)));
          }}
        />
      )}
      {pwDialog && (
        <HopPasswordDialog
          title={pwDialog.update ? `Actualizar la contraseña de ${pwDialog.to}` : `Guardar la contraseña de ${pwDialog.to}`}
          ip={pwDialog.ip}
          user={pwDialog.user}
          note={`${pwDialog.user}@${pwDialog.ip}. Escríbela aquí (no se lee de la terminal): se cifra en la bóveda y se usará sola, una vez por salto, cuando ${pwDialog.to} la pida.`}
          onClose={() => setPwDialog(null)}
          onSaved={() => {
            const d = pwDialog;
            setSaveOffers((l) => l.filter((o) => !(o.ip === d.ip && o.user === d.user)));
            setCredAlerts((l) => l.filter((x) => !(x.ip === d.ip && x.user === d.user)));
            setPwDialog(null);
            setMsg(`Contraseña de ${d.user}@${d.ip} guardada en la bóveda.`);
            refreshCreds();
          }}
        />
      )}
    </>
  );
}
