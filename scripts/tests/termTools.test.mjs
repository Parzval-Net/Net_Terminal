// Pruebas de la lógica pura de la terminal: pegado seguro (lib/pasteGuard), navegación de marcadores
// (lib/termMarks) y resaltado al vuelo (lib/termHl: validación contra ReDoS y mapa de celdas).
// `node scripts/tests/termTools.test.mjs` (Node 22.15+). Datos ficticios.
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { fastEnough } from "./timing.mjs";

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

const P = await import("../../src/lib/pasteGuard.ts");
const M = await import("../../src/lib/termMarks.ts");
const H = await import("../../src/lib/termHl.ts");

// ---------- Pegado seguro ----------
const REMOTE = { remote: true, confirmSend: true };
const ask = (text, o = REMOTE) => P.pasteDecision(P.analyzePaste(text), o);

// Una línea sin Enter no se ejecuta: pasa directo, sea lo que sea (consulta o corte).
assert.equal(ask("show version").ask, false);
assert.equal(ask("reload").ask, false, "reload sin Enter queda escrito en el prompt, no se ejecuta");
assert.equal(P.analyzePaste("reload").executed, 0);
assert.equal(P.analyzePaste("reload").endsWithNewline, false);
// Con Enter: la regla de riesgo de siempre, también para UNA línea.
assert.equal(ask("show version\n").ask, false, "una consulta con Enter no molesta");
assert.equal(ask("reload\n").ask, true);
assert.equal(ask("reload\n").danger, true);
assert.equal(ask("reload\r").ask, true, "CR suelto: también Enter");
assert.equal(ask("reload\r\n").ask, true);
assert.equal(ask("conf t\n").ask, true, "un cambio con Enter se confirma (confirmSend activo)");
assert.equal(ask("conf t\n", { remote: true, confirmSend: false }).ask, false, "sin 'Confirmar envío' solo lo que corta servicio se confirma");
assert.equal(ask("reload\n", { remote: true, confirmSend: false }).ask, true, "cortar servicio se confirma siempre");
// Varias líneas: según confirmSend, aunque sean consultas y aunque la última no tenga Enter.
assert.equal(ask("show clock\nshow version\n").ask, true);
assert.equal(ask("show clock\nshow version").ask, true);
assert.equal(ask("show clock\nshow version\n", { remote: true, confirmSend: false }).ask, false);
// Texto con salto final pero una sola línea vacía o espacios: nada que preguntar.
assert.equal(ask("\n").ask, false);
assert.equal(ask("   \n\n").ask, false);
// Terminal local y pantalla completa (remote: false): el riesgo no se evalúa, los caracteres de control sí.
const LOCAL = { remote: false, confirmSend: true };
assert.equal(ask("reload\n", LOCAL).ask, false);
assert.equal(ask("show clock\nreload\n", LOCAL).ask, false);
assert.equal(ask("").ask, false);
for (const t of ["ls\x7f\x7frm -rf ~\n", "echo hi\x15touch /tmp/pwn\n", "a\x04", "x\u202ey\n", "a\u2028b"]) {
  const d = ask(t, LOCAL);
  assert.ok(d.ask && d.danger, `local con caracteres de control: ${JSON.stringify(t)}`);
}

// Portapapeles: sin ESC ni C1, así ningún marcador de pegado entre corchetes sobrevive, tampoco anidado.
assert.equal(P.sanitizePaste("echo hi\x1b[20\x1b[201~1~; touch /tmp/pwn\n"), "echo hi[201~; touch /tmp/pwn\n");
assert.ok(!P.sanitizePaste("a\x1b[201~b\x1b[200~c\x9b201~d\x1b\x1b[201~[201~e").includes("\x1b"));
assert.equal(P.sanitizePaste("show\x85 run\x9b"), "show run");
assert.equal(P.sanitizePaste("ñandú 🙂\tshow\n"), "ñandú 🙂\tshow\n", "texto normal intacto");
{
  // Pastejacking anidado: tras limpiar no queda nada que fuerce ni corte, y no hay ESC que cierre el pegado.
  const t = P.sanitizePaste("echo hi\x1b[20\x1b[201~1~; touch /tmp/pwn\n");
  assert.ok(!/\x1b/.test(t));
}
// Un texto enorme se limpia en tiempo lineal.
fastEnough("sanitizePaste de 1 MB con marcadores anidados", 200, () => P.sanitizePaste("\x1b[20".repeat(70000) + "\x1b[201~" + "1~".repeat(70000)));

// Tab y abreviaturas no bajan el riesgo: "rel<Tab>" es reload, "re<Tab>load" también.
for (const t of ["rel\t\n", "wr\t er\t\n", "re\tload\n", "relo\n", "del flash:\t\n", "clea ip bg *\n"]) {
  assert.equal(P.analyzePaste(t).risk, "disruptive", JSON.stringify(t));
  assert.ok(ask(t, { remote: true, confirmSend: false }).ask, `se confirma aunque 'Confirmar envío' esté apagado: ${JSON.stringify(t)}`);
}
assert.equal(P.analyzePaste("sh\t ru\t\n").risk, "read");

// U+2028/U+2029: saltos de línea para el riesgo y para "varias líneas", y etiqueta en la vista previa.
{
  const a = P.analyzePaste("show version\u2028reload\n");
  assert.equal(a.risk, "disruptive");
  assert.ok(a.forced);
  assert.ok(a.flags.some((f) => f.kind === "lsep"));
  assert.ok(a.lines[0].parts.some((p) => p.ctrl === "LS (U+2028)" && p.forces));
  assert.ok(a.lines[0].shown.includes("⟨U+2028⟩"));
  assert.ok(ask("show clock\u2029show version").ask, "dos líneas aunque no haya LF");
}

// Tab y "?" no fuerzan por sí solos; Esc y Ctrl-D sí.
assert.equal(ask("show ver\t").ask, false, "Tab (autocompletar): sin confirmar");
assert.equal(ask("show ip ?").ask, false, "? (ayuda del equipo): sin confirmar");
assert.equal(ask("show ver\t\n").ask, false);
assert.equal(ask("show ip ?\n").ask, false);
assert.deepEqual(P.analyzePaste("a\tb").flags.map((f) => f.kind), ["tab"]);
assert.equal(P.analyzePaste("a\tb").forced, false);
assert.equal(ask("show clock\x1b").ask, true, "Esc, aunque no haya Enter: se confirma");
assert.equal(ask("show clock\x1b[A").ask, true);
assert.equal(ask("show clock\x04").ask, true, "Ctrl-D");
assert.equal(ask("show clock\x04\n").danger, true);
assert.equal(P.analyzePaste("x\x1b").flags.find((f) => f.kind === "esc")?.names, "Esc");
assert.equal(P.analyzePaste("x\x04").flags.find((f) => f.kind === "eof")?.names, "Ctrl-D");
assert.equal(P.analyzePaste("x\x01\x05").flags.find((f) => f.kind === "ctrl")?.names, "Ctrl-A, Ctrl-E");
assert.equal(ask("show clock\x01").ask, true, "otros Ctrl-*");

// Teclas de edición: editedLine decide qué ejecuta el equipo; el riesgo sigue a la línea efectiva.
const hidden = P.analyzePaste("show clock\x7f\x7f\x7f\x7f\x7f\x7f\x7f\x7f\x7f\x7f\nreload\n");
assert.equal(hidden.risk, "disruptive");
assert.equal(hidden.lines[0].effective, "", "diez retrocesos borran la línea");
assert.ok(hidden.lines[0].flags.includes("edit"));
// "xx" + 2 BS + "reload": se ve "xxreload" pero el equipo ejecuta "reload".
const disguised = P.analyzePaste("xx\x7f\x7freload\n");
assert.equal(disguised.lines[0].effective, "reload");
assert.equal(disguised.risk, "disruptive");
assert.equal(P.pasteDecision(disguised, REMOTE).ask, true);
assert.equal(P.analyzePaste("ab\x7fc\n").lines[0].effective, "ac");
assert.equal(P.analyzePaste("ab\x15cd\n").lines[0].effective, "cd", "Ctrl-U borra la línea");
// La vista previa muestra los controles, no los esconde.
assert.equal(P.showControls("a\tb\x1bc\x7fd"), "a⇥b␛c␡d");
assert.equal(P.showControls("x‮y"), "x⟨U+202E⟩y");

// CR sin LF: se toma como Enter (igual que xterm); mezclado con LF se señala y fuerza.
const cr = P.analyzePaste("show clock\rshow version\r");
assert.equal(cr.lines.length, 2);
assert.equal(cr.executed, 2);
assert.ok(cr.flags.some((f) => f.kind === "cr"));
assert.equal(cr.mixedBreaks, false);
assert.equal(cr.forced, false);
const mixed = P.analyzePaste("show clock\rshow version\nshow ver\n");
assert.equal(mixed.mixedBreaks, true);
assert.equal(mixed.forced, true);
assert.equal(P.analyzePaste("a\r\nb\r\n").lines.length, 2, "CRLF cuenta como un solo salto");
assert.ok(!P.analyzePaste("a\r\nb\r\n").flags.some((f) => f.kind === "cr"));

// Caracteres invisibles o de dirección: fuerzan; un BOM al inicio no.
assert.equal(P.analyzePaste("show‮ clock").forced, true);
assert.equal(P.analyzePaste("show​ clock").forced, true);
assert.equal(P.analyzePaste("﻿show clock").forced, false);
assert.equal(P.analyzePaste("show ﻿clock").forced, true);

// Cuenta de líneas y caracteres; la última sin Enter se marca como no ejecutada.
const three = P.analyzePaste("a\nb\nc");
assert.equal(three.lines.length, 3);
assert.equal(three.executed, 2);
assert.equal(three.lines[2].executes, false);
assert.equal(three.chars, 5);
assert.equal(P.analyzePaste("a\n").lines.length, 1);
assert.equal(P.analyzePaste("a\n\n").lines.length, 2, "una línea en blanco con Enter también se envía");
assert.equal(P.analyzePaste("ñandú 🙂").chars, 7, "puntos de código, no unidades UTF-16");

// Riesgo por línea y bloque.
const blk = P.analyzePaste("show run\nconf t\nint g0/1\nshutdown\n");
assert.equal(blk.lines[0].risk, "read");
assert.equal(blk.lines[1].risk, "change");
assert.ok(["change", "disruptive"].includes(blk.risk));
assert.equal(P.analyzePaste("show run\nshow ver").risk, "read");

// Envío línea a línea: cada línea con el Enter de la sesión; la última sin salto queda sin Enter.
assert.deepEqual(P.pasteChunks("a\nb\r\nc", "\r"), ["a\r", "b\r", "c"]);
assert.deepEqual(P.pasteChunks("a\nb\n", "\r\n"), ["a\r\n", "b\r\n"]);
assert.deepEqual(P.pasteChunks("", "\r"), []);
assert.deepEqual(P.pasteChunks("\n", "\r"), ["\r"]);

// Rendimiento: 5.000 líneas se analizan sin congelar la interfaz.
{
  const big = Array.from({ length: 5000 }, (_, i) => `show interface gi1/0/${i % 48}`).join("\n") + "\n";
  const a = fastEnough("análisis de 5.000 líneas pegadas", 1500, () => P.analyzePaste(big));
  assert.equal(a.lines.length, 5000);
  console.log(`analyzePaste 5000 líneas: ${fastEnough.lastMs.toFixed(0)} ms`);
}

// ---------- Marcadores ----------
const marks = [40, 10, 25, 25, 90];
assert.equal(M.markTarget(marks, 30, "next"), 40);
assert.equal(M.markTarget(marks, 30, "prev"), 25);
assert.equal(M.markTarget(marks, 25, "next"), 40, "estrictamente después: no repite la marca donde ya está");
assert.equal(M.markTarget(marks, 25, "prev"), 10);
assert.equal(M.markTarget(marks, 90, "next"), null, "no da la vuelta");
assert.equal(M.markTarget(marks, 10, "prev"), null);
assert.equal(M.markTarget([], 0, "next"), null);
assert.equal(M.markTarget([-1, 5], 0, "prev"), null, "marcas soltadas (-1) no cuentan");
// Recorrer todas con "siguiente" desde antes del inicio y volver con "anterior" visita cada una una vez.
{
  let at = -1;
  const seen = [];
  for (let t; (t = M.markTarget(marks, at, "next")) !== null; at = t) seen.push(t);
  assert.deepEqual(seen, [10, 25, 40, 90]);
  const back = [];
  for (let t; (t = M.markTarget(marks, at, "prev")) !== null; at = t) back.push(t);
  assert.deepEqual(back, [40, 25, 10]);
}
// Referencia del salto: la vista pegada al final salta primero a la marca más reciente; sin mover la vista, se sigue desde la última marca.
{
  const view = { baseY: 40, length: 70, last: null };
  assert.equal(M.jumpFrom({ ...view, dir: "prev", viewportY: 40 }), 70, "al final: 'anterior' parte del final del búfer");
  assert.equal(M.jumpFrom({ ...view, dir: "next", viewportY: 40 }), 40);
  assert.equal(M.jumpFrom({ ...view, dir: "prev", viewportY: 12 }), 12, "vista subida: primera fila visible");
  // Marcas en las filas 48, 49, 50 (dentro de la última pantalla): la vista no puede subir de la fila 40.
  const at = [48, 49, 50];
  let last = null;
  const visited = [];
  for (let i = 0; i < 4; i++) {
    const from = M.jumpFrom({ ...view, dir: "prev", viewportY: 40, last });
    const t = M.markTarget(at, from, "prev");
    if (t === null) break;
    visited.push(t);
    last = { line: t, viewportY: 40 };
  }
  assert.deepEqual(visited, [50, 49, 48], "recorre todas hacia atrás aunque la vista no se mueva");
  last = { line: 48, viewportY: 40 };
  assert.equal(M.markTarget(at, M.jumpFrom({ ...view, dir: "next", viewportY: 40, last }), "next"), 49);
  // La vista se movió (salida nueva o desplazamiento del usuario): vale la fila visible, no el salto anterior.
  assert.equal(M.jumpFrom({ ...view, dir: "next", viewportY: 41, last }), 41);
}
assert.equal(M.markIndex(marks, 40), 3);
assert.equal(M.markIndex(marks, 7), 0);
assert.equal(M.markLabel("   router#   show   version  "), "router# show version");
assert.equal(M.markLabel("   "), "(línea en blanco)");
assert.equal(M.markLabel("x".repeat(300), 20).length, 20);
// Marcar de nuevo una marca manual la quita; una automática se vuelve manual; la automática no pisa nada.
assert.equal(M.markAction(undefined, "manual"), "add");
assert.equal(M.markAction("manual", "manual"), "remove");
assert.equal(M.markAction("auto", "manual"), "promote");
assert.equal(M.markAction("auto", "auto"), "skip");
assert.equal(M.markAction("manual", "auto"), "skip");
assert.equal(M.autoOverflow(M.MAX_AUTO + 3), 3);
assert.equal(M.autoOverflow(2), 0);

// ---------- Resaltado: validación ----------
const ok = (pattern, regex = false, matchCase = false, existing = []) => H.validateHl({ pattern, regex, matchCase }, existing);
assert.equal(ok("down"), null);
assert.equal(ok("a.b*c(", false), null, "un texto literal con símbolos de regex es válido");
assert.match(ok(""), /Escribe/);
assert.match(ok("   "), /Escribe/);
assert.equal(ok("err(or|disabled)", true), null);
assert.ok(ok("(abc", true), "regex mal formada");
assert.match(ok("(a+)+$", true), /Cuantificadores anidados/, "ReDoS clásico: rechazado (riskyRegex)");
assert.match(ok("(\\w*)*x", true), /Cuantificadores anidados/);
// Segunda red (repeatedGroupRisk): lo que riskyRegex no ve.
assert.match(ok("(a|aa)+c", true), /grupo repetido/);
assert.match(ok("(\\w+\\s?)+$", true), /grupo repetido/);
assert.match(ok("(?:ab|cd)*x", true), /grupo repetido/);
assert.match(ok("(\\d+\\.)*", true), /grupo repetido|vacío/);
assert.match(ok("(x+y?){2,}z", true), /grupo repetido/);
for (const fine of ["(ab)+", "(error|down)", "(Gigabit|TenGigabit)Ethernet\\d/\\d/\\d", "(\\d+\\.){3}\\d+", "(?:ab)+c", "([+*?|])+x", "\\(a|b\\)+x", "(?<n>ab)*c"]) assert.equal(ok(fine, true), null, fine);
// Ninguna de las rechazadas se cuelga si se cuela: la prueba es que las aceptadas sobre una línea hostil terminan.
for (const accepted of ["(ab)+c", "(error|down)x", "\\w+@\\w+"]) {
  const re2 = H.buildRegex({ pattern: accepted, regex: true, matchCase: false });
  fastEnough(`aceptada ${accepted} sobre línea hostil`, 500, () => H.findSpans("ab".repeat(1500) + "!", re2));
}
assert.match(ok("a".repeat(501), true), /demasiado largo/);
assert.match(ok("a".repeat(201)), /demasiado largo/);
assert.match(ok("a*", true), /vacío/, "coincide con texto vacío: no resalta nada útil");
assert.match(ok("x?", true), /vacío/);
// Duplicados y tope.
const one = { id: 1, pattern: "down", regex: false, matchCase: false, color: "yellow" };
assert.match(ok("down", false, false, [one]), /ya está/);
assert.equal(ok("down", false, true, [one]), null, "distinto en mayúsculas: otro resaltado");
assert.equal(ok("down", true, false, [one]), null, "mismo texto como regex: otro resaltado");
const eight = Array.from({ length: H.MAX_HL }, (_, i) => ({ ...one, id: i, pattern: `p${i}` }));
assert.match(ok("nuevo", false, false, eight), /Máximo/);
// Literal: escapa; sin distinguir mayúsculas por defecto.
assert.ok(H.buildRegex({ pattern: "a.b", regex: false, matchCase: false }).test("A.B"));
assert.ok(!H.buildRegex({ pattern: "a.b", regex: false, matchCase: false }).test("axb"));
assert.ok(H.buildRegex({ pattern: "a.b", regex: true, matchCase: false }).test("axb"));
assert.ok(!H.buildRegex({ pattern: "ab", regex: false, matchCase: true }).test("AB"));
// Un patrón que pasa la validación no se cuelga con una línea hostil de largo máximo.
{
  const re = H.buildRegex({ pattern: "(a|b)+c", regex: true, matchCase: false });
  fastEnough("línea hostil de 1000 caracteres", 500, () => H.findSpans("a".repeat(H.MAX_SCAN_LINE) + "!", re));
}

// ---------- Resaltado: coincidencias y celdas ----------
const re = H.buildRegex({ pattern: "down", regex: false, matchCase: false });
assert.deepEqual(H.findSpans("Gi1/0/1 is DOWN, down", re), [[11, 15], [17, 21]]);
assert.deepEqual(H.findSpans("", re), []);
assert.deepEqual(H.findSpans("x", H.buildRegex({ pattern: "x*", regex: true, matchCase: false })), [[0, 1]], "las coincidencias vacías se ignoran sin colgar");
assert.equal(H.findSpans("aaaa", H.buildRegex({ pattern: "a", regex: false, matchCase: false }), 2).length, 2, "tope por línea");

// Celdas: caracteres anchos ocupan 2 columnas; el mapa texto → columna lo respeta.
const cellsOf = (rows) => (row, x) => {
  const cells = rows[row];
  const c = cells?.[x];
  return c ? { getChars: () => c[0], getWidth: () => c[1] } : undefined;
};
{
  // "日本 down": 日(2) 本(2) espacio(1) d o w n → columnas 0-1, 2-3, 4, 5.. ; hueco de continuación de ancho 0.
  const row = [["日", 2], ["", 0], ["本", 2], ["", 0], [" ", 1], ["d", 1], ["o", 1], ["w", 1], ["n", 1]];
  const rt = H.rowText([0], 9, cellsOf([row]));
  assert.equal(rt.text, "日本 down");
  const [[s, e]] = H.findSpans(rt.text, re);
  assert.deepEqual(H.segmentsOf(rt, s, e), [{ row: 0, x: 5, width: 4 }], "columna 5, no 3: los anchos cuentan");
  const [[s2, e2]] = H.findSpans(rt.text, H.buildRegex({ pattern: "本", regex: false, matchCase: false }));
  assert.deepEqual(H.segmentsOf(rt, s2, e2), [{ row: 0, x: 2, width: 2 }]);
}
{
  // Línea envuelta en 2 filas de 6 columnas: "xxxdow" + "nyyyyy": la coincidencia cruza el salto.
  const mk = (s) => [...s].map((ch) => [ch, 1]);
  const rows = [mk("xxxdow"), mk("nyyyyy")];
  const rt = H.rowText([0, 1], 6, cellsOf(rows));
  assert.equal(rt.text, "xxxdownyyyyy");
  const [[s, e]] = H.findSpans(rt.text, re);
  assert.deepEqual(H.segmentsOf(rt, s, e), [{ row: 0, x: 3, width: 3 }, { row: 1, x: 0, width: 1 }]);
}
{
  // Ruta rápida: fila solo de ASCII (translateToString) sin leer celdas.
  let reads = 0;
  const rt = H.rowText([3], 10, () => (reads++, undefined), () => "hola down ");
  assert.equal(reads, 0);
  assert.equal(rt.text, "hola down ");
  assert.deepEqual(H.segmentsOf(rt, 5, 9), [{ row: 3, x: 5, width: 4 }]);
  // Con caracteres anchos o acentos fuera de latín, se lee celda a celda.
  reads = 0;
  H.rowText([3], 3, (r, x) => (reads++, undefined), () => "日 ");
  assert.ok(reads > 0);
}

console.log("termTools: ok");
