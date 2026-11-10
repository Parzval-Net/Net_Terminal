//! Importación de sesiones desde otros clientes: OpenSSH (~/.ssh/config), PuTTY (.reg),
//! SecureCRT (XML exportado), MobaXterm (.mobaconf / .mxtsessions) y CSV.
//!
//! Solo se importan datos de conexión (host, puerto, usuario, protocolo, carpeta, serial,
//! jump host y llave en OpenSSH). Nunca contraseñas, argumentos extra, comandos al conectar,
//! ProxyCommand/LocalCommand, proxies ni túneles: lo omitido se informa como aviso.

use crate::models::{Session, SessionType};
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;

/// Tamaño máximo del archivo a importar. El XML de SecureCRT (Export Settings) incluye toda la
/// configuración global y en instalaciones reales pesa 8 a 10 MB o más.
pub const MAX_FILE: u64 = 64 * 1024 * 1024;
/// Tope para los demás formatos, que solo traen sesiones.
const MAX_OTHER: usize = 8 * 1024 * 1024;
/// Tope de elementos del XML: acota la memoria ante un archivo armado con etiquetas mínimas
/// (un export real de 10 MB tiene del orden de cientos de miles).
const MAX_XML_TOKENS: usize = 3_000_000;
/// Máximo de sesiones por importación y de avisos que se devuelven.
const MAX_SESSIONS: usize = 5000;
const MAX_WARNINGS: usize = 200;

#[derive(Serialize, Debug)]
pub struct ImportPreview {
    /// Formato detectado: openssh, putty, securecrt, mobaxterm o csv.
    pub format: String,
    pub sessions: Vec<Session>,
    /// Lo que se omitió y por qué.
    pub warnings: Vec<String>,
}

/// Avisos acumulados con tope.
#[derive(Default)]
struct Warn {
    list: Vec<String>,
    extra: usize,
}

impl Warn {
    fn add(&mut self, msg: impl Into<String>) {
        if self.list.len() < MAX_WARNINGS {
            self.list.push(msg.into());
        } else {
            self.extra += 1;
        }
    }
    fn finish(mut self) -> Vec<String> {
        if self.extra > 0 {
            self.list.push(format!("… y {} avisos más", self.extra));
        }
        self.list
    }
}

/// Lee y analiza el archivo elegido por el usuario. `format` fuerza el formato.
pub fn parse_file(path: &Path, format: Option<&str>) -> Result<ImportPreview, String> {
    let meta = std::fs::metadata(path).map_err(|e| e.to_string())?;
    if !meta.is_file() {
        return Err("No es un archivo".into());
    }
    if meta.len() > MAX_FILE {
        return Err(format!("El archivo supera {} MB", MAX_FILE / 1024 / 1024));
    }
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    let text = decode(&bytes);
    let file_name = path.file_name().map(|n| n.to_string_lossy().to_lowercase()).unwrap_or_default();
    let fmt = match format.filter(|f| !f.is_empty() && *f != "auto") {
        Some(f) => f.to_string(),
        None => detect(&file_name, &text).ok_or(
            "No se reconoce el formato. Elige OpenSSH, PuTTY (.reg), SecureCRT (.xml), MobaXterm o CSV.",
        )?,
    };
    if fmt != "securecrt" && text.len() > MAX_OTHER {
        return Err(format!("El archivo supera {} MB", MAX_OTHER / 1024 / 1024));
    }
    parse_text(&fmt, &text)
}

/// Analiza el texto ya decodificado en el formato indicado.
pub fn parse_text(format: &str, text: &str) -> Result<ImportPreview, String> {
    let mut w = Warn::default();
    let raw = match format {
        "openssh" => parse_openssh(text, &mut w),
        "putty" => parse_putty(text, &mut w),
        "securecrt" => parse_securecrt(text, &mut w)?,
        "mobaxterm" => parse_mobaxterm(text, &mut w),
        "csv" => parse_csv(text, &mut w),
        _ => return Err(format!("Formato desconocido: {format}")),
    };
    let mut sessions = Vec::new();
    for s in raw {
        if sessions.len() >= MAX_SESSIONS {
            w.add(format!("Se importan como máximo {MAX_SESSIONS} sesiones por archivo"));
            break;
        }
        if let Some(s) = finish(s, &mut w) {
            sessions.push(s);
        }
    }
    Ok(ImportPreview { format: format.to_string(), sessions, warnings: w.finish() })
}

/// UTF-16 (exportaciones de regedit), UTF-8 con o sin BOM, o Windows-1252/Latin-1.
fn decode(bytes: &[u8]) -> String {
    let utf16 = |le: bool| {
        let units: Vec<u16> = bytes[2..]
            .as_chunks::<2>()
            .0
            .iter()
            .map(|c| if le { u16::from_le_bytes(*c) } else { u16::from_be_bytes(*c) })
            .collect();
        String::from_utf16_lossy(&units)
    };
    match bytes {
        [0xFF, 0xFE, ..] => utf16(true),
        [0xFE, 0xFF, ..] => utf16(false),
        [0xEF, 0xBB, 0xBF, rest @ ..] => String::from_utf8_lossy(rest).into_owned(),
        _ => String::from_utf8(bytes.to_vec()).unwrap_or_else(|e| e.into_bytes().iter().map(|&b| b as char).collect()),
    }
}

fn detect(file_name: &str, text: &str) -> Option<String> {
    let head: String = text.chars().take(4096).collect();
    let f = if file_name.ends_with(".reg") || head.contains("SimonTatham\\PuTTY") {
        "putty"
    } else if head.contains("<VanDyke") || (file_name.ends_with(".xml") && head.contains("<key")) {
        "securecrt"
    } else if file_name.ends_with(".mobaconf") || file_name.ends_with(".mxtsessions") || text.contains("[Bookmarks") {
        "mobaxterm"
    } else if file_name.ends_with(".csv") {
        "csv"
    } else if file_name == "config"
        || file_name.ends_with(".conf")
        || head.lines().any(|l| l.trim_start().to_ascii_lowercase().starts_with("host "))
    {
        "openssh"
    } else {
        return None;
    };
    Some(f.into())
}

// ---------- Validación común ----------

/// Host seguro: sin espacios ni control, sin "-" inicial, caracteres de nombre o IP.
fn clean_host(v: &str) -> Option<String> {
    let v = v.trim();
    let v = v.strip_prefix('[').and_then(|x| x.strip_suffix(']')).unwrap_or(v);
    let ok = !v.is_empty()
        && v.len() <= 255
        && !v.starts_with('-')
        && v.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_' | ':' | '%'));
    ok.then(|| v.to_string())
}

fn clean_user(v: &str) -> Option<String> {
    let v = v.trim();
    let ok = !v.is_empty()
        && v.len() <= 64
        && !v.starts_with('-')
        && !v.chars().any(|c| c.is_whitespace() || c.is_control() || matches!(c, '"' | '\'' | '`' | '$' | ';' | '|'));
    ok.then(|| v.to_string())
}

/// Jump host: [usuario@]host[:puerto], varios separados por coma.
fn clean_jump(v: &str) -> Option<String> {
    let port_ok = |p: &str| p.parse::<u16>().is_ok_and(|p| p > 0);
    let hop_ok = |hop: &str| {
        let (user, hp) = match hop.rsplit_once('@') {
            Some((u, h)) => (Some(u), h),
            None => (None, hop),
        };
        let host = if let Some(h) = hp.strip_prefix('[') {
            // [IPv6]:puerto
            match h.split_once(']') {
                Some((h, "")) => Some(h),
                Some((h, rest)) => rest.strip_prefix(':').filter(|p| port_ok(p)).map(|_| h),
                None => None,
            }
        } else if hp.matches(':').count() == 1 {
            hp.split_once(':').filter(|(_, p)| port_ok(p)).map(|(h, _)| h)
        } else {
            Some(hp)
        };
        user.is_none_or(|u| clean_user(u).is_some()) && host.and_then(clean_host).is_some()
    };
    let v = v.trim();
    (!v.is_empty() && v.len() <= 512 && v.split(',').all(hop_ok)).then(|| v.to_string())
}

fn clean_path(v: &str) -> Option<String> {
    let v = v.trim().trim_matches('"');
    (!v.is_empty() && v.len() <= 1024 && !v.starts_with('-') && !v.chars().any(|c| c.is_control())).then(|| v.to_string())
}

fn clean_serial(v: &str) -> Option<String> {
    let v = v.trim();
    let ok = !v.is_empty()
        && v.len() <= 100
        && !v.starts_with('-')
        && v.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '/' | '\\' | '.' | '_' | '-' | ':'));
    ok.then(|| v.to_string())
}

fn clean_text(v: &str, max: usize) -> String {
    let collapsed = v.split_whitespace().collect::<Vec<_>>().join(" ");
    collapsed.chars().filter(|c| !c.is_control()).take(max).collect()
}

/// Carpeta "A/B/C": segmentos sin "/" ni control, máx. 8 niveles.
fn clean_folder<'a>(parts: impl IntoIterator<Item = &'a str>) -> Option<String> {
    let segs: Vec<String> = parts
        .into_iter()
        .map(|p| clean_text(&p.replace(['/', '\\'], " "), 60))
        .filter(|p| !p.is_empty())
        .take(8)
        .collect();
    (!segs.is_empty()).then(|| segs.join("/"))
}

fn folder_from_path(path: &str) -> Option<String> {
    clean_folder(path.split(['/', '\\']))
}

/// Valida y deja solo campos seguros. None si la sesión no se puede importar.
fn finish(mut s: Session, w: &mut Warn) -> Option<Session> {
    let label = clean_text(&s.name, 120);
    s.id.clear();
    s.created_at.clear();
    s.ssh_args = None;
    s.on_connect = None;
    s.scp = None;
    s.tunnels = None;
    s.platform = None;
    s.highlight = None;
    s.legacy_ssh = None;
    s.folder = s.folder.as_deref().and_then(folder_from_path);
    match s.session_type {
        SessionType::Ssh | SessionType::Telnet | SessionType::Raw => {
            let Some(host) = s.host.as_deref().and_then(clean_host) else {
                w.add(format!("{}: host vacío o inválido", if label.is_empty() { "(sin nombre)" } else { &label }));
                return None;
            };
            s.host = Some(host);
            if s.port == Some(0) {
                s.port = None;
            }
            if s.session_type == SessionType::Raw && s.port.is_none() {
                w.add(format!("{label}: TCP sin puerto"));
                return None;
            }
            s.serial_port = None;
            s.baud_rate = None;
        }
        SessionType::Serial => {
            let Some(port) = s.serial_port.as_deref().and_then(clean_serial) else {
                w.add(format!("{label}: puerto serial vacío o inválido"));
                return None;
            };
            s.serial_port = Some(port);
            s.host = None;
            s.port = None;
            s.username = None;
            s.baud_rate = Some(s.baud_rate.filter(|b| (50..=4_000_000).contains(b)).unwrap_or(9600));
            s.data_bits = Some(s.data_bits.filter(|b| (5..=8).contains(b)).unwrap_or(8));
            s.stop_bits = Some(s.stop_bits.filter(|b| *b == 2).unwrap_or(1));
        }
        SessionType::Local => {
            w.add(format!("{label}: las terminales locales no se importan"));
            return None;
        }
    }
    if s.session_type != SessionType::Ssh {
        s.identity_file = None;
        s.jump_host = None;
        s.username = None;
    }
    if let Some(u) = s.username.take() {
        match clean_user(&u) {
            Some(u) => s.username = Some(u),
            None if !u.trim().is_empty() => w.add(format!("{label}: usuario inválido, se omite")),
            None => {}
        }
    }
    if let Some(j) = s.jump_host.take() {
        match clean_jump(&j) {
            Some(j) => s.jump_host = Some(j),
            None => w.add(format!("{label}: jump host inválido, se omite")),
        }
    }
    s.identity_file = s.identity_file.as_deref().and_then(clean_path);
    s.name = if label.is_empty() {
        s.host.clone().or(s.serial_port.clone()).unwrap_or_default()
    } else {
        label
    };
    Some(s)
}

fn session(name: &str, t: SessionType) -> Session {
    Session::blank(name.to_string(), t)
}

// ---------- OpenSSH ----------

/// Separa "Clave valor", "Clave=valor" y "Clave = valor".
fn ssh_kv(line: &str) -> Option<(String, String)> {
    let line = line.trim();
    let idx = line.find(|c: char| c.is_whitespace() || c == '=')?;
    let (k, rest) = line.split_at(idx);
    let rest = rest.trim_start();
    let rest = rest.strip_prefix('=').unwrap_or(rest).trim();
    Some((k.to_ascii_lowercase(), rest.to_string()))
}

fn unquote(v: &str) -> &str {
    v.strip_prefix('"').and_then(|x| x.strip_suffix('"')).unwrap_or(v)
}

fn parse_openssh(text: &str, w: &mut Warn) -> Vec<Session> {
    struct Block {
        patterns: Vec<String>,
        opts: HashMap<String, String>,
    }
    let mut blocks: Vec<Block> = Vec::new();
    let mut in_block = false;
    let (mut matches, mut includes) = (0, 0);
    for line in text.lines() {
        let t = line.trim();
        if t.is_empty() || t.starts_with('#') {
            continue;
        }
        let Some((k, v)) = ssh_kv(t) else { continue };
        match k.as_str() {
            "host" => {
                blocks.push(Block {
                    patterns: v.split_whitespace().map(|p| unquote(p).to_string()).collect(),
                    opts: HashMap::new(),
                });
                in_block = true;
            }
            "match" => {
                matches += 1;
                in_block = false;
            }
            "include" => includes += 1,
            _ if in_block => {
                // Como ssh: el primer valor obtenido gana.
                if let Some(b) = blocks.last_mut() {
                    b.opts.entry(k).or_insert(v);
                }
            }
            _ => {}
        }
    }
    if matches > 0 {
        w.add(format!("{matches} bloques Match omitidos (dependen de condiciones en tiempo de conexión)"));
    }
    if includes > 0 {
        w.add("Include no se sigue: importa esos archivos por separado");
    }
    let mut out = Vec::new();
    let mut wildcards = 0;
    for b in blocks {
        for alias in &b.patterns {
            if alias.contains(['*', '?', '!']) {
                wildcards += 1;
                continue;
            }
            let mut s = session(alias, SessionType::Ssh);
            let host = b.opts.get("hostname").map(|h| unquote(h).replace("%h", alias)).unwrap_or_else(|| alias.clone());
            s.host = Some(host);
            s.port = b.opts.get("port").and_then(|p| p.parse().ok());
            s.username = b.opts.get("user").map(|u| unquote(u).to_string());
            s.identity_file = b.opts.get("identityfile").map(|f| unquote(f).to_string());
            s.jump_host = b.opts.get("proxyjump").filter(|j| !j.eq_ignore_ascii_case("none")).cloned();
            s.folder = Some("SSH config".into());
            for (key, label) in [
                ("proxycommand", "ProxyCommand"),
                ("localcommand", "LocalCommand"),
                ("remotecommand", "RemoteCommand"),
                ("knownhostscommand", "KnownHostsCommand"),
            ] {
                if b.opts.contains_key(key) {
                    w.add(format!("{alias}: {label} no se importa (seguridad); ssh lo seguirá leyendo de tu ~/.ssh/config"));
                }
            }
            if ["localforward", "remoteforward", "dynamicforward"].iter().any(|k| b.opts.contains_key(*k)) {
                w.add(format!("{alias}: los túneles no se importan; agrégalos en la sesión si los necesitas"));
            }
            out.push(s);
        }
    }
    if wildcards > 0 {
        w.add(format!("{wildcards} patrones con comodín omitidos (Host *, Host 10.*)"));
    }
    out
}

// ---------- PuTTY (.reg) ----------

const PUTTY_KEY: &str = "hkey_current_user\\software\\simontatham\\putty\\sessions\\";

/// Decodifica %XX (PuTTY escapa así los nombres de sesión en el registro).
fn url_decode(v: &str) -> String {
    let b = v.as_bytes();
    let hex = |c: u8| (c as char).to_digit(16).map(|d| d as u8);
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let (Some(h), Some(l)) = (hex(b[i + 1]), hex(b[i + 2])) {
                out.push(h * 16 + l);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Valor de una línea `"Nombre"=...` de un .reg: cadena o dword.
fn reg_value(line: &str) -> Option<(String, String)> {
    let rest = line.strip_prefix('"')?;
    let end = rest.find("\"=")?;
    let name = rest[..end].to_string();
    let val = &rest[end + 2..];
    if let Some(s) = val.strip_prefix('"') {
        let s = s.strip_suffix('"').unwrap_or(s);
        let mut out = String::with_capacity(s.len());
        let mut chars = s.chars();
        while let Some(c) = chars.next() {
            if c == '\\' {
                if let Some(n) = chars.next() {
                    out.push(n);
                }
            } else {
                out.push(c);
            }
        }
        Some((name, out))
    } else if let Some(h) = val.strip_prefix("dword:") {
        Some((name, u32::from_str_radix(h.trim(), 16).ok()?.to_string()))
    } else {
        None
    }
}

fn parse_putty(text: &str, w: &mut Warn) -> Vec<Session> {
    let mut sections: Vec<(String, HashMap<String, String>)> = Vec::new();
    let mut current = false;
    for line in text.lines() {
        let t = line.trim();
        if let Some(path) = t.strip_prefix('[').and_then(|x| x.strip_suffix(']')) {
            let lower = path.to_ascii_lowercase();
            current = false;
            if let Some(name) = lower.strip_prefix(PUTTY_KEY).map(|_| &path[PUTTY_KEY.len()..]) {
                if !name.is_empty() && !name.contains('\\') {
                    sections.push((url_decode(name), HashMap::new()));
                    current = true;
                }
            }
        } else if current {
            if let (Some((k, v)), Some(sec)) = (reg_value(t), sections.last_mut()) {
                sec.1.insert(k, v);
            }
        }
    }
    let mut out = Vec::new();
    for (name, v) in sections {
        if name == "Default Settings" {
            continue;
        }
        let get = |k: &str| v.get(k).map(String::as_str).unwrap_or("");
        let num = |k: &str| v.get(k).and_then(|x| x.parse::<u32>().ok());
        let proto = get("Protocol").to_ascii_lowercase();
        let kind = match proto.as_str() {
            "" | "ssh" => SessionType::Ssh,
            "telnet" => SessionType::Telnet,
            "raw" => SessionType::Raw,
            "serial" => SessionType::Serial,
            other => {
                w.add(format!("{name}: protocolo {other} no soportado"));
                continue;
            }
        };
        let mut s = session(&name, kind.clone());
        s.folder = Some("PuTTY".into());
        // "The Backspace key": 1 = Control-? (DEL, por defecto), 0 = Control-H (BS).
        if num("BackspaceIsDelete") == Some(0) {
            s.backspace = Some("bs".into());
        }
        if kind == SessionType::Serial {
            s.serial_port = Some(get("SerialLine").to_string());
            s.baud_rate = num("SerialSpeed");
            s.data_bits = num("SerialDataBits").map(|b| b as u8);
            s.stop_bits = match num("SerialStopHalfbits") {
                Some(4) => Some(2),
                Some(3) => {
                    w.add(format!("{name}: 1,5 bits de parada no soportado, se usa 1"));
                    Some(1)
                }
                _ => Some(1),
            };
            s.parity = Some(match num("SerialParity") {
                Some(1) => "odd".into(),
                Some(2) => "even".into(),
                Some(3 | 4) => {
                    w.add(format!("{name}: paridad mark/space no soportada, se usa none"));
                    "none".into()
                }
                _ => "none".into(),
            });
            s.flow_control = Some(match num("SerialFlowControl") {
                Some(0) => "none".into(),
                Some(2) => "hardware".into(),
                Some(3) => {
                    w.add(format!("{name}: control de flujo DSR/DTR no soportado, se usa none"));
                    "none".into()
                }
                // Por defecto PuTTY usa XON/XOFF.
                _ => "software".into(),
            });
        } else {
            let host = get("HostName");
            // PuTTY acepta "usuario@host" en HostName.
            let (user, host) = host.rsplit_once('@').map(|(u, h)| (Some(u), h)).unwrap_or((None, host));
            s.host = Some(host.to_string());
            s.port = num("PortNumber").and_then(|p| u16::try_from(p).ok());
            let u = get("UserName");
            s.username = if u.is_empty() { user.map(String::from) } else { Some(u.to_string()) };
            if !get("PublicKeyFile").is_empty() {
                w.add(format!("{name}: la llave .ppk de PuTTY no se importa (OpenSSH usa otro formato)"));
            }
            if num("ProxyMethod").unwrap_or(0) != 0 {
                w.add(format!("{name}: el proxy no se importa"));
            }
            if !get("PortForwardings").is_empty() {
                w.add(format!("{name}: los túneles no se importan"));
            }
            if !get("RemoteCommand").is_empty() {
                w.add(format!("{name}: el comando remoto no se importa"));
            }
        }
        out.push(s);
    }
    out
}

// ---------- SecureCRT (XML) ----------

enum Tok {
    Open { tag: String, name: Option<String>, empty: bool },
    Close(String),
    Text(String),
}

fn xml_unescape(s: &str) -> String {
    if !s.contains('&') {
        return s.to_string();
    }
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(i) = rest.find('&') {
        out.push_str(&rest[..i]);
        rest = &rest[i..];
        let Some(end) = rest.find(';').filter(|e| *e <= 10) else {
            out.push('&');
            rest = &rest[1..];
            continue;
        };
        let ent = &rest[1..end];
        let ch = match ent {
            "lt" => Some('<'),
            "gt" => Some('>'),
            "amp" => Some('&'),
            "quot" => Some('"'),
            "apos" => Some('\''),
            _ => ent
                .strip_prefix("#x")
                .map(|h| u32::from_str_radix(h, 16).ok())
                .unwrap_or_else(|| ent.strip_prefix('#').and_then(|d| d.parse().ok()))
                .and_then(char::from_u32),
        };
        match ch {
            Some(c) => {
                out.push(c);
                rest = &rest[end + 1..];
            }
            None => {
                out.push('&');
                rest = &rest[1..];
            }
        }
    }
    out.push_str(rest);
    out
}

/// Tokenizador mínimo para el XML de SecureCRT (etiquetas, atributo name y texto).
fn xml_tokens(text: &str) -> Result<Vec<Tok>, String> {
    let mut out = Vec::new();
    let mut rest = text;
    while let Some(i) = rest.find('<') {
        if out.len() >= MAX_XML_TOKENS {
            return Err("El XML tiene demasiados elementos".into());
        }
        let before = &rest[..i];
        if !before.trim().is_empty() {
            out.push(Tok::Text(xml_unescape(before)));
        }
        rest = &rest[i..];
        if let Some(r) = rest.strip_prefix("<!--") {
            rest = r.find("-->").map(|e| &r[e + 3..]).ok_or("Comentario XML sin cerrar")?;
            continue;
        }
        if let Some(r) = rest.strip_prefix("<![CDATA[") {
            let e = r.find("]]>").ok_or("CDATA sin cerrar")?;
            out.push(Tok::Text(r[..e].to_string()));
            rest = &r[e + 3..];
            continue;
        }
        let end = rest.find('>').ok_or("Etiqueta XML sin cerrar")?;
        let inner = &rest[1..end];
        rest = &rest[end + 1..];
        if inner.starts_with('?') || inner.starts_with('!') {
            continue;
        }
        if let Some(tag) = inner.strip_prefix('/') {
            out.push(Tok::Close(tag.trim().to_string()));
            continue;
        }
        let empty = inner.ends_with('/');
        let inner = inner.trim_end_matches('/');
        let tag: String = inner.chars().take_while(|c| !c.is_whitespace()).collect();
        let name = inner.find("name=\"").and_then(|p| {
            let v = &inner[p + 6..];
            v.find('"').map(|e| xml_unescape(&v[..e]))
        });
        out.push(Tok::Open { tag, name, empty });
    }
    Ok(out)
}

fn parse_securecrt(text: &str, w: &mut Warn) -> Result<Vec<Session>, String> {
    let toks = xml_tokens(text)?;
    // Pila de <key>: (nombre, valores). `sessions_depth` = nivel de la clave "Sessions".
    let mut stack: Vec<(String, HashMap<String, String>)> = Vec::new();
    let mut sessions_depth: Option<usize> = None;
    let mut value: Option<String> = None;
    let mut array: Option<String> = None;
    let mut text_buf = String::new();
    let mut out = Vec::new();
    for t in toks {
        match t {
            Tok::Open { tag, name, empty } => match tag.as_str() {
                "key" => {
                    let n = name.unwrap_or_default();
                    if empty {
                        continue;
                    }
                    if sessions_depth.is_none() && n == "Sessions" {
                        sessions_depth = Some(stack.len() + 1);
                    }
                    stack.push((n, HashMap::new()));
                }
                "array" if !empty => array = name,
                "string" | "dword" => {
                    if let (Some(a), None, Some(top)) = (array.as_ref(), name.as_ref(), stack.last_mut()) {
                        // Elemento de un arreglo: solo interesa saber que no está vacío.
                        top.1.insert(a.clone(), "1".into());
                    } else if !empty {
                        value = name;
                        text_buf.clear();
                    } else if let (Some(n), Some(top)) = (name, stack.last_mut()) {
                        top.1.insert(n, String::new());
                    }
                }
                _ => {}
            },
            Tok::Text(s) => {
                if value.is_some() {
                    text_buf.push_str(&s);
                }
            }
            Tok::Close(tag) => match tag.as_str() {
                "string" | "dword" => {
                    if let (Some(n), Some(top)) = (value.take(), stack.last_mut()) {
                        top.1.insert(n, std::mem::take(&mut text_buf));
                    }
                }
                "array" => array = None,
                "key" => {
                    let Some((name, vals)) = stack.pop() else { continue };
                    let Some(depth) = sessions_depth else { continue };
                    if stack.len() < depth {
                        if stack.len() + 1 == depth {
                            sessions_depth = None;
                        }
                        continue;
                    }
                    let is_session = vals.get("Is Session").map(|v| v == "1").unwrap_or(false) || vals.contains_key("Protocol Name");
                    if !is_session {
                        continue;
                    }
                    let folder_parts: Vec<&str> = stack[depth..].iter().map(|(n, _)| n.as_str()).collect();
                    if folder_parts.is_empty() && (name == "Default" || name.starts_with("Default_")) {
                        continue;
                    }
                    if name.starts_with("__") {
                        continue;
                    }
                    if let Some(s) = securecrt_session(&name, &vals, w) {
                        let mut s = s;
                        s.folder = clean_folder(folder_parts);
                        out.push(s);
                    }
                }
                _ => {}
            },
        }
    }
    Ok(out)
}

fn securecrt_session(name: &str, v: &HashMap<String, String>, w: &mut Warn) -> Option<Session> {
    let get = |k: &str| v.get(k).map(String::as_str).unwrap_or("");
    let num = |k: &str| v.get(k).and_then(|x| x.trim().parse::<u32>().ok());
    let port = |k: &str| num(k).and_then(|p| u16::try_from(p).ok());
    let proto = get("Protocol Name");
    let mut s = match proto {
        "SSH2" => {
            let mut s = session(name, SessionType::Ssh);
            s.port = port("[SSH2] Port");
            s
        }
        "Telnet" => {
            let mut s = session(name, SessionType::Telnet);
            s.port = port("Port");
            s
        }
        "Raw" => {
            let mut s = session(name, SessionType::Raw);
            s.port = port("Port");
            s
        }
        "Serial" => {
            let mut s = session(name, SessionType::Serial);
            s.serial_port = Some(get("Com Port").to_string());
            s.baud_rate = num("Baud Rate");
            s.data_bits = num("Data Bits").map(|b| b as u8);
            // Convención de Windows (DCB): 0 = 1 bit, 1 = 1,5 bits, 2 = 2 bits.
            s.stop_bits = Some(if num("Stop Bits") == Some(2) { 2 } else { 1 });
            s.parity = Some(match num("Parity") {
                Some(1) => "odd",
                Some(2) => "even",
                _ => "none",
            }
            .into());
            s.flow_control = Some(if num("CTS Flow") == Some(1) {
                "hardware"
            } else if num("XON Flow") == Some(1) {
                "software"
            } else {
                "none"
            }
            .into());
            return Some(s);
        }
        "SSH1" => {
            w.add(format!("{name}: SSH1 no es compatible con OpenSSH actual"));
            return None;
        }
        other => {
            w.add(format!("{name}: protocolo {} no soportado", if other.is_empty() { "desconocido" } else { other }));
            return None;
        }
    };
    s.host = Some(get("Hostname").to_string());
    s.username = Some(get("Username").to_string()).filter(|u| !u.is_empty());
    let fw = get("Firewall Name");
    if !fw.is_empty() && fw != "None" {
        w.add(format!("{name}: firewall/proxy \"{}\" no se importa", clean_text(fw, 60)));
    }
    if v.get("Port Forward Table V3").is_some_and(|x| !x.is_empty()) {
        w.add(format!("{name}: los túneles no se importan"));
    }
    Some(s)
}

// ---------- MobaXterm (.mobaconf / .mxtsessions) ----------

/// Velocidad serial: MobaXterm la guarda sumada a 1.000.000 (ej. 1115200 = 115200).
fn moba_baud(v: &str) -> Option<u32> {
    let n: u32 = v.trim().parse().ok()?;
    let b = if n >= 1_000_000 { n - 1_000_000 } else { n };
    (50..=4_000_000).contains(&b).then_some(b)
}

fn parse_mobaxterm(text: &str, w: &mut Warn) -> Vec<Session> {
    let mut out = Vec::new();
    let mut in_bookmarks = false;
    let mut folder: Option<String> = None;
    let mut flow_warned = false;
    for line in text.lines() {
        let t = line.trim_end_matches('\r');
        // Encabezado de sección; los nombres de sesión también pueden empezar con "[".
        if t.starts_with('[') && t.trim_end().ends_with(']') && !t.contains('=') {
            in_bookmarks = t.starts_with("[Bookmarks");
            folder = None;
            continue;
        }
        if !in_bookmarks {
            continue;
        }
        let Some((key, value)) = t.split_once('=') else { continue };
        match key {
            "SubRep" => {
                folder = folder_from_path(value);
                continue;
            }
            "ImgNum" => continue,
            _ => {}
        }
        let value = value.trim_start();
        // "#icono#tipo%campo1%campo2…#terminal#…"
        let mut parts = value.split('#');
        if !parts.next().is_some_and(|p| p.is_empty()) {
            continue;
        }
        let (Some(_icon), Some(body)) = (parts.next(), parts.next()) else { continue };
        let f: Vec<&str> = body.split('%').collect();
        let field = |i: usize| f.get(i).copied().unwrap_or("");
        let name = key.trim();
        let mut s = match field(0) {
            "0" => {
                let mut s = session(name, SessionType::Ssh);
                s.host = Some(field(1).to_string());
                s.port = field(2).parse().ok();
                let user = field(3);
                if user.starts_with('[') || user.starts_with('<') {
                    if user != "<default>" {
                        w.add(format!("{name}: usa una credencial guardada de MobaXterm, se importa sin usuario"));
                    }
                } else {
                    s.username = Some(user.to_string()).filter(|u| !u.is_empty());
                }
                if !field(7).is_empty() {
                    w.add(format!("{name}: el comando al iniciar sesión no se importa"));
                }
                // Gateways SSH (jump hosts), separados por __PIPE__.
                let hosts: Vec<&str> = field(8).split("__PIPE__").filter(|h| !h.is_empty()).collect();
                if !hosts.is_empty() {
                    let ports: Vec<&str> = field(9).split("__PIPE__").collect();
                    let users: Vec<&str> = field(10).split("__PIPE__").collect();
                    let hops: Vec<String> = hosts
                        .iter()
                        .enumerate()
                        .map(|(i, h)| {
                            let u = users.get(i).filter(|u| !u.is_empty() && !u.starts_with(['[', '<']));
                            let p = ports.get(i).filter(|p| !p.is_empty() && **p != "22");
                            format!(
                                "{}{h}{}",
                                u.map(|u| format!("{u}@")).unwrap_or_default(),
                                p.map(|p| format!(":{p}")).unwrap_or_default()
                            )
                        })
                        .collect();
                    s.jump_host = Some(hops.join(","));
                }
                if !field(14).is_empty() {
                    w.add(format!("{name}: la llave privada no se importa (ruta de MobaXterm)"));
                }
                if !matches!(field(19), "" | "0") {
                    w.add(format!("{name}: el proxy no se importa"));
                }
                s
            }
            "1" => {
                let mut s = session(name, SessionType::Telnet);
                s.host = Some(field(1).to_string());
                s.port = field(2).parse().ok();
                s
            }
            "8" => {
                let mut s = session(name, SessionType::Serial);
                // El campo 8 es "COM3  (descripción)": el puerto es la primera palabra.
                s.serial_port = field(8).split_whitespace().next().map(String::from);
                s.baud_rate = moba_baud(field(2));
                s.data_bits = field(3).parse::<u8>().ok().map(|d| if d <= 3 { d + 5 } else { d });
                s.parity = Some(match field(4) {
                    "1" => "odd",
                    "2" => "even",
                    _ => "none",
                }
                .into());
                s.stop_bits = Some(if field(5) == "2" { 2 } else { 1 });
                s.flow_control = Some("none".into());
                if !flow_warned {
                    flow_warned = true;
                    w.add("MobaXterm: el control de flujo serial no se importa; revísalo en cada sesión serial");
                }
                s
            }
            other => {
                w.add(format!("{name}: tipo de sesión {other} no soportado (solo SSH, Telnet y Serial)"));
                continue;
            }
        };
        if s.folder.is_none() {
            s.folder = folder.clone();
        }
        out.push(s);
    }
    out
}

// ---------- CSV ----------

/// Registros CSV (RFC 4180): comillas dobles, "" escapado, saltos de línea entre comillas.
fn csv_records(text: &str, delim: char) -> Vec<Vec<String>> {
    let mut rows = Vec::new();
    let mut row = Vec::new();
    let mut field = String::new();
    let mut quoted = false;
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        if quoted {
            if c == '"' {
                if chars.peek() == Some(&'"') {
                    field.push('"');
                    chars.next();
                } else {
                    quoted = false;
                }
            } else {
                field.push(c);
            }
        } else if c == '"' && field.is_empty() {
            quoted = true;
        } else if c == delim {
            row.push(std::mem::take(&mut field));
        } else if c == '\n' || c == '\r' {
            if c == '\r' && chars.peek() == Some(&'\n') {
                chars.next();
            }
            row.push(std::mem::take(&mut field));
            rows.push(std::mem::take(&mut row));
        } else {
            field.push(c);
        }
    }
    if !field.is_empty() || !row.is_empty() {
        row.push(field);
        rows.push(row);
    }
    rows.retain(|r| r.iter().any(|f| !f.trim().is_empty()));
    rows
}

/// Columnas: name,folder,type,host,port,username (encabezado opcional, también en español).
/// Separador "," o ";" (Excel en español). En serial: host = puerto serial, port = velocidad.
fn parse_csv(text: &str, w: &mut Warn) -> Vec<Session> {
    let first = text.lines().next().unwrap_or("");
    let delim = if first.matches(';').count() > first.matches(',').count() {
        ';'
    } else if first.matches('\t').count() > first.matches(',').count() {
        '\t'
    } else {
        ','
    };
    let mut rows = csv_records(text, delim).into_iter();
    let mut cols: [Option<usize>; 6] = [Some(0), Some(1), Some(2), Some(3), Some(4), Some(5)];
    let mut pending = None;
    if let Some(head) = rows.next() {
        let lower: Vec<String> = head.iter().map(|h| h.trim().to_lowercase()).collect();
        let find = |names: &[&str]| lower.iter().position(|h| names.contains(&h.as_str()));
        let is_header = find(&["host", "hostname", "ip", "name", "nombre"]).is_some();
        if is_header {
            cols = [
                find(&["name", "nombre"]),
                find(&["folder", "carpeta"]),
                find(&["type", "tipo", "protocol", "protocolo"]),
                find(&["host", "hostname", "ip", "address", "dirección", "direccion"]),
                find(&["port", "puerto"]),
                find(&["username", "user", "usuario"]),
            ];
            if cols[3].is_none() {
                w.add("CSV: falta la columna host");
                return Vec::new();
            }
        } else {
            pending = Some(head);
        }
    }
    let mut out = Vec::new();
    for (i, r) in pending.into_iter().chain(rows).enumerate() {
        if r.first().is_some_and(|f| f.trim_start().starts_with('#')) {
            continue;
        }
        let get = |c: usize| cols[c].and_then(|i| r.get(i)).map(|v| v.trim()).unwrap_or("");
        let kind = match get(2).to_lowercase().as_str() {
            "" | "ssh" | "ssh2" => SessionType::Ssh,
            "telnet" => SessionType::Telnet,
            "raw" | "tcp" => SessionType::Raw,
            "serial" => SessionType::Serial,
            other => {
                w.add(format!("CSV fila {}: tipo \"{}\" no soportado", i + 1, clean_text(other, 20)));
                continue;
            }
        };
        let mut s = session(get(0), kind.clone());
        s.folder = Some(get(1).to_string()).filter(|f| !f.is_empty());
        if kind == SessionType::Serial {
            s.serial_port = Some(get(3).to_string());
            s.baud_rate = get(4).parse().ok();
            s.parity = Some("none".into());
            s.flow_control = Some("none".into());
        } else {
            s.host = Some(get(3).to_string());
            s.port = get(4).parse().ok();
            s.username = Some(get(5).to_string()).filter(|u| !u.is_empty());
            if !get(4).is_empty() && s.port.is_none() {
                w.add(format!("CSV fila {}: puerto inválido, se usa el por defecto", i + 1));
            }
        }
        out.push(s);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(fmt: &str, text: &str) -> ImportPreview {
        parse_text(fmt, text).unwrap()
    }

    #[test]
    fn openssh_config() {
        let p = parse(
            "openssh",
            "# comentario\nHost *\n  User nadie\nHost core-sw01 core-alias\n  HostName 192.0.2.1\n  User admin\n  Port 2222\n  IdentityFile ~/.ssh/id_ed25519\n  ProxyJump noc@192.0.2.254:22\n  ProxyCommand nc %h %p\n  LocalForward 8443 192.0.2.5:443\nHost=lab\n  Hostname=192.0.2.9\nMatch host *.lab\n  User x\nHost 10.* !bad\nHost evil\n  HostName -oProxyCommand=sh\n",
        );
        let names: Vec<&str> = p.sessions.iter().map(|s| s.name.as_str()).collect();
        assert_eq!(names, ["core-sw01", "core-alias", "lab"]);
        let s = &p.sessions[0];
        assert_eq!(s.host.as_deref(), Some("192.0.2.1"));
        assert_eq!(s.port, Some(2222));
        assert_eq!(s.username.as_deref(), Some("admin"));
        assert_eq!(s.jump_host.as_deref(), Some("noc@192.0.2.254:22"));
        assert_eq!(s.identity_file.as_deref(), Some("~/.ssh/id_ed25519"));
        assert!(s.ssh_args.is_none() && s.on_connect.is_none() && s.tunnels.is_none());
        assert_eq!(p.sessions[2].host.as_deref(), Some("192.0.2.9"));
        let warn = p.warnings.join("\n");
        assert!(warn.contains("ProxyCommand"));
        assert!(warn.contains("túneles"));
        assert!(warn.contains("Match"));
        assert!(warn.contains("comodín"));
        assert!(warn.contains("evil: host vacío o inválido"));
    }

    #[test]
    fn putty_reg_utf16() {
        let reg = "Windows Registry Editor Version 5.00\r\n\r\n\
[HKEY_CURRENT_USER\\Software\\SimonTatham\\PuTTY\\Sessions\\Default%20Settings]\r\n\"HostName\"=\"\"\r\n\r\n\
[HKEY_CURRENT_USER\\Software\\SimonTatham\\PuTTY\\Sessions\\Core%20SW%2F01]\r\n\"HostName\"=\"192.0.2.1\"\r\n\"PortNumber\"=dword:00000016\r\n\"Protocol\"=\"ssh\"\r\n\"UserName\"=\"admin\"\r\n\"PublicKeyFile\"=\"C:\\\\keys\\\\a.ppk\"\r\n\"PortForwardings\"=\"L8080=192.0.2.5:80\"\r\n\r\n\
[HKEY_CURRENT_USER\\Software\\SimonTatham\\PuTTY\\Sessions\\consola]\r\n\"Protocol\"=\"serial\"\r\n\"SerialLine\"=\"COM3\"\r\n\"SerialSpeed\"=dword:0001c200\r\n\"SerialDataBits\"=dword:00000008\r\n\"SerialStopHalfbits\"=dword:00000002\r\n\"SerialParity\"=dword:00000000\r\n\"SerialFlowControl\"=dword:00000000\r\n\r\n\
[HKEY_CURRENT_USER\\Software\\SimonTatham\\PuTTY\\Sessions\\tel]\r\n\"HostName\"=\"noc@192.0.2.2\"\r\n\"Protocol\"=\"telnet\"\r\n\"PortNumber\"=dword:00000017\r\n\"BackspaceIsDelete\"=dword:00000000\r\n\r\n\
[HKEY_CURRENT_USER\\Software\\SimonTatham\\PuTTY\\Sessions\\rl]\r\n\"HostName\"=\"192.0.2.3\"\r\n\"Protocol\"=\"rlogin\"\r\n";
        // regedit exporta en UTF-16LE con BOM.
        let mut bytes = vec![0xFF, 0xFE];
        for u in reg.encode_utf16() {
            bytes.extend_from_slice(&u.to_le_bytes());
        }
        let text = decode(&bytes);
        assert_eq!(detect("sesiones.reg", &text).as_deref(), Some("putty"));
        let p = parse("putty", &text);
        assert_eq!(p.sessions.len(), 3);
        let s = &p.sessions[0];
        assert_eq!(s.name, "Core SW/01");
        assert_eq!((s.host.as_deref(), s.port, s.username.as_deref()), (Some("192.0.2.1"), Some(22), Some("admin")));
        assert!(s.identity_file.is_none());
        let c = &p.sessions[1];
        assert_eq!(c.session_type, SessionType::Serial);
        assert_eq!((c.serial_port.as_deref(), c.baud_rate, c.stop_bits), (Some("COM3"), Some(115200), Some(1)));
        assert_eq!(c.flow_control.as_deref(), Some("none"));
        assert_eq!(p.sessions[2].username, None, "telnet no lleva usuario");
        assert_eq!(p.sessions[2].host.as_deref(), Some("192.0.2.2"));
        assert_eq!(p.sessions[2].backspace.as_deref(), Some("bs"), "Backspace = Control-H en PuTTY");
        assert_eq!(s.backspace, None, "por defecto PuTTY envía DEL: queda en automático");
        let warn = p.warnings.join("\n");
        assert!(warn.contains(".ppk") && warn.contains("túneles") && warn.contains("rlogin"));
    }

    #[test]
    fn securecrt_xml() {
        let xml = r#"<?xml version="1.0" encoding="UTF-8"?>
<VanDyke version="3.0">
  <key name="Sessions">
    <key name="Default">
      <dword name="Is Session">1</dword>
      <string name="Protocol Name">SSH2</string>
      <string name="Hostname"/>
    </key>
    <key name="Sitio &amp; Core">
      <key name="WAN">
        <key name="ar-wan01">
          <dword name="[SSH2] Port">2222</dword>
          <string name="Hostname">192.0.2.1</string>
          <dword name="Is Session">1</dword>
          <string name="Protocol Name">SSH2</string>
          <string name="Username">netops</string>
          <string name="Firewall Name">Session:bastion</string>
          <array name="Port Forward Table V3">
            <string>x</string>
          </array>
          <array name="Description"/>
        </key>
      </key>
      <key name="sw-tel">
        <dword name="Is Session">1</dword>
        <string name="Protocol Name">Telnet</string>
        <string name="Hostname">192.0.2.2</string>
        <dword name="Port">23</dword>
      </key>
    </key>
    <key name="Serial-COM4">
      <dword name="Is Session">1</dword>
      <string name="Protocol Name">Serial</string>
      <dword name="Baud Rate">115200</dword>
      <dword name="Parity">2</dword>
      <dword name="Stop Bits">0</dword>
      <dword name="Data Bits">8</dword>
      <dword name="CTS Flow">0</dword>
      <dword name="XON Flow">1</dword>
      <string name="Com Port">COM4</string>
    </key>
    <key name="rdp">
      <dword name="Is Session">1</dword>
      <string name="Protocol Name">RDP</string>
      <string name="Hostname">192.0.2.3</string>
    </key>
  </key>
  <key name="Global"><dword name="x">1</dword></key>
</VanDyke>"#;
        assert_eq!(detect("export.xml", xml).as_deref(), Some("securecrt"));
        let p = parse("securecrt", xml);
        assert_eq!(p.sessions.len(), 3, "{:?}", p.warnings);
        let s = &p.sessions[0];
        assert_eq!(s.name, "ar-wan01");
        assert_eq!(s.folder.as_deref(), Some("Sitio & Core/WAN"));
        assert_eq!((s.host.as_deref(), s.port, s.username.as_deref()), (Some("192.0.2.1"), Some(2222), Some("netops")));
        assert_eq!(p.sessions[1].session_type, SessionType::Telnet);
        assert_eq!(p.sessions[1].folder.as_deref(), Some("Sitio & Core"));
        let c = &p.sessions[2];
        assert_eq!((c.serial_port.as_deref(), c.baud_rate, c.parity.as_deref()), (Some("COM4"), Some(115200), Some("even")));
        assert_eq!(c.flow_control.as_deref(), Some("software"));
        let warn = p.warnings.join("\n");
        assert!(warn.contains("firewall") && warn.contains("túneles") && warn.contains("RDP"));
    }

    /// El XML que genera "Exportar sesiones" (src/lib/sessionXml.ts) se reimporta completo.
    #[test]
    fn netterminal_xml_roundtrip() {
        let xml = r#"<?xml version="1.0" encoding="UTF-8"?>
<VanDyke version="3.0">
  <key name="Sessions">
    <key name="Sitio &amp; Core">
      <key name="WAN">
        <key name="core&lt;1&gt;">
          <dword name="Is Session">1</dword>
          <string name="Protocol Name">SSH2</string>
          <string name="Hostname">192.0.2.1</string>
          <string name="Username">netops</string>
          <dword name="[SSH2] Port">2222</dword>
        </key>
        <key name="core&lt;1&gt; (2)">
          <dword name="Is Session">1</dword>
          <string name="Protocol Name">Telnet</string>
          <string name="Hostname">192.0.2.2</string>
          <dword name="Port">23</dword>
        </key>
      </key>
    </key>
    <key name="tcp">
      <dword name="Is Session">1</dword>
      <string name="Protocol Name">Raw</string>
      <string name="Hostname">192.0.2.3</string>
      <dword name="Port">2001</dword>
    </key>
    <key name="consola">
      <dword name="Is Session">1</dword>
      <string name="Protocol Name">Serial</string>
      <string name="Com Port">COM3</string>
      <dword name="Baud Rate">115200</dword>
      <dword name="Data Bits">8</dword>
      <dword name="Stop Bits">2</dword>
      <dword name="Parity">2</dword>
      <dword name="CTS Flow">1</dword>
      <dword name="XON Flow">0</dword>
    </key>
  </key>
</VanDyke>
"#;
        assert_eq!(detect("sesiones.xml", xml).as_deref(), Some("securecrt"));
        let p = parse("securecrt", xml);
        assert_eq!(p.sessions.len(), 4, "{:?}", p.warnings);
        assert!(p.warnings.is_empty(), "{:?}", p.warnings);
        let s = &p.sessions[0];
        assert_eq!((s.name.as_str(), s.folder.as_deref()), ("core<1>", Some("Sitio & Core/WAN")));
        assert_eq!((s.host.as_deref(), s.port, s.username.as_deref()), (Some("192.0.2.1"), Some(2222), Some("netops")));
        assert_eq!((p.sessions[1].session_type.clone(), p.sessions[1].port), (SessionType::Telnet, Some(23)));
        assert_eq!((p.sessions[2].session_type.clone(), p.sessions[2].port), (SessionType::Raw, Some(2001)));
        let c = &p.sessions[3];
        assert_eq!((c.serial_port.as_deref(), c.baud_rate, c.stop_bits), (Some("COM3"), Some(115200), Some(2)));
        assert_eq!((c.parity.as_deref(), c.flow_control.as_deref()), (Some("even"), Some("hardware")));
    }

    #[test]
    fn mobaxterm_bookmarks() {
        let conf = "[Misc]\r\nx=1\r\n[Bookmarks]\r\nSubRep=\r\nImgNum=42\r\n\
core (admin)=#109#0%192.0.2.1%22%admin%%-1%-1%%192.0.2.254%22%noc%0%0%0%%%-1%0%0%0%%1080%%0%0%1%%0%%%%0%-1%-1%0#MobaFont%10%0#0# #-1\r\n\
[Bookmarks_1]\r\nSubRep=Sitio\\Consolas\r\nImgNum=41\r\n\
COM3=#131#8%-2%1009600%3%0%0%1%2%COM3  (USB Serial Port (COM3))#MobaFont%10#0# #-1\r\n\
gns3 = #98#1%192.0.2.7%5000%%%2%%%%%0%0%%1080%%#MobaFont%10#0# #-1\r\n\
cred= #109#0%192.0.2.8%22%[mi-cred]%%0%-1%cmd%%%%0%0%0%_ProfileDir_\\.ssh\\id_rsa%%0#MobaFont#0# #-1\r\n\
rdp=#91#4%192.0.2.9%3389%#MobaFont#0# #-1\r\n\
[sw-01][192.0.2.11]= #109#0%192.0.2.11%22%%%-1%-1%%%%%0%-1%0%%%-1%0%0%0%%1080%%0%0%1%#MobaFont#0# #-1\r\n";
        assert_eq!(detect("MobaXterm.mobaconf", conf).as_deref(), Some("mobaxterm"));
        let p = parse("mobaxterm", conf);
        assert_eq!(p.sessions.len(), 5, "{:?}", p.warnings);
        assert_eq!(p.sessions[4].name, "[sw-01][192.0.2.11]");
        assert_eq!(p.sessions[4].folder.as_deref(), Some("Sitio/Consolas"));
        let s = &p.sessions[0];
        assert_eq!((s.name.as_str(), s.host.as_deref(), s.port), ("core (admin)", Some("192.0.2.1"), Some(22)));
        assert_eq!(s.username.as_deref(), Some("admin"));
        assert_eq!(s.jump_host.as_deref(), Some("noc@192.0.2.254"));
        assert!(s.folder.is_none());
        let c = &p.sessions[1];
        assert_eq!(c.folder.as_deref(), Some("Sitio/Consolas"));
        assert_eq!((c.serial_port.as_deref(), c.baud_rate, c.data_bits), (Some("COM3"), Some(9600), Some(8)));
        assert_eq!((p.sessions[2].session_type.clone(), p.sessions[2].port), (SessionType::Telnet, Some(5000)));
        assert_eq!(p.sessions[3].username, None);
        let warn = p.warnings.join("\n");
        assert!(warn.contains("credencial") && warn.contains("comando") && warn.contains("llave") && warn.contains("tipo de sesión 4"));
    }

    #[test]
    fn csv_with_and_without_header() {
        let p = parse(
            "csv",
            "nombre;carpeta;tipo;host;puerto;usuario\n\"core; 01\";Sitio/Core;ssh;192.0.2.1;2222;admin\nsw2;;telnet;192.0.2.2;;\nusb;Lab;serial;/dev/ttyUSB0;115200;\nmal;;rdp;192.0.2.3;;\nx;;ssh;-oProxyCommand=sh;;\n",
        );
        assert_eq!(p.sessions.len(), 3);
        assert_eq!(p.sessions[0].name, "core; 01");
        assert_eq!(p.sessions[0].folder.as_deref(), Some("Sitio/Core"));
        assert_eq!(p.sessions[0].port, Some(2222));
        assert_eq!(p.sessions[2].baud_rate, Some(115200));
        assert_eq!(p.warnings.len(), 2, "{:?}", p.warnings);
        let p = parse("csv", "r1,,ssh,192.0.2.10,22,noc\n");
        assert_eq!(p.sessions[0].username.as_deref(), Some("noc"));
        assert_eq!(p.sessions[0].name, "r1");
    }

    #[test]
    fn validators_reject_injection() {
        assert!(clean_host("-oProxyCommand=x").is_none());
        assert!(clean_host("a b").is_none());
        assert!(clean_host("host;rm").is_none());
        assert_eq!(clean_host("[2001:db8::1]").as_deref(), Some("2001:db8::1"));
        assert!(clean_jump("noc@192.0.2.1:22,bastion").is_some());
        assert!(clean_jump("-J x").is_none());
        assert!(clean_jump("a@b:99999").is_none());
        assert!(clean_user("$(id)").is_none());
        assert_eq!(url_decode("Core%20SW%2F01"), "Core SW/01");
        assert_eq!(clean_folder(["a/b", " ", "c"]).as_deref(), Some("a b/c"));
        assert_eq!(moba_baud("1115200"), Some(115200));
    }

    #[test]
    fn securecrt_large_export() {
        // Exportación grande: mucha configuración global de relleno y 3000 sesiones (~12 MB).
        let mut xml = String::from("<?xml version=\"1.0\"?>\n<VanDyke version=\"3.0\">\n<key name=\"Global\">\n");
        while xml.len() < 9 * 1024 * 1024 {
            xml.push_str("<string name=\"Keymap\">VK_F1 \"\\033OP\" relleno de configuración global</string>\n");
        }
        xml.push_str("</key>\n<key name=\"Sessions\">\n");
        for i in 0..3000 {
            xml.push_str(&format!(
                "<key name=\"r{i}\"><dword name=\"Is Session\">1</dword><string name=\"Protocol Name\">SSH2</string><string name=\"Hostname\">192.0.2.{}</string><dword name=\"[SSH2] Port\">22</dword></key>\n",
                i % 250 + 1
            ));
        }
        xml.push_str("</key>\n</VanDyke>\n");
        assert!(xml.len() as u64 > 9 * 1024 * 1024 && (xml.len() as u64) < MAX_FILE);
        let dir = std::env::temp_dir().join(format!("nt-import-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let f = dir.join("export.xml");
        std::fs::write(&f, &xml).unwrap();
        let p = parse_file(&f, None).unwrap();
        std::fs::remove_dir_all(&dir).unwrap();
        assert_eq!(p.format, "securecrt");
        assert_eq!(p.sessions.len(), 3000);
        // Etiquetas mínimas repetidas: se corta antes de agotar memoria.
        assert!(xml_tokens(&"<a>".repeat(MAX_XML_TOKENS + 1)).is_err());
    }

    #[test]
    fn rejects_large_files_and_unknown_formats() {
        let dir = std::env::temp_dir().join(format!("nt-import-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let big = dir.join("big.csv");
        std::fs::write(&big, vec![b'a'; (MAX_FILE + 1) as usize]).unwrap();
        assert!(parse_file(&big, None).is_err());
        let unk = dir.join("x.bin");
        std::fs::write(&unk, "hola").unwrap();
        assert!(parse_file(&unk, None).is_err());
        let ok = dir.join("hosts.csv");
        std::fs::write(&ok, "r1,,ssh,192.0.2.10,22,noc\n").unwrap();
        assert_eq!(parse_file(&ok, None).unwrap().format, "csv");
        std::fs::remove_dir_all(&dir).unwrap();
    }

    // ---------- Pruebas adicionales ----------

    const SECRET: &str = "S3cr3t-PW-do-not-import";

    fn names(p: &ImportPreview) -> Vec<&str> {
        p.sessions.iter().map(|s| s.name.as_str()).collect()
    }

    fn utf16le(s: &str) -> Vec<u8> {
        let mut b = vec![0xFF, 0xFE];
        for u in s.encode_utf16() {
            b.extend_from_slice(&u.to_le_bytes());
        }
        b
    }

    fn tmpdir() -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("nt-import-t-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    fn reg(name: &str, body: &str) -> String {
        format!("[HKEY_CURRENT_USER\\Software\\SimonTatham\\PuTTY\\Sessions\\{name}]\r\n{body}\r\n\r\n")
    }

    // --- decode y detect ---

    #[test]
    fn decode_handles_bom_utf16_utf8_and_latin1() {
        assert_eq!(decode(&utf16le("ñandú")), "ñandú");
        let mut be = vec![0xFE, 0xFF];
        for u in "ab".encode_utf16() {
            be.extend_from_slice(&u.to_be_bytes());
        }
        assert_eq!(decode(&be), "ab");
        let mut u8bom = vec![0xEF, 0xBB, 0xBF];
        u8bom.extend_from_slice("sesión".as_bytes());
        assert_eq!(decode(&u8bom), "sesión");
        // Latin-1/Windows-1252: 0xF3 = ó.
        assert_eq!(decode(b"sesi\xf3n"), "sesión");
        assert_eq!(decode(b""), "");
        // Solo el BOM, sin contenido.
        assert_eq!(decode(&[0xFF, 0xFE]), "");
    }

    #[test]
    fn detect_by_name_and_content() {
        assert_eq!(detect("config", "").as_deref(), Some("openssh"));
        assert_eq!(detect("x.txt", "Host r1\n HostName 192.0.2.1").as_deref(), Some("openssh"));
        assert_eq!(detect("a.mxtsessions", "").as_deref(), Some("mobaxterm"));
        assert_eq!(detect("a.txt", "[Bookmarks_2]\n").as_deref(), Some("mobaxterm"));
        assert_eq!(detect("a.csv", "x").as_deref(), Some("csv"));
        assert_eq!(detect("a.txt", "[HKEY_CURRENT_USER\\Software\\SimonTatham\\PuTTY\\Sessions\\a]").as_deref(), Some("putty"));
        assert_eq!(detect("a.xml", "<VanDyke version=\"3\">").as_deref(), Some("securecrt"));
        assert_eq!(detect("a.xml", "<key name=\"Sessions\">").as_deref(), Some("securecrt"));
        assert_eq!(detect("notas.txt", "hola mundo"), None);
    }

    #[test]
    fn parse_file_forced_and_auto_format() {
        let d = tmpdir();
        let f = d.join("datos.txt");
        std::fs::write(&f, "r1;;ssh;192.0.2.1;22;noc\n").unwrap();
        assert!(parse_file(&f, None).is_err(), "sin pistas no se adivina");
        assert_eq!(parse_file(&f, Some("csv")).unwrap().sessions.len(), 1);
        assert!(parse_file(&f, Some("auto")).is_err());
        assert!(parse_file(&f, Some("pdf")).unwrap_err().contains("Formato desconocido"));
        assert!(parse_file(&d, None).unwrap_err().contains("No es un archivo"));
        assert!(parse_file(&d.join("no-existe.csv"), None).is_err());
        // Fuera de SecureCRT el tope es de 8 MB.
        let big = d.join("grande.csv");
        std::fs::write(&big, format!("r1,,ssh,192.0.2.1\n{}", "#".repeat(MAX_OTHER + 1))).unwrap();
        assert!(parse_file(&big, None).unwrap_err().contains("supera"));
        std::fs::remove_dir_all(&d).unwrap();
    }

    // --- PuTTY ---

    #[test]
    fn putty_utf16_file_end_to_end_with_spaces_and_escapes() {
        let mut t = String::from("Windows Registry Editor Version 5.00\r\n\r\n");
        t.push_str(&reg("Mi%20Router%20%C3%B1", "\"HostName\"=\"192.0.2.1\"\r\n\"Protocol\"=\"ssh\""));
        t.push_str(&reg("Default%20Settings", "\"HostName\"=\"192.0.2.99\""));
        t.push_str("[HKEY_CURRENT_USER\\Software\\SimonTatham\\PuTTY\\SshHostKeys]\r\n\"rsa2@22:192.0.2.1\"=\"0x1\"\r\n\r\n");
        t.push_str("[HKEY_CURRENT_USER\\Software\\SimonTatham\\PuTTY\\Sessions\\a\\b]\r\n\"HostName\"=\"192.0.2.50\"\r\n\r\n");
        let d = tmpdir();
        let f = d.join("putty.reg");
        std::fs::write(&f, utf16le(&t)).unwrap();
        let p = parse_file(&f, None).unwrap();
        std::fs::remove_dir_all(&d).unwrap();
        assert_eq!(p.format, "putty");
        // Default Settings, claves de host y subclaves anidadas no son sesiones.
        assert_eq!(names(&p), ["Mi Router ñ"]);
        assert_eq!(p.sessions[0].folder.as_deref(), Some("PuTTY"));
    }

    #[test]
    fn putty_protocols_default_and_backspace() {
        let mut t = String::new();
        t.push_str(&reg("sinproto", "\"HostName\"=\"192.0.2.1\""));
        t.push_str(&reg("raw1", "\"HostName\"=\"192.0.2.2\"\r\n\"Protocol\"=\"raw\"\r\n\"PortNumber\"=dword:000007d1"));
        t.push_str(&reg("del", "\"HostName\"=\"192.0.2.3\"\r\n\"BackspaceIsDelete\"=dword:00000001"));
        t.push_str(&reg("bs", "\"HostName\"=\"192.0.2.4\"\r\n\"BackspaceIsDelete\"=dword:00000000"));
        t.push_str(&reg("ssh-user", "\"HostName\"=\"ops@192.0.2.5\"\r\n\"UserName\"=\"explicito\""));
        t.push_str(&reg("ssh-user2", "\"HostName\"=\"ops@192.0.2.6\""));
        t.push_str(&reg("bad", "\"HostName\"=\"192.0.2.7\"\r\n\"Protocol\"=\"ssh1\""));
        let p = parse("putty", &t);
        assert_eq!(names(&p), ["sinproto", "raw1", "del", "bs", "ssh-user", "ssh-user2"], "{:?}", p.warnings);
        assert_eq!(p.sessions[0].session_type, SessionType::Ssh);
        assert_eq!((p.sessions[1].session_type.clone(), p.sessions[1].port), (SessionType::Raw, Some(2001)));
        assert_eq!(p.sessions[2].backspace, None);
        assert_eq!(p.sessions[3].backspace.as_deref(), Some("bs"));
        assert_eq!(p.sessions[4].username.as_deref(), Some("explicito"));
        assert_eq!(p.sessions[5].username.as_deref(), Some("ops"));
        assert_eq!(p.sessions[5].host.as_deref(), Some("192.0.2.6"));
        assert!(p.warnings.iter().any(|w| w.contains("bad") && w.contains("ssh1")));
    }

    #[test]
    fn putty_serial_variants() {
        let mut t = String::new();
        t.push_str(&reg(
            "c1",
            "\"Protocol\"=\"serial\"\r\n\"SerialLine\"=\"/dev/ttyUSB0\"\r\n\"SerialSpeed\"=dword:00002580\r\n\"SerialDataBits\"=dword:00000007\r\n\"SerialStopHalfbits\"=dword:00000004\r\n\"SerialParity\"=dword:00000001\r\n\"SerialFlowControl\"=dword:00000002\r\n\"BackspaceIsDelete\"=dword:00000000",
        ));
        t.push_str(&reg(
            "c2",
            "\"Protocol\"=\"serial\"\r\n\"SerialLine\"=\"COM9\"\r\n\"SerialStopHalfbits\"=dword:00000003\r\n\"SerialParity\"=dword:00000003\r\n\"SerialFlowControl\"=dword:00000003",
        ));
        t.push_str(&reg("c3", "\"Protocol\"=\"serial\"\r\n\"SerialLine\"=\"\""));
        t.push_str(&reg("c4", "\"Protocol\"=\"serial\"\r\n\"SerialLine\"=\"-oBad\""));
        let p = parse("putty", &t);
        assert_eq!(names(&p), ["c1", "c2"], "{:?}", p.warnings);
        let c = &p.sessions[0];
        assert_eq!(
            (c.serial_port.as_deref(), c.baud_rate, c.data_bits, c.stop_bits, c.parity.as_deref(), c.flow_control.as_deref()),
            (Some("/dev/ttyUSB0"), Some(9600), Some(7), Some(2), Some("odd"), Some("hardware"))
        );
        assert_eq!(c.backspace.as_deref(), Some("bs"));
        let c = &p.sessions[1];
        // Sin velocidad ni bits de datos: valores por defecto 9600 8N1; sin flow: XON/XOFF en PuTTY.
        assert_eq!((c.baud_rate, c.data_bits, c.stop_bits, c.parity.as_deref()), (Some(9600), Some(8), Some(1), Some("none")));
        assert_eq!(c.flow_control.as_deref(), Some("none"));
        let w = p.warnings.join("\n");
        assert!(w.contains("1,5 bits") && w.contains("mark/space") && w.contains("DSR/DTR"));
        assert!(w.contains("c3: puerto serial vacío o inválido") && w.contains("c4: puerto serial vacío o inválido"));
    }

    #[test]
    fn putty_ignores_proxy_forwardings_command_and_passwords() {
        let t = reg(
            "p1",
            &format!(
                "\"HostName\"=\"192.0.2.1\"\r\n\"ProxyMethod\"=dword:00000003\r\n\"ProxyHost\"=\"192.0.2.250\"\r\n\"ProxyUsername\"=\"u\"\r\n\"ProxyPassword\"=\"{SECRET}\"\r\n\"ProxyTelnetCommand\"=\"connect %host\"\r\n\"RemoteCommand\"=\"rm -rf /\"\r\n\"PortForwardings\"=\"L1=192.0.2.2:1\"\r\n\"PublicKeyFile\"=\"C:\\\\k.ppk\""
            ),
        );
        let p = parse("putty", &t);
        let s = &p.sessions[0];
        assert!(s.ssh_args.is_none() && s.on_connect.is_none() && s.tunnels.is_none() && s.identity_file.is_none());
        assert!(s.jump_host.is_none());
        let w = p.warnings.join("\n");
        assert!(w.contains("proxy") && w.contains("túneles") && w.contains("comando remoto") && w.contains(".ppk"));
        assert!(!serde_json::to_string(&p).unwrap().contains(SECRET));
    }

    #[test]
    fn putty_reg_value_parsing() {
        assert_eq!(reg_value("\"A\"=\"x\\\\y\\\"z\""), Some(("A".into(), "x\\y\"z".into())));
        assert_eq!(reg_value("\"N\"=dword:0000ffff"), Some(("N".into(), "65535".into())));
        assert_eq!(reg_value("\"N\"=dword:zz"), None);
        assert_eq!(reg_value("\"B\"=hex:01,02"), None);
        assert_eq!(reg_value("sin comillas"), None);
        assert_eq!(url_decode("100%"), "100%");
        assert_eq!(url_decode("%zz%41"), "%zzA");
        assert_eq!(url_decode("a%2"), "a%2");
    }

    // --- MobaXterm ---

    #[test]
    fn mobaxterm_serial_baud_sum_and_data_bits() {
        let conf = "[Bookmarks]\r\nSubRep=\r\n\
s1=#131#8%-2%1115200%3%0%0%0%2%COM7  (USB)#x#0#\r\n\
s2=#131#8%-2%9600%8%1%2%0%2%/dev/ttyUSB1#x#0#\r\n\
s3=#131#8%-2%1000000%0%0%0%0%2%COM8#x#0#\r\n\
s4=#131#8%-2%1115200%3%0%0%0%2%#x#0#\r\n";
        let p = parse("mobaxterm", conf);
        assert_eq!(names(&p), ["s1", "s2", "s3"], "{:?}", p.warnings);
        assert_eq!((p.sessions[0].baud_rate, p.sessions[0].data_bits), (Some(115200), Some(8)));
        assert_eq!(p.sessions[0].serial_port.as_deref(), Some("COM7"));
        assert_eq!((p.sessions[1].baud_rate, p.sessions[1].parity.as_deref(), p.sessions[1].stop_bits), (Some(9600), Some("odd"), Some(2)));
        // 1.000.000 exacto no es una velocidad válida: cae al valor por defecto.
        assert_eq!(p.sessions[2].baud_rate, Some(9600));
        assert_eq!(p.warnings.iter().filter(|w| w.contains("control de flujo")).count(), 1, "un solo aviso global");
        assert!(p.warnings.iter().any(|w| w.contains("s4: puerto serial vacío")));
        assert_eq!(moba_baud("115200"), Some(115200));
        assert_eq!(moba_baud("49"), None);
        assert_eq!(moba_baud("abc"), None);
        assert_eq!(moba_baud("5000001"), None);
    }

    #[test]
    fn mobaxterm_folders_ini_and_ignored_sections() {
        let conf = "[Misc]\r\nx=#109#0%192.0.2.99%22%a\r\n[Bookmarks]\r\nSubRep=\r\nImgNum=42\r\nraiz=#109#0%192.0.2.1%22%%%#m#0#\r\n\
[Bookmarks_1]\r\nSubRep=A\\B\\C\r\nImgNum=41\r\nn1=#109#0%192.0.2.2%22%%%#m#0#\r\n\
[Bookmarks_2]\r\nSubRep=Lab/Equipos\r\nn2=#98#1%192.0.2.3%23%#m#0#\r\n\
[Passwords]\r\nuser@srv=" ;
        let conf = format!("{conf}{SECRET}\r\n[Credentials]\r\ncred=#1#2%3\r\n");
        let p = parse("mobaxterm", &conf);
        assert_eq!(names(&p), ["raiz", "n1", "n2"], "{:?}", p.warnings);
        assert_eq!(p.sessions[0].folder, None);
        assert_eq!(p.sessions[1].folder.as_deref(), Some("A/B/C"));
        assert_eq!(p.sessions[2].folder.as_deref(), Some("Lab/Equipos"));
        assert!(!serde_json::to_string(&p).unwrap().contains(SECRET));
    }

    #[test]
    fn mobaxterm_jump_hosts_and_unsupported() {
        let line = "j=#109#0%192.0.2.1%22%ops%%-1%-1%echo hola%192.0.2.250__PIPE__192.0.2.251%2222__PIPE__22%gw1__PIPE__%0%0%0%%%-1%0%0%0%%1080%%0%0%1%#m#0#\r\n";
        let p = parse("mobaxterm", &format!("[Bookmarks]\r\n{line}"));
        assert_eq!(p.sessions[0].jump_host.as_deref(), Some("gw1@192.0.2.250:2222,192.0.2.251"));
        assert!(p.sessions[0].on_connect.is_none());
        assert!(p.warnings.iter().any(|w| w.contains("comando al iniciar sesión")));
        // Comentarios, líneas sin '=' o sin '#' se ignoran sin romper.
        let p = parse("mobaxterm", "[Bookmarks]\r\nbasura\r\nx=sin almohadillas\r\n=#1#2\r\n");
        assert!(p.sessions.is_empty());
        // Tipo 5 (VNC) no soportado.
        let p = parse("mobaxterm", "[Bookmarks]\r\nvnc=#91#5%192.0.2.9%5900%#m#0#\r\n");
        assert!(p.sessions.is_empty() && p.warnings[0].contains("tipo de sesión 5"));
    }

    #[test]
    fn mobaxterm_never_imports_commands_keys_or_proxies() {
        let line = format!("t=#109#0%192.0.2.1%22%ops%%-1%-1%reload%%%%0%0%0%C:\\\\k\\\\id_rsa%%0%0%0%0%%1080%%0%0%1%{SECRET}#m#0#\r\n");
        let p = parse("mobaxterm", &format!("[Bookmarks]\r\n{line}"));
        let s = &p.sessions[0];
        assert!(s.on_connect.is_none() && s.ssh_args.is_none() && s.identity_file.is_none() && s.tunnels.is_none());
        assert!(!serde_json::to_string(&p).unwrap().contains(SECRET));
        assert!(p.warnings.iter().any(|w| w.contains("llave privada")));
    }

    // --- OpenSSH ---

    #[test]
    fn openssh_patterns_match_include_and_first_value_wins() {
        let cfg = "Include ~/.ssh/config.d/*\nInclude otro\n\
Host a b\n  HostName 192.0.2.1\n  HostName 192.0.2.99\n  User uno\n  User dos\n\
Host *.lab !x ?ab web?\n  User comodin\n\
Host c\n  HostName=%h.example.net\n  Port 2022\n  ProxyJump none\n  Port 3022\n\
Match user root\n  HostName 192.0.2.77\n\
Host \"d\"\n  HostName \"192.0.2.4\"\n  IdentityFile \"~/.ssh/mi llave\"\n";
        let p = parse("openssh", cfg);
        assert_eq!(names(&p), ["a", "b", "c", "d"], "{:?}", p.warnings);
        assert_eq!(p.sessions[0].host.as_deref(), Some("192.0.2.1"), "gana el primer valor, como ssh");
        assert_eq!(p.sessions[0].username.as_deref(), Some("uno"));
        assert_eq!(p.sessions[1].host.as_deref(), Some("192.0.2.1"));
        // %h se reemplaza por el alias; el puerto del primer Port.
        assert_eq!(p.sessions[2].host.as_deref(), Some("c.example.net"));
        assert_eq!(p.sessions[2].port, Some(2022));
        assert!(p.sessions[2].jump_host.is_none(), "ProxyJump none");
        // El Match corta el bloque: su HostName no se asigna a "c".
        assert_eq!(p.sessions[3].identity_file.as_deref(), Some("~/.ssh/mi llave"));
        assert!(p.sessions.iter().all(|s| s.folder.as_deref() == Some("SSH config")));
        let w = p.warnings.join("\n");
        assert!(w.contains("Include no se sigue"));
        assert!(w.contains("1 bloques Match omitidos"));
        assert!(w.contains("4 patrones con comodín"), "{w}");
    }

    #[test]
    fn openssh_proxyjump_variants_and_injection() {
        let cfg = "Host j1\n  HostName 192.0.2.1\n  ProxyJump gw@192.0.2.250:2222,192.0.2.251\n\
Host j2\n  HostName 192.0.2.2\n  ProxyJump -oProxyCommand=x\n\
Host j3\n  HostName 192.0.2.3\n  ProxyJump a b\n\
Host j4\n  HostName 192.0.2.4\n  ProxyJump [2001:db8::1]:22\n\
Host j5\n  HostName 192.0.2.5\n  ProxyJump gw@host:0\n\
Host j6\n  HostName 192.0.2.6\n  User -oBad\n\
Host j7\n  HostName 192.0.2.7\n  User $(id)\n";
        let p = parse("openssh", cfg);
        assert_eq!(names(&p), ["j1", "j2", "j3", "j4", "j5", "j6", "j7"]);
        assert_eq!(p.sessions[0].jump_host.as_deref(), Some("gw@192.0.2.250:2222,192.0.2.251"));
        for i in [1, 2, 4] {
            assert!(p.sessions[i].jump_host.is_none(), "j{}", i + 1);
        }
        assert_eq!(p.sessions[3].jump_host.as_deref(), Some("[2001:db8::1]:22"));
        assert!(p.sessions[5].username.is_none() && p.sessions[6].username.is_none());
        assert_eq!(p.warnings.iter().filter(|w| w.contains("jump host inválido")).count(), 3);
        assert_eq!(p.warnings.iter().filter(|w| w.contains("usuario inválido")).count(), 2);
    }

    #[test]
    fn openssh_never_imports_commands_or_tunnels() {
        let cfg = "Host h\n  HostName 192.0.2.1\n  ProxyCommand ssh -W %h:%p bastion\n  LocalCommand rm -rf /\n  RemoteCommand sudo su\n  KnownHostsCommand /x\n  DynamicForward 1080\n  RemoteForward 80 192.0.2.5:80\n  SendEnv *\n  PermitLocalCommand yes\n";
        let p = parse("openssh", cfg);
        let s = &p.sessions[0];
        assert!(s.ssh_args.is_none() && s.on_connect.is_none() && s.tunnels.is_none() && s.jump_host.is_none());
        let w = p.warnings.join("\n");
        for k in ["ProxyCommand", "LocalCommand", "RemoteCommand", "KnownHostsCommand", "túneles"] {
            assert!(w.contains(k), "{k}");
        }
    }

    // --- CSV ---

    #[test]
    fn csv_headers_in_both_languages_and_delimiters() {
        let en = parse("csv", "Name,Folder,Protocol,Hostname,Port,User\nr1,Lab,ssh,192.0.2.1,2200,noc\n");
        let es = parse("csv", "NOMBRE;CARPETA;TIPO;DIRECCIÓN;PUERTO;USUARIO\nr1;Lab;ssh;192.0.2.1;2200;noc\n");
        let tab = parse("csv", "name\tfolder\ttype\thost\tport\tusername\nr1\tLab\tssh\t192.0.2.1\t2200\tnoc\n");
        for p in [&en, &es, &tab] {
            assert_eq!(p.sessions.len(), 1, "{:?}", p.warnings);
            let s = &p.sessions[0];
            assert_eq!((s.name.as_str(), s.folder.as_deref(), s.port, s.username.as_deref()), ("r1", Some("Lab"), Some(2200), Some("noc")));
        }
        // Columnas en otro orden y subconjunto.
        let p = parse("csv", "ip,name\n192.0.2.9,solo-ip\n");
        assert_eq!(p.sessions[0].host.as_deref(), Some("192.0.2.9"));
        assert_eq!(p.sessions[0].name, "solo-ip");
        // Sin columna de host: aviso y nada importado.
        let p = parse("csv", "name,folder\nx,y\n");
        assert!(p.sessions.is_empty() && p.warnings[0].contains("falta la columna host"));
    }

    #[test]
    fn csv_serial_types_quotes_and_comments() {
        let p = parse(
            "csv",
            "# comentario\r\nname,folder,type,host,port,user\r\n\"con \"\"comillas\"\"\",\"A/B\",TCP,192.0.2.1,2001,\r\nconsola,Lab,Serial,COM3,115200,\r\nbad,,serial,,115200,\r\nport,,ssh,192.0.2.2,xx,\r\n,,,192.0.2.3,,\r\n",
        );
        assert_eq!(p.sessions[0].name, "con \"comillas\"");
        assert_eq!((p.sessions[0].session_type.clone(), p.sessions[0].port), (SessionType::Raw, Some(2001)));
        assert_eq!(p.sessions[0].folder.as_deref(), Some("A/B"));
        let c = &p.sessions[1];
        assert_eq!((c.serial_port.as_deref(), c.baud_rate, c.host.as_deref()), (Some("COM3"), Some(115200), None));
        assert!(!p.sessions.iter().any(|s| s.name == "bad"));
        assert_eq!(p.sessions[2].port, None, "puerto inválido: por defecto");
        assert!(p.warnings.iter().any(|w| w.contains("puerto inválido")));
        // Sin nombre: usa el host.
        assert_eq!(p.sessions.last().unwrap().name, "192.0.2.3");
        // Con salto de línea dentro de comillas.
        let p = parse("csv", "r1,\"Sitio\nUno\",ssh,192.0.2.1\n");
        assert_eq!(p.sessions[0].folder.as_deref(), Some("Sitio Uno"));
        assert!(parse("csv", "").sessions.is_empty());
    }

    #[test]
    fn csv_password_columns_are_never_imported() {
        let p = parse(
            "csv",
            &format!("name,host,user,password,ssh_args,on_connect,proxy\nr1,192.0.2.1,noc,{SECRET},-L 1:2:3,reload,192.0.2.250\n"),
        );
        let s = &p.sessions[0];
        assert!(s.ssh_args.is_none() && s.on_connect.is_none() && s.jump_host.is_none() && s.tunnels.is_none());
        assert!(!serde_json::to_string(&p).unwrap().contains(SECRET));
        let by_pos = parse("csv", &format!("r1,,ssh,192.0.2.1,22,noc,{SECRET}\n"));
        assert!(!serde_json::to_string(&by_pos).unwrap().contains(SECRET));
    }

    // --- SecureCRT ---

    #[test]
    fn securecrt_nested_folders_default_and_unsupported() {
        let xml = r#"<VanDyke><key name="Sessions">
<key name="Default"><dword name="Is Session">1</dword><string name="Protocol Name">SSH2</string><string name="Hostname">192.0.2.200</string></key>
<key name="Default_Telnet"><dword name="Is Session">1</dword><string name="Protocol Name">Telnet</string><string name="Hostname">192.0.2.201</string></key>
<key name="__FolderData__"><dword name="Is Session">1</dword><string name="Protocol Name">SSH2</string><string name="Hostname">192.0.2.202</string></key>
<key name="L1"><key name="L2"><key name="L3">
  <key name="Default"><dword name="Is Session">1</dword><string name="Protocol Name">SSH2</string><string name="Hostname">192.0.2.1</string></key>
  <key name="hoja"><dword name="Is Session">1</dword><string name="Protocol Name">SSH2</string><string name="Hostname">192.0.2.2</string>
    <string name="Password V2">02:SECRETO</string><string name="Login Script"/><string name="Firewall Name">None</string></key>
</key></key></key>
<key name="ssh1"><dword name="Is Session">1</dword><string name="Protocol Name">SSH1</string><string name="Hostname">192.0.2.3</string></key>
<key name="rlogin"><dword name="Is Session">1</dword><string name="Protocol Name">RLogin</string><string name="Hostname">192.0.2.4</string></key>
<key name="sinproto"><dword name="Is Session">1</dword><string name="Hostname">192.0.2.5</string></key>
<key name="sinhost"><dword name="Is Session">1</dword><string name="Protocol Name">SSH2</string><string name="Hostname"></string></key>
<key name="raiz"><dword name="Is Session">1</dword><string name="Protocol Name">Raw</string><string name="Hostname">192.0.2.6</string><dword name="Port">7000</dword></key>
</key><key name="Otra"><key name="x"><dword name="Is Session">1</dword><string name="Protocol Name">SSH2</string><string name="Hostname">192.0.2.7</string></key></key></VanDyke>"#;
        let p = parse("securecrt", xml);
        assert_eq!(names(&p), ["Default", "hoja", "raiz"], "{:?}", p.warnings);
        // "Default" dentro de una carpeta sí es una sesión; los de la raíz no.
        assert_eq!(p.sessions[0].folder.as_deref(), Some("L1/L2/L3"));
        assert_eq!(p.sessions[0].host.as_deref(), Some("192.0.2.1"));
        assert_eq!(p.sessions[2].port, Some(7000));
        let w = p.warnings.join("\n");
        assert!(w.contains("SSH1 no es compatible") && w.contains("protocolo RLogin") && w.contains("desconocido"));
        assert!(w.contains("sinhost: host vacío o inválido"));
        assert!(!serde_json::to_string(&p).unwrap().contains("SECRETO"));
    }

    #[test]
    fn securecrt_xml_errors_and_entities() {
        assert!(parse_text("securecrt", "<key name=\"Sessions\"><!-- sin cerrar").is_err());
        assert!(parse_text("securecrt", "<key name=\"Sessions\"><![CDATA[x").is_err());
        assert!(parse_text("securecrt", "<key name=\"Sessions\"").is_err());
        assert_eq!(xml_unescape("a &amp; b &lt;&gt; &quot;&apos; &#65;&#x42; &bogus; &"), "a & b <> \"' AB &bogus; &");
        assert_eq!(xml_unescape("&#xD800;"), "&#xD800;", "escalar inválido se deja tal cual");
        // Sin sesiones: vacío, sin error.
        assert!(parse("securecrt", "<VanDyke></VanDyke>").sessions.is_empty());
    }

    #[test]
    fn securecrt_never_imports_credentials_scripts_or_tunnels() {
        let xml = r#"<key name="Sessions"><key name="r"><dword name="Is Session">1</dword><string name="Protocol Name">SSH2</string>
<string name="Hostname">192.0.2.1</string><string name="Username">noc</string><string name="Password V2">02:SECRETO</string>
<string name="Login Script">send "reload"</string><string name="Firewall Name">Session:bastion</string>
<array name="Port Forward Table V3"><string>x</string></array></key></key>"#;
        let p = parse("securecrt", xml);
        let s = &p.sessions[0];
        assert!(s.on_connect.is_none() && s.ssh_args.is_none() && s.tunnels.is_none() && s.jump_host.is_none());
        assert!(!serde_json::to_string(&p).unwrap().contains("SECRETO"));
        assert!(p.warnings.iter().any(|w| w.contains("firewall")) && p.warnings.iter().any(|w| w.contains("túneles")));
    }

    // --- Límites y validación ---

    #[test]
    fn max_sessions_is_enforced_with_one_warning() {
        let mut csv = String::from("name,host\n");
        for i in 0..MAX_SESSIONS + 50 {
            csv.push_str(&format!("r{i},192.0.2.{}\n", i % 250 + 1));
        }
        let p = parse("csv", &csv);
        assert_eq!(p.sessions.len(), MAX_SESSIONS);
        assert_eq!(p.warnings.iter().filter(|w| w.contains("máximo")).count(), 1);
        assert_eq!(p.sessions.last().unwrap().name, format!("r{}", MAX_SESSIONS - 1));
    }

    #[test]
    fn warnings_are_capped_with_overflow_summary() {
        let mut csv = String::from("name,host\n");
        for i in 0..MAX_WARNINGS + 37 {
            csv.push_str(&format!("m{i},-oBad{i}\n"));
        }
        let p = parse("csv", &csv);
        assert!(p.sessions.is_empty());
        assert_eq!(p.warnings.len(), MAX_WARNINGS + 1);
        assert_eq!(p.warnings.last().unwrap(), "… y 37 avisos más");
    }

    #[test]
    fn xml_token_limit_boundary() {
        assert!(xml_tokens(&"<a>".repeat(MAX_XML_TOKENS)).is_ok());
        assert!(xml_tokens(&"<a>".repeat(MAX_XML_TOKENS + 1)).is_err());
    }

    #[test]
    fn malicious_hosts_are_rejected_in_every_format() {
        let bad_hosts = ["-oProxyCommand=sh", "-J evil", "a b", "host\tname", "h\u{7}ost", "h\u{1b}[2Jost", "a;b", "a|b", "a`b`", "$(id)", "a&b", "a\\b", "ñandú", "a\u{202e}b"];
        for h in bad_hosts {
            assert!(clean_host(h).is_none(), "{h:?}");
        }
        for h in ["192.0.2.1", "r1.example.net", "[2001:db8::1]", "fe80::1%eth0", "a_b-c.d"] {
            assert!(clean_host(h).is_some(), "{h:?}");
        }
        assert!(clean_host(&"a".repeat(256)).is_none());
        assert!(clean_host(&"a".repeat(255)).is_some());
        for h in ["-oProxyCommand=sh", "a b", "h\u{7}ost"] {
            let csv = format!("name,host\nx,\"{h}\"\n");
            assert!(parse("csv", &csv).sessions.is_empty(), "csv {h:?}");
            assert!(parse("openssh", &format!("Host x\n  HostName {h}\n")).sessions.is_empty(), "openssh {h:?}");
            assert!(parse("putty", &reg("x", &format!("\"HostName\"=\"{h}\""))).sessions.is_empty(), "putty {h:?}");
            assert!(parse("mobaxterm", &format!("[Bookmarks]\nx=#1#0%{h}%22%#m#0#\n")).sessions.is_empty(), "moba {h:?}");
            let xml = format!("<key name=\"Sessions\"><key name=\"x\"><dword name=\"Is Session\">1</dword><string name=\"Protocol Name\">SSH2</string><string name=\"Hostname\">{h}</string></key></key>");
            assert!(parse("securecrt", &xml).sessions.is_empty(), "securecrt {h:?}");
        }
    }

    #[test]
    fn finish_normalizes_and_strips_sensitive_fields() {
        let mut w = Warn::default();
        let mut s = Session::blank("  Core\t\n01\u{7} ".into(), SessionType::Ssh);
        s.host = Some(" 192.0.2.1 ".into());
        s.port = Some(0);
        s.id = "id-ajeno".into();
        s.created_at = "2020".into();
        s.ssh_args = Some("-L 1:2:3".into());
        s.on_connect = Some("reload".into());
        s.legacy_ssh = Some(true);
        s.platform = Some("vrp5".into());
        s.highlight = Some("x".into());
        s.tunnels = Some(vec![]);
        s.folder = Some("A/../B\\C/".into());
        s.identity_file = Some("\"~/.ssh/id\"".into());
        let r = finish(s, &mut w).unwrap();
        assert_eq!(r.name, "Core 01");
        assert_eq!((r.host.as_deref(), r.port), (Some("192.0.2.1"), None));
        assert!(r.id.is_empty() && r.created_at.is_empty());
        assert!(r.ssh_args.is_none() && r.on_connect.is_none() && r.legacy_ssh.is_none() && r.platform.is_none());
        assert!(r.highlight.is_none() && r.tunnels.is_none());
        assert_eq!(r.folder.as_deref(), Some("A/../B/C"));
        assert_eq!(r.identity_file.as_deref(), Some("~/.ssh/id"));
        // Telnet/Raw no llevan usuario, llave ni jump host.
        let mut t = Session::blank("t".into(), SessionType::Telnet);
        t.host = Some("192.0.2.2".into());
        t.username = Some("u".into());
        t.identity_file = Some("k".into());
        t.jump_host = Some("j".into());
        let t = finish(t, &mut w).unwrap();
        assert!(t.username.is_none() && t.identity_file.is_none() && t.jump_host.is_none());
        // Raw sin puerto y Local se descartan.
        let mut raw = Session::blank("raw".into(), SessionType::Raw);
        raw.host = Some("192.0.2.3".into());
        assert!(finish(raw, &mut w).is_none());
        assert!(finish(Session::blank("l".into(), SessionType::Local), &mut w).is_none());
        // Serial: rangos inválidos vuelven a los valores por defecto y se limpia el host.
        let mut se = Session::blank("se".into(), SessionType::Serial);
        se.serial_port = Some("COM1".into());
        se.host = Some("x".into());
        se.baud_rate = Some(7);
        se.data_bits = Some(9);
        se.stop_bits = Some(3);
        let se = finish(se, &mut w).unwrap();
        assert_eq!((se.baud_rate, se.data_bits, se.stop_bits, se.host), (Some(9600), Some(8), Some(1), None));
    }

    #[test]
    fn clean_helpers_edge_cases() {
        assert!(clean_user(&"u".repeat(65)).is_none());
        assert!(clean_user("a b").is_none() && clean_user("a;b").is_none() && clean_user("").is_none());
        assert_eq!(clean_user(" noc ").as_deref(), Some("noc"));
        assert!(clean_path("-rf").is_none() && clean_path("a\nb").is_none() && clean_path("\"\"").is_none());
        assert!(clean_serial("COM3").is_some() && clean_serial("/dev/tty.usbserial-1").is_some());
        assert!(clean_serial("COM3; rm").is_none() && clean_serial("-x").is_none());
        assert_eq!(clean_folder(["a"; 12]).unwrap().matches('/').count(), 7, "máx. 8 niveles");
        assert!(clean_folder(["", " "]).is_none());
        assert_eq!(clean_text("  a \t b\n c ", 3), "a b");
        assert!(clean_jump("").is_none() && clean_jump("a,,b").is_none() && clean_jump("a@").is_none());
        assert!(clean_jump(&"a".repeat(513)).is_none());
        assert!(clean_jump("[::1]").is_some() && clean_jump("[::1]:22").is_some() && clean_jump("h:0").is_none());
    }
}
