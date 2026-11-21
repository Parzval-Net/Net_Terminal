import { useEffect, useId, useMemo, useState } from "react";
import { calc, splitV4 } from "../../lib/subnet";
import { CopyText, Label, Section, ToolHeader } from "./ui";

export function SubnetTool() {
  const [input, setInput] = useState("192.168.10.77/26");
  const [split, setSplit] = useState(0);
  const r = useMemo(() => calc(input), [input]);
  // El error se muestra tras una pausa al escribir (o al salir del campo), no en cada tecla a medio escribir.
  const [showErr, setShowErr] = useState(false);
  useEffect(() => {
    setShowErr(false);
    const t = window.setTimeout(() => setShowErr(true), 600);
    return () => window.clearTimeout(t);
  }, [input]);
  const errId = useId();
  const invalid = !r && !!input.trim() && showErr;
  const subnets = useMemo(
    () => (r?.version === 4 && split > r.prefix ? splitV4(r.network, r.prefix, split) : []),
    [r, split],
  );

  const rows: [string, string][] = !r
    ? []
    : r.version === 4
      ? [
          ["Red", `${r.network}/${r.prefix}`],
          ["Máscara", r.mask],
          ["Wildcard (ACL)", r.wildcard],
          ["Broadcast", r.broadcast ?? (r.prefix === 31 ? "No aplica (punto a punto, RFC 3021)" : "No aplica (host)")],
          ["Primer host", r.first],
          ["Último host", r.last],
          ["Hosts útiles", r.hosts.toLocaleString("es-CL")],
          ["Direcciones totales", r.total.toLocaleString("es-CL")],
          ["Clase / tipo", `${r.cls} · ${r.scope}`],
          ["Binario", r.binary],
        ]
      : [
          ["Red", r.network],
          ["Primera", r.first],
          ["Última", r.last],
          ["Direcciones", r.total],
          ["Tipo", r.scope],
        ];

  return (
    <div className="space-y-4">
      <ToolHeader title="Subredes" description="Red, máscara, wildcard, broadcast y rango de hosts de una dirección IPv4 o IPv6, y división de subredes IPv4." />
      <Section title="Dirección" hint="IPv4 con prefijo, máscara o wildcard (10.0.0.1/24, 10.0.0.1 255.255.255.0, 10.0.0.0 0.0.0.255) o IPv6 (2001:db8::1/64).">
        <input
          autoFocus
          aria-label="Dirección IP con prefijo o máscara"
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errId : undefined}
          className="field font-mono mb-3"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onBlur={() => setShowErr(true)}
          spellCheck={false}
        />
        <p id={errId} role="status" className="text-body-sm text-danger empty:hidden">
          {invalid ? "Dirección o máscara inválida" : ""}
        </p>
        {r?.version === 4 && r.fromWildcard && (
          <p className="mb-2 text-body-sm text-muted">Máscara interpretada como wildcard: equivale a {r.mask} (/{r.prefix}).</p>
        )}
        {r && (
          <table className="w-full text-body-sm tabular-nums">
            <tbody>
              {rows.map(([k, v]) => (
                <tr key={k} className="border-t border-line first:border-0">
                  <td className="py-1.5 pr-4 text-muted whitespace-nowrap w-28 @[36rem]:w-48">{k}</td>
                  <td>
                    <CopyText text={v} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {r?.version === 4 && r.prefix < 32 && (
        <Section title="Dividir en subredes">
          <Label text="Nuevo prefijo" className="w-56 mb-3">
            <select className="field" value={split} onChange={(e) => setSplit(Number(e.target.value))}>
              <option value={0}>Selecciona</option>
              {Array.from({ length: 32 - r.prefix }, (_, i) => r.prefix + i + 1).map((p) => (
                <option key={p} value={p}>
                  /{p} · {(2 ** (p - r.prefix)).toLocaleString("es-CL")} subredes
                </option>
              ))}
            </select>
          </Label>
          {subnets.length > 0 && 2 ** (split - r.prefix) > 1024 && (
            <p className="mb-2 text-body-sm text-muted">
              Se muestran las primeras 1.024 de {(2 ** (split - r.prefix)).toLocaleString("es-CL")} subredes.
            </p>
          )}
          {subnets.length > 0 && (
            <div className="max-h-[300px] overflow-y-auto">
              <table className="w-full text-body-sm font-mono tabular-nums">
                <thead className="text-muted text-left font-sans">
                  <tr>
                    <th className="font-medium py-1">Subred</th>
                    <th className="font-medium">Primer host</th>
                    <th className="font-medium">Último host</th>
                  </tr>
                </thead>
                <tbody>
                  {subnets.map((s) => (
                    <tr key={s.cidr} className="border-t border-line">
                      <td className="py-1">{s.cidr}</td>
                      <td>{s.first}</td>
                      <td>{s.last}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}
      {r?.version === 6 && <p className="text-body-sm text-muted">La división en subredes está disponible solo para IPv4.</p>}
    </div>
  );
}
