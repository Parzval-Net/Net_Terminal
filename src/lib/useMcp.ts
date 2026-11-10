/**
 * Servidor MCP desde la interfaz: configuración, aprobaciones (con la ventana de consultas),
 * consultas del backend (datos vivos, catálogo, diff) y actividad. Sale de App.tsx para dejarla
 * con cambios mínimos.
 */
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { listen } from "@tauri-apps/api/event";
import { mcpConfigure, mcpDecide, mcpQueryReply } from "./api";
import { computeRisk, textRisk, type CatalogVendor } from "./packs";
import { answerQuery, setBridgeActive } from "./mcpBridge";
import { activeWindows, autoApprove, autoApproveBatch, BATCH_TOOL, grantWindow, revokeOne, revokeWhere, type ConsultWindow } from "./mcpWindow";
import type { Settings } from "./settings";
import type { MonitorStatus, MonitorTarget, Sample } from "./monitors";
import type { Session, Tab, TabState } from "../types";
import type { ApprovalRequest } from "../components/ApprovalDialog";

interface Ctrl {
  connId: () => string;
}

interface Params {
  settings: Settings;
  tabs: Tab[];
  states: Record<string, TabState>;
  controllers: MutableRefObject<Map<string, Ctrl>>;
  catalog: CatalogVendor[];
  monitors: { samples: Record<string, Sample[]>; status: Record<string, MonitorStatus> };
  sessionsRef: MutableRefObject<Session[]>;
  openTab: (s: Session) => void;
  toast: (text: string, kind?: "info" | "error" | "ai") => void;
  toastFail: (action: string, e: unknown) => void;
}

export function useMcp({ settings, tabs, states, controllers, catalog, monitors, sessionsRef, openTab, toast, toastFail }: Params) {
  const [status, setStatus] = useState("");
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [windows, setWindows] = useState<ConsultWindow[]>([]);
  const windowsRef = useRef(windows);
  windowsRef.current = windows;

  // Servidor MCP: se (re)configura cuando cambian sus ajustes.
  useEffect(() => {
    mcpConfigure({
      enabled: settings.mcpEnabled,
      port: settings.mcpPort,
      token: settings.mcpToken,
      requireApproval: settings.mcpApproval,
      readOnly: settings.mcpReadOnly,
      visibility: settings.mcpVisibility,
      marked: settings.mcpMarked,
      scopes: settings.mcpScopes,
      audit: settings.mcpAudit,
    })
      .then(setStatus)
      .catch((e) => {
        setStatus(String(e));
        if (settings.mcpEnabled) toastFail("iniciar el servidor MCP", e);
      });
  }, [settings.mcpEnabled, settings.mcpPort, settings.mcpToken, settings.mcpApproval, settings.mcpReadOnly, settings.mcpVisibility, settings.mcpMarked, settings.mcpScopes, settings.mcpAudit, toastFail]);

  // Servidor apagado o en solo lectura: ninguna ventana sigue vigente.
  useEffect(() => {
    if (!settings.mcpEnabled || settings.mcpReadOnly) setWindows([]);
  }, [settings.mcpEnabled, settings.mcpReadOnly]);
  // Token nuevo: los agentes anteriores quedan desconectados y sus ventanas también.
  useEffect(() => setWindows([]), [settings.mcpToken]);
  // Sin servidor, Topología no arma los datos vivos para los agentes.
  useEffect(() => setBridgeActive(settings.mcpEnabled), [settings.mcpEnabled]);

  /** Pestaña de una conexión del backend (el id cambia en cada reconexión). */
  const tabOfConn = useCallback(
    (connId: string) => (connId ? tabs.find((t) => controllers.current.get(t.id)?.connId() === connId) : undefined),
    [tabs, controllers],
  );

  // Desconexión o solo lectura: se revoca la ventana de esa conexión.
  useEffect(() => {
    if (!windowsRef.current.length) return;
    const live = new Set<string>();
    for (const t of tabs) {
      const id = controllers.current.get(t.id)?.connId();
      if (id && states[t.id]?.status === "connected" && !t.readOnly) live.add(id);
    }
    setWindows((w) => {
      const next = revokeWhere(w, (x) => !live.has(x.conn));
      return next.length === w.length ? w : next;
    });
  }, [tabs, states, controllers]);

  // Vencimiento: se limpia sola (el temporizador solo existe mientras hay ventanas).
  useEffect(() => {
    if (!windows.length) return;
    const t = window.setInterval(() => setWindows((w) => {
      const next = activeWindows(w, Date.now());
      return next.length === w.length ? w : next;
    }), 15_000);
    return () => window.clearInterval(t);
  }, [windows.length]);

  // Contexto vivo para las consultas del backend (sin re-suscribir los eventos en cada render).
  const ctxRef = useRef({ catalog, monitors, targets: settings.monitors as MonitorTarget[], states, tabOfConn });
  ctxRef.current = { catalog, monitors, targets: settings.monitors, states, tabOfConn };

  useEffect(() => {
    const subs = [
      listen<ApprovalRequest>("mcp-approval", (e) => {
        const req = e.payload;
        const d = autoApproveBatch(req, (r) => autoApprove(windowsRef.current, r, Date.now(), computeRisk));
        if (d.auto) {
          mcpDecide(req.id, true, true, d.risk).catch((err) => toastFail("aprobar la consulta del agente", err));
          return;
        }
        setApprovals((a) => [...a, req]);
      }),
      listen<string>("mcp-approval-closed", (e) => setApprovals((a) => a.filter((x) => x.id !== e.payload))),
      listen<string>("mcp-open-session", (e) => {
        const s = sessionsRef.current.find((x) => x.id === e.payload);
        if (s) openTab(s);
      }),
      listen<{ tool: string; target: string; detail: string; ok: boolean }>("mcp-activity", (e) => {
        const { tool, target, detail, ok } = e.payload;
        if (tool === "send_command" || tool === "run_command" || tool === BATCH_TOOL || tool === "open_session")
          toast(`IA · ${ok ? "" : "rechazado: "}${detail.split("\n")[0]}${target ? ` → ${target}` : ""}`, "ai");
      }),
      listen<{ id: string; kind: string; args: Record<string, unknown> }>("mcp-query", (e) => {
        const { id, kind, args } = e.payload;
        const c = ctxRef.current;
        try {
          const data = answerQuery(kind, args ?? {}, {
            catalog: c.catalog,
            risk: textRisk,
            monitors: { targets: c.targets, status: c.monitors.status, samples: c.monitors.samples },
            tabOf: (connId) => {
              const t = c.tabOfConn(connId);
              if (!t) return undefined;
              const st = c.states[t.id];
              return { platform: t.session.platform, status: st?.status, logging: !!st?.logPath };
            },
          });
          if (data !== undefined) mcpQueryReply(id, data).catch(() => {});
        } catch {
          /* sin respuesta: el backend vence el plazo e informa al agente */
        }
      }),
    ];
    return () => subs.forEach((u) => u.then((f) => f()));
  }, [openTab, toast, toastFail, sessionsRef]);

  /** Decisión del usuario en el diálogo; `minutes` abre la ventana de consultas para ese agente y conexión. */
  const decide = useCallback(
    (req: ApprovalRequest, approved: boolean, minutes?: number) => {
      const risk = req.tool === "open_session" ? undefined : textRisk(req.detail);
      mcpDecide(req.id, approved, false, risk).catch((e) => toastFail("registrar la decisión sobre la solicitud MCP", e));
      setApprovals((a) => a.filter((x) => x.id !== req.id));
      // Sin clave de agente (cliente sin Mcp-Session-Id) no hay ventana: la compartirían todos los anónimos.
      if (approved && minutes && req.connection && req.client_key) {
        const tab = tabOfConn(req.connection);
        if (!tab || tab.readOnly) return;
        setWindows((w) => grantWindow(w, { conn: req.connection!, clientKey: req.client_key!, clientName: req.client ?? "", target: req.target }, minutes, Date.now()));
        toast(`Consultas de ${req.client || "el agente"} en ${req.target} permitidas por ${minutes} min. Revócalas en Ajustes › Agentes IA.`, "ai");
      }
    },
    [tabOfConn, toast, toastFail],
  );

  const revoke = useCallback((conn: string, clientKey: string) => setWindows((w) => revokeOne(w, conn, clientKey)), []);
  const revokeAll = useCallback(() => setWindows([]), []);

  return { status, approvals, decide, windows, revoke, revokeAll };
}
