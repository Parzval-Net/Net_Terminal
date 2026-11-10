//! Archivo cifrado de NetTerminal (`.ntx`): exportación e importación de sesiones, carpetas,
//! ajustes y extras (botones, comandos propios, notas no protegidas, reglas de resaltado) en un
//! solo archivo, y opcionalmente las contraseñas guardadas en la bóveda. Sin nube.
//!
//! Formato (ver docs/TECNICO.md, "Archivo cifrado de NetTerminal"):
//!
//! ```text
//! 0..8    "NTBUNDLE"
//! 8       versión de formato (1)
//! 9       KDF (1 = Argon2id v1.3)
//! 10..22  m (KiB), t, p de Argon2id, u32 little endian
//! 22..38  sal aleatoria (16 bytes)
//! 38..62  nonce aleatorio de XChaCha20-Poly1305 (24 bytes)
//! 62..    JSON cifrado + etiqueta Poly1305 (16 bytes)
//! ```
//!
//! La cabecera completa (62 bytes) va como AAD: alterar la versión, los parámetros o la sal se
//! detecta igual que un archivo truncado o modificado. Mismas primitivas que la bóveda (`seal.rs`).
//! Todo el cifrado ocurre aquí: la contraseña del archivo llega por IPC en su propio campo y se
//! borra de memoria al soltarse; las contraseñas de la bóveda nunca pasan por la interfaz.

use crate::credentials::{Credentials, ExportedSecrets, ImportCounts};
use crate::importers::{clean_host, clean_jump, clean_path, clean_serial, clean_text, clean_user, folder_from_path};
use crate::models::{Session, SessionType};
use crate::seal::{self, derive, random, Kdf};
use crate::session_store::SessionStore;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime};
use zeroize::{Zeroize, Zeroizing};

pub const MAGIC: &[u8; 8] = b"NTBUNDLE";
pub const FORMAT_VERSION: u8 = 1;
const KDF_ARGON2ID: u8 = 1;
pub const HEADER_LEN: usize = 8 + 1 + 1 + 12 + 16 + 24;
const TAG_LEN: usize = 16;
/// Tope del archivo (al leer y al escribir).
pub const MAX_FILE: usize = 32 * 1024 * 1024;
/// Largo mínimo de la contraseña del archivo (en caracteres).
pub const MIN_PASSWORD: usize = 12;
pub const MAX_PASSWORD: usize = 1024;
/// Argon2id para el archivo: 256 MiB y 3 pasadas (4 veces la memoria de la bóveda). El archivo
/// puede atacarse fuera de línea sin límite de intentos: el costo de cada intento es la defensa.
pub const BUNDLE_KDF: Kdf = Kdf { m: 256 * 1024, t: 3, p: 1 };
const PAYLOAD_FORMAT: &str = "netterminal-bundle";
/// Palabra que el usuario escribe para aceptar que el archivo lleve contraseñas.
pub const CONFIRM_WORD: &str = "EXPORTAR";
/// Vida de una vista previa sin confirmar (el contenido descifrado queda solo en memoria). Se cuenta
/// en tiempo real (también el tiempo suspendido) y la borra un temporizador, no solo la consulta.
const PENDING_TTL: Duration = Duration::from_secs(15 * 60);
/// Cada cuánto revisa el temporizador si la vista previa venció.
const PENDING_SWEEP: Duration = Duration::from_secs(30);
/// Topes de Argon2id al leer un archivo: el de exportación (256 MiB) y 4 pasadas. Uno armado a mano no
/// puede pedir más memoria ni más tiempo que eso al derivar.
const MAX_KDF_M: u32 = 256 * 1024;
const MAX_KDF_T: u32 = 4;
/// Exportación con contraseñas cancelada en el diálogo de Rust (no es un error).
pub const EXPORT_CANCELLED: &str = "Exportación cancelada: no se escribió ningún archivo";
/// Botones de la confirmación nativa: el primero (el que toma Enter) es Cancelar.
const BTN_CANCEL: &str = "Cancelar";
const BTN_EXPORT: &str = "Exportar con contraseñas";

const MAX_SESSIONS: usize = 5000;
const MAX_FOLDERS: usize = 2000;
const MAX_MACROS: usize = 500;
const MAX_PACKS: usize = 200;
const MAX_NOTES: usize = 500;
const MAX_NOTE_BYTES: usize = 4 * 1024 * 1024;
const MAX_RULES: usize = 500;
const MAX_ON_CONNECT: usize = 16 * 1024;

const BAD_FILE: &str = "No es un archivo cifrado de NetTerminal (.ntx)";
/// Mensaje único para contraseña incorrecta, archivo truncado o alterado (no se distinguen).
pub const WRONG: &str = "Contraseña incorrecta, o el archivo está dañado o fue modificado";
const BAD_CONTENT: &str = "El contenido del archivo no es válido";
pub const VAULT_NEEDED: &str =
    "Para importar las contraseñas, la bóveda debe existir y estar desbloqueada (Ajustes › Credenciales), o importa sin contraseñas";

/// Claves de los ajustes que nunca viajan en el archivo ni se aplican al importar: secretos, funciones
/// sensibles que vienen apagadas (API local, servidores, algoritmos legacy, bloqueo de la bóveda),
/// rutas locales, datos del equipo y lo que se exporta aparte o no tiene sentido en otro equipo.
/// La interfaz tiene la misma lista (`src/lib/bundle.ts`); una prueba de Node exige que coincidan.
pub const SETTINGS_EXCLUDED: [&str; 35] = [
    // API local (MCP): token, encendido, puerto, aprobación y solo lectura.
    "mcpToken",
    "mcpEnabled",
    "mcpPort",
    "mcpApproval",
    "mcpReadOnly",
    // Permisos de agentes: visibilidad, sesiones marcadas, datos legibles, auditoría y ventana de consultas.
    "mcpVisibility",
    "mcpMarked",
    "mcpScopes",
    "mcpAudit",
    "mcpWindowMin",
    // Servidores integrados y receptor de traps.
    "tftpPort",
    "httpPort",
    "syslogPort",
    "syslogSave",
    "ftpPort",
    "snmpTrapPort",
    "snmpTrapBind",
    // Algoritmos SSH legacy.
    "autoLegacySsh",
    // Bloqueo automático de la bóveda (política local).
    "vaultAutoLockMin",
    "vaultLockOnSleep",
    // Modo portable cifrado: qué pasa con los logs al bloquear (política local).
    "dataLockStopLogs",
    // Rutas locales.
    "logsDir",
    // Monitores (se encienden solos) y fuentes de Topología (envían comandos a los equipos).
    "monitors",
    "topoSources",
    // Datos de este equipo o de otro archivo.
    "topology",
    "topoSnapshots",
    "sidebarOrder",
    "deviceInfo",
    "speedHistory",
    "updateDismissed",
    // Categorías que viajan aparte (cada una con su casilla).
    "macros",
    "customRules",
    "extraFolders",
    // Acceso a los servidores integrados (interfaz, clientes permitidos, auto-detención): política local.
    "serverGuard",
    // Packs desactivados: preferencia local (apagar uno quita sus comandos y su detección de riesgo).
    "disabledPacks",
];

/// Ajustes que el archivo solo puede fijar en su valor seguro: las protecciones solo se encienden;
/// copiar o pegar solo y grabar todo a disco solo se apagan. Clasificación completa: docs/TECNICO.md.
pub const SETTINGS_SAFE_ONLY: [(&str, bool); 6] = [
    ("logMask", true),
    ("confirmSend", true),
    ("confirmClose", true),
    ("copyOnSelect", false),
    ("rightClickPaste", false),
    ("autoLog", false),
];

// ---------- Cabecera y cifrado ----------

#[derive(Clone, Debug, PartialEq)]
struct Header {
    version: u8,
    kdf: Kdf,
    salt: [u8; 16],
    nonce: [u8; 24],
}

impl Header {
    fn encode(&self) -> [u8; HEADER_LEN] {
        let mut h = [0u8; HEADER_LEN];
        h[..8].copy_from_slice(MAGIC);
        h[8] = self.version;
        h[9] = KDF_ARGON2ID;
        self.kdf.encode(&mut h[10..22]);
        h[22..38].copy_from_slice(&self.salt);
        h[38..62].copy_from_slice(&self.nonce);
        h
    }

    fn decode(b: &[u8]) -> Result<Header, String> {
        if b.len() < 9 || &b[..8] != MAGIC {
            return Err(BAD_FILE.into());
        }
        if b[8] > FORMAT_VERSION {
            return Err(format!(
                "El archivo es de una versión más nueva de NetTerminal (formato {}; esta versión abre hasta el {FORMAT_VERSION}). Actualiza la app para importarlo.",
                b[8]
            ));
        }
        if b[8] == 0 || b.len() < HEADER_LEN + TAG_LEN {
            return Err(BAD_FILE.into());
        }
        let kdf = Kdf::decode(&b[10..22]);
        // Un archivo armado a mano no puede pedir memoria ni pasadas sin tope al derivar.
        if b[9] != KDF_ARGON2ID || !kdf.sane() || kdf.m > MAX_KDF_M || kdf.t > MAX_KDF_T || kdf.p > 4 {
            return Err(BAD_FILE.into());
        }
        let mut salt = [0u8; 16];
        salt.copy_from_slice(&b[22..38]);
        let mut nonce = [0u8; 24];
        nonce.copy_from_slice(&b[38..62]);
        Ok(Header { version: b[8], kdf, salt, nonce })
    }
}

/// Contraseña del archivo: entre 12 y 1024 caracteres, sin saltos de línea ni NUL.
pub fn check_password(pw: &str) -> Result<(), String> {
    if pw.chars().count() < MIN_PASSWORD {
        return Err(format!("La contraseña del archivo debe tener al menos {MIN_PASSWORD} caracteres"));
    }
    if pw.len() > MAX_PASSWORD || pw.chars().any(|c| matches!(c, '\r' | '\n' | '\0')) {
        return Err("La contraseña del archivo no es válida".into());
    }
    Ok(())
}

/// Cifra `plain` con una llave Argon2id de `password` (sal y nonce nuevos).
pub fn seal_bundle(password: &str, plain: &[u8], kdf: Kdf) -> Result<Vec<u8>, String> {
    check_password(password)?;
    let header = Header { version: FORMAT_VERSION, kdf, salt: random(), nonce: random() };
    let key = derive(password, &header.salt, kdf)?;
    let head = header.encode();
    let ct = seal::encrypt(&key, &header.nonce, plain, &head)?;
    let mut out = Vec::with_capacity(HEADER_LEN + ct.len());
    out.extend_from_slice(&head);
    out.extend_from_slice(&ct);
    if out.len() > MAX_FILE {
        return Err("El archivo superaría 32 MB: quita notas, comandos propios o sesiones".into());
    }
    Ok(out)
}

/// Descifra un archivo. Contraseña incorrecta, truncado o alterado: el mismo error genérico.
pub fn open_bundle(password: &str, bytes: &[u8]) -> Result<Zeroizing<Vec<u8>>, String> {
    if bytes.len() > MAX_FILE {
        return Err("El archivo supera 32 MB".into());
    }
    let h = Header::decode(bytes)?;
    if password.is_empty() || password.len() > MAX_PASSWORD {
        return Err(WRONG.into());
    }
    let key = derive(password, &h.salt, h.kdf)?;
    seal::decrypt(&key, &h.nonce, &bytes[HEADER_LEN..], &bytes[..HEADER_LEN]).map_err(|_| WRONG.to_string())
}

// ---------- Contenido ----------

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct NoteItem {
    pub name: String,
    pub content: String,
}

#[derive(Serialize, Deserialize, Default)]
pub struct HopSecret {
    pub ip: String,
    pub user: String,
    pub pw: String,
}

impl Drop for HopSecret {
    fn drop(&mut self) {
        self.pw.zeroize();
    }
}

/// Contraseñas dentro del archivo. Se borran de memoria al soltarse.
#[derive(Serialize, Deserialize, Default)]
pub struct Secrets {
    /// id de la sesión en el archivo -> contraseña.
    #[serde(default)]
    pub sessions: BTreeMap<String, String>,
    #[serde(default)]
    pub hops: Vec<HopSecret>,
    /// id del perfil SNMP -> secretos guardados (JSON atado al host y puerto del perfil).
    #[serde(default)]
    pub snmp: BTreeMap<String, String>,
}

impl Secrets {
    fn is_empty(&self) -> bool {
        self.sessions.is_empty() && self.hops.is_empty() && self.snmp.is_empty()
    }

    /// Borra los valores (lo que hace `Drop`).
    pub fn wipe(&mut self) {
        for v in self.sessions.values_mut().chain(self.snmp.values_mut()) {
            v.zeroize();
        }
        for h in &mut self.hops {
            h.pw.zeroize();
        }
    }

    fn approx_len(&self) -> usize {
        let s: usize = self.sessions.iter().chain(self.snmp.iter()).map(|(k, v)| k.len() + v.len() + 8).sum();
        s + self.hops.iter().map(|h| h.ip.len() + h.user.len() + h.pw.len() + 32).sum::<usize>() + 64
    }
}

impl Drop for Secrets {
    fn drop(&mut self) {
        self.wipe();
    }
}

/// JSON descifrado del archivo.
#[derive(Serialize, Deserialize, Default)]
pub struct Payload {
    pub format: String,
    pub version: u32,
    #[serde(default)]
    pub app: String,
    #[serde(default)]
    pub created: String,
    #[serde(default)]
    pub sessions: Vec<Value>,
    #[serde(default)]
    pub folders: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub settings: Option<Map<String, Value>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub macros: Option<Vec<Value>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub packs: Option<Vec<Value>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<Vec<NoteItem>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub highlight: Option<Vec<Value>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub secrets: Option<Secrets>,
}

/// Ajustes sin las claves excluidas, sin marcas internas y sin valores que apaguen una protección.
/// Devuelve también qué se quitó (para mostrarlo).
pub fn filter_settings(map: &Map<String, Value>) -> (Map<String, Value>, Vec<String>) {
    let mut out = Map::new();
    let mut dropped = Vec::new();
    for (k, v) in map {
        let excluded = SETTINGS_EXCLUDED.contains(&k.as_str()) || k.starts_with("__") || k == crate::datafiles::VERSION_KEY;
        let weakens = SETTINGS_SAFE_ONLY.iter().any(|(key, safe)| key == k && v.as_bool() != Some(*safe));
        if excluded || weakens || k.len() > 64 {
            dropped.push(k.chars().take(64).collect());
        } else {
            out.insert(k.clone(), v.clone());
        }
    }
    (out, dropped)
}

fn str_ok(v: &Value, key: &str, max: usize) -> bool {
    v.get(key).and_then(Value::as_str).is_some_and(|s| !s.is_empty() && s.len() <= max && !s.contains('\0'))
}

/// Botones: id, nombre y tipo válidos; texto o script acotados. Lo demás se descarta.
fn clean_macros(list: &[Value]) -> Vec<Value> {
    list.iter()
        .filter(|m| {
            str_ok(m, "id", 64)
                && str_ok(m, "label", 120)
                && matches!(m.get("kind").and_then(Value::as_str), Some("send" | "script"))
                && m.get("text").is_none_or(|t| t.as_str().is_some_and(|s| s.len() <= 8192 && !s.contains('\0')))
                && m.get("script").is_none_or(|t| t.as_str().is_some_and(|s| s.len() <= 200 && !s.contains(['/', '\\', '\0'])))
        })
        .take(MAX_MACROS)
        .map(|m| {
            let mut o = Map::new();
            for k in ["id", "label", "kind", "text", "script"] {
                if let Some(v) = m.get(k) {
                    o.insert(k.into(), v.clone());
                }
            }
            Value::Object(o)
        })
        .collect()
}

fn clean_notes(list: &[NoteItem]) -> Vec<NoteItem> {
    list.iter()
        .filter_map(|n| {
            let name = clean_text(&n.name.replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], " "), 120);
            let name = name.trim_matches('.').trim().to_string();
            (!name.is_empty() && n.content.len() <= MAX_NOTE_BYTES && !n.content.contains('\0')).then(|| NoteItem { name, content: n.content.clone() })
        })
        .take(MAX_NOTES)
        .collect()
}

/// Packs y reglas de resaltado: solo objetos (la interfaz los valida con `validatePack` y las
/// mismas reglas anti-ReDoS de siempre antes de guardarlos).
fn objects(list: &[Value], max: usize) -> Vec<Value> {
    list.iter().filter(|v| v.is_object()).take(max).cloned().collect()
}

/// Lo que una sesión trae además de los datos de conexión: se importa solo si el usuario lo marca,
/// y validado con las mismas reglas que al conectar.
#[derive(Clone, Debug, Default)]
pub struct Extras {
    pub ssh_args: Option<String>,
    pub tunnels: Option<Vec<crate::models::Tunnel>>,
    pub on_connect: Option<String>,
    pub legacy_ssh: Option<bool>,
}

impl Extras {
    fn any(&self) -> bool {
        self.ssh_args.is_some() || self.tunnels.is_some() || self.on_connect.is_some() || self.legacy_ssh == Some(true)
    }
}

/// Extras de una sesión para revisarlos en la vista previa (ya validados; la interfaz los muestra
/// como texto y calcula el riesgo de cada línea de `on_connect`).
#[derive(Serialize, Debug)]
pub struct ExtrasView {
    pub index: usize,
    pub ssh_args: Option<String>,
    pub tunnels: Option<Vec<crate::models::Tunnel>>,
    pub on_connect: Option<String>,
    pub legacy_ssh: Option<bool>,
}

fn pick(v: Option<String>, ok: impl Fn(&str) -> bool) -> Option<String> {
    v.map(|x| x.trim().to_string()).filter(|x| !x.is_empty() && ok(x))
}

/// Mismo saneamiento que los importadores (host, usuario, carpeta, jump host, serial) para los
/// datos de conexión; conserva además los ajustes propios de NetTerminal (resaltado, Enter,
/// codificación, usuario de Telnet). `ssh_args` pasa por `check_extra_args` (la misma validación
/// que al conectar) y los túneles por `tunnel_args`; lo que no pasa se descarta con aviso.
pub fn clean_session(mut s: Session, index: usize, w: &mut Vec<String>) -> Option<(String, Session, Extras)> {
    let bundle_id = Some(std::mem::take(&mut s.id))
        .filter(|i| !i.is_empty() && i.len() <= 128 && !i.chars().any(char::is_control) && !crate::credentials::reserved_id(i))
        .unwrap_or_else(|| format!("bundle-{index}"));
    let label = clean_text(&s.name, 120);
    let shown = if label.is_empty() { "(sin nombre)".to_string() } else { label.clone() };
    let mut extras = Extras::default();
    if let Some(a) = s.ssh_args.take().filter(|a| !a.trim().is_empty()) {
        match crate::connection::check_extra_args(&crate::connection::split_args(&a)) {
            Ok(()) if a.len() <= 2048 && !a.chars().any(|c| c.is_control()) => extras.ssh_args = Some(a.trim().to_string()),
            Ok(()) => w.push(format!("{shown}: argumentos extra de SSH no válidos, se omiten")),
            Err(e) => w.push(format!("{shown}: argumentos extra de SSH omitidos ({e})")),
        }
    }
    if let Some(t) = s.tunnels.take().filter(|t| !t.is_empty()) {
        match crate::connection::tunnel_args(&t) {
            Ok(_) => extras.tunnels = Some(t),
            Err(e) => w.push(format!("{shown}: túneles omitidos ({e})")),
        }
    }
    if let Some(c) = s.on_connect.take() {
        let c: String = c.chars().filter(|ch| !ch.is_control() || matches!(ch, '\n' | '\t')).take(MAX_ON_CONNECT).collect();
        if !c.trim().is_empty() {
            extras.on_connect = Some(c);
        }
    }
    extras.legacy_ssh = s.legacy_ssh.take().filter(|l| *l);
    s.scp = None;
    s.save_password = None;
    s.created_at.clear();
    s.folder = s.folder.as_deref().and_then(folder_from_path);
    match s.session_type {
        SessionType::Ssh | SessionType::Telnet | SessionType::Raw => {
            let Some(host) = s.host.as_deref().and_then(clean_host) else {
                w.push(format!("{shown}: host vacío o inválido"));
                return None;
            };
            s.host = Some(host);
            if s.port == Some(0) {
                s.port = None;
            }
            if s.session_type == SessionType::Raw && s.port.is_none() {
                w.push(format!("{shown}: TCP sin puerto"));
                return None;
            }
            s.serial_port = None;
            s.baud_rate = None;
            s.data_bits = None;
            s.stop_bits = None;
            s.parity = None;
            s.flow_control = None;
        }
        SessionType::Serial => {
            let Some(port) = s.serial_port.as_deref().and_then(clean_serial) else {
                w.push(format!("{shown}: puerto serial vacío o inválido"));
                return None;
            };
            s.serial_port = Some(port);
            s.host = None;
            s.port = None;
            s.baud_rate = Some(s.baud_rate.filter(|b| (50..=4_000_000).contains(b)).unwrap_or(9600));
            s.data_bits = Some(s.data_bits.filter(|b| (5..=8).contains(b)).unwrap_or(8));
            s.stop_bits = Some(s.stop_bits.filter(|b| *b == 2).unwrap_or(1));
            s.parity = pick(s.parity.take(), |p| matches!(p, "none" | "odd" | "even"));
            s.flow_control = pick(s.flow_control.take(), |p| matches!(p, "none" | "software" | "hardware"));
            extras = Extras::default();
        }
        SessionType::Local => {
            w.push(format!("{shown}: las terminales locales no se importan"));
            return None;
        }
    }
    if s.session_type != SessionType::Ssh {
        s.identity_file = None;
        s.jump_host = None;
        extras.ssh_args = None;
        extras.tunnels = None;
        extras.legacy_ssh = None;
    }
    if let Some(u) = s.username.take() {
        match clean_user(&u) {
            Some(u) => s.username = Some(u),
            None if !u.trim().is_empty() => w.push(format!("{shown}: usuario inválido, se omite")),
            None => {}
        }
    }
    if let Some(j) = s.jump_host.take().filter(|j| !j.trim().is_empty()) {
        match clean_jump(&j) {
            Some(j) => s.jump_host = Some(j),
            None => w.push(format!("{shown}: jump host inválido, se omite")),
        }
    }
    s.identity_file = s.identity_file.as_deref().and_then(clean_path);
    let token = |v: &str, max: usize| v.len() <= max && v.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'));
    s.highlight = pick(s.highlight.take(), |v| token(v, 40));
    s.platform = pick(s.platform.take(), |v| token(v, 40));
    s.encoding = pick(s.encoding.take(), |v| token(v, 20));
    s.newline = pick(s.newline.take(), |v| matches!(v, "cr" | "lf" | "crlf"));
    s.backspace = pick(s.backspace.take(), |v| matches!(v, "del" | "bs"));
    s.name = if label.is_empty() { s.host.clone().or(s.serial_port.clone()).unwrap_or_default() } else { label };
    Some((bundle_id, s, extras))
}

fn with_extras(mut s: Session, e: &Extras) -> Session {
    s.ssh_args = e.ssh_args.clone();
    s.tunnels = e.tunnels.clone();
    s.on_connect = e.on_connect.clone();
    s.legacy_ssh = e.legacy_ssh;
    s
}

/// Contraseña que la bóveda acepta (mismas reglas que `cred_set`).
fn pw_ok(p: &str) -> bool {
    !p.is_empty() && p.len() <= crate::credentials::MAX_PASSWORD && !p.chars().any(|c| matches!(c, '\r' | '\n' | '\0'))
}

fn none_if_empty(v: &Option<String>) -> Option<&str> {
    v.as_deref().map(str::trim).filter(|x| !x.is_empty())
}

/// La sesión local va al mismo destino que la del archivo: solo entonces recibe su contraseña.
/// Argumentos extra locales distintos (que podrían redirigir con `-o HostName`) lo impiden.
fn same_target(local: &Session, bundle: &Session, extras: &Extras) -> bool {
    local.session_type == bundle.session_type
        && local.session_type != SessionType::Local
        && local.host == bundle.host
        && local.port == bundle.port
        && local.serial_port == bundle.serial_port
        && none_if_empty(&local.username) == none_if_empty(&bundle.username)
        && none_if_empty(&local.jump_host) == none_if_empty(&bundle.jump_host)
        && (none_if_empty(&local.ssh_args).is_none() || none_if_empty(&local.ssh_args) == none_if_empty(&extras.ssh_args))
}

// ---------- Exportar ----------

#[derive(Deserialize, Default, Debug)]
pub struct HopRef {
    pub ip: String,
    pub user: String,
}

#[derive(Deserialize, Default, Debug)]
#[serde(default)]
pub struct PasswordOpts {
    pub sessions: bool,
    /// Vecinos elegidos (sin contraseña: solo IP y usuario).
    pub hops: Vec<HopRef>,
    pub snmp: bool,
    /// Palabra de confirmación (`EXPORTAR`).
    pub confirm: String,
}

#[derive(Deserialize, Default, Debug)]
#[serde(default)]
pub struct ExportOpts {
    pub session_ids: Vec<String>,
    pub all_sessions: bool,
    pub settings: bool,
    pub macros: bool,
    pub packs: bool,
    pub notes: bool,
    pub highlight: bool,
    pub passwords: Option<PasswordOpts>,
}

/// Lo que se exporta desde los datos actuales (lo arma el comando; las pruebas, a mano).
pub struct Sources<'a> {
    pub sessions: Vec<Session>,
    pub settings: Option<Map<String, Value>>,
    pub packs: Vec<Value>,
    pub notes: Vec<NoteItem>,
    pub creds: &'a Credentials,
}

#[derive(Serialize, Default, Debug, PartialEq)]
pub struct PasswordCounts {
    pub sessions: usize,
    pub hops: usize,
    pub snmp: usize,
}

#[derive(Serialize, Default, Debug)]
pub struct Summary {
    pub sessions: usize,
    pub folders: usize,
    pub settings: usize,
    pub macros: usize,
    pub packs: usize,
    pub notes: usize,
    pub rules: usize,
    pub passwords: PasswordCounts,
    pub bytes: usize,
    /// Ruta escrita (la elige Rust cuando el archivo lleva contraseñas).
    pub path: String,
}

fn related(folder: &str, extra: &str) -> bool {
    folder == extra || folder.starts_with(&format!("{extra}/")) || extra.starts_with(&format!("{folder}/"))
}

/// Arma el contenido del archivo (JSON en un búfer que se borra al soltarse). Las contraseñas
/// solo con la confirmación escrita, la bóveda usable y, con contraseña maestra, `master` correcta.
pub fn build_payload(src: Sources<'_>, opts: &ExportOpts, master: Option<&str>) -> Result<(Zeroizing<Vec<u8>>, Summary), String> {
    let mut sum = Summary::default();
    let chosen: Vec<Session> = src
        .sessions
        .into_iter()
        .filter(|s| s.session_type != SessionType::Local && (opts.all_sessions || opts.session_ids.contains(&s.id)))
        .take(MAX_SESSIONS)
        .collect();
    let folders_of: Vec<String> = chosen.iter().filter_map(|s| s.folder.as_deref().and_then(folder_from_path)).collect();
    let settings = src.settings.unwrap_or_default();
    let list = |k: &str| settings.get(k).and_then(Value::as_array).cloned().unwrap_or_default();
    let folders: Vec<String> = list("extraFolders")
        .iter()
        .filter_map(|v| v.as_str().and_then(folder_from_path))
        .filter(|f| opts.all_sessions || folders_of.iter().any(|s| related(s, f)))
        .take(MAX_FOLDERS)
        .collect();

    let mut payload = Payload {
        format: PAYLOAD_FORMAT.into(),
        version: u32::from(FORMAT_VERSION),
        app: env!("CARGO_PKG_VERSION").into(),
        created: chrono::Utc::now().to_rfc3339(),
        ..Default::default()
    };
    if opts.settings {
        let (clean, _) = filter_settings(&settings);
        sum.settings = clean.len();
        payload.settings = Some(clean);
    }
    if opts.macros {
        let m = clean_macros(&list("macros"));
        sum.macros = m.len();
        payload.macros = Some(m);
    }
    if opts.highlight {
        let r = objects(&list("customRules"), MAX_RULES);
        sum.rules = r.len();
        payload.highlight = Some(r);
    }
    if opts.packs {
        let p = objects(&src.packs, MAX_PACKS);
        sum.packs = p.len();
        payload.packs = Some(p);
    }
    if opts.notes {
        let n = clean_notes(&src.notes);
        sum.notes = n.len();
        payload.notes = Some(n);
    }

    if let Some(p) = opts.passwords.as_ref().filter(|p| p.sessions || p.snmp || !p.hops.is_empty()) {
        if p.confirm.trim() != CONFIRM_WORD {
            return Err(format!("Para incluir contraseñas escribe {CONFIRM_WORD} en la confirmación"));
        }
        // La llave se toma una sola vez para todo el flujo (no puede vencer entre el chequeo y la copia).
        let hold = src.creds.hold(false)?;
        if src.creds.is_master() {
            src.creds.verify_master(master.unwrap_or(""))?;
        }
        let ids: Vec<String> = if p.sessions { chosen.iter().filter(|s| s.save_password == Some(true)).map(|s| s.id.clone()).collect() } else { Vec::new() };
        let hops: Vec<(String, String)> = p.hops.iter().map(|h| (h.ip.clone(), h.user.clone())).collect();
        // SNMP: solo los perfiles que viajan en el archivo (con los ajustes) y tienen secretos guardados.
        let snmp: Vec<String> = match (&payload.settings, p.snmp) {
            (Some(s), true) => s
                .get("snmpProfiles")
                .and_then(Value::as_array)
                .map(|a| a.iter().filter(|x| x.get("saved") == Some(&Value::Bool(true))).filter_map(|x| x.get("id")?.as_str().map(String::from)).collect())
                .unwrap_or_default(),
            _ => Vec::new(),
        };
        let found = match &hold {
            Some(h) => src.creds.export_secrets(h, &ids, &hops, &snmp)?,
            None => ExportedSecrets::default(),
        };
        let mut secrets = Secrets::default();
        for (id, pw) in &found.sessions {
            secrets.sessions.insert(id.clone(), pw.to_string());
        }
        for (ip, user, pw) in &found.hops {
            secrets.hops.push(HopSecret { ip: ip.clone(), user: user.clone(), pw: pw.to_string() });
        }
        for (id, v) in &found.snmp {
            secrets.snmp.insert(id.clone(), v.to_string());
        }
        sum.passwords = PasswordCounts { sessions: secrets.sessions.len(), hops: secrets.hops.len(), snmp: secrets.snmp.len() };
        if !secrets.is_empty() {
            payload.secrets = Some(secrets);
        }
    }

    sum.sessions = chosen.len();
    sum.folders = folders.len();
    payload.folders = folders;
    payload.sessions = chosen
        .into_iter()
        .map(|mut s| {
            s.save_password = None;
            s.scp = None;
            s.created_at.clear();
            serde_json::to_value(s).unwrap_or(Value::Null)
        })
        .collect();

    // Capacidad de sobra para que el JSON con contraseñas no realoque (dejaría copias sin borrar).
    let secrets = payload.secrets.take();
    let base = serde_json::to_vec(&payload).map_err(|e| e.to_string())?.len();
    payload.secrets = secrets;
    let cap = base + payload.secrets.as_ref().map_or(0, |s| 6 * s.approx_len()) + 1024;
    let mut out = Zeroizing::new(Vec::with_capacity(cap));
    serde_json::to_writer(&mut *out, &payload).map_err(|e| e.to_string())?;
    if out.len() > MAX_FILE - HEADER_LEN - TAG_LEN {
        return Err("El archivo superaría 32 MB: quita notas, comandos propios o sesiones".into());
    }
    sum.bytes = out.len();
    Ok((out, sum))
}

// ---------- Importar: vista previa y aplicación ----------

/// Sesión del archivo ya saneada.
#[derive(Clone, Debug)]
pub struct BundleSession {
    pub bundle_id: String,
    pub session: Session,
    pub extras: Extras,
}

/// Contenido descifrado a la espera de que el usuario confirme la vista previa. Solo en memoria.
pub struct Pending {
    pub token: String,
    created: Instant,
    /// Hora del sistema al crearla: cuenta el tiempo suspendido, que el reloj monótono puede no contar.
    created_wall: SystemTime,
    pub sessions: Vec<BundleSession>,
    pub secrets: Secrets,
}

impl Pending {
    fn expired(&self) -> bool {
        let real = SystemTime::now().duration_since(self.created_wall).unwrap_or(Duration::ZERO);
        self.created.elapsed().max(real) >= PENDING_TTL
    }
}

#[derive(Serialize, Debug)]
pub struct Preview {
    pub token: String,
    pub app: String,
    pub created: String,
    /// Sesiones saneadas, sin los extras (id = el del archivo).
    pub sessions: Vec<Session>,
    /// Índices de sesiones con comandos al conectar, túneles, argumentos extra o SSH legacy.
    pub advanced: Vec<usize>,
    /// Esos extras, para revisarlos antes de importarlos (nunca se importan sin marcarlos).
    pub extras: Vec<ExtrasView>,
    /// Índices de sesiones con contraseña en el archivo (nunca el valor).
    pub with_password: Vec<usize>,
    pub folders: Vec<String>,
    pub settings: Option<Map<String, Value>>,
    /// Claves de ajustes del archivo que se ignoran (excluidas o que apagarían una protección).
    pub ignored_settings: Vec<String>,
    pub macros: Option<Vec<Value>>,
    pub packs: Option<Vec<Value>>,
    pub notes: Option<Vec<NoteItem>>,
    pub highlight: Option<Vec<Value>>,
    pub passwords: PasswordCounts,
    /// Vecinos con contraseña (sin el valor).
    pub hops: Vec<(String, String)>,
    /// Perfiles SNMP con secretos en el archivo.
    pub snmp_profiles: Vec<String>,
    pub warnings: Vec<String>,
}

/// Descifra, valida y sanea. Devuelve lo pendiente (con las contraseñas, para Rust) y la vista
/// previa (sin ellas, para la interfaz). No escribe nada.
pub fn inspect(bytes: &[u8], password: &str) -> Result<(Pending, Preview), String> {
    let plain = open_bundle(password, bytes)?;
    let mut payload: Payload = serde_json::from_slice(&plain).map_err(|_| BAD_CONTENT.to_string())?;
    if payload.format != PAYLOAD_FORMAT || payload.version != u32::from(Header::decode(bytes)?.version) {
        return Err(BAD_CONTENT.into());
    }
    let mut warnings = Vec::new();
    if payload.sessions.len() > MAX_SESSIONS {
        warnings.push(format!("El archivo trae más de {MAX_SESSIONS} sesiones: se leen las primeras"));
    }
    let mut sessions = Vec::new();
    for (i, v) in std::mem::take(&mut payload.sessions).into_iter().take(MAX_SESSIONS).enumerate() {
        match serde_json::from_value::<Session>(v) {
            Ok(s) => {
                if let Some((bundle_id, session, extras)) = clean_session(s, i, &mut warnings) {
                    if sessions.iter().any(|b: &BundleSession| b.bundle_id == bundle_id) {
                        warnings.push(format!("{}: id repetido en el archivo, se omite", session.name));
                        continue;
                    }
                    sessions.push(BundleSession { bundle_id, session, extras });
                }
            }
            Err(_) => warnings.push(format!("Sesión {} con formato inválido, se omite", i + 1)),
        }
    }
    let mut secrets = payload.secrets.take().unwrap_or_default();
    // Contraseñas que la bóveda no aceptaría, o de sesiones descartadas: no se ofrecen. Las que se
    // descartan se borran de memoria (los vecinos lo hacen al soltarse, ver `HopSecret`).
    secrets.sessions.retain(|id, pw| {
        let keep = pw_ok(pw) && sessions.iter().any(|b| &b.bundle_id == id);
        if !keep {
            pw.zeroize();
        }
        keep
    });
    secrets.hops.retain(|h| pw_ok(&h.pw) && crate::credentials::hop_key(&h.ip, &h.user).is_ok());
    secrets.snmp.retain(|id, v| {
        let keep = crate::snmp::check_profile(id).is_ok() && v.len() <= 4096 && serde_json::from_str::<Value>(v).is_ok_and(|j| j.is_object());
        if !keep {
            v.zeroize();
        }
        keep
    });
    let (settings, ignored_settings) = match payload.settings.take() {
        Some(s) => {
            let (clean, dropped) = filter_settings(&s);
            (Some(clean), dropped)
        }
        None => (None, Vec::new()),
    };
    let token: String = random::<16>().iter().map(|b| format!("{b:02x}")).collect();
    let preview = Preview {
        token: token.clone(),
        app: clean_text(&payload.app, 32),
        created: clean_text(&payload.created, 40),
        sessions: sessions.iter().map(|b| Session { id: b.bundle_id.clone(), ..b.session.clone() }).collect(),
        advanced: sessions.iter().enumerate().filter(|(_, b)| b.extras.any()).map(|(i, _)| i).collect(),
        extras: sessions
            .iter()
            .enumerate()
            .filter(|(_, b)| b.extras.any())
            .map(|(index, b)| ExtrasView {
                index,
                ssh_args: b.extras.ssh_args.clone(),
                tunnels: b.extras.tunnels.clone(),
                on_connect: b.extras.on_connect.clone(),
                legacy_ssh: b.extras.legacy_ssh,
            })
            .collect(),
        with_password: sessions.iter().enumerate().filter(|(_, b)| secrets.sessions.contains_key(&b.bundle_id)).map(|(i, _)| i).collect(),
        folders: payload.folders.iter().filter_map(|f| folder_from_path(f)).take(MAX_FOLDERS).collect(),
        settings,
        ignored_settings,
        macros: payload.macros.as_deref().map(clean_macros),
        packs: payload.packs.as_deref().map(|p| objects(p, MAX_PACKS)),
        notes: payload.notes.as_deref().map(clean_notes),
        highlight: payload.highlight.as_deref().map(|r| objects(r, MAX_RULES)),
        passwords: PasswordCounts { sessions: secrets.sessions.len(), hops: secrets.hops.len(), snmp: secrets.snmp.len() },
        hops: secrets.hops.iter().map(|h| (h.ip.clone(), h.user.clone())).collect(),
        snmp_profiles: secrets.snmp.keys().cloned().collect(),
        warnings,
    };
    Ok((Pending { token, created: Instant::now(), created_wall: SystemTime::now(), sessions, secrets }, preview))
}

/// Vista previa pendiente (una a la vez). Vence a los 15 minutos.
#[derive(Default)]
pub struct PendingSlot(Mutex<Option<Pending>>);

impl PendingSlot {
    fn slot(&self) -> std::sync::MutexGuard<'_, Option<Pending>> {
        self.0.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn put(&self, p: Pending) {
        *self.slot() = Some(p);
    }

    /// Saca la vista previa con ese token si sigue vigente (si no, la descarta igual).
    pub fn take(&self, token: &str) -> Option<Pending> {
        let mut g = self.slot();
        let ok = g.as_ref().is_some_and(|p| p.token == token && !p.expired());
        if ok {
            g.take()
        } else {
            if g.as_ref().is_some_and(Pending::expired) {
                *g = None;
            }
            None
        }
    }

    /// Paso del temporizador: borra la vista previa con ese token si venció. true mientras siga
    /// pendiente (hay que volver a revisar); false si ya no está (aplicada, cancelada, vencida u otra).
    pub fn sweep(&self, token: &str) -> bool {
        let mut g = self.slot();
        match g.as_ref() {
            Some(p) if p.token == token && p.expired() => {
                *g = None;
                false
            }
            Some(p) => p.token == token,
            None => false,
        }
    }

    /// Devuelve una vista previa que no se alcanzó a aplicar (p. ej. faltaba desbloquear la bóveda).
    pub fn restore(&self, p: Pending) {
        let mut g = self.slot();
        if g.is_none() {
            *g = Some(p);
        }
    }

    pub fn clear(&self) {
        *self.slot() = None;
    }

    #[cfg(test)]
    pub fn is_empty(&self) -> bool {
        self.slot().is_none()
    }
}

#[derive(Deserialize, Debug)]
pub struct FreshItem {
    pub index: usize,
    /// Carpeta final (ya con la carpeta de destino elegida).
    #[serde(default)]
    pub folder: Option<String>,
}

#[derive(Deserialize, Debug)]
pub struct UpdateItem {
    pub index: usize,
    /// Sesión existente con los datos de conexión del archivo (`mergeImported` de la interfaz).
    pub session: Session,
}

#[derive(Deserialize, Default, Debug)]
#[serde(default)]
pub struct ApplyOpts {
    /// Importar también comandos al conectar, túneles, argumentos extra y SSH legacy (validados).
    pub advanced: bool,
    pub passwords: bool,
    pub hops: bool,
    /// Perfiles SNMP que la interfaz efectivamente importa con los ajustes.
    pub snmp_profiles: Vec<String>,
}

#[derive(Serialize, Debug)]
pub struct ApplyResult {
    pub sessions: Vec<Session>,
    pub added: usize,
    pub updated: usize,
    pub passwords: ImportCounts,
    pub warnings: Vec<String>,
}

/// Aplica lo confirmado: agrega las sesiones nuevas, actualiza las existentes y guarda en la
/// bóveda solo las contraseñas de lo efectivamente importado (sesiones con el mismo destino que en
/// el archivo, perfiles SNMP importados y vecinos si se pidió). `save_password` se activa solo en
/// las sesiones que recibieron su contraseña. Si se piden contraseñas y la bóveda no se puede usar,
/// no se escribe nada (Err con la vista previa intacta para quien llama).
pub fn apply(p: &Pending, store: &SessionStore, creds: &Credentials, fresh: &[FreshItem], updates: &[UpdateItem], opts: &ApplyOpts) -> Result<ApplyResult, String> {
    let mut warnings = Vec::new();
    let want_pw = (opts.passwords && !p.secrets.sessions.is_empty())
        || (opts.hops && !p.secrets.hops.is_empty())
        || opts.snmp_profiles.iter().any(|id| p.secrets.snmp.contains_key(id));
    // La llave se toma una sola vez, antes de escribir nada: si el bloqueo automático vence a mitad
    // del flujo, las sesiones ya importadas reciben igual sus contraseñas.
    let hold = if want_pw {
        match creds.hold(true) {
            Ok(Some(h)) => Some(h),
            _ => return Err(VAULT_NEEDED.into()),
        }
    } else {
        None
    };

    // Actualizaciones de sesiones existentes.
    let mut upd: Vec<(usize, Session)> = Vec::new();
    for u in updates {
        if p.sessions.get(u.index).is_none() || crate::credentials::reserved_id(&u.session.id) || u.session.session_type == SessionType::Local {
            continue;
        }
        let Some(before) = store.get(&u.session.id) else { continue };
        // Cambió el destino: la contraseña guardada no sigue al host nuevo.
        if before.save_password == Some(true) && u.session.save_password != Some(true) {
            let _ = creds.delete(&before.id);
        }
        upd.push((u.index, u.session.clone()));
    }
    if !upd.is_empty() {
        store.update_many(upd.iter().map(|(_, s)| s.clone()).collect())?;
    }

    // Sesiones nuevas (ids nuevos los asigna el almacén).
    let mut new_list: Vec<(usize, Session)> = Vec::new();
    for f in fresh {
        let Some(b) = p.sessions.get(f.index) else { continue };
        let mut s = if opts.advanced { with_extras(b.session.clone(), &b.extras) } else { b.session.clone() };
        s.folder = f.folder.as_deref().and_then(folder_from_path);
        new_list.push((f.index, s));
    }
    let added: Vec<Session> = if new_list.is_empty() {
        Vec::new()
    } else {
        let n = new_list.len();
        let all = store.add_many(new_list.iter().map(|(_, s)| s.clone()).collect())?;
        all[all.len().saturating_sub(n)..].to_vec()
    };

    // Contraseñas: solo de lo importado y hacia el mismo destino.
    let mut pw_sessions: Vec<(String, Zeroizing<String>)> = Vec::new();
    if opts.passwords {
        for ((idx, _), s) in new_list.iter().zip(&added) {
            let b = &p.sessions[*idx];
            if let Some(pw) = p.secrets.sessions.get(&b.bundle_id) {
                pw_sessions.push((s.id.clone(), Zeroizing::new(pw.clone())));
            }
        }
        for (idx, s) in &upd {
            let b = &p.sessions[*idx];
            let Some(pw) = p.secrets.sessions.get(&b.bundle_id) else { continue };
            match store.get(&s.id) {
                Some(now) if same_target(&now, &b.session, &b.extras) => pw_sessions.push((now.id.clone(), Zeroizing::new(pw.clone()))),
                _ => warnings.push(format!("{}: el destino no coincide con el del archivo, no se guarda su contraseña", s.name)),
            }
        }
    }
    let snmp: Vec<(String, Zeroizing<String>)> = opts
        .snmp_profiles
        .iter()
        .filter_map(|id| p.secrets.snmp.get(id).map(|v| (id.clone(), Zeroizing::new(v.clone()))))
        .collect();
    let hops: Vec<(String, String, Zeroizing<String>)> =
        if opts.hops { p.secrets.hops.iter().map(|h| (h.ip.clone(), h.user.clone(), Zeroizing::new(h.pw.clone()))).collect() } else { Vec::new() };
    // Con sessions.json dañado o restaurado no se limpian "huérfanas": pueden ser las de las sesiones que faltan.
    let valid = store.trusted().then(|| store.ids());
    let counts = match &hold {
        Some(h) => creds.import_entries(h, &pw_sessions, &snmp, &hops, valid.as_deref())?,
        None => ImportCounts::default(),
    };
    if counts.skipped > 0 {
        warnings.push(format!("{} contraseñas no se guardaron (valor no válido o tope de 100 vecinos)", counts.skipped));
    }
    // `save_password` solo en las sesiones que recibieron su contraseña.
    if !pw_sessions.is_empty() {
        let marked: Vec<Session> = pw_sessions
            .iter()
            .filter_map(|(id, _)| store.get(id))
            .map(|mut s| {
                s.save_password = Some(true);
                s
            })
            .collect();
        store.update_many(marked)?;
    }
    Ok(ApplyResult { sessions: store.list(), added: added.len(), updated: upd.len(), passwords: counts, warnings })
}

// ---------- Comandos ----------

/// Agrega `.ntx` si el nombre elegido no lo trae.
fn with_ntx(path: PathBuf) -> PathBuf {
    if path.extension().and_then(|e| e.to_str()).is_some_and(|e| e.eq_ignore_ascii_case("ntx")) {
        return path;
    }
    let mut s = path.into_os_string();
    s.push(".ntx");
    PathBuf::from(s)
}

/// Ruta real de `p` (si no existe, la de su carpeta más el nombre): para compararla con la carpeta
/// protegida aunque haya enlaces simbólicos o `..` en el camino.
fn real_path(p: &Path) -> Option<PathBuf> {
    if let Ok(c) = p.canonicalize() {
        return Some(c);
    }
    Some(p.parent()?.canonicalize().ok()?.join(p.file_name()?))
}

/// Destino válido para un `.ntx`: ruta absoluta que termina en `.ntx`, no es carpeta y no queda dentro
/// de la carpeta de datos (que incluye la que sirven TFTP, HTTP y FTP, los respaldos y las notas): un
/// archivo con contraseñas no debe quedar descargable por un equipo de la red.
pub fn check_dest(path: &Path, data_dir: &Path) -> Result<PathBuf, String> {
    let ext_ok = path.extension().and_then(|e| e.to_str()).is_some_and(|e| e.eq_ignore_ascii_case("ntx"));
    if !path.is_absolute() || !ext_ok {
        return Err("El archivo debe terminar en .ntx".into());
    }
    if path.is_dir() {
        return Err("Elige un archivo, no una carpeta".into());
    }
    let real = real_path(path).ok_or("La carpeta de destino no existe")?;
    let data = data_dir.canonicalize().unwrap_or_else(|_| data_dir.to_path_buf());
    if real.starts_with(&data) || path.starts_with(data_dir) {
        return Err(format!(
            "No se puede guardar dentro de la carpeta de datos de NetTerminal ({}): sus archivos los sirven TFTP, HTTP y FTP. Elige otra carpeta.",
            data_dir.display()
        ));
    }
    Ok(path.to_path_buf())
}

/// Destino de una exportación en claro (log o respaldo descifrado, elegido en el diálogo nativo):
/// ruta absoluta, no una carpeta, fuera de la carpeta de datos (la sirven TFTP, HTTP y FTP) y fuera
/// de cualquier carpeta cifrada (ahí un archivo en claro sería un "claro encontrado").
pub fn check_export_dest(path: &Path, data_dir: &Path) -> Result<(), String> {
    if !path.is_absolute() || path.is_dir() {
        return Err("Elige un archivo de destino".into());
    }
    let real = real_path(path).ok_or("La carpeta de destino no existe")?;
    let data = data_dir.canonicalize().unwrap_or_else(|_| data_dir.to_path_buf());
    if real.starts_with(&data) || path.starts_with(data_dir) || crate::datacrypt::shared_for(&real).is_some() {
        return Err(format!(
            "No se puede guardar en la carpeta de datos de NetTerminal ({}) ni en una carpeta cifrada: elige otra carpeta.",
            data_dir.display()
        ));
    }
    Ok(())
}

/// Texto de la confirmación nativa de una exportación con contraseñas.
pub fn confirm_text(p: &PasswordCounts, path: &Path, master: bool) -> String {
    let total = p.sessions + p.hops + p.snmp;
    let mut parts = Vec::new();
    for (n, one, many) in [(p.sessions, "de sesión", "de sesiones"), (p.hops, "de vecino", "de vecinos"), (p.snmp, "de perfil SNMP", "de perfiles SNMP")] {
        if n > 0 {
            parts.push(format!("{n} {}", if n == 1 { one } else { many }));
        }
    }
    let detail = if parts.is_empty() { "no se encontró ninguna".to_string() } else { parts.join(", ") };
    let factor = if master {
        "La contraseña maestra ya se verificó."
    } else {
        "La bóveda usa el llavero del sistema: no hay contraseña maestra que pedir. Confirma solo si tú iniciaste esta exportación."
    };
    format!(
        "Se van a escribir {total} {} ({detail}) en:\n\n{}\n\nQuien tenga el archivo y su contraseña podrá usarlas. {factor}",
        if total == 1 { "contraseña guardada" } else { "contraseñas guardadas" },
        path.display()
    )
}

/// Exporta un `.ntx`. Sin contraseñas, el destino lo elige la interfaz (`dest`). Con contraseñas,
/// `dest` se ignora: Rust abre el diálogo de guardado y luego una confirmación nativa (Cancelar
/// primero, el que toma Enter) con cuántas contraseñas de cada tipo y la ruta. Una llamada directa
/// por IPC no puede escribirlas en otra parte ni sin que el usuario lo vea. `password`: la del
/// archivo; `master`: la maestra, solo si se incluyen contraseñas con una bóveda de contraseña maestra.
#[tauri::command(async)]
pub fn bundle_export(
    dest: Option<String>,
    password: String,
    master: Option<String>,
    opts: ExportOpts,
    app: tauri::AppHandle,
    state: tauri::State<'_, crate::AppState>,
) -> Result<Summary, String> {
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind, MessageDialogResult};
    let password = Zeroizing::new(password);
    let master = master.map(Zeroizing::new);
    check_password(&password)?;
    let with_pw = opts.passwords.as_ref().is_some_and(|p| p.sessions || p.snmp || !p.hops.is_empty());
    let chosen = if with_pw {
        let picked = app
            .dialog()
            .file()
            .set_title("Guardar archivo cifrado con contraseñas")
            .add_filter("Archivo cifrado de NetTerminal", &["ntx"])
            .set_file_name("netterminal.ntx")
            .blocking_save_file();
        let Some(file) = picked else { return Err(EXPORT_CANCELLED.into()) };
        with_ntx(file.into_path().map_err(|e| e.to_string())?)
    } else {
        PathBuf::from(dest.unwrap_or_default().trim())
    };
    let path = check_dest(&chosen, &state.data_dir)?;
    let notes_dir = state.data_dir.join("notes");
    let notes = if opts.notes {
        crate::notes::list(&notes_dir)
            .into_iter()
            .filter(|n| !n.protected)
            .filter_map(|n| crate::notes::read(&notes_dir, &n.name).ok().map(|content| NoteItem { name: n.name, content }))
            .collect()
    } else {
        Vec::new()
    };
    let src = Sources {
        sessions: state.store.list(),
        settings: state.files.peek_settings(),
        packs: if opts.packs { crate::cmdpacks::list(&state.data_dir) } else { Vec::new() },
        notes,
        creds: &state.creds,
    };
    let (plain, mut sum) = build_payload(src, &opts, master.as_ref().map(|m| m.as_str()))?;
    if with_pw {
        let answer = app
            .dialog()
            .message(confirm_text(&sum.passwords, &path, state.creds.is_master()))
            .title("¿Exportar contraseñas?")
            .kind(MessageDialogKind::Warning)
            .buttons(MessageDialogButtons::OkCancelCustom(BTN_CANCEL.into(), BTN_EXPORT.into()))
            .blocking_show_with_result();
        if answer != MessageDialogResult::Custom(BTN_EXPORT.into()) {
            return Err(EXPORT_CANCELLED.into());
        }
    }
    let out = seal_bundle(&password, &plain, BUNDLE_KDF)?;
    sum.bytes = out.len();
    seal::write_atomic(&path, &out)?;
    sum.path = path.display().to_string();
    Ok(sum)
}

/// Abre un `.ntx` y devuelve la vista previa (sin contraseñas). No escribe nada.
#[tauri::command(async)]
pub fn bundle_inspect(path: String, password: String, app: tauri::AppHandle, state: tauri::State<'_, crate::AppState>) -> Result<Preview, String> {
    use tauri::Manager;
    let password = Zeroizing::new(password);
    state.bundle.clear();
    let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    if !meta.is_file() {
        return Err(BAD_FILE.into());
    }
    if meta.len() > MAX_FILE as u64 {
        return Err("El archivo supera 32 MB".into());
    }
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let (pending, preview) = inspect(&bytes, &password)?;
    state.bundle.put(pending);
    // Temporizador: la vista previa (con las contraseñas descifradas) se borra al vencer aunque nadie
    // la consulte; el hilo termina en cuanto deja de estar pendiente.
    let token = preview.token.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(PENDING_SWEEP);
        if !app.state::<crate::AppState>().bundle.sweep(&token) {
            break;
        }
    });
    Ok(preview)
}

/// Aplica la importación confirmada en la vista previa. Avisa `creds-changed` si guardó contraseñas.
#[tauri::command(async)]
pub fn bundle_import_apply(
    token: String,
    fresh: Vec<FreshItem>,
    updates: Vec<UpdateItem>,
    opts: ApplyOpts,
    app: tauri::AppHandle,
    state: tauri::State<'_, crate::AppState>,
) -> Result<ApplyResult, String> {
    use tauri::Emitter;
    let pending = state.bundle.take(&token).ok_or("La vista previa venció: vuelve a abrir el archivo")?;
    match apply(&pending, &state.store, &state.creds, &fresh, &updates, &opts) {
        Ok(r) => {
            let total = r.passwords.sessions + r.passwords.snmp + r.passwords.hops;
            if total > 0 {
                let _ = app.emit("creds-changed", ());
            }
            Ok(r)
        }
        Err(e) if e == VAULT_NEEDED => {
            // Nada se escribió: la vista previa sigue disponible para desbloquear e intentar de nuevo.
            state.bundle.restore(pending);
            Err(e)
        }
        Err(e) => Err(e),
    }
}

#[tauri::command]
pub fn bundle_import_cancel(state: tauri::State<'_, crate::AppState>) {
    state.bundle.clear();
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::credentials::{KeyStore, LOCKED};
    use serde_json::json;
    use std::path::{Path, PathBuf};

    const FAST: Kdf = Kdf { m: 64, t: 1, p: 1 };
    const PW: &str = "archivo-de-prueba-1";

    #[derive(Default, Clone)]
    struct MemKeys(std::sync::Arc<Mutex<Option<Vec<u8>>>>);
    impl KeyStore for MemKeys {
        fn get(&self) -> Result<Option<Zeroizing<Vec<u8>>>, String> {
            Ok(self.0.lock().unwrap().clone().map(Zeroizing::new))
        }
        fn set(&self, key: &[u8]) -> Result<(), String> {
            *self.0.lock().unwrap() = Some(key.to_vec());
            Ok(())
        }
        fn delete(&self) -> Result<(), String> {
            *self.0.lock().unwrap() = None;
            Ok(())
        }
    }

    fn dir() -> PathBuf {
        let d = std::env::temp_dir().join(format!("nt-bundle-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    fn master_creds(d: &Path) -> Credentials {
        let c = Credentials::with(d, true, Box::new(MemKeys::default()), FAST);
        c.create("maestra-larga").unwrap();
        c
    }

    fn sess(id: &str, name: &str, host: &str, folder: &str) -> Session {
        serde_json::from_value(json!({"id": id, "name": name, "type": "ssh", "host": host, "username": "noc", "folder": folder, "created_at": ""})).unwrap()
    }

    /// Origen con dos sesiones con contraseña, una sin, un vecino y un perfil SNMP.
    fn source(d: &Path) -> (SessionStore, Credentials) {
        let store = SessionStore::new(d);
        let creds = master_creds(d);
        for (name, host, folder, pw) in [("core-sw01", "192.0.2.1", "Core", Some("Cl4ve-Core-01")), ("dist-sw01", "192.0.2.11", "Dist", Some("Cl4ve-Dist-11")), ("lab", "192.0.2.99", "Lab", None)] {
            let mut s = store.save(sess("", name, host, folder)).unwrap();
            if let Some(pw) = pw {
                creds.set(&s.id, pw, &store.ids()).unwrap();
                s.save_password = Some(true);
                store.save(s).unwrap();
            }
        }
        creds.hop_set("192.0.2.12", "noc", "V3cino-Cl4ve").unwrap();
        creds.hop_set("192.0.2.13", "admin", "Otro-V3cino").unwrap();
        creds.set("snmp:p1", r#"{"host":"192.0.2.1","port":161,"community":"c0mmunity-x"}"#, &store.ids()).unwrap();
        (store, creds)
    }

    fn settings() -> Map<String, Value> {
        json!({
            "fontSize": 15, "appTheme": "dark", "mcpToken": "00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff", "mcpEnabled": true,
            "mcpReadOnly": false, "tftpPort": 69, "autoLegacySsh": true, "logsDir": "/Users/x/logs", "logMask": false, "confirmSend": true,
            "macros": [{"id": "m1", "label": "Interfaces", "kind": "send", "text": "show ip interface brief"}, {"id": "", "label": "x", "kind": "send"}],
            "customRules": [{"id": "r1", "name": "err", "pattern": "error", "style": {"fg": "red"}}],
            "extraFolders": ["Core/Vacía", "Otra"], "snmpProfiles": [{"id": "p1", "name": "core", "host": "192.0.2.1", "saved": true}],
            "monitors": [{"id": "x", "active": true}], "vaultAutoLockMin": 0, "schemaVersion": 1, "__topoStore": true
        })
        .as_object()
        .unwrap()
        .clone()
    }

    fn src<'a>(store: &SessionStore, creds: &'a Credentials) -> Sources<'a> {
        Sources { sessions: store.list(), settings: Some(settings()), packs: vec![json!({"id": "user-cisco", "name": "Mis"})], notes: vec![NoteItem { name: "nota".into(), content: "hola".into() }], creds }
    }

    fn all_opts(passwords: bool) -> ExportOpts {
        ExportOpts {
            all_sessions: true,
            settings: true,
            macros: true,
            packs: true,
            notes: true,
            highlight: true,
            passwords: passwords.then(|| PasswordOpts {
                sessions: true,
                hops: vec![HopRef { ip: "192.0.2.12".into(), user: "noc".into() }],
                snmp: true,
                confirm: CONFIRM_WORD.into(),
            }),
            ..Default::default()
        }
    }

    fn contains(hay: &[u8], needle: &str) -> bool {
        hay.windows(needle.len()).any(|w| w == needle.as_bytes())
    }

    #[test]
    fn header_layout_and_kdf_defaults() {
        assert_eq!(HEADER_LEN, 62);
        assert_eq!(BUNDLE_KDF, Kdf { m: 262_144, t: 3, p: 1 });
        let out = seal_bundle(PW, b"{}", FAST).unwrap();
        assert_eq!(&out[..10], b"NTBUNDLE\x01\x01");
        assert_eq!(Kdf::decode(&out[10..22]), FAST);
        assert_eq!(out.len(), HEADER_LEN + 2 + TAG_LEN);
        // Sal y nonce distintos en cada archivo.
        let other = seal_bundle(PW, b"{}", FAST).unwrap();
        assert_ne!(&out[22..62], &other[22..62]);
        assert_eq!(open_bundle(PW, &out).unwrap().as_slice(), b"{}");
        // Contraseña corta, con salto de línea o vacía: no se cifra.
        assert!(seal_bundle("corta", b"{}", FAST).is_err());
        assert!(seal_bundle("doce-caracte\nres", b"{}", FAST).is_err());
        assert!(check_password("ñandú-ñandú-ñ").is_ok(), "se cuentan caracteres, no bytes");
    }

    #[test]
    fn roundtrip_without_passwords_excludes_sensitive_settings() {
        let d = dir();
        let (store, creds) = source(&d);
        let (plain, sum) = build_payload(src(&store, &creds), &all_opts(false), None).unwrap();
        assert_eq!(sum.sessions, 3);
        assert_eq!(sum.passwords, PasswordCounts::default());
        let file = seal_bundle(PW, &plain, FAST).unwrap();
        for secret in ["Cl4ve-Core-01", "V3cino-Cl4ve", "c0mmunity-x", "00ff00ff00ff", "/Users/x/logs", "mcpEnabled"] {
            assert!(!contains(&file, secret), "{secret} en el archivo");
            assert!(!contains(&plain, secret), "{secret} en el contenido");
        }
        let (pending, prev) = inspect(&file, PW).unwrap();
        assert_eq!(prev.sessions.len(), 3);
        assert!(pending.secrets.is_empty());
        let s = prev.settings.unwrap();
        assert_eq!(s["fontSize"], 15);
        for k in SETTINGS_EXCLUDED.iter().chain(["schemaVersion", "__topoStore", "logMask"].iter()) {
            assert!(!s.contains_key(*k), "{k} no debe viajar");
        }
        assert_eq!(s["confirmSend"], true, "una protección encendida sí viaja");
        assert_eq!(prev.macros.unwrap().len(), 1, "botón sin id descartado");
        assert_eq!(prev.highlight.unwrap().len(), 1);
        assert_eq!(prev.notes.unwrap()[0].content, "hola");
        assert_eq!(prev.folders, vec!["Core/Vacía", "Otra"]);
        std::fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn roundtrip_with_passwords_only_for_included_items() {
        let d = dir();
        let (store, creds) = source(&d);
        let core = store.list().into_iter().find(|s| s.name == "core-sw01").unwrap();
        let mut opts = all_opts(true);
        opts.all_sessions = false;
        opts.session_ids = vec![core.id.clone()];
        // Sin la palabra de confirmación, o sin la maestra, no se exportan contraseñas.
        let mut bad = all_opts(true);
        bad.passwords.as_mut().unwrap().confirm = "exportar".into();
        assert!(build_payload(src(&store, &creds), &bad, Some("maestra-larga")).unwrap_err().contains(CONFIRM_WORD));
        assert!(build_payload(src(&store, &creds), &opts, Some("otra-maestra")).unwrap_err().contains("incorrecta"));
        creds.lock();
        assert_eq!(build_payload(src(&store, &creds), &opts, Some("maestra-larga")).unwrap_err(), LOCKED);
        creds.unlock("maestra-larga").ok();
        // La espera tras el intento fallido: se reintenta tras ella.
        let (plain, sum) = loop {
            match build_payload(src(&store, &creds), &opts, Some("maestra-larga")) {
                Err(e) if e.contains("Espera") || e == LOCKED => {
                    std::thread::sleep(Duration::from_millis(300));
                    let _ = creds.unlock("maestra-larga");
                }
                r => break r.unwrap(),
            }
        };
        assert_eq!(sum.sessions, 1);
        assert_eq!(sum.passwords, PasswordCounts { sessions: 1, hops: 1, snmp: 1 });
        let file = seal_bundle(PW, &plain, FAST).unwrap();
        // Las contraseñas no están en claro en el archivo (búsqueda de bytes).
        for secret in ["Cl4ve-Core-01", "V3cino-Cl4ve", "c0mmunity-x"] {
            assert!(!contains(&file, secret), "{secret}");
        }
        assert!(!contains(&plain, "Cl4ve-Dist-11"), "sesión no incluida");
        assert!(!contains(&plain, "Otro-V3cino"), "vecino no elegido");

        // Importa en otro equipo (bóveda con contraseña maestra desbloqueada).
        let d2 = dir();
        let store2 = SessionStore::new(&d2);
        let creds2 = master_creds(&d2);
        let (pending, prev) = inspect(&file, PW).unwrap();
        assert_eq!(prev.with_password, vec![0]);
        assert_eq!(prev.passwords, PasswordCounts { sessions: 1, hops: 1, snmp: 1 });
        assert!(!format!("{prev:?}").contains("Cl4ve"), "la vista previa no trae contraseñas");
        let r = apply(
            &pending,
            &store2,
            &creds2,
            &[FreshItem { index: 0, folder: Some("Restaurado/Core".into()) }],
            &[],
            &ApplyOpts { passwords: true, hops: true, snmp_profiles: vec!["p1".into()], ..Default::default() },
        )
        .unwrap();
        assert_eq!(r.added, 1);
        assert_eq!(r.passwords, ImportCounts { sessions: 1, snmp: 1, hops: 1, skipped: 0 });
        let s = r.sessions.iter().find(|s| s.name == "core-sw01").unwrap();
        assert_eq!(s.save_password, Some(true));
        assert_eq!(s.folder.as_deref(), Some("Restaurado/Core"));
        assert_eq!(creds2.get(&s.id).as_deref().map(|x| x.as_str()), Some("Cl4ve-Core-01"));
        assert_eq!(creds2.hop_get("192.0.2.12", "noc").as_deref().map(|x| x.as_str()), Some("V3cino-Cl4ve"));
        assert!(creds2.has("snmp:p1").unwrap());
        // Las sesiones sin contraseña importada no quedan con save_password.
        assert!(r.sessions.iter().filter(|x| x.name != "core-sw01").all(|x| x.save_password.is_none()));
        for x in [d, d2] {
            std::fs::remove_dir_all(&x).unwrap();
        }
    }

    #[test]
    fn wrong_password_tampered_truncated_and_future_version() {
        let file = seal_bundle(PW, br#"{"format":"netterminal-bundle","version":1}"#, FAST).unwrap();
        assert_eq!(open_bundle("otra-contraseña-1", &file).unwrap_err(), WRONG);
        // Cualquier byte alterado (cabecera autenticada incluida) o el archivo truncado: mismo error.
        for i in [9 + 3, 25, 40, HEADER_LEN, file.len() - 1] {
            let mut bad = file.clone();
            bad[i] ^= 1;
            let e = open_bundle(PW, &bad).unwrap_err();
            assert!(e == WRONG || e == BAD_FILE, "byte {i}: {e}");
        }
        assert_eq!(open_bundle(PW, &file[..file.len() - 1]).unwrap_err(), WRONG);
        assert_eq!(open_bundle(PW, &file[..HEADER_LEN + 3]).unwrap_err(), BAD_FILE);
        assert_eq!(open_bundle(PW, b"NTVAULT\x01").unwrap_err(), BAD_FILE);
        // Versión futura: rechazo claro antes de derivar.
        let mut fut = file.clone();
        fut[8] = 2;
        assert!(open_bundle(PW, &fut).unwrap_err().contains("versión más nueva"));
        // Parámetros absurdos: rechazados sin pedir memoria.
        let mut huge = file.clone();
        huge[10..14].copy_from_slice(&(4 * 1024 * 1024u32).to_le_bytes());
        assert_eq!(open_bundle(PW, &huge).unwrap_err(), BAD_FILE);
        // Contenido que no es del formato: inválido.
        let other = seal_bundle(PW, br#"{"format":"otra-cosa","version":1}"#, FAST).unwrap();
        assert_eq!(inspect(&other, PW).err().as_deref(), Some(BAD_CONTENT));
        let v2 = seal_bundle(PW, br#"{"format":"netterminal-bundle","version":2}"#, FAST).unwrap();
        assert_eq!(inspect(&v2, PW).err().as_deref(), Some(BAD_CONTENT), "versión interna distinta a la de la cabecera");
    }

    #[test]
    fn import_with_locked_vault_writes_nothing() {
        let d = dir();
        let (store, creds) = source(&d);
        let (plain, _) = build_payload(src(&store, &creds), &all_opts(true), Some("maestra-larga")).unwrap();
        let file = seal_bundle(PW, &plain, FAST).unwrap();
        let d2 = dir();
        let store2 = SessionStore::new(&d2);
        let before = store2.list().len();
        let creds2 = master_creds(&d2);
        creds2.lock();
        let (pending, _) = inspect(&file, PW).unwrap();
        let fresh: Vec<FreshItem> = (0..3).map(|index| FreshItem { index, folder: None }).collect();
        let opts = ApplyOpts { passwords: true, ..Default::default() };
        assert_eq!(apply(&pending, &store2, &creds2, &fresh, &[], &opts).unwrap_err(), VAULT_NEEDED);
        assert_eq!(store2.list().len(), before, "nada escrito");
        // Sin contraseñas sí se importa, y ninguna sesión queda con save_password.
        let r = apply(&pending, &store2, &creds2, &fresh, &[], &ApplyOpts::default()).unwrap();
        assert_eq!(r.added, 3);
        assert!(r.sessions.iter().all(|s| s.save_password.is_none()));
        // Sin bóveda creada (modo contraseña maestra), igual.
        let d3 = dir();
        let creds3 = Credentials::with(&d3, true, Box::new(MemKeys::default()), FAST);
        let store3 = SessionStore::new(&d3);
        assert_eq!(apply(&pending, &store3, &creds3, &fresh, &[], &opts).unwrap_err(), VAULT_NEEDED);
        // Con llavero sin bóveda: se crea sola.
        let d4 = dir();
        let creds4 = Credentials::with(&d4, false, Box::new(MemKeys::default()), FAST);
        let store4 = SessionStore::new(&d4);
        let r4 = apply(&pending, &store4, &creds4, &fresh, &[], &opts).unwrap();
        assert_eq!(r4.passwords.sessions, 2);
        for x in [d, d2, d3, d4] {
            std::fs::remove_dir_all(&x).unwrap();
        }
    }

    #[test]
    fn update_that_retargets_drops_password_and_keeps_bundle_password_off() {
        let d = dir();
        let (store, creds) = source(&d);
        let (plain, _) = build_payload(src(&store, &creds), &all_opts(true), Some("maestra-larga")).unwrap();
        let file = seal_bundle(PW, &plain, FAST).unwrap();
        // Destino: ya existe core-sw01 (misma carpeta y nombre) con otro host y contraseña propia.
        let d2 = dir();
        let store2 = SessionStore::new(&d2);
        let creds2 = master_creds(&d2);
        let mut local = store2.save(sess("", "core-sw01", "198.51.100.1", "Core")).unwrap();
        creds2.set(&local.id, "local-pw", &store2.ids()).unwrap();
        local.save_password = Some(true);
        let local = store2.save(local).unwrap();
        let (pending, prev) = inspect(&file, PW).unwrap();
        let idx = prev.sessions.iter().position(|s| s.name == "core-sw01").unwrap();
        // La interfaz manda la sesión combinada (cambió el host: sin save_password).
        let mut merged = local.clone();
        merged.host = Some("192.0.2.1".into());
        merged.save_password = None;
        let r = apply(&pending, &store2, &creds2, &[], &[UpdateItem { index: idx, session: merged }], &ApplyOpts { passwords: true, ..Default::default() }).unwrap();
        assert_eq!(r.updated, 1);
        // La contraseña local se borró y entró la del archivo (mismo destino que en el archivo).
        assert_eq!(creds2.get(&local.id).as_deref().map(|x| x.as_str()), Some("Cl4ve-Core-01"));
        // Si el destino final no coincide con el del archivo, no recibe la contraseña.
        let (pending, _) = inspect(&file, PW).unwrap();
        let mut other = store2.get(&local.id).unwrap();
        other.host = Some("203.0.113.5".into());
        other.save_password = None;
        let r = apply(&pending, &store2, &creds2, &[], &[UpdateItem { index: idx, session: other }], &ApplyOpts { passwords: true, ..Default::default() }).unwrap();
        assert!(r.warnings.iter().any(|w| w.contains("no coincide")));
        assert!(creds2.get(&local.id).is_none(), "se borró al cambiar de destino y no se repuso");
        assert_eq!(store2.get(&local.id).unwrap().save_password, None);
        for x in [d, d2] {
            std::fs::remove_dir_all(&x).unwrap();
        }
    }

    #[test]
    fn sessions_are_sanitized_like_importers() {
        let mut w = Vec::new();
        let raw = |v: Value| serde_json::from_value::<Session>(v).unwrap();
        let bad_args = raw(json!({"id": "a", "name": "x", "type": "ssh", "host": "192.0.2.1", "ssh_args": "-oProxyCommand=sh", "on_connect": "conf t\u{1b}[31m\nend", "legacy_ssh": true, "save_password": true, "scp": {"upload": true, "files": [], "remote_dir": "/"}}));
        let (_, s, e) = clean_session(bad_args, 0, &mut w).unwrap();
        assert!(e.ssh_args.is_none() && w.iter().any(|x| x.contains("argumentos extra")));
        assert_eq!(e.on_connect.as_deref(), Some("conf t[31m\nend"), "sin caracteres de control");
        assert_eq!(e.legacy_ssh, Some(true));
        assert!(s.save_password.is_none() && s.scp.is_none() && s.ssh_args.is_none() && s.on_connect.is_none());
        let ok_args = raw(json!({"name": "y", "type": "ssh", "host": "192.0.2.2", "ssh_args": "-A -L 8080:127.0.0.1:80"}));
        assert_eq!(clean_session(ok_args, 1, &mut w).unwrap().2.ssh_args.as_deref(), Some("-A -L 8080:127.0.0.1:80"));
        for host in ["-oProxyCommand=x", "a b", "$(reboot)", ""] {
            assert!(clean_session(raw(json!({"name": "h", "type": "ssh", "host": host})), 2, &mut w).is_none(), "{host}");
        }
        let (_, s, _) = clean_session(raw(json!({"name": "t", "type": "telnet", "host": "192.0.2.3", "username": "noc;reboot", "folder": "A/../B", "jump_host": "x"})), 3, &mut w).unwrap();
        assert!(s.username.is_none() && s.jump_host.is_none());
        assert_eq!(s.folder.as_deref(), Some("A/../B"), "segmentos de carpeta, nunca rutas de disco");
        let (_, s, _) = clean_session(raw(json!({"name": "t", "type": "telnet", "host": "192.0.2.3", "username": "noc"})), 4, &mut w).unwrap();
        assert_eq!(s.username.as_deref(), Some("noc"), "el usuario de Telnet se conserva (autocompletado)");
        assert!(clean_session(raw(json!({"name": "l", "type": "local"})), 5, &mut w).is_none());
        let (id, _, _) = clean_session(raw(json!({"id": "hop:1|x", "name": "r", "type": "ssh", "host": "192.0.2.4"})), 6, &mut w).unwrap();
        assert_eq!(id, "bundle-6", "id reservado de la bóveda");
    }

    #[test]
    fn advanced_fields_only_when_asked() {
        let d = dir();
        let store = SessionStore::new(&d);
        let creds = master_creds(&d);
        let mut s = sess("", "core", "192.0.2.1", "Core");
        s.ssh_args = Some("-A".into());
        s.on_connect = Some("terminal length 0".into());
        store.save(s).unwrap();
        let opts = ExportOpts { all_sessions: true, ..Default::default() };
        let (plain, _) = build_payload(Sources { sessions: store.list(), settings: None, packs: vec![], notes: vec![], creds: &creds }, &opts, None).unwrap();
        let file = seal_bundle(PW, &plain, FAST).unwrap();
        let d2 = dir();
        let store2 = SessionStore::new(&d2);
        let (pending, prev) = inspect(&file, PW).unwrap();
        assert_eq!(prev.advanced, vec![0]);
        assert!(prev.sessions[0].on_connect.is_none(), "la vista previa no trae los extras");
        let r = apply(&pending, &store2, &creds, &[FreshItem { index: 0, folder: None }], &[], &ApplyOpts::default()).unwrap();
        let got = r.sessions.iter().find(|s| s.name == "core").unwrap();
        assert!(got.ssh_args.is_none() && got.on_connect.is_none());
        let r = apply(&pending, &store2, &creds, &[FreshItem { index: 0, folder: None }], &[], &ApplyOpts { advanced: true, ..Default::default() }).unwrap();
        let got = r.sessions.iter().rev().find(|s| s.name == "core").unwrap();
        assert_eq!((got.ssh_args.as_deref(), got.on_connect.as_deref()), (Some("-A"), Some("terminal length 0")));
        for x in [d, d2] {
            std::fs::remove_dir_all(&x).unwrap();
        }
    }

    #[test]
    fn secrets_are_wiped_and_pending_expires() {
        let mut s = Secrets::default();
        s.sessions.insert("a".into(), "Cl4ve".into());
        s.snmp.insert("p".into(), "{}".into());
        s.hops.push(HopSecret { ip: "192.0.2.1".into(), user: "noc".into(), pw: "x".into() });
        s.wipe();
        assert!(s.sessions.values().chain(s.snmp.values()).all(|v| v.is_empty()));
        assert!(s.hops.iter().all(|h| h.pw.is_empty()));
        // Zeroize de un búfer: queda vacío y en ceros.
        let mut buf = Zeroizing::new(b"secreto".to_vec());
        buf.zeroize();
        assert!(buf.is_empty());

        let slot = PendingSlot::default();
        let pending = || Pending { token: "t1".into(), created: Instant::now(), created_wall: SystemTime::now(), sessions: vec![], secrets: Secrets::default() };
        slot.put(pending());
        assert!(slot.take("otro").is_none(), "token distinto");
        assert!(slot.take("t1").is_some());
        assert!(slot.is_empty(), "se consume al aplicar");
        let mut old = pending();
        old.created = Instant::now() - PENDING_TTL - Duration::from_secs(1);
        slot.put(old);
        assert!(slot.take("t1").is_none(), "vencida");
        assert!(slot.is_empty(), "y descartada");
        slot.put(pending());
        slot.clear();
        assert!(slot.is_empty());
    }

    #[test]
    fn filter_settings_never_enables_sensitive_features() {
        let (s, dropped) = filter_settings(&settings());
        for k in ["mcpToken", "mcpEnabled", "mcpReadOnly", "tftpPort", "autoLegacySsh", "logsDir", "monitors", "vaultAutoLockMin", "logMask"] {
            assert!(!s.contains_key(k) && dropped.iter().any(|d| d == k), "{k}");
        }
        assert!(s.contains_key("snmpProfiles") && s.contains_key("fontSize"));
        let (s, _) = filter_settings(json!({"logMask": true, "confirmClose": "no"}).as_object().unwrap());
        assert_eq!(s.get("logMask"), Some(&json!(true)));
        assert!(!s.contains_key("confirmClose"));
        // Servidores abiertos a todas las interfaces sin filtro: nunca desde un archivo.
        let (s, dropped) = filter_settings(
            json!({"serverGuard": {"tftp": {"bind": "0.0.0.0", "allow": "", "idle": 0}}, "disabledPacks": ["builtin-cisco"], "rightClickPaste": true, "copyOnSelect": false, "autoLog": true})
                .as_object()
                .unwrap(),
        );
        for k in ["serverGuard", "disabledPacks", "rightClickPaste", "autoLog"] {
            assert!(!s.contains_key(k) && dropped.iter().any(|d| d == k), "{k}");
        }
        assert_eq!(s.get("copyOnSelect"), Some(&json!(false)), "apagar copiar al seleccionar sí se acepta");
    }

    #[test]
    fn kdf_limits_on_read() {
        let file = seal_bundle(PW, br#"{"format":"netterminal-bundle","version":1}"#, FAST).unwrap();
        let with = |m: u32, t: u32| {
            let mut b = file.clone();
            b[10..14].copy_from_slice(&m.to_le_bytes());
            b[14..18].copy_from_slice(&t.to_le_bytes());
            b
        };
        assert_eq!(open_bundle(PW, &with(256 * 1024 + 1, 3)).unwrap_err(), BAD_FILE, "más de 256 MiB");
        assert_eq!(open_bundle(PW, &with(64, 5)).unwrap_err(), BAD_FILE, "más de 4 pasadas");
        // Dentro del tope: se deriva (y como la cabecera va autenticada, falla como alterado).
        assert_eq!(open_bundle(PW, &with(64, 2)).unwrap_err(), WRONG);
    }

    #[test]
    fn export_destination_and_confirmation_text() {
        let d = dir();
        let data = d.join("data");
        std::fs::create_dir_all(data.join("tftp")).unwrap();
        assert!(check_dest(&d.join("respaldo.ntx"), &data).is_ok());
        for bad in [data.join("tftp").join("x.ntx"), data.join("x.ntx"), d.join("data").join("..").join("data").join("y.ntx")] {
            assert!(check_dest(&bad, &data).unwrap_err().contains("carpeta de datos"), "{}", bad.display());
        }
        assert!(check_dest(&d.join("x.txt"), &data).is_err());
        assert!(check_dest(Path::new("relativo.ntx"), &data).is_err());
        assert!(check_dest(&d.join("no-existe").join("x.ntx"), &data).is_err());
        // Enlace simbólico hacia la carpeta servida: también se rechaza.
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(data.join("tftp"), d.join("atajo")).unwrap();
            assert!(check_dest(&d.join("atajo").join("z.ntx"), &data).is_err());
        }
        assert_eq!(with_ntx(PathBuf::from("/tmp/a")), PathBuf::from("/tmp/a.ntx"));
        assert_eq!(with_ntx(PathBuf::from("/tmp/a.NTX")), PathBuf::from("/tmp/a.NTX"));
        let t = confirm_text(&PasswordCounts { sessions: 3, hops: 1, snmp: 0 }, Path::new("/x/y.ntx"), false);
        assert!(t.contains("4 contraseñas") && t.contains("3 de sesiones") && t.contains("1 de vecino") && t.contains("/x/y.ntx") && t.contains("llavero"), "{t}");
        assert!(!t.contains("SNMP"));
        assert!(confirm_text(&PasswordCounts { sessions: 1, hops: 0, snmp: 0 }, Path::new("/x.ntx"), true).contains("maestra"));
        std::fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn preview_shows_extras_and_pending_sweeps() {
        let d = dir();
        let store = SessionStore::new(&d);
        let creds = master_creds(&d);
        let mut s = sess("", "core", "192.0.2.1", "Core");
        s.ssh_args = Some("-A".into());
        s.on_connect = Some("terminal length 0\nreload".into());
        s.tunnels = Some(vec![serde_json::from_value(json!({"kind": "local", "listen_port": 8443, "dest_host": "192.0.2.10", "dest_port": 443})).unwrap()]);
        store.save(s).unwrap();
        let opts = ExportOpts { all_sessions: true, ..Default::default() };
        let (plain, _) = build_payload(Sources { sessions: store.list(), settings: None, packs: vec![], notes: vec![], creds: &creds }, &opts, None).unwrap();
        let (pending, prev) = inspect(&seal_bundle(PW, &plain, FAST).unwrap(), PW).unwrap();
        let idx = prev.sessions.iter().position(|x| x.name == "core").unwrap();
        let e = prev.extras.iter().find(|e| e.index == idx).expect("extras en la vista previa");
        assert_eq!(e.on_connect.as_deref(), Some("terminal length 0\nreload"));
        assert_eq!(e.ssh_args.as_deref(), Some("-A"));
        assert_eq!(e.tunnels.as_ref().map(Vec::len), Some(1));
        assert!(prev.sessions[idx].on_connect.is_none(), "la sesión de la vista previa sigue sin los extras");
        // El temporizador: sigue mientras está vigente y la borra al vencer.
        let slot = PendingSlot::default();
        let token = pending.token.clone();
        slot.put(pending);
        assert!(slot.sweep(&token));
        assert!(!slot.sweep("otro"));
        let mut old = slot.take(&token).unwrap();
        old.created_wall = SystemTime::now() - PENDING_TTL - Duration::from_secs(1);
        slot.put(old);
        assert!(!slot.sweep(&token), "vencida por hora del sistema (suspensión)");
        assert!(slot.is_empty());
        std::fs::remove_dir_all(&d).unwrap();
    }
}
