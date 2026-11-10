// Difusión a varias sesiones (src/lib/broadcast.ts): selección de destinos, etiquetas y ejecución.
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, next) {
    if (/^\.\.?\//.test(specifier) && !/\.[cm]?[jt]s$/.test(specifier) && context.parentURL?.endsWith(".ts")) {
      for (const cand of [`${specifier}.ts`, `${specifier}/index.ts`]) {
        try {
          return next(cand, context);
        } catch {
          /* sigue con el siguiente candidato */
        }
      }
    }
    return next(specifier, context);
  },
});

const X = await import("../../src/lib/broadcast.ts");

const tab = (id, folder, o = {}) => ({ id, session: { id: `s-${id}`, name: `sw-${id}`, type: "ssh", host: `192.0.2.${id.length + 10}`, folder, ...o.session }, title: o.title });
const tabs = [
  tab("a", "Clientes/Acme/Core"),
  tab("b", "Clientes/Acme"),
  tab("c", "Clientes/Beta"),
  tab("d", "Clientes/AcmeX"),
  tab("e", undefined, { session: { type: "local", name: "local" } }),
  tab("f", "Lab", { title: "  Mi título " }),
];
const connected = new Set(["a", "b", "c", "d", "e"]);
const status = (id) => (connected.has(id) ? "connected" : id === "f" ? "closed" : undefined);
const ids = (r) => r.targets.map((t) => t.id);
const skippedIds = (r) => r.skipped.map((s) => `${s.tab.id}:${s.reason}`);
const T = (mode, o = {}) => ({ mode, tabIds: [], folder: "", ...o });

// ---------- resolveTargets ----------
{
  let r = X.resolveTargets(T("current"), tabs, status, "a", null);
  assert.deepEqual([ids(r), r.skipped.length], [["a"], 0]);
  r = X.resolveTargets(T("current"), tabs, status, null, null);
  assert.deepEqual([ids(r), r.skipped.length], [[], 0], "sin pestaña activa no hay destino");
  r = X.resolveTargets(T("current"), tabs, status, "e", null);
  assert.deepEqual([ids(r), skippedIds(r)], [[], ["e:Terminal local"]]);
  r = X.resolveTargets(T("current"), tabs, status, "f", null);
  assert.deepEqual(skippedIds(r), ["f:Desconectada"]);

  r = X.resolveTargets(T("tabs", { tabIds: ["c", "a", "zzz", "f"] }), tabs, status, "a", null);
  assert.deepEqual(ids(r), ["a", "c"], "orden de las pestañas, ignora ids inexistentes");
  assert.deepEqual(skippedIds(r), ["f:Desconectada"]);
  assert.deepEqual(ids(X.resolveTargets(T("tabs"), tabs, status, "a", null)), []);

  // Carpeta: incluye subcarpetas, no prefijos de texto ("AcmeX").
  r = X.resolveTargets(T("folder", { folder: "Clientes/Acme" }), tabs, status, null, null);
  assert.deepEqual(ids(r), ["a", "b"]);
  assert.deepEqual(ids(X.resolveTargets(T("folder", { folder: "Clientes" }), tabs, status, null, null)), ["a", "b", "c", "d"]);
  assert.deepEqual(ids(X.resolveTargets(T("folder", { folder: "" }), tabs, status, null, null)), [], "carpeta vacía: nada");
  assert.deepEqual(ids(X.resolveTargets(T("folder", { folder: "Inexistente" }), tabs, status, null, null)), []);

  // Paneles: los visibles; sin vista dividida, solo la activa.
  assert.deepEqual(ids(X.resolveTargets(T("panes"), tabs, status, "b", ["a", "c"])), ["a", "c"]);
  assert.deepEqual(ids(X.resolveTargets(T("panes"), tabs, status, "b", null)), ["b"]);
  assert.deepEqual(ids(X.resolveTargets(T("panes"), tabs, status, null, null)), []);
  // Desconocido cae al modo "current".
  assert.deepEqual(ids(X.resolveTargets(T("otro"), tabs, status, "c", null)), ["c"]);
  // Estado indefinido cuenta como desconectada.
  assert.deepEqual(skippedIds(X.resolveTargets(T("tabs", { tabIds: ["zz"] }), [tab("zz", "x")], () => undefined, null, null)), ["zz:Desconectada"]);
}

// ---------- openFolders ----------
{
  const ws = { tabs: tabs.map((t) => ({ id: t.id, title: t.id, session: t.session, status: "connected" })), panes: null, activeId: null };
  assert.deepEqual(X.openFolders(ws), ["Clientes", "Clientes/Acme", "Clientes/Acme/Core", "Clientes/AcmeX", "Clientes/Beta", "Lab"]);
  assert.deepEqual(X.openFolders({ tabs: [], panes: null, activeId: null }), []);
}

// ---------- targetLabel ----------
{
  const ws = { tabs: [{ id: "a" }, { id: "b" }], panes: ["a", "b", "c"], activeId: "a" };
  assert.equal(X.targetLabel(T("current"), ws), "Pestaña actual");
  assert.equal(X.targetLabel(T("tabs", { tabIds: ["a", "b", "zz"] }), ws), "2 pestañas elegidas", "no cuenta pestañas cerradas");
  assert.equal(X.targetLabel(T("folder", { folder: "Core" }), ws), "Carpeta Core");
  assert.equal(X.targetLabel(T("folder"), ws), "Carpeta (elige una)");
  assert.equal(X.targetLabel(T("panes"), ws), "3 paneles visibles");
  assert.equal(X.targetLabel(T("panes"), { ...ws, panes: null }), "Paneles visibles (vista única)");
}

// ---------- estado global ----------
assert.deepEqual(X.getBroadcastTarget(), { mode: "current", tabIds: [], folder: "" });
X.setBroadcastTarget({ mode: "folder", folder: "Lab" });
assert.deepEqual(X.getBroadcastTarget(), { mode: "folder", tabIds: [], folder: "Lab" }, "parche parcial");
X.setBroadcastTarget({ mode: "current", folder: "" });
assert.equal(X.getBroadcastRun(), null);
assert.equal(X.isBroadcastRunning(), false);

// ---------- runBroadcast ----------
const sender = (log, name, { connected = true, fail = false } = {}) => ({
  isConnected: () => connected,
  send: async (text, delay) => {
    log.push([name, text, delay]);
    if (fail) throw new Error("tiempo agotado");
  },
});

{
  const log = [];
  const targets = [tabs[0], tabs[1], tabs[2], tabs[3]];
  const senders = { a: sender(log, "a"), b: sender(log, "b", { fail: true }), c: sender(log, "c", { connected: false }) };
  const seen = [];
  const un = () => seen.push(X.getBroadcastRun()?.items.map((i) => i.status).join(","));
  await X.runBroadcast(targets, [{ tab: tabs[4], reason: "Terminal local" }], "show clock\nshow version\n\n", { lineDelayMs: 5, deviceDelayMs: 0 }, (id) => senders[id]);
  un();
  const run = X.getBroadcastRun();
  assert.equal(run.running, false);
  assert.equal(run.lines, 2, "cuenta líneas sin los saltos finales");
  assert.deepEqual(
    run.items.map((i) => [i.tabId, i.status, i.reason]),
    [["a", "ok", undefined], ["b", "error", "Error: tiempo agotado"], ["c", "skipped", "Se desconectó"], ["d", "skipped", "Se desconectó"], ["e", "skipped", "Terminal local"]],
  );
  assert.deepEqual(log, [["a", "show clock\nshow version\n\n", 5], ["b", "show clock\nshow version\n\n", 5]], "sin sender o desconectada no se envía");
  // clearBroadcast limpia el resultado cuando ya terminó.
  X.clearBroadcast();
  assert.equal(X.getBroadcastRun(), null);
}

// Nombre de la pestaña: título propio recortado o nombre de la sesión.
{
  await X.runBroadcast([tabs[5], tabs[0]], [], "x", { lineDelayMs: 0, deviceDelayMs: 0 }, () => sender([], "z"));
  assert.deepEqual(X.getBroadcastRun().items.map((i) => i.name), ["Mi título", "sw-a"]);
  X.clearBroadcast();
}

// Detener: lo que falta queda en "stopped"; la pausa entre equipos se corta enseguida.
{
  const log = [];
  const t0 = Date.now();
  const p = X.runBroadcast([tabs[0], tabs[1], tabs[2]], [], "x", { lineDelayMs: 0, deviceDelayMs: 60_000 }, (id) => sender(log, id));
  // El primero se envía, luego espera 60 s entre equipos: se detiene durante la pausa.
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(X.isBroadcastRunning(), true);
  X.clearBroadcast();
  assert.ok(X.getBroadcastRun(), "no se limpia mientras corre");
  X.stopBroadcast();
  await p;
  assert.ok(Date.now() - t0 < 5000, "Detener responde sin esperar los 60 s");
  assert.deepEqual(X.getBroadcastRun().items.map((i) => i.status), ["ok", "stopped", "stopped"]);
  assert.deepEqual(log.map((l) => l[0]), ["a"]);
  X.clearBroadcast();
}

// Una segunda difusión mientras hay una en curso se ignora.
{
  const log = [];
  let release;
  const gate = new Promise((r) => (release = r));
  const slow = { isConnected: () => true, send: async (t) => (log.push(t), gate) };
  const first = X.runBroadcast([tabs[0]], [], "uno", { lineDelayMs: 0, deviceDelayMs: 0 }, () => slow);
  await new Promise((r) => setTimeout(r, 10));
  await X.runBroadcast([tabs[1]], [], "dos", { lineDelayMs: 0, deviceDelayMs: 0 }, () => slow);
  assert.deepEqual(log, ["uno"]);
  release();
  await first;
  assert.equal(X.isBroadcastRunning(), false);
  // Un "Detener" viejo no afecta a la siguiente: se reinicia al comenzar.
  X.stopBroadcast();
  await X.runBroadcast([tabs[0]], [], "tres", { lineDelayMs: 0, deviceDelayMs: 0 }, () => sender([], "q"));
  assert.equal(X.getBroadcastRun().items[0].status, "ok");
  X.clearBroadcast();
}

// Sin destinos: termina sin enviar y sin colgarse.
await X.runBroadcast([], [{ tab: tabs[4], reason: "Terminal local" }], "x", { lineDelayMs: 0, deviceDelayMs: 0 }, () => undefined);
assert.deepEqual(X.getBroadcastRun().items.map((i) => i.status), ["skipped"]);
assert.equal(X.getBroadcastRun().running, false);

console.log("broadcast: ok");
