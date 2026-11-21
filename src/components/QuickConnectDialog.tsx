import { useEffect, useId, useMemo, useState } from "react";
import { useModal } from "../lib/useModal";
import { invoke } from "@tauri-apps/api/core";
import { History, X, Zap } from "lucide-react";
import { SerialPortInfo, Session, sessionTarget } from "../types";
import { SerialPortField } from "./SerialPortField";
import { Segmented } from "./controls";
import { SessionIcon } from "./SessionIcon";
import { quickTarget } from "../lib/quickTarget";
import { useDragResize } from "../lib/useDragResize";
import { backspaceOptions } from "../lib/backspace";
import { normPath } from "../lib/folders";
import {
  BAUDS,
  DATA_BITS,
  FLOW_OPTIONS,
  PARITY_OPTIONS,
  QUICK_TYPES,
  QuickType,
  SESSION_TYPES,
  STOP_BITS,
  matchRecent,
  portForType,
  serialSummary,
  suggestName,
} from "../lib/sessionTypes";

interface Props {
  onClose: () => void;
  /** Abre la pestaña con una sesión sin guardar (id vacío), como la paleta. */
  onOpen: (s: Session) => void;
  /**
   * Guarda la sesión y abre su pestaña (casilla "Guardar en sesiones"). Sin esta función la casilla
   * no aparece y la conexión queda sin guardar, como antes.
   */
  onSave?: (s: Session) => void;
  /** Carpetas existentes, para sugerir dónde guardar. */
  folders?: string[];
}

const HOST = /^[\w.\-:%[\]]+$/;
const labelOf = (t: Session["type"]) => SESSION_TYPES.find((d) => d.type === t)?.label ?? t;

/** Conexión rápida por formulario (SSH, Telnet, Serial o TCP crudo), con opción de guardarla. */
export function QuickConnectDialog({ onClose, onOpen, onSave, folders = [] }: Props) {
  const id = useId();
  const [s, setS] = useState<Session>({
    id: "",
    name: "",
    type: "ssh",
    port: 22,
    baud_rate: 9600,
    data_bits: 8,
    stop_bits: 1,
    parity: "none",
    flow_control: "none",
    created_at: "",
  });
  const [ports, setPorts] = useState<SerialPortInfo[]>([]);
  const [error, setError] = useState("");
  const set = <K extends keyof Session>(k: K, v: Session[K]) => setS((p) => ({ ...p, [k]: v }));
  const win = useDragResize<HTMLFormElement>("quickWindow", false);
  // "Guardar en sesiones": nombre y carpeta solo se piden al marcar la casilla.
  const [save, setSave] = useState(false);
  const [folder, setFolder] = useState("");
  // Opciones avanzadas: se abren y cierran solo a mano (cambiar una opción adentro no las pliega).
  const [advanced, setAdvanced] = useState(false);

  // Últimos destinos (los mismos que la paleta y la pantalla de inicio), como combobox en Host.
  const [recent, setRecent] = useState<string[]>([]);
  const [listOpen, setListOpen] = useState(false);
  const [active, setActive] = useState(-1);
  useEffect(() => {
    invoke<string[]>("recent_targets").then(setRecent).catch(() => {});
  }, []);
  const matches = useMemo(() => matchRecent(recent, s.host ?? ""), [recent, s.host]);
  const showList = listOpen && s.type !== "serial" && matches.length > 0;
  const listId = `${id}-recent`;

  const loadPorts = () =>
    invoke<SerialPortInfo[]>("list_serial_ports")
      .then((list) => {
        setPorts(list);
        // Sin puerto elegido se propone el adaptador USB (consola típica) antes que un COM de la placa.
        const pick = list.find((x) => x.port_type.startsWith("USB")) ?? list[0];
        setS((p) => (p.serial_port || !pick ? p : { ...p, serial_port: pick.port_name }));
      })
      .catch(() => {});

  useEffect(() => {
    if (s.type === "serial") loadPorts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.type]);

  const modal = useModal({ onClose: onClose });

  const changeType = (type: QuickType) => {
    setError("");
    setS((p) => ({ ...p, type, port: portForType(p.type, p.port, type) }));
  };

  /** Rellena el formulario con un destino reciente (protocolo, usuario, host y puerto). */
  const pickRecent = (r: Session) => {
    setError("");
    setS((p) => ({ ...p, type: r.type, host: r.host, port: r.port, username: r.type === "ssh" ? r.username : p.username }));
    setListOpen(false);
    setActive(-1);
  };

  const remote = s.type !== "serial";
  const defaultName = remote ? suggestName(s.host) : (s.serial_port ?? "").split(/[\\/]/).pop() || s.serial_port || "";

  const submit = () => {
    const host = (s.host ?? "").trim();
    if (remote) {
      if (!host || !HOST.test(host) || host.includes("..")) return setError("Escribe un host o IP válido");
      if (!s.port || s.port < 1 || s.port > 65535) return setError("Puerto fuera de rango (1 a 65535)");
      if (s.type === "ssh" && s.username && !/^[\w.@-]+$/.test(s.username)) return setError("Usuario con caracteres no permitidos");
    } else if (!s.serial_port?.trim()) return setError("Elige un puerto serial");
    const session: Session = {
      ...s,
      host: remote ? host : undefined,
      username: s.type === "ssh" ? s.username?.trim() || undefined : undefined,
      identity_file: s.type === "ssh" ? s.identity_file?.trim() || undefined : undefined,
      legacy_ssh: s.type === "ssh" && s.legacy_ssh ? true : undefined,
      name: remote ? host : s.serial_port!.split(/[\\/]/).pop() || s.serial_port!,
      created_at: new Date().toISOString(),
    };
    // Mismo historial que la paleta (⌘K); el serial no tiene destino que recordar.
    if (session.type === "ssh" || session.type === "telnet")
      invoke("recent_target_add", { target: quickTarget(session) }).catch(() => {});
    if (save && onSave) onSave({ ...session, name: s.name.trim() || session.name, folder: normPath(folder) || undefined });
    else onOpen(session);
    onClose();
  };

  return (
    <div {...modal.overlay} className="fixed inset-0 z-50 grid place-items-center bg-black/25 p-4" onMouseDown={onClose}>
      <form
        {...modal.dialog}
        {...win.box}
        className="w-[440px] max-w-[96vw] max-h-[94vh] bg-panel border border-line rounded-xl shadow-pop overflow-hidden flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <header {...win.handle} className="flex items-center justify-between h-12 px-5 border-b border-line select-none">
          <h2 id={modal.titleId} className="flex items-center gap-2 text-[14px] font-semibold">
            <Zap size={15} className="text-warn" />
            Conexión rápida
          </h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" data-modal-close className="w-7 h-7 grid place-items-center rounded-md text-muted hover:text-fg hover:bg-hover">
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
          <Segmented
            fill
            size="lg"
            label="Tipo de conexión"
            value={s.type as QuickType}
            onChange={changeType}
            options={QUICK_TYPES.map((t) => [
              t.type,
              <span title={t.hint} className="flex items-center gap-1.5">
                <SessionIcon type={t.type} size={14} />
                {t.label}
              </span>,
            ] as const)}
          />

          {remote && (
            <Row cols="3fr 1fr">
              {/* Sin <label> envolvente: el nombre del campo no debe incluir el texto de la lista. */}
              <div className="min-w-0">
                <label htmlFor={`${id}-host`} className="block mb-1 text-[11.5px] font-medium text-muted">
                  Host
                </label>
                <div className="relative">
                  <input
                    id={`${id}-host`}
                    className="field"
                    autoFocus
                    role="combobox"
                    aria-expanded={showList}
                    aria-controls={listId}
                    aria-autocomplete="list"
                    aria-activedescendant={showList && active >= 0 ? `${id}-opt-${active}` : undefined}
                    autoComplete="off"
                    spellCheck={false}
                    value={s.host ?? ""}
                    placeholder="192.0.2.10 o hostname"
                    onFocus={() => setListOpen(true)}
                    onBlur={() => setListOpen(false)}
                    onChange={(e) => {
                      set("host", e.target.value);
                      setListOpen(true);
                      setActive(-1);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowDown" && matches.length) {
                        e.preventDefault();
                        setListOpen(true);
                        setActive((i) => (showList ? Math.min(i + 1, matches.length - 1) : 0));
                      } else if (e.key === "ArrowUp" && showList) {
                        e.preventDefault();
                        setActive((i) => Math.max(i - 1, 0));
                      } else if (e.key === "Enter" && showList && active >= 0) {
                        // Con un reciente marcado, Enter lo elige; si no, Enter conecta.
                        e.preventDefault();
                        pickRecent(matches[active]);
                      } else if (e.key === "Escape" && showList) {
                        // Esc cierra primero la lista y no el diálogo.
                        e.preventDefault();
                        setListOpen(false);
                        setActive(-1);
                      }
                    }}
                  />
                  {showList && (
                    <div className="absolute z-10 left-0 right-0 top-full mt-1 p-1 bg-panel border border-line rounded-lg shadow-pop">
                      <div aria-hidden className="px-2 pt-0.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                        Recientes
                      </div>
                      <ul id={listId} role="listbox" aria-label="Destinos recientes" className="max-h-56 overflow-y-auto">
                        {matches.map((r, i) => (
                          <li
                            key={quickTarget(r)}
                            id={`${id}-opt-${i}`}
                            role="option"
                            aria-selected={i === active}
                            onMouseMove={() => setActive(i)}
                            // mousedown: el campo no pierde el foco (ni se cierra la lista) antes del clic.
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => pickRecent(r)}
                            className={`flex items-center gap-2 px-2 h-8 rounded-md cursor-default ${
                              i === active ? "bg-selected shadow-[inset_2px_0_0_0_var(--accent)]" : ""
                            }`}
                          >
                            <History aria-hidden size={13} className="text-muted shrink-0" />
                            <span className="flex-1 min-w-0 truncate">{sessionTarget(r)}</span>
                            <span className="text-[11px] font-medium text-muted uppercase">{labelOf(r.type)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
              <Field label="Puerto">
                <input
                  className="field"
                  type="number"
                  min={1}
                  max={65535}
                  value={s.port ?? ""}
                  onChange={(e) => set("port", Number(e.target.value) || undefined)}
                />
              </Field>
            </Row>
          )}

          {s.type === "ssh" && (
            <Row>
              <Field label="Usuario">
                <input className="field" value={s.username ?? ""} placeholder="Según ~/.ssh/config" onChange={(e) => set("username", e.target.value)} />
              </Field>
              <Field label="Llave privada (opcional)">
                <input className="field" value={s.identity_file ?? ""} placeholder="~/.ssh/id_ed25519" onChange={(e) => set("identity_file", e.target.value)} />
              </Field>
            </Row>
          )}

          {s.type === "raw" && (
            <p className="text-[11.5px] text-muted">TCP crudo: sin negociación Telnet, para servidores de consola (puertos 2001+, 7001+).</p>
          )}

          {s.type === "serial" && (
            <>
              {/* Puerto a todo el ancho: el nombre del adaptador (FTDI, CH340) distingue un cable de otro. */}
              <Field label="Puerto">
                <SerialPortField value={s.serial_port ?? ""} ports={ports} onChange={(v) => set("serial_port", v)} onRefresh={loadPorts} autoFocus />
              </Field>
              <SerialLine session={s} set={set} />
              {ports.length === 0 && <p className="text-[11.5px] text-muted">No se detectaron adaptadores. Conecta el cable USB-serial y presiona actualizar.</p>}
            </>
          )}

          <details className="rounded-lg border border-line" open={advanced} onToggle={(e) => setAdvanced(e.currentTarget.open)}>
            <summary className="px-3 h-8 flex items-center text-[12.5px] cursor-default">
              Opciones avanzadas
              {!advanced && s.type === "ssh" && s.legacy_ssh && <span className="ml-1.5 text-muted">· algoritmos legacy</span>}
            </summary>
            <div className="px-3 pb-3 space-y-3">
              {s.type === "ssh" && (
                <label className="flex items-start gap-2.5 text-[12.5px]">
                  <input type="checkbox" className="mt-0.5 accent-[var(--accent)]" checked={!!s.legacy_ssh} onChange={(e) => set("legacy_ssh", e.target.checked)} />
                  <span>
                    Permitir algoritmos legacy
                    <span className="block text-muted">Equipos antiguos: ssh-rsa, DH group1/14, cifrados CBC y MAC sha1/md5.</span>
                  </span>
                </label>
              )}
              <div>
                <Field label="Retroceso envía">
                  <select
                    className="field"
                    value={s.backspace ?? ""}
                    onChange={(e) => set("backspace", (e.target.value || undefined) as Session["backspace"])}
                  >
                    {backspaceOptions().map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </Field>
                <p className="mt-1 text-[11px] text-muted">Si Retroceso no borra (equipos Huawei VRP), usa BS (^H).</p>
              </div>
            </div>
          </details>

          {onSave ? (
            <div className="space-y-3">
              <label className="flex items-start gap-2.5 text-[12.5px]">
                <input type="checkbox" className="mt-0.5 accent-[var(--accent)]" checked={save} onChange={(e) => setSave(e.target.checked)} />
                <span>
                  Guardar en sesiones
                  <span className="block text-muted">Queda en el árbol de sesiones al conectar. Sin marcar, la conexión no se guarda.</span>
                </span>
              </label>
              {save && (
                <Row>
                  <Field label="Nombre">
                    <input className="field" value={s.name} placeholder={defaultName || "Router core"} onChange={(e) => set("name", e.target.value)} />
                  </Field>
                  <Field label="Carpeta">
                    <input className="field" list={`${id}-folders`} value={folder} placeholder="Raíz · usa / para subcarpetas" onChange={(e) => setFolder(e.target.value)} />
                    <datalist id={`${id}-folders`}>
                      {folders.map((f) => (
                        <option key={f} value={f} />
                      ))}
                    </datalist>
                  </Field>
                </Row>
              )}
            </div>
          ) : (
            <p className="text-[11.5px] text-muted">
              La sesión no se guarda. Después puedes guardarla desde el menú de la pestaña o la barra de estado ("Guardar como sesión…").
            </p>
          )}

          {error && <p role="alert" className="text-[12px] text-danger">{error}</p>}
        </div>

        <footer className="flex justify-end gap-2 px-5 h-14 border-t border-line items-center">
          <button type="button" onClick={onClose} className="px-3 h-8 rounded-md border border-line hover:bg-hover">
            Cancelar
          </button>
          <button type="submit" className="px-3 h-8 rounded-md bg-accent text-accent-fg font-medium hover:opacity-90">
            {save && onSave ? "Guardar y conectar" : "Conectar"}
          </button>
        </footer>
      </form>
    </div>
  );
}

/**
 * Línea serial resumida ("9600 8N1 · sin flujo · Cambiar"): casi siempre queda en 8N1 sin flujo, así
 * que velocidad, datos, paridad, stop y flujo se despliegan solo al pedirlo.
 */
function SerialLine({ session: s, set }: { session: Session; set: <K extends keyof Session>(k: K, v: Session[K]) => void }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[12.5px]">
        <span className="text-[11.5px] font-medium text-muted">Línea</span>
        <span id={`${id}-sum`} className="tabular-nums">
          {serialSummary(s)}
        </span>
        <span aria-hidden className="text-muted">·</span>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-fields`}
          aria-describedby={`${id}-sum`}
          onClick={() => setOpen((o) => !o)}
          className="px-1.5 h-6 rounded-md text-accent font-medium hover:bg-hover"
        >
          {open ? "Ocultar" : "Cambiar"}
        </button>
      </div>
      {open && (
        <div id={`${id}-fields`} className="mt-2 space-y-3">
          <Row cols="2fr 1fr 1fr">
            <Field label="Velocidad">
              <select className="field" value={s.baud_rate ?? 9600} onChange={(e) => set("baud_rate", Number(e.target.value))}>
                {BAUDS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Datos">
              <select className="field" value={s.data_bits ?? 8} onChange={(e) => set("data_bits", Number(e.target.value))}>
                {DATA_BITS.map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
            </Field>
            <Field label="Stop">
              <select className="field" value={s.stop_bits ?? 1} onChange={(e) => set("stop_bits", Number(e.target.value))}>
                {STOP_BITS.map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
            </Field>
          </Row>
          <Row>
            <Field label="Paridad">
              <select className="field" value={s.parity ?? "none"} onChange={(e) => set("parity", e.target.value as Session["parity"])}>
                {PARITY_OPTIONS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Control de flujo">
              <select className="field" value={s.flow_control ?? "none"} onChange={(e) => set("flow_control", e.target.value as Session["flow_control"])}>
                {FLOW_OPTIONS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
          </Row>
        </div>
      )}
    </div>
  );
}

function Row({ children, cols = "1fr 1fr" }: { children: React.ReactNode; cols?: string }) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: cols }}>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="block mb-1 text-[11.5px] font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}
