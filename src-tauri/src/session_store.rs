use crate::models::{Session, SessionType};
use chrono::Utc;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use uuid::Uuid;

pub struct SessionStore {
    file_path: PathBuf,
    sessions: Mutex<Vec<Session>>,
    /// sessions.json existe pero no se pudo leer (permisos, error de disco): no se escribe
    /// encima para no reemplazar las sesiones del usuario por las de ejemplo.
    load_error: Option<String>,
    /// Qué pasó al abrir sessions.json (restaurado desde el respaldo, entradas descartadas); se
    /// entrega una sola vez a la interfaz con `take_notice`.
    notice: Mutex<Option<crate::datafiles::FileNotice>>,
}

/// Carpeta "visible" donde vive la app, para el modo portable:
/// - Linux AppImage: se ejecuta montado en /tmp; la ruta real viene en $APPIMAGE.
/// - macOS: el binario está en NetTerminal.app/Contents/MacOS; se usa la carpeta del .app.
/// - Windows y resto: la carpeta del ejecutable.
fn portable_root(exe: &Path, appimage: Option<PathBuf>) -> Option<PathBuf> {
    if let Some(img) = appimage {
        return img.parent().map(Path::to_path_buf);
    }
    let dir = exe.parent()?;
    let bundle = dir
        .ancestors()
        .find(|a| a.extension().is_some_and(|e| e == "app"));
    match bundle {
        Some(app) if dir.ends_with("Contents/MacOS") => app.parent().map(Path::to_path_buf),
        _ => Some(dir.to_path_buf()),
    }
}

/// Directorio de datos. En modo portable (existe `portable` o `data/` junto a la app)
/// todo vive en `data/` al lado de los ejecutables, compartido entre Windows, macOS y
/// Linux; si no, en el directorio de configuración del sistema operativo.
/// Restringe permisos al usuario actual (Unix): la carpeta de datos contiene el token
/// MCP, logs con salida de equipos y notas.
pub fn restrict(path: &Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = if path.is_dir() { 0o700 } else { 0o600 };
        let _ = fs::set_permissions(path, fs::Permissions::from_mode(mode));
    }
    #[cfg(not(unix))]
    let _ = path;
}

/// true si la app corre en modo portable (marcador `portable` o carpeta `data/` al lado).
pub fn is_portable() -> bool {
    std::env::current_exe()
        .ok()
        .and_then(|exe| portable_root(&exe, std::env::var_os("APPIMAGE").map(PathBuf::from)))
        .is_some_and(|root| root.join("portable").exists() || root.join("data").is_dir())
}

pub fn resolve_data_dir(os_config_dir: PathBuf) -> PathBuf {
    let root = std::env::current_exe()
        .ok()
        .and_then(|exe| portable_root(&exe, std::env::var_os("APPIMAGE").map(PathBuf::from)));
    if let Some(root) = root {
        if root.join("portable").exists() || root.join("data").is_dir() {
            return root.join("data");
        }
    }
    os_config_dir
}

impl SessionStore {
    pub fn new(data_dir: &Path) -> Self {
        let _ = fs::create_dir_all(data_dir);
        restrict(data_dir);
        let file_path = data_dir.join("sessions.json");

        // Migración desde la ubicación de la versión anterior (~/.netterminal)
        if !file_path.exists() {
            if let Some(home) = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")) {
                let legacy = PathBuf::from(home).join(".netterminal").join("sessions.json");
                if legacy.exists() {
                    let _ = fs::copy(&legacy, &file_path);
                }
            }
        }

        let mut load_error = None;
        // Al abrir solo se escribe si hace falta (archivo nuevo o entradas descartadas): un
        // archivo sano queda tal cual, también los campos que agregue una versión más nueva.
        let mut rewrite = false;
        let mut notice = crate::datafiles::FileNotice::default();
        let sessions = match fs::read(&file_path) {
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                rewrite = true;
                Self::default_sessions()
            }
            Err(e) => {
                backup_corrupt(&file_path);
                load_error = Some(format!(
                    "No se pudo leer {}: {e}. Revisa sus permisos y reinicia la app; mientras tanto no se guardan cambios de sesiones.",
                    file_path.display()
                ));
                Self::default_sessions()
            }
            Ok(bytes) => {
                // Bytes que no son UTF-8 (archivo editado con otra codificación): se recupera lo
                // legible y se respalda el original, en vez de descartar todas las sesiones.
                let utf8 = String::from_utf8(bytes).map_err(|e| String::from_utf8_lossy(e.as_bytes()).into_owned());
                let lossy = utf8.is_err();
                let content = utf8.unwrap_or_else(|s| s);
                // Se descartan solo las entradas inválidas (puerto fuera de rango, tipo
                // desconocido tras volver a una versión anterior, edición manual), nunca todo.
                let parsed = serde_json::from_str::<Vec<serde_json::Value>>(&content);
                let valid: Vec<Session> = parsed
                    .as_ref()
                    .map(|items| items.iter().filter_map(|v| serde_json::from_value(v.clone()).ok()).collect())
                    .unwrap_or_default();
                let lost = lossy || parsed.as_ref().map(|items| items.len() != valid.len()).unwrap_or(true);
                rewrite = lost;
                if lost {
                    // Respaldo del archivo original antes de reescribirlo.
                    backup_corrupt(&file_path);
                    notice.corrupt = parsed.is_err();
                    if let Ok(items) = &parsed {
                        notice.dropped = items
                            .iter()
                            .enumerate()
                            .filter(|(_, v)| serde_json::from_value::<Session>((*v).clone()).is_err())
                            .take(20)
                            .map(|(i, _)| format!("sesión {}", i + 1))
                            .collect();
                    }
                }
                if parsed.is_err() {
                    // Ni siquiera es un arreglo JSON: se intenta el último respaldo válido antes de
                    // caer en las sesiones de ejemplo.
                    match crate::datafiles::first_valid_backup(&file_path, &crate::datafiles::valid_sessions) {
                        Some((name, bytes)) => {
                            let restored: Vec<Session> = serde_json::from_slice::<Vec<serde_json::Value>>(&bytes)
                                .unwrap_or_default()
                                .into_iter()
                                .filter_map(|v| serde_json::from_value(v).ok())
                                .collect();
                            if restored.is_empty() {
                                Self::default_sessions()
                            } else {
                                notice.restored_from = Some(name);
                                restored
                            }
                        }
                        None => Self::default_sessions(),
                    }
                } else {
                    valid
                }
            }
        };

        let store = Self {
            file_path,
            sessions: Mutex::new(sessions),
            load_error,
            notice: Mutex::new((notice.corrupt || notice.restored_from.is_some() || !notice.dropped.is_empty()).then_some(notice)),
        };
        if rewrite {
            let _ = store.persist(&store.sessions.lock().unwrap());
        }
        store
    }

    fn default_sessions() -> Vec<Session> {
        vec![Session {
            id: Uuid::new_v4().to_string(),
            name: "Terminal local".to_string(),
            session_type: SessionType::Local,
            folder: Some("Local".to_string()),
            host: None,
            port: None,
            username: None,
            identity_file: None,
            legacy_ssh: None,
            jump_host: None,
            ssh_args: None,
            tunnels: None,
            serial_port: None,
            baud_rate: None,
            data_bits: None,
            stop_bits: None,
            parity: None,
            flow_control: None,
            highlight: None,
            on_connect: None,
            newline: None,
            backspace: None,
            local_echo: None,
            encoding: None,
            auto_reconnect: None,
            platform: None,
            scp: None,
            save_password: None,
            created_at: Utc::now().to_rfc3339(),
        }]
    }

    /// Aviso de la apertura de sessions.json (una sola vez); None si no hubo nada que informar.
    pub fn take_notice(&self) -> Option<crate::datafiles::FileNotice> {
        self.notice.lock().unwrap_or_else(|e| e.into_inner()).take()
    }

    pub fn list(&self) -> Vec<Session> {
        self.sessions.lock().unwrap().clone()
    }

    pub fn get(&self, id: &str) -> Option<Session> {
        self.sessions.lock().unwrap().iter().find(|s| s.id == id).cloned()
    }

    pub fn ids(&self) -> Vec<String> {
        self.sessions.lock().unwrap().iter().map(|s| s.id.clone()).collect()
    }

    pub fn save(&self, mut session: Session) -> Result<Session, String> {
        if crate::credentials::reserved_id(&session.id) {
            return Err("Id de sesión inválido".into());
        }
        let mut list = self.sessions.lock().unwrap();
        if session.id.is_empty() {
            session.id = Uuid::new_v4().to_string();
            session.created_at = Utc::now().to_rfc3339();
            list.push(session.clone());
        } else if let Some(idx) = list.iter().position(|s| s.id == session.id) {
            list[idx] = session.clone();
        } else {
            list.push(session.clone());
        }
        self.persist(&list)?;
        Ok(session)
    }

    /// Agrega varias sesiones nuevas en una sola escritura (importaciones grandes).
    pub fn add_many(&self, new: Vec<Session>) -> Result<Vec<Session>, String> {
        let mut list = self.sessions.lock().unwrap();
        let now = Utc::now().to_rfc3339();
        for mut s in new {
            s.id = Uuid::new_v4().to_string();
            // Una sesión importada nunca trae contraseña guardada.
            s.save_password = None;
            s.created_at = now.clone();
            list.push(s);
        }
        self.persist(&list)?;
        Ok(list.clone())
    }

    /// Actualiza varias sesiones existentes en una sola escritura (mover/renombrar carpetas).
    pub fn update_many(&self, changed: Vec<Session>) -> Result<Vec<Session>, String> {
        let mut list = self.sessions.lock().unwrap();
        for s in changed {
            if crate::credentials::reserved_id(&s.id) {
                continue;
            }
            if let Some(idx) = list.iter().position(|x| x.id == s.id) {
                list[idx] = s;
            }
        }
        self.persist(&list)?;
        Ok(list.clone())
    }

    pub fn delete(&self, id: &str) -> Result<(), String> {
        let mut list = self.sessions.lock().unwrap();
        list.retain(|s| s.id != id);
        self.persist(&list)
    }

    /// Escritura atómica (temporal único, fsync y rename) para no corromper el JSON.
    fn persist(&self, list: &[Session]) -> Result<(), String> {
        if let Some(e) = &self.load_error {
            return Err(e.clone());
        }
        let json = serde_json::to_string_pretty(list).map_err(|e| e.to_string())?;
        crate::seal::write_atomic(&self.file_path, json.as_bytes())
    }
}



/// Destino de la copia de un archivo ilegible: `<nombre>.corrupt-<unix>.json`.
fn corrupt_dest(path: &Path) -> PathBuf {
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("datos");
    path.with_file_name(format!("{stem}.corrupt-{ts}.json"))
}

/// Copia un archivo de datos que no se pudo leer completo a `<nombre>.corrupt-<unix>.json`.
/// Se conservan las últimas `KEEP_CORRUPT` copias por archivo y no se copia lo que pasa del
/// tope de tamaño (ese se aparta con `set_aside`).
pub fn backup_corrupt(path: &Path) {
    if fs::metadata(path).is_ok_and(|m| m.len() > crate::datafiles::MAX_TOPOLOGY_BYTES as u64) {
        return set_aside(path);
    }
    let dest = corrupt_dest(path);
    // settings.json: la copia va sin el token del API local (ni otros secretos de los ajustes).
    let copied = if crate::datafiles::is_settings(path) {
        fs::read(path).is_ok_and(|b| crate::seal::write_atomic(&dest, &crate::datafiles::backup_bytes(path, b)).is_ok())
    } else {
        fs::copy(path, &dest).is_ok()
    };
    if copied {
        restrict(&dest);
    }
    prune_corrupt(path);
}

/// Aparta (renombra, sin copiar) un archivo demasiado grande para leerlo: el original no se pierde
/// y la app arranca con valores por defecto. settings.json apartado se redacta en el mismo paso
/// (sin secretos de los ajustes en la copia).
pub fn set_aside(path: &Path) {
    let dest = corrupt_dest(path);
    if fs::rename(path, &dest).is_ok() {
        if crate::datafiles::is_settings(path) {
            if let Some(clean) = fs::read(&dest).ok().and_then(|b| crate::datafiles::redact_settings_bytes(&b)) {
                let _ = crate::seal::write_atomic(&dest, &clean);
            }
            restrict(&dest);
        }
        prune_corrupt(path);
    }
}

/// Borra las copias `<nombre>.corrupt-<unix>.json` más antiguas por encima de `KEEP_CORRUPT`.
fn prune_corrupt(path: &Path) {
    let Some(dir) = path.parent() else { return };
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("datos");
    let prefix = format!("{stem}.corrupt-");
    let Ok(entries) = fs::read_dir(dir) else { return };
    let mut copies: Vec<(u64, PathBuf)> = entries
        .flatten()
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            let ts = name.strip_prefix(&prefix)?.strip_suffix(".json")?.parse::<u64>().ok()?;
            Some((ts, e.path()))
        })
        .collect();
    copies.sort_by_key(|c| std::cmp::Reverse(c.0));
    for (_, old) in copies.into_iter().skip(crate::datafiles::KEEP_CORRUPT) {
        let _ = fs::remove_file(old);
    }
}

#[cfg(test)]
mod tests {
    use super::portable_root;
    use std::path::{Path, PathBuf};

    #[test]
    fn keeps_valid_sessions_and_backs_up_corrupt_file() {
        let dir = std::env::temp_dir().join(format!("nt-store-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("sessions.json");
        std::fs::write(
            &file,
            r#"[{"id":"a","name":"core","type":"ssh","host":"192.0.2.1","created_at":""},
                {"id":"b","name":"malo","type":"ssh","port":99999,"created_at":""}]"#,
        )
        .unwrap();
        let store = super::SessionStore::new(&dir);
        let names: Vec<String> = store.list().into_iter().map(|s| s.name).collect();
        assert_eq!(names, vec!["core"]);
        let backups = std::fs::read_dir(&dir)
            .unwrap()
            .flatten()
            .filter(|e| e.file_name().to_string_lossy().starts_with("sessions.corrupt-"))
            .count();
        assert_eq!(backups, 1);
        // JSON ilegible: también queda respaldo y no se pierde el archivo original.
        std::fs::write(&file, "{no es json").unwrap();
        let _ = super::SessionStore::new(&dir);
        let backups = std::fs::read_dir(&dir)
            .unwrap()
            .flatten()
            .filter(|e| e.file_name().to_string_lossy().starts_with("sessions.corrupt-"))
            .count();
        assert!(backups >= 1);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    fn temp_dir() -> PathBuf {
        std::env::temp_dir().join(format!("nt-store-{}", uuid::Uuid::new_v4()))
    }

    fn corrupt_backups(dir: &Path) -> usize {
        std::fs::read_dir(dir)
            .unwrap()
            .flatten()
            .filter(|e| e.file_name().to_string_lossy().starts_with("sessions.corrupt-"))
            .count()
    }

    /// Primer arranque: crea la carpeta de datos (también anidada) y la sesión local.
    #[test]
    fn missing_data_dir_and_file_start_with_defaults() {
        let root = temp_dir();
        let dir = root.join("a").join("data");
        let store = super::SessionStore::new(&dir);
        assert_eq!(store.list().len(), 1);
        assert!(dir.join("sessions.json").is_file());
        assert_eq!(corrupt_backups(&dir), 0);
        // El segundo arranque lee la misma sesión local (mismo id).
        let id = store.list()[0].id.clone();
        assert_eq!(super::SessionStore::new(&dir).list()[0].id, id);
        std::fs::remove_dir_all(&root).unwrap();
    }

    /// Guardados simultáneos: cada uno usa su propio temporal, el archivo final es JSON
    /// íntegro con todas las sesiones y no quedan temporales.
    #[test]
    fn concurrent_saves_keep_file_intact() {
        let dir = temp_dir();
        let store = std::sync::Arc::new(super::SessionStore::new(&dir));
        let handles: Vec<_> = (0..8)
            .map(|i| {
                let st = store.clone();
                std::thread::spawn(move || {
                    for j in 0..10 {
                        let s: crate::models::Session = serde_json::from_str(&format!(
                            r#"{{"id":"","name":"s{i}-{j}","type":"ssh","host":"192.0.2.1","created_at":""}}"#
                        ))
                        .unwrap();
                        st.save(s).unwrap();
                    }
                })
            })
            .collect();
        for h in handles {
            h.join().unwrap();
        }
        let reloaded = super::SessionStore::new(&dir);
        assert_eq!(reloaded.list().len(), store.list().len());
        assert!(reloaded.list().len() >= 80);
        let tmps = std::fs::read_dir(&dir).unwrap().flatten().filter(|e| e.file_name().to_string_lossy().ends_with(".tmp")).count();
        assert_eq!(tmps, 0);
        assert_eq!(corrupt_backups(&dir), 0);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    /// Un archivo sano no se reescribe al abrir: conserva campos de una versión más nueva.
    #[test]
    fn healthy_file_is_not_rewritten_on_startup() {
        let dir = temp_dir();
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("sessions.json");
        let content = r#"[{"id":"a","name":"core","type":"ssh","host":"192.0.2.1","created_at":"","campo_futuro":1}]"#;
        std::fs::write(&file, content).unwrap();
        let store = super::SessionStore::new(&dir);
        assert_eq!(store.list()[0].name, "core");
        assert_eq!(std::fs::read_to_string(&file).unwrap(), content);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    /// Bytes que no son UTF-8 (editado con otra codificación): se recuperan las sesiones y se
    /// respalda el original, en vez de reemplazarlo por la sesión de ejemplo.
    #[test]
    fn non_utf8_file_keeps_sessions_and_backs_up() {
        let dir = temp_dir();
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("sessions.json");
        let mut bytes = br#"[{"id":"a","name":"Sucursal "#.to_vec();
        bytes.push(0xd1); // "Ñ" en Latin-1
        bytes.extend_from_slice(br#"u","type":"ssh","host":"192.0.2.1","created_at":""}]"#);
        std::fs::write(&file, &bytes).unwrap();
        let store = super::SessionStore::new(&dir);
        let list = store.list();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, "a");
        assert!(list[0].name.starts_with("Sucursal "));
        assert_eq!(corrupt_backups(&dir), 1);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    /// sessions.json sin permiso de lectura: no se sobrescribe ni al abrir ni al guardar.
    #[cfg(unix)]
    #[test]
    fn unreadable_file_is_never_overwritten() {
        use std::os::unix::fs::PermissionsExt;
        let dir = temp_dir();
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("sessions.json");
        let content = r#"[{"id":"a","name":"core","type":"ssh","host":"192.0.2.1","created_at":""}]"#;
        std::fs::write(&file, content).unwrap();
        std::fs::set_permissions(&file, std::fs::Permissions::from_mode(0o000)).unwrap();
        if std::fs::read(&file).is_ok() {
            // Corriendo como root los permisos no aplican: no hay nada que probar.
            std::fs::remove_dir_all(&dir).unwrap();
            return;
        }
        let store = super::SessionStore::new(&dir);
        assert_eq!(store.list().len(), 1, "arranca con la sesión local en memoria");
        let mut s = store.list()[0].clone();
        s.id = String::new();
        assert!(store.save(s).unwrap_err().contains("No se pudo leer"));
        std::fs::set_permissions(&file, std::fs::Permissions::from_mode(0o600)).unwrap();
        assert_eq!(std::fs::read_to_string(&file).unwrap(), content);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    /// Carpeta portable de solo lectura (pendrive bloqueado): la app abre igual, sin pánico,
    /// y guardar devuelve un error que la interfaz muestra.
    #[cfg(unix)]
    #[test]
    fn read_only_data_dir_does_not_panic() {
        use std::os::unix::fs::PermissionsExt;
        let dir = temp_dir();
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o500)).unwrap();
        if std::fs::write(dir.join("prueba"), b"x").is_ok() {
            std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700)).unwrap();
            std::fs::remove_dir_all(&dir).unwrap();
            return;
        }
        let store = super::SessionStore::new(&dir);
        assert_eq!(store.list().len(), 1);
        // `new` deja la carpeta en 0700 (restrict) cuando puede; en un volumen de solo lectura
        // no puede, así que se vuelve a quitar la escritura para simularlo.
        std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o500)).unwrap();
        let mut s = store.list()[0].clone();
        s.id = String::new();
        assert!(store.save(s).is_err());
        std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700)).unwrap();
        std::fs::remove_dir_all(&dir).unwrap();
    }

    /// sessions.json ilegible con respaldo: se restauran las sesiones del último estado válido y
    /// se avisa una sola vez; sin respaldo se parte de la sesión local, como antes.
    #[test]
    fn unreadable_file_is_restored_from_backup() {
        const SESSIONS: &str = include_str!("../../scripts/tests/fixtures/datafiles/v0.9.11/sessions.json");
        let dir = temp_dir();
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("sessions.json");
        std::fs::write(&file, SESSIONS).unwrap();
        let r = crate::datafiles::rotate_backup(&file, &crate::datafiles::valid_sessions, std::time::SystemTime::now(), std::time::Duration::from_secs(1));
        assert_eq!(r, crate::datafiles::Rotation::Rotated);
        // Lo que se escribió es JSON de otra cosa (una edición a mano, un disco con fallas).
        std::fs::write(&file, "{ esto no es una lista").unwrap();
        let store = super::SessionStore::new(&dir);
        let names: Vec<String> = store.list().into_iter().map(|s| s.name).collect();
        assert_eq!(names, vec!["Terminal local", "core-sw"]);
        let n = store.take_notice().expect("aviso de restauración");
        assert_eq!(n.restored_from.as_deref(), Some("sessions.json.bak"));
        assert!(store.take_notice().is_none(), "una sola vez");
        assert_eq!(corrupt_backups(&dir), 1);
        // El archivo quedó reescrito con las sesiones restauradas.
        assert_eq!(super::SessionStore::new(&dir).list().len(), 2);

        // Sin respaldo válido: sesión de ejemplo, y el aviso dice que estaba dañado.
        let d2 = temp_dir();
        std::fs::create_dir_all(&d2).unwrap();
        std::fs::write(d2.join("sessions.json"), "{ roto").unwrap();
        std::fs::write(d2.join("sessions.json.bak"), "también roto").unwrap();
        let s2 = super::SessionStore::new(&d2);
        assert_eq!(s2.list().len(), 1);
        let n2 = s2.take_notice().unwrap();
        assert!(n2.corrupt && n2.restored_from.is_none());
        // Entradas inválidas sueltas: se descartan solo esas y se informan.
        let d3 = temp_dir();
        std::fs::create_dir_all(&d3).unwrap();
        std::fs::write(d3.join("sessions.json"), r#"[{"id":"a","name":"ok","type":"ssh"},{"name":"x","type":"nada"}]"#).unwrap();
        let s3 = super::SessionStore::new(&d3);
        assert_eq!(s3.list().len(), 1);
        assert_eq!(s3.take_notice().unwrap().dropped, vec!["sesión 2"]);
        // Un archivo sano no genera aviso.
        assert!(super::SessionStore::new(&d3).take_notice().is_none());
        for d in [dir, d2, d3] {
            std::fs::remove_dir_all(&d).unwrap();
        }
    }

    #[test]
    fn portable_root_per_platform() {
        let usb = PathBuf::from("/Volumes/USB/NetTerminal");
        assert_eq!(
            portable_root(&usb.join("NetTerminal.app/Contents/MacOS/net-terminal"), None),
            Some(usb.clone())
        );
        assert_eq!(
            portable_root(Path::new("/tmp/.mount_Net123/usr/bin/net-terminal"), Some(usb.join("NetTerminal.AppImage"))),
            Some(usb.clone())
        );
        assert_eq!(portable_root(&usb.join("NetTerminal.exe"), None), Some(usb));
    }
}
