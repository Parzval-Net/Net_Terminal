import { MutableRefObject, useEffect, useRef, useState } from "react";
import { runOnDevice } from "./deviceRun";
import { DeviceInfo, detectDeviceInfo, deviceKey, promptHost, rememberDevice } from "./lifecycle";
import { type buildCatalog, detectPlatform } from "./packs";
import { schemeForVendor } from "./highlight";
import type { Settings } from "./settings";
import type { Session, Tab } from "../types";
import type { TermController } from "../components/TerminalView";

/**
 * Plataforma y ciclo de vida de cada pestaña: lo que se reconoce en pantalla (modelo, versión, fabricante)
 * y la detección con el comando del fabricante. No envía nada al equipo salvo en "detectar ahora".
 */
export function useTabPlatform({
  settings,
  update,
  controllers,
  tabs,
  setTabs,
  activeTab,
  activeCtrl,
  sessions,
  updateSessions,
  catalog,
  toast,
  toastFail,
}: {
  settings: Settings;
  update: (p: Partial<Settings> | ((s: Settings) => Partial<Settings>)) => void;
  controllers: MutableRefObject<Map<string, TermController>>;
  tabs: Tab[];
  setTabs: (f: (ts: Tab[]) => Tab[]) => void;
  activeTab: Tab | undefined;
  activeCtrl: () => TermController | undefined;
  sessions: Session[];
  updateSessions: (changed: Session[]) => Promise<void>;
  catalog: ReturnType<typeof buildCatalog>;
  toast: (text: string, kind?: "info" | "error") => void;
  toastFail: (action: string, e: unknown) => void;
}) {
  const [detecting, setDetecting] = useState(false);
  /** Modelo y versión vistos en cada pestaña (barra de estado: ciclo de vida). */
  const [tabDevice, setTabDevice] = useState<Record<string, DeviceInfo>>({});
  /** Prompt con que se conectó cada pestaña: lo leído tras saltar a otro equipo no se guarda para su host. */
  const tabHome = useRef(new Map<string, string>());

  // Al activar el ciclo de vida se lee lo que ya muestra la pestaña activa (sin esperar otro show version).
  useEffect(() => {
    if (!settings?.lifecycleInfo || !activeTab || activeTab.session.type === "local") return;
    const text = controllers.current.get(activeTab.id)?.recentText(150);
    if (text) noteDevice(activeTab, text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.lifecycleInfo]);

  /** Sin enviar nada: modelo y versión de lo que muestra la pantalla, o lo recordado para el host. */
  const noteDevice = (tab: Tab, text: string) => {
    const here = promptHost(text);
    let home = tabHome.current.get(tab.id);
    if (!home && here) tabHome.current.set(tab.id, (home = here));
    const key = deviceKey(tab.session);
    const info = detectDeviceInfo(text);
    if (info.model || info.version) {
      setTabDevice((m) => {
        const prev = m[tab.id];
        return { ...m, [tab.id]: prev && prev.name === here ? { ...prev, ...info } : { ...info, name: here } };
      });
      if (key && here && here === home) {
        const next = rememberDevice(settings.deviceInfo, key, { ...info, name: here });
        if (next !== settings.deviceInfo) update({ deviceInfo: next });
      }
    } else if (key && !tabDevice[tab.id]) {
      const saved = settings.deviceInfo[key];
      if (saved?.model && (!saved.name || !here || saved.name === here)) setTabDevice((m) => ({ ...m, [tab.id]: saved }));
    }
  };

  /**
   * Fija la plataforma de la pestaña (y de la sesión guardada). Con `vendor`, si la sesión
   * resalta "Según ajustes", la pestaña toma el resaltado de ese fabricante (no se guarda).
   */
  const setTabPlatform = (tabId: string, platform: string | null, vendor?: string) => {
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return;
    const highlight = tab.session.highlight ?? (vendor ? schemeForVendor(vendor) : undefined);
    const session = { ...tab.session, platform: platform ?? undefined, highlight };
    setTabs((ts) => ts.map((t) => (t.id === tabId ? { ...t, session } : t)));
    if (sessions.some((x) => x.id === session.id)) updateSessions([{ ...sessions.find((x) => x.id === session.id)!, platform: session.platform }]);
  };

  const detectPlatformNow = async () => {
    const ctrl = activeCtrl();
    const vendor = catalog.find((v) => v.id === settings.catalogVendor);
    if (!ctrl || !activeTab || !vendor?.detectCommand) return toast("Este fabricante no tiene comando de detección", "error");
    setDetecting(true);
    try {
      const output = await runOnDevice(ctrl.connId(), vendor.detectCommand, 30);
      const found = detectPlatform(vendor, output);
      if (found) {
        setTabPlatform(activeTab.id, found.id, vendor.id);
        toast(`Plataforma detectada: ${found.label}`);
      } else {
        // Puede ser otro fabricante: se prueba con los demás.
        for (const other of catalog.filter((v) => v.id !== vendor.id && v.detectCommand === vendor.detectCommand)) {
          const p = detectPlatform(other, output);
          if (p) {
            update({ catalogVendor: other.id });
            setTabPlatform(activeTab.id, p.id, other.id);
            toast(`Plataforma detectada: ${other.name} ${p.label}`);
            return;
          }
        }
        // Muestra la versión que informó el equipo para que se elija la plataforma más cercana.
        const ver = output.split(/\r?\n/).find((l) => /version/i.test(l))?.trim().slice(0, 80);
        toast(`No se reconoció la plataforma${ver ? ` (${ver})` : ""}; elige la más cercana a mano`, "error");
      }
    } catch (e) {
      toastFail("detectar la plataforma", e);
    } finally {
      setDetecting(false);
    }
  };

  /**
   * Sin enviar nada al equipo: busca en lo que ya muestra la pantalla (un show version,
   * display version o get system status previo) la plataforma de algún fabricante.
   */
  const detectFromScreen = (tabId: string, preferred?: string) => {
    // Las últimas 150 líneas bastan para un show version reciente y caben en los 20.000
    // caracteres que revisa detectPlatform.
    const text = controllers.current.get(tabId)?.recentText(150);
    if (!text) return null;
    const order = [...catalog].sort((a, b) => Number(b.id === preferred) - Number(a.id === preferred));
    for (const v of order) {
      const p = detectPlatform(v, text);
      if (p) return { vendor: v, platform: p };
    }
    return null;
  };

  return { detecting, tabDevice, setTabDevice, tabHome, noteDevice, setTabPlatform, detectPlatformNow, detectFromScreen };
}
