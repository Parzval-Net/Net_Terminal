// Pruebas de la lógica de Herramientas › Buscar en logs (src/lib/logSearch.ts):
// `node scripts/tests/logSearch.test.mjs` (Node 22.15+). El backend se prueba en src-tauri/src/logsearch.rs.
import assert from "node:assert/strict";
const L = await import("../../src/lib/logSearch.ts");

const form = (over = {}) => ({ ...L.defaultForm, ...over });

// ---- Validación y parámetros ----
assert.deepEqual(L.buildParams(form()), { error: "Escribe un texto para buscar." });
assert.deepEqual(L.buildParams(form({ query: "   " })), { error: "Escribe un texto para buscar." });
assert.ok(L.buildParams(form({ query: "x".repeat(501) })).error.includes("demasiado largo"));
assert.ok(L.buildParams(form({ query: "x", kinds: { logs: false, backups: false, notes: false } })).error.includes("Elige dónde"));
assert.ok(L.buildParams(form({ query: "x", from: "2026-02-30" })).error.includes("desde"), "30 de febrero no existe");
assert.ok(L.buildParams(form({ query: "x", to: "ayer" })).error.includes("hasta"));
assert.ok(L.buildParams(form({ query: "x", from: "2026-03-02", to: "2026-03-01" })).error.includes("invertido"));
{
  const { params } = L.buildParams(form({ query: " %LINK-3 ", regex: true, from: "2026-01-01", to: "2026-01-31", scope: " core ", context: 9 }));
  assert.equal(params.query, " %LINK-3 ", "el texto se envía tal cual (los espacios pueden importar)");
  assert.deepEqual(params.kinds, ["logs", "backups"]);
  assert.equal(params.context, 5, "el contexto se acota a 5");
  assert.equal(params.scope, "core");
  assert.deepEqual([params.from, params.to, params.regex, params.maxResults, params.maxFileMb], ["2026-01-01", "2026-01-31", true, 500, 64]);
  const none = L.buildParams(form({ query: "a" })).params;
  assert.deepEqual([none.from, none.to, none.scope], [undefined, undefined, undefined]);
  assert.equal(L.buildParams(form({ query: "a", from: "2024-02-29" })).params.from, "2024-02-29", "año bisiesto");
}
// Una expresión que JS no entiende pero Rust sí no se bloquea en la interfaz.
assert.ok(L.buildParams(form({ query: "(?i)error", regex: true })).params);

// ---- Formulario recordado: sin texto ni fechas; valores inválidos vuelven a lo predeterminado ----
{
  const r = L.sanitizeForm({ query: "secreto", regex: true, caseSensitive: "sí", kinds: { logs: false, notes: true }, from: "2026-01-01", context: 99, maxResults: 123, maxFileMb: 256 });
  assert.equal(r.query, "");
  assert.equal(r.from, "");
  assert.equal(r.regex, true);
  assert.equal(r.caseSensitive, false);
  assert.deepEqual(r.kinds, { logs: false, backups: true, notes: true });
  assert.equal(r.context, 5);
  assert.equal(r.maxResults, 500);
  assert.equal(r.maxFileMb, 256);
  assert.deepEqual(L.sanitizeForm(null), L.defaultForm);
  assert.deepEqual(L.sanitizeForm([1, 2]), L.defaultForm);
  const mem = L.rememberable(form({ query: "no", scope: "no", from: "2026-01-01" }));
  assert.ok(!("query" in mem) && !("scope" in mem) && !("from" in mem));
}

// ---- Acumulación incremental ----
{
  const hit = (line) => ({ line, text: "t", ranges: [[0, 1]], before: [], after: [] });
  const f = (rel, n, kind = "logs") => ({ kind, rel, size: 1, modified: 1, partial: false, more: false, hits: Array.from({ length: n }, (_, i) => hit(i + 1)) });
  let s = L.emptyResults;
  s = L.applyLine(s, { files: [f("a.log", 2)], progress: { scanned: 1, total: 10, matches: 2 } });
  s = L.applyLine(s, { progress: { scanned: 4, total: 10, matches: 2 } });
  s = L.applyLine(s, { files: [f("b.log", 1), f("a.log", 1, "backups")], progress: { scanned: 5, total: 10, matches: 4 } });
  assert.deepEqual(s.files.map((x) => `${x.kind}:${x.rel}`), ["logs:a.log", "logs:b.log", "backups:a.log"], "el mismo nombre en otro tipo es otro archivo, el orden de llegada se conserva");
  assert.equal(L.totalHits(s.files), 4);
  assert.deepEqual(s.progress, { scanned: 5, total: 10, matches: 4 });
  const again = L.applyLine(s, { files: [f("a.log", 3)] });
  assert.equal(again.files.length, 3);
  assert.equal(again.files[0].hits.length, 3, "un archivo repetido se reemplaza");
  assert.equal(L.applyLine(s, null), s);
  assert.equal(L.applyLine(s, undefined), s);
  assert.equal(L.progressText(s.progress), "5 de 10 archivos revisados · 4 coincidencias");
  assert.equal(L.progressText({ scanned: 1, total: 1, matches: 1 }), "1 de 1 archivos revisados · 1 coincidencia");
}

// ---- Resumen y advertencias ----
{
  const base = { scanned: 40, total: 40, matches: 3, filesWithHits: 2, truncated: false, walkTruncated: false, skippedBinary: 0, skippedErrors: 0, partial: 0, cancelled: false, ms: 250 };
  assert.deepEqual(L.summaryLines(base), ["3 coincidencias en 2 archivos · 40 de 40 revisados en 250 ms."]);
  const warn = L.summaryLines({ ...base, truncated: true, walkTruncated: true, partial: 2, skippedBinary: 1, skippedErrors: 3, cancelled: true, ms: 2500, matches: 1, filesWithHits: 1 });
  assert.ok(warn[0].startsWith("Búsqueda cancelada: 1 coincidencia en 1 archivo"));
  assert.ok(warn[0].endsWith("en 2,5 s."));
  assert.equal(warn.length, 6);
  assert.ok(warn.some((l) => l.includes("tope de resultados")));
  assert.ok(warn.some((l) => l.includes("2 archivos superan")));
  assert.ok(warn.some((l) => l.includes("1 archivo binario omitido")));
  assert.ok(warn.some((l) => l.includes("3 archivos no se pudieron leer")));
}

// ---- Resaltado por puntos de código (el backend cuenta caracteres, JS UTF-16) ----
{
  assert.deepEqual(L.segments("hola mundo", [[5, 10]]), [{ text: "hola ", hit: false }, { text: "mundo", hit: true }]);
  assert.deepEqual(L.segments("abc", []), [{ text: "abc", hit: false }]);
  assert.deepEqual(L.segments("", []), [{ text: "", hit: false }]);
  // Emoji (2 unidades UTF-16, 1 carácter) antes de la coincidencia.
  assert.deepEqual(L.segments("😀 error aquí", [[2, 7]]), [{ text: "😀 ", hit: false }, { text: "error", hit: true }, { text: " aquí", hit: false }]);
  // Rangos desordenados, superpuestos o fuera de rango no rompen nada.
  const segs = L.segments("abcdef", [[4, 99], [1, 3], [2, 5]]);
  assert.equal(segs.map((x) => x.text).join(""), "abcdef");
  assert.deepEqual(segs.filter((x) => x.hit).map((x) => x.text), ["bc", "de", "f"]);
  assert.deepEqual(L.segments("abc", [[2, 2], [5, 9]]), [{ text: "abc", hit: false }]);
}

// ---- Ruta ----
assert.deepEqual(L.fileParts("core-sw01/2026-01-02_101010.txt"), { name: "2026-01-02_101010.txt", dir: "core-sw01" });
assert.deepEqual(L.fileParts("sesion.log"), { name: "sesion.log", dir: "" });
assert.equal(L.copyLine({ line: 1, text: "…resto de la línea…", ranges: [], before: [], after: [] }), "resto de la línea");
assert.equal(L.todayISO(new Date(2026, 0, 5)), "2026-01-05");
assert.equal(L.stamp(0), "");
assert.match(L.stamp(1_700_000_000), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);

console.log("logSearch: ok");
