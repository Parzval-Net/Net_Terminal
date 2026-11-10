//! Contraseñas guardadas por sesión, en una bóveda cifrada dentro de la carpeta de datos
//! (`credentials.vault`, XChaCha20-Poly1305). La llave de 256 bits vive:
//! - Instalada: en el llavero del sistema (una sola entrada "NetTerminal" / "vault-key").
//!   El archivo copiado a otro equipo no sirve sin ese llavero.
//! - Portable, o sin llavero disponible: derivada de una contraseña maestra con Argon2id.
//!
//! Ninguna función devuelve una contraseña al frontend: solo `get` (uso interno del
//! autocompletado al conectar). La llave queda en memoria en un búfer que se borra al
//! bloquear y al salir.

use crate::datacrypt;
use crate::seal::{self, derive, random, write_atomic, Throttle};
use crate::seal::{Kdf, KDF_DEFAULT};
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime};
use zeroize::{Zeroize, Zeroizing};

const MAGIC: &[u8; 7] = b"NTVAULT";
const VERSION: u8 = 1;
const HEADER_LEN: usize = 7 + 1 + 1 + 12 + 16 + 24;
const MAX_FILE: u64 = 4 * 1024 * 1024;

pub const MAX_PASSWORD: usize = 1024;
const MIN_MASTER: usize = 8;
const MAX_ID: usize = 128;

/// Prefijo de entradas que no son de sesiones (secretos SNMP por perfil). La limpieza de
/// entradas huérfanas al guardar la contraseña de una sesión no las toca.
pub const NS_SNMP: &str = "snmp:";

/// Prefijo de las contraseñas de vecinos alcanzados por salto (Topología): una entrada por
/// equipo y usuario, con clave `hop:<IP>|<usuario>` (IP canónica). El valor es un JSON propio
/// (`{"pw":…,"used":…}`); las bóvedas anteriores no los tienen y se abren igual (el formato del
/// archivo no cambia: es el mismo mapa texto a texto). Tampoco las toca la limpieza de huérfanas.
pub const NS_HOP: &str = "hop:";
/// Tope de vecinos guardados: no es una libreta de contraseñas masiva.
pub const MAX_HOP_ENTRIES: usize = 100;

pub const LOCKED: &str = "La bóveda está bloqueada. Desbloquéala en Ajustes › Credenciales";

#[derive(Clone, Copy, PartialEq, Debug)]
enum Mode {
    /// Llave aleatoria guardada en el llavero del sistema.
    Keyring = 0,
    /// Llave derivada de la contraseña maestra (Argon2id).
    Master = 1,
}

#[derive(Clone, Debug)]
struct Header {
    mode: Mode,
    kdf: Kdf,
    salt: [u8; 16],
    nonce: [u8; 24],
}

impl Header {
    fn encode(&self) -> [u8; HEADER_LEN] {
        let mut h = [0u8; HEADER_LEN];
        h[..7].copy_from_slice(MAGIC);
        h[7] = VERSION;
        h[8] = self.mode as u8;
        self.kdf.encode(&mut h[9..21]);
        h[21..37].copy_from_slice(&self.salt);
        h[37..61].copy_from_slice(&self.nonce);
        h
    }

    fn decode(b: &[u8]) -> Result<Header, String> {
        let bad = || "El archivo de credenciales no es válido".to_string();
        if b.len() < HEADER_LEN + 16 || &b[..7] != MAGIC {
            return Err(bad());
        }
        if b[7] != VERSION {
            return Err("La bóveda es de una versión más nueva de NetTerminal".into());
        }
        let mode = match b[8] {
            0 => Mode::Keyring,
            1 => Mode::Master,
            _ => return Err(bad()),
        };
        let kdf = Kdf::decode(&b[9..21]);
        if mode == Mode::Master && !kdf.sane() {
            return Err(bad());
        }
        let mut salt = [0u8; 16];
        salt.copy_from_slice(&b[21..37]);
        let mut nonce = [0u8; 24];
        nonce.copy_from_slice(&b[37..61]);
        Ok(Header { mode, kdf, salt, nonce })
    }
}

/// Dónde se guarda la llave de la bóveda en modo instalado. Detrás de un trait para
/// probar sin llavero (CI sin sesión gráfica).
pub trait KeyStore: Send + Sync {
    /// Ok(None): no hay llave guardada. Err: llavero no disponible.
    fn get(&self) -> Result<Option<Zeroizing<Vec<u8>>>, String>;
    fn set(&self, key: &[u8]) -> Result<(), String>;
    fn delete(&self) -> Result<(), String>;
}

/// Llavero del sistema: Keychain (macOS), Administrador de credenciales (Windows) o
/// Secret Service (Linux). Sin Secret Service no hay respaldo en archivo: se usa la
/// contraseña maestra.
pub struct OsKeyStore;

#[cfg(any(target_os = "macos", windows, target_os = "linux"))]
impl OsKeyStore {
    fn entry() -> Result<keyring::Entry, String> {
        keyring::Entry::new("NetTerminal", "vault-key").map_err(|e| e.to_string())
    }
}

#[cfg(any(target_os = "macos", windows, target_os = "linux"))]
impl KeyStore for OsKeyStore {
    fn get(&self) -> Result<Option<Zeroizing<Vec<u8>>>, String> {
        match Self::entry()?.get_secret() {
            Ok(k) => Ok(Some(Zeroizing::new(k))),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }
    fn set(&self, key: &[u8]) -> Result<(), String> {
        Self::entry()?.set_secret(key).map_err(|e| e.to_string())
    }
    fn delete(&self) -> Result<(), String> {
        match Self::entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
}

#[cfg(not(any(target_os = "macos", windows, target_os = "linux")))]
impl KeyStore for OsKeyStore {
    fn get(&self) -> Result<Option<Zeroizing<Vec<u8>>>, String> {
        Err("Llavero no disponible".into())
    }
    fn set(&self, _: &[u8]) -> Result<(), String> {
        Err("Llavero no disponible".into())
    }
    fn delete(&self) -> Result<(), String> {
        Ok(())
    }
}

/// Mapa id de sesión -> contraseña, borrado de memoria al soltarse.
#[derive(Default)]
struct Entries(HashMap<String, String>);

impl Drop for Entries {
    fn drop(&mut self) {
        for v in self.0.values_mut() {
            v.zeroize();
        }
    }
}

#[derive(Serialize)]
pub struct Status {
    /// "keychain" (llave en el llavero del sistema) o "vault" (contraseña maestra).
    pub backend: &'static str,
    pub exists: bool,
    pub unlocked: bool,
    pub portable: bool,
}

#[derive(Default)]
struct Inner {
    key: Option<Zeroizing<[u8; 32]>>,
    throttle: Throttle,
    /// La llave en memoria salió de la contraseña maestra (el bloqueo automático solo aplica ahí).
    master: bool,
    /// Último uso de la llave: instante monótono y hora del sistema (para notar una suspensión).
    last_use: Option<(Instant, SystemTime)>,
    auto: AutoLock,
    /// Temporizador del bloqueo automático: generación vigente y si hay uno corriendo.
    timer_gen: u64,
    timer_running: bool,
    /// Último tic del temporizador: hora del sistema y espera pedida (para notar una suspensión).
    last_tick: Option<(SystemTime, Duration)>,
    /// Carpeta cifrada (modo portable cifrado): su DEK se desbloquea y se bloquea junto con la bóveda.
    data: Option<Arc<datacrypt::Shared>>,
}

/// Bloqueo automático de la bóveda con contraseña maestra.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct AutoLock {
    /// Minutos sin usar la bóveda antes de bloquearla (None: apagado).
    pub idle: Option<Duration>,
    /// Bloquear al notar que el equipo estuvo suspendido.
    pub on_sleep: bool,
}

impl AutoLock {
    fn active(&self) -> bool {
        self.idle.is_some() || self.on_sleep
    }
}

/// Tope de la espera del temporizador: un cambio de configuración o un bloqueo manual se notan
/// en a lo más este tiempo, y un hilo de una generación anterior termina en ese plazo.
const TICK_MAX: Duration = Duration::from_secs(30);
/// Diferencia entre la hora del sistema y el reloj monótono (o la espera pedida) que delata una
/// suspensión. Un ajuste del reloj hacia adelante bloquea también (lado seguro).
const SLEEP_SLACK: Duration = Duration::from_secs(60);
pub const AUTOLOCK_MAX_MIN: u32 = 24 * 60;

/// Resultado de un tic del temporizador del bloqueo automático.
#[derive(Debug, PartialEq)]
pub enum Tick {
    /// Volver a evaluar tras esta espera.
    Wait(Duration),
    /// Se bloqueó: avisar a la interfaz (`creds-changed`) y terminar.
    Locked,
    /// Ya no hace falta (bloqueada, opción apagada o hay otro temporizador): terminar.
    Stop,
}

fn since(later: SystemTime, earlier: SystemTime) -> Duration {
    later.duration_since(earlier).unwrap_or(Duration::ZERO)
}

impl Inner {
    /// Hay una llave en memoria: la de la bóveda o la de la carpeta cifrada.
    fn has_key(&self) -> bool {
        self.key.is_some() || self.data.as_ref().is_some_and(|d| d.unlocked())
    }

    /// Borra de memoria la llave de la bóveda y la de la carpeta cifrada (un solo estado de bloqueo).
    fn drop_keys(&mut self) {
        self.key = None;
        if let Some(d) = &self.data {
            d.set_key(None);
        }
    }

    /// Último uso: de la bóveda o, en una carpeta cifrada, de los datos (leer o guardar, y la actividad
    /// en la app que informa la interfaz).
    fn last_used(&self) -> Option<(Instant, SystemTime)> {
        let data = self.data.as_ref().and_then(|d| d.last_use());
        match (self.last_use, data) {
            (Some(a), Some(b)) => Some(if b.0 > a.0 { b } else { a }),
            (a, b) => a.or(b),
        }
    }

    /// La llave venció por inactividad o por una suspensión del equipo.
    fn expired(&self, now: Instant, wall: SystemTime) -> bool {
        if !self.has_key() || !self.master {
            return false;
        }
        let Some((at, at_wall)) = self.last_used() else { return false };
        let mono = now.saturating_duration_since(at);
        let real = since(wall, at_wall);
        if let Some(idle) = self.auto.idle {
            // La hora del sistema cuenta el tiempo suspendido aunque el reloj monótono no lo haga.
            if mono.max(real) >= idle {
                return true;
            }
        }
        self.auto.on_sleep && real > mono + SLEEP_SLACK
    }

    /// Borra la llave si venció (la borra `Zeroizing` al soltarla). true si la borró.
    fn expire(&mut self, now: Instant, wall: SystemTime) -> bool {
        if self.expired(now, wall) {
            self.drop_keys();
            return true;
        }
        false
    }

    fn touch(&mut self) {
        self.last_use = Some((Instant::now(), SystemTime::now()));
    }
}

pub struct Credentials {
    path: PathBuf,
    portable: bool,
    keys: Box<dyn KeyStore>,
    kdf: Kdf,
    /// Disponibilidad del llavero, consultada una sola vez y solo si se usa la función.
    keyring_ok: OnceLock<bool>,
    inner: Mutex<Inner>,
}

fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

fn check_master(master: &str) -> Result<(), String> {
    let n = master.chars().count();
    if n < MIN_MASTER {
        return Err(format!("La contraseña maestra debe tener al menos {MIN_MASTER} caracteres"));
    }
    if master.len() > MAX_PASSWORD {
        return Err("La contraseña maestra es demasiado larga".into());
    }
    Ok(())
}

fn check_id(id: &str) -> Result<(), String> {
    // Las entradas de vecinos solo se tocan con hop_*: un id de sesión con ese prefijo podría
    // leerlas (autocompletado) o pisarlas.
    if id.is_empty() || id.len() > MAX_ID || id.chars().any(|c| c.is_control()) || id.starts_with(NS_HOP) {
        return Err("Sesión inválida".into());
    }
    Ok(())
}

/// Un id de sesión nunca usa los prefijos reservados de la bóveda ("snmp:", "hop:").
pub fn reserved_id(id: &str) -> bool {
    id.starts_with(NS_SNMP) || id.starts_with(NS_HOP)
}

impl Credentials {
    pub fn new(data_dir: &Path, portable: bool) -> Self {
        Self::with(data_dir, portable, Box::new(OsKeyStore), KDF_DEFAULT)
    }

    pub fn with(data_dir: &Path, portable: bool, keys: Box<dyn KeyStore>, kdf: Kdf) -> Self {
        Credentials {
            path: data_dir.join("credentials.vault"),
            portable,
            keys,
            kdf,
            keyring_ok: OnceLock::new(),
            inner: Mutex::default(),
        }
    }

    fn keyring_available(&self) -> bool {
        !self.portable && *self.keyring_ok.get_or_init(|| self.keys.get().is_ok())
    }

    fn read(&self) -> Result<Option<(Header, Vec<u8>)>, String> {
        let meta = match std::fs::metadata(&self.path) {
            Ok(m) => m,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(e) => return Err(e.to_string()),
        };
        if meta.len() > MAX_FILE {
            return Err("El archivo de credenciales no es válido".into());
        }
        let bytes = std::fs::read(&self.path).map_err(|e| e.to_string())?;
        Ok(Some((Header::decode(&bytes)?, bytes)))
    }

    /// Modo vigente: el del archivo si existe; si no, llavero cuando hay uno disponible.
    fn mode(&self) -> Mode {
        match self.read() {
            Ok(Some((h, _))) => h.mode,
            _ if self.keyring_available() => Mode::Keyring,
            _ => Mode::Master,
        }
    }

    fn decrypt(key: &[u8; 32], bytes: &[u8]) -> Result<Entries, String> {
        let header = Header::decode(bytes)?;
        let plain = seal::decrypt(key, &header.nonce, &bytes[HEADER_LEN..], &bytes[..HEADER_LEN])
            .map_err(|_| "Contraseña maestra incorrecta o archivo de credenciales alterado".to_string())?;
        serde_json::from_slice::<HashMap<String, String>>(&plain)
            .map(Entries)
            .map_err(|_| "El archivo de credenciales no es válido".into())
    }

    fn encrypt_write(&self, key: &[u8; 32], mode: Mode, kdf: Kdf, salt: [u8; 16], entries: &Entries) -> Result<(), String> {
        let header = Header { mode, kdf, salt, nonce: random() }.encode();
        // Capacidad de sobra (el peor escape JSON es \uXXXX, 6 bytes por byte): `to_vec`
        // realocaría y dejaría copias del texto en claro sin borrar en memoria liberada.
        let cap = 2 + entries.0.iter().map(|(k, v)| 6 * (k.len() + v.len()) + 6).sum::<usize>();
        let mut plain = Zeroizing::new(Vec::with_capacity(cap));
        serde_json::to_writer(&mut *plain, &entries.0).map_err(|e| e.to_string())?;
        let mut nonce = [0u8; 24];
        nonce.copy_from_slice(&header[37..61]);
        let ct = seal::encrypt(key, &nonce, &plain, &header).map_err(|_| "No se pudo cifrar la bóveda".to_string())?;
        let mut out = Vec::with_capacity(HEADER_LEN + ct.len());
        out.extend_from_slice(&header);
        out.extend_from_slice(&ct);
        write_atomic(&self.path, &out)
    }

    /// Asegura la llave en memoria. En modo llavero la lee (o la crea con la bóveda si
    /// `create`); en modo maestra exige haber desbloqueado antes.
    fn ensure_key(&self, inner: &mut Inner, create: bool) -> Result<Option<(Header, Vec<u8>)>, String> {
        // Bloqueo automático evaluado también al usarla: una llave vencida no se usa aunque el
        // temporizador todavía no haya pasado.
        inner.expire(Instant::now(), SystemTime::now());
        let file = self.read()?;
        if inner.key.is_some() {
            inner.touch();
            return Ok(file);
        }
        match &file {
            Some((h, _)) if h.mode == Mode::Master => Err(LOCKED.into()),
            Some(_) => {
                let raw = self.keys.get()?.ok_or(
                    "La llave de la bóveda no está en el llavero de este equipo. Restablece la bóveda en Ajustes › Credenciales",
                )?;
                if raw.len() != 32 {
                    return Err("La llave de la bóveda en el llavero no es válida".into());
                }
                let mut key = Zeroizing::new([0u8; 32]);
                key.copy_from_slice(&raw);
                inner.key = Some(key);
                inner.master = false;
                inner.touch();
                Ok(file)
            }
            None if !create => Ok(None),
            None if self.keyring_available() => {
                let key = Zeroizing::new(random::<32>());
                self.keys.set(key.as_ref())?;
                self.encrypt_write(&key, Mode::Keyring, Kdf { m: 0, t: 0, p: 0 }, random(), &Entries::default())?;
                inner.key = Some(key);
                inner.master = false;
                inner.touch();
                self.read()
            }
            None => Err("Primero crea la bóveda con una contraseña maestra en Ajustes › Credenciales".into()),
        }
    }

    pub fn status(&self) -> Status {
        let exists = self.path.exists();
        Status {
            backend: if self.mode() == Mode::Keyring { "keychain" } else { "vault" },
            exists,
            unlocked: exists && {
                // Una llave vencida por el bloqueo automático ya no cuenta como desbloqueada.
                let mut inner = lock(&self.inner);
                inner.expire(Instant::now(), SystemTime::now());
                inner.key.is_some()
            },
            portable: self.portable,
        }
    }

    pub fn create(&self, master: &str) -> Result<(), String> {
        check_master(master)?;
        if self.path.exists() {
            return Err("La bóveda ya existe".into());
        }
        if self.mode() != Mode::Master {
            return Err("Esta instalación guarda la llave en el llavero del sistema".into());
        }
        let salt = random::<16>();
        let key = derive(master, &salt, self.kdf)?;
        self.encrypt_write(&key, Mode::Master, self.kdf, salt, &Entries::default())?;
        let mut inner = lock(&self.inner);
        inner.key = Some(key);
        inner.master = true;
        inner.touch();
        Ok(())
    }

    pub fn unlock(&self, master: &str) -> Result<(), String> {
        if master.len() > MAX_PASSWORD {
            return Err("Contraseña demasiado larga".into());
        }
        if self.data_attached() {
            let r = self.data_unlock(master)?;
            if r.vault_exists && !r.vault {
                return Err("La contraseña abrió los datos, pero no la bóveda de contraseñas".into());
            }
            return Ok(());
        }
        let mut inner = lock(&self.inner);
        inner.throttle.check()?;
        let (h, bytes) = self.read()?.ok_or("No hay bóveda creada")?;
        if h.mode != Mode::Master {
            return self.ensure_key(&mut inner, false).map(|_| ());
        }
        let key = derive(master, &h.salt, h.kdf)?;
        match Self::decrypt(&key, &bytes) {
            Ok(_) => {
                inner.key = Some(key);
                inner.master = true;
                inner.touch();
                inner.throttle.reset();
                Ok(())
            }
            Err(e) => {
                inner.throttle.fail();
                Err(e)
            }
        }
    }

    pub fn lock(&self) {
        lock(&self.inner).drop_keys();
    }

    pub fn change(&self, old: &str, new: &str) -> Result<(), String> {
        check_master(new)?;
        let mut inner = lock(&self.inner);
        inner.throttle.check()?;
        let (h, bytes) = self.read()?.ok_or("No hay bóveda creada")?;
        if h.mode != Mode::Master {
            return Err("Esta bóveda usa el llavero del sistema: no tiene contraseña maestra".into());
        }
        let old_key = derive(old, &h.salt, h.kdf)?;
        let entries = match Self::decrypt(&old_key, &bytes) {
            Ok(e) => e,
            Err(e) => {
                inner.throttle.fail();
                return Err(e);
            }
        };
        // Carpeta cifrada: la DEK se reenvuelve sin recifrar los datos. Orden a prueba de cortes:
        // (1) ranura nueva en datakey.ntk junto a la vieja, (2) bóveda con la maestra nueva, (3) se
        // quita la ranura vieja. En cualquier punto una de las dos contraseñas abre todo.
        let data = match inner.data.clone() {
            None => None,
            Some(sh) => {
                let dir = self.data_dir();
                let mut kf = datacrypt::KeyFile::read(&dir)?.ok_or("Falta la llave de datos (datakey.ntk)")?;
                let dk = match kf.unwrap(old) {
                    Ok((k, _)) => k,
                    Err(e) => {
                        inner.throttle.fail();
                        return Err(e);
                    }
                };
                let slot = kf.add_slot(&dk, new, self.kdf)?;
                kf.write(&dir)?;
                Some((sh, kf, slot, dk, dir))
            }
        };
        let salt = random::<16>();
        let key = derive(new, &salt, self.kdf)?;
        self.encrypt_write(&key, Mode::Master, self.kdf, salt, &entries)?;
        if let Some((sh, mut kf, slot, dk, dir)) = data {
            kf.keep_only(slot);
            kf.write(&dir)?;
            sh.set_key(Some(dk));
        }
        inner.key = Some(key);
        inner.master = true;
        inner.touch();
        inner.throttle.reset();
        Ok(())
    }

    /// Borra la bóveda completa (y la llave del llavero). Para contraseña maestra olvidada
    /// o llavero perdido: las contraseñas guardadas se pierden.
    pub fn reset(&self) -> Result<(), String> {
        let mut inner = lock(&self.inner);
        if inner.data.is_some() {
            return Err("La carpeta de datos está cifrada con esta contraseña: restablecer la bóveda no la abre ni la recupera. Desactiva el cifrado antes (Ajustes › Credenciales)".into());
        }
        inner.key = None;
        match std::fs::remove_file(&self.path) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.to_string()),
        }
        if !self.portable {
            let _ = self.keys.delete();
        }
        Ok(())
    }

    /// Modifica las entradas con la llave en memoria y reescribe el archivo.
    fn update(&self, create: bool, f: impl FnOnce(&mut Entries)) -> Result<(), String> {
        let mut inner = lock(&self.inner);
        let Some((h, bytes)) = self.ensure_key(&mut inner, create)? else {
            return Ok(());
        };
        let key = inner.key.as_ref().ok_or(LOCKED)?;
        let mut entries = Self::decrypt(key, &bytes)?;
        f(&mut entries);
        self.encrypt_write(key, h.mode, h.kdf, h.salt, &entries)
    }

    /// Guarda la contraseña de una sesión. `valid` (ids de sesiones existentes) permite
    /// limpiar entradas huérfanas de sesiones borradas con la bóveda bloqueada.
    pub fn set(&self, id: &str, password: &str, valid: &[String]) -> Result<(), String> {
        check_id(id)?;
        if password.is_empty() || password.len() > MAX_PASSWORD {
            return Err(format!("La contraseña debe tener entre 1 y {MAX_PASSWORD} bytes"));
        }
        if password.chars().any(|c| matches!(c, '\r' | '\n' | '\0')) {
            return Err("La contraseña no puede contener saltos de línea".into());
        }
        self.update(true, |e| {
            if let Some(mut old) = e.0.insert(id.to_string(), password.to_string()) {
                old.zeroize();
            }
            let stale: Vec<String> =
                e.0.keys().filter(|k| *k != id && !k.starts_with(NS_SNMP) && !k.starts_with(NS_HOP) && !valid.contains(k)).cloned().collect();
            for k in stale {
                if let Some(mut v) = e.0.remove(&k) {
                    v.zeroize();
                }
            }
        })
    }

    pub fn delete(&self, id: &str) -> Result<(), String> {
        check_id(id)?;
        self.update(false, |e| {
            if let Some(mut v) = e.0.remove(id) {
                v.zeroize();
            }
        })
    }

    pub fn has(&self, id: &str) -> Result<bool, String> {
        check_id(id)?;
        let mut inner = lock(&self.inner);
        let Some((_, bytes)) = self.ensure_key(&mut inner, false)? else {
            return Ok(false);
        };
        let key = inner.key.as_ref().ok_or(LOCKED)?;
        Ok(Self::decrypt(key, &bytes)?.0.contains_key(id))
    }

    /// Solo para el autocompletado del backend. None si no hay, o si está bloqueada.
    pub(crate) fn get(&self, id: &str) -> Option<Zeroizing<String>> {
        check_id(id).ok()?;
        let mut inner = lock(&self.inner);
        let (_, bytes) = self.ensure_key(&mut inner, false).ok()??;
        let mut entries = Self::decrypt(inner.key.as_ref()?, &bytes).ok()?;
        entries.0.remove(id).map(Zeroizing::new)
    }

    // ---------- Vecinos alcanzados por salto ----------

    /// Lee las entradas con la llave en memoria (sin escribir). Ok(None): no hay bóveda.
    fn read_entries<R>(&self, f: impl FnOnce(&Entries) -> R) -> Result<Option<R>, String> {
        let mut inner = lock(&self.inner);
        let Some((_, bytes)) = self.ensure_key(&mut inner, false)? else {
            return Ok(None);
        };
        let key = inner.key.as_ref().ok_or(LOCKED)?;
        Ok(Some(f(&Self::decrypt(key, &bytes)?)))
    }

    /// Guarda (o reemplaza) la contraseña de un vecino. Con tope de entradas.
    pub fn hop_set(&self, ip: &str, user: &str, password: &str) -> Result<(), String> {
        let key = hop_key(ip, user)?;
        if password.is_empty() || password.len() > MAX_PASSWORD {
            return Err(format!("La contraseña debe tener entre 1 y {MAX_PASSWORD} bytes"));
        }
        if password.chars().any(|c| matches!(c, '\r' | '\n' | '\0')) {
            return Err("La contraseña no puede contener saltos de línea".into());
        }
        let mut full = false;
        self.update(true, |e| {
            let prior = e.0.get(&key).and_then(|v| HopRec::parse(v)).and_then(|r| r.used);
            if prior.is_none() && !e.0.contains_key(&key) && e.0.keys().filter(|k| k.starts_with(NS_HOP)).count() >= MAX_HOP_ENTRIES {
                full = true;
                return;
            }
            let rec = Zeroizing::new(HopRec { pw: password.to_string(), used: prior }.encode());
            if let Some(mut old) = e.0.insert(key.clone(), rec.to_string()) {
                old.zeroize();
            }
        })?;
        if full {
            return Err(format!("Ya hay {MAX_HOP_ENTRIES} vecinos con contraseña guardada: elimina alguno en Ajustes › Credenciales"));
        }
        Ok(())
    }

    pub fn hop_delete(&self, ip: &str, user: &str) -> Result<(), String> {
        let key = hop_key(ip, user)?;
        self.update(false, |e| {
            if let Some(mut v) = e.0.remove(&key) {
                v.zeroize();
            }
        })
    }

    pub fn hop_has(&self, ip: &str, user: &str) -> Result<bool, String> {
        let key = hop_key(ip, user)?;
        Ok(self.read_entries(|e| e.0.contains_key(&key))?.unwrap_or(false))
    }

    /// Vecinos guardados, sin contraseñas, por IP y usuario.
    pub fn hop_list(&self) -> Result<Vec<HopInfo>, String> {
        let mut out = self
            .read_entries(|e| {
                e.0.iter()
                    .filter_map(|(k, v)| {
                        let (ip, user) = k.strip_prefix(NS_HOP)?.split_once('|')?;
                        Some(HopInfo { ip: ip.to_string(), user: user.to_string(), last_used: HopRec::parse(v).and_then(|r| r.used) })
                    })
                    .collect::<Vec<_>>()
            })?
            .unwrap_or_default();
        out.sort_by(|a, b| (&a.ip, &a.user).cmp(&(&b.ip, &b.user)));
        Ok(out)
    }

    /// Solo para escribir la contraseña en un salto (nunca vuelve al frontend).
    pub(crate) fn hop_get(&self, ip: &str, user: &str) -> Option<Zeroizing<String>> {
        let key = hop_key(ip, user).ok()?;
        let rec = self.read_entries(|e| e.0.get(&key).and_then(|v| HopRec::parse(v))).ok()???;
        Some(Zeroizing::new(rec.pw.clone()))
    }

    /// Anota el último uso (segundos Unix). Un fallo no importa: es solo informativo.
    pub(crate) fn hop_touch(&self, ip: &str, user: &str, now: u64) {
        let Ok(key) = hop_key(ip, user) else { return };
        let _ = self.update(false, |e| {
            if let Some(mut rec) = e.0.get(&key).and_then(|v| HopRec::parse(v)) {
                rec.used = Some(now);
                let enc = Zeroizing::new(rec.encode());
                if let Some(mut old) = e.0.insert(key.clone(), enc.to_string()) {
                    old.zeroize();
                }
            }
        });
    }
}

impl Credentials {
    // ---------- Exportación e importación cifrada (bundle.rs) ----------

    /// La bóveda se puede usar ahora sin pedir nada: con llavero (se crea sola si falta) o con
    /// contraseña maestra ya desbloqueada. Exportar e importar ya no lo consultan: toman la llave una
    /// sola vez con `hold` (un chequeo previo podía vencer antes del uso); queda para las pruebas.
    #[cfg(test)]
    pub fn usable(&self) -> bool {
        match self.read() {
            Ok(Some((h, _))) if h.mode == Mode::Master => {
                let mut inner = lock(&self.inner);
                inner.expire(Instant::now(), SystemTime::now());
                // Consultarla para usarla enseguida cuenta como uso: renueva el plazo del bloqueo automático.
                let ok = inner.key.is_some();
                if ok {
                    inner.touch();
                }
                ok
            }
            Ok(Some(_)) => self.keys.get().is_ok_and(|k| k.is_some_and(|k| k.len() == 32)),
            Ok(None) => self.keyring_available(),
            Err(_) => false,
        }
    }

    /// true si la bóveda usa contraseña maestra (para pedirla de nuevo antes de exportar).
    pub fn is_master(&self) -> bool {
        self.mode() == Mode::Master
    }

    /// Vuelve a verificar la contraseña maestra (exportar contraseñas la exige en ese momento,
    /// aunque la bóveda ya esté desbloqueada). Misma espera creciente que al desbloquear. Con
    /// llavero no hay contraseña: Ok.
    pub fn verify_master(&self, master: &str) -> Result<(), String> {
        if master.len() > MAX_PASSWORD {
            return Err("Contraseña demasiado larga".into());
        }
        let mut inner = lock(&self.inner);
        let Some((h, bytes)) = self.read()? else { return Err("No hay bóveda creada".into()) };
        if h.mode != Mode::Master {
            return Ok(());
        }
        inner.throttle.check()?;
        let key = derive(master, &h.salt, h.kdf)?;
        match Self::decrypt(&key, &bytes) {
            Ok(_) => {
                inner.throttle.reset();
                Ok(())
            }
            Err(_) => {
                inner.throttle.fail();
                Err("Contraseña maestra incorrecta".into())
            }
        }
    }

    /// Toma la llave una sola vez para toda una exportación o importación (bundle.rs): si el bloqueo
    /// automático vence a mitad del flujo, lo que ya empezó termina igual, sin dejar sesiones
    /// importadas sin sus contraseñas. Ok(None): no hay bóveda (y `create` es false). Error si está
    /// bloqueada o no se puede crear.
    pub(crate) fn hold(&self, create: bool) -> Result<Option<KeyHold>, String> {
        let mut inner = lock(&self.inner);
        if self.ensure_key(&mut inner, create)?.is_none() {
            return Ok(None);
        }
        let key = inner.key.as_ref().ok_or(LOCKED)?;
        Ok(Some(KeyHold { key: Zeroizing::new(**key) }))
    }

    /// Lee y reescribe la bóveda con una llave tomada con `hold` (serializado con las demás escrituras).
    fn update_held(&self, hold: &KeyHold, f: impl FnOnce(&mut Entries)) -> Result<(), String> {
        let mut inner = lock(&self.inner);
        let (h, bytes) = self.read()?.ok_or(LOCKED)?;
        let mut entries = Self::decrypt(&hold.key, &bytes)?;
        f(&mut entries);
        self.encrypt_write(&hold.key, h.mode, h.kdf, h.salt, &entries)?;
        if inner.key.is_some() {
            inner.touch();
        }
        Ok(())
    }

    /// Copia de las contraseñas pedidas, para cifrarlas directo en un archivo de exportación.
    /// Solo las que existen; nunca pasa por la interfaz. Usa la llave tomada con `hold`.
    pub(crate) fn export_secrets(&self, hold: &KeyHold, sessions: &[String], hops: &[(String, String)], snmp: &[String]) -> Result<ExportedSecrets, String> {
        let entries = {
            let mut inner = lock(&self.inner);
            let (_, bytes) = self.read()?.ok_or(LOCKED)?;
            if inner.key.is_some() {
                inner.touch();
            }
            Self::decrypt(&hold.key, &bytes)?
        };
        let mut out = ExportedSecrets::default();
        for id in sessions {
            if check_id(id).is_ok() && !reserved_id(id) {
                if let Some(pw) = entries.0.get(id) {
                    out.sessions.push((id.clone(), Zeroizing::new(pw.clone())));
                }
            }
        }
        for (ip, user) in hops {
            let Ok(k) = hop_key(ip, user) else { continue };
            if let Some(rec) = entries.0.get(&k).and_then(|v| HopRec::parse(v)) {
                let (ip, user) = k.strip_prefix(NS_HOP).and_then(|r| r.split_once('|')).unwrap_or_default();
                out.hops.push((ip.to_string(), user.to_string(), Zeroizing::new(rec.pw.clone())));
            }
        }
        for id in snmp {
            let k = format!("{NS_SNMP}{id}");
            if let Some(v) = entries.0.get(&k) {
                out.snmp.push((id.clone(), Zeroizing::new(v.clone())));
            }
        }
        Ok(out)
    }

    /// Guarda en una sola escritura las contraseñas de una importación: de sesiones (ids ya
    /// existentes), secretos SNMP por perfil y vecinos. Valores inválidos o sobre el tope de
    /// vecinos se omiten y se cuentan. `valid`: ids de sesiones existentes para limpiar entradas
    /// huérfanas; None si sessions.json no se leyó sano en este arranque (dañado, restaurado desde un
    /// respaldo o con entradas descartadas): ahí no se borra nada, porque las "huérfanas" pueden ser
    /// las contraseñas de las sesiones que faltan. Usa la llave tomada con `hold`.
    pub(crate) fn import_entries(
        &self,
        hold: &KeyHold,
        sessions: &[(String, Zeroizing<String>)],
        snmp: &[(String, Zeroizing<String>)],
        hops: &[(String, String, Zeroizing<String>)],
        valid: Option<&[String]>,
    ) -> Result<ImportCounts, String> {
        let ok_pw = |p: &str| !p.is_empty() && p.len() <= MAX_PASSWORD && !p.chars().any(|c| matches!(c, '\r' | '\n' | '\0'));
        let mut counts = ImportCounts::default();
        let any = !sessions.is_empty() || !snmp.is_empty() || !hops.is_empty();
        if !any {
            return Ok(counts);
        }
        self.update_held(hold, |e| {
            let mut put = |k: String, v: String| {
                if let Some(mut old) = e.0.insert(k, v) {
                    old.zeroize();
                }
            };
            for (id, pw) in sessions {
                if check_id(id).is_ok() && !reserved_id(id) && ok_pw(pw) {
                    put(id.clone(), pw.to_string());
                    counts.sessions += 1;
                } else {
                    counts.skipped += 1;
                }
            }
            for (profile, json) in snmp {
                let k = format!("{NS_SNMP}{profile}");
                if check_id(&k).is_ok() && !json.is_empty() && json.len() <= 4096 && serde_json::from_str::<serde_json::Value>(json).is_ok_and(|v| v.is_object()) {
                    put(k, json.to_string());
                    counts.snmp += 1;
                } else {
                    counts.skipped += 1;
                }
            }
            for (ip, user, pw) in hops {
                let Ok(k) = hop_key(ip, user) else {
                    counts.skipped += 1;
                    continue;
                };
                let n = e.0.keys().filter(|x| x.starts_with(NS_HOP)).count();
                if !ok_pw(pw) || (!e.0.contains_key(&k) && n >= MAX_HOP_ENTRIES) {
                    counts.skipped += 1;
                    continue;
                }
                let prior = e.0.get(&k).and_then(|v| HopRec::parse(v)).and_then(|r| r.used);
                let rec = Zeroizing::new(HopRec { pw: pw.to_string(), used: prior }.encode());
                if let Some(mut old) = e.0.insert(k, rec.to_string()) {
                    old.zeroize();
                }
                counts.hops += 1;
            }
            if let Some(valid) = valid {
                let stale: Vec<String> = e.0.keys().filter(|k| !k.starts_with(NS_SNMP) && !k.starts_with(NS_HOP) && !valid.contains(k)).cloned().collect();
                for k in stale {
                    if let Some(mut v) = e.0.remove(&k) {
                        v.zeroize();
                    }
                }
            }
        })?;
        Ok(counts)
    }

    // ---------- Bloqueo automático (solo con contraseña maestra) ----------

    /// Configura el bloqueo automático: `minutes` 0 lo apaga (máx. 24 h). Cuenta desde ahora.
    pub fn set_autolock(&self, minutes: u32, on_sleep: bool) -> Result<(), String> {
        if minutes > AUTOLOCK_MAX_MIN {
            return Err(format!("El bloqueo automático admite hasta {AUTOLOCK_MAX_MIN} minutos"));
        }
        let mut inner = lock(&self.inner);
        inner.auto = AutoLock { idle: (minutes > 0).then(|| Duration::from_secs(u64::from(minutes) * 60)), on_sleep };
        if inner.has_key() {
            inner.touch();
        }
        Ok(())
    }

    /// Pide un temporizador si hace falta (desbloqueada con contraseña maestra, opción activa y
    /// ninguno corriendo). Devuelve su generación; quien llama crea el hilo y llama a `autolock_tick`.
    pub fn autolock_arm(&self) -> Option<u64> {
        let mut inner = lock(&self.inner);
        if !inner.has_key() || !inner.master || !inner.auto.active() || inner.timer_running {
            return None;
        }
        inner.timer_running = true;
        inner.timer_gen += 1;
        inner.last_tick = None;
        Some(inner.timer_gen)
    }

    /// Un paso del temporizador. Al vencer borra la llave de memoria y devuelve `Locked`.
    pub fn autolock_tick(&self, gen: u64, now: Instant, wall: SystemTime) -> Tick {
        let mut inner = lock(&self.inner);
        if inner.timer_gen != gen {
            return Tick::Stop;
        }
        if !inner.has_key() || !inner.master || !inner.auto.active() {
            inner.timer_running = false;
            return Tick::Stop;
        }
        // Suspensión: el hilo no corrió durante bastante más que la espera pedida (vale aunque el
        // reloj monótono del sistema siga contando mientras el equipo duerme).
        let slept = inner.auto.on_sleep && inner.last_tick.is_some_and(|(at, wait)| since(wall, at) > wait + SLEEP_SLACK);
        if slept || inner.expire(now, wall) {
            inner.drop_keys();
            inner.timer_running = false;
            return Tick::Locked;
        }
        let wait = match (inner.auto.idle, inner.last_used()) {
            (Some(idle), Some((at, at_wall))) => idle.saturating_sub(now.saturating_duration_since(at).max(since(wall, at_wall))),
            _ => TICK_MAX,
        }
        .clamp(Duration::from_secs(1), TICK_MAX);
        inner.last_tick = Some((wall, wait));
        Tick::Wait(wait)
    }
}

impl Credentials {
    // ---------- Modo portable cifrado ----------

    fn data_dir(&self) -> PathBuf {
        self.path.parent().map(Path::to_path_buf).unwrap_or_default()
    }

    pub fn kdf(&self) -> Kdf {
        self.kdf
    }

    /// Une la carpeta cifrada a la bóveda: se desbloquea con la misma contraseña y se bloquea con
    /// ella (a mano, por inactividad, al suspender el equipo y al salir).
    pub fn attach_data(&self, sh: Arc<datacrypt::Shared>) {
        let mut inner = lock(&self.inner);
        if sh.unlocked() {
            inner.master = true;
            inner.touch();
        }
        inner.data = Some(sh);
    }

    pub fn detach_data(&self) {
        lock(&self.inner).data = None;
    }

    pub fn data_attached(&self) -> bool {
        lock(&self.inner).data.is_some()
    }

    /// Desbloqueo de la carpeta cifrada y la bóveda con una sola contraseña. Las dos derivaciones
    /// Argon2id corren en paralelo. La carpeta se abre si la contraseña abre `datakey.ntk`; la bóveda,
    /// si además abre `credentials.vault`. Tras un cambio de maestra cortado (dos ranuras) queda solo
    /// la ranura de la contraseña que abrió ambas.
    pub fn data_unlock(&self, master: &str) -> Result<UnlockReport, String> {
        if master.len() > MAX_PASSWORD {
            return Err("Contraseña demasiado larga".into());
        }
        let mut inner = lock(&self.inner);
        let data = inner.data.clone().ok_or("La carpeta de datos no está cifrada")?;
        inner.throttle.check()?;
        let dir = self.data_dir();
        let kf = datacrypt::KeyFile::read(&dir)?.ok_or("Falta la llave de datos (datakey.ntk): sin ella los datos no se pueden abrir")?;
        let vault = self.read().ok().flatten().filter(|(h, _)| h.mode == Mode::Master);
        let (dres, vkey) = std::thread::scope(|s| {
            let t = s.spawn(|| kf.unwrap(master));
            let vk = vault.as_ref().and_then(|(h, b)| derive(master, &h.salt, h.kdf).ok().filter(|k| Self::decrypt(k, b).is_ok()));
            (t.join().unwrap_or_else(|_| Err("No se pudo derivar la llave".into())), vk)
        });
        let (dk, slot) = match dres {
            Ok(x) => x,
            Err(e) => {
                inner.throttle.fail();
                return Err(e);
            }
        };
        inner.throttle.reset();
        data.set_key(Some(dk));
        inner.master = true;
        let vault_ok = vkey.is_some();
        if let Some(k) = vkey {
            inner.key = Some(k);
        }
        inner.touch();
        if kf.slots() > 1 && (vault_ok || vault.is_none()) {
            let mut kf = kf;
            kf.keep_only(slot);
            let _ = kf.write(&dir);
        }
        Ok(UnlockReport { vault: vault_ok, vault_exists: vault.is_some() })
    }

    /// Verifica la contraseña contra la llave de datos (para desactivar el cifrado), con la misma
    /// espera creciente que al desbloquear.
    pub fn verify_data(&self, master: &str) -> Result<(), String> {
        if master.len() > MAX_PASSWORD {
            return Err("Contraseña demasiado larga".into());
        }
        let mut inner = lock(&self.inner);
        inner.throttle.check()?;
        let kf = datacrypt::KeyFile::read(&self.data_dir())?.ok_or("La carpeta de datos no está cifrada")?;
        match kf.unwrap(master) {
            Ok(_) => {
                inner.throttle.reset();
                Ok(())
            }
            Err(e) => {
                inner.throttle.fail();
                Err(e)
            }
        }
    }
}

/// Resultado de desbloquear una carpeta cifrada.
#[derive(Serialize, Debug, Clone, Copy, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UnlockReport {
    /// La bóveda también quedó desbloqueada.
    pub vault: bool,
    pub vault_exists: bool,
}

/// Llave de la bóveda tomada para una exportación o importación completa. Se borra al soltarse.
pub(crate) struct KeyHold {
    key: Zeroizing<[u8; 32]>,
}

/// Bloqueo automático guardado en los ajustes (`vaultAutoLockMin`, `vaultLockOnSleep`): Rust lo
/// aplica al arrancar sin esperar a la interfaz. Valores inválidos o fuera de rango: apagado.
pub fn autolock_from_settings(settings: Option<&serde_json::Map<String, serde_json::Value>>) -> (u32, bool) {
    let Some(s) = settings else { return (0, false) };
    let minutes = s
        .get("vaultAutoLockMin")
        .and_then(serde_json::Value::as_u64)
        .filter(|m| *m <= u64::from(AUTOLOCK_MAX_MIN))
        .map_or(0, |m| m as u32);
    (minutes, s.get("vaultLockOnSleep").and_then(serde_json::Value::as_bool).unwrap_or(false))
}

/// Contraseñas copiadas para una exportación. Se borran de memoria al soltarse.
#[derive(Default)]
pub(crate) struct ExportedSecrets {
    pub sessions: Vec<(String, Zeroizing<String>)>,
    pub hops: Vec<(String, String, Zeroizing<String>)>,
    pub snmp: Vec<(String, Zeroizing<String>)>,
}

/// Cuántas contraseñas guardó una importación.
#[derive(Default, Serialize, Debug, PartialEq, Clone, Copy)]
pub struct ImportCounts {
    pub sessions: usize,
    pub snmp: usize,
    pub hops: usize,
    pub skipped: usize,
}

/// Un vecino con contraseña guardada (para Ajustes › Credenciales). Sin la contraseña.
#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct HopInfo {
    pub ip: String,
    pub user: String,
    /// Último uso en un salto (segundos Unix); None si nunca se usó.
    pub last_used: Option<u64>,
}

/// Valor de una entrada `hop:`: la contraseña y cuándo se usó por última vez.
struct HopRec {
    pw: String,
    used: Option<u64>,
}

impl Drop for HopRec {
    fn drop(&mut self) {
        self.pw.zeroize();
    }
}

impl HopRec {
    fn parse(v: &str) -> Option<HopRec> {
        let j: serde_json::Value = serde_json::from_str(v).ok()?;
        Some(HopRec { pw: j.get("pw")?.as_str()?.to_string(), used: j.get("used").and_then(|u| u.as_u64()) })
    }
    fn encode(&self) -> String {
        serde_json::json!({ "pw": self.pw, "used": self.used }).to_string()
    }
}

/// Usuario de un comando de salto: mismas reglas que la interfaz (HOP_USER).
pub fn valid_hop_user(u: &str) -> bool {
    let mut cs = u.chars();
    let ok_first = cs.next().is_some_and(|c| c.is_ascii_alphanumeric());
    ok_first && u.len() <= 64 && cs.all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '.' | '@' | '\\' | '-'))
}

/// Clave de la entrada de un vecino: IP canónica (minúsculas, sin ceros de más) y usuario.
/// Rechaza nombres, IP no literales, la dirección no especificada y usuarios con caracteres raros.
pub fn hop_key(ip: &str, user: &str) -> Result<String, String> {
    let addr: std::net::IpAddr = ip.trim().parse().map_err(|_| "IP del vecino no válida")?;
    if addr.is_unspecified() || addr.is_multicast() {
        return Err("IP del vecino no válida".into());
    }
    let user = user.trim();
    if !valid_hop_user(user) {
        return Err("Usuario no válido (sin espacios ni símbolos raros)".into());
    }
    Ok(format!("{NS_HOP}{addr}|{user}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Llavero en memoria para pruebas.
    #[derive(Default, Clone)]
    struct MemKeys(std::sync::Arc<Mutex<Option<Vec<u8>>>>, bool);

    impl KeyStore for MemKeys {
        fn get(&self) -> Result<Option<Zeroizing<Vec<u8>>>, String> {
            if self.1 {
                return Err("sin llavero".into());
            }
            Ok(lock(&self.0).clone().map(Zeroizing::new))
        }
        fn set(&self, key: &[u8]) -> Result<(), String> {
            *lock(&self.0) = Some(key.to_vec());
            Ok(())
        }
        fn delete(&self) -> Result<(), String> {
            *lock(&self.0) = None;
            Ok(())
        }
    }

    const FAST: Kdf = Kdf { m: 64, t: 1, p: 1 };

    fn dir() -> PathBuf {
        let d = std::env::temp_dir().join(format!("nt-cred-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn master_vault_roundtrip_and_wrong_master() {
        let d = dir();
        let c = Credentials::with(&d, true, Box::new(MemKeys::default()), FAST);
        assert_eq!(c.status().backend, "vault");
        assert!(c.set("s1", "x", &[]).is_err(), "sin bóveda no se guarda");
        assert!(c.create("corta").is_err());
        c.create("maestra-larga").unwrap();
        c.set("s1", "Cl4ve$ecreta", &["s1".into()]).unwrap();
        assert!(c.has("s1").unwrap());
        assert_eq!(c.get("s1").as_deref().map(|s| s.as_str()), Some("Cl4ve$ecreta"));
        // El archivo no contiene la contraseña en claro.
        let raw = std::fs::read(d.join("credentials.vault")).unwrap();
        assert!(!raw.windows(12).any(|w| w == b"Cl4ve$ecreta"));

        c.lock();
        assert!(c.get("s1").is_none());
        assert_eq!(c.has("s1").unwrap_err(), LOCKED);
        assert!(c.unlock("otra-maestra").is_err());
        // Tras un fallo hay espera antes del siguiente intento.
        assert!(c.unlock("maestra-larga").unwrap_err().contains("Espera"));
        lock(&c.inner).throttle.retry_at = None;
        c.unlock("maestra-larga").unwrap();
        assert!(c.has("s1").unwrap());

        c.change("maestra-larga", "nueva-maestra").unwrap();
        c.lock();
        lock(&c.inner).throttle.retry_at = None;
        assert!(c.unlock("maestra-larga").is_err());
        lock(&c.inner).throttle.retry_at = None;
        c.unlock("nueva-maestra").unwrap();
        assert_eq!(c.get("s1").as_deref().map(|s| s.as_str()), Some("Cl4ve$ecreta"));

        // Entradas huérfanas se limpian al guardar otra; las de SNMP no son de sesiones.
        c.set("snmp:core", "{\"community\":\"x\"}", &[]).unwrap();
        c.set("s2", "otra", &["s2".into()]).unwrap();
        assert!(!c.has("s1").unwrap());
        assert!(c.has("snmp:core").unwrap());
        c.delete("s2").unwrap();
        assert!(!c.has("s2").unwrap());
        std::fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn tampered_vault_is_rejected() {
        let d = dir();
        let c = Credentials::with(&d, true, Box::new(MemKeys::default()), FAST);
        c.create("maestra-larga").unwrap();
        c.set("s1", "secreto", &[]).unwrap();
        let path = d.join("credentials.vault");
        let good = std::fs::read(&path).unwrap();
        // Un byte del texto cifrado y uno de la cabecera (sal): ambos fallan por AEAD/derivación.
        for i in [good.len() - 1, HEADER_LEN + 2, 25] {
            let mut bad = good.clone();
            bad[i] ^= 0x01;
            std::fs::write(&path, &bad).unwrap();
            c.lock();
            lock(&c.inner).throttle.retry_at = None;
            assert!(c.unlock("maestra-larga").is_err(), "byte {i}");
        }
        // Parámetros absurdos en la cabecera: se rechazan sin intentar derivar.
        let mut bad = good.clone();
        bad[9..13].copy_from_slice(&u32::MAX.to_le_bytes());
        std::fs::write(&path, &bad).unwrap();
        lock(&c.inner).throttle.retry_at = None;
        assert!(c.unlock("maestra-larga").unwrap_err().contains("no es válido"));
        std::fs::write(&path, &good).unwrap();
        lock(&c.inner).throttle.retry_at = None;
        c.unlock("maestra-larga").unwrap();
        std::fs::remove_dir_all(&d).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn vault_file_is_private() {
        use std::os::unix::fs::PermissionsExt;
        let d = dir();
        let c = Credentials::with(&d, true, Box::new(MemKeys::default()), FAST);
        c.create("maestra-larga").unwrap();
        c.set("s1", "secreto", &[]).unwrap();
        let mode = std::fs::metadata(d.join("credentials.vault")).unwrap().permissions().mode();
        assert_eq!(mode & 0o777, 0o600);
        std::fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn keyring_mode_needs_no_master_and_file_alone_is_useless() {
        let d = dir();
        let keys = MemKeys::default();
        let c = Credentials::with(&d, false, Box::new(keys.clone()), FAST);
        assert_eq!(c.status().backend, "keychain");
        assert!(c.create("maestra-larga").is_err());
        c.set("s1", "secreto", &[]).unwrap();
        assert_eq!(lock(&keys.0).as_ref().map(Vec::len), Some(32));
        // Tras bloquear (o reiniciar la app) se recupera sola desde el llavero.
        c.lock();
        assert!(c.has("s1").unwrap());
        let c2 = Credentials::with(&d, false, Box::new(keys.clone()), FAST);
        assert_eq!(c2.get("s1").as_deref().map(|s| s.as_str()), Some("secreto"));
        // Sin la llave del llavero (archivo copiado a otro equipo) no se lee.
        let other = Credentials::with(&d, false, Box::new(MemKeys::default()), FAST);
        assert!(other.get("s1").is_none());
        assert!(other.has("s1").is_err());
        c.reset().unwrap();
        assert!(lock(&keys.0).is_none());
        assert!(!d.join("credentials.vault").exists());
        std::fs::remove_dir_all(&d).unwrap();
    }

    /// Bóveda truncada o ajena al abrir la app: nada entra en pánico y el archivo no se
    /// reemplaza al guardar otra contraseña (se podría recuperar desde un respaldo).
    #[test]
    fn corrupt_vault_at_startup_is_not_overwritten() {
        for (garbage, keyring) in [(&b"NTVAULT"[..], true), (&b"no es una boveda"[..], false), (&[0u8; 200][..], true)] {
            let d = dir();
            let path = d.join("credentials.vault");
            std::fs::write(&path, garbage).unwrap();
            let keys = MemKeys(Default::default(), !keyring);
            let c = Credentials::with(&d, false, Box::new(keys), FAST);
            let st = c.status();
            assert!(st.exists && !st.unlocked);
            assert!(c.get("s1").is_none());
            assert!(c.has("s1").is_err());
            assert!(c.set("s1", "x", &[]).is_err());
            assert!(c.unlock("maestra-larga").is_err());
            assert_eq!(std::fs::read(&path).unwrap(), garbage, "la bóveda dañada no se reescribe");
            std::fs::remove_dir_all(&d).unwrap();
        }
    }

    #[test]
    fn without_keyring_falls_back_to_master() {
        let d = dir();
        let c = Credentials::with(&d, false, Box::new(MemKeys(Default::default(), true)), FAST);
        assert_eq!(c.status().backend, "vault");
        assert!(c.set("s1", "x", &[]).is_err());
        c.create("maestra-larga").unwrap();
        c.set("s1", "x", &[]).unwrap();
        std::fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn roundtrips_passwords_that_need_json_escapes() {
        let d = dir();
        let c = Credentials::with(&d, true, Box::new(MemKeys::default()), FAST);
        c.create("maestra-larga").unwrap();
        let pw = "a\"b\\c\u{1}ñ€\t";
        c.set("s1", pw, &[]).unwrap();
        assert_eq!(c.get("s1").as_deref().map(|s| s.as_str()), Some(pw));
        std::fs::remove_dir_all(&d).unwrap();
    }

    // ---------- Archivos de referencia (formato en disco) ----------
    //
    // `tests/fixtures/*.vault` se generaron con chacha20poly1305 0.10 y argon2 0.5. Deben
    // abrir sin cambios con cualquier versión posterior: si una actualización rompe estas
    // pruebas, cambió el formato y las bóvedas de los usuarios dejarían de abrir.

    const GOLDEN_MASTER: &str = "maestra-de-prueba-1";
    /// Llave fija que simula la del llavero del sistema (solo pruebas).
    const GOLDEN_KEY: [u8; 32] = *b"llave-fija-de-prueba-32-bytes-00";
    const GOLDEN_ENTRIES: [(&str, &str); 3] =
        [("sess-1", "Pr0b@nd0-123"), ("snmp:core", "{\"community\":\"publica-test\"}"), ("sess-ñ", "a\"b\\c\u{1}ñ€\t")];

    fn fixture(name: &str) -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures").join(name)
    }

    /// Copia un archivo de referencia como `credentials.vault` de una carpeta temporal.
    fn golden_dir(name: &str) -> (PathBuf, Vec<u8>) {
        let d = dir();
        let bytes = std::fs::read(fixture(name)).unwrap();
        std::fs::write(d.join("credentials.vault"), &bytes).unwrap();
        (d, bytes)
    }

    fn keyring_with(key: &[u8]) -> MemKeys {
        MemKeys(std::sync::Arc::new(Mutex::new(Some(key.to_vec()))), false)
    }

    fn assert_golden_entries(c: &Credentials) {
        for (id, pw) in GOLDEN_ENTRIES {
            assert_eq!(c.get(id).as_deref().map(|s| s.as_str()), Some(pw), "{id}");
        }
        assert!(c.get("no-existe").is_none());
    }

    /// Regenera los archivos de referencia. Solo a mano y con la versión anterior:
    /// `NT_WRITE_GOLDEN=1 cargo test --lib write_golden_vaults -- --ignored`.
    #[test]
    #[ignore]
    fn write_golden_vaults() {
        if std::env::var("NT_WRITE_GOLDEN").as_deref() != Ok("1") {
            return;
        }
        let entries = || Entries(GOLDEN_ENTRIES.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect());
        std::fs::create_dir_all(fixture("")).unwrap();
        // Contraseña maestra, parámetros por defecto.
        let d = dir();
        let c = Credentials::with(&d, true, Box::new(MemKeys::default()), KDF_DEFAULT);
        let salt = random::<16>();
        let key = derive(GOLDEN_MASTER, &salt, KDF_DEFAULT).unwrap();
        c.encrypt_write(&key, Mode::Master, KDF_DEFAULT, salt, &entries()).unwrap();
        std::fs::copy(d.join("credentials.vault"), fixture("credentials-master.vault")).unwrap();
        // Llavero, con la llave fija.
        let d = dir();
        let c = Credentials::with(&d, false, Box::new(keyring_with(&GOLDEN_KEY)), KDF_DEFAULT);
        c.encrypt_write(&GOLDEN_KEY, Mode::Keyring, Kdf { m: 0, t: 0, p: 0 }, random(), &entries()).unwrap();
        std::fs::copy(d.join("credentials.vault"), fixture("credentials-keyring.vault")).unwrap();
    }

    #[test]
    fn golden_master_vault_opens() {
        let (d, bytes) = golden_dir("credentials-master.vault");
        // Cabecera: NTVAULT | v1 | modo 1 | m=65536 t=3 p=1 | sal (16) | nonce (24).
        assert_eq!(&bytes[..9], b"NTVAULT\x01\x01");
        assert_eq!(Kdf::decode(&bytes[9..21]), KDF_DEFAULT);
        let c = Credentials::with(&d, true, Box::new(MemKeys::default()), FAST);
        assert_eq!(c.status().backend, "vault");
        assert!(c.unlock("maestra-de-prueba-2").is_err());
        lock(&c.inner).throttle.retry_at = None;
        c.unlock(GOLDEN_MASTER).unwrap();
        assert_golden_entries(&c);
        // La llave derivada descifra el archivo directamente con la cabecera como AAD.
        let h = Header::decode(&bytes).unwrap();
        let key = derive(GOLDEN_MASTER, &h.salt, h.kdf).unwrap();
        let plain = seal::decrypt(&key, &h.nonce, &bytes[HEADER_LEN..], &bytes[..HEADER_LEN]).unwrap();
        let map: HashMap<String, String> = serde_json::from_slice(&plain).unwrap();
        assert_eq!(map.len(), GOLDEN_ENTRIES.len());
        assert_eq!(std::fs::read(d.join("credentials.vault")).unwrap(), bytes, "leer no reescribe");
        std::fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn golden_keyring_vault_opens() {
        let (d, bytes) = golden_dir("credentials-keyring.vault");
        assert_eq!(&bytes[..9], b"NTVAULT\x01\x00");
        assert_eq!(&bytes[9..21], &[0u8; 12]);
        let c = Credentials::with(&d, false, Box::new(keyring_with(&GOLDEN_KEY)), FAST);
        assert_eq!(c.status().backend, "keychain");
        assert_golden_entries(&c);
        // Otra llave en el llavero: no abre.
        let other = Credentials::with(&d, false, Box::new(keyring_with(&[7u8; 32])), FAST);
        assert!(other.get("sess-1").is_none());
        assert!(other.has("sess-1").is_err());
        std::fs::remove_dir_all(&d).unwrap();
    }

    /// Reescribir una bóveda de referencia con el código actual mantiene la cabecera
    /// (magia, versión, modo, parámetros, sal) y el largo; solo cambia el nonce.
    #[test]
    fn golden_vaults_roundtrip_keeps_format() {
        for (name, portable, keys, master) in [
            ("credentials-master.vault", true, MemKeys::default(), Some(GOLDEN_MASTER)),
            ("credentials-keyring.vault", false, keyring_with(&GOLDEN_KEY), None),
        ] {
            let (d, before) = golden_dir(name);
            let c = Credentials::with(&d, portable, Box::new(keys.clone()), FAST);
            if let Some(m) = master {
                c.unlock(m).unwrap();
            }
            c.set("tmp", "x", &["sess-1".into(), "sess-ñ".into(), "tmp".into()]).unwrap();
            c.delete("tmp").unwrap();
            let after = std::fs::read(d.join("credentials.vault")).unwrap();
            assert_eq!(after.len(), before.len(), "{name}");
            assert_eq!(&after[..37], &before[..37], "{name}: cabecera sin el nonce");
            assert_ne!(&after[37..61], &before[37..61], "{name}: nonce nuevo");
            let c2 = Credentials::with(&d, portable, Box::new(keys), FAST);
            if let Some(m) = master {
                c2.unlock(m).unwrap();
            }
            assert_golden_entries(&c2);
            std::fs::remove_dir_all(&d).unwrap();
        }
    }

    /// Una bóveda nueva tiene exactamente el diseño v1: cabecera de 61 bytes + JSON + etiqueta.
    #[test]
    fn new_vault_layout_is_v1() {
        let d = dir();
        let c = Credentials::with(&d, true, Box::new(MemKeys::default()), FAST);
        c.create("maestra-larga").unwrap();
        let b = std::fs::read(d.join("credentials.vault")).unwrap();
        assert_eq!(HEADER_LEN, 61);
        assert_eq!(b.len(), HEADER_LEN + 2 + 16, "\"{{}}\" cifrado + etiqueta de 16 bytes");
        assert_eq!(&b[..9], b"NTVAULT\x01\x01");
        assert_eq!(Kdf::decode(&b[9..21]), FAST);
        let h = Header::decode(&b).unwrap();
        let key = derive("maestra-larga", &h.salt, h.kdf).unwrap();
        assert_eq!(seal::decrypt(&key, &h.nonce, &b[HEADER_LEN..], &b[..HEADER_LEN]).unwrap().as_slice(), b"{}");
        std::fs::remove_dir_all(&d).unwrap();
    }

    // ---------- Vecinos alcanzados por salto ----------

    #[test]
    fn hop_key_is_normalized_and_strict() {
        assert_eq!(hop_key("192.0.2.12", "noc").unwrap(), "hop:192.0.2.12|noc");
        assert_eq!(hop_key(" 192.0.2.12 ", " noc ").unwrap(), "hop:192.0.2.12|noc");
        // IPv6: la forma canónica es única (mayúsculas y ceros de más no crean entradas distintas).
        assert_eq!(hop_key("2001:DB8:0:0:0:0:0:1", "noc").unwrap(), hop_key("2001:db8::1", "noc").unwrap());
        // El usuario distingue mayúsculas: son cuentas distintas.
        assert_ne!(hop_key("192.0.2.12", "Noc").unwrap(), hop_key("192.0.2.12", "noc").unwrap());
        for ip in ["", "core-sw01", "192.0.2.256", "0.0.0.0", "::", "192.0.2.1|x", "192.0.2.1 -o x", "224.0.0.1"] {
            assert!(hop_key(ip, "noc").is_err(), "{ip:?}");
        }
        for user in ["", "-l", "a b", "a|b", "a\nb", "noc;reboot", &"u".repeat(65)] {
            assert!(hop_key("192.0.2.12", user).is_err(), "{user:?}");
        }
        for user in ["noc", "a", "DOM\\noc", "noc@corp.example", "svc_1-b.c"] {
            assert!(valid_hop_user(user), "{user:?}");
        }
    }

    #[test]
    fn hop_credentials_roundtrip_without_leaking() {
        let d = dir();
        let c = Credentials::with(&d, true, Box::new(MemKeys::default()), FAST);
        assert!(c.hop_set("192.0.2.12", "noc", "x").is_err(), "sin bóveda no se guarda");
        c.create("maestra-larga").unwrap();
        assert!(c.hop_list().unwrap().is_empty());
        c.hop_set("192.0.2.12", "noc", "V3cino-Cl4ve").unwrap();
        c.hop_set("192.0.2.13", "admin", "Otra-Cl4ve").unwrap();
        assert!(c.hop_has("192.0.2.12", "noc").unwrap());
        assert!(!c.hop_has("192.0.2.12", "admin").unwrap(), "la clave incluye el usuario");
        assert_eq!(c.hop_get("192.0.2.12", "noc").as_deref().map(|s| s.as_str()), Some("V3cino-Cl4ve"));
        // La lista no trae contraseñas y el archivo no las tiene en claro.
        let list = c.hop_list().unwrap();
        assert_eq!(
            list,
            vec![
                HopInfo { ip: "192.0.2.12".into(), user: "noc".into(), last_used: None },
                HopInfo { ip: "192.0.2.13".into(), user: "admin".into(), last_used: None },
            ]
        );
        assert!(!format!("{list:?}").contains("Cl4ve"));
        let raw = std::fs::read(d.join("credentials.vault")).unwrap();
        assert!(!raw.windows(8).any(|w| w == b"V3cino-C"));
        // Último uso; reemplazar la contraseña lo conserva.
        c.hop_touch("192.0.2.12", "noc", 1_700_000_000);
        c.hop_set("192.0.2.12", "noc", "Nueva-Cl4ve").unwrap();
        assert_eq!(c.hop_list().unwrap()[0].last_used, Some(1_700_000_000));
        assert_eq!(c.hop_get("192.0.2.12", "noc").as_deref().map(|s| s.as_str()), Some("Nueva-Cl4ve"));
        // Una entrada de vecino no se mezcla con las de sesión (ni las limpia como huérfanas).
        c.set("s1", "sesion", &["s1".into()]).unwrap();
        c.set("s2", "otra", &["s1".into(), "s2".into()]).unwrap();
        assert!(c.hop_has("192.0.2.13", "admin").unwrap());
        assert_eq!(c.get("s2").as_deref().map(|s| s.as_str()), Some("otra"));
        // Bloqueada: no se lista, no se lee ni se pide.
        c.lock();
        assert!(c.hop_get("192.0.2.12", "noc").is_none());
        assert_eq!(c.hop_list().unwrap_err(), LOCKED);
        assert_eq!(c.hop_has("192.0.2.12", "noc").unwrap_err(), LOCKED);
        assert_eq!(c.hop_set("192.0.2.12", "noc", "x").unwrap_err(), LOCKED);
        lock(&c.inner).throttle.retry_at = None;
        c.unlock("maestra-larga").unwrap();
        c.hop_delete("192.0.2.12", "noc").unwrap();
        assert!(!c.hop_has("192.0.2.12", "noc").unwrap());
        assert_eq!(c.hop_list().unwrap().len(), 1);
        // Entradas inválidas.
        assert!(c.hop_set("192.0.2.12", "noc", "").is_err());
        assert!(c.hop_set("192.0.2.12", "noc", "a\nb").is_err());
        assert!(c.hop_set("core-sw01", "noc", "x").is_err());
        std::fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn hop_credentials_have_a_cap() {
        let d = dir();
        let c = Credentials::with(&d, true, Box::new(MemKeys::default()), FAST);
        c.create("maestra-larga").unwrap();
        for i in 0..MAX_HOP_ENTRIES {
            c.hop_set(&format!("198.51.100.{}", i + 1), "noc", "x").unwrap();
        }
        assert!(c.hop_set("203.0.113.1", "noc", "x").unwrap_err().contains("100"));
        // Reemplazar una existente sí se puede.
        c.hop_set("198.51.100.1", "noc", "y").unwrap();
        assert_eq!(c.hop_list().unwrap().len(), MAX_HOP_ENTRIES);
        std::fs::remove_dir_all(&d).unwrap();
    }

    /// Las bóvedas de referencia (sin entradas de vecinos) abren igual: se les agregan vecinos sin
    /// tocar la cabecera ni las contraseñas de sesión y SNMP, y las entradas de vecinos
    /// sobreviven a guardar una sesión (que limpia huérfanas).
    #[test]
    fn golden_vaults_accept_hop_entries_and_keep_compat() {
        for (name, portable, keys, master) in [
            ("credentials-master.vault", true, MemKeys::default(), Some(GOLDEN_MASTER)),
            ("credentials-keyring.vault", false, keyring_with(&GOLDEN_KEY), None),
        ] {
            let (d, before) = golden_dir(name);
            let c = Credentials::with(&d, portable, Box::new(keys.clone()), FAST);
            if let Some(m) = master {
                c.unlock(m).unwrap();
            }
            assert!(c.hop_list().unwrap().is_empty(), "{name}: sin vecinos al inicio");
            assert_eq!(std::fs::read(d.join("credentials.vault")).unwrap(), before, "{name}: listar no reescribe");
            c.hop_set("192.0.2.12", "noc", "V3cino").unwrap();
            c.set("sess-1", "Pr0b@nd0-123", &["sess-1".into(), "sess-ñ".into()]).unwrap();
            let after = std::fs::read(d.join("credentials.vault")).unwrap();
            assert_eq!(&after[..37], &before[..37], "{name}: cabecera sin el nonce");
            let c2 = Credentials::with(&d, portable, Box::new(keys), FAST);
            if let Some(m) = master {
                c2.unlock(m).unwrap();
            }
            assert_golden_entries(&c2);
            assert_eq!(c2.hop_get("192.0.2.12", "noc").as_deref().map(|s| s.as_str()), Some("V3cino"));
            // El mapa descifrado sigue siendo texto a texto: una versión que no conoce `hop:` lo lee.
            let (h, bytes) = c2.read().unwrap().unwrap();
            assert_eq!(h.mode as u8, if portable { 1 } else { 0 });
            assert!(bytes.len() > before.len());
            std::fs::remove_dir_all(&d).unwrap();
        }
    }

    // ---------- Bloqueo automático ----------

    #[test]
    fn autolock_by_idle_time_wipes_key() {
        let d = dir();
        let c = Credentials::with(&d, true, Box::new(MemKeys::default()), FAST);
        c.create("maestra-larga").unwrap();
        c.set("s1", "x", &["s1".into()]).unwrap();
        // Apagado: sin temporizador.
        assert!(c.autolock_arm().is_none());
        assert!(c.set_autolock(AUTOLOCK_MAX_MIN + 1, false).is_err());
        c.set_autolock(5, false).unwrap();
        let gen = c.autolock_arm().expect("temporizador");
        assert!(c.autolock_arm().is_none(), "uno a la vez");
        let (now, wall) = (Instant::now(), SystemTime::now());
        // Antes de vencer espera (como mucho 30 s); un uso reinicia la cuenta.
        assert!(matches!(c.autolock_tick(gen, now + Duration::from_secs(60), wall + Duration::from_secs(60)), Tick::Wait(w) if w <= TICK_MAX));
        assert!(c.has("s1").unwrap());
        assert_eq!(c.autolock_tick(gen, Instant::now() + Duration::from_secs(301), SystemTime::now() + Duration::from_secs(301)), Tick::Locked);
        assert!(lock(&c.inner).key.is_none(), "llave borrada de memoria");
        assert_eq!(c.has("s1").unwrap_err(), LOCKED);
        assert!(!c.status().unlocked);
        // Bloqueada: el temporizador termina y no se arma otro hasta desbloquear.
        assert_eq!(c.autolock_tick(gen, Instant::now(), SystemTime::now()), Tick::Stop);
        assert!(c.autolock_arm().is_none());
        lock(&c.inner).throttle.retry_at = None;
        c.unlock("maestra-larga").unwrap();
        let gen2 = c.autolock_arm().unwrap();
        assert!(gen2 > gen);
        assert_eq!(c.autolock_tick(gen, Instant::now(), SystemTime::now()), Tick::Stop, "un hilo de otra generación termina");
        // Apagar la opción detiene el temporizador sin bloquear.
        c.set_autolock(0, false).unwrap();
        assert_eq!(c.autolock_tick(gen2, Instant::now(), SystemTime::now()), Tick::Stop);
        assert!(c.status().unlocked);
        std::fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn autolock_on_use_and_on_sleep() {
        let d = dir();
        let c = Credentials::with(&d, true, Box::new(MemKeys::default()), FAST);
        c.create("maestra-larga").unwrap();
        c.set("s1", "x", &["s1".into()]).unwrap();
        c.set_autolock(1, false).unwrap();
        // Al usarla también se evalúa: con el último uso hace 2 minutos ya no se lee.
        lock(&c.inner).last_use = Some((Instant::now() - Duration::from_secs(120), SystemTime::now() - Duration::from_secs(120)));
        assert!(c.get("s1").is_none());
        assert!(lock(&c.inner).key.is_none());
        // Suspensión: la hora del sistema avanzó mucho más que el reloj monótono.
        lock(&c.inner).throttle.retry_at = None;
        c.unlock("maestra-larga").unwrap();
        c.set_autolock(0, true).unwrap();
        assert!(c.has("s1").unwrap(), "sin suspensión sigue abierta");
        lock(&c.inner).last_use = Some((Instant::now(), SystemTime::now() - Duration::from_secs(3600)));
        assert_eq!(c.has("s1").unwrap_err(), LOCKED);
        // El temporizador nota la suspensión porque no corrió durante mucho más que su espera.
        lock(&c.inner).throttle.retry_at = None;
        c.unlock("maestra-larga").unwrap();
        let gen = c.autolock_arm().unwrap();
        let (now, wall) = (Instant::now(), SystemTime::now());
        assert!(matches!(c.autolock_tick(gen, now, wall), Tick::Wait(_)));
        assert!(matches!(c.autolock_tick(gen, now + TICK_MAX, wall + TICK_MAX), Tick::Wait(_)), "un tic a tiempo no bloquea");
        assert_eq!(c.autolock_tick(gen, now + TICK_MAX * 2, wall + Duration::from_secs(4 * 3600)), Tick::Locked);
        // Un reloj del sistema que retrocede no bloquea por sí solo.
        lock(&c.inner).throttle.retry_at = None;
        c.unlock("maestra-larga").unwrap();
        lock(&c.inner).last_use = Some((Instant::now(), SystemTime::now() + Duration::from_secs(3600)));
        assert!(c.has("s1").unwrap());
        std::fs::remove_dir_all(&d).unwrap();
    }

    /// Con el llavero no hay contraseña que pedir: el bloqueo automático no aplica (la llave se
    /// relee sola del llavero, que protege la sesión del sistema).
    #[test]
    fn autolock_does_not_apply_to_keyring() {
        let d = dir();
        let c = Credentials::with(&d, false, Box::new(MemKeys::default()), FAST);
        c.set("s1", "x", &["s1".into()]).unwrap();
        c.set_autolock(1, true).unwrap();
        assert!(c.autolock_arm().is_none());
        lock(&c.inner).last_use = Some((Instant::now() - Duration::from_secs(600), SystemTime::now() - Duration::from_secs(7200)));
        assert!(c.has("s1").unwrap());
        assert!(c.usable());
        std::fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn verify_master_export_and_import_entries() {
        let d = dir();
        let c = Credentials::with(&d, true, Box::new(MemKeys::default()), FAST);
        assert!(!c.usable(), "sin bóveda");
        c.create("maestra-larga").unwrap();
        assert!(c.usable() && c.is_master());
        c.set("s1", "uno", &["s1".into(), "s2".into()]).unwrap();
        c.set("s2", "dos", &["s1".into(), "s2".into()]).unwrap();
        c.hop_set("192.0.2.12", "noc", "vecino").unwrap();
        assert!(c.verify_master("otra-maestra").is_err());
        lock(&c.inner).throttle.retry_at = None;
        c.verify_master("maestra-larga").unwrap();
        let held = c.hold(false).unwrap().unwrap();
        let e = c.export_secrets(&held, &["s1".into(), "no-existe".into(), "hop:192.0.2.12|noc".into()], &[("192.0.2.12".into(), "noc".into())], &["p9".into()]).unwrap();
        assert_eq!(e.sessions.len(), 1, "solo lo pedido y existente; nunca un id reservado");
        assert_eq!(e.sessions[0].1.as_str(), "uno");
        assert_eq!(e.hops[0].2.as_str(), "vecino");
        assert!(e.snmp.is_empty());
        let r = c
            .import_entries(
                &held,
                &[("s3".into(), Zeroizing::new("tres".into())), ("s4".into(), Zeroizing::new("a\nb".into()))],
                &[("p1".into(), Zeroizing::new("{\"community\":\"x\"}".into())), ("p2".into(), Zeroizing::new("no-json".into()))],
                &[("192.0.2.40".into(), "admin".into(), Zeroizing::new("v".into()))],
                Some(&["s1".into(), "s2".into(), "s3".into()]),
            )
            .unwrap();
        assert_eq!(r, ImportCounts { sessions: 1, snmp: 1, hops: 1, skipped: 2 });
        assert_eq!(c.get("s3").as_deref().map(|s| s.as_str()), Some("tres"));
        assert!(c.has("snmp:p1").unwrap() && !c.has("snmp:p2").unwrap());
        assert!(c.has("s1").unwrap(), "las existentes se conservan");
        c.lock();
        assert_eq!(c.hold(false).err().as_deref(), Some(LOCKED));
        assert!(!c.usable());
        // La llave tomada antes de bloquear sigue sirviendo para terminar el flujo en curso.
        assert_eq!(c.export_secrets(&held, &["s1".into()], &[], &[]).unwrap().sessions.len(), 1);
        std::fs::remove_dir_all(&d).unwrap();
    }

    /// La llave se toma una vez: aunque el bloqueo automático venza a mitad de la importación, las
    /// contraseñas se guardan (no quedan sesiones importadas sin ellas).
    #[test]
    fn held_key_survives_autolock_and_orphans_kept_when_untrusted() {
        let d = dir();
        let c = Credentials::with(&d, true, Box::new(MemKeys::default()), FAST);
        c.create("maestra-larga").unwrap();
        c.set("s1", "uno", &["s1".into()]).unwrap();
        c.set_autolock(1, false).unwrap();
        let held = c.hold(true).unwrap().unwrap();
        // Vence el plazo: la bóveda queda bloqueada para cualquier otro uso.
        lock(&c.inner).last_use = Some((Instant::now() - Duration::from_secs(120), SystemTime::now() - Duration::from_secs(120)));
        assert!(!c.usable());
        // sessions.json no confiable (None): no se borra la entrada "huérfana" s1.
        let r = c.import_entries(&held, &[("s2".into(), Zeroizing::new("dos".into()))], &[], &[], None).unwrap();
        assert_eq!(r.sessions, 1);
        c.unlock("maestra-larga").unwrap();
        assert!(c.has("s1").unwrap() && c.has("s2").unwrap());
        // Con sessions.json sano, sí se limpian las huérfanas.
        let held = c.hold(false).unwrap().unwrap();
        c.import_entries(&held, &[("s3".into(), Zeroizing::new("tres".into()))], &[], &[], Some(&["s2".into(), "s3".into()])).unwrap();
        assert!(!c.has("s1").unwrap() && c.has("s2").unwrap());
        std::fs::remove_dir_all(&d).unwrap();
    }

    /// Consultar `usable` antes de exportar o importar renueva el plazo del bloqueo automático.
    #[test]
    fn usable_touches_and_autolock_from_settings() {
        let d = dir();
        let c = Credentials::with(&d, true, Box::new(MemKeys::default()), FAST);
        c.create("maestra-larga").unwrap();
        c.set_autolock(5, false).unwrap();
        lock(&c.inner).last_use = Some((Instant::now() - Duration::from_secs(200), SystemTime::now() - Duration::from_secs(200)));
        assert!(c.usable());
        let (at, _) = lock(&c.inner).last_use.unwrap();
        assert!(at.elapsed() < Duration::from_secs(5), "usable renovó el último uso");
        let m = |v: serde_json::Value| v.as_object().unwrap().clone();
        assert_eq!(autolock_from_settings(None), (0, false));
        assert_eq!(autolock_from_settings(Some(&m(serde_json::json!({"vaultAutoLockMin": 15, "vaultLockOnSleep": true})))), (15, true));
        assert_eq!(autolock_from_settings(Some(&m(serde_json::json!({"vaultAutoLockMin": 99999})))), (0, false), "fuera de rango: apagado");
        assert_eq!(autolock_from_settings(Some(&m(serde_json::json!({"vaultAutoLockMin": "15"})))), (0, false));
        std::fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn rejects_bad_inputs() {
        let d = dir();
        let c = Credentials::with(&d, false, Box::new(MemKeys::default()), FAST);
        assert!(c.set("s1", "", &[]).is_err());
        assert!(c.set("s1", &"x".repeat(MAX_PASSWORD + 1), &[]).is_err());
        assert!(c.set("s1", "a\rb", &[]).is_err());
        assert!(c.set(&"i".repeat(200), "x", &[]).is_err());
        assert!(c.set("", "x", &[]).is_err());
        std::fs::remove_dir_all(&d).unwrap();
    }

    // ---------- Modo portable cifrado ----------

    /// Bóveda con maestra y carpeta cifrada con la misma contraseña, ya unidas.
    fn data_mode(pw: &str) -> (PathBuf, Credentials, std::sync::Arc<crate::datacrypt::Shared>) {
        let d = dir();
        let c = Credentials::with(&d, true, Box::new(MemKeys::default()), FAST);
        c.create(pw).unwrap();
        std::fs::write(d.join("settings.json"), b"{}").unwrap();
        let layout = crate::datacrypt::Layout::new(&d, None);
        let mut key = None;
        crate::datacrypt::enable(&layout, pw, FAST, &crate::datacrypt::no_hook, &mut |_| {}, &mut key).unwrap();
        let sh = crate::datacrypt::Shared::new();
        crate::datacrypt::register(&d, &sh);
        sh.set_key(key);
        c.attach_data(sh.clone());
        (d, c, sh)
    }

    #[test]
    fn data_mode_unlocks_and_locks_with_the_vault() {
        let (d, c, sh) = data_mode("maestra-larga");
        assert!(sh.unlocked());
        c.lock();
        assert!(!sh.unlocked() && !c.status().unlocked, "un solo bloqueo para datos y bóveda");
        assert!(crate::datacrypt::read(&d.join("settings.json")).is_err());
        assert!(c.data_unlock("otra-maestra").is_err());
        assert!(!sh.unlocked());
        assert!(c.data_unlock("maestra-larga").unwrap_err().contains("Espera"), "misma espera creciente");
        lock(&c.inner).throttle.retry_at = None;
        let r = c.data_unlock("maestra-larga").unwrap();
        assert!(r.vault && r.vault_exists);
        assert!(sh.unlocked() && c.status().unlocked);
        assert_eq!(crate::datacrypt::read(&d.join("settings.json")).unwrap(), b"{}");
        // vault_unlock (la misma contraseña) también abre los datos.
        c.lock();
        c.unlock("maestra-larga").unwrap();
        assert!(sh.unlocked());
        // Restablecer la bóveda no se permite con la carpeta cifrada (los datos quedarían sin llave).
        assert!(c.reset().unwrap_err().contains("cifrada"));
        assert!(d.join("credentials.vault").exists());
        crate::datacrypt::unregister(&sh);
        std::fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn data_mode_autolock_clears_the_data_key_and_app_activity_counts() {
        let (d, c, sh) = data_mode("maestra-larga");
        c.set_autolock(5, false).unwrap();
        let gen = c.autolock_arm().unwrap();
        // La actividad en la app (data_touch) cuenta como uso.
        let later = Instant::now() + Duration::from_secs(240);
        sh.touch();
        assert!(matches!(c.autolock_tick(gen, later, SystemTime::now() + Duration::from_secs(240)), Tick::Wait(_)));
        assert_eq!(c.autolock_tick(gen, Instant::now() + Duration::from_secs(301), SystemTime::now() + Duration::from_secs(301)), Tick::Locked);
        assert!(!sh.unlocked(), "la DEK se borra con la llave de la bóveda");
        crate::datacrypt::unregister(&sh);
        std::fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn data_mode_change_master_rewraps_and_survives_a_cut() {
        let (d, c, sh) = data_mode("maestra-vieja");
        c.change("maestra-vieja", "maestra-nueva").unwrap();
        let kf = crate::datacrypt::KeyFile::read(&d).unwrap().unwrap();
        assert_eq!(kf.slots(), 1);
        assert!(kf.unwrap("maestra-vieja").is_err() && kf.unwrap("maestra-nueva").is_ok());
        c.lock();
        c.data_unlock("maestra-nueva").unwrap();
        assert_eq!(crate::datacrypt::read(&d.join("settings.json")).unwrap(), b"{}", "los datos no se recifraron");

        // Corte tras agregar la ranura nueva y antes de reescribir la bóveda: la vieja abre todo.
        let mut kf = crate::datacrypt::KeyFile::read(&d).unwrap().unwrap();
        let (dk, _) = kf.unwrap("maestra-nueva").unwrap();
        kf.add_slot(&dk, "maestra-otra", FAST).unwrap();
        kf.write(&d).unwrap();
        c.lock();
        lock(&c.inner).throttle.retry_at = None;
        let r = c.data_unlock("maestra-nueva").unwrap();
        assert!(r.vault, "la bóveda sigue con la anterior");
        let kf = crate::datacrypt::KeyFile::read(&d).unwrap().unwrap();
        assert_eq!(kf.slots(), 1, "queda la ranura de la contraseña que abrió ambas");
        assert!(kf.unwrap("maestra-otra").is_err());
        // Contraseña que abre los datos y no la bóveda (corte después del paso 2, simulado al revés).
        let mut kf = kf;
        kf.add_slot(&dk, "solo-datos-123", FAST).unwrap();
        kf.write(&d).unwrap();
        c.lock();
        let r = c.data_unlock("solo-datos-123").unwrap();
        assert!(!r.vault && r.vault_exists && sh.unlocked());
        assert_eq!(crate::datacrypt::KeyFile::read(&d).unwrap().unwrap().slots(), 2, "sin abrir la bóveda no se poda nada");
        assert!(c.unlock("solo-datos-123").unwrap_err().contains("no la bóveda"));
        // Verificación para desactivar.
        lock(&c.inner).throttle.retry_at = None;
        assert!(c.verify_data("maestra-nueva").is_ok());
        crate::datacrypt::unregister(&sh);
        std::fs::remove_dir_all(&d).unwrap();
    }
}
