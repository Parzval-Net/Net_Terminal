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

    /// Abre la DEK con la contraseña probando cada ranura. Devuelve la llave y la ranura que abrió.
    pub fn unwrap(&self, password: &str) -> Result<(DataKey, usize), String> {
        for (i, s) in self.slots.iter().enumerate() {
            if let Some(k) = s.open(&self.id, password) {
                return Ok((k, i));
            }
        }
        Err("Contraseña maestra incorrecta o llave de datos alterada".into())
    }

    /// Agrega una ranura para `password` (cambio de maestra, paso 1). Con dos ranuras se reemplaza la segunda.
    pub fn add_slot(&mut self, dk: &DataKey, password: &str, kdf: Kdf) -> Result<usize, String> {
        if dk.id != self.id {
            return Err("La llave de datos no corresponde a esta carpeta".into());
        }
        let s = Slot::new(dk, password, kdf)?;
        self.slots.truncate(MAX_SLOTS - 1);
        self.slots.push(s);
        Ok(self.slots.len() - 1)
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
        Ok(EncReader { r, fk, head, counter: 0, buf: Zeroizing::new(Vec::new()), pos: 0, done: false, strict, incomplete: false })
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
            return Err(bad(BAD_FILE));
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
        let plain = seal::decrypt(&self.fk, &nonce, &ct, &chunk_aad(&self.head, self.counter, last)).map_err(|_| bad(BAD_FILE))?;
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
}

impl AppendState {
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

impl Drop for AppendState {
    /// Al soltar el último escritor del archivo se agrega el bloque de cierre.
    fn drop(&mut self) {
        if self.push(&[], true).is_ok() {
            let _ = self.file.sync_data();
        }
    }
}

/// Escritor en modo anexar de un archivo cifrado. Dos escritores del mismo archivo (dos pestañas
/// que anexan al mismo log) comparten el estado: los bloques quedan en orden y numerados.
#[derive(Clone)]
pub struct Appender(Arc<Mutex<AppendState>>);

impl Appender {
    pub fn append(&self, plain: &[u8]) -> io::Result<()> {
        let mut st = self.0.lock().unwrap_or_else(|e| e.into_inner());
        for part in plain.chunks(CHUNK_MAX) {
            st.push(part, false)?;
        }
        Ok(())
    }
}

impl Write for Appender {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        self.append(buf)?;
        Ok(buf.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

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
                let had = st.lock().unwrap_or_else(|e| e.into_inner()).counter > 0;
                return Ok((Appender(st), had));
            }
        }
    }
    let dk = dk.ok_or_else(locked_err)?;
    let mut file = open_raw(phys, mode)?;
    let flen = file.metadata()?.len();
    let st = if flen == 0 {
        let (h, fk) = new_header(dk)?;
        file.write_all(&h)?;
        let mut head = [0u8; AAD_HEAD];
        head.copy_from_slice(&h[..AAD_HEAD]);
        AppendState { file, fk, head, counter: 0, len: HEADER_LEN as u64 }
    } else {
        resume_state(file, flen, dk)?
    };
    let had = st.counter > 0;
    let arc = Arc::new(Mutex::new(st));
    map.retain(|_, w| w.strong_count() > 0);
    if let Ok(canon) = phys.canonicalize() {
        map.insert(canon, Arc::downgrade(&arc));
    }
    Ok((Appender(arc), had))
}

fn resume_state(mut file: File, flen: u64, dk: &DataKey) -> io::Result<AppendState> {
    let mut h = [0u8; HEADER_LEN];
    file.seek(SeekFrom::Start(0))?;
    if !read_full(&mut file, &mut h).map_err(|_| bad(BAD_FILE))? {
        return Err(bad(BAD_FILE));
    }
    let fk = open_header(dk, &h)?;
    let mut head = [0u8; AAD_HEAD];
    head.copy_from_slice(&h[..AAD_HEAD]);
    // Recorre los largos (sin descifrar) hasta el último bloque completo.
    let mut r = BufReader::new(&mut file);
    let mut pos = HEADER_LEN as u64;
    let mut idx = 0u64;
    let mut last: Option<(u64, u64, bool, usize)> = None;
    loop {
        let mut lenb = [0u8; 4];
        if !matches!(read_full(&mut r, &mut lenb), Ok(true)) {
            break;
        }
        let raw = u32::from_le_bytes(lenb);
        let len = (raw & !FINAL_BIT) as usize;
        let end = pos + (REC_HEAD + len) as u64;
        if !(TAG..=CHUNK_MAX + TAG).contains(&len) || end > flen {
            break;
        }
        last = Some((pos, idx, raw & FINAL_BIT != 0, len));
        r.seek_relative((NONCE + len) as i64)?;
        pos = end;
        idx += 1;
    }
    drop(r);
    let (cut_at, counter) = match last {
        None => (HEADER_LEN as u64, 0),
        Some((at, i, fin, len)) => {
            // El último bloque tiene que ser íntegro y estar en su lugar.
            file.seek(SeekFrom::Start(at + 4))?;
            let mut nonce = [0u8; 24];
            let mut ct = vec![0u8; len];
            file.read_exact(&mut nonce)?;
            file.read_exact(&mut ct)?;
            seal::decrypt(&fk, &nonce, &ct, &chunk_aad(&head, i, fin)).map_err(|_| bad(BAD_FILE))?;
            if fin {
                (at, i)
            } else {
                (pos, i + 1)
            }
        }
    };
    file.set_len(cut_at)?;
    file.seek(SeekFrom::Start(cut_at))?;
    Ok(AppendState { file, fk, head, counter, len: cut_at })
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

    /// La DEK para una operación de datos (cuenta como uso). Error si está bloqueada o convirtiendo.
    pub fn key(&self) -> io::Result<Arc<DataKey>> {
        if self.busy() {
            return Err(io::Error::new(io::ErrorKind::ResourceBusy, BUSY));
        }
        let k = self.key.read().unwrap_or_else(|e| e.into_inner()).clone().ok_or_else(locked_err)?;
        self.touch();
        Ok(k)
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
    matches!(name, KEY_FILE | JOURNAL_FILE | README_FILE | VAULT_FILE) || name.ends_with(DOT_EXT) || name.ends_with(".ntenc") || name.ends_with(".tmp")
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
    pub fn is_file(&self) -> bool {
        self.file_type.is_file()
    }
    pub fn physical(&self) -> &Path {
        &self.phys
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
    pub data: PathBuf,
    /// Carpetas de logs (la predeterminada `data/logs` y la elegida por el usuario, si hay).
    pub logs: Vec<PathBuf>,
}

impl Layout {
    pub fn new(data: &Path, extra_logs: Option<&Path>) -> Layout {
        let mut logs = vec![data.join("logs")];
        if let Some(x) = extra_logs {
            if !logs.iter().any(|l| l == x) {
                logs.push(x.to_path_buf());
            }
        }
        Layout { data: data.to_path_buf(), logs }
    }
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

fn consider(dir: &Path, e: &fs::DirEntry, accept: &dyn Fn(&str) -> bool, out: &mut Vec<Found>) {
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
    if logical.ends_with(".tmp") || !accept(&logical) {
        return;
    }
    out.push(Found { logical: dir.join(&logical), phys: e.path(), encrypted });
}

fn scan_dir(dir: &Path, accept: &dyn Fn(&str) -> bool, out: &mut Vec<Found>) {
    let Ok(rd) = fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        consider(dir, &e, accept, out);
    }
}

fn scan_logs(dir: &Path, depth: usize, skip: &[PathBuf], out: &mut Vec<Found>) {
    let Ok(rd) = fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let Ok(ft) = e.file_type() else { continue };
        if ft.is_dir() && depth < 8 {
            let p = e.path();
            if p.canonicalize().map(|c| skip.contains(&c)).unwrap_or(true) {
                continue;
            }
            scan_logs(&p, depth + 1, skip, out);
        } else {
            consider(dir, &e, &|n| ext_is(n, &["log", "txt"]), out);
        }
    }
}

/// Todos los archivos cubiertos (en claro y cifrados) de la carpeta. No sigue enlaces simbólicos.
pub fn walk(layout: &Layout) -> Vec<Found> {
    let mut out = Vec::new();
    let d = &layout.data;
    scan_dir(d, &data_root_file, &mut out);
    scan_dir(&d.join("notes"), &|n| ext_is(n, &["txt"]), &mut out);
    if let Ok(rd) = fs::read_dir(d.join("backups")) {
        for e in rd.flatten() {
            if e.file_type().is_ok_and(|t| t.is_dir()) {
                scan_dir(&e.path(), &|_| true, &mut out);
            }
        }
    }
    scan_dir(&d.join("mcp-audit"), &|n| n.starts_with("audit") && ext_is(n, &["jsonl"]), &mut out);
    // Una carpeta de logs no recorre las otras carpetas de la app que pueda contener.
    let canon = |p: &Path| p.canonicalize().ok();
    let skip: Vec<PathBuf> = ["notes", "backups", "mcp-audit", "tftp", "scripts", "plugins", "command-packs", "syslog"]
        .iter()
        .filter_map(|s| canon(&d.join(s)))
        .chain(canon(d))
        .collect();
    let mut seen: Vec<PathBuf> = Vec::new();
    for l in &layout.logs {
        let Some(c) = canon(l) else { continue };
        if seen.contains(&c) {
            continue;
        }
        seen.push(c.clone());
        // Si la carpeta de logs es la de datos (o la contiene), solo se recorren sus subcarpetas de logs.
        if skip.contains(&c) {
            continue;
        }
        scan_logs(l, 0, &skip, &mut out);
    }
    out.sort_by(|a, b| a.phys.cmp(&b.phys));
    out.dedup_by(|a, b| a.phys == b.phys);
    out
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
            Op::Decrypt => f.encrypted,
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

/// Verifica todos los archivos cifrados (antes de descifrar). Err con la lista de los alterados.
pub fn verify_all(layout: &Layout, dk: &DataKey) -> Result<(), String> {
    let bad: Vec<String> = walk(layout).into_iter().filter(|f| f.encrypted && hash_enc(&f.phys, dk).is_err()).map(|f| rel_of(layout, &f.logical)).collect();
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
            match fs::remove_file(d.join(KEY_FILE)) {
                Ok(()) => {}
                Err(e) if e.kind() == io::ErrorKind::NotFound => {}
                Err(e) => return Err(e.to_string()),
            }
            sync_dir(&d.join(KEY_FILE));
            hook(Step::Finish).map_err(|e| e.to_string())?;
            let _ = fs::remove_file(d.join(README_FILE));
        }
    }
    let _ = fs::remove_file(d.join(JOURNAL_FILE));
    sync_dir(&d.join(JOURNAL_FILE));
    Ok(())
}

/// Activa el cifrado: diario, llave de datos (verificada al releerla), conversión y aviso para
/// versiones anteriores. Devuelve la DEK (para dejar la carpeta desbloqueada) y el informe.
pub fn enable(layout: &Layout, password: &str, kdf: Kdf, hook: Hook, progress: &mut dyn FnMut(&Progress)) -> Result<(DataKey, Report), String> {
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
    hook(Step::KeyFile).map_err(|e| e.to_string())?;
    let rep = convert(layout, Op::Encrypt, &dk, hook, progress)?;
    finish(layout, Op::Encrypt, hook)?;
    Ok((dk, rep))
}

/// Retoma (o revierte, con la operación contraria) una conversión interrumpida.
pub fn resume(layout: &Layout, op: Op, dk: &DataKey, hook: Hook, progress: &mut dyn FnMut(&Progress)) -> Result<Report, String> {
    if op == Op::Decrypt {
        verify_all(layout, dk)?;
    }
    write_journal(layout, op)?;
    let rep = convert(layout, op, dk, hook, progress)?;
    finish(layout, op, hook)?;
    Ok(rep)
}

/// Desactiva el cifrado: verifica todo antes de tocar nada, descifra y borra la llave de datos.
pub fn disable(layout: &Layout, dk: &DataKey, hook: Hook, progress: &mut dyn FnMut(&Progress)) -> Result<Report, String> {
    resume(layout, Op::Decrypt, dk, hook, progress)
}

/// Archivos en claro dentro de una carpeta cifrada (los dejó una versión anterior u otra herramienta):
/// no se leen; se informan para cifrarlos. Excluye el aviso para versiones anteriores.
pub fn plaintext_found(layout: &Layout) -> Vec<String> {
    walk(layout).into_iter().filter(|f| !f.encrypted && !is_stub_file(&f.phys)).map(|f| rel_of(layout, &f.logical)).collect()
}

/// Cifra los archivos en claro encontrados (con su apartado si chocan con uno cifrado).
pub fn fix_plaintext(layout: &Layout, dk: &DataKey) -> Result<Report, String> {
    convert(layout, Op::Encrypt, dk, &no_hook, &mut |_| {})
}

#[cfg(test)]
mod tests;
