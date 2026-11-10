// Comandos del backend (Tauri) que usa App.tsx, con nombre y tipo claros. Cada función es una sola
// llamada a `invoke` con los mismos argumentos de siempre: el manejo del error (then/catch) sigue
// en quien la llama. Los nombres de comando son los del backend (src-tauri).
import { invoke } from "@tauri-apps/api/core";
import type { Pack } from "./packs";
import type { UpdateInfo, logOptions } from "./settings";
import type { Session } from "../types";

// ---------- Servidor MCP ----------

/** Configuración del servidor MCP: devuelve su estado en texto. */
export const mcpConfigure = (cfg: { enabled: boolean; port: number; token: string; requireApproval: boolean; readOnly: boolean }) =>
  invoke<string>("mcp_configure", cfg);

/** Respuesta del usuario a una solicitud de aprobación MCP. */
export const mcpDecide = (id: string, approved: boolean) => invoke("mcp_decide", { id, approved });

// ---------- Logs ----------

/** Carpeta de logs elegida por el usuario (null: la predeterminada). */
export const logsDirSet = (path: string | null) => invoke("logs_dir_set", { path });

/** Enciende o apaga el log de una conexión; devuelve la ruta del archivo (null si quedó apagado). */
export const setLogging = (id: string, enabled: boolean, opts: ReturnType<typeof logOptions>) =>
  invoke<string | null>("set_logging", { id, enabled, ...opts });

// ---------- Sesiones guardadas y credenciales ----------

export const listSessions = () => invoke<Session[]>("list_sessions");
export const saveSession = (session: Session) => invoke<Session>("save_session", { session });
export const updateSessions = (sessions: Session[]) => invoke<Session[]>("update_sessions", { sessions });
/** Agrega las sesiones nuevas; sin ninguna, solo devuelve la lista (misma llamada que antes). */
export const addSessions = (sessions: Session[]) => invoke<Session[]>(sessions.length ? "add_sessions" : "list_sessions", { sessions });
export const deleteSession = (id: string) => invoke("delete_session", { id });
export const credSet = (sessionId: string, password: string) => invoke("cred_set", { sessionId, password });
export const credDelete = (sessionId: string) => invoke("cred_delete", { sessionId });

// ---------- Actualizaciones ----------

export const updateCheck = () => invoke<UpdateInfo>("update_check");
export const updateInstall = () => invoke("update_install");

// ---------- Herramientas y conexiones ----------

/** Servidores de Herramientas que siguen activos (tftp, http, ftp, syslog, snmptrap). */
export const serverRunning = () => invoke<string[]>("server_running");
export const sendBreak = (id: string) => invoke("send_break", { id });

// ---------- Scripts ----------

/** Opciones y destinos de un script (ver ScriptLaunchDialog): devuelve el id de la ejecución. */
export const runScript = (
  script: string,
  targets: { conn: string; platform: string | null }[],
  options: { allowChanges: boolean; parallel: number; maxMinutes: number; vaultType: boolean },
) => invoke<string>("run_script", { script, targets, options });
export const stopScript = (run: string) => invoke("stop_script", { run });
/** Copia un .py elegido por el usuario a la carpeta de scripts; devuelve su nombre (null si canceló). */
export const importScript = () => invoke<string | null>("import_script");

// ---------- Catálogo de comandos e historial ----------

export const cmdpacksList = () => invoke<unknown[]>("cmdpacks_list");
export const cmdpackSave = (pack: Pack) => invoke("cmdpack_save", { pack });
export const cmdpackDelete = (id: string) => invoke("cmdpack_delete", { id });
/** Historial de comandos enviados por equipo (solo envíos explícitos). */
export const cmdHistoryAdd = (key: string, command: string) => invoke("cmd_history_add", { key, command });
