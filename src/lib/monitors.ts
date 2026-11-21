import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { alarmDown, alarmUp } from "./sound";

export interface MonitorTarget {
  id: string;
  name: string;
  kind: "icmp" | "tcp";
  host: string;
  port?: number;
  intervalMs: number;
  timeoutMs: number;
  /** Fallas consecutivas para declarar caída. */
  threshold: number;
  sound: boolean;
  /** Repetir la alarma mientras siga caído (segundos, 0 = no repetir). */
  repeatSec: number;
  active: boolean;
}

export interface Sample {
  ts: number;
  ok: boolean;
  rtt: number | null;
  error?: string | null;
}

export type MonitorState = "unknown" | "up" | "down";

export interface MonitorStatus {
  state: MonitorState;
  since: number;
  failStreak: number;
  lastError?: string | null;
  downCount: number;
  /** El backend rechazó la sonda (host o puerto inválido): no llegan muestras. */
  configError?: string;
}

const MAX_SAMPLES = 3600;

export function stats(samples: Sample[]) {
  const ok = samples.filter((s) => s.ok && s.rtt != null).map((s) => s.rtt as number);
  const lost = samples.length - samples.filter((s) => s.ok).length;
  const avg = ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : null;
  const jitter =
    ok.length > 1 ? ok.slice(1).reduce((acc, v, i) => acc + Math.abs(v - ok[i]), 0) / (ok.length - 1) : null;
  return {
    sent: samples.length,
    lost,
    loss: samples.length ? (lost / samples.length) * 100 : 0,
    min: ok.length ? Math.min(...ok) : null,
    max: ok.length ? Math.max(...ok) : null,
    avg,
    jitter,
    last: samples.at(-1) ?? null,
  };
}

export function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${s % 60} s`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

/** Qué alarma corresponde a una muestra: caída, recuperación o caída sin estado previo. */
export type Transition = "down" | "up" | "firstDown" | null;

/** Estado tras una muestra. Puro para poder probar las alarmas sin el backend. */
export function nextStatus(
  prev: MonitorStatus | undefined,
  sample: Sample,
  threshold: number,
): { next: MonitorStatus; event: Transition } {
  const p = prev ?? { state: "unknown" as MonitorState, since: sample.ts, failStreak: 0, downCount: 0 };
  const failStreak = sample.ok ? 0 : p.failStreak + 1;
  let state: MonitorState = p.state;
  if (sample.ok) state = "up";
  else if (failStreak >= threshold) state = "down";
  const changed = state !== p.state;
  const next: MonitorStatus = {
    state,
    since: changed ? sample.ts : p.since,
    failStreak,
    lastError: sample.error,
    downCount: p.downCount + (changed && state === "down" ? 1 : 0),
  };
  let event: Transition = null;
  if (changed && state === "down") event = p.state === "unknown" ? "firstDown" : "down";
  else if (changed && state === "up" && p.state !== "unknown") event = "up";
  return { next, event };
}

/** Ids que estaban en la pasada anterior y ya no están (sondas eliminadas). */
export function removedIds(prev: string[], next: string[]): string[] {
  const keep = new Set(next);
  return prev.filter((id) => !keep.has(id));
}

/** Misma regla que validate_host en monitor.rs: así el error se ve junto al campo y no en el backend. */
export function hostError(host: string): string | null {
  const h = host.trim();
  if (!h) return "Ingresa un host o IP";
  const inner = h.startsWith("[") && h.endsWith("]") ? h.slice(1, -1) : h;
  if (!inner || h.length > 253 || inner.startsWith("-") || !/^[A-Za-z0-9.\-:_%]+$/.test(inner))
    return "Host inválido: usa letras sin tilde, números, punto, guion o dos puntos";
  return null;
}

/** Errores por campo del formulario de sonda (vacío si se puede guardar). */
export function targetErrors(t: Pick<MonitorTarget, "kind" | "host" | "port">): { host?: string; port?: string } {
  const out: { host?: string; port?: string } = {};
  const h = hostError(t.host);
  if (h) out.host = h;
  if (t.kind === "tcp" && !(Number.isInteger(t.port) && t.port! >= 1 && t.port! <= 65535))
    out.port = "Puerto de 1 a 65535";
  return out;
}

export const MAX_PORTS = 1024;

/**
 * "22,23,80-85" -> puertos únicos. Informa los trozos inválidos y si se pasó del máximo que
 * acepta el backend, en vez de descartarlos en silencio.
 */
export function parsePortList(text: string, max = MAX_PORTS): { ports: number[]; invalid: string[]; truncated: boolean } {
  const out = new Set<number>();
  const invalid: string[] = [];
  let truncated = false;
  for (const part of text.split(/[\s,;]+/).filter(Boolean)) {
    const m = part.match(/^(\d+)(?:-(\d+))?$/);
    const a = m ? Number(m[1]) : NaN;
    const b = m?.[2] ? Number(m[2]) : a;
    if (!m || a < 1 || b < 1 || a > 65535 || b > 65535) {
      invalid.push(part);
      continue;
    }
    for (let p = Math.min(a, b); p <= Math.max(a, b); p++) {
      if (out.has(p)) continue;
      if (out.size >= max) {
        truncated = true;
        break;
      }
      out.add(p);
    }
  }
  return { ports: [...out], invalid, truncated };
}

export type PortState = "open" | "refused" | "filtered" | "error";

/**
 * Cerrado (el equipo responde con RST) y filtrado (sin respuesta: ACL o firewall) son
 * diagnósticos distintos. Textos de std::io en Linux, macOS y Windows.
 */
export function portState(row: { open: boolean; error: string | null }): PortState {
  if (row.open) return "open";
  const e = (row.error ?? "").toLowerCase();
  if (/refused|rechaz|10061|os error 111\b|os error 61\b/.test(e)) return "refused";
  if (/timed out|timeout|tiempo de espera|10060|os error 110\b|os error 60\b/.test(e)) return "filtered";
  return "error";
}

/**
 * Estado global de sondas: vive en App para que las alarmas suenen aunque la pestaña
 * de herramientas no esté visible.
 */
/** Ventana para agrupar muestras de sondas que llegan casi juntas (un render por grupo). */
const MONITOR_BATCH_MS = 50;

export function useMonitors(
  targets: MonitorTarget[],
  notify: (text: string, kind: "info" | "error") => void,
) {
  const [samples, setSamples] = useState<Record<string, Sample[]>>({});
  const [status, setStatus] = useState<Record<string, MonitorStatus>>({});
  const targetsRef = useRef(targets);
  targetsRef.current = targets;
  const statusRef = useRef(status);
  statusRef.current = status;
  const repeatTimers = useRef<Record<string, number>>({});

  const clearRepeat = (id: string) => {
    window.clearInterval(repeatTimers.current[id]);
    delete repeatTimers.current[id];
  };

  // Alarma de caída y su repetición. El intervalo revisa la sonda en cada vuelta: si se
  // silenció, se pausó o se eliminó, se corta en vez de seguir sonando.
  const raise = (t: MonitorTarget) => {
    if (!t.sound) return;
    alarmDown();
    clearRepeat(t.id);
    if (t.repeatSec > 0) {
      repeatTimers.current[t.id] = window.setInterval(() => {
        const cur = targetsRef.current.find((x) => x.id === t.id);
        if (!cur || !cur.sound || !cur.active || statusRef.current[t.id]?.state !== "down") return clearRepeat(t.id);
        alarmDown();
      }, t.repeatSec * 1000);
    }
  };

  const drop = (id: string) => {
    clearRepeat(id);
    setSamples((s) => {
      if (!(id in s)) return s;
      const { [id]: _drop, ...rest } = s;
      return rest;
    });
    const { [id]: _gone, ...rest } = statusRef.current;
    statusRef.current = rest;
    setStatus(rest);
  };

  const setConfigError = (id: string, msg: string | undefined) => {
    const prev = statusRef.current[id];
    if (!prev && !msg) return;
    if (prev?.configError === msg) return;
    const base = prev ?? { state: "unknown" as MonitorState, since: Date.now(), failStreak: 0, downCount: 0 };
    statusRef.current = { ...statusRef.current, [id]: { ...base, configError: msg } };
    setStatus(statusRef.current);
  };

  // Arranca/detiene en el backend según el estado "active". Las sondas que desaparecen de la
  // lista (eliminadas) también se detienen: si no, el hilo seguía sondeando y la alarma sonando.
  const signature = targets
    .map((t) => [t.id, t.active, t.kind, t.host, t.port, t.intervalMs, t.timeoutMs].join("|"))
    .join(";");
  const prevIds = useRef<string[]>([]);
  useEffect(() => {
    for (const id of removedIds(prevIds.current, targets.map((t) => t.id))) {
      invoke("monitor_stop", { id }).catch(() => {});
      drop(id);
    }
    prevIds.current = targets.map((t) => t.id);
    for (const t of targets) {
      if (t.active) {
        invoke("monitor_start", {
          cfg: { id: t.id, kind: t.kind, host: t.host, port: t.port, interval_ms: t.intervalMs, timeout_ms: t.timeoutMs },
        })
          .then(() => setConfigError(t.id, undefined))
          .catch((e) => {
            setConfigError(t.id, String(e));
            notify(`${t.name}: ${e}`, "error");
          });
      } else {
        invoke("monitor_stop", { id: t.id }).catch(() => {});
        clearRepeat(t.id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  useEffect(() => {
    // Cada muestra re-dibujaba App entera. Las sondas que arrancan juntas con el mismo intervalo
    // llegan casi a la vez: se agrupan las que llegan en MONITOR_BATCH_MS y se aplican en un solo
    // render. Avisos y alarmas se procesan en el mismo orden de llegada.
    let queue: (Sample & { id: string })[] = [];
    let timer: number | undefined;
    const flush = () => {
      timer = undefined;
      const batch = queue;
      queue = [];
      if (!batch.length) return;
      setSamples((all) => {
        const out = { ...all };
        for (const { id, ...sample } of batch) {
          const list = out[id] ?? [];
          out[id] = list.length >= MAX_SAMPLES ? [...list.slice(-MAX_SAMPLES + 1), sample] : [...list, sample];
        }
        return out;
      });
      for (const { id, ...sample } of batch) onSample(id, sample);
      setStatus(statusRef.current);
    };
    const onSample = (id: string, sample: Sample) => {
      const t = targetsRef.current.find((x) => x.id === id);
      const { next, event } = nextStatus(statusRef.current[id], sample, t?.threshold ?? 3);
      const prevSince = statusRef.current[id]?.since ?? sample.ts;
      statusRef.current = { ...statusRef.current, [id]: next };

      if (!t) return;
      if (event === "down") {
        notify(`${t.name} CAÍDO: ${sample.error ?? "sin respuesta"}`, "error");
        raise(t);
      } else if (event === "firstDown") {
        // Ya estaba caído al iniciar: misma alarma repetida que una caída normal.
        notify(`${t.name} no responde`, "error");
        raise(t);
      } else if (event === "up") {
        clearRepeat(id);
        notify(`${t.name} recuperado tras ${fmtDuration(sample.ts - prevSince)}`, "info");
        if (t.sound) alarmUp();
      }
    };
    const un = listen<Sample & { id: string }>("monitor-sample", ({ payload }) => {
      queue.push(payload);
      timer ??= window.setTimeout(flush, MONITOR_BATCH_MS);
    });
    return () => {
      window.clearTimeout(timer);
      un.then((f) => f());
      Object.keys(repeatTimers.current).forEach(clearRepeat);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notify]);

  const clear = useCallback((id: string) => {
    setSamples((s) => ({ ...s, [id]: [] }));
    // El error de configuración no es una estadística: se mantiene hasta que la sonda arranque.
    const { [id]: old, ...rest } = statusRef.current;
    statusRef.current = old?.configError
      ? { ...rest, [id]: { state: "unknown", since: Date.now(), failStreak: 0, downCount: 0, configError: old.configError } }
      : rest;
    setStatus(statusRef.current);
    clearRepeat(id);
  }, []);

  const silence = useCallback((id: string) => clearRepeat(id), []);

  const downCount = Object.entries(status).filter(
    ([id, s]) => s.state === "down" && targets.some((t) => t.id === id && t.active),
  ).length;

  // Mismo objeto mientras no lleguen muestras: las vistas memorizadas no se redibujan.
  return useMemo(() => ({ samples, status, clear, silence, downCount }), [samples, status, clear, silence, downCount]);
}
