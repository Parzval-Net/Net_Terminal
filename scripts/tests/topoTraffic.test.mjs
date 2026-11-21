// Pruebas de los enlaces sin datos de tráfico (motivo por extremo) y de la búsqueda flexible del
// puerto en las tasas: `node scripts/tests/topoTraffic.test.mjs` (Node 22.15+ con tipos TS).
// Nombres de equipo ficticios.
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// Los .ts de src/lib se importan sin extensión (como los resuelve Vite): se completa con .ts.
registerHooks({
  resolve(specifier, context, next) {
    if (/^\.\.?\//.test(specifier) && !/\.[cm]?[jt]s$/.test(specifier) && context.parentURL?.endsWith(".ts")) {
      try {
        return next(`${specifier}.ts`, context);
      } catch {
        /* sigue con la resolución normal */
      }
    }
    return next(specifier, context);
  },
});

const R = await import("../../src/lib/topoTraffic.ts");

const T0 = 1_800_000_000_000;
const rate = (inBps, outBps, extra = {}) => ({ inBps, outBps, speed: 1e9, ts: T0, src: "snmp", ...extra });
const st = (p = {}) => ({ snmp: [], cli: [], none: [], errors: [], busy: [], partial: [], last: T0, ...p });
const nodes = (...list) => new Map(list.map(([id, name, explored]) => [id, { id, name, explored }]));
const link = (aPort = "Gi1/0/1", bPort = "Gi1/0/2") => ({ a: "sw-a", aPort, b: "sw-b", bPort, proto: "CDP" });

// ---------- portEntry: exacta, sin mayúsculas, abreviatura y subinterfaz ----------
{
  const m = new Map([["gi1/0/1", 1], ["te1/1/1", 2]]);
  assert.equal(R.portEntry(m, "GigabitEthernet1/0/1"), 1, "nombre completo contra abreviatura");
  assert.equal(R.portEntry(m, "GI1/0/1"), 1, "mayúsculas");
  assert.equal(R.portEntry(m, "Gig 1/0/1"), 1, "forma de CDP con espacio");
  assert.equal(R.portEntry(m, "TenGigabitEthernet1/1/1"), 2);
  assert.equal(R.portEntry(m, "Gi1/0/1.100"), 1, "subinterfaz sin contadores propios: los del puerto físico");
  assert.equal(R.portEntry(m, "Gi1/0/9"), undefined);
  assert.equal(R.portEntry(m, ""), undefined);
  assert.equal(R.portEntry(undefined, "Gi1/0/1"), undefined);
  // La subinterfaz con contadores propios gana sobre el físico.
  const sub = new Map([["gi1/0/1", 1], ["gi1/0/1.100", 3]]);
  assert.equal(R.portEntry(sub, "Gi1/0/1.100"), 3);
  // Con dos candidatas por la forma flexible no elige ninguna.
  const two = new Map([["gi1/0/1.100", 3], ["gi1/0/1.200", 4]]);
  assert.equal(R.portEntry(two, "Gi1/0/1.300"), undefined);
}

// ---------- linkTraffic: un extremo sin tasa usa el otro; puerto escrito distinto ----------
{
  const rates = new Map([
    ["sw-a", new Map([["gi1/0/1", rate(null, null)]])],
    ["sw-b", new Map([["gi1/0/2", rate(2e8, 5e8)]])],
  ]);
  const lt = R.linkTraffic(link(), rates);
  assert.ok(lt, "con tasa en un extremo hay tráfico");
  assert.equal(lt.ab, 2e8, "A→B sale de lo que entra por B");
  assert.equal(lt.ba, 5e8, "B→A sale de lo que sale por B");
  assert.equal(lt.util, 0.5);
  // El enlace informa "GigabitEthernet1/0/2.10" en B y los contadores traen solo el físico.
  const lt2 = R.linkTraffic(link("Gi1/0/1", "GigabitEthernet1/0/2.10"), rates);
  assert.equal(lt2?.ab, 2e8);
  assert.equal(R.linkTraffic(link("Gi1/0/9", "Gi1/0/9"), rates), null);
}

// ---------- noTrafficReason: un motivo por cada caso ----------
{
  const none = new Map();
  // Ningún extremo explorado.
  let r = R.noTrafficReason(link(), nodes(["sw-a", "sw-a", false], ["sw-b", "sw-b", false]), none, st());
  assert.equal(r.kind, "unexplored");
  assert.match(r.text, /Ningún extremo explorado/);

  // Un extremo explorado sin perfil SNMP ni consola; el otro sin explorar no cuenta en el texto.
  r = R.noTrafficReason(link(), nodes(["sw-a", "sw-a", true], ["sw-b", "sw-b", false]), none, st({ none: ["sw-a"] }));
  assert.equal(r.kind, "noSource");
  assert.equal(r.text, "sw-a: sin perfil SNMP ni lectura por consola");

  // Error de lectura con su motivo.
  r = R.noTrafficReason(link(), nodes(["sw-a", "sw-a", true], ["sw-b", "sw-b", false]), none, st({ snmp: ["sw-a"], errors: ["sw-a: GET de contadores: tooBig"] }));
  assert.equal(r.kind, "error");
  assert.match(r.text, /error de lectura \(GET de contadores: tooBig\)/);

  // Pestaña ocupada.
  r = R.noTrafficReason(link(), nodes(["sw-a", "sw-a", true], ["sw-b", "sw-b", false]), new Map([["sw-a", new Map()]]), st({ cli: ["sw-a"], busy: ["sw-a"] }));
  assert.equal(r.kind, "busy");

  // Puerto leído sin tasa todavía: esperando la segunda lectura.
  const first = new Map([["sw-a", new Map([["gi1/0/1", rate(null, null)]])]]);
  r = R.noTrafficReason(link(), nodes(["sw-a", "sw-a", true], ["sw-b", "sw-b", false]), first, st({ snmp: ["sw-a"] }));
  assert.equal(r.kind, "waiting");
  assert.match(r.text, /segunda lectura/);

  // Sin ninguna ronda terminada: esperando la primera lectura.
  r = R.noTrafficReason(link(), nodes(["sw-a", "sw-a", true], ["sw-b", "sw-b", false]), none, st({ last: undefined }));
  assert.equal(r.kind, "waiting");
  assert.match(r.text, /primera lectura/);

  // El equipo tiene tasas pero no la del puerto del enlace.
  const other = new Map([["sw-a", new Map([["gi1/0/5", rate(1, 1)]])]]);
  r = R.noTrafficReason(link(), nodes(["sw-a", "sw-a", true], ["sw-b", "sw-b", false]), other, st({ snmp: ["sw-a"] }));
  assert.equal(r.kind, "portMissing");
  assert.match(r.text, /Gi1\/0\/1 no aparece en ifName ni ifDescr/);
  r = R.noTrafficReason(link(), nodes(["sw-a", "sw-a", true], ["sw-b", "sw-b", false]), other, st({ cli: ["sw-a"] }));
  assert.match(r.text, /no aparece en los contadores leídos/);

  // Lectura por consola cortada: el puerto no alcanzó a leerse.
  r = R.noTrafficReason(link(), nodes(["sw-a", "sw-a", true], ["sw-b", "sw-b", false]), other, st({ cli: ["sw-a"], partial: ["sw-a: 1 de 2 interfaces sin leer (show interfaces: plazo)"] }));
  assert.equal(r.kind, "partial");

  // Enlace sin puerto en el extremo explorado.
  r = R.noTrafficReason(link(""), nodes(["sw-a", "sw-a", true], ["sw-b", "sw-b", false]), none, st());
  assert.equal(r.kind, "noPort");

  // Ambos extremos con el mismo motivo: una sola frase.
  r = R.noTrafficReason(link(), nodes(["sw-a", "sw-a", true], ["sw-b", "sw-b", true]), none, st({ none: ["sw-a", "sw-b"] }));
  assert.equal(r.text, "Ambos extremos: sin perfil SNMP ni lectura por consola");

  // Motivos distintos: manda el más útil para actuar (el error) y van los dos.
  r = R.noTrafficReason(link(), nodes(["sw-a", "sw-a", true], ["sw-b", "sw-b", true]), none, st({ none: ["sw-a"], errors: ["sw-b: timeout"] }));
  assert.equal(r.kind, "error");
  assert.equal(r.ends.length, 2);
  assert.ok(r.text.startsWith("sw-b: error de lectura (timeout)"));
  assert.match(r.text, /sw-a: sin perfil SNMP/);

  // Un nombre que es prefijo de otro no toma el error ajeno.
  r = R.noTrafficReason(link(), nodes(["sw-a", "sw-a", true], ["sw-b", "sw-b", false]), none, st({ errors: ["sw-a2: timeout"] }));
  assert.notEqual(r.kind, "error");
}

console.log("topoTraffic OK");
