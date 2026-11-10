//! Datos del usuario en disco (settings.json, topology.json, sessions.json): versión de esquema,
//! migraciones numeradas, respaldos y validación al leer. Todo es aditivo: los archivos siguen
//! siendo JSON legible por versiones anteriores de la app (ver docs/TECNICO.md, "Versión de esquema
//! y respaldos de datos").
//!
//! - `schemaVersion` (entero) se escribe en settings.json y topology.json. sessions.json es un
//!   arreglo (un campo nuevo lo rompería para una versión anterior): no lleva versión, solo respaldo.
//! - Un archivo sin el campo es v0 (todo lo escrito hasta la 0.9.20). Una versión mayor a la
//!   conocida se abre igual: se conservan las claves desconocidas al reescribir y se avisa.
//! - Antes del primer guardado tras migrar (o tras abrir un archivo más nuevo) se copia el original
//!   a `<archivo>.v<N>.bak.json`.
//! - `<archivo>.bak` y `<archivo>.bak2` guardan el último estado válido (como mucho uno por día,
//!   en un hilo aparte). Un archivo ilegible se restaura desde ellos.

use crate::seal;
use crate::session_store;
use serde::Serialize;
use serde_json::{Map, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, SystemTime};

/// Versión de esquema que escribe esta versión de la app.
pub const SCHEMA_VERSION: u64 = 1;
pub const VERSION_KEY: &str = "schemaVersion";
pub const SETTINGS_FILE: &str = "settings.json";
pub const SESSIONS_FILE: &str = "sessions.json";
pub const TOPOLOGY_FILE: &str = "topology.json";
/// Claves que viven en topology.json: pueden pesar varios MB y antes se reescribían con cada ajuste.
pub const TOPOLOGY_KEYS: [&str; 2] = ["topology", "topoSnapshots"];
/// Tope de la topología al guardar (JSON compacto).
pub const MAX_TOPOLOGY_BYTES: usize = 64 * 1024 * 1024;
/// Tope al leer (y al respaldar): el de la topología más un margen para la versión y claves extra.
const MAX_READ_BYTES: u64 = MAX_TOPOLOGY_BYTES as u64 + 1024 * 1024;
/// Cuántas copias `*.corrupt-<fecha>.json` se conservan por archivo.
pub const KEEP_CORRUPT: usize = 5;
/// Edad mínima del respaldo `.bak` antes de renovarlo (un respaldo por día como máximo).
const BAK_MIN_AGE: Duration = Duration::from_secs(20 * 3600);
/// Un archivo que se encogió a menos de la cuarta parte del respaldo no lo reemplaza hasta pasada
/// esta edad: protege del "JSON válido pero con datos perdidos".
const SHRINK_GUARD_AGE: Duration = Duration::from_secs(7 * 24 * 3600);
/// Espera antes de rotar respaldos al arrancar: no compite con la carga de la interfaz.
const ROTATE_DELAY: Duration = Duration::from_secs(15);

/// Paso numerado: transforma un archivo de la versión `from` a `from + 1`. Deben ser idempotentes
/// (el archivo puede leerse varias veces antes de guardarse) y no perder claves desconocidas.
pub struct Migration {
    pub from: u64,
    pub name: &'static str,
    pub run: fn(&mut Map<String, Value>),
}

/// Versión objetivo y cadena de migraciones de un archivo.
#[derive(Clone, Copy)]
pub struct Schema {
    pub target: u64,
    pub migrations: &'static [Migration],
}

/// 0 -> 1: formaliza el formato de la 0.9.20 (solo se agrega `schemaVersion`). Los pasos
/// específicos de los ajustes que hace la interfaz (`migrateSuggest`, separación de la topología
/// con `__topoStore`) siguen en `src/lib/settings.ts` y se encadenan bajo este mismo número.
static SETTINGS_MIGRATIONS: [Migration; 1] = [Migration { from: 0, name: "esquema inicial (schemaVersion)", run: |_| {} }];
static TOPOLOGY_MIGRATIONS: [Migration; 1] = [Migration { from: 0, name: "esquema inicial (schemaVersion)", run: |_| {} }];

pub const SETTINGS_SCHEMA: Schema = Schema { target: SCHEMA_VERSION, migrations: &SETTINGS_MIGRATIONS };
pub const TOPOLOGY_SCHEMA: Schema = Schema { target: SCHEMA_VERSION, migrations: &TOPOLOGY_MIGRATIONS };

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Kind {
    Settings,
    Topology,
}

impl Kind {
    pub fn file(self) -> &'static str {
        match self {
            Kind::Settings => SETTINGS_FILE,
            Kind::Topology => TOPOLOGY_FILE,
        }
    }
}

/// Lo que pasó al leer un archivo; viaja al frontend dentro de `__datafiles` en `get_settings`.
#[derive(Default, Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FileNotice {
    /// Versión que traía el archivo (0 si no tenía el campo); None si no existía.
    pub file_version: Option<u64>,
    /// Versión que conoce esta app.
    pub schema_version: u64,
    /// El archivo es de una versión posterior a la que conoce esta app.
    pub newer: bool,
    /// Versión desde la que se migró (en memoria; se escribe al próximo guardado).
    pub migrated_from: Option<u64>,
    /// Nombre del respaldo desde el que se restauró un archivo ilegible.
    pub restored_from: Option<String>,
    /// Claves o entradas inválidas que se descartaron al leer (el original queda respaldado).
    pub dropped: Vec<String>,
    /// El archivo superaba el tope de tamaño y se apartó.
    pub too_large: bool,
    /// El archivo era ilegible (se respaldó como `*.corrupt-<fecha>.json`).
    pub corrupt: bool,
}

impl FileNotice {
    fn new(target: u64) -> Self {
        FileNotice { schema_version: target, ..Default::default() }
    }
}

/// Estado por archivo, protegido por su propio candado: serializa lecturas y guardados.
struct FileState {
    /// Versión del archivo en disco (la que había al leer o la que se escribió después).
    version: u64,
    /// Falta copiar el original a `<archivo>.v<N>.bak.json` antes del próximo guardado.
    bak_pending: bool,
}

pub struct DataFiles {
    dir: PathBuf,
    schemas: [Schema; 2],
    settings: Mutex<FileState>,
    topology: Mutex<FileState>,
}

fn sibling(path: &Path, suffix: &str) -> PathBuf {
    let mut n = path.file_name().unwrap_or_default().to_os_string();
    n.push(suffix);
    path.with_file_name(n)
}

pub fn bak_path(path: &Path) -> PathBuf {
    sibling(path, ".bak")
}

pub fn bak2_path(path: &Path) -> PathBuf {
    sibling(path, ".bak2")
}

/// `<nombre>.v<N>.bak.json`: copia del original antes de migrarlo o de que una app más antigua lo reescriba.
pub fn version_bak_path(path: &Path, version: u64) -> PathBuf {
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("datos");
    path.with_file_name(format!("{stem}.v{version}.bak.json"))
}

fn json_type(v: &Value) -> u8 {
    match v {
        Value::Null => 0,
        Value::Bool(_) => 1,
        Value::Number(_) => 2,
        Value::String(_) => 3,
        Value::Array(_) => 4,
        Value::Object(_) => 5,
    }
}

enum ReadErr {
    /// Existe pero no se puede leer (permisos, disco).
    Unreadable,
    /// No es JSON, no es UTF-8 o no es un objeto.
    Corrupt,
    TooLarge,
}

type Parsed = (Map<String, Value>, Vec<u8>);

fn read_object(path: &Path) -> Result<Option<Parsed>, ReadErr> {
    let meta = match fs::metadata(path) {
        Ok(m) => m,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err(ReadErr::Unreadable),
    };
    if meta.len() > MAX_READ_BYTES {
        return Err(ReadErr::TooLarge);
    }
    let bytes = match fs::read(path) {
        Ok(b) => b,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err(ReadErr::Unreadable),
    };
    match serde_json::from_slice::<Value>(&bytes) {
        Ok(Value::Object(m)) => Ok(Some((m, bytes))),
        _ => Err(ReadErr::Corrupt),
    }
}

/// Descarta lo que no tiene la forma mínima de topología. Devuelve qué descartó.
fn validate_topology_keys(map: &mut Map<String, Value>) -> Vec<String> {
    let mut dropped = Vec::new();
    let bad_topology = match map.get("topology") {
        None => false,
        Some(t) => !t.as_object().is_some_and(|o| o.get("nodes").is_some_and(Value::is_array) && o.get("links").is_some_and(Value::is_array)),
    };
    if bad_topology {
        map.remove("topology");
        dropped.push("topology".to_string());
    }
    match map.get_mut("topoSnapshots") {
        None => {}
        Some(Value::Array(items)) => {
            let before = items.len();
            items.retain(Value::is_object);
            if items.len() != before {
                dropped.push(format!("topoSnapshots ({} entradas)", before - items.len()));
            }
        }
        Some(_) => {
            map.remove("topoSnapshots");
            dropped.push("topoSnapshots".to_string());
        }
    }
    dropped
}

/// Aplica la cadena de migraciones desde `from` hasta `schema.target`. Err si falta un paso.
pub fn migrate(map: &mut Map<String, Value>, from: u64, schema: Schema) -> Result<Vec<&'static str>, String> {
    let mut applied = Vec::new();
    let mut v = from;
    while v < schema.target {
        let step = schema.migrations.iter().find(|m| m.from == v).ok_or_else(|| format!("falta la migración {v} -> {}", v + 1))?;
        (step.run)(map);
        applied.push(step.name);
        v += 1;
    }
    if from < schema.target {
        map.insert(VERSION_KEY.into(), Value::from(schema.target));
    }
    Ok(applied)
}

/// Copia el original a `<archivo>.v<N>.bak.json` (una vez por versión: no pisa la más antigua).
fn write_version_backup(path: &Path, version: u64) {
    let dest = version_bak_path(path, version);
    if dest.exists() || !path.is_file() {
        return;
    }
    // Copia a un temporal propio y rename: un corte no deja una copia a medias con el nombre final.
    if let Ok(bytes) = fs::read(path) {
        if seal::write_atomic(&dest, &bytes).is_ok() {
            session_store::restrict(&dest);
        }
    }
}

impl DataFiles {
    pub fn new(dir: &Path) -> Self {
        Self::with_schemas(dir, SETTINGS_SCHEMA, TOPOLOGY_SCHEMA)
    }

    pub fn with_schemas(dir: &Path, settings: Schema, topology: Schema) -> Self {
        let fresh = |s: Schema| Mutex::new(FileState { version: s.target, bak_pending: false });
        DataFiles { dir: dir.to_path_buf(), schemas: [settings, topology], settings: fresh(settings), topology: fresh(topology) }
    }

    fn schema(&self, kind: Kind) -> Schema {
        match kind {
            Kind::Settings => self.schemas[0],
            Kind::Topology => self.schemas[1],
        }
    }

    fn state(&self, kind: Kind) -> std::sync::MutexGuard<'_, FileState> {
        let m = match kind {
            Kind::Settings => &self.settings,
            Kind::Topology => &self.topology,
        };
        m.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn path(&self, kind: Kind) -> PathBuf {
        self.dir.join(kind.file())
    }

    /// Lee un archivo: migra en memoria, valida, restaura desde el respaldo si hace falta.
    /// Devuelve el objeto (sin `schemaVersion`) o Null si no hay nada usable.
    pub fn load(&self, kind: Kind) -> (Value, FileNotice) {
        let schema = self.schema(kind);
        let path = self.path(kind);
        let mut st = self.state(kind);
        let mut notice = FileNotice::new(schema.target);
        st.version = schema.target;
        st.bak_pending = false;

        let parsed = match read_object(&path) {
            Ok(None) => return (Value::Null, notice),
            Ok(Some((m, _))) => Some(m),
            Err(ReadErr::Unreadable) => {
                // Existe pero no se lee (permisos, disco): se respalda si se puede y no se restaura
                // (probablemente tampoco se pueda escribir).
                session_store::backup_corrupt(&path);
                notice.corrupt = true;
                None
            }
            Err(e) => {
                notice.corrupt = true;
                if matches!(e, ReadErr::TooLarge) {
                    notice.too_large = true;
                    session_store::set_aside(&path);
                } else {
                    // Ilegible (JSON inválido, bytes que no son UTF-8 o algo que no es un objeto): se
                    // respalda antes de que la app lo reemplace, para no perder macros ni el token MCP.
                    session_store::backup_corrupt(&path);
                }
                self.restore(&path, &mut notice)
            }
        };
        let Some(mut map) = parsed else { return (Value::Null, notice) };

        let mut dropped = Vec::new();
        let fv = match map.get(VERSION_KEY) {
            None => 0,
            Some(v) => v.as_u64().unwrap_or_else(|| {
                dropped.push(VERSION_KEY.to_string());
                0
            }),
        };
        notice.file_version = Some(fv);
        // Las claves `__*` son marcas que la app agrega al responder (`__topoStore`, `__datafiles`):
        // un archivo editado a mano no puede suplantarlas.
        let reserved: Vec<String> = map.keys().filter(|k| k.starts_with("__")).cloned().collect();
        for k in reserved {
            map.remove(&k);
            dropped.push(k);
        }
        dropped.extend(validate_topology_keys(&mut map));
        if fv > schema.target {
            notice.newer = true;
            st.version = fv;
            st.bak_pending = true;
        } else {
            // Una cadena incompleta es un error de programación (lo cubre una prueba): se sigue con lo leído.
            let _ = migrate(&mut map, fv, schema);
            if fv < schema.target {
                notice.migrated_from = Some(fv);
                st.version = fv;
                st.bak_pending = true;
            }
        }
        map.remove(VERSION_KEY);
        if !dropped.is_empty() && !notice.newer {
            // Se descartó algo al leer: el original queda respaldado antes de que se reescriba.
            session_store::backup_corrupt(&path);
        }
        notice.dropped = dropped;
        (Value::Object(map), notice)
    }

    /// Busca el último respaldo válido de un archivo ilegible y lo devuelve ya escrito en su lugar.
    fn restore(&self, path: &Path, notice: &mut FileNotice) -> Option<Map<String, Value>> {
        for cand in [bak_path(path), bak2_path(path)] {
            if let Ok(Some((map, bytes))) = read_object(&cand) {
                if seal::write_atomic(path, &bytes).is_ok() {
                    notice.restored_from = cand.file_name().map(|n| n.to_string_lossy().into_owned());
                    return Some(map);
                }
            }
        }
        None
    }

    /// Guarda un archivo con su versión de esquema. Conserva lo que esta versión no entiende cuando
    /// el archivo es de una versión posterior, y copia el original antes del primer guardado tras migrar.
    pub fn save(&self, kind: Kind, data: Value) -> Result<(), String> {
        let schema = self.schema(kind);
        let Value::Object(mut map) = data else {
            return Err(if kind == Kind::Topology { "topología inválida".into() } else { "ajustes inválidos".into() });
        };
        if kind == Kind::Topology {
            map.retain(|k, _| TOPOLOGY_KEYS.contains(&k.as_str()));
        }
        map.remove(VERSION_KEY);
        // Las marcas `__*` son de la respuesta de `get_settings`, nunca se guardan.
        map.retain(|k, _| !k.starts_with("__"));
        let path = self.path(kind);
        let mut st = self.state(kind);

        if st.version > schema.target {
            // Archivo de una versión posterior: se relee y se conservan las claves que esta versión
            // no conoce o cuyo tipo no entiende (el frontend las reemplazó por valores por defecto).
            if let Ok(Some((raw, _))) = read_object(&path) {
                for (k, v) in raw {
                    if k == VERSION_KEY || k.starts_with("__") {
                        continue;
                    }
                    let known_topo = kind == Kind::Topology && TOPOLOGY_KEYS.contains(&k.as_str());
                    let keep = match map.get(&k) {
                        None => !known_topo,
                        Some(cur) => json_type(cur) != json_type(&v),
                    };
                    if keep {
                        map.insert(k, v);
                    }
                }
            }
        }
        map.insert(VERSION_KEY.into(), Value::from(schema.target.max(st.version)));

        let value = Value::Object(map);
        let compact = serde_json::to_string(&value).map_err(|e| e.to_string())?;
        if compact.len() > MAX_TOPOLOGY_BYTES {
            return Err(if kind == Kind::Topology {
                "La topología supera 64 MB: elimina snapshots antiguos o equipos que no uses.".into()
            } else {
                "Los ajustes superan 64 MB: elimina datos que no uses (historial de pruebas, monitores).".into()
            });
        }
        if st.bak_pending {
            write_version_backup(&path, st.version);
            st.bak_pending = false;
        }
        let json = if compact.len() < 512 * 1024 { serde_json::to_string_pretty(&value).map_err(|e| e.to_string())? } else { compact };
        seal::write_atomic(&path, json.as_bytes())?;
        st.version = schema.target.max(st.version);
        Ok(())
    }

    /// Ajustes y topología como los ve el frontend: topology.json manda sobre settings.json y solo
    /// aporta sus dos claves; `__topoStore` marca que la topología ya vive en su archivo.
    /// `sessions` es el aviso de sessions.json (se entrega una sola vez).
    pub fn load_merged(&self, sessions: Option<FileNotice>) -> Value {
        let (settings, sn) = self.load(Kind::Settings);
        let (topo, tn) = self.load(Kind::Topology);
        let mut out = merge_topology(settings, topo);
        if let Value::Object(o) = &mut out {
            let info = serde_json::json!({
                "schemaVersion": SCHEMA_VERSION,
                "settings": sn,
                "topology": tn,
                "sessions": sessions,
            });
            o.insert("__datafiles".into(), info);
        }
        out
    }
}

/// Agrega a los ajustes lo guardado en topology.json (que manda) y marca `__topoStore` para que
/// la app sepa que ya no tiene que migrarlo desde settings.json. Sin topology.json (o ilegible)
/// los ajustes quedan como estaban, sin la marca.
pub fn merge_topology(settings: Value, topo: Value) -> Value {
    let mut out = match settings {
        Value::Object(o) => o,
        _ => Map::new(),
    };
    if let Value::Object(t) = topo {
        for (k, v) in t {
            if TOPOLOGY_KEYS.contains(&k.as_str()) {
                out.insert(k, v);
            }
        }
        out.insert("__topoStore".into(), Value::Bool(true));
    }
    Value::Object(out)
}

// ---------- Respaldo rotativo del último estado válido ----------

pub fn valid_object(bytes: &[u8]) -> bool {
    serde_json::from_slice::<Value>(bytes).is_ok_and(|v| v.is_object())
}

/// sessions.json: un arreglo con al menos una entrada (uno vacío no sirve de respaldo).
pub fn valid_sessions(bytes: &[u8]) -> bool {
    serde_json::from_slice::<Vec<Value>>(bytes).is_ok_and(|v| !v.is_empty())
}

#[derive(Debug, PartialEq, Eq)]
pub enum Rotation {
    Rotated,
    /// Sin archivo, demasiado grande o no válido.
    Skipped,
    /// El respaldo es reciente.
    Fresh,
    /// Mismo contenido que el respaldo: no se desplaza la generación anterior.
    Unchanged,
    /// El archivo se encogió mucho: se conserva el respaldo.
    Shrunk,
}

/// Renueva `<archivo>.bak` con el contenido actual si es válido y el respaldo tiene más de
/// `min_age`; la versión previa pasa a `<archivo>.bak2`. Dos generaciones como máximo.
pub fn rotate_backup(path: &Path, validate: &dyn Fn(&[u8]) -> bool, now: SystemTime, min_age: Duration) -> Rotation {
    let Ok(meta) = fs::metadata(path) else { return Rotation::Skipped };
    if !meta.is_file() || meta.len() > MAX_READ_BYTES {
        return Rotation::Skipped;
    }
    let bak = bak_path(path);
    let bak_meta = fs::metadata(&bak).ok();
    // Fecha futura por poco (reloj ajustado): cuenta como reciente; muy futura (reloj roto): como vieja.
    let age = bak_meta.as_ref().and_then(|m| m.modified().ok()).map(|t| match now.duration_since(t) {
        Ok(a) => a,
        Err(e) if e.duration() < Duration::from_secs(24 * 3600) => Duration::ZERO,
        Err(_) => Duration::MAX,
    });
    if bak_meta.is_some() && age.is_some_and(|a| a < min_age) {
        return Rotation::Fresh;
    }
    let Ok(bytes) = fs::read(path) else { return Rotation::Skipped };
    if !validate(&bytes) {
        return Rotation::Skipped;
    }
    if let Some(bm) = &bak_meta {
        if fs::read(&bak).is_ok_and(|old| old == bytes) {
            return Rotation::Unchanged;
        }
        if bm.len() > 4096 && (bytes.len() as u64) < bm.len() / 4 && !age.is_some_and(|a| a >= SHRINK_GUARD_AGE) {
            return Rotation::Shrunk;
        }
        let _ = fs::rename(&bak, bak2_path(path));
    }
    if seal::write_atomic(&bak, &bytes).is_err() {
        return Rotation::Skipped;
    }
    session_store::restrict(&bak);
    Rotation::Rotated
}

type Validator = fn(&[u8]) -> bool;

/// Rota los respaldos de los tres archivos. Pensado para un hilo aparte.
pub fn rotate_all(dir: &Path, now: SystemTime, min_age: Duration) -> Vec<(&'static str, Rotation)> {
    let files: [(&'static str, Validator); 3] = [(SETTINGS_FILE, valid_object), (TOPOLOGY_FILE, valid_object), (SESSIONS_FILE, valid_sessions)];
    files
        .into_iter()
        .map(|(name, valid)| {
            let path = dir.join(name);
            let r = rotate_backup(&path, &valid, now, min_age);
            session_store::restrict(&bak2_path(&path));
            (name, r)
        })
        .collect()
}

/// Rota los respaldos pasados unos segundos del arranque, sin bloquear nada.
pub fn spawn_rotation(dir: PathBuf) {
    std::thread::spawn(move || {
        std::thread::sleep(ROTATE_DELAY);
        rotate_all(&dir, SystemTime::now(), BAK_MIN_AGE);
    });
}

/// Primer respaldo (`.bak`, luego `.bak2`) que `validate` acepta: su nombre y su contenido.
pub fn first_valid_backup(path: &Path, validate: &dyn Fn(&[u8]) -> bool) -> Option<(String, Vec<u8>)> {
    for cand in [bak_path(path), bak2_path(path)] {
        let Ok(meta) = fs::metadata(&cand) else { continue };
        if meta.len() > MAX_READ_BYTES {
            continue;
        }
        if let Ok(bytes) = fs::read(&cand) {
            if validate(&bytes) {
                return Some((cand.file_name()?.to_string_lossy().into_owned(), bytes));
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn temp_dir(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("nt-df-{tag}-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&d).unwrap();
        d
    }

    fn count(dir: &Path, prefix: &str) -> usize {
        fs::read_dir(dir).unwrap().flatten().filter(|e| e.file_name().to_string_lossy().starts_with(prefix)).count()
    }

    fn read_json(p: &Path) -> Value {
        serde_json::from_slice(&fs::read(p).unwrap()).unwrap()
    }

    const S0911: &str = include_str!("../../scripts/tests/fixtures/datafiles/v0.9.11/settings.json");
    const SESS0911: &str = include_str!("../../scripts/tests/fixtures/datafiles/v0.9.11/sessions.json");
    const S0916: &str = include_str!("../../scripts/tests/fixtures/datafiles/v0.9.16/settings.json");
    const T0916: &str = include_str!("../../scripts/tests/fixtures/datafiles/v0.9.16/topology.json");
    const S0920: &str = include_str!("../../scripts/tests/fixtures/datafiles/v0.9.20/settings.json");
    const T0920: &str = include_str!("../../scripts/tests/fixtures/datafiles/v0.9.20/topology.json");
    const SFUT: &str = include_str!("../../scripts/tests/fixtures/datafiles/futuro/settings.json");
    const TFUT: &str = include_str!("../../scripts/tests/fixtures/datafiles/futuro/topology.json");

    fn put(dir: &Path, name: &str, body: &str) {
        fs::write(dir.join(name), body).unwrap();
    }

    /// Esquema de pruebas con dos pasos: renombra `viejo` a `nuevo` (1) y agrega `capa` (2).
    static T_MIGRATIONS: [Migration; 2] = [
        Migration {
            from: 0,
            name: "viejo -> nuevo",
            run: |m| {
                if let Some(v) = m.remove("viejo") {
                    m.insert("nuevo".into(), v);
                }
            },
        },
        Migration {
            from: 1,
            name: "capa",
            run: |m| {
                m.entry("capa").or_insert(json!(1));
            },
        },
    ];
    const T2: Schema = Schema { target: 2, migrations: &T_MIGRATIONS };

    #[test]
    fn chain_is_complete_for_the_real_schemas() {
        for s in [SETTINGS_SCHEMA, TOPOLOGY_SCHEMA] {
            for v in 0..s.target {
                assert!(s.migrations.iter().any(|m| m.from == v), "falta el paso {v} -> {}", v + 1);
            }
            assert!(s.migrations.iter().all(|m| m.from < s.target));
            let mut m = Map::new();
            assert!(migrate(&mut m, 0, s).is_ok());
            assert_eq!(m[VERSION_KEY], s.target);
        }
        let mut m = Map::new();
        assert!(migrate(&mut m, 0, Schema { target: 3, migrations: &T_MIGRATIONS }).is_err(), "cadena incompleta");
    }

    #[test]
    fn migrations_run_in_order_and_are_idempotent() {
        let mut m = json!({"viejo": 5, "otro": [1]}).as_object().unwrap().clone();
        let applied = migrate(&mut m, 0, T2).unwrap();
        assert_eq!(applied, ["viejo -> nuevo", "capa"]);
        assert_eq!((m["nuevo"].clone(), m["capa"].clone(), m[VERSION_KEY].clone()), (json!(5), json!(1), json!(2)));
        assert_eq!(m["otro"], json!([1]), "claves desconocidas intactas");
        let again = m.clone();
        migrate(&mut m, 0, T2).unwrap();
        assert_eq!(m, again, "idempotente");
        // Desde la versión 1 solo corre el segundo paso.
        let mut m1 = json!({"viejo": 5}).as_object().unwrap().clone();
        assert_eq!(migrate(&mut m1, 1, T2).unwrap(), ["capa"]);
        assert!(m1.contains_key("viejo"));
    }

    /// Archivos reales de cada versión anterior: se leen, no pierden nada y toman la versión actual.
    #[test]
    fn loads_files_from_previous_versions() {
        // 0.9.11: la topología vive dentro de settings.json y no hay topology.json.
        let d = temp_dir("v0911");
        put(&d, SETTINGS_FILE, S0911);
        let df = DataFiles::new(&d);
        let v = df.load_merged(None);
        let info = &v["__datafiles"];
        assert_eq!(info["settings"]["fileVersion"], 0);
        assert_eq!(info["settings"]["migratedFrom"], 0);
        assert_eq!(info["topology"]["fileVersion"], Value::Null);
        assert!(v.get("__topoStore").is_none(), "sin topology.json la app migra la topología desde settings.json");
        assert_eq!(v["topology"]["nodes"].as_array().unwrap().len(), 2);
        assert_eq!(v["commandSuggest"], false, "el valor guardado llega tal cual; migrateSuggest lo resuelve en la interfaz");
        assert_eq!(v["mcpToken"], "0123456789abcdef0123456789abcdef0123456789abcdef");
        assert!(v.get(VERSION_KEY).is_none());
        assert_eq!(count(&d, "settings.corrupt-"), 0);
        assert_eq!(read_json(&d.join(SETTINGS_FILE))["appTheme"], "dark", "leer no escribe");
        // La interfaz migra la topología: la guarda en su archivo y deja los ajustes livianos.
        let mut light = v.as_object().unwrap().clone();
        let heavy = json!({"topology": light.remove("topology"), "topoSnapshots": light.remove("topoSnapshots")});
        light.remove("__datafiles");
        df.save(Kind::Topology, heavy).unwrap();
        df.save(Kind::Settings, Value::Object(light)).unwrap();
        assert_eq!(read_json(&d.join(TOPOLOGY_FILE))["topoSnapshots"][0]["name"], "Antes del cambio");
        assert!(read_json(&d.join(SETTINGS_FILE)).get("topology").is_none());
        assert_eq!(fs::read_to_string(d.join("settings.v0.bak.json")).unwrap(), S0911, "volver a la 0.9.11 conserva todo");
        let again = DataFiles::new(&d).load_merged(None);
        assert_eq!(again["__topoStore"], true);
        assert_eq!(again["topology"], v["topology"]);

        // 0.9.16 y 0.9.20: settings liviano + topology.json.
        for (tag, s, t) in [("v0916", S0916, T0916), ("v0920", S0920, T0920)] {
            let d = temp_dir(tag);
            put(&d, SETTINGS_FILE, s);
            put(&d, TOPOLOGY_FILE, t);
            let df = DataFiles::new(&d);
            let v = df.load_merged(None);
            assert_eq!(v["__topoStore"], true, "{tag}");
            assert_eq!(v["__datafiles"]["settings"]["fileVersion"], 0, "{tag}");
            assert_eq!(v["__datafiles"]["topology"]["fileVersion"], 0, "{tag}");
            assert_eq!(v["topology"]["nodes"].as_array().unwrap().len(), 3, "{tag}");
            let orig: Value = serde_json::from_str(s).unwrap();
            for (k, val) in orig.as_object().unwrap() {
                assert_eq!(&v[k], val, "{tag}: {k}");
            }
            fs::remove_dir_all(&d).unwrap();
        }
        fs::remove_dir_all(&d).unwrap();
    }

    /// Ida y vuelta: guardar con la versión actual y leer de nuevo no cambia datos; el archivo
    /// escrito tiene `schemaVersion` y sigue siendo un objeto plano que una versión anterior lee.
    #[test]
    fn roundtrip_writes_version_and_keeps_data() {
        for (tag, s, t) in [("rt16", S0916, T0916), ("rt20", S0920, T0920)] {
            let d = temp_dir(tag);
            put(&d, SETTINGS_FILE, s);
            put(&d, TOPOLOGY_FILE, t);
            let df = DataFiles::new(&d);
            let before = df.load_merged(None);
            let mut settings = before.as_object().unwrap().clone();
            let topo = json!({"topology": settings.remove("topology"), "topoSnapshots": settings.remove("topoSnapshots")});
            settings.remove("__topoStore");
            settings.remove("__datafiles");
            df.save(Kind::Settings, Value::Object(settings)).unwrap();
            df.save(Kind::Topology, topo).unwrap();
            assert_eq!(read_json(&d.join(SETTINGS_FILE))[VERSION_KEY], 1, "{tag}");
            assert_eq!(read_json(&d.join(TOPOLOGY_FILE))[VERSION_KEY], 1, "{tag}");
            // Una instancia nueva (otro arranque) lee lo mismo y ya sin migración pendiente.
            let after = DataFiles::new(&d).load_merged(None);
            assert_eq!(after["__datafiles"]["settings"]["fileVersion"], 1);
            assert_eq!(after["__datafiles"]["settings"]["migratedFrom"], Value::Null);
            for (k, v) in before.as_object().unwrap() {
                if k != "__datafiles" {
                    assert_eq!(&after[k], v, "{tag}: {k}");
                }
            }
            // La copia del original quedó junto al archivo, idéntica a lo que había.
            assert_eq!(fs::read_to_string(d.join("settings.v0.bak.json")).unwrap(), s, "{tag}");
            assert_eq!(fs::read_to_string(d.join("topology.v0.bak.json")).unwrap(), t, "{tag}");
            fs::remove_dir_all(&d).unwrap();
        }
    }

    /// Volver a una versión anterior: modela lo que hacía la 0.9.20 (settings.json opaco que se
    /// reescribe con lo que conoce; save_topology filtra a sus dos claves) y vuelve a abrirse.
    #[test]
    fn older_app_can_open_and_rewrite_new_files() {
        let d = temp_dir("older");
        put(&d, SETTINGS_FILE, S0920);
        put(&d, TOPOLOGY_FILE, T0920);
        let df = DataFiles::new(&d);
        let mut s = df.load_merged(None).as_object().unwrap().clone();
        let topo = json!({"topology": s.remove("topology"), "topoSnapshots": s.remove("topoSnapshots")});
        s.remove("__topoStore");
        s.remove("__datafiles");
        df.save(Kind::Settings, Value::Object(s)).unwrap();
        df.save(Kind::Topology, topo).unwrap();

        // La app anterior lee settings.json como JSON opaco: el objeto es válido y `schemaVersion`
        // es una clave desconocida que su mergeSettings conserva.
        let seen_by_old = read_json(&d.join(SETTINGS_FILE));
        assert!(seen_by_old.is_object());
        // La app anterior guarda: settings.json conserva schemaVersion (clave desconocida), topology.json
        // la pierde (filtra a sus dos claves).
        let mut old_settings = seen_by_old.as_object().unwrap().clone();
        old_settings.insert("fontSize".into(), json!(17));
        fs::write(d.join(SETTINGS_FILE), serde_json::to_string_pretty(&old_settings).unwrap()).unwrap();
        let old_topo: Map<String, Value> = read_json(&d.join(TOPOLOGY_FILE)).as_object().unwrap().iter().filter(|(k, _)| TOPOLOGY_KEYS.contains(&k.as_str())).map(|(k, v)| (k.clone(), v.clone())).collect();
        fs::write(d.join(TOPOLOGY_FILE), serde_json::to_string(&old_topo).unwrap()).unwrap();

        // La app nueva vuelve a abrir: settings en v1 con el cambio; topology sin campo (v0), se re-migra sin pérdida.
        let df2 = DataFiles::new(&d);
        let v = df2.load_merged(None);
        assert_eq!(v["fontSize"], 17);
        assert_eq!(v["__datafiles"]["settings"]["fileVersion"], 1);
        assert_eq!(v["__datafiles"]["topology"]["fileVersion"], 0);
        assert_eq!(v["__datafiles"]["topology"]["migratedFrom"], 0);
        assert_eq!(v["topology"]["nodes"].as_array().unwrap().len(), 3);
        assert_eq!(v["floatingSidebar"], true);
        fs::remove_dir_all(&d).unwrap();
    }

    /// Una versión posterior: se conservan las claves desconocidas y los tipos que no se entienden,
    /// se copia el original una sola vez y se avisa.
    #[test]
    fn newer_files_keep_unknown_keys_and_are_backed_up() {
        let d = temp_dir("newer");
        put(&d, SETTINGS_FILE, SFUT);
        put(&d, TOPOLOGY_FILE, TFUT);
        let df = DataFiles::new(&d);
        let v = df.load_merged(None);
        let info = &v["__datafiles"];
        assert_eq!(info["settings"]["newer"], true);
        assert_eq!(info["settings"]["fileVersion"], 7);
        assert_eq!(info["topology"]["newer"], true);
        assert_eq!(info["settings"]["migratedFrom"], Value::Null);
        assert_eq!(v["temaNuevo"]["contraste"], 1.4);

        // El frontend de esta versión devuelve lo que entiende; `mcpPort` (objeto en el archivo, número
        // aquí) lo reemplazó por el valor por defecto.
        df.save(Kind::Settings, json!({"appTheme": "light", "fontSize": 15, "mcpPort": 47821, "temaNuevo": {"x": 1}})).unwrap();
        df.save(Kind::Topology, json!({"topology": {"nodes": [], "links": []}, "topoSnapshots": [], "otraCosa": 1})).unwrap();
        let s = read_json(&d.join(SETTINGS_FILE));
        assert_eq!(s[VERSION_KEY], 7, "no se baja la versión");
        assert_eq!(s["appTheme"], "light", "lo que el usuario cambió vale");
        assert_eq!(s["panelLateral"], "izquierda", "clave que falta: se conserva");
        assert_eq!(s["mcpPort"], json!({"http": 47821, "ws": 47822}), "tipo distinto: se conserva el del archivo");
        assert_eq!(s["temaNuevo"], json!({"x": 1}), "mismo tipo: gana lo guardado ahora");
        let t = read_json(&d.join(TOPOLOGY_FILE));
        assert_eq!(t[VERSION_KEY], 7);
        assert_eq!(t["topoCapas"][0]["nombre"], "WAN", "clave desconocida de topology.json");
        assert!(t.get("otraCosa").is_none(), "save_topology solo acepta sus dos claves");
        // Copia del original, una sola vez.
        assert_eq!(fs::read_to_string(d.join("settings.v7.bak.json")).unwrap(), SFUT);
        assert_eq!(fs::read_to_string(d.join("topology.v7.bak.json")).unwrap(), TFUT);
        df.save(Kind::Settings, json!({"appTheme": "dark"})).unwrap();
        assert_eq!(fs::read_to_string(d.join("settings.v7.bak.json")).unwrap(), SFUT, "no se pisa");
        assert_eq!(read_json(&d.join(SETTINGS_FILE))["appTheme"], "dark");
        fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn version_backup_is_made_before_first_write_only() {
        let d = temp_dir("verbak");
        put(&d, SETTINGS_FILE, S0920);
        let df = DataFiles::new(&d);
        let (_, n) = df.load(Kind::Settings);
        assert_eq!(n.migrated_from, Some(0));
        assert!(!d.join("settings.v0.bak.json").exists(), "leer no copia");
        df.save(Kind::Settings, json!({"a": 1})).unwrap();
        assert_eq!(fs::read_to_string(d.join("settings.v0.bak.json")).unwrap(), S0920);
        df.save(Kind::Settings, json!({"a": 2})).unwrap();
        assert_eq!(fs::read_to_string(d.join("settings.v0.bak.json")).unwrap(), S0920);
        // Sin archivo previo no hay nada que copiar.
        let d2 = temp_dir("verbak2");
        let df2 = DataFiles::new(&d2);
        assert_eq!(df2.load(Kind::Settings).0, Value::Null);
        df2.save(Kind::Settings, json!({"a": 1})).unwrap();
        assert_eq!(count(&d2, "settings.v"), 0);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = fs::metadata(d.join("settings.v0.bak.json")).unwrap().permissions().mode() & 0o777;
            assert_eq!(mode, 0o600);
        }
        fs::remove_dir_all(&d).unwrap();
        fs::remove_dir_all(&d2).unwrap();
    }

    /// Dos versiones de esquema: el archivo v0 recorre la cadena completa y la copia queda con su versión de origen.
    #[test]
    fn custom_schema_chain_through_load_and_save() {
        let d = temp_dir("chain");
        put(&d, SETTINGS_FILE, r#"{"viejo": 9, "x": true}"#);
        let df = DataFiles::with_schemas(&d, T2, T2);
        let (v, n) = df.load(Kind::Settings);
        assert_eq!(v["nuevo"], 9);
        assert_eq!(v["capa"], 1);
        assert!(v.get("viejo").is_none());
        assert_eq!(n.migrated_from, Some(0));
        df.save(Kind::Settings, v).unwrap();
        assert_eq!(read_json(&d.join(SETTINGS_FILE))[VERSION_KEY], 2);
        assert!(d.join("settings.v0.bak.json").exists());
        // Un archivo v1 solo corre el segundo paso, con copia v1.
        put(&d, SETTINGS_FILE, r#"{"schemaVersion": 1, "nuevo": 3}"#);
        let (v1, n1) = DataFiles::with_schemas(&d, T2, T2).load(Kind::Settings);
        assert_eq!(n1.migrated_from, Some(1));
        assert_eq!(v1["capa"], 1);
        // Una app que solo conoce v1 abre un archivo v2: newer, sin migrar.
        let one = Schema { target: 1, migrations: &T_MIGRATIONS[..1] };
        put(&d, SETTINGS_FILE, r#"{"schemaVersion": 2, "nuevo": 3, "capa": 1}"#);
        let (_, n2) = DataFiles::with_schemas(&d, one, one).load(Kind::Settings);
        assert!(n2.newer);
        fs::remove_dir_all(&d).unwrap();
    }

    /// Archivo ilegible con respaldo: se restaura y se informa; sin respaldo, Null como antes.
    #[test]
    fn corrupt_file_is_restored_from_backup() {
        let d = temp_dir("restore");
        let path = d.join(SETTINGS_FILE);
        put(&d, SETTINGS_FILE, S0920);
        assert_eq!(rotate_backup(&path, &valid_object, SystemTime::now(), BAK_MIN_AGE), Rotation::Rotated);
        assert_eq!(fs::read_to_string(d.join("settings.json.bak")).unwrap(), S0920);

        let cases: [&[u8]; 4] = [br#"{"fontSize": 1"#, b"[1, 2]", b"null", &[0xff, 0xfe, b'{']];
        for (i, bad) in cases.into_iter().enumerate() {
            fs::write(&path, bad).unwrap();
            let df = DataFiles::new(&d);
            let (v, n) = df.load(Kind::Settings);
            assert_eq!(v["floatingSidebar"], true, "caso {i}");
            assert_eq!(n.restored_from.as_deref(), Some("settings.json.bak"), "caso {i}");
            assert!(n.corrupt, "caso {i}");
            assert_eq!(fs::read_to_string(&path).unwrap(), S0920, "caso {i}: el archivo quedó restaurado");
        }
        assert!(count(&d, "settings.corrupt-") >= 1, "el dañado quedó aparte");

        // .bak ilegible también: se usa .bak2.
        fs::write(d.join("settings.json.bak2"), S0916).unwrap();
        fs::write(d.join("settings.json.bak"), b"{ roto").unwrap();
        fs::write(&path, b"{ roto").unwrap();
        let (v, n) = DataFiles::new(&d).load(Kind::Settings);
        assert_eq!(n.restored_from.as_deref(), Some("settings.json.bak2"));
        assert_eq!(v["tabLayout"], "horizontal");

        // Sin respaldos: Null, y el original dañado se conserva hasta que la app guarde.
        let d2 = temp_dir("norestore");
        fs::write(d2.join(SETTINGS_FILE), b"{ roto").unwrap();
        let (v, n) = DataFiles::new(&d2).load(Kind::Settings);
        assert!(v.is_null() && n.restored_from.is_none() && n.corrupt);
        assert_eq!(fs::read(d2.join(SETTINGS_FILE)).unwrap(), b"{ roto");
        assert_eq!(count(&d2, "settings.corrupt-"), 1);
        // Sin archivo no se restaura (borrarlo es una forma de reiniciar los ajustes).
        let d3 = temp_dir("deleted");
        fs::write(d3.join("settings.json.bak"), S0920).unwrap();
        assert!(DataFiles::new(&d3).load(Kind::Settings).0.is_null());
        assert!(!d3.join(SETTINGS_FILE).exists());
        for x in [d, d2, d3] {
            fs::remove_dir_all(&x).unwrap();
        }
    }

    #[test]
    fn topology_restores_and_validates() {
        let d = temp_dir("topo");
        put(&d, TOPOLOGY_FILE, T0920);
        let path = d.join(TOPOLOGY_FILE);
        rotate_backup(&path, &valid_object, SystemTime::now(), BAK_MIN_AGE);
        fs::write(&path, b"\0\0\0").unwrap();
        let (v, n) = DataFiles::new(&d).load(Kind::Topology);
        assert_eq!(v["topology"]["nodes"].as_array().unwrap().len(), 3);
        assert!(n.restored_from.is_some());
        // Forma inválida: se descartan solo las claves malas, el resto se usa y el original se respalda.
        put(&d, SETTINGS_FILE, r#"{"fontSize": 13, "topology": "x", "topoSnapshots": [1, {"id": "s"}, null], "__topoStore": true, "schemaVersion": "uno"}"#);
        let (s, n) = DataFiles::new(&d).load(Kind::Settings);
        assert_eq!(s["fontSize"], 13);
        assert!(s.get("topology").is_none() && s.get("__topoStore").is_none());
        assert_eq!(s["topoSnapshots"].as_array().unwrap().len(), 1);
        assert_eq!(n.file_version, Some(0), "versión inválida: se trata como v0");
        for k in ["topology", "topoSnapshots (2 entradas)", "__topoStore", "schemaVersion"] {
            assert!(n.dropped.iter().any(|x| x == k), "falta {k} en {:?}", n.dropped);
        }
        assert_eq!(count(&d, "settings.corrupt-"), 1);
        put(&d, TOPOLOGY_FILE, r#"{"topology": {"nodes": [], "links": 5}, "topoSnapshots": {}}"#);
        let (t, n) = DataFiles::new(&d).load(Kind::Topology);
        assert!(t.as_object().unwrap().is_empty());
        assert_eq!(n.dropped.len(), 2);
        fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn oversize_file_is_set_aside_not_parsed() {
        let d = temp_dir("big");
        let path = d.join(TOPOLOGY_FILE);
        let f = fs::File::create(&path).unwrap();
        f.set_len(MAX_READ_BYTES + 1).unwrap(); // dispersa: no ocupa disco
        drop(f);
        let (v, n) = DataFiles::new(&d).load(Kind::Topology);
        assert!(v.is_null() && n.too_large && n.corrupt);
        assert!(!path.exists(), "se apartó sin copiar 64 MB");
        assert_eq!(count(&d, "topology.corrupt-"), 1);
        fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn topology_over_limit_returns_error_and_keeps_file() {
        let d = temp_dir("limit");
        let df = DataFiles::new(&d);
        df.save(Kind::Topology, json!({"topology": {"nodes": [], "links": []}, "topoSnapshots": []})).unwrap();
        let before = fs::read(d.join(TOPOLOGY_FILE)).unwrap();
        let big = json!({"topology": {"nodes": [], "links": []}, "topoSnapshots": [{"id": "s", "pad": "x".repeat(MAX_TOPOLOGY_BYTES + 10)}]});
        let err = df.save(Kind::Topology, big).unwrap_err();
        assert!(err.contains("64 MB"), "{err}");
        assert_eq!(fs::read(d.join(TOPOLOGY_FILE)).unwrap(), before);
        assert_eq!(count(&d, ".tmp"), 0);
        assert!(df.save(Kind::Topology, json!([1])).is_err());
        fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn rotation_policy() {
        let d = temp_dir("rot");
        let path = d.join(SETTINGS_FILE);
        let now = SystemTime::now();
        let day = Duration::from_secs(24 * 3600);
        assert_eq!(rotate_backup(&path, &valid_object, now, BAK_MIN_AGE), Rotation::Skipped, "sin archivo");
        put(&d, SETTINGS_FILE, r#"{"a": 1}"#);
        assert_eq!(rotate_backup(&path, &valid_object, now, BAK_MIN_AGE), Rotation::Rotated);
        assert_eq!(rotate_backup(&path, &valid_object, now, BAK_MIN_AGE), Rotation::Fresh, "una vez al día");
        // Pasado un día: contenido igual no desplaza la generación.
        let later = now + day * 2;
        assert_eq!(rotate_backup(&path, &valid_object, later, BAK_MIN_AGE), Rotation::Unchanged);
        assert!(!d.join("settings.json.bak2").exists());
        // Contenido nuevo: el anterior pasa a .bak2.
        put(&d, SETTINGS_FILE, r#"{"a": 2}"#);
        assert_eq!(rotate_backup(&path, &valid_object, later, BAK_MIN_AGE), Rotation::Rotated);
        assert_eq!(fs::read_to_string(d.join("settings.json.bak")).unwrap(), r#"{"a": 2}"#);
        assert_eq!(fs::read_to_string(d.join("settings.json.bak2")).unwrap(), r#"{"a": 1}"#);
        put(&d, SETTINGS_FILE, r#"{"a": 3}"#);
        assert_eq!(rotate_backup(&path, &valid_object, later + day * 2, BAK_MIN_AGE), Rotation::Rotated);
        assert_eq!(fs::read_to_string(d.join("settings.json.bak2")).unwrap(), r#"{"a": 2}"#, "dos generaciones como máximo");
        assert_eq!(count(&d, "settings.json."), 2);
        // Un archivo inválido nunca reemplaza al respaldo.
        put(&d, SETTINGS_FILE, "{ roto");
        assert_eq!(rotate_backup(&path, &valid_object, later + day * 9, BAK_MIN_AGE), Rotation::Skipped);
        assert_eq!(fs::read_to_string(d.join("settings.json.bak")).unwrap(), r#"{"a": 3}"#);
        fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn rotation_guards_against_data_loss() {
        let d = temp_dir("shrink");
        let path = d.join(SETTINGS_FILE);
        let big = json!({"macros": vec!["comando largo de ejemplo"; 400]}).to_string();
        fs::write(&path, &big).unwrap();
        let now = SystemTime::now();
        rotate_backup(&path, &valid_object, now, BAK_MIN_AGE);
        // JSON válido pero casi vacío (datos perdidos): el respaldo bueno se conserva.
        put(&d, SETTINGS_FILE, "{}");
        let day = Duration::from_secs(24 * 3600);
        assert_eq!(rotate_backup(&path, &valid_object, now + day * 2, BAK_MIN_AGE), Rotation::Shrunk);
        assert_eq!(fs::read_to_string(d.join("settings.json.bak")).unwrap(), big);
        // Pasada una semana se acepta como el nuevo estado (el usuario sí pudo borrar datos).
        assert_eq!(rotate_backup(&path, &valid_object, now + day * 9, BAK_MIN_AGE), Rotation::Rotated);
        assert_eq!(fs::read_to_string(d.join("settings.json.bak2")).unwrap(), big);
        // sessions.json vacío no sirve de respaldo.
        assert!(!valid_sessions(b"[]") && valid_sessions(SESS0911.as_bytes()) && !valid_sessions(b"{}"));
        fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn rotate_all_covers_the_three_files_and_caps_sizes() {
        let d = temp_dir("all");
        put(&d, SETTINGS_FILE, S0920);
        put(&d, TOPOLOGY_FILE, T0920);
        put(&d, SESSIONS_FILE, SESS0911);
        let r = rotate_all(&d, SystemTime::now(), BAK_MIN_AGE);
        assert!(r.iter().all(|(_, x)| *x == Rotation::Rotated), "{r:?}");
        for f in [SETTINGS_FILE, TOPOLOGY_FILE, SESSIONS_FILE] {
            assert!(d.join(format!("{f}.bak")).is_file(), "{f}");
        }
        // Archivo sobre el tope: no se respalda.
        let huge = d.join("huge.json");
        let f = fs::File::create(&huge).unwrap();
        f.set_len(MAX_READ_BYTES + 1).unwrap();
        drop(f);
        assert_eq!(rotate_backup(&huge, &valid_object, SystemTime::now(), BAK_MIN_AGE), Rotation::Skipped);
        assert!(!d.join("huge.json.bak").exists());
        fs::remove_dir_all(&d).unwrap();
    }

    /// Los respaldos corruptos no crecen sin límite.
    #[test]
    fn corrupt_copies_are_capped() {
        let d = temp_dir("cap");
        let path = d.join(SETTINGS_FILE);
        for i in 0..(KEEP_CORRUPT + 4) {
            let dest = d.join(format!("settings.corrupt-{}.json", 1000 + i));
            fs::write(dest, b"x").unwrap();
        }
        fs::write(&path, b"{ roto").unwrap();
        session_store::backup_corrupt(&path);
        assert_eq!(count(&d, "settings.corrupt-"), KEEP_CORRUPT);
        // Quedan los más recientes (el recién creado lleva la hora actual).
        assert!(!d.join("settings.corrupt-1000.json").exists());
        assert!(d.join(format!("settings.corrupt-{}.json", 1000 + KEEP_CORRUPT + 3)).exists());
        fs::remove_dir_all(&d).unwrap();
    }

    /// topology.json manda sobre settings.json y solo aporta sus dos claves; sin archivo (o dañado)
    /// los ajustes quedan como estaban, sin la marca de migración.
    #[test]
    fn topology_store_merges_over_settings() {
        let s = json!({"fontSize": 14, "topology": {"nodes": [1]}});
        let merged = merge_topology(s.clone(), json!({"topology": {"nodes": [2]}, "topoSnapshots": [], "otro": 1}));
        assert_eq!(merged["topology"]["nodes"][0], 2);
        assert_eq!(merged["fontSize"], 14);
        assert!(merged.get("otro").is_none());
        assert_eq!(merged["__topoStore"], true);
        assert_eq!(merge_topology(s.clone(), Value::Null), s);
        assert_eq!(merge_topology(Value::Null, json!({"topoSnapshots": []}))["__topoStore"], true);
    }

    #[test]
    fn json_formatting_and_concurrent_saves() {
        let d = temp_dir("fmt");
        let df = std::sync::Arc::new(DataFiles::new(&d));
        df.save(Kind::Settings, json!({"a": 1, "__topoStore": true, "schemaVersion": 99})).unwrap();
        let saved = read_json(&d.join(SETTINGS_FILE));
        assert!(saved.get("__topoStore").is_none() && saved[VERSION_KEY] == 1, "marcas internas y versión ajena no se guardan");
        assert!(fs::read_to_string(d.join(SETTINGS_FILE)).unwrap().contains('\n'), "chico: con sangría");
        df.save(Kind::Settings, json!({"x": "y".repeat(600 * 1024)})).unwrap();
        assert!(!fs::read_to_string(d.join(SETTINGS_FILE)).unwrap().contains('\n'), "grande: compacto");

        // Guardados, lecturas y rotación simultáneos: siempre queda un JSON íntegro con versión.
        let hs: Vec<_> = (0..8)
            .map(|i| {
                let df = df.clone();
                let dir = d.clone();
                std::thread::spawn(move || {
                    for j in 0..15 {
                        let kind = if i % 2 == 0 { Kind::Settings } else { Kind::Topology };
                        let body = if kind == Kind::Settings { json!({"n": i, "pad": "z".repeat(100_000)}) } else { json!({"topology": {"nodes": [], "links": []}, "topoSnapshots": [{"n": j}]}) };
                        df.save(kind, body).unwrap();
                        let (v, _) = df.load(kind);
                        assert!(v.is_object());
                        if j % 5 == 0 {
                            rotate_all(&dir, SystemTime::now() + Duration::from_secs(10 * 24 * 3600 * (j as u64 + 1)), BAK_MIN_AGE);
                        }
                    }
                })
            })
            .collect();
        for h in hs {
            h.join().unwrap();
        }
        for f in [SETTINGS_FILE, TOPOLOGY_FILE] {
            let v = read_json(&d.join(f));
            assert_eq!(v[VERSION_KEY], 1, "{f}");
            for b in [format!("{f}.bak"), format!("{f}.bak2")] {
                if d.join(&b).exists() {
                    assert!(valid_object(&fs::read(d.join(&b)).unwrap()), "{b} íntegro");
                }
            }
        }
        assert_eq!(count(&d, "settings.json.") + count(&d, "topology.json."), count(&d, "settings.json.bak") + count(&d, "topology.json.bak"), "sin temporales");
        fs::remove_dir_all(&d).unwrap();
    }

    /// Mide el tiempo de carga con una topología grande: el trabajo nuevo (versión, validación) no debe
    /// pesar frente a leer y parsear. Imprime los tiempos con `--nocapture`.
    #[test]
    fn load_time_stays_close_to_plain_parse() {
        let d = temp_dir("timing");
        let nodes: Vec<Value> = (0..40_000).map(|i| json!({"id": format!("n{i}"), "name": format!("sw-{i}"), "x": i, "y": i * 2, "platform": "iosxe"})).collect();
        let links: Vec<Value> = (0..40_000).map(|i| json!({"a": format!("n{i}"), "b": format!("n{}", i + 1), "aPort": "Gi0/1", "bPort": "Gi0/2", "proto": "cdp"})).collect();
        let topo = json!({"topology": {"nodes": nodes, "links": links}, "topoSnapshots": []});
        let df = DataFiles::new(&d);
        df.save(Kind::Topology, topo).unwrap();
        df.save(Kind::Settings, serde_json::from_str::<Value>(S0920).unwrap()).unwrap();
        let size = fs::metadata(d.join(TOPOLOGY_FILE)).unwrap().len();
        let best = |f: &dyn Fn()| (0..5).map(|_| { let t = std::time::Instant::now(); f(); t.elapsed() }).min().unwrap();
        // Antes: lo que hacía get_settings (leer, parsear, mezclar).
        let before = best(&|| {
            let read = |n: &str| serde_json::from_slice::<Value>(&fs::read(d.join(n)).unwrap()).unwrap();
            let v = merge_topology(read(SETTINGS_FILE), read(TOPOLOGY_FILE));
            assert!(v.is_object());
        });
        let after = best(&|| {
            let v = DataFiles::new(&d).load_merged(None);
            assert!(v.is_object());
        });
        eprintln!("carga con topology.json de {:.1} MB: antes {:?}, ahora {:?}", size as f64 / 1e6, before, after);
        assert!(after < before * 2 + Duration::from_millis(30), "antes {before:?}, ahora {after:?}");
        fs::remove_dir_all(&d).unwrap();
    }
}
