//! Comandos del modo portable cifrado: estado, desbloqueo, activación, desactivación, retomar una
//! conversión y cifrar archivos en claro encontrados. El formato y la conversión viven en
//! `datacrypt.rs`; la llave se desbloquea y se bloquea junto con la bóveda (`credentials.rs`).

use crate::datacrypt::{self, ConvError, Op, Shared};
use crate::AppState;
use serde::Serialize;
use std::fs::File;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager, State};
use zeroize::Zeroizing;

/// Estado del modo en la app.
#[derive(Default)]
pub struct DataMode {
    shared: Mutex<Option<Arc<Shared>>>,
    /// La carpeta no se puede abrir: llave dañada, de una versión más nueva o ausente con datos
    /// cifrados presentes, u otra instancia de la app ya la tiene abierta.
    error: Mutex<Option<String>>,
    /// Tareas del primer desbloqueo (respaldo diario, bloqueo automático) ya lanzadas.
    started: AtomicBool,
    /// Detener las grabaciones de log al bloquear (ajuste `dataLockStopLogs`).
    stop_logs: AtomicBool,
    /// Bloqueo de instancia única mientras la carpeta está cifrada (se suelta al salir o al desactivar).
    lock_file: Mutex<Option<File>>,
}

fn lk<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

pub const ANOTHER_INSTANCE: &str =
    "La carpeta de datos cifrada ya está abierta en otra ventana de NetTerminal. Ciérrala antes de abrir esta: dos ventanas sobre la misma carpeta cifrada se pisarían los archivos.";

pub const MISSING_KEY: &str = "Falta la llave de datos (datakey.ntk): la carpeta tiene datos cifrados pero no su llave, y sin ella no se pueden abrir. No se leyó ni escribió nada. Si moviste o borraste datakey.ntk, devuélvelo a la carpeta de datos y vuelve a abrir la app.";

/// Toma el bloqueo de instancia única de la carpeta (`datakey.lock`, bloqueo del sistema sobre el
/// archivo: se suelta solo si la app se cierra o se cae). Err si otra instancia lo tiene.
fn take_lock(data_dir: &Path) -> Result<File, String> {
    let f = File::options().create(true).truncate(false).write(true).open(data_dir.join(datacrypt::LOCK_FILE)).map_err(|e| e.to_string())?;
    match f.try_lock() {
        Ok(()) => Ok(f),
        Err(std::fs::TryLockError::WouldBlock) => Err(ANOTHER_INSTANCE.into()),
        Err(std::fs::TryLockError::Error(e)) => Err(e.to_string()),
    }
}

impl DataMode {
    /// Al arrancar: limpia un diario de conversión sin llave y, si la carpeta está cifrada (o tiene
    /// datos cifrados sin su llave), la registra bloqueada: nada se lee ni se escribe hasta desbloquear.
    pub fn detect(data_dir: &Path) -> DataMode {
        let _ = datacrypt::startup_journal(data_dir);
        let mode = DataMode::default();
        let has_key = data_dir.join(datacrypt::KEY_FILE).exists();
        if !has_key && !datacrypt::orphan_markers(data_dir) {
            return mode;
        }
        let sh = Shared::new();
        datacrypt::register(data_dir, &sh);
        datacrypt::register(&data_dir.join("logs"), &sh);
        for r in datacrypt::read_roots(data_dir) {
            datacrypt::register(&r, &sh);
        }
        if let Some(j) = datacrypt::read_journal(data_dir).and_then(|j| j.logs) {
            datacrypt::register(&j, &sh);
        }
        let error = if !has_key {
            Some(MISSING_KEY.to_string())
        } else {
            match take_lock(data_dir) {
                Ok(f) => {
                    *lk(&mode.lock_file) = Some(f);
                    datacrypt::KeyFile::read(data_dir).err()
                }
                Err(e) => Some(e),
            }
        };
        *lk(&mode.error) = error;
        // Conversión pendiente: nada se lee ni se escribe hasta retomarla o revertirla.
        sh.set_busy(datacrypt::read_journal(data_dir).is_some());
        *lk(&mode.shared) = Some(sh);
        mode
    }

    pub fn shared(&self) -> Option<Arc<Shared>> {
        lk(&self.shared).clone()
    }

    pub fn active(&self) -> bool {
        lk(&self.shared).is_some()
    }

    /// Tareas que en una carpeta en claro corren al arrancar ya corrieron.
    pub fn mark_started(&self) {
        self.started.store(true, Ordering::SeqCst);
    }
}

/// Carpetas que cubre el modo: la de datos, la de logs en uso y todas las de logs usadas con el
/// modo activo (`datakey.roots`, y la del diario si se retoma una conversión).
fn layout(state: &AppState) -> datacrypt::Layout {
    let mut extra = datacrypt::read_roots(&state.data_dir);
    extra.extend(state.logs_root.lock().unwrap_or_else(|e| e.into_inner()).clone());
    extra.extend(datacrypt::read_journal(&state.data_dir).and_then(|j| j.logs));
    datacrypt::Layout::new(&state.data_dir, &extra)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    /// Edición portable: el modo solo se ofrece ahí.
    pub available: bool,
    pub encrypted: bool,
    pub unlocked: bool,
    pub busy: bool,
    /// Conversión interrumpida pendiente ("encrypt" o "decrypt").
    pub journal: Option<Op>,
    /// Archivos en claro dentro de la carpeta cifrada (no se leen).
    pub plaintext: Vec<String>,
    pub error: Option<String>,
    pub vault_exists: bool,
    pub vault_master: bool,
    /// Pestañas grabando log (cifrar o descifrar exige detenerlas).
    pub logs_active: usize,
    pub data_dir: String,
    /// Archivos cifrados dañados que se apartaron (`.dañado-<fecha>`) en esta ejecución.
    pub damaged: Vec<String>,
}

pub fn status_of(state: &AppState) -> Status {
    let sh = state.crypt.shared();
    let encrypted = sh.is_some();
    let unlocked = sh.as_ref().is_some_and(|s| s.unlocked());
    let busy = sh.as_ref().is_some_and(|s| s.busy());
    let journal = encrypted.then(|| datacrypt::read_journal(&state.data_dir).map(|j| j.op)).flatten();
    let plaintext = if encrypted && unlocked && !busy && journal.is_none() {
        let mut v = datacrypt::plaintext_found(&layout(state));
        v.truncate(200);
        v
    } else {
        Vec::new()
    };
    let vs = state.creds.status();
    Status {
        available: crate::session_store::is_portable(),
        encrypted,
        unlocked,
        busy,
        journal,
        plaintext,
        error: lk(&state.crypt.error).clone(),
        vault_exists: vs.exists,
        vault_master: vs.backend == "vault",
        logs_active: state.conns.logging_count(),
        data_dir: state.data_dir.to_string_lossy().into_owned(),
        damaged: datacrypt::damaged_list(),
    }
}

#[tauri::command(async)]
pub fn datacrypt_status(state: State<'_, AppState>) -> Status {
    status_of(&state)
}

/// El usuario vio el aviso de archivos dañados apartados.
#[tauri::command]
pub fn datacrypt_ack_damaged() {
    datacrypt::damaged_clear();
}

/// Aviso a la interfaz cuando se aparta un archivo cifrado dañado (evento `datacrypt-damaged`).
pub fn install_notifier(app: &tauri::AppHandle) {
    let app = app.clone();
    datacrypt::set_notifier(Box::new(move |path| {
        let _ = app.emit("datacrypt-damaged", path.to_string());
    }));
}

/// Después de desbloquear (o de terminar una conversión): lee las sesiones y, la primera vez, lanza
/// lo que en una carpeta en claro corre al arrancar (respaldo diario, bloqueo automático guardado).
pub fn after_unlock(app: &tauri::AppHandle) {
    let st = app.state::<AppState>();
    if datacrypt::unavailable(&st.data_dir).is_some() || datacrypt::read_journal(&st.data_dir).is_some() {
        return;
    }
    st.store.load();
    if !st.crypt.started.swap(true, Ordering::SeqCst) {
        crate::datafiles::spawn_rotation(st.data_dir.clone());
        let peek = st.files.peek_settings();
        let (minutes, on_sleep) = crate::credentials::autolock_from_settings(peek.as_ref());
        let _ = st.creds.set_autolock(minutes, on_sleep);
        let stop = peek.as_ref().and_then(|m| m.get("dataLockStopLogs")).and_then(serde_json::Value::as_bool).unwrap_or(false);
        st.crypt.stop_logs.store(stop, Ordering::SeqCst);
    }
    crate::arm_autolock(app);
}

/// Al bloquear (a mano, por inactividad o al suspender): se escribe lo pendiente de los logs, se
/// bloquea la nota protegida abierta y, si se pidió, se detienen las grabaciones de log. Sin pedirlo,
/// cada log en curso sigue con la llave de su propio archivo (nunca la DEK): las sesiones no se
/// cortan y su evidencia no se pierde.
pub fn on_locked(app: &tauri::AppHandle) {
    let st = app.state::<AppState>();
    if !st.crypt.active() {
        return;
    }
    datacrypt::flush_all(None);
    st.secure_notes.lock();
    if st.crypt.stop_logs.load(Ordering::SeqCst) {
        let ids = st.conns.stop_all_logging();
        if !ids.is_empty() {
            let _ = app.emit("logs-stopped", ids);
        }
    }
    let _ = app.emit("data-locked", ());
}

/// Desbloquea la carpeta cifrada (y la bóveda) con la contraseña maestra.
#[tauri::command(async)]
pub fn data_unlock(master: String, app: tauri::AppHandle, state: State<'_, AppState>) -> Result<crate::credentials::UnlockReport, String> {
    let master = Zeroizing::new(master);
    if let Some(e) = lk(&state.crypt.error).clone() {
        return Err(e);
    }
    let r = state.creds.data_unlock(&master)?;
    after_unlock(&app);
    let _ = app.emit("creds-changed", ());
    Ok(r)
}

/// Bloquea los datos y la bóveda.
#[tauri::command]
pub fn data_lock(app: tauri::AppHandle, state: State<'_, AppState>) {
    state.creds.lock();
    state.bundle.clear();
    on_locked(&app);
    let _ = app.emit("creds-changed", ());
}

/// Actividad del usuario en la app (teclado o ratón, informada como mucho cada 20 s por la
/// interfaz): con la carpeta cifrada es lo único que renueva el plazo del bloqueo por inactividad.
#[tauri::command]
pub fn data_touch(state: State<'_, AppState>) {
    if let Some(sh) = state.crypt.shared().filter(|s| s.unlocked()) {
        sh.touch();
    }
}

/// Ajuste "Detener las grabaciones de log al bloquear".
#[tauri::command]
pub fn datacrypt_set_policy(stop_logs: bool, state: State<'_, AppState>) {
    state.crypt.stop_logs.store(stop_logs, Ordering::SeqCst);
}

fn progress(app: &tauri::AppHandle) -> impl FnMut(&datacrypt::Progress) + '_ {
    move |p| {
        let _ = app.emit("datacrypt-progress", p);
    }
}

fn no_logs(state: &AppState) -> Result<(), String> {
    match state.conns.logging_count() {
        0 => Ok(()),
        n => Err(format!("Hay {n} pestaña(s) grabando log: detén la grabación antes de convertir la carpeta")),
    }
}

fn register_all(layout: &datacrypt::Layout, sh: &Arc<Shared>) {
    datacrypt::register(&layout.data, sh);
    for l in &layout.logs {
        datacrypt::register(l, sh);
    }
}

/// Activa el cifrado de la carpeta portable. Exige la contraseña maestra de la bóveda (creada antes).
#[tauri::command(async)]
pub fn datacrypt_enable(master: String, app: tauri::AppHandle, state: State<'_, AppState>) -> Result<datacrypt::Report, String> {
    let master = Zeroizing::new(master);
    if !crate::session_store::is_portable() {
        return Err("El modo cifrado solo está disponible en la edición portable".into());
    }
    if state.crypt.active() {
        return Err("La carpeta ya está cifrada".into());
    }
    let vs = state.creds.status();
    if !vs.exists || vs.backend != "vault" {
        return Err("Primero crea la bóveda con una contraseña maestra (Ajustes › Credenciales)".into());
    }
    let custom = state.logs_root.lock().unwrap_or_else(|e| e.into_inner()).clone();
    if custom.as_ref().is_some_and(|c| datacrypt::logs_dir_conflicts(&state.data_dir, c)) {
        return Err("La carpeta de logs elegida es la carpeta de datos o está dentro de ella: elige otra en Ajustes › Logs (o la predeterminada) antes de cifrar".into());
    }
    no_logs(&state)?;
    state.creds.verify_master(&master)?;
    enable_with(&app, &state, &master)
}

pub(crate) fn enable_with(app: &tauri::AppHandle, state: &AppState, master: &str) -> Result<datacrypt::Report, String> {
    let lock = take_lock(&state.data_dir)?;
    let layout = layout(state);
    let sh = Shared::new();
    sh.set_busy(true);
    register_all(&layout, &sh);
    *lk(&state.crypt.shared) = Some(sh.clone());
    let mut key = None;
    let r = datacrypt::enable(&layout, master, state.creds.kdf(), &datacrypt::no_hook, &mut progress(app), &mut key);
    match key {
        None => {
            // No alcanzó a escribir la llave: nada quedó cifrado, la carpeta sigue en claro.
            datacrypt::unregister(&sh);
            *lk(&state.crypt.shared) = None;
            let _ = datacrypt::startup_journal(&state.data_dir);
            drop(lock);
            let _ = std::fs::remove_file(state.data_dir.join(datacrypt::LOCK_FILE));
        }
        Some(dk) => {
            *lk(&state.crypt.lock_file) = Some(lock);
            sh.set_key(Some(dk));
            state.creds.attach_data(sh.clone());
            state.crypt.mark_started();
            // Si la conversión quedó a medias, sigue "ocupada" hasta retomarla o revertirla.
            sh.set_busy(r.is_err());
        }
    }
    let _ = app.emit("creds-changed", ());
    r
}

/// Retoma (`encrypt`) o revierte (`decrypt`) una conversión interrumpida. Requiere la carpeta
/// desbloqueada. Revertir pide la misma confirmación de pérdida que desactivar (`accept_loss`).
#[tauri::command(async)]
pub fn datacrypt_resume(op: Op, accept_loss: Option<Vec<String>>, app: tauri::AppHandle, state: State<'_, AppState>) -> Result<datacrypt::Report, ConvError> {
    no_logs(&state)?;
    convert(&app, &state, op, &accept_loss.unwrap_or_default())
}

fn convert(app: &tauri::AppHandle, state: &AppState, op: Op, accept: &[String]) -> Result<datacrypt::Report, ConvError> {
    let sh = state.crypt.shared().ok_or("La carpeta no está cifrada".to_string())?;
    let dk = sh.key_for_conversion().ok_or(datacrypt::LOCKED.to_string())?;
    let layout = layout(state);
    sh.set_busy(true);
    let r = match op {
        Op::Encrypt => datacrypt::resume(&layout, op, &dk, &datacrypt::no_hook, &mut progress(app)).map_err(ConvError::from),
        Op::Decrypt => datacrypt::disable(&layout, &dk, accept, &datacrypt::no_hook, &mut progress(app)),
    };
    drop(dk);
    let pending = datacrypt::read_journal(&state.data_dir).is_some();
    match (&r, op) {
        (Ok(_), Op::Decrypt) => {
            // Carpeta en claro otra vez: sin llave, sin registro y sin bloqueo de instancia.
            sh.set_key(None);
            datacrypt::unregister(&sh);
            state.creds.detach_data();
            *lk(&state.crypt.shared) = None;
            *lk(&state.crypt.lock_file) = None;
            let _ = std::fs::remove_file(state.data_dir.join(datacrypt::LOCK_FILE));
            state.crypt.mark_started();
            state.store.load();
        }
        _ => {
            sh.set_busy(pending);
            after_unlock(app);
        }
    }
    let _ = app.emit("creds-changed", ());
    r
}

/// Desactiva el cifrado: verifica la contraseña y que nada quede sin su llave (si algo se perdería,
/// lo nombra y solo sigue con `accept_loss` igual a esa lista), comprueba que todos los archivos se
/// pueden descifrar y recién entonces los vuelve a dejar en claro.
#[tauri::command(async)]
pub fn datacrypt_disable(master: String, accept_loss: Option<Vec<String>>, app: tauri::AppHandle, state: State<'_, AppState>) -> Result<datacrypt::Report, ConvError> {
    let master = Zeroizing::new(master);
    no_logs(&state)?;
    state.creds.verify_data(&master)?;
    convert(&app, &state, Op::Decrypt, &accept_loss.unwrap_or_default())
}

/// Cifra los archivos en claro encontrados en la carpeta cifrada (los que chocan con uno cifrado se
/// guardan aparte con `.encontrado-<fecha>`).
#[tauri::command(async)]
pub fn datacrypt_fix_plaintext(state: State<'_, AppState>) -> Result<datacrypt::Report, String> {
    let sh = state.crypt.shared().ok_or("La carpeta no está cifrada")?;
    let dk = sh.key().map_err(|e| e.to_string())?;
    sh.set_busy(true);
    let r = datacrypt::fix_plaintext(&layout(&state), &dk);
    sh.set_busy(false);
    r
}

/// La carpeta de logs elegida por el usuario también queda cifrada mientras el modo está activo y se
/// anota en `datakey.roots` (al desactivar se convierte aunque ya no sea la actual). Con el modo
/// activo no se acepta la carpeta de datos ni una carpeta dentro de ella (salvo `data/logs`).
pub fn on_logs_dir(state: &AppState, dir: Option<&PathBuf>) -> Result<(), String> {
    let (Some(sh), Some(d)) = (state.crypt.shared(), dir) else { return Ok(()) };
    if datacrypt::logs_dir_conflicts(&state.data_dir, d) {
        return Err("Con la carpeta cifrada, la carpeta de logs no puede ser la carpeta de datos ni estar dentro de ella: elige otra o usa la predeterminada".into());
    }
    datacrypt::add_roots(&state.data_dir, std::slice::from_ref(d))?;
    datacrypt::register(d, &sh);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("nt-datamode-{tag}-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    fn encrypted_folder(tag: &str) -> PathBuf {
        let d = tmp(tag);
        std::fs::write(d.join("settings.json"), b"{}").unwrap();
        let mut key = None;
        datacrypt::enable(&datacrypt::Layout::new(&d, &[]), "maestra-de-prueba", crate::seal::Kdf { m: 64, t: 1, p: 1 }, &datacrypt::no_hook, &mut |_| {}, &mut key).unwrap();
        d
    }

    fn release(m: &DataMode) {
        if let Some(sh) = m.shared() {
            datacrypt::unregister(&sh);
        }
    }

    /// B3: datos cifrados sin datakey.ntk: la carpeta queda registrada y bloqueada con un error claro
    /// (nada se escribe en claro); una carpeta en claro no se registra.
    #[test]
    fn missing_key_blocks_instead_of_opening_in_plain() {
        let plain = tmp("plain");
        std::fs::write(plain.join("settings.json"), b"{}").unwrap();
        let m = DataMode::detect(&plain);
        assert!(!m.active() && lk(&m.error).is_none());
        let d = encrypted_folder("nokey");
        std::fs::remove_file(d.join(datacrypt::KEY_FILE)).unwrap();
        let m = DataMode::detect(&d);
        assert!(m.active());
        assert_eq!(lk(&m.error).as_deref(), Some(MISSING_KEY));
        assert!(datacrypt::write_atomic(&d.join("settings.json"), b"{}").is_err(), "no escribe en claro");
        assert!(!d.join("settings.json").exists());
        release(&m);
        for x in [plain, d] {
            let _ = std::fs::remove_dir_all(x);
        }
    }

    /// B5: una sola instancia por carpeta cifrada; al soltarla (cierre o caída) se puede volver a abrir.
    #[test]
    fn second_instance_is_refused() {
        let d = encrypted_folder("inst");
        let first = DataMode::detect(&d);
        assert!(lk(&first.error).is_none(), "{:?}", lk(&first.error));
        let second = DataMode::detect(&d);
        assert_eq!(lk(&second.error).as_deref(), Some(ANOTHER_INSTANCE));
        release(&second);
        release(&first);
        drop(first);
        let third = DataMode::detect(&d);
        assert!(lk(&third.error).is_none(), "el bloqueo se suelta al cerrar");
        release(&third);
        let _ = std::fs::remove_dir_all(d);
    }

    /// B4: los comandos que leen, guardan o exportan datos rechazan la carpeta bloqueada. Revisión
    /// de la fuente para que un comando nuevo no se olvide del chequeo.
    #[test]
    fn data_commands_check_the_lock() {
        let lib = include_str!("lib.rs");
        let body = |name: &str| {
            let start = lib.find(&format!("\nfn {name}(")).unwrap_or_else(|| panic!("{name}"));
            let rest = &lib[start..];
            rest[..rest.find("\n}\n").unwrap()].to_string()
        };
        for name in [
            "list_sessions", "save_session", "update_sessions", "add_sessions", "delete_session", "list_notes", "read_note", "save_note",
            "rename_note", "delete_note", "search_notes", "note_protect", "note_unlock", "note_save_secure", "note_unprotect",
            "note_change_password", "recent_targets", "recent_target_add", "recent_targets_clear", "cmd_history", "cmd_history_add",
            "cmd_history_clear", "mcp_audit_tail", "backup_save", "backup_list", "backup_secrets", "backup_read", "save_topology",
            "save_settings", "set_logging",
        ] {
            assert!(body(name).contains("data_ready(&state)?"), "{name} no revisa el bloqueo");
        }
        assert!(body("get_settings").contains("datacrypt::unavailable"));
        for (file, names) in [
            (include_str!("bundle.rs"), &["bundle_export", "bundle_inspect", "bundle_import_apply"][..]),
            (include_str!("logsearch.rs"), &["logsearch_start", "logsearch_open", "logsearch_view", "logsearch_export"][..]),
        ] {
            for n in names {
                let start = file.find(&format!("pub fn {n}(")).unwrap();
                let head = &file[start..(start + 900).min(file.len())];
                assert!(head.contains("datacrypt::unavailable(&state.data_dir)"), "{n} no revisa el bloqueo");
            }
        }
    }
}
