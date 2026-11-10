// Pruebas de la versión de esquema y las migraciones de los ajustes (src/lib/settings.ts):
// `node scripts/tests/settingsSchema.test.mjs` (Node 22.15+ con tipos TS).
// Los archivos de ejemplo de cada versión (scripts/tests/fixtures/datafiles) son los mismos que usan
// las pruebas de Rust (src-tauri/src/datafiles.rs).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";

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

const S = await import("../../src/lib/settings.ts");
const { migrateSuggest } = await import("../../src/lib/suggest.ts");

const fx = (dir, name) => JSON.parse(readFileSync(new URL(`./fixtures/datafiles/${dir}/${name}`, import.meta.url), "utf8"));

/** Aviso de un archivo como lo arma el backend (src-tauri/src/datafiles.rs, FileNotice). */
const notice = (over = {}) => ({ fileVersion: 0, schemaVersion: 1, newer: false, migratedFrom: 0, restoredFrom: null, dropped: [], tooLarge: false, corrupt: false, ...over });

/** Respuesta de get_settings como la compone el backend: settings + claves de topology.json + marcas. */
function backend(settings, topology, { sn = notice(), tn = notice(), sessions = null } = {}) {
  const out = { ...settings };
  if (topology) {
    out.topology = topology.topology;
    out.topoSnapshots = topology.topoSnapshots;
    out.__topoStore = true;
  }
  out.__datafiles = { schemaVersion: 1, settings: sn, topology: topology ? tn : notice({ fileVersion: null, migratedFrom: null }), sessions };
  return out;
}

/** Carga de ajustes de la 0.9.20 (antes de la versión de esquema), para comparar el resultado. */
function legacyLoad(res) {
  const raw = res && typeof res === "object" && !Array.isArray(res) ? res : null;
  const merged = { ...S.mergeSettings(res), ...migrateSuggest(raw) };
  const heavy = raw?.__topoStore === true ? { topology: merged.topology, topoSnapshots: merged.topoSnapshots } : null;
  delete merged.__topoStore;
  return { settings: merged, heavy };
}

// ---------- La versión de la interfaz y la del backend coinciden; la cadena está completa ----------

const rs = readFileSync(new URL("../../src-tauri/src/datafiles.rs", import.meta.url), "utf8");
assert.equal(Number(/pub const SCHEMA_VERSION: u64 = (\d+);/.exec(rs)?.[1]), S.SETTINGS_SCHEMA_VERSION, "SCHEMA_VERSION de Rust y de TypeScript");
for (let v = 0; v < S.SETTINGS_SCHEMA_VERSION; v++) assert.ok(S.SETTINGS_MIGRATIONS.some((m) => m.from === v), `falta la migración ${v} -> ${v + 1}`);
assert.ok(S.SETTINGS_MIGRATIONS.every((m) => m.from < S.SETTINGS_SCHEMA_VERSION && typeof m.name === "string"));

// ---------- Migraciones desde los archivos de versiones anteriores: mismo resultado que antes ----------

const cases = [
  ["0.9.11 (topología dentro de settings.json)", backend(fx("v0.9.11", "settings.json"), null)],
  ["0.9.16", backend(fx("v0.9.16", "settings.json"), fx("v0.9.16", "topology.json"))],
  ["0.9.20", backend(fx("v0.9.20", "settings.json"), fx("v0.9.20", "topology.json"))],
  ["sin archivo", { __datafiles: { schemaVersion: 1, settings: notice({ fileVersion: null, migratedFrom: null }), topology: notice({ fileVersion: null, migratedFrom: null }), sessions: null } }],
];
for (const [name, res] of cases) {
  const now = S.loadSettings(res);
  const before = legacyLoad(Object.fromEntries(Object.entries(res).filter(([k]) => k !== "__datafiles")));
  assert.deepEqual(now.settings, before.settings, `${name}: mismos ajustes que antes`);
  assert.deepEqual(now.heavy, before.heavy, `${name}: misma marca de topología`);
  for (const k of ["__topoStore", "__datafiles", "schemaVersion"]) assert.ok(!(k in now.settings), `${name}: ${k} no llega a los ajustes`);
}
// Sin respuesta del backend (null) o con una forma inesperada: valores por defecto, como antes.
for (const bad of [null, undefined, [], "x", 5]) assert.deepEqual(S.loadSettings(bad).settings, S.mergeSettings(null));

// 0.9.11: el false guardado era el valor por defecto de la beta; commandSuggestSet se resuelve en el paso 0 -> 1.
const l11 = S.loadSettings(cases[0][1]);
assert.equal(l11.settings.commandSuggest, true);
assert.equal(l11.settings.commandSuggestSet, false);
assert.equal(l11.heavy, null, "sin topology.json la app debe migrar la topología desde settings.json");
assert.equal(l11.settings.topology.nodes.length, 2);
assert.equal(l11.settings.mcpToken, "0123456789abcdef0123456789abcdef0123456789abcdef");
// 0.9.16: la topología ya está en su archivo y no hay que reescribirla.
const l16 = S.loadSettings(cases[1][1]);
assert.equal(l16.heavy?.topology.nodes.length, 3);
assert.equal(l16.settings.commandSuggestSet, true, "commandSuggest true guardado se toma como elección (migrateSuggest, igual que antes)");
assert.equal(l16.settings.deviceInfo["192.0.2.1"].model, "C9300-48P");
assert.deepEqual(l16.settings.sidebarOrder, fx("v0.9.16", "settings.json").sidebarOrder);
// 0.9.20 con la elección explícita del usuario: se respeta.
const l20 = S.loadSettings(cases[2][1]);
assert.equal(l20.settings.commandSuggestSet, true);
assert.equal(l20.settings.suggestListKey, "alt+slash");
assert.equal(l20.settings.floatingSidebar, true);
assert.equal(l20.settings.topoSnapshots.length, 1);

// ---------- Un archivo ya en la versión actual no vuelve a correr las migraciones ----------

let runs = 0;
const steps = [
  { from: 0, name: "uno", run: (r) => (runs++, { ...r, uno: true }) },
  { from: 1, name: "dos", run: (r) => (runs++, { ...r, dos: true }) },
];
assert.deepEqual(S.migrateRaw({ a: 1 }, 0, steps, 2), { a: 1, uno: true, dos: true });
assert.deepEqual(S.migrateRaw({ a: 1 }, 1, steps, 2), { a: 1, dos: true });
runs = 0;
assert.deepEqual(S.migrateRaw({ a: 1 }, 2, steps, 2), { a: 1 }, "ya actual");
assert.deepEqual(S.migrateRaw({ a: 1 }, 9, steps, 2), { a: 1 }, "más nuevo: no se toca");
assert.equal(runs, 0);
assert.deepEqual(S.migrateRaw({ a: 1 }, -3, steps, 2), { a: 1, uno: true, dos: true }, "versión inválida: desde cero");
assert.deepEqual(S.migrateRaw({ a: 1 }, Number.NaN, steps, 2), { a: 1, uno: true, dos: true });
const frozen = Object.freeze({ a: 1 });
S.migrateRaw(frozen, 0, steps, 2); // no muta la entrada (Object.freeze fallaría en modo estricto)
// Idempotencia del paso real.
const raw = { commandSuggest: true };
const once = S.migrateRaw(raw, 0);
assert.deepEqual(S.migrateRaw(once, 0), once);
// En la versión 1 los valores guardados mandan tal cual (se escribieron ya resueltos).
const v1 = S.loadSettings({ commandSuggest: false, commandSuggestSet: false, __datafiles: { schemaVersion: 1, settings: notice({ fileVersion: 1, migratedFrom: null }), topology: notice({ fileVersion: null, migratedFrom: null }), sessions: null } });
assert.equal(v1.settings.commandSuggest, false);
assert.equal(v1.settings.commandSuggestSet, false);

// ---------- Archivo de una versión posterior: se conservan las claves que no se conocen ----------

const fut = backend(fx("futuro", "settings.json"), fx("futuro", "topology.json"), {
  sn: notice({ fileVersion: 7, migratedFrom: null, newer: true }),
  tn: notice({ fileVersion: 7, migratedFrom: null, newer: true }),
});
delete fut.schemaVersion; // el backend la quita de la respuesta
const lf = S.loadSettings(fut);
assert.deepEqual(lf.settings.temaNuevo, { paleta: ["#112233", "#445566"], contraste: 1.4 }, "clave desconocida viaja con los ajustes y vuelve a guardarse");
assert.equal(lf.settings.panelLateral, "izquierda");
assert.equal(lf.settings.mcpPort, 47821, "tipo que no se entiende: valor por defecto en la interfaz (el backend conserva el del archivo)");
assert.equal(lf.settings.appTheme, "dark");
const msgs = S.describeDataNotices(lf.info);
assert.equal(msgs.length, 2, "uno por archivo");
assert.match(msgs[0].text, /settings\.json lo guardó una versión más nueva.*esquema 7.*settings\.v7\.bak\.json/);
assert.match(msgs[1].text, /topology\.json/);
// Una sola vez: con las claves ya vistas no se repite.
assert.equal(S.describeDataNotices(lf.info, new Set(msgs.map((m) => m.key))).length, 0);
assert.equal(S.describeDataNotices(lf.info, new Set([msgs[0].key])).length, 1);

// ---------- Avisos: restauración, tope, datos descartados; nada en el caso normal ----------

assert.deepEqual(S.describeDataNotices(S.loadSettings(cases[2][1]).info), [], "una migración silenciosa no molesta");
assert.deepEqual(S.describeDataNotices(null), []);
const restored = S.describeDataNotices(S.parseDataFilesInfo({ schemaVersion: 1, settings: notice({ restoredFrom: "settings.json.bak", corrupt: true }), topology: notice({ fileVersion: null, migratedFrom: null }), sessions: notice({ fileVersion: null, migratedFrom: null, restoredFrom: "sessions.json.bak", corrupt: true }) }));
assert.equal(restored.length, 2);
assert.match(restored[0].text, /settings\.json estaba dañado y se restauró desde el respaldo settings\.json\.bak/);
assert.match(restored[1].text, /sessions\.json.*sessions\.json\.bak/);
const noBak = S.describeDataNotices(S.parseDataFilesInfo({ schemaVersion: 1, settings: notice({ corrupt: true }), topology: notice({ tooLarge: true, corrupt: true }), sessions: null }));
assert.match(noBak[0].text, /no había un respaldo válido/);
assert.match(noBak[1].text, /64 MB/);
const dropped = S.describeDataNotices(S.parseDataFilesInfo({ schemaVersion: 1, settings: notice({ dropped: ["topology", "a", "b", "c"] }), topology: notice(), sessions: null }));
assert.match(dropped[0].text, /Se descartaron datos inválidos de settings\.json \(topology, a, b y más\)/);
// Forma inesperada del campo: sin avisos y sin romper la carga.
assert.equal(S.parseDataFilesInfo({ settings: 1 }), null);
assert.equal(S.parseDataFilesInfo("x"), null);
assert.deepEqual(S.loadSettings({ fontSize: 15, __datafiles: "raro" }).settings.fontSize, 15);

// ---------- Error de guardado que llega al usuario ----------

const big = "La topología supera 64 MB: elimina snapshots antiguos o equipos que no uses.";
assert.equal(S.saveErrorText("topología", big), big, "el mensaje del backend se muestra tal cual");
assert.equal(S.saveErrorText("topología", new Error("disco lleno")), "No se pudo guardar la topología. Motivo: disco lleno");
assert.equal(S.saveErrorText("ajustes", "permiso denegado"), "No se pudo guardar la configuración. Motivo: permiso denegado");

// ---------- mergeSettings sigue descartando lo inválido y conservando claves desconocidas ----------

const merged = S.mergeSettings({ alertRules: null, topology: { nodes: "x", links: [] }, clavePropia: [1, 2] });
assert.ok(Array.isArray(merged.alertRules));
assert.deepEqual(merged.topology, { nodes: [], links: [] });
assert.deepEqual(merged.clavePropia, [1, 2]);

console.log("settingsSchema.test.mjs OK");
