// Genera THIRD_PARTY_NOTICES.md con las bibliotecas de terceros que se empaquetan en la app:
// dependencias de producción de npm (package-lock.json, sin las de desarrollo) y crates de Rust
// enlazados en el ejecutable (dependencias normales alcanzables desde net-terminal, todas las
// plataformas; sin las de build ni de desarrollo).
// Uso (tras `npm ci` y con cargo en el PATH): `node scripts/licenses/generar-avisos.mjs`.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const LICENSE_FILE = /^(licen[cs]e|copying|unlicense)([-._].*)?$/i;
const NOTICE_FILE = /^notice([-._].*)?$/i;

/** Archivos de licencia y NOTICE de un paquete. */
function licenseFiles(dir) {
  if (!existsSync(dir)) return { licenses: [], notices: [] };
  const files = readdirSync(dir).sort();
  const read = (f) => readFileSync(join(dir, f), "utf8").replace(/\r\n/g, "\n").trim();
  return {
    licenses: files.filter((f) => LICENSE_FILE.test(f)).map((f) => ({ file: f, text: read(f) })),
    notices: files.filter((f) => NOTICE_FILE.test(f)).map((f) => ({ file: f, text: read(f) })),
  };
}

/** Líneas de copyright del archivo de licencia (lo que MIT, BSD e ISC piden conservar). */
function copyrights(texts) {
  const out = new Set();
  for (const t of texts)
    for (const line of t.split("\n")) {
      const l = line.trim();
      if (/^(copyright|\(c\)|©)\s/i.test(l) && !/\[yyyy\]|\{yyyy\}|<year>|\[name of copyright owner\]/i.test(l)) out.add(l.slice(0, 200));
    }
  return [...out].slice(0, 5);
}

/** Sin licencia declarada en package.json: se deduce del encabezado del archivo de licencia. */
function fromFile(licenses) {
  const head = licenses[0]?.text.slice(0, 300) ?? "";
  if (/\bMIT License\b|Permission is hereby granted, free of charge/i.test(head + (licenses[0]?.text ?? "").slice(0, 2000))) return "MIT (según su archivo de licencia)";
  if (/Apache License,?\s+Version 2\.0/i.test(head)) return "Apache-2.0 (según su archivo de licencia)";
  if (/ISC License/i.test(head)) return "ISC (según su archivo de licencia)";
  return "Sin declarar";
}

// ---------- npm ----------
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
const npm = Object.entries(lock.packages)
  .filter(([path, p]) => path && !p.dev && !p.devOptional)
  .map(([path, p]) => {
    const dir = join(root, path);
    const pkg = existsSync(join(dir, "package.json")) ? JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) : {};
    const repo = typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url;
    const files = licenseFiles(dir);
    return {
      name: path.replace(/^.*node_modules\//, ""),
      version: p.version ?? pkg.version ?? "",
      license: p.license ?? pkg.license ?? fromFile(files.licenses),
      repo: repo ?? pkg.homepage ?? "",
      ...files,
    };
  });

// ---------- Rust ----------
const meta = JSON.parse(
  execFileSync("cargo", ["metadata", "--format-version", "1", "--locked", "--manifest-path", join(root, "src-tauri/Cargo.toml")], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  }),
);
const byId = new Map(meta.packages.map((p) => [p.id, p]));
const nodes = new Map(meta.resolve.nodes.map((n) => [n.id, n]));
const own = meta.resolve.root;
const seen = new Set();
const queue = [own];
while (queue.length) {
  const id = queue.pop();
  for (const d of nodes.get(id)?.deps ?? []) {
    // Solo dependencias normales (kind null): las de build y desarrollo no van en el ejecutable.
    if (!d.dep_kinds.some((k) => k.kind === null)) continue;
    if (!seen.has(d.pkg)) {
      seen.add(d.pkg);
      queue.push(d.pkg);
    }
  }
}
const rust = [...seen]
  .map((id) => byId.get(id))
  .filter((p) => p && p.id !== own)
  .map((p) => ({
    name: p.name,
    version: p.version,
    license: p.license ?? (p.license_file ? `Ver ${p.license_file}` : "Sin declarar"),
    repo: p.repository ?? "",
    ...licenseFiles(dirname(p.manifest_path)),
  }));

// ---------- Documento ----------
const sortByName = (a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version);
npm.sort(sortByName);
rust.sort(sortByName);
const all = [...npm, ...rust];
const esc = (s) => String(s).replace(/\|/g, "\\|");
const repoLink = (r) => {
  const url = r
    .replace(/^git\+/, "")
    .replace(/\.git$/, "")
    .replace(/^git:\/\//, "https://")
    .replace(/^github:/, "https://github.com/")
    .replace(/^(?!https?:)([\w.-]+\/[\w.-]+)$/, "https://github.com/$1");
  return /^https?:\/\//.test(url) ? url : "";
};
const table = (list) =>
  ["| Paquete | Versión | Licencia | Repositorio |", "| --- | --- | --- | --- |", ...list.map((p) => `| ${esc(p.name)} | ${esc(p.version)} | ${esc(p.license)} | ${repoLink(p.repo)} |`)].join("\n");

const count = new Map();
for (const p of all) count.set(p.license, (count.get(p.license) ?? 0) + 1);

// Un texto completo por licencia (el primero encontrado de cada expresión SPDX).
const texts = new Map();
for (const p of all)
  for (const l of p.licenses) {
    const key = `${p.license}`;
    if (!texts.has(key) && l.text.length > 200) texts.set(key, { from: `${p.name} ${p.version} (${l.file})`, text: l.text });
  }

const lines = [
  "# Avisos de terceros",
  "",
  "NetTerminal incluye las bibliotecas de terceros listadas abajo. Cada una se distribuye bajo su propia licencia, que no cambia por la licencia de NetTerminal ([LICENSE.md](LICENSE.md)).",
  "",
  `Generado con \`node scripts/licenses/generar-avisos.mjs\` a partir de \`package-lock.json\` (dependencias de producción) y de \`src-tauri/Cargo.lock\` (crates enlazados en la app, todas las plataformas). ${npm.length} paquetes de npm y ${rust.length} crates de Rust.`,
  "",
  "## Resumen por licencia",
  "",
  "| Licencia | Paquetes |",
  "| --- | --- |",
  ...[...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([l, n]) => `| ${esc(l)} | ${n} |`),
  "",
  "## Licencias con condiciones adicionales",
  "",
  "- **MPL-2.0** (copyleft por archivo) y **EPL-2.0** (copyleft por módulo): NetTerminal usa estas bibliotecas sin modificarlas. Su código fuente está disponible en los repositorios indicados en las tablas y en crates.io o npm para la versión listada.",
  "- **Licencias con alternativa** (por ejemplo \"MIT OR GPL-3.0-only\" o \"MIT OR Apache-2.0 OR LGPL-2.1-or-later\"): NetTerminal usa cada biblioteca bajo la alternativa permisiva (MIT o Apache-2.0).",
  "- **Unicode-3.0**, **CDLA-Permissive-2.0** y **BSL-1.0**: licencias permisivas; su texto está en la última sección.",
  "",
  "## Interfaz (npm)",
  "",
  table(npm),
  "",
  "## Aplicación (Rust)",
  "",
  table(rust),
  "",
  "## Avisos de copyright",
  "",
  "Líneas de copyright tomadas del archivo de licencia de cada paquete. Los paquetes sin línea de copyright en su archivo de licencia se rigen por el texto de la sección siguiente.",
  "",
  ...all.flatMap((p) => {
    const c = copyrights(p.licenses.map((l) => l.text));
    return c.length ? [`- **${p.name} ${p.version}:** ${c.map(esc).join("; ")}`] : [];
  }),
  "",
  "## Archivos NOTICE",
  "",
  "Contenido de los archivos NOTICE que exige la licencia Apache 2.0.",
  "",
  ...all.flatMap((p) => p.notices.map((n) => `### ${p.name} ${p.version}\n\n\`\`\`text\n${n.text.slice(0, 4000)}\n\`\`\`\n`)),
  "## Textos de licencia",
  "",
  ...[...texts].sort((a, b) => a[0].localeCompare(b[0])).map(([l, t]) => `### ${l}\n\nTexto tomado de ${t.from}.\n\n\`\`\`text\n${t.text}\n\`\`\`\n`),
];
writeFileSync(join(root, "THIRD_PARTY_NOTICES.md"), lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n");
console.log(`THIRD_PARTY_NOTICES.md: ${npm.length} npm, ${rust.length} Rust, ${texts.size} textos de licencia`);
