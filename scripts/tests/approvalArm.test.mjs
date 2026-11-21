// Retardo de seguridad de los diálogos de aprobación (src/lib/approvalArm.ts) y nombre de la
// sesión donde corre un plugin (src/lib/pluginRuns.ts).
// Uso: node scripts/tests/approvalArm.test.mjs   (Node 22.15+ con tipos TS)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { ARM_DELAY_MS, isArmed } = await import("../../src/lib/approvalArm.ts");
const { pluginSessionName } = await import("../../src/lib/pluginRuns.ts");

// ---------- Doble clic en «Permitir» ----------
{
  // El segundo clic de un doble clic llega dentro del intervalo de doble clic del sistema
  // (500 ms por defecto en Windows): cae sobre la solicitud siguiente y no debe aprobarla.
  assert.ok(ARM_DELAY_MS > 500, "el retardo supera el intervalo de doble clic por defecto");
  const shown = 10_000;
  for (const dt of [0, 80, 250, 499, ARM_DELAY_MS - 1]) assert.equal(isArmed(shown, shown + dt), false, `${dt} ms`);
  assert.equal(isArmed(shown, shown + ARM_DELAY_MS), true);
  assert.equal(isArmed(shown, shown + 5_000), true);
  assert.equal(isArmed(shown, shown + 100, 50), true, "retardo configurable");

  // Los dos diálogos usan el retardo por solicitud y deshabilitan «Permitir» mientras corre.
  const src = (f) => readFileSync(new URL(`../../src/components/${f}`, import.meta.url), "utf8");
  const approval = src("ApprovalDialog.tsx");
  assert.match(approval, /useArmed\(request\.id\)/);
  assert.match(approval, /disabled=\{blocked \|\| !armed\}/);
  assert.match(approval, /if \(blocked \|\| !canApprove\(\)\) return;/);
  const prompts = src("ScriptPrompts.tsx");
  assert.equal((prompts.match(/useArmed\(`\$\{p\.run\}:\$\{p\.id\}`\)/g) ?? []).length, 2, "GateDialog y SecretDialog");
  assert.match(prompts, /onClick=\{\(\) => canApprove\(\) && onDecide\(true\)\}/);
  // El id del pedido es por ejecución: la clave del diálogo incluye el run.
  assert.match(prompts, /<GateDialog key=\{`\$\{current\.run\}:\$\{current\.id\}`\}/);
}

// ---------- Sesión donde corre un plugin ----------
{
  const tabs = [
    { tabId: "t-1", name: "core-sw01" },
    { tabId: "t-2", name: "edge#rt01" },
  ];
  assert.equal(pluginSessionName("t-1#3", tabs), "core-sw01");
  assert.equal(pluginSessionName("t-2#1", tabs), "edge#rt01");
  assert.equal(pluginSessionName("t-9#1", tabs), null, "pestaña desconocida");
  assert.equal(pluginSessionName(null, tabs), null, "sin conexión");
  assert.equal(pluginSessionName("t-1#1", undefined), null, "sin lista de pestañas");
  // Un id con «#» en la pestaña: se corta en el último.
  assert.equal(pluginSessionName("a#b#2", [{ tabId: "a#b", name: "x" }]), "x");
}

console.log("approvalArm: OK");
