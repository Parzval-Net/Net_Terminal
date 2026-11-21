import { memo, useEffect, useMemo, useRef, useState } from "react";
import { BellOff, Pause, Pencil, Play, Plus, RotateCcw, Trash2, Volume2, VolumeX } from "lucide-react";
import { MonitorStatus, MonitorTarget, Sample, fmtDuration, stats, targetErrors } from "../../lib/monitors";
import { LineChart } from "./LineChart";
import { Btn, Label, Metric, Section, StatusPill, ToolHeader, Toggle, fmtMs } from "./ui";
import { Segmented } from "../controls";

interface Props {
  targets: MonitorTarget[];
  samples: Record<string, Sample[]>;
  status: Record<string, MonitorStatus>;
  onChange: (targets: MonitorTarget[]) => void;
  onClear: (id: string) => void;
  onSilence: (id: string) => void;
}

const WINDOWS: [string, number][] = [
  ["5 min", 5 * 60_000],
  ["15 min", 15 * 60_000],
  ["1 h", 60 * 60_000],
];

const timeLabel = (x: number) => new Date(x).toLocaleTimeString("es-CL");

const blank = (): MonitorTarget => ({
  id: `mon-${Date.now().toString(36)}`,
  name: "",
  kind: "icmp",
  host: "",
  intervalMs: 1000,
  timeoutMs: 1000,
  threshold: 3,
  sound: true,
  repeatSec: 30,
  active: true,
});

export function MonitorTool({ targets, samples, status, onChange, onClear, onSilence }: Props) {
  const [editing, setEditing] = useState<MonitorTarget | null>(null);
  const [win, setWin] = useState(WINDOWS[0][1]);

  const save = (t: MonitorTarget) => {
    const name = t.name.trim() || `${t.host}${t.kind === "tcp" ? `:${t.port}` : ""}`;
    // "Guardar e iniciar" hace lo que dice: una sonda pausada queda activa al guardarla.
    const next = { ...t, name, active: true };
    onChange(targets.some((x) => x.id === t.id) ? targets.map((x) => (x.id === t.id ? next : x)) : [...targets, next]);
    setEditing(null);
  };
  const patch = (id: string, p: Partial<MonitorTarget>) => onChange(targets.map((t) => (t.id === id ? { ...t, ...p } : t)));

  // Acciones estables: cada muestra solo redibuja la tarjeta de su sonda.
  const latest = useRef({ targets, onChange, onClear, onSilence, patch });
  latest.current = { targets, onChange, onClear, onSilence, patch };
  const actions = useMemo<CardActions>(
    () => ({
      toggle: (t) => latest.current.patch(t.id, { active: !t.active }),
      sound: (t) => latest.current.patch(t.id, { sound: !t.sound }),
      edit: (t) => setEditing(t),
      clear: (id) => latest.current.onClear(id),
      silence: (id) => latest.current.onSilence(id),
      remove: (id) => latest.current.onChange(latest.current.targets.filter((x) => x.id !== id)),
    }),
    [],
  );

  return (
    <div className="space-y-4">
      <ToolHeader
        title="Monitoreo"
        description="Vigila que un equipo responda (ICMP) o que un acceso esté disponible (TCP: 22, 23, 443…). Suena una alarma al caer y otra al recuperarse, aunque estés en otra pestaña."
        actions={
          <>
            <Segmented size="sm" label="Ventana de los gráficos" value={win} onChange={setWin} options={WINDOWS.map(([label, ms]) => [ms, label] as const)} />
            <Btn kind="primary" onClick={() => setEditing(blank())}>
              <Plus size={14} /> Nueva sonda
            </Btn>
          </>
        }
      />

      {/* key: al editar otra sonda (o pedir una nueva) el formulario se remonta con sus datos; sin
          ella quedaban los campos y el id de la primera y se guardaba encima de esa. */}
      {editing && <MonitorForm key={editing.id} initial={editing} onSave={save} onCancel={() => setEditing(null)} />}

      {targets.length === 0 && !editing && (
        <div className="rounded-xl border border-dashed border-line p-8 text-center text-body-sm text-muted">
          Agrega una sonda para monitorear un router, un enlace o un acceso SSH.
        </div>
      )}

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(420px,1fr))]">
        {targets.map((t) => (
          <MonitorCard
            key={t.id}
            target={t}
            samples={samples[t.id] ?? []}
            status={status[t.id]}
            windowMs={win}
            actions={actions}
          />
        ))}
      </div>
    </div>
  );
}

interface CardActions {
  toggle: (t: MonitorTarget) => void;
  sound: (t: MonitorTarget) => void;
  edit: (t: MonitorTarget) => void;
  clear: (id: string) => void;
  silence: (id: string) => void;
  remove: (id: string) => void;
}

const MonitorCard = memo(function MonitorCard(p: {
  target: MonitorTarget;
  samples: Sample[];
  status?: MonitorStatus;
  windowMs: number;
  actions: CardActions;
}) {
  const { target: t, status, actions: a } = p;
  const visible = useMemo(() => {
    const cut = Date.now() - p.windowMs;
    return p.samples.filter((s) => s.ts >= cut);
  }, [p.samples, p.windowMs]);
  const st = useMemo(() => stats(visible), [visible]);
  const points = useMemo(() => visible.map((s) => ({ x: s.ts, y: s.ok ? s.rtt : null, note: s.error ?? undefined })), [visible]);
  const state = !t.active ? "stopped" : (status?.state ?? "unknown");
  const label =
    state === "stopped" ? "Pausada" : state === "up" ? "Arriba" : state === "down" ? "Caído" : "Esperando datos";
  const since = status && t.active && status.state !== "unknown" ? fmtDuration(Date.now() - status.since) : null;
  const configError = t.active ? status?.configError : undefined;
  const [confirmDel, setConfirmDel] = useState(false);

  return (
    // El estado y las acciones van en una fila propia bajo el título: a la derecha del encabezado le
    // quitaban casi todo el ancho y el nombre de la sonda quedaba truncado ("Gateway sitio ce…").
    // El espacio duro en "cada N s" evita que la unidad quede sola en otra línea.
    <Section title={t.name} hint={`${t.kind === "tcp" ? `TCP ${t.host}:${t.port}` : `ICMP ${t.host}`} · cada ${t.intervalMs / 1000}\u00a0s`}>
      <div className="flex items-center justify-between gap-2 -mt-1 mb-3">
        {configError ? (
          <StatusPill state="down" label="Error de configuración" />
        ) : (
          <StatusPill state={state} label={since ? `${label} · ${since}` : label} />
        )}
        {confirmDel ? (
          <div className="flex items-center gap-2 shrink-0" role="group" aria-label={`Eliminar ${t.name}`}>
            <span className="text-body-sm">¿Eliminar la sonda?</span>
            <Btn autoFocus onClick={() => setConfirmDel(false)}>
              Cancelar
            </Btn>
            <Btn kind="danger" onClick={() => a.remove(t.id)}>
              Eliminar
            </Btn>
          </div>
        ) : (
          <div className="flex items-center gap-1 shrink-0" role="group" aria-label={`Acciones de ${t.name}`}>
            {/* Conmutadores con nombre fijo y aria-pressed: el lector anuncia el estado, no solo el ícono. */}
            <Btn kind="ghost" className="!px-1.5" title={t.active ? "Pausar" : "Reanudar"} aria-label="Pausar" aria-pressed={!t.active} onClick={() => a.toggle(t)}>
              {t.active ? <Pause size={14} /> : <Play size={14} />}
            </Btn>
            <Btn
              kind="ghost"
              className="!px-1.5"
              title={t.sound ? "Silenciar sonda" : "Activar sonido"}
              aria-label="Silenciar sonda"
              aria-pressed={!t.sound}
              onClick={() => a.sound(t)}
            >
              {t.sound ? <Volume2 size={14} /> : <VolumeX size={14} />}
            </Btn>
            {state === "down" && t.sound && (
              <Btn kind="ghost" className="!px-1.5" title="Detener la alarma repetida" aria-label="Detener la alarma repetida" onClick={() => a.silence(t.id)}>
                <BellOff size={14} />
              </Btn>
            )}
            <Btn kind="ghost" className="!px-1.5" title="Editar" aria-label="Editar" onClick={() => a.edit(t)}>
              <Pencil size={13} />
            </Btn>
            <Btn kind="ghost" className="!px-1.5" title="Reiniciar estadísticas" aria-label="Reiniciar estadísticas" onClick={() => a.clear(t.id)}>
              <RotateCcw size={13} />
            </Btn>
            <Btn kind="ghost" className="!px-1.5 hover:!text-danger" title="Eliminar" aria-label="Eliminar" onClick={() => setConfirmDel(true)}>
              <Trash2 size={13} />
            </Btn>
          </div>
        )}
      </div>
      {/* Indicadores sin marco propio (la tarjeta ya lo tiene) y sin truncar: si un valor no cabe, pasa a dos líneas. */}
      <div className="grid grid-cols-5 gap-x-3 gap-y-2 mb-3">
        <Metric label="Actual" value={st.last?.ok ? fmtMs(st.last.rtt) : st.last ? "Sin resp." : "—"} tone={st.last && !st.last.ok ? "danger" : undefined} />
        <Metric label="Promedio" value={fmtMs(st.avg)} />
        <Metric label="Mín / máx" value={st.min == null ? "—" : `${st.min.toFixed(0)} / ${st.max!.toFixed(0)}`} />
        <Metric label="Jitter" value={fmtMs(st.jitter)} />
        <LossMetric lost={st.lost} sent={st.sent} loss={st.loss} />
      </div>
      <LineChart
        title={`Latencia de ${t.name}`}
        unit="ms"
        height={140}
        points={points}
        xLabel={timeLabel}
      />
      {configError && <p className="mt-2 text-body-sm text-danger">✕ {configError}. Edita la sonda para corregirlo.</p>}
      {!configError && status?.state === "down" && status.lastError && (
        <p className="mt-2 text-body-sm text-danger">✕ {status.lastError}</p>
      )}
      {status && status.downCount > 0 && (
        <p className="mt-1 text-body-sm text-muted tabular-nums">Caídas desde que inició: {status.downCount}</p>
      )}
    </Section>
  );
});

/**
 * Pérdida con el mismo aspecto que Metric, pero con el rótulo corto y el detalle (perdidos/enviados)
 * junto al valor en tono muted: con "Pérdida (14/300)" el rótulo pasaba a dos líneas y su valor
 * quedaba más abajo que los de las otras métricas.
 */
function LossMetric({ lost, sent, loss }: { lost: number; sent: number; loss: number }) {
  const color = loss >= 5 ? "text-danger" : loss > 0 ? "text-warn" : sent ? "text-ok" : "text-fg";
  return (
    <div className="min-w-0">
      <div className="text-caption text-muted leading-tight">Pérdida</div>
      <div className="mt-0.5 leading-snug tabular-nums [overflow-wrap:anywhere]">
        <span className={`text-title font-semibold ${color}`}>{sent ? `${loss.toFixed(1)} %` : "—"}</span>{" "}
        <span className="text-caption text-muted" title={`${lost} de ${sent} sin respuesta`}>
          {lost}/{sent}
        </span>
      </div>
    </div>
  );
}

function MonitorForm({ initial, onSave, onCancel }: { initial: MonitorTarget; onSave: (t: MonitorTarget) => void; onCancel: () => void }) {
  const [t, setT] = useState(initial);
  const set = <K extends keyof MonitorTarget>(k: K, v: MonitorTarget[K]) => setT((p) => ({ ...p, [k]: v }));
  // Misma regla que el backend (validate_host y puerto u16): un valor inválido se explica aquí y no
  // deja la tarjeta en "Esperando datos" con un error técnico de Tauri.
  const errs = targetErrors(t);
  const valid = !errs.host && !errs.port;
  // El host vacío de una sonda nueva no se marca como error hasta que se escriba algo.
  const hostMsg = t.host ? errs.host : undefined;
  const portMsg = t.kind === "tcp" && t.port != null ? errs.port : undefined;
  // El formulario se abre arriba de la lista: al editar una tarjeta de más abajo quedaba fuera de la vista.
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => box.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }), []);
  return (
    <div ref={box} className="scroll-mt-4">
      <Section title={initial.name ? "Editar sonda" : "Nueva sonda"}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) onSave(t);
          }}
        >
          <div className="grid grid-cols-[1fr_1fr_110px_90px] gap-3">
            <Label text="Nombre">
              <input className="field" value={t.name} placeholder="Core SCL" onChange={(e) => set("name", e.target.value)} />
            </Label>
            <Label text="Host o IP">
              <input
                autoFocus
                className="field"
                value={t.host}
                placeholder="192.0.2.10"
                aria-invalid={!!hostMsg}
                aria-describedby={hostMsg ? `${t.id}-host-err` : undefined}
                onChange={(e) => set("host", e.target.value.trim())}
              />
              {hostMsg && (
                <span id={`${t.id}-host-err`} className="block mt-1 text-body-sm text-danger">
                  {hostMsg}
                </span>
              )}
            </Label>
            <Label text="Tipo">
              <select className="field" value={t.kind} onChange={(e) => set("kind", e.target.value as MonitorTarget["kind"])}>
                <option value="icmp">ICMP (ping)</option>
                <option value="tcp">TCP (puerto)</option>
              </select>
            </Label>
            <Label text="Puerto">
              <input
                className="field"
                type="number"
                disabled={t.kind !== "tcp"}
                value={t.port ?? ""}
                placeholder="22"
                min={1}
                max={65535}
                aria-invalid={!!portMsg}
                aria-describedby={portMsg ? `${t.id}-port-err` : undefined}
                onChange={(e) => set("port", Number(e.target.value) || undefined)}
              />
              {portMsg && (
                <span id={`${t.id}-port-err`} className="block mt-1 text-body-sm text-danger">
                  {portMsg}
                </span>
              )}
            </Label>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <Label text="Intervalo">
              <select className="field" value={t.intervalMs} onChange={(e) => set("intervalMs", Number(e.target.value))}>
                {[500, 1000, 2000, 5000, 10000, 30000, 60000].map((v) => (
                  <option key={v} value={v}>
                    {v < 1000 ? `${v} ms` : `${v / 1000} s`}
                  </option>
                ))}
              </select>
            </Label>
            <Label text="Timeout">
              <select className="field" value={t.timeoutMs} onChange={(e) => set("timeoutMs", Number(e.target.value))}>
                {[500, 1000, 2000, 3000, 5000].map((v) => (
                  <option key={v} value={v}>
                    {v} ms
                  </option>
                ))}
              </select>
            </Label>
            <Label text="Caído tras">
              <select className="field" value={t.threshold} onChange={(e) => set("threshold", Number(e.target.value))}>
                {[1, 2, 3, 5, 10].map((v) => (
                  <option key={v} value={v}>
                    {v} {v === 1 ? "falla" : "fallas seguidas"}
                  </option>
                ))}
              </select>
            </Label>
            <Label text="Repetir alarma">
              <select className="field" value={t.repeatSec} onChange={(e) => set("repeatSec", Number(e.target.value))}>
                <option value={0}>No repetir</option>
                {[10, 30, 60, 300].map((v) => (
                  <option key={v} value={v}>
                    Cada {v < 60 ? `${v} s` : `${v / 60} min`}
                  </option>
                ))}
              </select>
            </Label>
          </div>
          <div className="flex items-center justify-between">
            <Toggle checked={t.sound} onChange={(v) => set("sound", v)} label="Alarma sonora" />
            <div className="flex gap-2">
              <Btn type="button" onClick={onCancel}>
                Cancelar
              </Btn>
              <Btn type="submit" kind="primary" disabled={!valid}>
                Guardar e iniciar
              </Btn>
            </div>
          </div>
        </form>
      </Section>
    </div>
  );
}
