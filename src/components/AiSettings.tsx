import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Copy, Eye, EyeOff, FolderOpen, RefreshCw, X } from "lucide-react";
import { Settings, newToken } from "../lib/settings";
import { Item as Row, Segmented, Switch } from "./controls";
import { mcpAuditTail, type McpAuditEvent } from "../lib/api";
import { WINDOW_MINUTES, minutesLeft, type ConsultWindow } from "../lib/mcpWindow";
import type { Session } from "../types";

interface Props {
  settings: Settings;
  status: string;
  sessions?: Session[];
  windows?: ConsultWindow[];
  onRevoke?: (conn: string, clientKey: string) => void;
  onRevokeAll?: () => void;
  onChange: (patch: Partial<Settings>) => void;
}

const DECISION: Record<string, string> = {
  lectura: "Lectura",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
  auto_ventana: "Auto (ventana)",
  tiempo_agotado: "Tiempo agotado",
  solo_lectura: "Solo lectura",
  bloqueado: "Bloqueado",
  sin_aprobacion: "Sin aprobación",
  error: "Error",
};

const AUDIT_ROWS = 50;

export function AiSettings({ settings: s, status, sessions = [], windows = [], onRevoke, onRevokeAll, onChange }: Props) {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState("");
  const [audit, setAudit] = useState<McpAuditEvent[] | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const url = `http://127.0.0.1:${s.mcpPort}/mcp`;
  const token = s.mcpToken || "TOKEN";

  const copy = async (key: string, text: string) => {
    await writeText(text);
    setCopied(key);
    window.setTimeout(() => setCopied(""), 2000);
  };

  const loadAudit = useCallback(() => {
    mcpAuditTail(AUDIT_ROWS)
      .then((rows) => setAudit(Array.isArray(rows) ? rows.slice().reverse() : []))
      .catch(() => setAudit([]));
  }, []);
  useEffect(() => {
    if (s.mcpAudit) loadAudit();
  }, [s.mcpAudit, loadAudit]);
  // Minutos restantes de las ventanas: se refresca solo mientras hay alguna.
  useEffect(() => {
    if (!windows.length) return;
    const t = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(t);
  }, [windows.length]);

  const curl = (id: number, name: string, args: string) =>
    `curl -s ${url} -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" -H "MCP-Protocol-Version: 2025-11-25" \\\n  -d '{"jsonrpc":"2.0","id":${id},"method":"tools/call","params":{"name":"${name}","arguments":${args}}}'`;

  const clients: [string, string, string][] = [
    [
      "Claude Code",
      "Terminal",
      `claude mcp add --transport http --scope user --header "Authorization: Bearer ${token}" netterminal ${url}`,
    ],
    [
      "Gemini CLI",
      "~/.gemini/settings.json",
      JSON.stringify(
        { mcpServers: { netterminal: { httpUrl: url, headers: { Authorization: `Bearer ${token}` } } } },
        null,
        2,
      ),
    ],
    [
      "Codex (OpenAI)",
      "~/.codex/config.toml  +  variable NETTERMINAL_TOKEN",
      `[mcp_servers.netterminal]\nurl = "${url}"\nbearer_token_env_var = "NETTERMINAL_TOKEN"\n\n# En tu shell:\n# export NETTERMINAL_TOKEN=${token}`,
    ],
    [
      "Claude Desktop",
      "claude_desktop_config.json (requiere Node.js)",
      JSON.stringify(
        {
          mcpServers: {
            netterminal: {
              command: "npx",
              args: ["-y", "mcp-remote", url, "--header", `Authorization: Bearer ${token}`],
            },
          },
        },
        null,
        2,
      ),
    ],
    [
      "Otra aplicación (API HTTP)",
      "JSON-RPC 2.0 por POST: tools, resources y prompts; run_command y send_command piden aprobación en NetTerminal",
      [
        "# Conexiones abiertas visibles para agentes (id de cada pestaña)",
        curl(1, "list_connections", "{}"),
        "",
        "# Ejecutar UN comando y recibir solo su salida (el usuario lo aprueba en la app, con su riesgo)",
        curl(2, "run_command", '{"connection_id":"ID","command":"show clock","timeout_seconds":30}'),
        "",
        "# Topología y enlaces que requieren atención",
        curl(3, "get_topology", '{"section":"summary"}'),
        "",
        "# Recursos: sesiones guardadas sin credenciales",
        `curl -s ${url} -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" -H "MCP-Protocol-Version: 2025-11-25" \\\n  -d '{"jsonrpc":"2.0","id":4,"method":"resources/read","params":{"uri":"netterminal://sessions"}}'`,
      ].join("\n"),
    ],
  ];

  const markable: { id: string; name: string; folder?: string }[] = [
    { id: "local", name: "Terminal local" },
    ...sessions.filter((x) => x.id).map((x) => ({ id: x.id, name: x.name, folder: x.folder })),
  ];
  const toggleMarked = (id: string, on: boolean) =>
    onChange({ mcpMarked: on ? [...s.mcpMarked.filter((x) => x !== id), id] : s.mcpMarked.filter((x) => x !== id) });
  const scopes = s.mcpScopes;

  return (
    <>
      <p className="text-[12px] text-muted">
        Expone NetTerminal como servidor MCP local para que un agente de IA lea sesiones, salidas, topología, monitores, logs y
        respaldos, y proponga comandos que apruebas tú. Solo escucha en 127.0.0.1 y requiere token.
      </p>

      <Row label="Activar servidor MCP" hint={s.mcpEnabled ? status : "Apagado"}>
        <Switch
          checked={s.mcpEnabled}
          onChange={(v) => onChange(v && !s.mcpToken ? { mcpEnabled: v, mcpToken: newToken() } : { mcpEnabled: v })}
        />
      </Row>

      <Row label="Aprobar cada comando" hint="En la terminal local siempre se pide aprobación">
        <Switch checked={s.mcpApproval} onChange={(v) => onChange({ mcpApproval: v })} />
      </Row>
      {!s.mcpApproval && (
        <p className="-mt-2 text-[11.5px] text-danger">
          Sin aprobación, el agente puede ejecutar comandos en equipos remotos sin que lo veas antes. Úsalo solo en
          laboratorio.
        </p>
      )}

      <Row label="Solo lectura" hint="El agente puede listar y leer, pero no enviar comandos ni abrir sesiones">
        <Switch checked={s.mcpReadOnly} onChange={(v) => onChange({ mcpReadOnly: v })} />
      </Row>

      <Row label="Sesiones visibles para agentes" hint="Qué conexiones y sesiones guardadas puede ver y usar un agente">
        <Segmented
          value={s.mcpVisibility}
          options={[
            ["all", "Todas"],
            ["marked", "Marcadas"],
            ["none", "Ninguna"],
          ]}
          onChange={(v) => onChange({ mcpVisibility: v })}
        />
      </Row>
      {s.mcpVisibility === "all" && (
        <p className="-mt-2 text-[11.5px] text-muted">
          Recomendado: «Marcadas», para que el agente solo vea las sesiones que elijas. Con «Todas» ve cualquier pestaña abierta.
        </p>
      )}
      {s.mcpVisibility === "none" && (
        <p className="-mt-2 text-[11.5px] text-muted">
          El agente no ve conexiones ni sesiones: solo topología, monitores, catálogo y, si los dejas, logs, respaldos y notas.
        </p>
      )}
      {s.mcpVisibility === "marked" && (
        <div className="-mt-1">
          <p className="mb-1.5 text-[11.5px] text-muted">
            Marca aquí o desde el menú de la pestaña («Visible para agentes IA»). Las conexiones rápidas no se pueden marcar: guárdalas como sesión.
          </p>
          <p className="mb-1.5 text-[11.5px] text-muted">
            Logs y respaldos también se limitan a las sesiones marcadas: el agente solo recibe los archivos cuyo nombre corresponde a una sesión marcada (su nombre o destino) y a ninguna sin marcar. Los que no se pueden asociar con certeza, como los de conexiones rápidas o sesiones borradas, no se entregan. Las notas no dependen de la sesión.
          </p>
          <div className="max-h-44 overflow-y-auto rounded-lg border border-line divide-y divide-line">
            {markable.map((m) => (
              <label key={m.id} className="flex items-center gap-2 px-3 h-8 text-[12.5px]">
                <input type="checkbox" checked={s.mcpMarked.includes(m.id)} onChange={(e) => toggleMarked(m.id, e.target.checked)} />
                <span className="truncate">{m.name}</span>
                {m.folder && <span className="ml-auto text-[11px] text-muted truncate">{m.folder}</span>}
              </label>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="mb-1.5 text-[12px] font-medium text-muted">Datos que un agente puede leer</div>
        <Row label="Logs de sesión" hint="search_logs (con secretos enmascarados)">
          <Switch checked={scopes.logs} onChange={(v) => onChange({ mcpScopes: { ...scopes, logs: v } })} />
        </Row>
        <Row label="Respaldos de configuración" hint="list_backups, diff_backups y recursos (enmascarados)">
          <Switch checked={scopes.backups} onChange={(v) => onChange({ mcpScopes: { ...scopes, backups: v } })} />
        </Row>
        <Row label="Notas sin protección" hint="Las notas protegidas con contraseña nunca se exponen">
          <Switch checked={scopes.notes} onChange={(v) => onChange({ mcpScopes: { ...scopes, notes: v } })} />
        </Row>
      </div>

      <div>
        <Row label="Ventana de consultas" hint="Duración que propone el diálogo de aprobación (apagada hasta que la actives ahí)">
          <select
            className="field !w-28"
            aria-label="Duración de la ventana de consultas"
            value={s.mcpWindowMin}
            onChange={(e) => onChange({ mcpWindowMin: Number(e.target.value) })}
          >
            {WINDOW_MINUTES.map((m) => (
              <option key={m} value={m}>{m} minutos</option>
            ))}
          </select>
        </Row>
        {windows.length > 0 && (
          <div className="mt-1.5 rounded-lg border border-line divide-y divide-line" aria-label="Ventanas de consultas activas">
            {windows.map((w) => (
              <div key={`${w.conn}|${w.clientKey}`} className="flex items-center gap-2 px-3 h-9 text-[12.5px]">
                <span className="truncate">
                  <span className="font-mono">{w.clientName || "Agente"}</span> en {w.target}
                </span>
                <span className="ml-auto shrink-0 text-[11.5px] text-muted">{minutesLeft(w, now)} min</span>
                <button
                  onClick={() => onRevoke?.(w.conn, w.clientKey)}
                  className="shrink-0 flex items-center gap-1 px-2 h-6 rounded text-[11.5px] text-muted hover:text-fg hover:bg-hover"
                  aria-label={`Revocar la ventana de ${w.clientName || "el agente"} en ${w.target}`}
                >
                  <X size={12} /> Revocar
                </button>
              </div>
            ))}
            {windows.length > 1 && (
              <div className="flex justify-end px-3 h-9">
                <button onClick={onRevokeAll} className="px-2 h-7 my-1 rounded text-[11.5px] text-danger hover:bg-hover">
                  Revocar todas
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <Row label="Registro de auditoría" hint="Archivo local con cada pedido del agente: herramienta, comando enmascarado, riesgo y decisión">
        <Switch checked={s.mcpAudit} onChange={(v) => onChange({ mcpAudit: v })} />
      </Row>
      {s.mcpAudit && (
        <div className="-mt-1">
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="text-[11.5px] text-muted" title="Las lecturas del agente se registran aparte (carpeta «lecturas»), así no desplazan los comandos">Últimos {AUDIT_ROWS} comandos y decisiones (sin salidas de equipos ni contraseñas; las lecturas van aparte)</span>
            <button onClick={loadAudit} className="ml-auto flex items-center gap-1 px-2 h-6 rounded text-[11.5px] text-muted hover:text-fg hover:bg-hover">
              <RefreshCw size={12} /> Actualizar
            </button>
            <button
              onClick={() => invoke("open_dir", { which: "mcp-audit" }).catch(() => {})}
              className="flex items-center gap-1 px-2 h-6 rounded text-[11.5px] text-muted hover:text-fg hover:bg-hover"
            >
              <FolderOpen size={12} /> Abrir carpeta
            </button>
          </div>
          <div className="max-h-52 overflow-y-auto rounded-lg border border-line text-[11.5px]">
            {!audit?.length ? (
              <p className="px-3 py-2 text-muted">{audit ? "Sin eventos todavía." : "Cargando…"}</p>
            ) : (
              <table className="w-full">
                <tbody className="divide-y divide-line">
                  {audit.map((e, i) => (
                    <tr key={i} className="align-top">
                      <td className="px-2 py-1 whitespace-nowrap text-muted tabular-nums">{e.ts.slice(5, 19).replace("T", " ")}</td>
                      <td className="px-2 py-1 whitespace-nowrap">{DECISION[e.decision] ?? e.decision}</td>
                      <td className="px-2 py-1 min-w-0">
                        <div className="truncate" title={`${e.client} ${e.clientVersion}`.trim()}>
                          {e.tool}
                          {e.target ? ` · ${e.target}` : ""}
                          {e.risk ? ` · ${e.risk}` : ""}
                        </div>
                        {e.command && <div className="font-mono text-muted break-all whitespace-pre-line line-clamp-2">{e.command}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      <Row label="Puerto">
        <input
          type="number"
          min={1024}
          max={65535}
          className="field !w-28"
          aria-label="Puerto del servidor MCP"
          value={s.mcpPort}
          onChange={(e) => onChange({ mcpPort: Number(e.target.value) || 47821 })}
        />
      </Row>

      <div>
        <div className="mb-1.5 text-[12px] font-medium text-muted">Token</div>
        <div className="flex gap-1.5">
          <input
            readOnly
            aria-label="Token del servidor MCP"
            className="field font-mono !text-[12px] flex-1"
            type={show ? "text" : "password"}
            value={s.mcpToken}
            placeholder="Se genera al activar"
          />
          <IconBtn title={show ? "Ocultar token" : "Mostrar token"} onClick={() => setShow(!show)}>
            {show ? <EyeOff size={14} /> : <Eye size={14} />}
          </IconBtn>
          <IconBtn title="Copiar token" onClick={() => copy("token", s.mcpToken)} disabled={!s.mcpToken}>
            <Copy size={14} />
          </IconBtn>
          <IconBtn title="Generar nuevo (invalida el anterior)" onClick={() => onChange({ mcpToken: newToken() })}>
            <RefreshCw size={14} />
          </IconBtn>
        </div>
        {copied === "token" && <p role="status" className="mt-1 text-[11.5px] text-accent">Token copiado</p>}
      </div>

      <div>
        <div className="mb-1.5 text-[12px] font-medium text-muted">Configurar tu agente</div>
        <div className="space-y-2">
          {clients.map(([name, where, snippet]) => (
            <details key={name} className="rounded-lg border border-line group">
              <summary className="flex items-center justify-between px-3 h-9 cursor-default list-none">
                <span className="truncate">
                  {name} <span className="text-[11.5px] text-muted">· {where}</span>
                </span>
                <button
                  aria-label={`Copiar la configuración para ${name}`}
                  onClick={(e) => {
                    e.preventDefault();
                    copy(name, snippet);
                  }}
                  className="flex items-center gap-1 px-2 h-6 rounded text-[11.5px] text-muted hover:text-fg hover:bg-hover"
                >
                  <Copy size={12} /> {copied === name ? "Copiado" : "Copiar"}
                </button>
              </summary>
              <pre className="mx-3 mb-3 p-2.5 rounded-md bg-hover font-mono text-[11px] whitespace-pre-wrap break-all select-text">
                {show ? snippet : snippet.split(token).join("••••••••")}
              </pre>
            </details>
          ))}
        </div>
        <p className="mt-2 text-[11.5px] text-muted">
          Herramientas de lectura sin aprobación: list_sessions, list_connections, read_output, get_session_info, get_topology,
          get_monitors, list_commands, search_logs, list_backups y diff_backups. Con aprobación: run_command, send_command y
          open_session. También ofrece recursos (netterminal://…) y prompts guiados en español.
        </p>
        <p className="mt-2 text-[11.5px] text-muted">
          ChatGPT de escritorio no se conecta a servidores MCP locales; para OpenAI usa Codex. Trata el token como una
          contraseña: no lo compartas ni lo subas a repositorios.
        </p>
      </div>
    </>
  );
}

function IconBtn(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      aria-label={props.title}
      {...props}
      className="w-8 h-[30px] shrink-0 grid place-items-center rounded-md border border-line text-muted hover:text-fg hover:bg-hover disabled:opacity-40"
    />
  );
}
