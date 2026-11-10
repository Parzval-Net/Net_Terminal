import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { updateCheck, updateInstall } from "./api";
import type { Settings, UpdateInfo } from "./settings";
import type { TabState } from "../types";

/**
 * Actualizaciones: el latest.json firmado del repositorio de la app, al abrir y cada 6 h.
 * Lo que se anuncia es lo que se instala, y siempre con confirmación.
 */
export function useUpdater({
  dismissed,
  states,
  setConfirm,
  toastFail,
}: {
  /** Versión que el usuario eligió omitir. */
  dismissed: Settings["updateDismissed"];
  states: Record<string, TabState>;
  setConfirm: (c: { title: string; message: string; label: string; action: () => void }) => void;
  toastFail: (action: string, e: unknown) => void;
}) {
  const [update_, setUpdate] = useState<UpdateInfo | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [installing, setInstalling] = useState<number | null>(null);
  const dismissedRef = useRef(dismissed);
  dismissedRef.current = dismissed;
  useEffect(() => {
    const check = () =>
      updateCheck()
        .then((u) => {
          if (u.newer && u.latest !== dismissedRef.current) setUpdate(u);
        })
        .catch(() => {});
    // Unos segundos después de abrir, para no competir con el arranque.
    const first = window.setTimeout(check, 4000);
    const every = window.setInterval(check, 6 * 3600 * 1000);
    // "Buscar ahora" en Ajustes muestra el aviso al instante.
    const onFound = (e: Event) => setUpdate((e as CustomEvent<UpdateInfo>).detail);
    window.addEventListener("nt-update-found", onFound);
    const un = listen<{ downloaded: number; total: number | null }>("update-progress", ({ payload }) =>
      setInstalling(payload.total ? Math.round((payload.downloaded / payload.total) * 100) : 0),
    );
    return () => {
      window.clearTimeout(first);
      window.clearInterval(every);
      window.removeEventListener("nt-update-found", onFound);
      un.then((f) => f());
    };
  }, []);
  const installUpdate = () => {
    const run = () => {
      setInstalling(0);
      updateInstall().catch((e) => {
        setInstalling(null);
        toastFail("instalar la actualización", e);
      });
    };
    const open = Object.values(states).filter((x) => x.status === "connected").length;
    if (open)
      setConfirm({
        title: "¿Actualizar y reiniciar?",
        message: `Se cerrarán ${open} ${open === 1 ? "sesión abierta" : "sesiones abiertas"}. Las sesiones guardadas, notas y ajustes se conservan.`,
        label: "Actualizar y reiniciar",
        action: run,
      });
    else run();
  };
  return { update_, setUpdate, showNotes, setShowNotes, installing, installUpdate };
}
