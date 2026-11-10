import { useEffect } from "react";
import { shortcutFor } from "./platform";
import type { Settings } from "./settings";
import type { Tab } from "../types";

/** Lo que hacen los atajos globales: el estado de la ventana y las acciones que dispara cada uno. */
export interface ShortcutActions {
  tabs: Tab[];
  activeId: string | null;
  activeTab: Tab | undefined;
  setActiveId: (id: string) => void;
  update: (p: Partial<Settings> | ((s: Settings) => Partial<Settings>)) => void;
  onPalette: () => void;
  onNewTab: () => void;
  onCloseTab: (id: string) => void;
  onCloseAll: () => void;
  onSettings: () => void;
  onNotes: () => void;
  onCommands: () => void;
  onTools: () => void;
  onDuplicateTab: (tab: Tab) => void;
  onNewSession: () => void;
  onQuickConnect: () => void;
  onCliLab: () => void;
  onToggleSidebar: () => void;
  onFocusMode: () => void;
  onFind: () => void;
  onHistory: () => void;
}

/**
 * Atajos globales (paleta, pestañas, paneles, modo foco, zoom de la terminal…). Se vuelve a registrar en
 * cada render: siempre ve las pestañas y acciones del momento.
 */
export function useShortcuts(a: ShortcutActions) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = shortcutFor(e);
      if (!action) return;
      e.preventDefault();
      const { tabs, activeId, activeTab } = a;
      const cycle = (step: number) => {
        if (!tabs.length) return;
        const i = tabs.findIndex((t) => t.id === activeId);
        a.setActiveId(tabs[(i + step + tabs.length) % tabs.length].id);
      };
      if (typeof action === "object") {
        if (tabs[action.tab]) a.setActiveId(tabs[action.tab].id);
        return;
      }
      switch (action) {
        case "palette":
          return a.onPalette();
        case "newTab":
          return a.onNewTab();
        case "closeTab":
          return activeId && a.onCloseTab(activeId);
        case "closeAll":
          return a.onCloseAll();
        case "settings":
          return a.onSettings();
        case "notes":
          return a.onNotes();
        case "commands":
          return a.onCommands();
        case "tools":
          return a.onTools();
        case "duplicateTab":
          return activeTab && a.onDuplicateTab(activeTab);
        case "newSession":
          return a.onNewSession();
        case "quickConnect":
          return a.onQuickConnect();
        case "cliLab":
          return a.onCliLab();
        case "toggleSidebar":
          return a.onToggleSidebar();
        case "focusMode":
          return a.onFocusMode();
        case "find":
          return a.onFind();
        case "history":
          return activeTab && !activeTab.session.scp && a.onHistory();
        case "nextTab":
          return cycle(1);
        case "prevTab":
          return cycle(-1);
        case "zoomIn":
          return a.update((s) => ({ fontSize: Math.min(s.fontSize + 1, 28) }));
        case "zoomOut":
          return a.update((s) => ({ fontSize: Math.max(s.fontSize - 1, 9) }));
        case "zoomReset":
          return a.update({ fontSize: 13 });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
}
