import { memo, useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { BookOpen, FlaskConical, NotebookPen, PanelLeft, Settings, Wrench, X } from "lucide-react";
import { useLabRun } from "../lib/cliLab";
import { isMac, modLabel } from "../lib/platform";
import { ContextMenu } from "./Sidebar";
import type { MenuItem } from "./tabMenu";

interface Props {
  /** Barra de sesiones visible (acoplada o flotante). */
  sidebarOpen: boolean;
  /** Barra de sesiones flotante activa (ajuste) y cerrada: el mouse sobre Sesiones la abre. */
  floatingSessions: boolean;
  /** La app ocultó la barra acoplada (no el usuario): un panel derecho o Herramientas en ventana angosta; vuelve sola. */
  sessionsHiddenBy?: "panel" | "tools" | null;
  /** La vista de Herramientas es la que se ve ahora. */
  toolsActive: boolean;
  /** Herramientas montada (sus monitoreos y servidores siguen vivos aunque se vea una terminal). */
  toolsOpen: boolean;
  /** Sondas caídas. */
  alerts: number;
  labOpen: boolean;
  commandsOpen: boolean;
  notesOpen: boolean;
  settingsOpen: boolean;
  onSessions: () => void;
  onSessionsEnter: () => void;
  onSessionsLeave: () => void;
  onTools: () => void;
  /** Cierra Herramientas de verdad (con aviso si hay algo corriendo). */
  onCloseTools: () => void;
  onLab: () => void;
  onCommands: () => void;
  onNotes: () => void;
  onSettings: () => void;
}

const COMMA = isMac ? "⌘," : "Ctrl+,";

/**
 * Barra de actividad (como la de VS Code): accesos a los paneles y vistas de la app, siempre
 * visible a la izquierda, en dos grupos separados (vistas arriba, asistentes del panel derecho
 * abajo). Cada botón tiene un tooltip propio con nombre y atajo, que también aparece con el foco
 * de teclado; el estado activo se ve con fondo y una marca lateral (no solo por color).
 */
export const ActivityBar = memo(function ActivityBar(p: Props) {
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const lab = useLabRun();
  const labDone = lab ? lab.items.filter((i) => i.status !== "pending" && i.status !== "running").length : 0;
  const labFailed = lab ? lab.items.filter((i) => i.status === "error").length : 0;
  const labTip = lab?.running
    ? `CLI Lab ejecutando: ${labDone}/${lab.items.length} equipos terminados`
    : lab
      ? `CLI Lab: ${lab.items.length - labFailed} de ${lab.items.length} equipos OK${labFailed ? `, ${labFailed} con error` : ""}`
      : "";

  return (
    <nav
      aria-label="Barra de actividad"
      className="w-11 shrink-0 flex flex-col items-center gap-1 py-1.5 bg-chrome border-r border-line"
    >
      {/* Grupo 1, vistas: Sesiones (panel izquierdo) y Herramientas (reemplaza la terminal). */}
      <div role="group" aria-label="Vistas" className="flex flex-col items-center gap-1">
        <ActivityBtn
          label="Sesiones"
          shortcut={`${modLabel}B`}
          detail={
            p.sessionsHiddenBy
              ? `Oculta automáticamente: ${
                  p.sessionsHiddenBy === "tools" ? "Herramientas necesita el ancho de la ventana" : "el panel derecho necesita el espacio"
                }. Vuelve sola al ${p.sessionsHiddenBy === "tools" ? "volver a una terminal o ensanchar la ventana" : "cerrar el panel"}.\nClic: verlas encima`
              : `Mostrar u ocultar el árbol de sesiones${p.floatingSessions ? "\nPasa el mouse para verlas sobre la terminal" : ""}`
          }
          alert={p.sessionsHiddenBy ? "oculta automáticamente por falta de ancho" : undefined}
          sessions={{ enter: p.onSessionsEnter, leave: p.onSessionsLeave, floating: p.floatingSessions }}
          active={p.sidebarOpen}
          onClick={p.onSessions}
          icon={<PanelLeft size={18} />}
          badge={
            p.sessionsHiddenBy && (
              <span aria-hidden data-auto-hidden="" className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-warn ring-2 ring-[var(--chrome)]" />
            )
          }
        />
        <ActivityBtn
          label="Herramientas"
          shortcut={`${modLabel}E`}
          detail={`Monitoreo, diagnóstico, TFTP, syslog y plugins${p.alerts > 0 ? `\n${p.alerts} sondas caídas` : ""}${p.toolsOpen ? "\nClic derecho: cerrar" : ""}`}
          alert={p.alerts > 0 ? `${p.alerts} sondas caídas` : undefined}
          active={p.toolsActive}
          onClick={p.onTools}
          onContextMenu={
            p.toolsOpen
              ? (e) => {
                  e.preventDefault();
                  setMenu({ x: e.clientX, y: e.clientY, items: [["Cerrar Herramientas", <X size={13} />, p.onCloseTools]] });
                }
              : undefined
          }
          icon={<Wrench size={18} />}
          badge={
            p.alerts > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 grid place-items-center rounded-full bg-danger text-danger-fg text-[10px] font-semibold leading-none">
                {p.alerts > 9 ? "9+" : p.alerts}
              </span>
            )
          }
        />
      </div>
      <div aria-hidden className="w-6 h-px my-1 shrink-0 bg-line" />
      {/* Grupo 2, asistentes: se abren en el panel derecho, junto a la terminal. */}
      <div role="group" aria-label="Asistentes" className="flex flex-col items-center gap-1">
        <ActivityBtn
          label="Comandos"
          name="Catálogo de comandos"
          shortcut={`${modLabel}L`}
          detail="Comandos por fabricante, con su nivel de riesgo"
          active={p.commandsOpen}
          onClick={p.onCommands}
          icon={<BookOpen size={18} />}
        />
        <ActivityBtn
          label="Notas"
          shortcut={`${modLabel}J`}
          detail="Plantillas y apuntes para enviar a la terminal"
          active={p.notesOpen}
          onClick={p.onNotes}
          icon={<NotebookPen size={18} />}
        />
        <ActivityBtn
          label="CLI Lab"
          shortcut={`${modLabel}I`}
          detail={labTip || "Script de varias líneas en el destino elegido, leyendo cada respuesta"}
          alert={labTip || undefined}
          active={p.labOpen}
          onClick={p.onLab}
          // Ícono propio: SquareTerminal queda reservado para la terminal local.
          icon={<FlaskConical size={18} className={lab?.running ? "animate-pulse" : ""} />}
          badge={
            lab && (
              <span
                className={`absolute top-0.5 right-0.5 w-2 h-2 rounded-full ring-2 ring-[var(--chrome)] ${
                  lab.running ? "bg-warn" : labFailed ? "bg-danger" : "bg-ok"
                }`}
              />
            )
          }
        />
      </div>
      <div className="flex-1" />
      <ActivityBtn label="Ajustes" shortcut={COMMA} active={p.settingsOpen} onClick={p.onSettings} icon={<Settings size={18} />} />
      {menu && <ContextMenu menu={menu} onClose={closeMenu} />}
    </nav>
  );
});

/** Retardo del tooltip al pasar el mouse (con foco de teclado aparece de inmediato). */
const TIP_DELAY = 250;

function ActivityBtn({
  label,
  name,
  shortcut,
  detail,
  alert,
  active,
  onClick,
  onContextMenu,
  icon,
  badge,
  sessions,
}: {
  /** Solo el botón Sesiones: abre la barra flotante al pasar el mouse. */
  sessions?: { enter: () => void; leave: () => void; floating: boolean };
  /** Nombre accesible. */
  label: string;
  /** Nombre en el tooltip, si es más largo que el accesible. */
  name?: string;
  /** Atajo de teclado: va en el tooltip y en aria-keyshortcuts. */
  shortcut: string;
  /** Qué hace y, si hay, el estado (una línea por cada salto). */
  detail?: string;
  /** Estado que el nombre accesible debe decir (sondas caídas, avance de CLI Lab). */
  alert?: string;
  active: boolean;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  icon: ReactNode;
  badge?: ReactNode;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const descId = useId();
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const show = (delay: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const r = ref.current?.getBoundingClientRect();
      if (r) setTip({ x: r.right + 8, y: r.top + r.height / 2 });
    }, delay);
  };
  const hide = (delay = 0) => {
    window.clearTimeout(timer.current);
    if (delay) timer.current = window.setTimeout(() => setTip(null), delay);
    else setTip(null);
  };
  const lines = detail ? detail.split("\n") : [];

  return (
    <>
      <button
        ref={ref}
        onClick={() => {
          hide();
          onClick();
        }}
        onContextMenu={(e) => {
          hide();
          onContextMenu?.(e);
        }}
        onMouseEnter={() => {
          show(TIP_DELAY);
          if (sessions?.floating) sessions.enter();
        }}
        onMouseLeave={() => {
          // Breve margen para que el puntero pueda pasar al tooltip sin que desaparezca (WCAG 1.4.13).
          hide(150);
          if (sessions?.floating) sessions.leave();
        }}
        // Con foco de teclado (no con clic) el tooltip aparece de inmediato.
        onFocus={(e) => e.currentTarget.matches(":focus-visible") && show(0)}
        onBlur={() => hide()}
        onKeyDown={(e) => {
          if (e.key === "Escape" && tip) {
            e.stopPropagation();
            hide();
          }
        }}
        data-sessions-btn={sessions ? "" : undefined}
        aria-label={alert ? `${label}, ${alert}` : label}
        aria-describedby={detail ? descId : undefined}
        aria-keyshortcuts={ariaShortcut(shortcut)}
        aria-pressed={active}
        className={`relative w-9 h-9 shrink-0 grid place-items-center rounded-md ${
          active ? "bg-selected text-fg" : "text-muted hover:text-fg hover:bg-hover"
        }`}
      >
        {/* Marca lateral del botón activo: se ve aunque no se distingan los colores. */}
        {active && <span aria-hidden className="absolute -left-1 top-1.5 bottom-1.5 w-0.5 rounded-full bg-accent" />}
        {icon}
        {badge}
      </button>
      {/* Descripción para lectores de pantalla; el tooltip visible repite lo mismo y queda oculto para ellos. */}
      {detail && (
        <span id={descId} className="sr-only">
          {detail.replace(/\n/g, ". ")}
        </span>
      )}
      {tip && (
        <div
          role="tooltip"
          aria-hidden
          onMouseEnter={() => window.clearTimeout(timer.current)}
          onMouseLeave={() => hide()}
          className="fixed z-50 w-max max-w-72 -translate-y-1/2 px-2.5 py-1.5 rounded-md bg-panel border border-line shadow-pop text-[12px] text-fg"
          style={{ left: tip.x, top: tip.y }}
        >
          <div className="flex items-baseline gap-3">
            <span className="font-semibold">{name ?? label}</span>
            <kbd className="ml-auto text-[11px] text-muted font-sans">{shortcut}</kbd>
          </div>
          {lines.map((l, i) => (
            <p key={i} className="mt-0.5 text-[11.5px] text-muted leading-snug">
              {l}
            </p>
          ))}
        </div>
      )}
    </>
  );
}

/** "Ctrl+Shift+B" o "⌘B" en el formato de aria-keyshortcuts ("Control+Shift+B", "Meta+B"). */
function ariaShortcut(s: string): string {
  return s.replace("⌘", "Meta+").replace(/^Ctrl\+/, "Control+");
}
