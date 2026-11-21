// Presupuestos de rendimiento: falla (código 1) si la app deja de sentirse instantánea.
// Uso: `npm run perf` (requiere Playwright con Chromium: `npx playwright install chromium`).
//
// Qué mide, sobre un build de producción de la demo (scripts/screenshots/demo.html, datos ficticios):
//  - Fluidez: cuadros por segundo y cuadros lentos (> 18 ms) al arrastrar ventanas, desplazar,
//    cambiar de pestaña, mover y hacer zoom en la topología con tráfico animado.
//  - Tiempo hasta ver el contenido: abrir Herramientas, cada módulo, Ajustes y CLI Lab.
//  - Reposo: tiempo de CPU del hilo principal con todo abierto y sin tocar nada.
//  - Arranque: tamaño (gzip) del JavaScript inicial de la app.
// El terminal se mide sin WebGL: en máquinas sin GPU Chromium lo emula por software y los números
// dejan de representar a un equipo real. En macOS, el "Medidor de fluidez" de la paleta de comandos
// sirve para comprobar lo mismo dentro de la app.
// Variables: SLACK=1.5 da holgura en máquinas compartidas (CI); CPU=4 simula un equipo 4 veces más lento (los presupuestos se escalan); KEEP=1 deja el build.
import { build } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const CPU = Number(process.env.CPU ?? 1);
// Holgura para máquinas compartidas y ruidosas (CI): multiplica tiempos y cuadros lentos permitidos.
const SLACK = Number(process.env.SLACK ?? 1);

// ---------- Presupuestos ----------
// A velocidad normal (CPU=1). Con CPU>1, los tiempos se multiplican por CPU y la fluidez se relaja.
const BUDGET = {
  minFps: CPU > 1 ? 45 : 55,
  maxSlowFrames: Math.round((CPU > 1 ? 10 : 3) * SLACK), // cuadros > 18 ms por escenario
  openMs: Math.round(100 * CPU * SLACK), // primera apertura de una vista (umbral de "instantáneo", Nielsen Norman Group)
  reopenMs: Math.round(50 * CPU * SLACK), // volver a una vista ya abierta
  idleBusyPct: 10 * CPU * SLACK, // % de CPU del hilo principal en reposo
  initialJsKb: 330, // JavaScript inicial de la app, gzip
};

let playwright;
try {
  playwright = createRequire(import.meta.url)("playwright");
} catch {
  try {
    playwright = createRequire(join(process.env.NODE_PATH ?? "/opt/node-tools/node_modules", "x"))("playwright");
  } catch {
    console.error("Falta Playwright: `npm i -g playwright && npx playwright install chromium`.");
    process.exit(2);
  }
}

const out = mkdtempSync(join(tmpdir(), "nt-perf-"));
const plugins = [react(), tailwindcss()];

// ---------- Arranque: JS inicial de la app real ----------
await build({ root: ROOT, configFile: false, plugins, logLevel: "error", build: { outDir: join(out, "app"), emptyOutDir: true } });
const indexHtml = readFileSync(join(out, "app", "index.html"), "utf8");
const initialFiles = [...indexHtml.matchAll(/(?:src|href)="\/?(assets\/[^"]+\.js)"/g)].map((m) => m[1]);
const initialKb = initialFiles.reduce((n, f) => n + gzipSync(readFileSync(join(out, "app", f))).length, 0) / 1024;

// ---------- Demo de producción servida localmente ----------
await build({
  root: ROOT,
  configFile: false,
  plugins,
  logLevel: "error",
  build: { outDir: join(out, "demo"), emptyOutDir: true, rollupOptions: { input: { demo: join(ROOT, "scripts/screenshots/demo.html") } } },
});
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".json": "application/json" };
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "");
  const file = join(out, "demo", path);
  if (!file.startsWith(join(out, "demo")) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
}).listen(0);
const PORT = server.address().port;
const url = (scene) => `http://localhost:${PORT}/scripts/screenshots/demo.html?scene=${scene}&theme=light`;

const browser = await playwright.chromium.launch({ args: ["--disable-webgl", "--disable-webgl2"] });
const results = [];
const check = (name, value, limit, unit, ok) => results.push({ name, value, limit, unit, ok: ok ?? value <= limit });

async function page(scene, wait = 3500) {
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  if (CPU > 1) await (await p.context().newCDPSession(p)).send("Emulation.setCPUThrottlingRate", { rate: CPU });
  const errors = [];
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(url(scene));
  await p.waitForTimeout(wait);
  p.errors = errors;
  return p;
}

/**
 * Espera a que la página quede quieta (600 ms sin tareas largas, máximo 10 s): cada escenario mide
 * la interacción, no lo que queda pendiente de la carga (en CI, más lento, la carga se extiende).
 */
async function settle(p) {
  await p.evaluate(
    () =>
      new Promise((done) => {
        let last = performance.now();
        const obs = new PerformanceObserver((l) => {
          for (const e of l.getEntries()) last = Math.max(last, e.startTime + e.duration);
        });
        obs.observe({ type: "longtask", buffered: true });
        const start = performance.now();
        const tick = () => {
          const now = performance.now();
          if (now - last >= 600 || now - start > 10000) {
            obs.disconnect();
            done();
          } else setTimeout(tick, 100);
        };
        tick();
      }),
  );
}

/** Cuadros durante `action`: fps promedio y cuadros lentos (> 18 ms). */
async function frames(p, name, action) {
  await settle(p);
  await p.evaluate(() => {
    window.__f = [];
    window.__run = true;
    let last = performance.now();
    const tick = (t) => {
      window.__f.push(t - last);
      last = t;
      if (window.__run) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await action();
  const f = (await p.evaluate(() => ((window.__run = false), window.__f))).slice(2);
  const avg = f.reduce((a, b) => a + b, 0) / Math.max(1, f.length);
  const fps = Math.round((1000 / avg) * 10) / 10;
  const slow = f.filter((x) => x > 18).length;
  check(`${name}: fps`, fps, BUDGET.minFps, "fps", fps >= BUDGET.minFps);
  check(`${name}: cuadros lentos`, slow, BUDGET.maxSlowFrames, "");
}

async function drag(p, x, y, dx, dy, ms = 1200) {
  await p.mouse.move(x, y);
  await p.mouse.down();
  const n = Math.round(ms / 8);
  for (let i = 1; i <= n; i++) {
    await p.mouse.move(x + (dx * i) / n, y + dy * Math.sin((i / n) * Math.PI));
    await p.waitForTimeout(8);
  }
  await p.mouse.up();
}

/** Milisegundos desde el clic hasta que se pinta un encabezado con `text`. */
async function timeTo(p, label, text) {
  return p.evaluate(
    async ([label, text]) => {
      const btn = [...document.querySelectorAll("button")].find((b) => (b.getAttribute("aria-label") || b.title || b.textContent || "").trim().startsWith(label));
      if (!btn) return Infinity;
      const t0 = performance.now();
      btn.click();
      return new Promise((done) => {
        const look = () => {
          if ([...document.querySelectorAll("h1,h2,h3,[role=dialog] header")].some((h) => h.textContent.includes(text))) requestAnimationFrame(() => done(Math.round(performance.now() - t0)));
          else if (performance.now() - t0 > 5000) done(Infinity);
          else requestAnimationFrame(look);
        };
        look();
      });
    },
    [label, text],
  );
}

const pageErrors = [];
try {
  // Ventanas flotantes
  let p = await page("terminal");
  check("Abrir CLI Lab", await timeTo(p, "CLI Lab", "CLI Lab"), BUDGET.openMs, "ms");
  await p.waitForTimeout(300);
  let hb = await p.locator('[role=dialog][aria-label="CLI Lab"] header').boundingBox();
  await frames(p, "Arrastrar CLI Lab", () => drag(p, hb.x + hb.width * 0.6, hb.y + 20, 300, 120));
  await p.keyboard.press("Escape");
  // Terminal
  const vp = await p.locator(".xterm-screen").first().boundingBox();
  await frames(p, "Desplazar terminal", async () => {
    await p.mouse.move(vp.x + 200, vp.y + 200);
    for (let i = 0; i < 60; i++) {
      await p.mouse.wheel(0, i % 30 < 15 ? 80 : -80);
      await p.waitForTimeout(16);
    }
  });
  await frames(p, "Cambiar de pestaña", async () => {
    for (let i = 0; i < 10; i++) {
      await p.keyboard.press(i % 2 ? "Control+Tab" : "Control+Shift+Tab");
      await p.waitForTimeout(120);
    }
  });
  // Herramientas: primera apertura y reapertura
  check("Abrir Herramientas", await timeTo(p, "Herramientas", "Monitoreo"), BUDGET.openMs, "ms");
  const MODULES = [
    ["Auditoría", "Auditoría de seguridad"],
    ["SNMP", "SNMP"],
    ["Respaldos", "Respaldos"],
    ["Buscar en logs", "Buscar"],
    ["Topología", "Topología"],
    ["Transferencias", "Transferencias"],
    ["Diagnóstico", "Diagnóstico"],
    ["Syslog", "Syslog"],
  ];
  for (const [nav, h] of MODULES) check(`Abrir ${nav}`, await timeTo(p, nav, h), BUDGET.openMs, "ms");
  for (const [nav, h] of MODULES.slice(0, 4)) check(`Volver a ${nav}`, await timeTo(p, nav, h), BUDGET.reopenMs, "ms");
  // Reposo con todo abierto
  const cdp = await p.context().newCDPSession(p);
  await cdp.send("Performance.enable");
  const before = (await cdp.send("Performance.getMetrics")).metrics.find((m) => m.name === "TaskDuration").value;
  await p.waitForTimeout(3000);
  const after = (await cdp.send("Performance.getMetrics")).metrics.find((m) => m.name === "TaskDuration").value;
  check("Reposo: CPU del hilo principal", Math.round(((after - before) / 3) * 1000) / 10, BUDGET.idleBusyPct, "%");
  pageErrors.push(...p.errors);
  await p.close();

  // Ajustes
  p = await page("terminal");
  check("Abrir Ajustes", await timeTo(p, "Ajustes", "Apariencia"), BUDGET.openMs, "ms");
  hb = await p.locator('[role=dialog] [style*="cursor: move"]').first().boundingBox();
  await frames(p, "Arrastrar Ajustes", () => drag(p, hb.x + 60, hb.y + 10, 300, 100));
  pageErrors.push(...p.errors);
  await p.close();

  // Topología con tráfico animado
  p = await page("topology-traffic", 16000);
  await frames(p, "Topología: animación", () => p.waitForTimeout(1500));
  const svg = await p.locator("svg").first().boundingBox();
  await frames(p, "Topología: mover mapa", () => drag(p, svg.x + svg.width / 2, svg.y + svg.height / 2, 250, 80));
  await frames(p, "Topología: zoom", async () => {
    await p.mouse.move(svg.x + svg.width / 2, svg.y + svg.height / 2);
    for (let i = 0; i < 40; i++) {
      await p.mouse.wheel(0, i < 20 ? -60 : 60);
      await p.waitForTimeout(25);
    }
  });
  pageErrors.push(...p.errors);
  await p.close();

  // Auditoría: desplazar hallazgos
  p = await page("audit");
  await frames(p, "Auditoría: desplazar", async () => {
    await p.mouse.move(900, 500);
    for (let i = 0; i < 50; i++) {
      await p.mouse.wheel(0, i < 25 ? 120 : -120);
      await p.waitForTimeout(16);
    }
  });
  pageErrors.push(...p.errors);
  await p.close();
} finally {
  await browser.close();
  server.close();
  if (!process.env.KEEP) rmSync(out, { recursive: true, force: true });
  else console.log(`Build en ${out}`);
}

check("Arranque: JS inicial (gzip)", Math.round(initialKb), BUDGET.initialJsKb, "KB");
check("Errores de la página", pageErrors.length, 0, "");

const w = Math.max(...results.map((r) => r.name.length));
console.log(`\nPresupuestos de rendimiento${CPU > 1 ? ` (CPU ${CPU}x más lenta)` : ""}\n`);
for (const r of results) {
  const lim = r.unit === "fps" ? `>= ${r.limit}` : `<= ${r.limit}`;
  console.log(`${r.ok ? "ok  " : "FALLA"} ${r.name.padEnd(w)}  ${String(r.value).padStart(6)} ${r.unit.padEnd(3)} (${lim})`);
}
if (pageErrors.length) console.log("\n" + pageErrors.join("\n"));
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\n${failed.length} presupuesto(s) excedido(s).` : "\nTodo dentro del presupuesto.");
process.exit(failed.length ? 1 : 0);
