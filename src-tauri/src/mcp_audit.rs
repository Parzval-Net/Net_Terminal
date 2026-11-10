//! Registro de auditoría local del servidor MCP (opcional, apagado por defecto).
//!
//! Una línea JSON por evento en `<datos>/mcp-audit/audit.jsonl`: fecha, cliente (el `clientInfo`
//! del initialize, acotado y sin caracteres de control), herramienta, conexión, comando (con los
//! secretos enmascarados como en los logs de sesión), riesgo calculado por la interfaz y decisión.
//! Nunca guarda salidas de equipos, contraseñas ni el token.
//!
//! Escritura: cada evento es una sola escritura en modo append (O_APPEND) de una línea completa,
//! serializada con un mutex del proceso; al superar `MAX_BYTES` el archivo rota a `audit.1.jsonl`
//! (se conservan `KEEP` archivos anteriores). Carpeta 700 y archivos 600 en Unix.

use crate::datacrypt as dfs;
use serde_json::{json, Value};
use std::fs::{self, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// Tope de cada archivo antes de rotar.
pub const MAX_BYTES: u64 = 1024 * 1024;
/// Archivos rotados que se conservan (audit.1.jsonl … audit.N.jsonl).
pub const KEEP: usize = 3;
/// Largo máximo de cada campo de texto del evento.
const MAX_FIELD: usize = 256;
/// Largo máximo del comando registrado.
const MAX_COMMAND: usize = 2000;
/// Eventos que devuelve como máximo el visor.
pub const MAX_TAIL: usize = 500;

const FILE: &str = "audit.jsonl";

static LOCK: Mutex<()> = Mutex::new(());

pub fn dir(data_dir: &Path) -> PathBuf {
    data_dir.join("mcp-audit")
}

fn rotated(dir: &Path, n: usize) -> PathBuf {
    dir.join(format!("audit.{n}.jsonl"))
}

/// Texto acotado y sin caracteres de control ni de dirección (dato no confiable del agente).
pub fn clean(s: &str, max: usize) -> String {
    s.chars()
        .filter(|c| !c.is_control() && !matches!(c, '\u{200B}'..='\u{200F}' | '\u{202A}'..='\u{202E}' | '\u{2066}'..='\u{2069}' | '\u{FEFF}'))
        .take(max)
        .collect()
}

/// Comando con los secretos enmascarados (mismo criterio que los logs de sesión y los respaldos),
/// una línea por renglón, acotado.
pub fn mask_command(cmd: &str) -> String {
    let masked: Vec<String> = cmd
        .lines()
        .map(|l| {
            let l = String::from_utf8_lossy(&crate::logfile::mask_line(l.as_bytes())).into_owned();
            crate::backups::mask_line(&l)
        })
        .collect();
    let joined = masked.join("\n");
    let mut out: String = joined.chars().filter(|c| *c == '\n' || *c == '\t' || !c.is_control()).take(MAX_COMMAND).collect();
    if joined.chars().count() > MAX_COMMAND {
        out.push('…');
    }
    out
}

/// Datos de un evento. `client` y los textos del agente se limpian aquí.
pub struct Event<'a> {
    pub client: &'a str,
    pub client_version: &'a str,
    pub tool: &'a str,
    pub connection: Option<&'a str>,
    pub target: Option<&'a str>,
    pub command: Option<&'a str>,
    pub risk: Option<&'a str>,
    pub decision: &'a str,
}

pub fn to_json(ev: &Event, now: chrono::DateTime<chrono::Local>) -> Value {
    let opt = |v: Option<&str>| v.map(|s| Value::String(clean(s, MAX_FIELD))).unwrap_or(Value::Null);
    json!({
        "ts": now.to_rfc3339_opts(chrono::SecondsFormat::Secs, false),
        "client": clean(ev.client, 64),
        "clientVersion": clean(ev.client_version, 32),
        "tool": clean(ev.tool, 64),
        "connection": opt(ev.connection),
        "target": opt(ev.target),
        "command": ev.command.map(|c| Value::String(mask_command(c))).unwrap_or(Value::Null),
        "risk": opt(ev.risk),
        "decision": clean(ev.decision, 32),
    })
}

#[cfg(unix)]
fn private_dir(d: &Path) {
    use std::os::unix::fs::PermissionsExt;
    let _ = fs::set_permissions(d, fs::Permissions::from_mode(0o700));
}
#[cfg(not(unix))]
fn private_dir(_: &Path) {}

fn open_append(path: &Path) -> std::io::Result<fs::File> {
    let mut o = OpenOptions::new();
    o.create(true).append(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        o.mode(0o600);
        // Un enlace simbólico plantado en lugar del archivo no se sigue.
        o.custom_flags(libc::O_NOFOLLOW);
    }
    let f = o.open(path)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = f.set_permissions(fs::Permissions::from_mode(0o600));
    }
    Ok(f)
}

/// Rota si el archivo actual supera el tope: audit.jsonl → audit.1.jsonl → … → audit.KEEP.jsonl.
fn rotate_if_needed(dir: &Path, max: u64) {
    let cur = dir.join(FILE);
    if fs::symlink_metadata(dfs::physical(&cur)).map(|m| m.len() < max).unwrap_or(true) {
        return;
    }
    let _ = dfs::remove_file(&rotated(dir, KEEP));
    for n in (1..KEEP).rev() {
        let _ = dfs::rename(&rotated(dir, n), &rotated(dir, n + 1));
    }
    let _ = dfs::rename(&cur, &rotated(dir, 1));
}

/// Agrega un evento. Los errores se devuelven, pero quien llama no debe fallar por ellos.
pub fn append(data_dir: &Path, ev: &Event) -> Result<(), String> {
    append_with(&dir(data_dir), &to_json(ev, chrono::Local::now()), MAX_BYTES)
}

fn append_with(dir: &Path, ev: &Value, max: u64) -> Result<(), String> {
    let _g = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    private_dir(dir);
    rotate_if_needed(dir, max);
    let mut line = serde_json::to_vec(ev).map_err(|e| e.to_string())?;
    line.push(b'\n');
    let path = dir.join(FILE);
    // Carpeta cifrada: un bloque cifrado por evento, anexado sin reescribir el archivo.
    if let Some(dk) = dfs::key_for(dir).map_err(|e| e.to_string())? {
        let (a, _) = dfs::open_append(&dfs::physical(&path), Some(&dk), dfs::OpenMode::Append).map_err(|e| e.to_string())?;
        return a.append(&line).map_err(|e| e.to_string());
    }
    let mut f = open_append(&path).map_err(|e| e.to_string())?;
    // Una sola escritura por línea: con O_APPEND no se intercala con otra escritura.
    f.write_all(&line).map_err(|e| e.to_string())
}

/// Últimos `n` eventos (el más reciente al final), leyendo el archivo actual y, si hace falta,
/// los anteriores. Se lee como máximo el final de cada archivo.
pub fn tail(data_dir: &Path, n: usize) -> Vec<Value> {
    let d = dir(data_dir);
    let n = n.clamp(1, MAX_TAIL);
    let _g = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut out: Vec<Value> = read_lines(&d.join(FILE));
    for k in 1..=KEEP {
        if out.len() >= n {
            break;
        }
        let mut older = read_lines(&rotated(&d, k));
        older.append(&mut out);
        out = older;
    }
    let skip = out.len().saturating_sub(n);
    out.split_off(skip)
}

fn read_lines(path: &Path) -> Vec<Value> {
    if dfs::is_encrypted(path) {
        // Descifrado en memoria (tolerante: un archivo que la app no alcanzó a cerrar se lee igual).
        let mut buf = Vec::new();
        if dfs::open_read(path).and_then(|mut r| r.read_to_end(&mut buf)).is_err() {
            return Vec::new();
        }
        let start = buf.len().saturating_sub((MAX_BYTES * 2) as usize);
        return parse_lines(&buf[start..], start > 0);
    }
    let Ok(mut f) = fs::File::open(path) else { return Vec::new() };
    let len = f.metadata().map(|m| m.len()).unwrap_or(0);
    let start = len.saturating_sub(MAX_BYTES * 2);
    if f.seek(SeekFrom::Start(start)).is_err() {
        return Vec::new();
    }
    let mut buf = Vec::new();
    if f.take(MAX_BYTES * 2).read_to_end(&mut buf).is_err() {
        return Vec::new();
    }
    parse_lines(&buf, start > 0)
}

fn parse_lines(buf: &[u8], cut: bool) -> Vec<Value> {
    let text = String::from_utf8_lossy(buf);
    let mut lines: Vec<&str> = text.lines().collect();
    // Se empezó a leer en medio de una línea: se descarta la primera.
    if cut && !lines.is_empty() {
        lines.remove(0);
    }
    lines.into_iter().filter_map(|l| serde_json::from_str::<Value>(l).ok()).filter(|v| v.is_object()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("nt-audit-{name}-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&d).unwrap();
        d
    }

    fn ev<'a>(cmd: Option<&'a str>, decision: &'a str) -> Event<'a> {
        Event {
            client: "Claude\u{202E}Code\x1b[2J",
            client_version: "1.0",
            tool: "run_command",
            connection: Some("t1#1"),
            target: Some("core-sw01"),
            command: cmd,
            risk: Some("read"),
            decision,
        }
    }

    #[test]
    fn event_masks_secrets_and_cleans_client() {
        let v = to_json(&ev(Some("username admin secret 0 Sup3rS3creta\nshow run | i ftp://nt:clave123@10.0.0.5/x"), "aprobado"), chrono::Local::now());
        let s = v.to_string();
        assert!(!s.contains("Sup3rS3creta") && !s.contains("clave123"), "{s}");
        assert!(s.contains("****"));
        assert_eq!(v["client"], "ClaudeCode[2J");
        assert_eq!(v["decision"], "aprobado");
        assert_eq!(v["risk"], "read");
        // Comando largo acotado.
        let long = "x".repeat(5000);
        let v = to_json(&ev(Some(&long), "rechazado"), chrono::Local::now());
        assert!(v["command"].as_str().unwrap().chars().count() <= MAX_COMMAND + 1);
    }

    #[test]
    fn append_rotates_keeps_and_tails() {
        let d = tmp("rot");
        let line = to_json(&ev(Some("show clock"), "lectura"), chrono::Local::now());
        for _ in 0..200 {
            append_with(&d, &line, 2048).unwrap();
        }
        assert!(d.join(FILE).exists());
        assert!(rotated(&d, 1).exists());
        assert!(!rotated(&d, KEEP + 1).exists(), "solo se conservan {KEEP}");
        assert!(fs::metadata(d.join(FILE)).unwrap().len() <= 2048 + 512);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(fs::metadata(d.join(FILE)).unwrap().permissions().mode() & 0o777, 0o600);
            assert_eq!(fs::metadata(&d).unwrap().permissions().mode() & 0o777, 0o700);
        }
        // tail: lee del archivo actual y del anterior, en orden, sin pasar el tope.
        let data = d.parent().unwrap().to_path_buf();
        let name = d.file_name().unwrap().to_string_lossy().to_string();
        // `tail` usa <datos>/mcp-audit: se arma esa carpeta con lo escrito.
        let data_dir = data.join(format!("{name}-data"));
        fs::create_dir_all(&data_dir).unwrap();
        fs::rename(&d, dir(&data_dir)).unwrap();
        let t = tail(&data_dir, 20);
        assert_eq!(t.len(), 20);
        assert!(t.iter().all(|v| v["tool"] == "run_command"));
        assert_eq!(tail(&data_dir, 100000).len().min(MAX_TAIL), tail(&data_dir, 100000).len());
        let _ = fs::remove_dir_all(&data_dir);
    }

    #[cfg(unix)]
    #[test]
    fn does_not_follow_a_planted_symlink() {
        let d = tmp("link");
        let target = d.join("victima.txt");
        fs::write(&target, "original").unwrap();
        std::os::unix::fs::symlink(&target, d.join(FILE)).unwrap();
        let line = to_json(&ev(None, "lectura"), chrono::Local::now());
        assert!(append_with(&d, &line, MAX_BYTES).is_err());
        assert_eq!(fs::read_to_string(&target).unwrap(), "original");
        let _ = fs::remove_dir_all(&d);
    }
}
