//! Búsqueda global en los logs de sesión, los respaldos de configuración y (opcional) las notas
//! sin protección. Todo bajo demanda: sin índice, sin hilos ni temporizadores en reposo. Cada
//! búsqueda recorre los archivos uno por uno desde un hilo propio, lee en streaming (nunca el
//! archivo completo en memoria), usa el motor `regex` de Rust (tiempo lineal, sin retroceso) con
//! límites de tamaño de programa, y se puede cancelar en cualquier momento.
//!
//! Seguridad: solo se lee dentro de la carpeta de logs en uso, `backups/` y `notes/`. No se siguen
//! enlaces simbólicos (ni de carpetas ni de archivos), no se leen archivos ocultos (la llave de
//! los respaldos y las huellas de secretos son ocultos), de los respaldos solo los archivos con el
//! nombre que crea la app, de las notas solo `.txt` sin nota protegida del mismo nombre (nunca
//! `.ntenc`) y la bóveda de contraseñas queda fuera por construcción (no está en esas carpetas ni
//! tiene esas extensiones). Se busca el contenido tal como está en disco: no se desenmascara
//! nada y los logs ya traen sus secretos enmascarados.

use regex::{Regex, RegexBuilder};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::fs::{self, File};
use std::io::{BufRead, BufReader, Read};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

/// Largo máximo del texto buscado.
const MAX_QUERY: usize = 500;
/// Archivos máximos que se consideran en una búsqueda (tope del recorrido de carpetas).
const MAX_FILES: usize = 50_000;
const MAX_DEPTH: usize = 8;
const DEFAULT_MAX_RESULTS: usize = 500;
const MAX_RESULTS: usize = 5000;
/// Coincidencias máximas que se muestran por archivo.
const PER_FILE_HITS: usize = 200;
const DEFAULT_FILE_MB: u64 = 64;
const MAX_FILE_MB: u64 = 1024;
/// Línea más larga que se examina: el resto de una línea gigante (sin saltos) se descarta.
const MAX_LINE: usize = 64 * 1024;
/// Coincidencias resaltadas por línea; el resto se informa como "+N más" (`Hit::extra`).
const MAX_RANGES_PER_LINE: usize = 50;
/// La marca de cancelación se revisa al leer esta cantidad de bytes o cuando pasa este tiempo,
/// lo que ocurra primero (no por cantidad de líneas: una línea puede ser de 64 KB).
const CANCEL_EVERY_BYTES: usize = 256 * 1024;
const CANCEL_EVERY: Duration = Duration::from_millis(50);
/// Caracteres visibles de una coincidencia y de una línea de contexto.
const SHOW_CHARS: usize = 600;
const SHOW_CONTEXT_CHARS: usize = 300;
const MAX_CONTEXT: usize = 5;
/// Cada cuánto se informan avances y resultados nuevos a la interfaz.
const EMIT_EVERY: Duration = Duration::from_millis(150);

// ---------- Parámetros ----------

#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Logs,
    Backups,
    Notes,
}

impl Kind {
    pub fn parse(s: &str) -> Result<Kind, String> {
        match s {
            "logs" => Ok(Kind::Logs),
            "backups" => Ok(Kind::Backups),
            "notes" => Ok(Kind::Notes),
            _ => Err("Tipo de archivo desconocido".into()),
        }
    }
}

#[derive(Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct SearchParams {
    pub query: String,
    /// true: `query` es una expresión regular; false: texto literal.
    #[serde(default)]
    pub regex: bool,
    #[serde(default)]
    pub case_sensitive: bool,
    /// "logs", "backups" y/o "notes".
    pub kinds: Vec<String>,
    /// Fechas locales AAAA-MM-DD (inclusive) sobre la fecha del archivo.
    pub from: Option<String>,
    pub to: Option<String>,
    /// Texto que debe contener la ruta (sesión o equipo), sin distinguir mayúsculas.
    pub scope: Option<String>,
    /// Líneas de contexto antes y después (0 a 5).
    pub context: Option<usize>,
    pub max_results: Option<usize>,
    /// Tamaño máximo que se lee de cada archivo, en MB.
    pub max_file_mb: Option<u64>,
}

pub struct Prepared {
    re: Regex,
    kinds: Vec<Kind>,
    range: (u64, u64),
    scope: Option<String>,
    context: usize,
    max_results: usize,
    max_file_bytes: u64,
    /// Intervalo entre avances (las pruebas lo ponen en cero).
    emit_every: Duration,
}

fn local_midnight(d: chrono::NaiveDate) -> Option<u64> {
    let t = d.and_hms_opt(0, 0, 0)?.and_local_timezone(chrono::Local).earliest()?;
    u64::try_from(t.timestamp()).ok()
}

fn parse_day(label: &str, s: &str) -> Result<chrono::NaiveDate, String> {
    chrono::NaiveDate::parse_from_str(s.trim(), "%Y-%m-%d").map_err(|_| format!("Fecha {label} inválida (usa AAAA-MM-DD)"))
}

impl SearchParams {
    pub fn prepare(&self) -> Result<Prepared, String> {
        if self.query.is_empty() || self.query.trim().is_empty() {
            return Err("Escribe un texto para buscar".into());
        }
        if self.query.chars().count() > MAX_QUERY {
            return Err(format!("El texto es demasiado largo (máximo {MAX_QUERY} caracteres)"));
        }
        let pattern = if self.regex { self.query.clone() } else { regex::escape(&self.query) };
        // Límites de tamaño del programa compilado: una expresión enorme no consume memoria sin tope.
        let re = RegexBuilder::new(&pattern)
            .case_insensitive(!self.case_sensitive)
            .size_limit(2 << 20)
            .dfa_size_limit(8 << 20)
            .nest_limit(50)
            .build()
            .map_err(|e| {
                let t = e.to_string();
                let t: String = t.lines().last().unwrap_or("").trim().chars().take(200).collect();
                format!("Expresión regular inválida: {t}")
            })?;
        if re.is_match("") {
            return Err("La expresión coincide con texto vacío: sería cada línea. Haz el patrón más específico".into());
        }
        let mut kinds = Vec::new();
        for k in &self.kinds {
            let k = Kind::parse(k)?;
            if !kinds.contains(&k) {
                kinds.push(k);
            }
        }
        if kinds.is_empty() {
            return Err("Elige dónde buscar (logs, respaldos o notas)".into());
        }
        let from = match self.from.as_deref().filter(|s| !s.trim().is_empty()) {
            Some(s) => local_midnight(parse_day("inicial", s)?).ok_or("Fecha inicial fuera de rango")?,
            None => 0,
        };
        let to = match self.to.as_deref().filter(|s| !s.trim().is_empty()) {
            Some(s) => local_midnight(parse_day("final", s)?.succ_opt().ok_or("Fecha final fuera de rango")?).ok_or("Fecha final fuera de rango")?,
            None => u64::MAX,
        };
        if from >= to {
            return Err("El rango de fechas está invertido".into());
        }
        Ok(Prepared {
            re,
            kinds,
            range: (from, to),
            scope: self.scope.as_deref().map(|s| s.trim().to_lowercase()).filter(|s| !s.is_empty()),
            context: self.context.unwrap_or(2).min(MAX_CONTEXT),
            max_results: self.max_results.unwrap_or(DEFAULT_MAX_RESULTS).clamp(1, MAX_RESULTS),
            max_file_bytes: self.max_file_mb.unwrap_or(DEFAULT_FILE_MB).clamp(1, MAX_FILE_MB) * 1024 * 1024,
            emit_every: EMIT_EVERY,
        })
    }
}

// ---------- Carpetas y archivos elegibles ----------

pub struct Roots {
    pub logs: PathBuf,
    pub backups: PathBuf,
    pub notes: PathBuf,
}

impl Roots {
    fn of(&self, k: Kind) -> &Path {
        match k {
            Kind::Logs => &self.logs,
            Kind::Backups => &self.backups,
            Kind::Notes => &self.notes,
        }
    }
}

fn hidden(name: &str) -> bool {
    name.starts_with('.')
}

/// ¿Se puede entrar a esta carpeta? Respaldos: solo la de cada equipo (nombre saneado) en el
/// primer nivel; notas: ninguna.
fn dir_ok(kind: Kind, depth: usize, name: &str) -> bool {
    !hidden(name)
        && match kind {
            Kind::Logs => true,
            Kind::Backups => depth == 0 && crate::backups::sanitize_device(name).map(|d| d == name).unwrap_or(false),
            Kind::Notes => false,
        }
}

/// ¿Este archivo se puede buscar? `rel` son los componentes de su ruta dentro de la carpeta.
fn file_ok(kind: Kind, rel: &[String], full: &Path) -> bool {
    let Some(name) = rel.last() else { return false };
    if rel.iter().any(|c| hidden(c)) {
        return false;
    }
    let ext = Path::new(name).extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase());
    match kind {
        Kind::Logs => matches!(ext.as_deref(), Some("log" | "txt")),
        Kind::Backups => rel.len() == 2 && crate::backups::file_re().is_match(name) && crate::backups::sanitize_device(&rel[0]).map(|d| d == rel[0]).unwrap_or(false),
        // Un .txt con su .ntenc al lado es el resto de una nota que se protegió: no se lee.
        Kind::Notes => rel.len() == 1 && ext.as_deref() == Some("txt") && !full.with_extension("ntenc").exists(),
    }
}

struct Cand {
    kind: Kind,
    rel: String,
    /// Ruta en disco (con `.nte` si está cifrado).
    path: PathBuf,
    enc: bool,
    size: u64,
    time: u64,
}

fn secs(t: SystemTime) -> u64 {
    t.duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

/// Fecha del respaldo según su nombre (AAAA-MM-DD_HHMMSS), si no, la de modificación.
fn backup_time(name: &str, fallback: u64) -> u64 {
    chrono::NaiveDateTime::parse_from_str(name.get(..17).unwrap_or(""), "%Y-%m-%d_%H%M%S")
        .ok()
        .and_then(|d| d.and_local_timezone(chrono::Local).earliest())
        .and_then(|t| u64::try_from(t.timestamp()).ok())
        .unwrap_or(fallback)
}

struct Walk<'a> {
    kind: Kind,
    /// La carpeta está cifrada: solo se leen los `.nte` (un claro no se lee en silencio).
    enc: bool,
    /// Carpetas de otros tipos que la de logs no debe recorrer si las contiene.
    skip: Vec<PathBuf>,
    q: &'a Prepared,
    out: Vec<Cand>,
    truncated: bool,
}

impl Walk<'_> {
    fn dir(&mut self, dir: &Path, rel: &mut Vec<String>, cancel: &AtomicBool) {
        let Ok(rd) = fs::read_dir(dir) else { return };
        for e in rd.flatten() {
            if cancel.load(Ordering::SeqCst) {
                return;
            }
            if self.out.len() >= MAX_FILES {
                self.truncated = true;
                return;
            }
            // file_type no sigue enlaces: los simbólicos (y las uniones de Windows) se saltan.
            let Ok(ft) = e.file_type() else { continue };
            if ft.is_symlink() {
                continue;
            }
            let raw = e.file_name().to_string_lossy().into_owned();
            let path = e.path();
            // En una carpeta cifrada el nombre lógico es el del archivo sin `.nte`.
            let name = match (self.enc && ft.is_file(), raw.strip_suffix(".nte")) {
                (true, Some(base)) => base.to_string(),
                (true, None) => continue,
                _ => raw,
            };
            if ft.is_dir() {
                if rel.len() >= MAX_DEPTH || !dir_ok(self.kind, rel.len(), &name) {
                    continue;
                }
                if self.kind == Kind::Logs && path.canonicalize().map(|c| self.skip.contains(&c)).unwrap_or(true) {
                    continue;
                }
                rel.push(name);
                self.dir(&path, rel, cancel);
                rel.pop();
            } else if ft.is_file() {
                rel.push(name.clone());
                if file_ok(self.kind, rel, &logical(&path)) {
                    if let Ok(meta) = e.metadata() {
                        let mtime = meta.modified().map(secs).unwrap_or(0);
                        let time = if self.kind == Kind::Backups { backup_time(&name, mtime) } else { mtime };
                        let rel_s = rel.join("/");
                        let in_range = time >= self.q.range.0 && time < self.q.range.1;
                        let in_scope = self.q.scope.as_ref().is_none_or(|s| rel_s.to_lowercase().contains(s));
                        if in_range && in_scope {
                            self.out.push(Cand { kind: self.kind, rel: rel_s, path, enc: self.enc, size: meta.len(), time });
                        }
                    }
                }
                rel.pop();
            }
        }
    }
}

fn collect(roots: &Roots, q: &Prepared, cancel: &AtomicBool) -> (Vec<Cand>, bool) {
    let canon = |p: &Path| p.canonicalize().ok();
    let skip: Vec<PathBuf> = [canon(&roots.backups), canon(&roots.notes)].into_iter().flatten().collect();
    let mut all = Vec::new();
    let mut truncated = false;
    for &kind in &q.kinds {
        let Some(root) = canon(roots.of(kind)) else { continue };
        if !root.is_dir() {
            continue;
        }
        let enc = crate::datacrypt::shared_for(&root).is_some();
        let mut w = Walk { kind, enc, skip: skip.clone(), q, out: Vec::new(), truncated: false };
        w.dir(&root, &mut Vec::new(), cancel);
        truncated |= w.truncated;
        all.append(&mut w.out);
        if all.len() >= MAX_FILES {
            truncated = true;
            break;
        }
    }
    // Lo más reciente primero: si el tope corta resultados, se pierde lo más antiguo.
    all.sort_by(|a, b| b.time.cmp(&a.time).then_with(|| a.rel.cmp(&b.rel)));
    (all, truncated)
}

/// Carpetas de otros tipos que un archivo de `kind` no puede tocar: los logs no pueden salir
/// por una carpeta de logs que contenga los respaldos o las notas.
fn excluded_for(roots: &Roots, kind: Kind) -> Vec<PathBuf> {
    if kind != Kind::Logs {
        return Vec::new();
    }
    [roots.backups.canonicalize().ok(), roots.notes.canonicalize().ok()].into_iter().flatten().collect()
}

/// Carpeta (canónica) y exclusiones con las que se valida cada archivo al abrirlo.
struct Scope<'a> {
    root: &'a Path,
    excluded: &'a [PathBuf],
}

/// Ruta real de un archivo elegible de `kind`, validada contra recorridos fuera de la carpeta
/// (".." o rutas absolutas en `rel`), enlaces simbólicos, FIFOs y archivos que la búsqueda no lee
/// (incluidas las notas protegidas y las carpetas de respaldos o notas dentro de la de logs).
/// El archivo se abre sin seguir enlaces y sin bloquear, se verifica sobre el descriptor que sea
/// regular y se revalida la ruta canónica.
pub fn resolve_file(roots: &Roots, kind: Kind, rel: &str) -> Result<PathBuf, String> {
    let comps: Vec<String> = Path::new(rel)
        .components()
        .map(|c| match c {
            Component::Normal(n) => Ok(n.to_string_lossy().into_owned()),
            _ => Err("Ruta no permitida".to_string()),
        })
        .collect::<Result<_, _>>()?;
    if comps.is_empty() {
        return Err("Ruta no permitida".into());
    }
    let root = roots.of(kind).canonicalize().map_err(|_| "La carpeta no existe".to_string())?;
    let mut path = comps.iter().fold(root.clone(), |p, c| p.join(c));
    if crate::datacrypt::shared_for(&root).is_some() {
        path = crate::datacrypt::physical(&path);
    }
    let meta = fs::symlink_metadata(&path).map_err(|_| "El archivo ya no existe".to_string())?;
    if !meta.is_file() {
        return Err("Ruta no permitida".into());
    }
    let excluded = excluded_for(roots, kind);
    let (_file, real) = open_checked(&path, &root, &excluded)?;
    if !file_ok(kind, &comps, &logical(&real)) {
        return Err("Ruta no permitida".into());
    }
    Ok(real)
}

// ---------- Resultados ----------

#[derive(Serialize, Debug, Clone)]
pub struct Hit {
    pub line: usize,
    pub text: String,
    /// Rangos de la coincidencia dentro de `text`, en caracteres (inicio, fin).
    pub ranges: Vec<[usize; 2]>,
    /// Coincidencias de esta línea que no se resaltan (tope por línea o fuera del texto mostrado).
    #[serde(skip_serializing_if = "is_zero")]
    pub extra: usize,
    pub before: Vec<String>,
    pub after: Vec<String>,
    #[serde(skip)]
    need_after: usize,
}

fn is_zero(n: &usize) -> bool {
    *n == 0
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileHits {
    pub kind: Kind,
    /// Ruta dentro de la carpeta del tipo, con "/".
    pub rel: String,
    pub size: u64,
    pub modified: u64,
    /// Solo se leyó el principio (el archivo supera el tope por archivo).
    pub partial: bool,
    /// Hay más coincidencias que las mostradas.
    pub more: bool,
    pub hits: Vec<Hit>,
}

#[derive(Serialize, Debug, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    pub scanned: usize,
    pub total: usize,
    pub matches: usize,
    pub files_with_hits: usize,
    /// Se alcanzó el tope de resultados.
    pub truncated: bool,
    /// Había más archivos que el tope del recorrido.
    pub walk_truncated: bool,
    pub skipped_binary: usize,
    pub skipped_errors: usize,
    pub partial: usize,
    pub cancelled: bool,
    pub ms: u64,
}

/// Avance que se envía a la interfaz.
pub struct Update {
    pub files: Vec<FileHits>,
    pub scanned: usize,
    pub total: usize,
    pub matches: usize,
}

// ---------- Texto visible ----------

/// Convierte posiciones en bytes (no decrecientes) a caracteres en una sola pasada: un cursor
/// avanza por el texto y nunca recorre dos veces la misma zona (antes cada rango contaba los
/// caracteres desde el inicio de la línea: costo cuadrático con miles de coincidencias).
struct CharCursor<'a> {
    text: &'a str,
    byte: usize,
    chars: usize,
}

impl<'a> CharCursor<'a> {
    fn new(text: &'a str) -> Self {
        CharCursor { text, byte: 0, chars: 0 }
    }

    /// Posición en caracteres del byte `b`. Si `b` retrocede o no cae en un límite de carácter,
    /// se reubica desde el inicio (no ocurre con rangos de `Regex`, pero no debe fallar).
    fn at(&mut self, b: usize) -> usize {
        let mut b = b.min(self.text.len());
        while !self.text.is_char_boundary(b) {
            b -= 1;
        }
        if b < self.byte {
            self.byte = 0;
            self.chars = 0;
        }
        self.chars += self.text[self.byte..b].chars().count();
        self.byte = b;
        self.chars
    }
}

/// Coincidencias de `text`: las primeras `MAX_RANGES_PER_LINE` (inicio y fin en bytes) y el total.
/// El resto solo se cuenta, sin guardarlo.
fn find_ranges(re: &Regex, text: &str) -> (Vec<(usize, usize)>, usize) {
    let mut ranges = Vec::new();
    let mut total = 0usize;
    for m in re.find_iter(text).filter(|m| m.end() > m.start()) {
        total += 1;
        if ranges.len() < MAX_RANGES_PER_LINE {
            ranges.push((m.start(), m.end()));
        }
    }
    (ranges, total)
}

/// Texto acotado a `max` caracteres y los rangos de coincidencia (en bytes de `text`, en orden)
/// pasados a caracteres del texto mostrado. Si la coincidencia está lejos del inicio, se muestra
/// la zona. Costo lineal en el largo del texto.
fn display(text: &str, ranges: &[(usize, usize)], max: usize) -> (String, Vec<[usize; 2]>) {
    let total = text.chars().count();
    let mut cur = CharCursor::new(text);
    let chars: Vec<(usize, usize)> = ranges
        .iter()
        .map(|&(s, e)| {
            let s = cur.at(s);
            (s, cur.at(e))
        })
        .collect();
    if total <= max {
        return (text.to_string(), chars.iter().map(|&(s, e)| [s, e]).collect());
    }
    let first = chars.first().map(|&(s, _)| s).unwrap_or(0);
    let start = first.saturating_sub(max / 4).min(total - max);
    let end = start + max;
    let body: String = text.chars().skip(start).take(max).collect();
    let (pre, post) = (start > 0, end < total);
    let mut out = String::new();
    if pre {
        out.push('…');
    }
    out.push_str(&body);
    if post {
        out.push('…');
    }
    let shown = out.chars().count();
    let shift = usize::from(pre);
    let mapped = chars
        .iter()
        .filter(|&&(s, e)| e > start && s < end)
        .map(|&(s, e)| [s.max(start) - start + shift, (e.min(end) - start + shift).min(shown)])
        .collect();
    (out, mapped)
}

fn trim_eol(buf: &mut Vec<u8>) {
    while matches!(buf.last(), Some(b'\n' | b'\r')) {
        buf.pop();
    }
}

/// Lee una línea guardando como mucho `MAX_LINE` bytes; el resto de una línea más larga se
/// descarta sin acumularlo. Devuelve los bytes leídos del archivo (incluidos los descartados) o
/// `None` al llegar al final.
fn read_line_capped<R: BufRead>(r: &mut R, buf: &mut Vec<u8>) -> std::io::Result<Option<usize>> {
    buf.clear();
    let mut read = 0usize;
    loop {
        let chunk = r.fill_buf()?;
        if chunk.is_empty() {
            return Ok((read > 0).then_some(read));
        }
        let (used, done) = match chunk.iter().position(|&b| b == b'\n') {
            Some(i) => (i + 1, true),
            None => (chunk.len(), false),
        };
        let room = MAX_LINE.saturating_sub(buf.len());
        buf.extend_from_slice(&chunk[..used.min(room)]);
        r.consume(used);
        read += used;
        if done {
            return Ok(Some(read));
        }
    }
}

/// Abre sin seguir enlaces y sin bloquear (un FIFO o dispositivo no deja la búsqueda colgada en
/// el `open`), y comprueba sobre el descriptor ya abierto que sea un archivo regular. Además la
/// ruta canónica debe seguir dentro de la carpeta, sin pasar por `excluded`, y apuntar al mismo
/// archivo que se abrió (en Unix, mismo dispositivo e inodo): si algo se cambió entre el recorrido
/// y la apertura, se rechaza. Devuelve el archivo y su ruta canónica.
fn open_checked(path: &Path, root: &Path, excluded: &[PathBuf]) -> Result<(File, PathBuf), String> {
    let file = open_nofollow(path).map_err(|_| "No se puede abrir".to_string())?;
    let meta = file.metadata().map_err(|e| e.to_string())?;
    if !meta.is_file() {
        return Err("Ruta no permitida".into());
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        // FILE_ATTRIBUTE_REPARSE_POINT: enlace simbólico o unión.
        if meta.file_attributes() & 0x400 != 0 {
            return Err("Ruta no permitida".into());
        }
    }
    let real = path.canonicalize().map_err(|e| e.to_string())?;
    if !real.starts_with(root) || excluded.iter().any(|x| real.starts_with(x)) {
        return Err("Ruta no permitida".into());
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        let now = fs::metadata(&real).map_err(|e| e.to_string())?;
        if (now.dev(), now.ino()) != (meta.dev(), meta.ino()) {
            return Err("El archivo cambió".into());
        }
    }
    Ok((file, real))
}

#[cfg(unix)]
fn open_nofollow(path: &Path) -> std::io::Result<File> {
    use std::os::unix::fs::OpenOptionsExt;
    fs::OpenOptions::new().read(true).custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK).open(path)
}

#[cfg(windows)]
fn open_nofollow(path: &Path) -> std::io::Result<File> {
    use std::os::windows::fs::OpenOptionsExt;
    // FILE_FLAG_OPEN_REPARSE_POINT: abre el enlace mismo, no su destino (se rechaza después).
    fs::OpenOptions::new().read(true).custom_flags(0x0020_0000).open(path)
}

#[cfg(not(any(unix, windows)))]
fn open_nofollow(path: &Path) -> std::io::Result<File> {
    File::open(path)
}

enum Skip {
    Binary,
    Error,
}

/// Busca en un archivo. Devuelve las coincidencias (posiblemente ninguna) o el motivo de omisión.
fn search_file(c: &Cand, scope: &Scope, q: &Prepared, budget: &mut usize, cancel: &AtomicBool) -> Result<FileHits, Skip> {
    // El archivo debe seguir siendo elegible y dentro de la carpeta al abrirlo (un enlace, un FIFO
    // o un cambio posterior al recorrido no lo saca de ahí ni cuelga la búsqueda).
    let (file, real) = open_checked(&c.path, scope.root, scope.excluded).map_err(|_| Skip::Error)?;
    let comps: Vec<String> = c.rel.split('/').map(str::to_string).collect();
    if !file_ok(c.kind, &comps, &logical(&real)) {
        return Err(Skip::Error);
    }
    let meta = file.metadata().map_err(|_| Skip::Error)?;
    let partial = meta.len() > q.max_file_bytes;
    // Cifrado: se descifra en memoria bloque a bloque (cada bloque se verifica); nada en claro a disco.
    let source: Box<dyn Read> = if c.enc {
        let dk = crate::datacrypt::key_for(scope.root).ok().flatten().ok_or(Skip::Error)?;
        Box::new(crate::datacrypt::wrap_reader(file, &dk).map_err(|_| Skip::Error)?)
    } else {
        Box::new(file)
    };
    let mut r = BufReader::with_capacity(64 * 1024, source.take(q.max_file_bytes));
    // Un NUL en el primer bloque: archivo binario (también UTF-16), no se lee como texto.
    match r.fill_buf() {
        Ok(head) if head.iter().take(8192).any(|&b| b == 0) => return Err(Skip::Binary),
        Ok(_) => {}
        Err(_) => return Err(Skip::Error),
    }
    let ctx = q.context;
    let cap = PER_FILE_HITS.min(q.max_results);
    let mut hits: Vec<Hit> = Vec::new();
    let mut more = false;
    // Líneas previas (sin decodificar) y coincidencias que aún esperan líneas posteriores.
    let mut ring: VecDeque<Vec<u8>> = VecDeque::new();
    let mut open: Vec<usize> = Vec::new();
    let mut buf: Vec<u8> = Vec::with_capacity(256);
    let mut line_no = 0usize;
    // Cancelación: por bytes leídos y por tiempo desde la última revisión.
    let (mut since_check, mut last_check) = (0usize, Instant::now());
    loop {
        // Con el tope de coincidencias alcanzado solo se termina de completar el contexto pendiente.
        if (more || *budget == 0) && open.is_empty() {
            break;
        }
        match read_line_capped(&mut r, &mut buf) {
            Ok(Some(n)) => since_check += n,
            Ok(None) | Err(_) => break,
        }
        line_no += 1;
        if since_check >= CANCEL_EVERY_BYTES || last_check.elapsed() >= CANCEL_EVERY {
            if cancel.load(Ordering::SeqCst) {
                break;
            }
            (since_check, last_check) = (0, Instant::now());
        }
        trim_eol(&mut buf);
        let text = String::from_utf8_lossy(&buf);
        // Contexto posterior de coincidencias anteriores.
        if !open.is_empty() {
            let (shown, _) = display(&text, &[], SHOW_CONTEXT_CHARS);
            open.retain(|&i| {
                hits[i].after.push(shown.clone());
                hits[i].need_after -= 1;
                hits[i].need_after > 0
            });
        }
        if !more && *budget > 0 {
            let (ranges, total) = find_ranges(&q.re, &text);
            if !ranges.is_empty() {
                if hits.len() >= cap {
                    more = true;
                } else {
                    let (shown, mapped) = display(&text, &ranges, SHOW_CHARS);
                    let extra = total - mapped.len();
                    let before = ring.iter().map(|b| display(&String::from_utf8_lossy(b), &[], SHOW_CONTEXT_CHARS).0).collect();
                    hits.push(Hit { line: line_no, text: shown, ranges: mapped, extra, before, after: Vec::new(), need_after: ctx });
                    if ctx > 0 {
                        open.push(hits.len() - 1);
                    }
                    *budget -= 1;
                }
            }
        }
        drop(text);
        if ctx > 0 {
            // La línea pasa al anillo de contexto previo; el buffer más antiguo se reutiliza.
            let recycled = if ring.len() >= ctx { ring.pop_front() } else { None };
            ring.push_back(std::mem::replace(&mut buf, recycled.unwrap_or_else(|| Vec::with_capacity(256))));
        }
    }
    Ok(FileHits { kind: c.kind, rel: c.rel.clone(), size: c.size, modified: c.time, partial, more, hits })
}

// ---------- Búsqueda ----------

/// Recorre y busca. `sink` recibe los avances (como máximo uno cada 150 ms y al final). No lanza
/// hilos: quien llama decide dónde ejecutarla.
pub fn search(roots: &Roots, q: &Prepared, cancel: &AtomicBool, sink: &mut dyn FnMut(Update)) -> Summary {
    let t0 = Instant::now();
    let (cands, walk_truncated) = collect(roots, q, cancel);
    let mut sum = Summary { total: cands.len(), walk_truncated, ..Default::default() };
    let canon: Vec<(Kind, PathBuf, Vec<PathBuf>)> = q.kinds.iter().filter_map(|&k| roots.of(k).canonicalize().ok().map(|p| (k, p, excluded_for(roots, k)))).collect();
    let mut budget = q.max_results;
    let mut pending: Vec<FileHits> = Vec::new();
    let mut last = Instant::now();
    let flush = |pending: &mut Vec<FileHits>, sum: &Summary, sink: &mut dyn FnMut(Update)| {
        sink(Update { files: std::mem::take(pending), scanned: sum.scanned, total: sum.total, matches: sum.matches });
    };
    for c in &cands {
        if cancel.load(Ordering::SeqCst) {
            sum.cancelled = true;
            break;
        }
        if budget == 0 {
            sum.truncated = true;
            break;
        }
        let Some((_, root, excluded)) = canon.iter().find(|(k, _, _)| *k == c.kind) else { continue };
        let before = budget;
        match search_file(c, &Scope { root, excluded }, q, &mut budget, cancel) {
            Ok(f) => {
                sum.partial += usize::from(f.partial);
                if f.more {
                    sum.truncated = true;
                }
                if !f.hits.is_empty() {
                    sum.matches += before - budget;
                    sum.files_with_hits += 1;
                    pending.push(f);
                }
            }
            Err(Skip::Binary) => sum.skipped_binary += 1,
            Err(Skip::Error) => sum.skipped_errors += 1,
        }
        sum.scanned += 1;
        if last.elapsed() >= q.emit_every {
            flush(&mut pending, &sum, sink);
            last = Instant::now();
        }
    }
    if cancel.load(Ordering::SeqCst) {
        sum.cancelled = true;
    }
    if budget == 0 {
        sum.truncated = true;
    }
    flush(&mut pending, &sum, sink);
    sum.ms = t0.elapsed().as_millis() as u64;
    sum
}

// ---------- Comandos ----------

/// Una sola búsqueda a la vez: otra mientras corre sería leer los mismos archivos en paralelo.
static RUNNING: AtomicBool = AtomicBool::new(false);

struct Slot;

impl Slot {
    fn take() -> Option<Slot> {
        RUNNING.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).ok().map(|_| Slot)
    }
}

impl Drop for Slot {
    fn drop(&mut self) {
        RUNNING.store(false, Ordering::SeqCst);
    }
}

/// Búsqueda sincrónica para el servidor MCP: usa el mismo cupo que la interfaz (una búsqueda a la
/// vez) y se cancela sola al vencer `timeout`. Devuelve los archivos con coincidencias y el resumen.
pub fn search_now(roots: &Roots, params: &SearchParams, timeout: Duration) -> Result<(Vec<FileHits>, Summary), String> {
    let q = params.prepare()?;
    // Espera breve por el cupo: otra búsqueda corta (de la interfaz o de otro agente) suele terminar pronto.
    let t0 = Instant::now();
    let _slot = loop {
        if let Some(s) = Slot::take() {
            break s;
        }
        if t0.elapsed() > Duration::from_secs(5) {
            return Err("Ya hay una búsqueda en curso en NetTerminal; reintenta en unos segundos".into());
        }
        std::thread::sleep(Duration::from_millis(50));
    };
    let cancel = std::sync::Arc::new(AtomicBool::new(false));
    let done = std::sync::Arc::new(AtomicBool::new(false));
    {
        let (cancel, done) = (cancel.clone(), done.clone());
        std::thread::spawn(move || {
            let t0 = Instant::now();
            while !done.load(Ordering::SeqCst) && t0.elapsed() < timeout {
                std::thread::sleep(Duration::from_millis(50));
            }
            cancel.store(true, Ordering::SeqCst);
        });
    }
    let mut files = Vec::new();
    let sum = search(roots, &q, &cancel, &mut |u| files.extend(u.files));
    done.store(true, Ordering::SeqCst);
    Ok((files, sum))
}

pub(crate) fn roots_of(state: &crate::AppState) -> Roots {
    Roots { logs: state.logs_dir(), backups: crate::backups::root(&state.data_dir), notes: state.notes_dir() }
}

/// Inicia la búsqueda y devuelve el id de la tarea (se cancela con `tool_stop`). Los resultados
/// llegan por el evento "tool-job": "line" con `files` (coincidencias nuevas) y `progress`,
/// "result" con el resumen y "done" al terminar.
#[tauri::command(async)]
pub fn logsearch_start(params: SearchParams, app: tauri::AppHandle, state: tauri::State<'_, crate::AppState>) -> Result<String, String> {
    if let Some(why) = crate::datacrypt::unavailable(&state.data_dir) {
        return Err(why.into());
    }
    use crate::nettools::emit;
    let q = params.prepare()?;
    let slot = Slot::take().ok_or("Ya hay una búsqueda en curso")?;
    let roots = roots_of(&state);
    let (job, cancel, finish) = state.jobs.cancelable();
    let id = job.clone();
    std::thread::spawn(move || {
        // Guard RAII: aunque la búsqueda termine por un pánico, se libera el cupo (`Slot`), se da de
        // baja la tarea y la interfaz recibe "done" (no queda esperando una búsqueda que no existe).
        let _end = JobEnd { app: app.clone(), id: id.clone(), finish: Some(Box::new(finish)) };
        let _slot = slot;
        let sum = search(&roots, &q, &cancel, &mut |u| {
            if u.files.is_empty() && u.scanned == 0 {
                return;
            }
            emit(
                &app,
                &id,
                "line",
                String::new(),
                Some(serde_json::json!({ "files": u.files, "progress": { "scanned": u.scanned, "total": u.total, "matches": u.matches } })),
            );
        });
        emit(&app, &id, "result", String::new(), serde_json::to_value(&sum).ok());
    });
    Ok(job)
}

/// Al soltarse (fin normal, cancelación o pánico) da de baja la tarea y avisa "done". Se declara
/// antes que `Slot`, así que se suelta después y el cupo ya está libre cuando la interfaz lo sabe.
struct JobEnd {
    app: tauri::AppHandle,
    id: String,
    finish: Option<Box<dyn FnOnce() + Send>>,
}

impl Drop for JobEnd {
    fn drop(&mut self) {
        if let Some(f) = self.finish.take() {
            f();
        }
        crate::nettools::emit(&self.app, &self.id, "done", String::new(), None);
    }
}

/// Abre un archivo encontrado con la aplicación del sistema, o lo muestra en su carpeta.
/// Solo acepta archivos que la búsqueda puede leer, dentro de las carpetas de datos. Un archivo
/// cifrado no se abre afuera (habría que escribirlo en claro): se ve en la app o se exporta.
#[tauri::command(async)]
pub fn logsearch_open(kind: String, rel: String, reveal: bool, app: tauri::AppHandle, state: tauri::State<'_, crate::AppState>) -> Result<(), String> {
    if let Some(why) = crate::datacrypt::unavailable(&state.data_dir) {
        return Err(why.into());
    }
    use tauri_plugin_opener::OpenerExt;
    let path = resolve_file(&roots_of(&state), Kind::parse(&kind)?, &rel)?;
    if !reveal && path.extension().is_some_and(|e| e == crate::datacrypt::EXT) {
        return Err("El archivo está cifrado: usa «Ver» o «Exportar descifrado…»".into());
    }
    if reveal {
        tauri_plugin_opener::reveal_item_in_dir(&path).map_err(|e| e.to_string())
    } else {
        app.opener().open_path(path.to_string_lossy(), None::<&str>).map_err(|e| e.to_string())
    }
}


/// Ruta lógica de un archivo en disco (sin `.nte`), para las reglas de elegibilidad.
fn logical(real: &Path) -> PathBuf {
    match real.to_str().and_then(|s| s.strip_suffix(".nte")) {
        Some(s) => PathBuf::from(s),
        None => real.to_path_buf(),
    }
}

/// Tope del visor dentro de la app.
pub const VIEW_MAX: u64 = 4 * 1024 * 1024;

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FileText {
    pub text: String,
    /// Solo se muestra el principio (el archivo supera el tope del visor).
    pub truncated: bool,
    /// Archivo cifrado sin bloque de cierre: grabación en curso o cortada.
    pub incomplete: bool,
    pub encrypted: bool,
}

/// Archivo elegible abierto para leer: en claro o descifrándose en flujo.
enum Source {
    Plain(File),
    Enc(crate::datacrypt::EncReader<File>),
}

impl Read for Source {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        match self {
            Source::Plain(f) => f.read(buf),
            Source::Enc(r) => r.read(buf),
        }
    }
}

/// Abre un archivo elegible con las mismas validaciones que la búsqueda. Devuelve el lector y el
/// nombre lógico (sin `.nte`).
fn open_logical(roots: &Roots, kind: Kind, rel: &str) -> Result<(Source, String), String> {
    let path = resolve_file(roots, kind, rel)?;
    let root = roots.of(kind).canonicalize().map_err(|_| "La carpeta no existe".to_string())?;
    let (file, _) = open_checked(&path, &root, &excluded_for(roots, kind))?;
    let name = logical(&path).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    if path.extension().is_some_and(|e| e == crate::datacrypt::EXT) {
        let dk = crate::datacrypt::key_for(&root).map_err(|e| e.to_string())?.ok_or("La carpeta no está cifrada")?;
        let r = crate::datacrypt::wrap_reader(file, &dk).map_err(|e| e.to_string())?;
        return Ok((Source::Enc(r), name));
    }
    Ok((Source::Plain(file), name))
}

/// Texto de un archivo para el visor de la app (hasta `VIEW_MAX`), sin pasar por el disco en claro.
pub fn read_text(roots: &Roots, kind: Kind, rel: &str) -> Result<FileText, String> {
    let (mut src, _) = open_logical(roots, kind, rel)?;
    let mut buf = Vec::new();
    (&mut src).take(VIEW_MAX + 1).read_to_end(&mut buf).map_err(|e| e.to_string())?;
    let truncated = buf.len() as u64 > VIEW_MAX;
    buf.truncate(VIEW_MAX as usize);
    let (encrypted, incomplete) = match &src {
        Source::Plain(_) => (false, false),
        // Sin cortar, el lector llegó al final y sabe si faltaba el bloque de cierre.
        Source::Enc(r) => (true, !truncated && r.incomplete()),
    };
    Ok(FileText { text: String::from_utf8_lossy(&buf).into_owned(), truncated, incomplete, encrypted })
}

/// Copia un archivo (descifrado si corresponde) a `dest`, elegido por el usuario fuera de la carpeta
/// de datos. Escritura atómica con permisos 600. Devuelve los bytes escritos.
pub fn export_plain(roots: &Roots, kind: Kind, rel: &str, dest: &Path) -> Result<u64, String> {
    let (mut r, _) = open_logical(roots, kind, rel)?;
    let mut buf = Vec::new();
    r.read_to_end(&mut buf).map_err(|e| e.to_string())?;
    crate::seal::write_atomic(dest, &buf)?;
    let n = buf.len() as u64;
    use zeroize::Zeroize;
    buf.zeroize();
    Ok(n)
}

/// Texto de un archivo encontrado para el visor de la app (también cifrado).
#[tauri::command(async)]
pub fn logsearch_view(kind: String, rel: String, state: tauri::State<'_, crate::AppState>) -> Result<FileText, String> {
    if let Some(why) = crate::datacrypt::unavailable(&state.data_dir) {
        return Err(why.into());
    }
    read_text(&roots_of(&state), Kind::parse(&kind)?, &rel)
}

/// "Exportar descifrado": el destino lo elige el usuario en el diálogo nativo que abre el backend
/// (nunca dentro de la carpeta de datos, que sirven TFTP, HTTP y FTP). Ok(None) si canceló.
#[tauri::command(async)]
pub fn logsearch_export(kind: String, rel: String, app: tauri::AppHandle, state: tauri::State<'_, crate::AppState>) -> Result<Option<String>, String> {
    if let Some(why) = crate::datacrypt::unavailable(&state.data_dir) {
        return Err(why.into());
    }
    use tauri_plugin_dialog::DialogExt;
    let roots = roots_of(&state);
    let kind = Kind::parse(&kind)?;
    // Valida antes de abrir el diálogo.
    let (_, name) = open_logical(&roots, kind, &rel)?;
    let Some(file) = app.dialog().file().set_title("Exportar descifrado").set_file_name(&name).blocking_save_file() else {
        return Ok(None);
    };
    let dest = file.into_path().map_err(|e| e.to_string())?;
    crate::bundle::check_export_dest(&dest, &state.data_dir)?;
    export_plain(&roots, kind, &rel, &dest)?;
    Ok(Some(dest.to_string_lossy().into_owned()))
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    struct Fx {
        dir: PathBuf,
        roots: Roots,
    }

    impl Fx {
        fn new() -> Fx {
            let dir = std::env::temp_dir().join(format!("nt-logsearch-{}", uuid::Uuid::new_v4()));
            let roots = Roots { logs: dir.join("logs"), backups: dir.join("backups"), notes: dir.join("notes") };
            for r in [&roots.logs, &roots.backups, &roots.notes] {
                fs::create_dir_all(r).unwrap();
            }
            Fx { dir, roots }
        }
        fn put(&self, rel: &str, content: &[u8]) -> PathBuf {
            let p = self.dir.join(rel);
            fs::create_dir_all(p.parent().unwrap()).unwrap();
            fs::write(&p, content).unwrap();
            p
        }
    }

    impl Drop for Fx {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.dir);
        }
    }

    fn params(query: &str) -> SearchParams {
        SearchParams { query: query.into(), kinds: vec!["logs".into(), "backups".into()], ..Default::default() }
    }

    fn run(fx: &Fx, p: &SearchParams) -> (Vec<FileHits>, Summary) {
        run_cancel(fx, p, &AtomicBool::new(false))
    }

    fn run_cancel(fx: &Fx, p: &SearchParams, cancel: &AtomicBool) -> (Vec<FileHits>, Summary) {
        let q = p.prepare().unwrap();
        let mut files = Vec::new();
        let sum = search(&fx.roots, &q, cancel, &mut |u| files.extend(u.files));
        (files, sum)
    }

    #[test]
    fn finds_literal_text_with_context_and_ranges() {
        let fx = Fx::new();
        fx.put("logs/core1.log", b"uno\ndos\nInterface Gi0/1 down\ncuatro\ncinco\nseis\n");
        let (files, sum) = run(&fx, &params("gi0/1"));
        assert_eq!((files.len(), sum.matches, sum.scanned, sum.total), (1, 1, 1, 1));
        let h = &files[0].hits[0];
        assert_eq!((h.line, h.text.as_str()), (3, "Interface Gi0/1 down"));
        assert_eq!(h.ranges, vec![[10, 15]], "sin distinguir mayúsculas por defecto");
        assert_eq!(h.before, vec!["uno", "dos"]);
        assert_eq!(h.after, vec!["cuatro", "cinco"]);
        assert_eq!(files[0].rel, "core1.log");
    }

    #[test]
    fn literal_text_is_not_a_regex_and_case_option_works() {
        let fx = Fx::new();
        fx.put("logs/a.log", b"valor a.b\nvalor aXb\nVALOR a.b\n");
        let (f, _) = run(&fx, &params("a.b"));
        assert_eq!(f[0].hits.len(), 2, "el punto es literal: a.b y VALOR a.b");
        let mut p = params("valor");
        p.case_sensitive = true;
        let (f, _) = run(&fx, &p);
        assert_eq!(f[0].hits.iter().map(|h| h.line).collect::<Vec<_>>(), vec![1, 2]);
        let mut p = params(r"a\.b$");
        p.regex = true;
        let (f, _) = run(&fx, &p);
        assert_eq!(f[0].hits.iter().map(|h| h.line).collect::<Vec<_>>(), vec![1, 3]);
    }

    #[test]
    fn rejects_bad_queries() {
        let mut p = params("(");
        p.regex = true;
        assert!(p.prepare().err().unwrap().starts_with("Expresión regular inválida"));
        p.query = "a*".into();
        assert!(p.prepare().err().unwrap().contains("vacío"));
        assert!(params("   ").prepare().is_err());
        assert!(params(&"x".repeat(501)).prepare().is_err());
        let mut p = params("x");
        p.kinds = vec![];
        assert!(p.prepare().is_err());
        p.kinds = vec!["otro".into()];
        assert!(p.prepare().is_err());
        let mut p = params("x");
        p.from = Some("2026-13-01".into());
        assert!(p.prepare().err().unwrap().contains("inicial"));
        p.from = Some("2026-02-01".into());
        p.to = Some("2026-01-01".into());
        assert!(p.prepare().err().unwrap().contains("invertido"));
        // Un patrón enorme excede el límite de tamaño en vez de consumir memoria.
        let mut p = params(r"(\w{100}){100}");
        p.regex = true;
        assert!(p.prepare().is_err());
    }

    #[test]
    fn regex_engine_is_linear_on_pathological_patterns() {
        let fx = Fx::new();
        fx.put("logs/a.log", format!("{}b\n", "a".repeat(50_000)).as_bytes());
        let mut p = params(r"(a+)+$");
        p.regex = true;
        let t = Instant::now();
        let (_, sum) = run(&fx, &p);
        assert!(t.elapsed() < Duration::from_secs(5), "tiempo lineal: no hay retroceso catastrófico");
        assert_eq!(sum.scanned, 1);
    }

    #[test]
    fn context_does_not_cross_file_boundaries_and_overlaps_are_kept() {
        let fx = Fx::new();
        fx.put("logs/a.log", b"x1\nerror uno\nerror dos\nx4\n");
        fx.put("logs/b.log", b"error al inicio\nsolo una\n");
        let mut p = params("error");
        p.context = Some(1);
        let (files, _) = run(&fx, &p);
        let a = files.iter().find(|f| f.rel == "a.log").unwrap();
        assert_eq!(a.hits.len(), 2);
        assert_eq!((a.hits[0].before.clone(), a.hits[0].after.clone()), (vec!["x1".to_string()], vec!["error dos".to_string()]));
        assert_eq!((a.hits[1].before.clone(), a.hits[1].after.clone()), (vec!["error uno".to_string()], vec!["x4".to_string()]));
        let b = files.iter().find(|f| f.rel == "b.log").unwrap();
        assert!(b.hits[0].before.is_empty(), "el contexto no viene de otro archivo");
        assert_eq!(b.hits[0].after, vec!["solo una"]);
        // Sin contexto.
        p.context = Some(0);
        let (files, _) = run(&fx, &p);
        assert!(files.iter().all(|f| f.hits.iter().all(|h| h.before.is_empty() && h.after.is_empty())));
    }

    #[test]
    fn total_results_cap_stops_the_search() {
        let fx = Fx::new();
        let body: String = (0..50).map(|i| format!("evento {i}\n")).collect();
        for n in 0..5 {
            fx.put(&format!("logs/s{n}.log"), body.as_bytes());
        }
        let mut p = params("evento");
        p.max_results = Some(60);
        let (files, sum) = run(&fx, &p);
        assert_eq!(files.iter().map(|f| f.hits.len()).sum::<usize>(), 60);
        assert_eq!(sum.matches, 60);
        assert!(sum.truncated);
    }

    #[test]
    fn per_file_cap_marks_the_file_as_having_more() {
        let fx = Fx::new();
        let body = "x match\n".repeat(PER_FILE_HITS + 50);
        fx.put("logs/a.log", body.as_bytes());
        fx.put("logs/b.log", b"un match\n");
        let (files, sum) = run(&fx, &params("match"));
        let a = files.iter().find(|f| f.rel == "a.log").unwrap();
        assert_eq!(a.hits.len(), PER_FILE_HITS);
        assert!(a.more && sum.truncated);
        assert!(files.iter().any(|f| f.rel == "b.log"), "un archivo ruidoso no tapa a los demás");
    }

    #[test]
    fn big_file_is_read_only_up_to_the_cap() {
        let fx = Fx::new();
        let p = fx.put("logs/grande.log", b"");
        let mut f = fs::OpenOptions::new().append(true).open(&p).unwrap();
        let line = "linea de relleno sin nada especial para el log grande\n";
        // ~1.2 MB de relleno y la coincidencia pasado el tope de 1 MB.
        for _ in 0..(1_300_000 / line.len()) {
            f.write_all(line.as_bytes()).unwrap();
        }
        f.write_all(b"AQUI-ESTA-LA-CLAVE\n").unwrap();
        drop(f);
        let mut params_ = params("AQUI-ESTA");
        params_.max_file_mb = Some(1);
        let (files, sum) = run(&fx, &params_);
        assert!(files.is_empty(), "la coincidencia está más allá del tope");
        assert_eq!(sum.partial, 1, "el archivo se informa como leído solo en parte");
        params_.max_file_mb = Some(2);
        let (files, sum) = run(&fx, &params_);
        assert_eq!((files.len(), sum.partial), (1, 0));
    }

    #[test]
    fn large_log_streams_with_bounded_memory_and_a_giant_line() {
        let fx = Fx::new();
        let p = fx.put("logs/enorme.log", b"");
        let mut f = std::io::BufWriter::new(fs::OpenOptions::new().append(true).open(&p).unwrap());
        for i in 0..400_000 {
            writeln!(f, "2026-01-01 10:00:{:02} sw1 %LINK-3-UPDOWN: evento {i}", i % 60).unwrap();
        }
        // Una línea de 3 MB sin saltos: se examina solo hasta el tope por línea.
        f.write_all(&vec![b'z'; 3 * 1024 * 1024]).unwrap();
        f.write_all(b"\nfinal NEEDLE ok\n").unwrap();
        drop(f);
        assert!(fs::metadata(&p).unwrap().len() > 20_000_000);
        let t = Instant::now();
        let (files, sum) = run(&fx, &params("needle"));
        assert!(t.elapsed() < Duration::from_secs(20), "tardó {:?}", t.elapsed());
        assert_eq!(files[0].hits[0].text, "final NEEDLE ok");
        assert_eq!(files[0].hits[0].line, 400_002);
        assert_eq!(sum.matches, 1);
        let mut q = params("evento 399999");
        q.context = Some(0);
        assert_eq!(run(&fx, &q).0[0].hits[0].line, 400_000);
    }

    #[test]
    fn long_matching_lines_are_shortened_around_the_match() {
        let fx = Fx::new();
        let line = format!("{}AGUJA{}", "a".repeat(5000), "b".repeat(5000));
        fx.put("logs/a.log", line.as_bytes());
        let (files, _) = run(&fx, &params("aguja"));
        let h = &files[0].hits[0];
        let chars: Vec<char> = h.text.chars().collect();
        assert!(chars.len() <= SHOW_CHARS + 2 && chars[0] == '…' && *chars.last().unwrap() == '…');
        let [s, e] = h.ranges[0];
        assert_eq!(chars[s..e].iter().collect::<String>(), "AGUJA");
    }

    #[test]
    fn cancellation_stops_between_files() {
        let fx = Fx::new();
        for n in 0..30 {
            fx.put(&format!("logs/s{n:02}.log"), b"hay un match aqui\n");
        }
        let q = params("match").prepare().unwrap();
        let cancel = AtomicBool::new(true);
        let sum = search(&fx.roots, &q, &cancel, &mut |_| {});
        assert!(sum.cancelled);
        assert_eq!(sum.scanned, 0);

        // Cancelada a mitad de camino: el aviso de avance la dispara.
        let cancel = AtomicBool::new(false);
        let mut q = q;
        q.emit_every = Duration::ZERO;
        let sum = search(&fx.roots, &q, &cancel, &mut |_| cancel.store(true, Ordering::SeqCst));
        assert!(sum.cancelled);
        assert!(sum.scanned >= 1 && sum.scanned < 30, "se detuvo a mitad: {}", sum.scanned);
    }

    #[test]
    fn cancellation_interrupts_a_huge_single_file() {
        let fx = Fx::new();
        let p = fx.put("logs/a.log", b"");
        let mut f = std::io::BufWriter::new(fs::OpenOptions::new().append(true).open(&p).unwrap());
        for _ in 0..2_000_000 {
            f.write_all(b"relleno\n").unwrap();
        }
        drop(f);
        let q = params("no-existe").prepare().unwrap();
        let cancel = AtomicBool::new(true);
        let t = Instant::now();
        // La marca se revisa por bytes leídos y por tiempo, no solo entre archivos.
        let cands = Cand { kind: Kind::Logs, rel: "a.log".into(), path: p.clone(), enc: false, size: 0, time: 0 };
        let mut budget = 10;
        let root = fx.roots.logs.canonicalize().unwrap();
        let r = search_file(&cands, &Scope { root: &root, excluded: &[] }, &q, &mut budget, &cancel).ok().unwrap();
        assert!(r.hits.is_empty() && t.elapsed() < Duration::from_secs(2));
    }

    #[test]
    fn cancellation_mid_file_is_checked_by_bytes_not_by_lines() {
        let fx = Fx::new();
        let p = fx.put("logs/a.log", b"");
        let mut f = std::io::BufWriter::new(fs::OpenOptions::new().append(true).open(&p).unwrap());
        // 30 MB de líneas de 64 KB (4096 líneas no llegan ni a la mitad) y la coincidencia al final.
        let line = vec![b'a'; MAX_LINE - 1];
        for _ in 0..480 {
            f.write_all(&line).unwrap();
            f.write_all(b"\n").unwrap();
        }
        f.write_all(b"AGUJA\n").unwrap();
        drop(f);
        let q = params("aguja").prepare().unwrap();
        let root = fx.roots.logs.canonicalize().unwrap();
        let cand = Cand { kind: Kind::Logs, rel: "a.log".into(), path: p, enc: false, size: 0, time: 0 };
        let scope = Scope { root: &root, excluded: &[] };
        let mut budget = 10;
        assert_eq!(search_file(&cand, &scope, &q, &mut budget, &AtomicBool::new(false)).ok().unwrap().hits.len(), 1, "sin cancelar se llega al final");
        // Cancelada desde otro hilo a los pocos milisegundos: se detiene antes del final.
        let cancel = std::sync::Arc::new(AtomicBool::new(false));
        let c2 = cancel.clone();
        let stopper = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(1));
            c2.store(true, Ordering::SeqCst);
        });
        let mut budget = 10;
        let t = Instant::now();
        let r = search_file(&cand, &scope, &q, &mut budget, &cancel).ok().unwrap();
        stopper.join().unwrap();
        assert!(r.hits.is_empty(), "se canceló a mitad del archivo");
        assert!(t.elapsed() < Duration::from_millis(500), "tardó {:?}", t.elapsed());
        // Con la marca ya puesta, la primera revisión (a los 256 KB) corta la lectura.
        let mut budget = 10;
        let r = search_file(&cand, &scope, &q, &mut budget, &AtomicBool::new(true)).ok().unwrap();
        assert!(r.hits.is_empty());
    }

    #[test]
    fn adversarial_long_line_is_linear_and_caps_highlights() {
        let fx = Fx::new();
        // 64 KB de "!": 65.536 coincidencias de un carácter en una sola línea.
        fx.put("logs/a.log", "!".repeat(MAX_LINE).as_bytes());
        fx.put("logs/b.log", "ñ!".repeat(MAX_LINE / 4).as_bytes());
        let mut p = params("!");
        p.context = Some(0);
        let t = Instant::now();
        let (files, sum) = run(&fx, &p);
        let el = t.elapsed();
        println!("línea adversa de 64 KB (2 archivos): {el:?}");
        assert!(el < Duration::from_millis(200), "tardó {el:?}");
        assert_eq!(sum.matches, 2);
        for f in &files {
            let h = &f.hits[0];
            assert_eq!(h.ranges.len(), MAX_RANGES_PER_LINE, "{}", f.rel);
            assert!(h.extra > 0, "se informa cuántas coincidencias no se resaltan");
        }
        let a = files.iter().find(|f| f.rel == "a.log").unwrap();
        assert_eq!(a.hits[0].extra, MAX_LINE - MAX_RANGES_PER_LINE);
        // Los rangos de la línea con multibyte siguen apuntando a "!".
        let b = files.iter().find(|f| f.rel == "b.log").unwrap();
        let chars: Vec<char> = b.hits[0].text.chars().collect();
        assert!(b.hits[0].ranges.iter().all(|&[s, e]| e - s == 1 && chars[s] == '!'));
    }

    #[test]
    fn char_cursor_matches_naive_conversion() {
        let s = "añb€c😀d!ñ";
        let ranges: Vec<(usize, usize)> = s.char_indices().filter(|(_, c)| *c == '!' || *c == 'ñ' || *c == '😀').map(|(i, c)| (i, i + c.len_utf8())).collect();
        let (t, r) = display(s, &ranges, 100);
        assert_eq!(t, s);
        for (&(bs, be), [cs, ce]) in ranges.iter().zip(&r) {
            assert_eq!((*cs, *ce), (s[..bs].chars().count(), s[..be].chars().count()));
        }
    }

    #[test]
    fn binary_and_non_utf8_files() {
        let fx = Fx::new();
        fx.put("logs/bin.log", b"cabecera\0\0\0 token-secreto\n");
        // Latin-1: "configuración" con 0xF3 inválido en UTF-8.
        fx.put("logs/latin1.log", b"l1 configuraci\xf3n activa\nl2 token-ok\n");
        fx.put("logs/utf16.log", &"token-ok\n".encode_utf16().flat_map(|u| u.to_le_bytes()).collect::<Vec<u8>>());
        let (files, sum) = run(&fx, &params("token"));
        assert_eq!(files.len(), 1, "solo el texto Latin-1");
        assert_eq!(files[0].rel, "latin1.log");
        assert_eq!(sum.skipped_binary, 2);
        let (files, _) = run(&fx, &params("configuraci"));
        assert!(files[0].hits[0].text.contains('\u{fffd}'), "bytes inválidos se muestran como �, sin fallar");
    }

    #[test]
    fn only_eligible_files_are_read() {
        let fx = Fx::new();
        fx.put("logs/ok.log", b"clave-buscada\n");
        fx.put("logs/ok.txt", b"clave-buscada\n");
        fx.put("logs/datos.json", b"clave-buscada\n");
        fx.put("logs/.oculto.log", b"clave-buscada\n");
        fx.put("logs/.dir/oculto.log", b"clave-buscada\n");
        fx.put("logs/equipo/sub/profundo.log", b"clave-buscada\n");
        fx.put("backups/core_sw/2026-01-02_101010.txt", b"clave-buscada\n");
        fx.put("backups/core_sw/.secret-key", b"clave-buscada\n");
        fx.put("backups/core_sw/.2026-01-02_101010.txt.secrets.json", b"clave-buscada\n");
        fx.put("backups/core_sw/otro.txt", b"clave-buscada\n");
        fx.put("backups/suelto.txt", b"clave-buscada\n");
        fx.put("backups/core sw/2026-01-02_101010.txt", b"clave-buscada\n");
        fx.put("notes/abierta.txt", b"clave-buscada\n");
        fx.put("notes/secreta.ntenc", b"clave-buscada\n");
        fx.put("notes/protegida.txt", b"clave-buscada\n");
        fx.put("notes/protegida.ntenc", b"cifrado");
        let mut p = params("clave-buscada");
        p.kinds = vec!["logs".into(), "backups".into(), "notes".into()];
        let (files, _) = run(&fx, &p);
        let mut got: Vec<String> = files.iter().map(|f| format!("{:?}:{}", f.kind, f.rel)).collect();
        got.sort();
        assert_eq!(
            got,
            vec!["Backups:core_sw/2026-01-02_101010.txt", "Logs:equipo/sub/profundo.log", "Logs:ok.log", "Logs:ok.txt", "Notes:abierta.txt"]
        );
        // Sin elegir notas, no se leen aunque estén sin protección.
        let (files, _) = run(&fx, &params("clave-buscada"));
        assert!(files.iter().all(|f| f.kind != Kind::Notes));
    }

    #[test]
    fn kinds_scope_and_date_filters() {
        let fx = Fx::new();
        fx.put("logs/core1_20260101.log", b"hit\n");
        fx.put("logs/edge2_20260101.log", b"hit\n");
        fx.put("backups/core1/2026-01-05_120000.txt", b"hit\n");
        fx.put("backups/core1/2026-03-05_120000.txt", b"hit\n");
        let mut p = params("hit");
        p.kinds = vec!["backups".into()];
        let (f, _) = run(&fx, &p);
        assert_eq!(f.len(), 2);
        p.from = Some("2026-02-01".into());
        let (f, _) = run(&fx, &p);
        assert_eq!(f.iter().map(|f| f.rel.as_str()).collect::<Vec<_>>(), vec!["core1/2026-03-05_120000.txt"]);
        p.from = Some("2026-01-05".into());
        p.to = Some("2026-01-05".into());
        let (f, _) = run(&fx, &p);
        assert_eq!(f.len(), 1, "los límites son inclusivos");
        assert_eq!(f[0].rel, "core1/2026-01-05_120000.txt");
        // Por equipo o sesión.
        let mut p = params("hit");
        p.scope = Some("EDGE".into());
        let (f, _) = run(&fx, &p);
        assert_eq!(f.iter().map(|f| f.rel.as_str()).collect::<Vec<_>>(), vec!["edge2_20260101.log"]);
        // El rango de fechas de un log usa su fecha de modificación (hoy): fuera de un rango pasado.
        let mut p = params("hit");
        p.kinds = vec!["logs".into()];
        p.to = Some("2020-01-01".into());
        assert!(run(&fx, &p).0.is_empty());
    }

    #[test]
    fn results_are_newest_first() {
        let fx = Fx::new();
        fx.put("backups/sw/2025-01-01_000000.txt", b"hit\n");
        fx.put("backups/sw/2026-06-01_000000.txt", b"hit\n");
        fx.put("backups/sw/2025-12-01_000000.txt", b"hit\n");
        let mut p = params("hit");
        p.kinds = vec!["backups".into()];
        let (f, _) = run(&fx, &p);
        let names: Vec<&str> = f.iter().map(|f| f.rel.as_str()).collect();
        assert_eq!(names, vec!["sw/2026-06-01_000000.txt", "sw/2025-12-01_000000.txt", "sw/2025-01-01_000000.txt"]);
    }

    #[test]
    fn resolve_file_rejects_paths_outside_the_folders() {
        let fx = Fx::new();
        fx.put("logs/ok.log", b"x");
        fx.put("secreto.log", b"fuera de la carpeta");
        fx.put("backups/sw/2026-01-02_101010.txt", b"x");
        fx.put("backups/sw/.secret-key", b"x");
        assert!(resolve_file(&fx.roots, Kind::Logs, "ok.log").is_ok());
        for bad in ["../secreto.log", "/etc/passwd", "..", "", "a/../../secreto.log", "ok.log/..", "./../secreto.log"] {
            assert!(resolve_file(&fx.roots, Kind::Logs, bad).is_err(), "{bad:?} debía rechazarse");
        }
        assert!(resolve_file(&fx.roots, Kind::Backups, "sw/2026-01-02_101010.txt").is_ok());
        assert!(resolve_file(&fx.roots, Kind::Backups, "sw/.secret-key").is_err(), "la llave no se abre");
        assert!(resolve_file(&fx.roots, Kind::Logs, "../backups/sw/.secret-key").is_err());
        assert!(resolve_file(&fx.roots, Kind::Notes, "abierta.exe").is_err());
        assert!(resolve_file(&fx.roots, Kind::Logs, "no-existe.log").is_err());
    }

    #[cfg(unix)]
    #[test]
    fn symlinks_are_never_followed() {
        use std::os::unix::fs::symlink;
        let fx = Fx::new();
        let outside = fx.put("fuera/secreto.log", b"clave-buscada\n");
        let outside_dir = outside.parent().unwrap().to_path_buf();
        fx.put("logs/real.log", b"clave-buscada\n");
        symlink(&outside, fx.dir.join("logs/enlace.log")).unwrap();
        symlink(&outside_dir, fx.dir.join("logs/carpeta")).unwrap();
        symlink(&outside, fx.dir.join("notes/nota.txt")).unwrap();
        let mut p = params("clave-buscada");
        p.kinds = vec!["logs".into(), "notes".into()];
        let (files, sum) = run(&fx, &p);
        assert_eq!(files.iter().map(|f| f.rel.as_str()).collect::<Vec<_>>(), vec!["real.log"]);
        assert_eq!(sum.total, 1);
        assert!(resolve_file(&fx.roots, Kind::Logs, "enlace.log").is_err());
        assert!(resolve_file(&fx.roots, Kind::Logs, "carpeta/secreto.log").is_err());
        // Un enlace creado entre el recorrido y la lectura tampoco saca el archivo de la carpeta.
        let q = params("clave-buscada").prepare().unwrap();
        let root = fx.roots.logs.canonicalize().unwrap();
        let cand = Cand { kind: Kind::Logs, rel: "enlace.log".into(), path: fx.dir.join("logs/enlace.log"), enc: false, size: 0, time: 0 };
        let mut budget = 5;
        let scope = Scope { root: &root, excluded: &[] };
        assert!(matches!(search_file(&cand, &scope, &q, &mut budget, &AtomicBool::new(false)), Err(Skip::Error)));
    }

    #[cfg(unix)]
    #[test]
    fn fifo_is_rejected_without_blocking() {
        let fx = Fx::new();
        let fifo = fx.dir.join("logs/cola.log");
        let c = std::ffi::CString::new(fifo.to_str().unwrap()).unwrap();
        assert_eq!(unsafe { libc::mkfifo(c.as_ptr(), 0o600) }, 0);
        let root = fx.roots.logs.canonicalize().unwrap();
        let t = Instant::now();
        let cand = Cand { kind: Kind::Logs, rel: "cola.log".into(), path: fifo, enc: false, size: 0, time: 0 };
        let q = params("x").prepare().unwrap();
        let mut budget = 5;
        let scope = Scope { root: &root, excluded: &[] };
        assert!(matches!(search_file(&cand, &scope, &q, &mut budget, &AtomicBool::new(false)), Err(Skip::Error)));
        assert!(resolve_file(&fx.roots, Kind::Logs, "cola.log").is_err());
        assert!(t.elapsed() < Duration::from_secs(2));
    }

    #[test]
    fn resolve_file_excludes_protected_notes_and_other_kinds_inside_logs() {
        let fx = Fx::new();
        fx.put("notes/abierta.txt", b"x");
        fx.put("notes/protegida.txt", b"x");
        fx.put("notes/protegida.ntenc", b"cifrado");
        assert!(resolve_file(&fx.roots, Kind::Notes, "abierta.txt").is_ok());
        assert!(resolve_file(&fx.roots, Kind::Notes, "protegida.txt").is_err(), "resto de una nota protegida");
        assert!(resolve_file(&fx.roots, Kind::Notes, "protegida.ntenc").is_err());
        // Carpeta de logs elegida por el usuario que contiene notas y respaldos.
        fx.put("backups/sw/2026-01-02_101010.txt", b"x");
        fx.put("otros/app.log", b"x");
        let roots = Roots { logs: fx.dir.clone(), backups: fx.roots.backups.clone(), notes: fx.roots.notes.clone() };
        assert!(resolve_file(&roots, Kind::Logs, "otros/app.log").is_ok());
        assert!(resolve_file(&roots, Kind::Logs, "notes/abierta.txt").is_err());
        assert!(resolve_file(&roots, Kind::Logs, "notes/protegida.txt").is_err());
        assert!(resolve_file(&roots, Kind::Logs, "backups/sw/2026-01-02_101010.txt").is_err());
        // Un respaldo ajeno al formato de la app o de otro nivel no se abre como respaldo.
        fx.put("backups/sw/otro.txt", b"x");
        fx.put("backups/suelto.txt", b"x");
        assert!(resolve_file(&fx.roots, Kind::Backups, "sw/otro.txt").is_err());
        assert!(resolve_file(&fx.roots, Kind::Backups, "suelto.txt").is_err());
    }

    #[cfg(unix)]
    #[test]
    fn a_logs_folder_that_contains_the_data_folder_does_not_leak_notes_or_backups() {
        let fx = Fx::new();
        fx.put("notes/privada.txt", b"clave-buscada\n");
        fx.put("backups/sw/2026-01-02_101010.txt", b"clave-buscada\n");
        fx.put("otros/app.log", b"clave-buscada\n");
        // Carpeta de logs elegida por el usuario: la raíz que contiene notas y respaldos.
        let roots = Roots { logs: fx.dir.clone(), backups: fx.roots.backups.clone(), notes: fx.roots.notes.clone() };
        let q = params("clave-buscada").prepare().unwrap();
        let mut files = Vec::new();
        search(&roots, &q, &AtomicBool::new(false), &mut |u| files.extend(u.files));
        let got: Vec<&str> = files.iter().map(|f| f.rel.as_str()).collect();
        assert!(got.contains(&"otros/app.log"));
        assert!(!got.iter().any(|r| r.starts_with("notes/") || r.starts_with("backups/")), "{got:?}");
    }

    #[test]
    fn progress_is_reported_incrementally() {
        let fx = Fx::new();
        for n in 0..3 {
            fx.put(&format!("logs/s{n}.log"), b"match\n");
        }
        let q = params("match").prepare().unwrap();
        let mut last = (0, 0, 0);
        let sum = search(&fx.roots, &q, &AtomicBool::new(false), &mut |u| last = (u.scanned, u.total, u.matches));
        assert_eq!(last, (3, 3, 3));
        assert_eq!((sum.files_with_hits, sum.matches), (3, 3));
    }

    #[test]
    fn display_maps_ranges_with_multibyte_text() {
        let s = "ñandú está aquí: ñu";
        let b = s.rfind("ñu").unwrap();
        let (t, r) = display(s, &[(b, b + "ñu".len())], 100);
        assert_eq!(t.chars().skip(r[0][0]).take(r[0][1] - r[0][0]).collect::<String>(), "ñu");
    }

    /// `RUNNING` es global: las pruebas que lo usan no corren en paralelo entre sí.
    static SLOT_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

    #[test]
    fn only_one_search_runs_at_a_time() {
        let _g = SLOT_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let a = Slot::take().expect("libre");
        assert!(Slot::take().is_none());
        drop(a);
        assert!(Slot::take().is_some());
    }

    #[test]
    fn slot_is_released_when_the_search_thread_panics() {
        let _g = SLOT_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        drop(Slot::take());
        let slot = Slot::take().expect("libre");
        let h = std::thread::spawn(move || {
            let _slot = slot;
            panic!("fallo simulado en la búsqueda");
        });
        assert!(h.join().is_err());
        assert!(Slot::take().is_some(), "el pánico no deja la búsqueda tomada para siempre");
    }
}
