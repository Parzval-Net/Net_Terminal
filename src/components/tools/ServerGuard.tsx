import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import type { Settings } from "../../lib/settings";
import { ALL, GUARD_LABEL, GuardKind, GuardOpts, GuardPrefs, LocalIf, guardSummary, idleMinutes, parseAllow, prefsOf, resolveBind, serverOpts } from "../../lib/serverGuard";
import { Collapsible, Label, Toggle } from "./ui";

export interface GuardStat {
  rejected: number;
  last: string | null;
}

interface GuardEvent extends GuardStat {
  kind: string;
}

/**
 * Orígenes rechazados por cada servidor en marcha (los avisa el backend, como máximo uno por
 * segundo). Al detenerse un servidor su contador desaparece.
 */
export function useGuardStats(running: string[]): Record<string, GuardStat> {
  const [stats, setStats] = useState<Record<string, GuardStat>>({});
  useEffect(() => {
    const un = listen<GuardEvent>("server-guard", ({ payload }) => setStats((s) => ({ ...s, [payload.kind]: { rejected: payload.rejected, last: payload.last } })));
    return () => {
      un.then((f) => f());
    };
  }, []);
  // Al cambiar los servidores activos se sincroniza con el backend (lo ocurrido con otra vista cerrada).
  const key = running.join(",");
  useEffect(() => {
    invoke<(GuardEvent & { rejected: number })[]>("server_guard")
      .then((l) => setStats(Object.fromEntries((l ?? []).filter((g) => running.includes(g.kind)).map((g) => [g.kind, { rejected: g.rejected, last: g.last }]))))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return stats;
}

/** Preferencias de acceso de un servidor y las opciones que se pasan al iniciarlo. */
export function useGuardPrefs(kind: GuardKind, settings: Settings, onChange: (p: Partial<Settings>) => void, ips: LocalIf[]) {
  const prefs = prefsOf(settings.serverGuard, kind);
  const { bind, stale } = resolveBind(prefs, ips);
  const set = (patch: Partial<GuardPrefs>) => onChange({ serverGuard: { ...(settings.serverGuard ?? {}), [kind]: { ...prefs, ...patch } } });
  const opts = (): GuardOpts => serverOpts(settings.serverGuard, kind, bind);
  const allowErrors = parseAllow(prefs.allow).errors;
  return { prefs, bind, stale, set, opts, allowErrors };
}

/** IP que van en los comandos copiados al equipo: la de escucha si es una sola; si no, la elegida. */
export const commandIp = (bind: string, chosen: string) => (bind !== ALL && bind ? bind : chosen);

/**
 * Acceso del servidor: interfaz de escucha, clientes permitidos (IP o CIDR), detención por
 * inactividad y los orígenes rechazados. Los cambios aplican al iniciar: con el servidor activo
 * los campos quedan bloqueados.
 */
export function ServerGuardPanel({
  kind,
  settings,
  onChange,
  ips,
  running,
  stat,
}: {
  kind: GuardKind;
  settings: Settings;
  onChange: (p: Partial<Settings>) => void;
  ips: LocalIf[];
  running: boolean;
  stat?: GuardStat;
}) {
  const g = useGuardPrefs(kind, settings, onChange, ips);
  const [open, setOpen] = useState(false);
  const idle = idleMinutes(g.prefs);
  const summary = useMemo(() => guardSummary(g.prefs, ips), [g.prefs, ips]);
  const noFilter = parseAllow(g.prefs.allow).entries.length === 0;
  const name = GUARD_LABEL[kind];
  return (
    <div className="mb-3">
      <Collapsible
        title="Acceso y seguridad"
        summary={summary.text}
        open={open}
        onToggle={setOpen}
        right={summary.warn ? <AlertTriangle size={14} className="text-warn shrink-0" role="img" aria-label="Sin filtro de clientes en todas las interfaces" /> : <ShieldCheck size={14} className="text-ok shrink-0" aria-hidden />}
      >
        <div className="space-y-3">
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr))]">
            <Label text="Escuchar en">
              <select className="field" disabled={running} value={g.bind} onChange={(e) => g.set({ bind: e.target.value })}>
                {g.bind !== ALL && !ips.some((i) => i.ip === g.bind) && <option value={g.bind}>{g.bind}</option>}
                {ips.map((i) => (
                  <option key={`${i.name}-${i.ip}`} value={i.ip}>
                    {i.ip} · {i.name}
                    {i.default ? " (ruta por defecto)" : ""}
                  </option>
                ))}
                <option value={ALL}>Todas las interfaces (0.0.0.0)</option>
              </select>
            </Label>
            <Label text="Detener tras inactividad">
              <div className="flex items-center gap-2 h-8">
                <Toggle checked={idle > 0} onChange={(v) => !running && g.set({ idle: v ? 30 : 0 })} label={idle > 0 ? "Activada" : "Desactivada"} />
                {idle > 0 && (
                  <>
                    <input
                      className="field w-16"
                      type="number"
                      min={1}
                      max={1440}
                      disabled={running}
                      aria-label="Minutos sin actividad"
                      value={idle}
                      onChange={(e) => g.set({ idle: Math.max(1, Number(e.target.value) || 30) })}
                    />
                    <span className="text-[12px] text-muted">min</span>
                  </>
                )}
              </div>
            </Label>
          </div>
          <Label text="Clientes permitidos (IP o subred CIDR)">
            <textarea
              className="field font-mono text-[12px] min-h-[56px]"
              rows={2}
              disabled={running}
              spellCheck={false}
              placeholder="Vacío: cualquiera. Ej: 10.20.0.0/24, 192.168.50.7"
              value={g.prefs.allow ?? ""}
              onChange={(e) => g.set({ allow: e.target.value })}
              aria-invalid={g.allowErrors.length > 0}
            />
          </Label>
          {g.allowErrors.length > 0 && <p className="text-[11.5px] text-danger">{g.allowErrors[0]}. Corrígelo para poder iniciar.</p>}
          {g.stale && <p className="text-[11.5px] text-warn">La IP guardada ya no está en este equipo (cambió de red): se usa la de la ruta por defecto.</p>}
          {noFilter && g.bind === ALL && (
            <p className="flex items-start gap-1.5 text-[11.5px] text-warn">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" /> Sin filtro y en todas las interfaces, cualquier equipo que alcance el puerto podrá usar {name}.
            </p>
          )}
          {noFilter && g.bind !== ALL && <p className="text-[11.5px] text-muted">Sin lista de clientes, cualquier equipo que llegue a {g.bind} podrá usar {name}.</p>}
          {running && <p className="text-[11.5px] text-muted">Detén el servidor para cambiar estas opciones; se aplican al iniciarlo.</p>}
        </div>
      </Collapsible>
      {running && stat && stat.rejected > 0 && (
        <p className="mt-1.5 text-[11.5px] text-warn" role="status">
          {stat.rejected.toLocaleString("es-CL")} {stat.rejected === 1 ? "conexión rechazada" : "conexiones rechazadas"} por origen no permitido{stat.last ? ` · último ${stat.last}` : ""}.
        </p>
      )}
    </div>
  );
}
