//! Modo portable cifrado (opcional, solo en la edición portable): cifra en reposo sesiones, ajustes,
//! topología, notas, historial, respaldos de configuración, logs de sesión y auditoría MCP con una
//! llave de datos aleatoria (DEK) envuelta por una llave derivada de la contraseña maestra.
//!
//! Piezas (formato completo en docs/TECNICO.md, "Modo portable cifrado"):
//! - `datakey.ntk`: la DEK envuelta con XChaCha20-Poly1305 por Argon2id(maestra, sal). Hasta dos
//!   ranuras: al cambiar la maestra se agrega la nueva, se reescribe la bóveda y se quita la vieja,
//!   así un corte en cualquier punto deja una contraseña que abre todo. Su presencia es la marca de
//!   carpeta cifrada.
//! - Archivo de datos (`<nombre>.nte`): cabecera con una llave propia del archivo (aleatoria,
//!   envuelta por la DEK) y bloques autenticados con nonce aleatorio. El AAD de cada bloque lleva la
//!   cabecera (identificador de la DEK y del archivo), el número de bloque y la marca de cierre: un
//!   bloque alterado, reordenado, quitado o traído de otro archivo no descifra, y un archivo cortado
//!   se nota por la falta del bloque de cierre. Los logs y la auditoría se anexan bloque a bloque.
//! - Capa de archivos (`read`, `write_atomic`, `read_dir`…): los módulos de datos llaman a estas
//!   funciones en vez de `std::fs`. Fuera de una carpeta cifrada registrada son `std::fs` tal cual
//!   (una lectura de un `AtomicBool`); dentro, el nombre lógico `x.json` vive en disco como
//!   `x.json.nte`. Una versión anterior de la app no ve esos nombres y nunca los reescribe.
//!
//! Nada de criptografía propia: XChaCha20-Poly1305 y Argon2id de RustCrypto (los mismos de la
//! bóveda, `seal.rs`) y SHA-256 para verificar las conversiones.

use crate::seal::{self, Kdf};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::{self, BufReader, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock, RwLock, Weak};
use std::time::{Instant, SystemTime};
use zeroize::Zeroizing;

/// Extensión de los archivos cifrados (se agrega al nombre lógico).
pub const EXT: &str = "nte";
const DOT_EXT: &str = ".nte";
pub const KEY_FILE: &str = "datakey.ntk";
pub const JOURNAL_FILE: &str = "datacrypt.journal";
pub const README_FILE: &str = "LEEME-DATOS-CIFRADOS.txt";
/// Carpetas de logs usadas con el modo activo (JSON en claro junto a la llave): al desactivar se
/// convierten todas y se avisa si alguna no está accesible.
pub const ROOTS_FILE: &str = "datakey.roots";
/// Bloqueo de instancia única (una sola app sobre la carpeta cifrada).
pub const LOCK_FILE: &str = "datakey.lock";
/// Marca en cada carpeta de logs registrada (con el identificador de la llave): una carpeta sin ella
/// (por ejemplo, un punto de montaje vacío) no es la que tiene los logs cifrados.
pub const ROOT_MARK: &str = ".netterminal-logs-cifrados";
/// Profundidad máxima de los recorridos (logs y búsqueda de `.nte`); lo más profundo se informa.
const MAX_DEPTH: usize = 8;
pub const VAULT_FILE: &str = "credentials.vault";
pub const LOCKED: &str = "Los datos están cifrados y bloqueados: desbloquéalos con la contraseña maestra";
pub const BUSY: &str = "Hay una conversión de datos en curso: espera a que termine";
const BAD_FILE: &str = "Archivo cifrado alterado, dañado o de otra carpeta";

// ---------- Llave de datos (DEK) ----------

/// Llave de datos de la carpeta: 256 bits aleatorios y un identificador público (va en cada archivo
/// para distinguir uno de otra carpeta cifrada). La llave se borra de memoria al soltarse.
pub struct DataKey {
    key: Zeroizing<[u8; 32]>,
    id: [u8; 16],
}

impl DataKey {
    pub fn generate() -> Self {
        DataKey { key: Zeroizing::new(seal::random()), id: seal::random() }
    }
}

// ---------- datakey.ntk ----------
//
// "NTDATKEY" | versión (1) | ranuras (1..=2) | id de la DEK (16) | ranuras de 100 bytes:
// Argon2id m,t,p (u32 LE) | sal (16) | nonce (24) | DEK envuelta (32 + etiqueta 16).
// AAD de cada ranura: magia, versión, id y los primeros 52 bytes de la ranura (parámetros, sal, nonce).

const KEY_MAGIC: &[u8; 8] = b"NTDATKEY";
const KEY_VERSION: u8 = 1;
const KEY_HEAD: usize = 8 + 1 + 1 + 16;
const SLOT_LEN: usize = 12 + 16 + 24 + 48;
const MAX_SLOTS: usize = 2;

#[derive(Clone)]
struct Slot {
    kdf: Kdf,
    salt: [u8; 16],
    nonce: [u8; 24],
    wrapped: Vec<u8>,
}

#[derive(Clone)]
pub struct KeyFile {
    id: [u8; 16],
    slots: Vec<Slot>,
}

/// Parámetros aceptables al leer: un archivo manipulado no puede pedir más de 256 MiB ni muchas pasadas.
fn kdf_ok(k: &Kdf) -> bool {
    (8..=256 * 1024).contains(&k.m) && (1..=10).contains(&k.t) && (1..=8).contains(&k.p)
}

impl Slot {
    fn aad(&self, id: &[u8; 16]) -> Vec<u8> {
        let mut a = Vec::with_capacity(KEY_HEAD - 1 + 52);
        a.extend_from_slice(KEY_MAGIC);
        a.push(KEY_VERSION);
        a.extend_from_slice(id);
        let mut k = [0u8; 12];
        self.kdf.encode(&mut k);
        a.extend_from_slice(&k);
        a.extend_from_slice(&self.salt);
        a.extend_from_slice(&self.nonce);
        a
    }

    fn new(dk: &DataKey, password: &str, kdf: Kdf) -> Result<Slot, String> {
        let salt = seal::random::<16>();
        let kek = seal::derive(password, &salt, kdf)?;
        let mut s = Slot { kdf, salt, nonce: seal::random(), wrapped: Vec::new() };
        s.wrapped = seal::encrypt(&kek, &s.nonce, dk.key.as_ref(), &s.aad(&dk.id))?;
        Ok(s)
    }

    fn open(&self, id: &[u8; 16], password: &str) -> Option<DataKey> {
        let kek = seal::derive(password, &self.salt, self.kdf).ok()?;
        let plain = seal::decrypt(&kek, &self.nonce, &self.wrapped, &self.aad(id)).ok()?;
        let mut key = Zeroizing::new([0u8; 32]);
        if plain.len() != 32 {
            return None;
        }
        key.copy_from_slice(&plain);
        Some(DataKey { key, id: *id })
    }
}

impl KeyFile {
    pub fn create(dk: &DataKey, password: &str, kdf: Kdf) -> Result<KeyFile, String> {
        Ok(KeyFile { id: dk.id, slots: vec![Slot::new(dk, password, kdf)?] })
    }

    pub fn slots(&self) -> usize {
        self.slots.len()
    }

    /// Identificador público de la DEK, en hexadecimal (va en la marca de cada carpeta de logs).
    pub fn id_hex(&self) -> String {
        self.id.iter().map(|b| format!("{b:02x}")).collect()
    }

    /// Abre la DEK con la contraseña probando cada ranura. Devuelve la llave y la ranura que abrió.
    pub fn unwrap(&self, password: &str) -> Result<(DataKey, usize), String> {
        for (i, s) in self.slots.iter().enumerate() {
            if let Some(k) = s.open(&self.id, password) {
                return Ok((k, i));
            }
        }
        Err("Contraseña maestra incorrecta o llave de datos alterada".into())
    }

    /// Agrega una ranura para `password` (cambio de maestra, paso 1) y conserva solo `keep`, la ranura
    /// que abrió la contraseña actual: tras un cambio anterior cortado (dos ranuras) nunca se descarta la
    /// que sigue abriendo la bóveda. Devuelve el índice de la ranura nueva.
    pub fn add_slot(&mut self, dk: &DataKey, password: &str, kdf: Kdf, keep: usize) -> Result<usize, String> {
        if dk.id != self.id {
            return Err("La llave de datos no corresponde a esta carpeta".into());
        }
        let s = Slot::new(dk, password, kdf)?;
        let kept = self.slots.get(keep).cloned().ok_or("Ranura inválida")?;
        self.slots = vec![kept, s];
        Ok(1)
    }

    /// Deja solo la ranura `i` (cambio de maestra, paso final; o al desbloquear tras un corte).
    pub fn keep_only(&mut self, i: usize) {
        if i < self.slots.len() {
            let s = self.slots.swap_remove(i);
            self.slots = vec![s];
        }
    }

    pub fn encode(&self) -> Vec<u8> {
        let mut out = Vec::with_capacity(KEY_HEAD + SLOT_LEN * self.slots.len());
        out.extend_from_slice(KEY_MAGIC);
        out.push(KEY_VERSION);
        out.push(self.slots.len() as u8);
        out.extend_from_slice(&self.id);
        for s in &self.slots {
            let mut k = [0u8; 12];
            s.kdf.encode(&mut k);
            out.extend_from_slice(&k);
            out.extend_from_slice(&s.salt);
            out.extend_from_slice(&s.nonce);
            out.extend_from_slice(&s.wrapped);
        }
        out
    }

    pub fn decode(b: &[u8]) -> Result<KeyFile, String> {
        let bad = || "La llave de datos (datakey.ntk) no es válida".to_string();
        if b.len() < KEY_HEAD || &b[..8] != KEY_MAGIC {
            return Err(bad());
        }
        if b[8] != KEY_VERSION {
            return Err("La carpeta se cifró con una versión más nueva de NetTerminal: actualiza la app para abrirla".into());
        }
        let n = b[9] as usize;
        if n == 0 || n > MAX_SLOTS || b.len() != KEY_HEAD + n * SLOT_LEN {
            return Err(bad());
        }
        let mut id = [0u8; 16];
        id.copy_from_slice(&b[10..26]);
        let mut slots = Vec::new();
        for i in 0..n {
            let s = &b[KEY_HEAD + i * SLOT_LEN..KEY_HEAD + (i + 1) * SLOT_LEN];
            let kdf = Kdf::decode(&s[..12]);
            if !kdf_ok(&kdf) {
                return Err(bad());
            }
            let mut salt = [0u8; 16];
            salt.copy_from_slice(&s[12..28]);
            let mut nonce = [0u8; 24];
            nonce.copy_from_slice(&s[28..52]);
            slots.push(Slot { kdf, salt, nonce, wrapped: s[52..].to_vec() });
        }
        Ok(KeyFile { id, slots })
    }

    /// Ok(None): la carpeta no está cifrada.
    pub fn read(data_dir: &Path) -> Result<Option<KeyFile>, String> {
        match fs::read(data_dir.join(KEY_FILE)) {
            Ok(b) => KeyFile::decode(&b).map(Some),
            Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(format!("No se pudo leer la llave de datos: {e}")),
        }
    }

    pub fn write(&self, data_dir: &Path) -> Result<(), String> {
        seal::write_atomic(&data_dir.join(KEY_FILE), &self.encode())
    }
}

// ---------- Archivo de datos ----------
//
// Cabecera (112 bytes): "NTDATA" | versión (1) | 0 | id de la DEK (16) | id del archivo (16) |
// nonce (24) | llave del archivo envuelta con la DEK (32 + 16), AAD = los primeros 64 bytes.
// Bloques: u32 LE (largo del texto cifrado; bit 31 = cierre) | nonce (24) | texto cifrado + etiqueta.
// AAD del bloque: los primeros 40 bytes de la cabecera | número de bloque (u64 LE) | cierre (u8).
// El último bloque es vacío y marca el cierre; nada puede venir después.

const MAGIC: &[u8; 6] = b"NTDATA";
const VERSION: u8 = 1;
pub const HEADER_LEN: usize = 112;
const AAD_HEAD: usize = 40;
const TAG: usize = 16;
const NONCE: usize = 24;
const REC_HEAD: usize = 4 + NONCE;
/// Tope de texto en claro por bloque al leer (un largo mayor es un archivo dañado).
const CHUNK_MAX: usize = 1 << 20;
/// Bloque al escribir archivos completos y al convertir.
const WRITE_CHUNK: usize = 256 * 1024;
const FINAL_BIT: u32 = 1 << 31;

fn bad(msg: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, msg.to_string())
}

fn locked_err() -> io::Error {
    io::Error::new(io::ErrorKind::PermissionDenied, LOCKED)
}

fn new_header(dk: &DataKey) -> io::Result<([u8; HEADER_LEN], Zeroizing<[u8; 32]>)> {
    let fk = Zeroizing::new(seal::random::<32>());
    let mut h = [0u8; HEADER_LEN];
    h[..6].copy_from_slice(MAGIC);
    h[6] = VERSION;
    h[8..24].copy_from_slice(&dk.id);
    h[24..40].copy_from_slice(&seal::random::<16>());
    let nonce: [u8; 24] = seal::random();
    h[40..64].copy_from_slice(&nonce);
    let wrapped = seal::encrypt(&dk.key, &nonce, fk.as_ref(), &h[..64]).map_err(io::Error::other)?;
    h[64..].copy_from_slice(&wrapped);
    Ok((h, fk))
}

fn open_header(dk: &DataKey, h: &[u8]) -> io::Result<Zeroizing<[u8; 32]>> {
    if h.len() < HEADER_LEN || &h[..6] != MAGIC {
        return Err(bad(BAD_FILE));
    }
    if h[6] != VERSION {
        return Err(bad("El archivo se cifró con una versión más nueva de NetTerminal"));
    }
    if h[8..24] != dk.id {
        return Err(bad("El archivo se cifró con la llave de otra carpeta"));
    }
    let mut nonce = [0u8; 24];
    nonce.copy_from_slice(&h[40..64]);
    let plain = seal::decrypt(&dk.key, &nonce, &h[64..HEADER_LEN], &h[..64]).map_err(|_| bad(BAD_FILE))?;
    if plain.len() != 32 {
        return Err(bad(BAD_FILE));
    }
    let mut fk = Zeroizing::new([0u8; 32]);
    fk.copy_from_slice(&plain);
    Ok(fk)
}

fn chunk_aad(head: &[u8], counter: u64, last: bool) -> [u8; AAD_HEAD + 9] {
    let mut a = [0u8; AAD_HEAD + 9];
    a[..AAD_HEAD].copy_from_slice(&head[..AAD_HEAD]);
    a[AAD_HEAD..AAD_HEAD + 8].copy_from_slice(&counter.to_le_bytes());
    a[AAD_HEAD + 8] = u8::from(last);
    a
}

/// Agrega a `out` un bloque cifrado: largo, nonce y texto cifrado.
fn seal_chunk(fk: &[u8; 32], head: &[u8], counter: u64, last: bool, plain: &[u8], out: &mut Vec<u8>) -> io::Result<()> {
    let nonce: [u8; 24] = seal::random();
    let ct = seal::encrypt(fk, &nonce, plain, &chunk_aad(head, counter, last)).map_err(io::Error::other)?;
    let len = u32::try_from(ct.len()).map_err(|_| io::Error::other("bloque demasiado grande"))?;
    out.extend_from_slice(&(len | if last { FINAL_BIT } else { 0 }).to_le_bytes());
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&ct);
    Ok(())
}

/// Cifra un archivo completo (bloques de 256 KiB y cierre).
pub fn encrypt_all(dk: &DataKey, data: &[u8]) -> io::Result<Vec<u8>> {
    let (h, fk) = new_header(dk)?;
    let mut out = Vec::with_capacity(HEADER_LEN + data.len() + (data.len() / WRITE_CHUNK + 2) * (REC_HEAD + TAG));
    out.extend_from_slice(&h);
    let mut n = 0u64;
    for part in data.chunks(WRITE_CHUNK) {
        seal_chunk(&fk, &h, n, false, part, &mut out)?;
        n += 1;
    }
    seal_chunk(&fk, &h, n, true, &[], &mut out)?;
    Ok(out)
}

/// Descifra un archivo completo; exige el bloque de cierre.
pub fn decrypt_all(dk: &DataKey, data: &[u8]) -> io::Result<Vec<u8>> {
    let mut r = EncReader::new(data, dk, true)?;
    let mut out = Vec::with_capacity(data.len());
    r.read_to_end(&mut out)?;
    Ok(out)
}

/// Lector en flujo de un archivo cifrado: descifra y verifica bloque a bloque. En modo estricto un
/// archivo sin cierre es un error; en modo tolerante (logs en grabación o cortados por un corte de
/// energía) termina en el último bloque íntegro y lo informa con `incomplete`.
pub struct EncReader<R: Read> {
    r: R,
    fk: Zeroizing<[u8; 32]>,
    head: [u8; AAD_HEAD],
    counter: u64,
    buf: Zeroizing<Vec<u8>>,
    pos: usize,
    done: bool,
    strict: bool,
    incomplete: bool,
    /// Rescate: un bloque que no descifra termina la lectura como incompleta (archivo apartado por
    /// dañado; se recupera lo íntegro anterior al daño).
    salvage: bool,
}

/// Lee exactamente `buf.len()` bytes. Ok(false) si no había nada (fin limpio); error de fin
/// inesperado si quedó a medias.
fn read_full<R: Read>(r: &mut R, buf: &mut [u8]) -> io::Result<bool> {
    let mut got = 0;
    while got < buf.len() {
        match r.read(&mut buf[got..]) {
            Ok(0) if got == 0 => return Ok(false),
            Ok(0) => return Err(io::Error::new(io::ErrorKind::UnexpectedEof, "bloque cortado")),
            Ok(n) => got += n,
            Err(e) if e.kind() == io::ErrorKind::Interrupted => {}
            Err(e) => return Err(e),
        }
    }
    Ok(true)
}

impl<R: Read> EncReader<R> {
    pub fn new(mut r: R, dk: &DataKey, strict: bool) -> io::Result<Self> {
        let mut h = [0u8; HEADER_LEN];
        if !read_full(&mut r, &mut h).map_err(|_| bad(BAD_FILE))? {
            return Err(bad(BAD_FILE));
        }
        let fk = open_header(dk, &h)?;
        let mut head = [0u8; AAD_HEAD];
        head.copy_from_slice(&h[..AAD_HEAD]);
        Ok(EncReader { r, fk, head, counter: 0, buf: Zeroizing::new(Vec::new()), pos: 0, done: false, strict, incomplete: false, salvage: false })
    }

    /// Lector de rescate para un archivo apartado por dañado (ver `salvage`).
    pub fn salvage(mut self) -> Self {
        self.salvage = true;
        self.strict = false;
        self
    }

    /// El archivo terminó sin el bloque de cierre (grabación en curso, corte o archivo truncado).
    pub fn incomplete(&self) -> bool {
        self.incomplete
    }

    fn cut(&mut self) -> io::Result<()> {
        if self.strict {
            return Err(io::Error::new(io::ErrorKind::UnexpectedEof, "Archivo cifrado incompleto (sin bloque de cierre)"));
        }
        self.incomplete = true;
        self.done = true;
        Ok(())
    }

    /// Carga el bloque siguiente en `buf`.
    fn next_chunk(&mut self) -> io::Result<()> {
        let mut lenb = [0u8; 4];
        match read_full(&mut self.r, &mut lenb) {
            Ok(true) => {}
            Ok(false) => return self.cut(),
            Err(e) if e.kind() == io::ErrorKind::UnexpectedEof => return self.cut(),
            Err(e) => return Err(e),
        }
        let raw = u32::from_le_bytes(lenb);
        let last = raw & FINAL_BIT != 0;
        let len = (raw & !FINAL_BIT) as usize;
        if !(TAG..=CHUNK_MAX + TAG).contains(&len) {
            return if self.salvage { self.cut() } else { Err(bad(BAD_FILE)) };
        }
        let mut nonce = [0u8; 24];
        let mut ct = vec![0u8; len];
        for part in [&mut nonce[..], &mut ct[..]] {
            match read_full(&mut self.r, part) {
                Ok(true) => {}
                Ok(false) => return self.cut(),
                Err(e) if e.kind() == io::ErrorKind::UnexpectedEof => return self.cut(),
                Err(e) => return Err(e),
            }
        }
        let plain = match seal::decrypt(&self.fk, &nonce, &ct, &chunk_aad(&self.head, self.counter, last)) {
            Ok(p) => p,
            Err(()) if self.salvage => return self.cut(),
            Err(()) => return Err(bad(BAD_FILE)),
        };
        self.counter += 1;
        if last {
            if !plain.is_empty() {
                return Err(bad(BAD_FILE));
            }
            // Nada puede venir después del cierre.
            let mut one = [0u8; 1];
            if read_full(&mut self.r, &mut one)? {
                return Err(bad(BAD_FILE));
            }
            self.done = true;
        }
        self.buf = plain;
        self.pos = 0;
        Ok(())
    }
}

impl<R: Read> Read for EncReader<R> {
    fn read(&mut self, out: &mut [u8]) -> io::Result<usize> {
        while self.pos >= self.buf.len() {
            if self.done {
                return Ok(0);
            }
            self.next_chunk()?;
        }
        let n = out.len().min(self.buf.len() - self.pos);
        out[..n].copy_from_slice(&self.buf[self.pos..self.pos + n]);
        self.pos += n;
        Ok(n)
    }
}

// ---------- Anexar (logs y auditoría) ----------

struct AppendState {
    file: File,
    fk: Zeroizing<[u8; 32]>,
    head: [u8; AAD_HEAD],
    counter: u64,
    len: u64,
    /// Texto en espera de formar un bloque (logs): se vacía al llegar a `BUF_MAX`, cuando lleva
    /// `FLUSH_EVERY` esperando (un hilo lo revisa), al bloquear y al cerrar.
    pending: Vec<u8>,
    since: Option<Instant>,
    /// Escritores vivos (`Appender`). El cierre lo decide esta cuenta, no la vida del `Arc`: el hilo de
    /// vaciado toma referencias fuertes mientras vacía y no debe demorar el cierre ni hacer reutilizable
    /// un estado cuyo último escritor ya se soltó.
    writers: usize,
    /// Ya se escribió el bloque de cierre: nada más se escribe y `open_append` no lo reutiliza.
    closed: bool,
}

/// Tope del búfer de un log cifrado antes de escribir un bloque.
const BUF_MAX: usize = 16 * 1024;
/// Espera máxima del texto en el búfer: lo que se pierde ante un corte de energía o un cierre forzado.
pub const FLUSH_EVERY: std::time::Duration = std::time::Duration::from_millis(250);

impl AppendState {
    fn flush_pending(&mut self) -> io::Result<()> {
        self.since = None;
        if self.pending.is_empty() {
            return Ok(());
        }
        let p = std::mem::take(&mut self.pending);
        for part in p.chunks(CHUNK_MAX) {
            self.push(part, false)?;
        }
        Ok(())
    }

    fn push(&mut self, plain: &[u8], last: bool) -> io::Result<()> {
        let mut rec = Vec::with_capacity(REC_HEAD + plain.len() + TAG);
        seal_chunk(&self.fk, &self.head, self.counter, last, plain, &mut rec)?;
        if let Err(e) = self.file.write_all(&rec) {
            // Sin bloques a medias: se vuelve al largo anterior para que el siguiente quede bien.
            let _ = self.file.set_len(self.len);
            let _ = self.file.seek(SeekFrom::Start(self.len));
            return Err(e);
        }
        self.len += rec.len() as u64;
        self.counter += 1;
        Ok(())
    }
}

impl AppendState {
    /// Escribe lo pendiente y el bloque de cierre (una sola vez).
    fn close(&mut self) {
        if self.closed {
            return;
        }
        self.closed = true;
        let _ = self.flush_pending();
        if self.push(&[], true).is_ok() {
            let _ = self.file.sync_data();
        }
    }
}

impl Drop for AppendState {
    /// Red de seguridad: normalmente ya lo cerró el último `Appender`.
    fn drop(&mut self) {
        self.close();
    }
}

/// Escritor en modo anexar de un archivo cifrado. Dos escritores del mismo archivo (dos pestañas
/// que anexan al mismo log) comparten el estado: los bloques quedan en orden y numerados. Al soltar
/// el último se cierra el archivo en ese mismo momento (ver `AppendState::writers`).
pub struct Appender(Arc<Mutex<AppendState>>);

impl Clone for Appender {
    fn clone(&self) -> Self {
        self.0.lock().unwrap_or_else(|e| e.into_inner()).writers += 1;
        Appender(self.0.clone())
    }
}

impl Drop for Appender {
    fn drop(&mut self) {
        let mut st = self.0.lock().unwrap_or_else(|e| e.into_inner());
        st.writers = st.writers.saturating_sub(1);
        if st.writers == 0 {
            st.close();
        }
    }
}

impl Appender {
    /// Escribe ya (un bloque por llamada): auditoría, donde cada evento debe quedar en disco.
    pub fn append(&self, plain: &[u8]) -> io::Result<()> {
        let mut st = self.0.lock().unwrap_or_else(|e| e.into_inner());
        st.flush_pending()?;
        for part in plain.chunks(CHUNK_MAX) {
            st.push(part, false)?;
        }
        Ok(())
    }

    /// Agrupa en el búfer (logs): con eco carácter a carácter cada tecla sería un bloque de 45 bytes.
    /// Se escribe al juntar 16 KiB, a los 250 ms (hilo de vaciado), al bloquear y al cerrar.
    pub fn append_buffered(&self, plain: &[u8]) -> io::Result<()> {
        if plain.is_empty() {
            return Ok(());
        }
        let mut st = self.0.lock().unwrap_or_else(|e| e.into_inner());
        st.pending.extend_from_slice(plain);
        st.since.get_or_insert_with(Instant::now);
        if st.pending.len() >= BUF_MAX {
            st.flush_pending()?;
        }
        drop(st);
        start_flusher();
        Ok(())
    }
}

impl Write for Appender {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        self.append_buffered(buf)?;
        Ok(buf.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        self.0.lock().unwrap_or_else(|e| e.into_inner()).flush_pending()
    }
}

/// Escribe lo pendiente de todos los logs cifrados abiertos (al bloquear y antes de cerrar la app).
/// `older`: solo lo que lleva al menos ese tiempo esperando.
pub fn flush_all(older: Option<std::time::Duration>) {
    let open: Vec<_> = appenders().lock().unwrap_or_else(|e| e.into_inner()).values().filter_map(Weak::upgrade).collect();
    for st in open {
        let mut st = st.lock().unwrap_or_else(|e| e.into_inner());
        // Un archivo cerrado no recibe nada después de su bloque de cierre.
        if st.closed {
            continue;
        }
        if older.is_none_or(|d| st.since.is_some_and(|s| s.elapsed() >= d)) {
            let _ = st.flush_pending();
        }
    }
}

/// Hilo de vaciado: existe solo desde que se abre el primer log cifrado (nunca con el modo apagado).
fn start_flusher() {
    static STARTED: AtomicBool = AtomicBool::new(false);
    if STARTED.swap(true, Ordering::SeqCst) {
        return;
    }
    std::thread::spawn(|| loop {
        std::thread::sleep(FLUSH_EVERY / 2);
        flush_all(Some(FLUSH_EVERY));
    });
}

// ---------- Archivos dañados apartados ----------

fn damaged() -> &'static Mutex<Vec<String>> {
    static D: OnceLock<Mutex<Vec<String>>> = OnceLock::new();
    D.get_or_init(Mutex::default)
}

type Notify = Box<dyn Fn(&str) + Send + Sync>;

fn notifier() -> &'static OnceLock<Notify> {
    static N: OnceLock<Notify> = OnceLock::new();
    &N
}

/// Aviso a la interfaz cuando un archivo cifrado dañado se aparta (lo instala `datamode`).
pub fn set_notifier(f: Notify) {
    let _ = notifier().set(f);
}

/// Archivos apartados por dañados en esta ejecución (hasta que el usuario los vea).
pub fn damaged_list() -> Vec<String> {
    damaged().lock().unwrap_or_else(|e| e.into_inner()).clone()
}

pub fn damaged_clear() {
    damaged().lock().unwrap_or_else(|e| e.into_inner()).clear();
}

/// `x.log.nte` → `x.danado-<fecha>.log.nte` (sigue cifrado y en la carpeta, con un nombre que los
/// recorridos reconocen y que la conversión descifra en modo rescate). Los nombres que genera el modo
/// cifrado son solo ASCII: en FAT, exFAT o HFS+ desde macOS un nombre con «ñ» vuelve en NFD.
fn damaged_name(phys: &Path) -> PathBuf {
    let logical = phys.to_str().and_then(|s| s.strip_suffix(DOT_EXT)).map(PathBuf::from).unwrap_or_else(|| phys.to_path_buf());
    with_ext(&aside_name(&logical, DAMAGED))
}

pub const DAMAGED: &str = ".danado-";
/// Marca con «ñ» de la versión anterior, en NFC y en NFD: se sigue reconociendo al leer.
const DAMAGED_OLD: [&str; 2] = [".da\u{f1}ado-", ".dan\u{303}ado-"];

fn appenders() -> &'static Mutex<HashMap<PathBuf, Weak<Mutex<AppendState>>>> {
    static M: OnceLock<Mutex<HashMap<PathBuf, Weak<Mutex<AppendState>>>>> = OnceLock::new();
    M.get_or_init(Mutex::default)
}

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum OpenMode {
    /// Crea si no existe o sigue al final.
    Append,
    /// Solo si no existe (un log nuevo nunca pisa otro).
    CreateNew,
    /// Solo si existe (reconexión).
    Existing,
}

fn open_raw(phys: &Path, mode: OpenMode) -> io::Result<File> {
    let mut o = OpenOptions::new();
    o.read(true).write(true);
    match mode {
        OpenMode::Append => {
            o.create(true);
        }
        OpenMode::CreateNew => {
            o.create_new(true);
        }
        OpenMode::Existing => {}
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        o.mode(0o600);
        // Un enlace simbólico plantado en lugar del archivo no se sigue.
        o.custom_flags(libc::O_NOFOLLOW);
    }
    o.open(phys)
}

/// Abre (o crea) un archivo cifrado para anexar. Devuelve el escritor y si ya tenía contenido.
/// Un archivo existente se retoma: se verifica su último bloque, se quita el cierre (o los bytes de
/// un bloque a medias tras un corte) y se sigue con el número siguiente y nonces nuevos.
pub fn open_append(phys: &Path, dk: Option<&DataKey>, mode: OpenMode) -> io::Result<(Appender, bool)> {
    let mut map = appenders().lock().unwrap_or_else(|e| e.into_inner());
    if mode != OpenMode::CreateNew {
        if let Ok(canon) = phys.canonicalize() {
            if let Some(st) = map.get(&canon).and_then(Weak::upgrade) {
                // Solo se comparte un estado con escritores vivos; uno cerrado (que el hilo de vaciado
                // todavía tiene tomado) no se reutiliza: su archivo pudo renombrarse o reemplazarse.
                let mut g = st.lock().unwrap_or_else(|e| e.into_inner());
                if !g.closed {
                    g.writers += 1;
                    let had = g.counter > 0;
                    drop(g);
                    return Ok((Appender(st), had));
                }
            }
        }
    }
    let dk = dk.ok_or_else(locked_err)?;
    let mut file = open_raw(phys, mode)?;
    let flen = file.metadata()?.len();
    let resumed = if flen == 0 { None } else { resume_state(file.try_clone()?, flen, dk)? };
    let st = match resumed {
        Some(st) => st,
        None => {
            if flen > 0 {
                // Dañado antes de la cola (no es un corte al escribir): no se trunca ni se escribe
                // encima. Se aparta con otro nombre y se sigue en un archivo nuevo, con aviso.
                drop(file);
                let away = damaged_name(phys);
                fs::rename(phys, &away)?;
                let shown = away.to_string_lossy().into_owned();
                damaged().lock().unwrap_or_else(|e| e.into_inner()).push(shown.clone());
                if let Some(n) = notifier().get() {
                    n(&shown);
                }
                file = open_raw(phys, OpenMode::CreateNew)?;
            }
            let (h, fk) = new_header(dk)?;
            file.write_all(&h)?;
            let mut head = [0u8; AAD_HEAD];
            head.copy_from_slice(&h[..AAD_HEAD]);
            AppendState { file, fk, head, counter: 0, len: HEADER_LEN as u64, pending: Vec::new(), since: None, writers: 1, closed: false }
        }
    };
    let had = st.counter > 0;
    let arc = Arc::new(Mutex::new(st));
    map.retain(|_, w| w.strong_count() > 0);
    if let Ok(canon) = phys.canonicalize() {
        map.insert(canon, Arc::downgrade(&arc));
    }
    Ok((Appender(arc), had))
}

/// Todo lo que hay desde `from` hasta `flen` son ceros (lo que deja un corte en FAT o exFAT).
fn zero_tail(f: &mut File, from: u64, flen: u64) -> io::Result<bool> {
    if from >= flen {
        return Ok(true);
    }
    f.seek(SeekFrom::Start(from))?;
    let mut buf = vec![0u8; 64 * 1024];
    let mut left = flen - from;
    while left > 0 {
        let cap = buf.len() as u64;
        let n = f.read(&mut buf[..left.min(cap) as usize])?;
        if n == 0 {
            break;
        }
        if buf[..n].iter().any(|&b| b != 0) {
            return Ok(false);
        }
        left -= n as u64;
    }
    Ok(true)
}

/// Retoma un archivo cifrado para anexar. Verifica todos sus bloques: solo la cola incompleta de una
/// escritura cortada (largo que pasa el fin del archivo o menos de 4 bytes) se recorta. Cualquier
/// otro daño (cabecera, un bloque del medio o el último, un cierre fuera de lugar) devuelve `None`:
/// quien llama aparta el archivo, nunca lo trunca en silencio.
fn resume_state(mut file: File, flen: u64, dk: &DataKey) -> io::Result<Option<AppendState>> {
    let mut h = [0u8; HEADER_LEN];
    file.seek(SeekFrom::Start(0))?;
    if !matches!(read_full(&mut file, &mut h), Ok(true)) {
        return Ok(None);
    }
    let Ok(fk) = open_header(dk, &h) else { return Ok(None) };
    let mut head = [0u8; AAD_HEAD];
    head.copy_from_slice(&h[..AAD_HEAD]);
    // Para mirar la cola sin perder la posición del lector.
    let mut probe = file.try_clone()?;
    let mut r = BufReader::new(&mut file);
    let mut pos = HEADER_LEN as u64;
    let mut idx = 0u64;
    // Posición y número del bloque de cierre (si el archivo quedó cerrado).
    let mut fin_at: Option<(u64, u64)> = None;
    loop {
        if flen - pos < 4 {
            break; // cola incompleta (o fin exacto)
        }
        let mut lenb = [0u8; 4];
        r.read_exact(&mut lenb)?;
        let raw = u32::from_le_bytes(lenb);
        let len = (raw & !FINAL_BIT) as usize;
        let last = raw & FINAL_BIT != 0;
        if !(TAG..=CHUNK_MAX + TAG).contains(&len) || fin_at.is_some() {
            // Ceros hasta el final (FAT extiende el archivo antes de escribir): cola de un corte. Si
            // no, es daño (largo imposible o algo después del cierre).
            if zero_tail(&mut probe, pos, flen)? {
                break;
            }
            return Ok(None);
        }
        let end = pos + (REC_HEAD + len) as u64;
        if end > flen {
            break; // el último bloque quedó a medias al escribir: se recorta
        }
        let mut nonce = [0u8; 24];
        let mut ct = vec![0u8; len];
        r.read_exact(&mut nonce)?;
        r.read_exact(&mut ct)?;
        let ok = seal::decrypt(&fk, &nonce, &ct, &chunk_aad(&head, idx, last)).is_ok_and(|p| !last || p.is_empty());
        if !ok {
            // Último bloque con el largo escrito y el resto en ceros, o todo en ceros: corte al escribir.
            if zero_tail(&mut probe, pos, flen)? || (end == flen && zero_tail(&mut probe, pos + 4, flen)?) {
                break;
            }
            return Ok(None);
        }
        if last {
            fin_at = Some((pos, idx));
        }
        pos = end;
        idx += 1;
    }
    drop(r);
    let (cut_at, counter) = match fin_at {
        Some((at, i)) => (at, i),
        None => (pos, idx),
    };
    file.set_len(cut_at)?;
    file.seek(SeekFrom::Start(cut_at))?;
    Ok(Some(AppendState { file, fk, head, counter, len: cut_at, pending: Vec::new(), since: None, writers: 1, closed: false }))
}

// ---------- Estado de la carpeta cifrada ----------

/// Estado compartido de una carpeta cifrada: la DEK (si está desbloqueada), si hay una conversión
/// en curso y el último uso (para el bloqueo automático).
#[derive(Default)]
pub struct Shared {
    key: RwLock<Option<Arc<DataKey>>>,
    busy: AtomicBool,
    last_use: Mutex<Option<(Instant, SystemTime)>>,
}

impl Shared {
    pub fn new() -> Arc<Shared> {
        Arc::new(Shared::default())
    }

    /// Fija o borra la DEK. Al borrarla, quien la tenga tomada para una operación en curso la suelta
    /// al terminar y se borra de memoria.
    pub fn set_key(&self, k: Option<DataKey>) {
        let mut g = self.key.write().unwrap_or_else(|e| e.into_inner());
        *g = k.map(Arc::new);
        drop(g);
        self.touch();
    }

    pub fn unlocked(&self) -> bool {
        self.key.read().unwrap_or_else(|e| e.into_inner()).is_some()
    }

    pub fn set_busy(&self, on: bool) {
        self.busy.store(on, Ordering::SeqCst);
    }

    pub fn busy(&self) -> bool {
        self.busy.load(Ordering::SeqCst)
    }

    pub fn touch(&self) {
        *self.last_use.lock().unwrap_or_else(|e| e.into_inner()) = Some((Instant::now(), SystemTime::now()));
    }

    pub fn last_use(&self) -> Option<(Instant, SystemTime)> {
        *self.last_use.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// La DEK para una operación de datos. Error si está bloqueada o convirtiendo. No cuenta como
    /// actividad: una tarea de fondo o un agente que consulta no deben mantener la carpeta abierta (el
    /// plazo de inactividad lo renuevan solo el desbloqueo y la actividad del usuario, `touch`).
    pub fn key(&self) -> io::Result<Arc<DataKey>> {
        if self.busy() {
            return Err(io::Error::new(io::ErrorKind::ResourceBusy, BUSY));
        }
        self.key.read().unwrap_or_else(|e| e.into_inner()).clone().ok_or_else(locked_err)
    }

    /// La DEK sin mirar la conversión (la usa la propia conversión).
    pub fn key_for_conversion(&self) -> Option<Arc<DataKey>> {
        self.key.read().unwrap_or_else(|e| e.into_inner()).clone()
    }
}

static ANY: AtomicBool = AtomicBool::new(false);

type Roots = RwLock<Vec<(PathBuf, Arc<Shared>)>>;

fn roots() -> &'static Roots {
    static R: OnceLock<Roots> = OnceLock::new();
    R.get_or_init(RwLock::default)
}

/// Registra una carpeta (y su ruta canónica) como cifrada con el estado `sh`.
pub fn register(dir: &Path, sh: &Arc<Shared>) {
    let mut r = roots().write().unwrap_or_else(|e| e.into_inner());
    let mut add = |p: PathBuf| {
        if !r.iter().any(|(q, s)| *q == p && Arc::ptr_eq(s, sh)) {
            r.push((p, sh.clone()));
        }
    };
    add(dir.to_path_buf());
    if let Ok(c) = dir.canonicalize() {
        add(c);
    }
    ANY.store(true, Ordering::SeqCst);
}

/// Quita todas las carpetas registradas con `sh` (al desactivar el modo).
pub fn unregister(sh: &Arc<Shared>) {
    let mut r = roots().write().unwrap_or_else(|e| e.into_inner());
    r.retain(|(_, s)| !Arc::ptr_eq(s, sh));
    ANY.store(!r.is_empty(), Ordering::SeqCst);
}

/// Estado cifrado que rige `p` (la carpeta registrada más específica que la contiene).
pub fn shared_for(p: &Path) -> Option<Arc<Shared>> {
    if !ANY.load(Ordering::Relaxed) {
        return None;
    }
    let r = roots().read().unwrap_or_else(|e| e.into_inner());
    r.iter().filter(|(root, _)| p.starts_with(root)).max_by_key(|(root, _)| root.as_os_str().len()).map(|(_, s)| s.clone())
}

/// Archivos que no se cifran con la DEK: ya cifrados por su cuenta (bóveda, notas protegidas), la
/// llave de datos, el diario de conversión, el aviso para versiones anteriores, nombres físicos
/// `.nte` y temporales.
fn exempt(p: &Path) -> bool {
    let Some(name) = p.file_name().and_then(|n| n.to_str()) else { return true };
    matches!(name, KEY_FILE | JOURNAL_FILE | README_FILE | VAULT_FILE | ROOTS_FILE | LOCK_FILE | ROOT_MARK) || name.ends_with(DOT_EXT) || name.ends_with(".ntenc") || name.ends_with(".tmp")
}

fn with_ext(p: &Path) -> PathBuf {
    let mut s = p.as_os_str().to_os_string();
    s.push(DOT_EXT);
    PathBuf::from(s)
}

/// Si `p` vive en una carpeta cifrada: su estado y su nombre físico (`p.nte`).
fn target(p: &Path) -> Option<(Arc<Shared>, PathBuf)> {
    let sh = shared_for(p)?;
    if exempt(p) {
        return None;
    }
    Some((sh, with_ext(p)))
}

/// true si `p` (nombre lógico) se guarda cifrado.
pub fn is_encrypted(p: &Path) -> bool {
    target(p).is_some()
}

/// La carpeta (o una que la contiene) está cifrada y bloqueada o convirtiéndose.
pub fn unavailable(dir: &Path) -> Option<&'static str> {
    let sh = shared_for(dir)?;
    if sh.busy() {
        Some(BUSY)
    } else if !sh.unlocked() {
        Some(LOCKED)
    } else {
        None
    }
}

/// DEK de la carpeta que contiene `dir`: Ok(None) si no está cifrada.
pub fn key_for(dir: &Path) -> io::Result<Option<Arc<DataKey>>> {
    match shared_for(dir) {
        None => Ok(None),
        Some(sh) => sh.key().map(Some),
    }
}

/// Nombre en disco de un archivo lógico.
pub fn physical(p: &Path) -> PathBuf {
    match target(p) {
        Some((_, phys)) => phys,
        None => p.to_path_buf(),
    }
}

// ---------- Capa de archivos (mismo contrato que std::fs) ----------

pub fn read(p: &Path) -> io::Result<Vec<u8>> {
    match target(p) {
        None => fs::read(p),
        Some((sh, phys)) => {
            let dk = sh.key()?;
            let bytes = fs::read(&phys)?;
            decrypt_all(&dk, &bytes)
        }
    }
}

pub fn read_to_string(p: &Path) -> io::Result<String> {
    String::from_utf8(read(p)?).map_err(|_| bad("El archivo no es texto UTF-8"))
}

/// Escritura atómica (`seal::write_atomic`), cifrada si corresponde.
pub fn write_atomic(p: &Path, data: &[u8]) -> Result<(), String> {
    match target(p) {
        None => seal::write_atomic(p, data),
        Some((sh, phys)) => {
            let dk = sh.key().map_err(|e| e.to_string())?;
            let enc = encrypt_all(&dk, data).map_err(|e| e.to_string())?;
            seal::write_atomic(&phys, &enc)
        }
    }
}

pub fn metadata(p: &Path) -> io::Result<fs::Metadata> {
    fs::metadata(physical(p))
}

pub fn exists(p: &Path) -> bool {
    physical(p).exists()
}

pub fn remove_file(p: &Path) -> io::Result<()> {
    fs::remove_file(physical(p))
}

pub fn rename(a: &Path, b: &Path) -> io::Result<()> {
    fs::rename(physical(a), physical(b))
}

/// Copia: entre dos nombres de la misma carpeta cifrada se copia el archivo cifrado tal cual.
pub fn copy(a: &Path, b: &Path) -> io::Result<u64> {
    let (pa, pb) = (physical(a), physical(b));
    if is_encrypted(a) == is_encrypted(b) {
        let n = fs::copy(&pa, &pb)?;
        crate::session_store::restrict(&pb);
        return Ok(n);
    }
    let data = read(a)?;
    write_atomic(b, &data).map_err(io::Error::other)?;
    Ok(data.len() as u64)
}

pub fn restrict(p: &Path) {
    crate::session_store::restrict(&physical(p));
}

pub fn set_modified(p: &Path, t: SystemTime) {
    let _ = File::options().write(true).open(physical(p)).and_then(|f| f.set_modified(t));
}

/// Entrada de una carpeta con su nombre lógico.
pub struct Entry {
    pub path: PathBuf,
    pub name: String,
    pub file_type: fs::FileType,
    phys: PathBuf,
}

impl Entry {
    pub fn metadata(&self) -> io::Result<fs::Metadata> {
        fs::symlink_metadata(&self.phys)
    }
    pub fn is_dir(&self) -> bool {
        self.file_type.is_dir()
    }
}

/// Lista una carpeta con nombres lógicos. En una carpeta cifrada los archivos `x.nte` aparecen como
/// `x`, los exentos (bóveda, notas protegidas) tal cual, y un archivo en claro que debería estar
/// cifrado no aparece (no se lee en silencio: lo informa `plaintext_found`).
pub fn read_dir(dir: &Path) -> io::Result<Vec<Entry>> {
    let enc = shared_for(dir).is_some();
    let mut out = Vec::new();
    for e in fs::read_dir(dir)?.flatten() {
        let Ok(file_type) = e.file_type() else { continue };
        let name = e.file_name().to_string_lossy().into_owned();
        let phys = e.path();
        if enc && file_type.is_file() {
            if let Some(base) = name.strip_suffix(DOT_EXT) {
                out.push(Entry { path: dir.join(base), name: base.to_string(), file_type, phys });
            } else if exempt(&phys) && !name.ends_with(".tmp") {
                out.push(Entry { path: phys.clone(), name, file_type, phys });
            }
            continue;
        }
        out.push(Entry { path: phys.clone(), name, file_type, phys });
    }
    Ok(out)
}

/// Lector en flujo de un archivo lógico (tolerante con un log sin cierre). Devuelve también si está
/// cifrado; el texto en claro nunca toca el disco.
pub fn open_read(p: &Path) -> io::Result<Box<dyn Read + Send>> {
    match target(p) {
        None => Ok(Box::new(File::open(p)?)),
        Some((sh, phys)) => {
            let dk = sh.key()?;
            Ok(Box::new(EncReader::new(File::open(phys)?, &dk, false)?))
        }
    }
}

/// Envuelve un archivo físico ya abierto (y validado por quien llama) para leerlo descifrado.
pub fn wrap_reader(file: File, dk: &DataKey) -> io::Result<EncReader<File>> {
    EncReader::new(file, dk, false)
}

// ---------- Archivos cubiertos, conversión y archivos en claro ----------

/// Carpetas de la app que cubre el modo cifrado.
#[derive(Clone, Debug)]
pub struct Layout {
    /// Nombres de log que genera la app (patrón configurado y el predeterminado).
    pub names: LogNames,
    pub data: PathBuf,
    /// Carpetas de logs: la primera es la predeterminada `data/logs` (de la app); las demás las eligió
    /// el usuario (la actual y las usadas antes con el modo activo, de `datakey.roots`).
    pub logs: Vec<PathBuf>,
}

impl Layout {
    pub fn new(data: &Path, extra_logs: &[PathBuf]) -> Layout {
        let mut logs = vec![data.join("logs")];
        for x in extra_logs {
            if !logs.contains(x) {
                logs.push(x.clone());
            }
        }
        Layout { data: data.to_path_buf(), logs, names: LogNames::new(&[], false) }
    }

    /// Patrón de nombre de log configurado (`logPattern`, `logRotateDaily`): en una carpeta de logs
    /// elegida por el usuario solo se cifran en claro los archivos que calzan con él o con el predeterminado.
    pub fn with_log_pattern(mut self, pattern: Option<&str>, rotate_daily: bool) -> Layout {
        self.names = LogNames::new(&pattern.into_iter().map(str::to_string).collect::<Vec<_>>(), rotate_daily);
        self
    }

    /// Carpetas de logs elegidas por el usuario (no la de la app).
    fn user_logs(&self) -> &[PathBuf] {
        &self.logs[1..]
    }
}

#[derive(serde::Serialize, serde::Deserialize, Default)]
struct RootsFile {
    logs: Vec<PathBuf>,
}

/// Carpetas de logs elegidas por el usuario que se usaron con el modo activo.
pub fn read_roots(data: &Path) -> Vec<PathBuf> {
    fs::read(data.join(ROOTS_FILE)).ok().and_then(|b| serde_json::from_slice::<RootsFile>(&b).ok()).map(|r| r.logs).unwrap_or_default()
}

/// Lectura estricta para desactivar: falta o no se puede leer `datakey.roots` (en una carpeta
/// cifrada siempre existe) es un error, porque no se sabría qué carpetas de logs tienen datos cifrados.
pub fn read_roots_checked(data: &Path) -> Result<Vec<PathBuf>, String> {
    match fs::read(data.join(ROOTS_FILE)) {
        Ok(b) => serde_json::from_slice::<RootsFile>(&b).map(|r| r.logs).map_err(|_| format!("No se puede leer {ROOTS_FILE}: no se sabe qué carpetas de logs propias tienen logs cifrados")),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Err(format!("Falta {ROOTS_FILE}: no se sabe qué carpetas de logs propias tienen logs cifrados")),
        Err(e) => Err(format!("No se puede leer {ROOTS_FILE}: {e}")),
    }
}

fn key_id(data: &Path) -> Option<String> {
    KeyFile::read(data).ok().flatten().map(|k| k.id_hex())
}

/// La carpeta de logs tiene la marca de esta carpeta cifrada.
fn root_mark_ok(root: &Path, id: &str) -> bool {
    fs::read_to_string(root.join(ROOT_MARK)).is_ok_and(|s| s.trim() == id)
}

fn write_root_mark(root: &Path, id: &str) -> Result<(), String> {
    seal::write_atomic(&root.join(ROOT_MARK), id.as_bytes()).map_err(|e| format!("No se pudo marcar la carpeta de logs {}: {e}", root.display()))
}

/// Carpetas registradas sin marca (de una versión anterior) que tienen logs cifrados: se marcan.
/// Una carpeta vacía o un punto de montaje sin montar no se marca.
pub fn adopt_root_marks(layout: &Layout) {
    let Some(id) = key_id(&layout.data) else { return };
    for r in layout.user_logs() {
        if r.is_dir() && !r.join(ROOT_MARK).exists() {
            let one = Layout { names: layout.names.clone(), data: layout.data.clone(), logs: vec![r.clone()] };
            if !all_nte(&one).0.is_empty() {
                let _ = write_root_mark(r, &id);
            }
        }
    }
}

/// Agrega carpetas de logs a `datakey.roots` (sin duplicados) y deja su marca en cada una.
pub fn add_roots(data: &Path, extra: &[PathBuf]) -> Result<(), String> {
    let id = key_id(data).ok_or("Falta la llave de datos")?;
    for x in extra {
        fs::create_dir_all(x).map_err(|e| e.to_string())?;
        write_root_mark(x, &id)?;
    }
    let mut r = RootsFile { logs: read_roots(data) };
    let before = r.logs.len();
    for x in extra {
        if !r.logs.contains(x) {
            r.logs.push(x.clone());
        }
    }
    if r.logs.len() == before && data.join(ROOTS_FILE).exists() {
        return Ok(());
    }
    seal::write_atomic(&data.join(ROOTS_FILE), &serde_json::to_vec_pretty(&r).map_err(|e| e.to_string())?)
}

/// Una carpeta de logs elegida por el usuario no puede ser la de datos ni estar dentro de ella (salvo
/// `data/logs`, que es la predeterminada): ahí se mezclaría con los datos de la app y los recorridos
/// no la cubrirían completa. Compara rutas reales.
pub fn logs_dir_conflicts(data: &Path, dir: &Path) -> bool {
    let (Ok(d), Ok(x)) = (data.canonicalize(), dir.canonicalize()) else { return false };
    let own = data.join("logs").canonicalize().ok();
    x.starts_with(&d) && Some(&x) != own.as_ref() || d.starts_with(&x)
}

const DATA_STEMS: [&str; 3] = ["sessions", "settings", "topology"];
const ASIDE: &str = ".encontrado-";

/// Quita la marca `.encontrado-<fecha>` de un nombre apartado (claro encontrado en conflicto).
fn strip_aside(name: &str) -> String {
    match name.find(ASIDE) {
        Some(i) => {
            let rest = &name[i + ASIDE.len()..];
            let digits = rest.bytes().take_while(u8::is_ascii_digit).count();
            if digits == 0 {
                return name.to_string();
            }
            format!("{}{}", &name[..i], &rest[digits..])
        }
        None => name.to_string(),
    }
}

/// Archivos de la raíz de datos que se cifran: los tres archivos de datos y sus respaldos, y el historial.
fn data_root_file(name: &str) -> bool {
    let name = strip_aside(name);
    let digits = |s: &str| !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit());
    if matches!(name.as_str(), "recent_targets.json" | "command_history.json") {
        return true;
    }
    DATA_STEMS.iter().any(|stem| {
        let file = format!("{stem}.json");
        name == file
            || name == format!("{file}.bak")
            || name == format!("{file}.bak2")
            || name.strip_prefix(&format!("{stem}.v")).and_then(|r| r.strip_suffix(".bak.json")).is_some_and(digits)
            || name.strip_prefix(&format!("{stem}.corrupt-")).and_then(|r| r.strip_suffix(".json")).is_some_and(digits)
    })
}

fn ext_is(name: &str, exts: &[&str]) -> bool {
    Path::new(name).extension().and_then(|e| e.to_str()).is_some_and(|e| exts.iter().any(|x| e.eq_ignore_ascii_case(x)))
}

/// Un archivo encontrado al recorrer: su nombre lógico, el físico y si ya está cifrado.
#[derive(Clone, Debug)]
pub struct Found {
    pub logical: PathBuf,
    pub phys: PathBuf,
    pub encrypted: bool,
}

type Accept<'a> = &'a dyn Fn(&str, bool) -> bool;

/// Nombres de log que genera la app con un patrón (`logfile::render`): ruta relativa a la carpeta de
/// logs con `{folder}` como subcarpetas, `{date}` de 8 dígitos, `{time}` de 6, `{session}` y `{host}`
/// saneados, sufijo `-N` opcional y `.log`. Admite marcas combinantes (nombres en NFD de macOS en FAT,
/// exFAT o HFS+). Lo que no calza no se toca: se informa como "no cifrado" para que el usuario decida.
#[derive(Clone, Debug)]
pub struct LogNames(regex::Regex);

const NAME_PART: &str = r"[\p{L}\p{M}\p{N}._-]+";

fn pattern_regex(pattern: &str, rotate_daily: bool) -> String {
    let mut pat = if pattern.trim().is_empty() { crate::logfile::DEFAULT_PATTERN.to_string() } else { pattern.to_string() };
    if rotate_daily && !pat.contains("{date}") {
        pat.push_str("_{date}");
    }
    let mut out = String::new();
    let mut rest = pat.as_str();
    while let Some(c) = rest.chars().next() {
        if c == '{' {
            if let Some(end) = rest.find('}') {
                let token = match &rest[1..end] {
                    "session" | "host" => Some(NAME_PART),
                    "date" => Some(r"\d{8}"),
                    "time" => Some(r"\d{6}"),
                    "folder" => Some(r"(?:[^/]+/)*"),
                    _ => None,
                };
                if let Some(t) = token {
                    out.push_str(t);
                    let folder = &rest[1..end] == "folder";
                    rest = &rest[end + 1..];
                    if folder {
                        rest = rest.strip_prefix(['/', '\\']).unwrap_or(rest);
                    }
                    continue;
                }
            }
        }
        if c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.') {
            out.push_str(&regex::escape(&c.to_string()));
        } else if c.is_alphanumeric() {
            // Letra no ASCII: en disco puede venir descompuesta (NFD).
            out.push_str(r"[\p{L}\p{M}\p{N}]{1,4}");
        } else {
            out.push('_');
        }
        rest = &rest[c.len_utf8()..];
    }
    out
}

impl LogNames {
    pub fn new(patterns: &[String], rotate_daily: bool) -> LogNames {
        let mut alts: Vec<String> = Vec::new();
        for p in patterns.iter().map(String::as_str).chain([crate::logfile::DEFAULT_PATTERN]) {
            for rot in [false, rotate_daily] {
                let r = pattern_regex(p, rot);
                if !alts.contains(&r) {
                    alts.push(r);
                }
            }
        }
        let re = format!(r"^(?:{})(?:-\d{{1,3}})?\.log$", alts.join("|"));
        LogNames(regex::Regex::new(&re).unwrap_or_else(|_| regex::Regex::new(r"^\b$").expect("regex vacía")))
    }

    /// `rel`: ruta dentro de la carpeta de logs, con "/".
    pub fn matches(&self, rel: &str) -> bool {
        self.0.is_match(rel)
    }
}

fn consider(dir: &Path, e: &fs::DirEntry, accept: Accept, out: &mut Vec<Found>) {
    let Ok(ft) = e.file_type() else { return };
    if !ft.is_file() {
        return;
    }
    let name = e.file_name().to_string_lossy().into_owned();
    if name.ends_with(".tmp") || exempt(Path::new(&name)) && !name.ends_with(DOT_EXT) {
        return;
    }
    let (logical, encrypted) = match name.strip_suffix(DOT_EXT) {
        Some(b) => (b.to_string(), true),
        None => (name.clone(), false),
    };
    if logical.ends_with(".tmp") || !accept(&logical, encrypted) {
        return;
    }
    out.push(Found { logical: dir.join(&logical), phys: e.path(), encrypted });
}

fn scan_dir(dir: &Path, accept: Accept, out: &mut Vec<Found>) {
    let Ok(rd) = fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        consider(dir, &e, accept, out);
    }
}

/// Resultado de un recorrido: lo cubierto, los logs en claro de carpetas del usuario cuyo nombre no
/// calza con los de la app (no se tocan) y las carpetas más profundas que el límite.
#[derive(Default)]
pub struct Walked {
    pub found: Vec<Found>,
    pub uncertain: Vec<PathBuf>,
    pub deep: Vec<PathBuf>,
}

struct LogScan<'a> {
    skip: &'a [PathBuf],
    /// Carpeta elegida por el usuario: en claro solo se toman los nombres de la app.
    user: Option<&'a LogNames>,
}

fn scan_logs(dir: &Path, rel: &str, depth: usize, ls: &LogScan, w: &mut Walked) {
    let Ok(rd) = fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let Ok(ft) = e.file_type() else { continue };
        let name = e.file_name().to_string_lossy().into_owned();
        if ft.is_dir() {
            let p = e.path();
            if p.canonicalize().map(|c| ls.skip.contains(&c)).unwrap_or(true) {
                continue;
            }
            if depth + 1 >= MAX_DEPTH {
                w.deep.push(p);
                continue;
            }
            scan_logs(&p, &format!("{rel}{name}/"), depth + 1, ls, w);
            continue;
        }
        let names = ls.user;
        let mut odd = false;
        consider(
            dir,
            &e,
            &|n, enc| {
                if !ext_is(n, &["log", "txt"]) {
                    return false;
                }
                // Cifrados: todos (solo la app escribe `.nte`). En claro, en una carpeta del usuario,
                // solo lo que calza con los nombres que genera la app.
                match names {
                    Some(nm) if !enc => nm.matches(&format!("{rel}{}", strip_aside(n))),
                    _ => true,
                }
            },
            &mut w.found,
        );
        if names.is_some() && ft.is_file() && !name.ends_with(DOT_EXT) && ext_is(&name, &["log", "txt"]) && !w.found.last().is_some_and(|f| f.phys == e.path()) {
            odd = true;
        }
        if odd {
            w.uncertain.push(e.path());
        }
    }
}

/// Todos los archivos cubiertos (en claro y cifrados) de la carpeta. No sigue enlaces simbólicos.
pub fn walk(layout: &Layout) -> Vec<Found> {
    walk_full(layout).found
}

/// Logs en claro de carpetas del usuario que no calzan con los nombres de la app (no se cifran).
pub fn uncertain(layout: &Layout) -> Vec<PathBuf> {
    walk_full(layout).uncertain
}

pub fn walk_full(layout: &Layout) -> Walked {
    let mut w = Walked::default();
    let mut out: Vec<Found> = Vec::new();
    let d = &layout.data;
    scan_dir(d, &|n, _| data_root_file(n), &mut out);
    scan_dir(&d.join("notes"), &|n, _| ext_is(n, &["txt"]), &mut out);
    if let Ok(rd) = fs::read_dir(d.join("backups")) {
        for e in rd.flatten() {
            if e.file_type().is_ok_and(|t| t.is_dir()) {
                scan_dir(&e.path(), &|_, _| true, &mut out);
            }
        }
    }
    // Auditoría MCP y sus subcarpetas (las lecturas van aparte, en `mcp-audit/lecturas`).
    let audit: Accept = &|n, _| n.starts_with("audit") && ext_is(n, &["jsonl"]);
    scan_dir(&d.join("mcp-audit"), audit, &mut out);
    if let Ok(rd) = fs::read_dir(d.join("mcp-audit")) {
        for e in rd.flatten() {
            if e.file_type().is_ok_and(|t| t.is_dir()) {
                scan_dir(&e.path(), audit, &mut out);
            }
        }
    }
    w.found.append(&mut out);
    // Una carpeta de logs no recorre las otras carpetas de la app que pueda contener.
    let canon = |p: &Path| p.canonicalize().ok();
    let skip: Vec<PathBuf> = ["notes", "backups", "mcp-audit", "tftp", "scripts", "plugins", "command-packs", "syslog"]
        .iter()
        .filter_map(|s| canon(&d.join(s)))
        .chain(canon(d))
        .collect();
    let mut seen: Vec<PathBuf> = Vec::new();
    for (i, l) in layout.logs.iter().enumerate() {
        let Some(c) = canon(l) else { continue };
        if seen.contains(&c) {
            continue;
        }
        seen.push(c.clone());
        // Una carpeta de logs que es la de datos u otra de la app no se recorre como logs (con el modo
        // activo no se acepta como carpeta de logs; `loss_check` nombra lo que quedaría sin convertir).
        if skip.contains(&c) {
            continue;
        }
        let ls = LogScan { skip: &skip, user: (i > 0).then_some(&layout.names) };
        scan_logs(l, "", 0, &ls, &mut w);
    }
    w.found.sort_by(|a, b| a.phys.cmp(&b.phys));
    w.found.dedup_by(|a, b| a.phys == b.phys);
    w.uncertain.sort();
    w.uncertain.dedup();
    w
}

// ---------- Aviso para versiones anteriores ----------

pub const STUB_ID: &str = "netterminal-datos-cifrados";

/// sessions.json en claro que deja la carpeta cifrada: una versión anterior lo lee como una sesión
/// local con un nombre que explica qué pasa, en vez de ver la carpeta vacía o dañada.
pub fn stub_bytes() -> Vec<u8> {
    let v = serde_json::json!([{
        "id": STUB_ID,
        "name": "Carpeta cifrada: ábrela con la versión de NetTerminal que la cifró o una posterior",
        "type": "local",
        "folder": "Datos cifrados",
        "created_at": ""
    }]);
    serde_json::to_vec_pretty(&v).unwrap_or_default()
}

pub fn is_stub(bytes: &[u8]) -> bool {
    serde_json::from_slice::<Vec<serde_json::Value>>(bytes).is_ok_and(|v| v.len() == 1 && v[0].get("id").and_then(|i| i.as_str()) == Some(STUB_ID))
}

fn is_stub_file(p: &Path) -> bool {
    p.file_name().and_then(|n| n.to_str()).is_some_and(|n| n.starts_with("sessions.json"))
        && fs::metadata(p).is_ok_and(|m| m.len() < 4096)
        && fs::read(p).is_ok_and(|b| is_stub(&b))
}

const README: &str = "Esta carpeta de datos de NetTerminal está cifrada (modo portable cifrado).\n\n\
Sesiones, ajustes, notas, historial, topología, respaldos de configuración, logs de sesión y la\n\
auditoría de agentes están en archivos .nte cifrados con la contraseña maestra.\n\n\
- Ábrela con la versión de NetTerminal que la cifró o una posterior. Una versión anterior no ve\n\
  los datos (muestra una sola sesión que lo explica) y no los modifica.\n\
- No borres ni cambies datakey.ntk: sin ese archivo los datos no se pueden recuperar.\n\
- Sin la contraseña maestra no hay forma de recuperar los datos.\n";

// ---------- Diario de conversión ----------

#[derive(Clone, Copy, PartialEq, Eq, Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Op {
    Encrypt,
    Decrypt,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct Journal {
    pub op: Op,
    pub started: u64,
    /// Carpeta de logs elegida por el usuario al empezar (se retoma con la misma).
    #[serde(default)]
    pub logs: Option<PathBuf>,
}

pub fn read_journal(data: &Path) -> Option<Journal> {
    fs::read(data.join(JOURNAL_FILE)).ok().and_then(|b| serde_json::from_slice(&b).ok())
}

fn write_journal(layout: &Layout, op: Op) -> Result<(), String> {
    let j = Journal { op, started: now_secs(), logs: layout.logs.get(1).cloned() };
    seal::write_atomic(&layout.data.join(JOURNAL_FILE), &serde_json::to_vec(&j).map_err(|e| e.to_string())?)
}

fn now_secs() -> u64 {
    SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

/// Al arrancar: un diario sin llave de datos es de una conversión que no alcanzó a cifrar nada o que
/// ya terminó de descifrar todo; se borra. Devuelve el diario vigente (con llave), si hay.
pub fn startup_journal(data: &Path) -> Option<Journal> {
    let j = read_journal(data)?;
    if data.join(KEY_FILE).exists() {
        return Some(j);
    }
    let _ = fs::remove_file(data.join(JOURNAL_FILE));
    if j.op == Op::Decrypt {
        let _ = fs::remove_file(data.join(README_FILE));
    }
    None
}

/// Pasos de una conversión: las pruebas cortan en cada uno para simular un corte de energía.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Step {
    Journal,
    KeyFile,
    /// Temporal escrito, antes de renombrarlo.
    Temp,
    /// Copia nueva en su lugar, antes de verificarla.
    Renamed,
    /// Verificada, antes de borrar el original.
    Verified,
    /// Original borrado.
    Removed,
    /// Aviso para versiones anteriores escrito (cifrar) o llave borrada (descifrar).
    Finish,
}

pub type Hook<'a> = &'a dyn Fn(Step) -> io::Result<()>;

pub fn no_hook(_: Step) -> io::Result<()> {
    Ok(())
}

#[derive(serde::Serialize, Default, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub done: usize,
    pub total: usize,
    pub bytes: u64,
    pub total_bytes: u64,
}

#[derive(serde::Serialize, Default, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    pub converted: usize,
    /// Archivos en claro que no coincidían con su versión cifrada: quedaron apartados con otro nombre.
    pub aside: Vec<String>,
    /// Logs sin bloque de cierre (grabación cortada): se convirtió lo íntegro.
    pub incomplete: Vec<String>,
    pub bytes: u64,
    pub ms: u64,
}

fn rel_of(layout: &Layout, p: &Path) -> String {
    for base in std::iter::once(&layout.data).chain(layout.logs.iter()) {
        if let Ok(r) = p.strip_prefix(base) {
            return r.to_string_lossy().replace('\\', "/");
        }
    }
    p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default()
}

fn sync_dir(p: &Path) {
    #[cfg(unix)]
    if let Some(dir) = p.parent() {
        let _ = File::open(dir).and_then(|d| d.sync_all());
    }
    #[cfg(not(unix))]
    let _ = p;
}

fn temp_for(p: &Path) -> PathBuf {
    let mut n = p.file_name().unwrap_or_default().to_os_string();
    let u: [u8; 8] = seal::random();
    n.push(format!(".{}.tmp", u.iter().map(|b| format!("{b:02x}")).collect::<String>()));
    p.with_file_name(n)
}

fn create_temp(p: &Path) -> io::Result<File> {
    let mut o = OpenOptions::new();
    o.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        o.mode(0o600);
    }
    o.open(p)
}

/// SHA-256 de un archivo en claro.
fn hash_plain(p: &Path) -> io::Result<[u8; 32]> {
    let mut f = File::open(p)?;
    hash_reader(&mut f)
}

fn hash_reader(r: &mut dyn Read) -> io::Result<[u8; 32]> {
    let mut h = Sha256::new();
    let mut buf = Zeroizing::new(vec![0u8; WRITE_CHUNK]);
    loop {
        let n = r.read(&mut buf)?;
        if n == 0 {
            break;
        }
        h.update(&buf[..n]);
    }
    Ok(h.finalize().into())
}

/// SHA-256 del contenido descifrado y si estaba completo.
fn hash_enc(p: &Path, dk: &DataKey) -> io::Result<([u8; 32], bool)> {
    let mut r = EncReader::new(File::open(p)?, dk, false)?;
    let h = hash_reader(&mut r)?;
    Ok((h, r.incomplete()))
}

/// Cifra `src` (en claro) a `dest` (físico) por un temporal; devuelve el hash del texto en claro.
fn encrypt_file(src: &Path, dest: &Path, dk: &DataKey, hook: Hook, prog: &mut dyn FnMut(u64)) -> io::Result<[u8; 32]> {
    let tmp = temp_for(dest);
    let res = (|| {
        let mut out = create_temp(&tmp)?;
        let (h, fk) = new_header(dk)?;
        out.write_all(&h)?;
        let mut input = File::open(src)?;
        let mut hasher = Sha256::new();
        let mut buf = Zeroizing::new(vec![0u8; WRITE_CHUNK]);
        let mut rec = Vec::with_capacity(WRITE_CHUNK + REC_HEAD + TAG);
        let mut n = 0u64;
        loop {
            let mut filled = 0;
            while filled < buf.len() {
                let k = input.read(&mut buf[filled..])?;
                if k == 0 {
                    break;
                }
                filled += k;
            }
            if filled == 0 {
                break;
            }
            hasher.update(&buf[..filled]);
            rec.clear();
            seal_chunk(&fk, &h, n, false, &buf[..filled], &mut rec)?;
            out.write_all(&rec)?;
            n += 1;
            prog(filled as u64);
            if filled < buf.len() {
                break;
            }
        }
        rec.clear();
        seal_chunk(&fk, &h, n, true, &[], &mut rec)?;
        out.write_all(&rec)?;
        out.sync_all()?;
        hook(Step::Temp)?;
        fs::rename(&tmp, dest)?;
        sync_dir(dest);
        Ok(hasher.finalize().into())
    })();
    if res.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    res
}

/// Descifra `src` (físico) a `dest` (en claro) por un temporal. Devuelve el hash y si estaba completo.
fn decrypt_file(src: &Path, dest: &Path, dk: &DataKey, hook: Hook, prog: &mut dyn FnMut(u64)) -> io::Result<([u8; 32], bool)> {
    let tmp = temp_for(dest);
    let res = (|| {
        let mut out = create_temp(&tmp)?;
        let mut r = EncReader::new(File::open(src)?, dk, false)?;
        if is_damaged(dest) {
            r = r.salvage();
        }
        let mut hasher = Sha256::new();
        let mut buf = Zeroizing::new(vec![0u8; WRITE_CHUNK]);
        loop {
            let k = r.read(&mut buf)?;
            if k == 0 {
                break;
            }
            hasher.update(&buf[..k]);
            out.write_all(&buf[..k])?;
            prog(k as u64);
        }
        out.sync_all()?;
        hook(Step::Temp)?;
        fs::rename(&tmp, dest)?;
        sync_dir(dest);
        Ok((hasher.finalize().into(), r.incomplete()))
    })();
    if res.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    res
}

/// Nombre para un archivo apartado: `<base>.encontrado-<fecha>.<ext>` (o al final si no tiene extensión).
fn aside_name(p: &Path, tag: &str) -> PathBuf {
    let name = p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let stamp = format!("{tag}{}", now_secs());
    let new = match name.rfind('.') {
        Some(i) if i > 0 => format!("{}{stamp}{}", &name[..i], &name[i..]),
        _ => format!("{name}{stamp}"),
    };
    let mut cand = p.with_file_name(&new);
    let mut k = 2;
    while cand.exists() || with_ext(&cand).exists() {
        cand = p.with_file_name(format!("{new}-{k}"));
        k += 1;
    }
    cand
}

fn mismatch() -> io::Error {
    io::Error::other("La verificación de la copia convertida no coincide: se conserva el original")
}

/// Cifra un archivo en claro: copia cifrada verificada y recién ahí se borra el original. Si ya
/// existía una versión cifrada distinta (un claro que dejó una versión anterior), el claro se cifra
/// con otro nombre (`.encontrado-<fecha>`): nada se pierde y la versión cifrada sigue mandando.
fn encrypt_one(f: &Found, dk: &DataKey, hook: Hook, rep: &mut Report, layout: &Layout, prog: &mut dyn FnMut(u64)) -> io::Result<()> {
    let enc = with_ext(&f.logical);
    let mut dest = enc.clone();
    if enc.exists() {
        let ours = hash_plain(&f.phys)?;
        match hash_enc(&enc, dk) {
            Ok((theirs, _)) if theirs == ours => {
                fs::remove_file(&f.phys)?;
                sync_dir(&f.phys);
                hook(Step::Removed)?;
                rep.converted += 1;
                return Ok(());
            }
            _ => {
                dest = with_ext(&aside_name(&f.logical, ASIDE));
                rep.aside.push(rel_of(layout, &dest.with_extension("")));
            }
        }
    }
    let h = encrypt_file(&f.phys, &dest, dk, hook, prog)?;
    hook(Step::Renamed)?;
    let (back, incomplete) = hash_enc(&dest, dk)?;
    if back != h || incomplete {
        return Err(mismatch());
    }
    hook(Step::Verified)?;
    fs::remove_file(&f.phys)?;
    sync_dir(&f.phys);
    hook(Step::Removed)?;
    rep.converted += 1;
    Ok(())
}

/// Descifra un archivo: copia en claro verificada y recién ahí se borra el cifrado. Un archivo en
/// claro con el mismo nombre y otro contenido se aparta (`.antes-de-descifrar-<fecha>`); el aviso
/// para versiones anteriores (sessions.json) se reemplaza.
fn decrypt_one(f: &Found, dk: &DataKey, hook: Hook, rep: &mut Report, layout: &Layout, prog: &mut dyn FnMut(u64)) -> io::Result<()> {
    let plain = &f.logical;
    if plain.exists() && !is_stub_file(plain) {
        let (theirs, _) = hash_enc(&f.phys, dk)?;
        if hash_plain(plain)? == theirs {
            fs::remove_file(&f.phys)?;
            sync_dir(&f.phys);
            hook(Step::Removed)?;
            rep.converted += 1;
            return Ok(());
        }
        let away = aside_name(plain, ".antes-de-descifrar-");
        fs::rename(plain, &away)?;
        rep.aside.push(rel_of(layout, &away));
    }
    let (h, incomplete) = decrypt_file(&f.phys, plain, dk, hook, prog)?;
    hook(Step::Renamed)?;
    if hash_plain(plain)? != h {
        return Err(mismatch());
    }
    if incomplete {
        rep.incomplete.push(rel_of(layout, plain));
    }
    hook(Step::Verified)?;
    fs::remove_file(&f.phys)?;
    sync_dir(&f.phys);
    hook(Step::Removed)?;
    rep.converted += 1;
    Ok(())
}

/// Borra temporales huérfanos de una conversión cortada (`<archivo>.<16 hex>.tmp`) en las carpetas
/// de los archivos cubiertos.
fn cleanup_temps(layout: &Layout, files: &[Found]) {
    let mut dirs: Vec<PathBuf> = files.iter().filter_map(|f| f.phys.parent().map(Path::to_path_buf)).collect();
    dirs.push(layout.data.clone());
    dirs.sort();
    dirs.dedup();
    let refs: Vec<&Path> = dirs.iter().map(PathBuf::as_path).collect();
    seal::cleanup_orphan_temps(&refs, std::time::Duration::ZERO);
}

/// Convierte todos los archivos cubiertos en la dirección `op`. Idempotente: retomar tras un corte
/// en cualquier punto termina el trabajo sin perder datos.
pub fn convert(layout: &Layout, op: Op, dk: &DataKey, hook: Hook, progress: &mut dyn FnMut(&Progress)) -> Result<Report, String> {
    let t0 = Instant::now();
    let all = walk(layout);
    cleanup_temps(layout, &all);
    let todo: Vec<Found> = all
        .into_iter()
        .filter(|f| match op {
            Op::Encrypt => !f.encrypted && !is_stub_file(&f.phys),
            // Un apartado por dañado cuya cabecera no abre no tiene nada que rescatar: `loss_check`
            // lo declaró como pérdida antes de empezar y no corta la conversión.
            Op::Decrypt => f.encrypted && !(is_damaged(&f.logical) && !header_opens(&f.phys, dk)),
        })
        .collect();
    let mut p = Progress { total: todo.len(), total_bytes: todo.iter().filter_map(|f| fs::metadata(&f.phys).ok()).map(|m| m.len()).sum(), ..Default::default() };
    progress(&p);
    let mut rep = Report::default();
    let mut last = Instant::now();
    for f in &todo {
        let mut on_bytes = |n: u64| {
            p.bytes += n;
            if last.elapsed().as_millis() >= 150 {
                progress(&p);
                last = Instant::now();
            }
        };
        let r = match op {
            Op::Encrypt => encrypt_one(f, dk, hook, &mut rep, layout, &mut on_bytes),
            Op::Decrypt => decrypt_one(f, dk, hook, &mut rep, layout, &mut on_bytes),
        };
        r.map_err(|e| format!("{}: {e}", rel_of(layout, &f.logical)))?;
        p.done += 1;
        progress(&p);
    }
    rep.bytes = p.bytes;
    rep.ms = t0.elapsed().as_millis() as u64;
    Ok(rep)
}

/// Verifica todos los archivos cifrados (antes de descifrar). Err con la lista de los alterados. Los
/// apartados por dañados (`.danado-`) no cuentan: se descifra lo que tienen de íntegro.
pub fn verify_all(layout: &Layout, dk: &DataKey) -> Result<(), String> {
    let bad: Vec<String> = walk(layout)
        .into_iter()
        .filter(|f| f.encrypted && !is_damaged(&f.logical) && hash_enc(&f.phys, dk).is_err())
        .map(|f| rel_of(layout, &f.logical))
        .collect();
    if bad.is_empty() {
        Ok(())
    } else {
        Err(format!("Estos archivos cifrados están alterados o dañados y no se pueden descifrar: {}", bad.join(", ")))
    }
}

fn finish(layout: &Layout, op: Op, hook: Hook) -> Result<(), String> {
    let d = &layout.data;
    match op {
        Op::Encrypt => {
            seal::write_atomic(&d.join("sessions.json"), &stub_bytes())?;
            seal::write_atomic(&d.join(README_FILE), README.as_bytes())?;
            hook(Step::Finish).map_err(|e| e.to_string())?;
        }
        Op::Decrypt => {
            if is_stub_file(&d.join("sessions.json")) {
                // Sin sesiones cifradas que lo reemplazaran: queda la lista vacía de una carpeta nueva.
                let _ = fs::remove_file(d.join("sessions.json"));
            }
            // El aviso y la lista de carpetas se borran antes que la llave: un corte deja la llave
            // (se retoma) o una carpeta en claro sin señales de cifrado.
            let gone = |name: &str| match fs::remove_file(d.join(name)) {
                Ok(()) => Ok(()),
                Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(()),
                Err(e) => Err(format!("{name}: {e}")),
            };
            gone(README_FILE)?;
            for r in layout.user_logs() {
                let _ = fs::remove_file(r.join(ROOT_MARK));
            }
            gone(ROOTS_FILE)?;
            gone(KEY_FILE)?;
            sync_dir(&d.join(KEY_FILE));
            hook(Step::Finish).map_err(|e| e.to_string())?;
        }
    }
    let _ = fs::remove_file(d.join(JOURNAL_FILE));
    sync_dir(&d.join(JOURNAL_FILE));
    Ok(())
}

/// Activa el cifrado: diario, llave de datos (verificada al releerla), conversión y aviso para
/// versiones anteriores. La DEK queda en `key` apenas está escrita en disco, también si la conversión
/// falla después (para retomarla o revertirla sin pedir de nuevo la contraseña).
pub fn enable(layout: &Layout, password: &str, kdf: Kdf, hook: Hook, progress: &mut dyn FnMut(&Progress), key: &mut Option<DataKey>) -> Result<Report, String> {
    if layout.data.join(KEY_FILE).exists() {
        return Err("La carpeta ya está cifrada".into());
    }
    write_journal(layout, Op::Encrypt)?;
    hook(Step::Journal).map_err(|e| e.to_string())?;
    let dk = DataKey::generate();
    KeyFile::create(&dk, password, kdf)?.write(&layout.data)?;
    // Antes de cifrar un solo archivo, la llave tiene que releerse y abrirse con la contraseña.
    let back = KeyFile::read(&layout.data)?.ok_or("No se pudo escribir la llave de datos")?;
    let (k2, _) = back.unwrap(password)?;
    if k2.id != dk.id || *k2.key != *dk.key {
        return Err("La llave de datos escrita no coincide".into());
    }
    add_roots(&layout.data, layout.user_logs())?;
    let dk = key.insert(dk);
    hook(Step::KeyFile).map_err(|e| e.to_string())?;
    let rep = convert(layout, Op::Encrypt, dk, hook, progress)?;
    finish(layout, Op::Encrypt, hook)?;
    Ok(rep)
}

/// Retoma una activación interrumpida (para revertirla o desactivar: `disable`).
pub fn resume(layout: &Layout, op: Op, dk: &DataKey, hook: Hook, progress: &mut dyn FnMut(&Progress)) -> Result<Report, String> {
    if op == Op::Decrypt {
        return disable(layout, dk, &[], hook, progress).map_err(|e| e.message);
    }
    write_journal(layout, op)?;
    let rep = convert(layout, op, dk, hook, progress)?;
    finish(layout, op, hook)?;
    Ok(rep)
}

/// Todos los `.nte` bajo la carpeta de datos y las de logs (recursivo, sin seguir enlaces, hasta
/// `MAX_DEPTH`, igual que los recorridos) y las carpetas más profundas, que no se revisan.
fn all_nte(layout: &Layout) -> (Vec<PathBuf>, Vec<PathBuf>) {
    fn rec(dir: &Path, depth: usize, out: &mut Vec<PathBuf>, deep: &mut Vec<PathBuf>) {
        let Ok(rd) = fs::read_dir(dir) else { return };
        for e in rd.flatten() {
            let Ok(ft) = e.file_type() else { continue };
            if ft.is_dir() {
                if depth + 1 >= MAX_DEPTH {
                    deep.push(e.path());
                } else {
                    rec(&e.path(), depth + 1, out, deep);
                }
            } else if ft.is_file() && e.file_name().to_string_lossy().ends_with(DOT_EXT) {
                out.push(e.path());
            }
        }
    }
    let (mut out, mut deep) = (Vec::new(), Vec::new());
    for root in std::iter::once(&layout.data).chain(layout.logs.iter()) {
        rec(root, 0, &mut out, &mut deep);
    }
    out.sort();
    out.dedup();
    deep.sort();
    deep.dedup();
    (out, deep)
}

/// Lo que se perdería al desactivar (borrar `datakey.ntk` deja irrecuperable todo `.nte` que quede):
/// carpetas de logs usadas con el modo activo que no están accesibles y archivos cifrados que la
/// conversión no cubre. Vacío: se puede desactivar sin perder nada.
/// También: `datakey.roots` que falta o no se lee, una carpeta registrada sin su marca (por ejemplo un
/// punto de montaje vacío), carpetas más profundas que el límite y apartados por dañados cuya cabecera
/// no abre (con `dk`).
pub fn loss_check(layout: &Layout, dk: Option<&DataKey>) -> Vec<String> {
    let mut out = Vec::new();
    if let Err(e) = read_roots_checked(&layout.data) {
        out.push(e);
    }
    let id = key_id(&layout.data).unwrap_or_default();
    for r in layout.user_logs() {
        if !r.is_dir() {
            out.push(format!("Carpeta de logs no disponible: {}", r.display()));
        } else if !root_mark_ok(r, &id) {
            out.push(format!("Carpeta de logs sin su marca (¿no está conectada o montada?): {}", r.display()));
        }
    }
    let found = walk(layout);
    let covered: std::collections::HashSet<PathBuf> = found.iter().filter(|f| f.encrypted).map(|f| f.phys.clone()).collect();
    let (nte, deep) = all_nte(layout);
    out.extend(deep.into_iter().map(|p| format!("Carpeta a más de {MAX_DEPTH} niveles (no se revisa ni se convierte): {}", p.display())));
    out.extend(nte.into_iter().filter(|p| !covered.contains(p)).map(|p| format!("Archivo cifrado fuera de lo que se convierte: {}", p.display())));
    if let Some(dk) = dk {
        out.extend(
            found
                .iter()
                .filter(|f| f.encrypted && is_damaged(&f.logical) && !header_opens(&f.phys, dk))
                .map(|f| format!("Archivo dañado sin cabecera legible (no se puede recuperar): {}", f.phys.display())),
        );
    }
    out
}

/// Error de una conversión: el motivo y, si es por pérdida, la lista exacta que el usuario tiene que
/// aceptar para continuar.
#[derive(serde::Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ConvError {
    pub message: String,
    pub loss: Vec<String>,
}

impl From<String> for ConvError {
    fn from(message: String) -> Self {
        ConvError { message, loss: Vec::new() }
    }
}

/// Desactiva el cifrado (o revierte una activación cortada). Antes de tocar nada: si algo quedaría
/// irrecuperable, se detiene y lo nombra; solo sigue si `accept` es exactamente esa lista. Luego
/// verifica todo, descifra y, antes de borrar la llave, vuelve a mirar que no quede ningún `.nte`
/// fuera de lo aceptado.
pub fn disable(layout: &Layout, dk: &DataKey, accept: &[String], hook: Hook, progress: &mut dyn FnMut(&Progress)) -> Result<Report, ConvError> {
    let loss = loss_check(layout, Some(dk));
    if !loss.is_empty() && loss != accept {
        return Err(ConvError {
            message: "Desactivar dejaría archivos cifrados sin su llave (no se podrían abrir nunca más). Revisa la lista: conecta la carpeta que falta o confirma que aceptas perderlos.".into(),
            loss,
        });
    }
    verify_all(layout, dk)?;
    write_journal(layout, Op::Decrypt)?;
    let rep = convert(layout, Op::Decrypt, dk, hook, progress)?;
    // Lo que quede tiene que estar en la lista aceptada (cualquiera de sus motivos).
    let left: Vec<String> = all_nte(layout)
        .0
        .into_iter()
        .map(|p| p.display().to_string())
        .filter(|p| !accept.iter().any(|a| a.ends_with(&format!(": {p}"))))
        .collect();
    if !left.is_empty() {
        return Err(ConvError { message: format!("Quedaron archivos cifrados sin convertir; la llave no se borró: {}", left.join(", ")), loss: Vec::new() });
    }
    finish(layout, Op::Decrypt, hook)?;
    Ok(rep)
}

fn is_damaged(p: &Path) -> bool {
    p.file_name().and_then(|n| n.to_str()).is_some_and(|n| n.contains(DAMAGED) || DAMAGED_OLD.iter().any(|m| n.contains(m)))
}

/// La cabecera de un archivo cifrado abre con la DEK (sin ella no hay nada que rescatar).
fn header_opens(phys: &Path, dk: &DataKey) -> bool {
    File::open(phys).is_ok_and(|f| EncReader::new(f, dk, false).is_ok())
}

/// Carpeta sin `datakey.ntk` pero con datos cifrados reales (`sessions`, `settings` o `topology`
/// cifrados): no se abre en claro ni se escribe nada. El aviso o el sessions.json de aviso solos no
/// bastan (pueden quedar en una carpeta que ya está en claro).
pub fn orphan_markers(data: &Path) -> bool {
    DATA_STEMS.iter().any(|s| data.join(format!("{s}.json{DOT_EXT}")).is_file())
}

/// Archivos en claro dentro de una carpeta cifrada (los dejó una versión anterior u otra herramienta):
/// no se leen; se informan para cifrarlos. Excluye el aviso para versiones anteriores.
pub fn plaintext_found(layout: &Layout) -> Vec<String> {
    walk(layout).into_iter().filter(|f| !f.encrypted && !is_stub_file(&f.phys)).map(|f| rel_of(layout, &f.logical)).collect()
}

/// Cifra los archivos en claro encontrados (con su apartado si chocan con uno cifrado).
/// `include`: logs en claro que no calzaban con los nombres de la app y el usuario decidió cifrar
/// (solo se aceptan los que `uncertain` informa ahora).
pub fn fix_plaintext(layout: &Layout, dk: &DataKey, include: &[String]) -> Result<Report, String> {
    let mut rep = convert(layout, Op::Encrypt, dk, &no_hook, &mut |_| {})?;
    for p in uncertain(layout).into_iter().filter(|p| include.contains(&p.to_string_lossy().into_owned())) {
        let f = Found { logical: p.clone(), phys: p.clone(), encrypted: false };
        encrypt_one(&f, dk, &no_hook, &mut rep, layout, &mut |_| {}).map_err(|e| format!("{}: {e}", p.display()))?;
    }
    Ok(rep)
}

#[cfg(test)]
mod tests;
#[cfg(test)]
mod integration_tests;
