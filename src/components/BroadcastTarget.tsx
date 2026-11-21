import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Radio, Send } from "lucide-react";
import {
  TargetMode,
  openFolders,
  resolveTargets,
  setBroadcastTarget,
  targetLabel,
  useBroadcastTarget,
  useWorkspace,
} from "../lib/broadcast";

/** Posición fija del selector: hacia arriba desde la barra de estado o hacia abajo desde el banner. */
type PopPos = { right: number; bottom?: number; top?: number };

/**
 * Destino de envío resuelto: si es múltiple, cuántos equipos conectados lo reciben y cuáles
 * (para marcar los paneles destino). Con "Pestaña actual" no calcula nada.
 */
export function useBroadcastTargets() {
  const target = useBroadcastTarget();
  const ws = useWorkspace();
  return useMemo(() => {
    if (target.mode === "current") return { multi: false, ids: [] as string[], count: 0, label: "Pestaña actual" };
    const r = resolveTargets(
      target,
      ws.tabs.map((t) => ({ id: t.id, session: t.session, title: t.title, readOnly: t.readOnly })),
      (id) => ws.tabs.find((t) => t.id === id)?.status,
      ws.activeId,
      ws.panes,
    );
    const ids = r.targets.map((t) => t.id);
    return { multi: true, ids, count: ids.length, label: targetLabel(target, ws) };
  }, [target, ws]);
}

/** "1 equipo" / "4 equipos". */
export const devicesText = (n: number) => `${n} ${n === 1 ? "equipo" : "equipos"}`;

/** Relleno tenue de aviso: el texto queda en --text (contraste pleno) y el borde y el ícono en --warn. */
const WARN_TINT = "bg-[color-mix(in_srgb,var(--warn)_14%,transparent)]";

/**
 * Selector flotante con las opciones de destino. Se cierra con clic fuera o Esc (y devuelve el
 * foco al botón que lo abrió); al abrir, el foco entra a la opción elegida. No es modal: Tab sale.
 */
function TargetPopover({ pos, anchor, onClose }: { pos: PopPos; anchor: React.RefObject<HTMLButtonElement | null>; onClose: () => void }) {
  const popRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!popRef.current?.contains(t) && !anchor.current?.contains(t)) onClose();
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      onClose();
      anchor.current?.focus();
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [anchor, onClose]);
  useEffect(() => {
    // La opción marcada (una lista de selectores con coma devuelve la primera en el documento,
    // no la marcada: el foco caía en "Pestaña actual" y Espacio apagaba la difusión).
    const pop = popRef.current;
    (pop?.querySelector<HTMLElement>('input[name="bc-mode"]:checked') ?? pop?.querySelector<HTMLElement>("input:not(:disabled)"))?.focus();
  }, []);
  return (
    <div
      ref={popRef}
      className="fixed z-40 w-72 bg-panel border border-line rounded-lg shadow-pop p-1.5 text-fg"
      style={pos}
      role="dialog"
      aria-label="Destino del envío"
    >
      <TargetOptions />
      <p className="px-2 pt-1.5 pb-0.5 text-[11px] text-muted leading-snug border-t border-line mt-1">
        Antes de enviar se confirma la lista de equipos. Se omiten terminales locales y pestañas desconectadas. Los scripts
        usan este destino al lanzarse; "Escribir" va solo a la pestaña actual.
      </p>
    </div>
  );
}

/** Estado de apertura del selector anclado a un botón (abre arriba o abajo del botón). */
function usePopover(direction: "up" | "down") {
  const [pos, setPos] = useState<PopPos | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setPos(null), []);
  const toggle = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      const right = Math.max(8, window.innerWidth - r.right);
      setPos((o) => (o ? null : direction === "up" ? { right, bottom: window.innerHeight - r.top + 6 } : { right, top: r.bottom + 6 }));
    },
    [direction],
  );
  return { pos, btnRef, close, toggle };
}

/**
 * Selector de destino para Notas, catálogo y botones: pestaña actual (por defecto),
 * pestañas elegidas, una carpeta de sesiones o los paneles visibles. Con destino múltiple
 * se vuelve un chip de aviso con el número de equipos (como el aviso Broadcast de SecureCRT).
 */
export const BroadcastTargetPicker = memo(function BroadcastTargetPicker() {
  const { multi, count, label } = useBroadcastTargets();
  // Posición fija (sobre el botón): la barra de botones recorta lo que se sale de ella.
  const { pos, btnRef, close, toggle } = usePopover("up");

  return (
    <div className="relative shrink-0">
      <button
        ref={btnRef}
        onClick={toggle}
        title={`Enviar a: ${multi ? `${label} (${devicesText(count)} conectados)` : "pestaña actual"}\nElegir a qué sesiones se envía lo de Notas, catálogo, botones y scripts`}
        aria-haspopup="dialog"
        aria-expanded={!!pos}
        aria-label={multi ? `Difusión activa: ${label}, ${devicesText(count)} conectados. Cambiar destino` : "Enviar a: pestaña actual. Cambiar destino"}
        className={`flex items-center gap-1 px-2 h-6 rounded-md text-[11.5px] border ${
          multi ? `border-warn text-fg font-medium ${WARN_TINT} hover:bg-hover` : "border-transparent text-muted hover:text-fg hover:bg-hover"
        }`}
      >
        {/* Ícono propio también con la barra angosta: sin él quedaba "Actual" sin contexto. */}
        {multi ? <Radio size={12} aria-hidden className="shrink-0 text-warn" /> : <Send size={12} aria-hidden className="shrink-0" />}
        {multi ? (
          <>
            <span className="hidden @[36rem]:inline shrink-0">Difusión:</span>
            <span className="tabular-nums whitespace-nowrap">
              {count}
              <span className="hidden @[36rem]:inline"> {count === 1 ? "equipo" : "equipos"}</span>
            </span>
          </>
        ) : (
          <>
            <span className="hidden @[36rem]:inline shrink-0">Enviar a:</span>
            <span className="max-w-[90px] @[52rem]:max-w-[140px] truncate">
              {/* Barra angosta: "Actual" deja lugar al resto del estado. */}
              <span className="@[52rem]:hidden">Actual</span>
              <span className="hidden @[52rem]:inline">Pestaña actual</span>
            </span>
          </>
        )}
        <ChevronDown size={12} aria-hidden className="shrink-0" />
      </button>
      {pos && <TargetPopover pos={pos} anchor={btnRef} onClose={close} />}
    </div>
  );
});

/**
 * Banner de difusión sobre la terminal, solo con destino múltiple: dice a cuántos equipos va lo
 * que se envíe desde Notas, catálogo, botones y scripts, con [Cambiar] y [Desactivar] a la mano.
 * El modo con riesgo queda dentro del campo visual de quien escribe (Nielsen #1 y #5).
 */
export const BroadcastBanner = memo(function BroadcastBanner() {
  const { multi, count, label } = useBroadcastTargets();
  const { pos, btnRef, close, toggle } = usePopover("down");
  if (!multi) return null;
  return (
    <div className={`shrink-0 flex items-center gap-2 px-3 h-8 border-b border-warn text-[12px] text-fg ${WARN_TINT}`}>
      <Radio size={13} aria-hidden className="shrink-0 text-warn" />
      <span role="status" className="flex items-center gap-1 min-w-0">
        <span className="font-semibold shrink-0">Difusión activa:</span>
        <span className="truncate">
          los envíos de Notas, catálogo, botones y scripts van a{" "}
          <span className="font-medium tabular-nums">{devicesText(count)}</span>
          <span className="text-muted"> ({label})</span>
        </span>
      </span>
      <span className="flex-1" />
      <button
        ref={btnRef}
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={!!pos}
        title="Elegir otro destino de envío"
        className="shrink-0 h-6 px-2 rounded-md border border-line bg-panel hover:bg-hover"
      >
        Cambiar
      </button>
      <button
        onClick={() => {
          close();
          setBroadcastTarget({ mode: "current" });
        }}
        title="Volver a enviar solo a la pestaña actual"
        className="shrink-0 h-6 px-2 rounded-md border border-line bg-panel hover:bg-hover"
      >
        Desactivar
      </button>
      {pos && <TargetPopover pos={pos} anchor={btnRef} onClose={close} />}
    </div>
  );
});

/**
 * Opciones de destino (pestaña actual, pestañas elegidas, carpeta, paneles). Las usan el
 * selector de la barra y el diálogo para lanzar scripts: el destino es uno solo para toda
 * la app.
 */
export function TargetOptions() {
  const target = useBroadcastTarget();
  const ws = useWorkspace();
  const folders = useMemo(() => openFolders(ws), [ws]);
  const remote = ws.tabs.filter((t) => t.session.type !== "local");
  const option = (mode: TargetMode, label: string, disabled = false, hint?: string) => (
    <label className={`flex items-center gap-2 px-2 h-7 rounded-md text-[12px] ${disabled ? "opacity-40" : "hover:bg-hover"}`} title={hint}>
      <input
        type="radio"
        name="bc-mode"
        className="accent-[var(--accent)]"
        checked={target.mode === mode}
        disabled={disabled}
        onChange={() => setBroadcastTarget({ mode })}
      />
      {label}
    </label>
  );
  return (
    <>
      {option("current", "Pestaña actual")}
      {option("tabs", "Pestañas elegidas", remote.length === 0)}
      {target.mode === "tabs" && (
        <div className="ml-6 mb-1 max-h-40 overflow-y-auto">
          {remote.map((t) => (
            <label key={t.id} className="flex items-center gap-2 px-1 min-h-6 text-[12px] hover:bg-hover rounded">
              <input
                type="checkbox"
                className="accent-[var(--accent)]"
                checked={target.tabIds.includes(t.id)}
                onChange={(e) =>
                  setBroadcastTarget({
                    tabIds: e.target.checked ? [...target.tabIds, t.id] : target.tabIds.filter((x) => x !== t.id),
                  })
                }
              />
              <span className="truncate flex-1">{t.title}</span>
              {t.status !== "connected" && <span className="text-[11px] text-muted">desconectada</span>}
            </label>
          ))}
        </div>
      )}
      {option("folder", "Todas las de una carpeta", folders.length === 0)}
      {target.mode === "folder" && (
        <select
          className="field !h-7 !text-[12px] ml-6 mb-1 !w-[calc(100%-1.5rem)]"
          value={target.folder}
          onChange={(e) => setBroadcastTarget({ folder: e.target.value })}
          aria-label="Carpeta de sesiones"
        >
          <option value="">Elige una carpeta…</option>
          {folders.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      )}
      {option("panes", "Paneles visibles (vista dividida)", !ws.panes, "Activa la vista dividida desde la barra de pestañas")}
    </>
  );
}
