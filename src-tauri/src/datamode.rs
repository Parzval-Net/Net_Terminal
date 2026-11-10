//! Comandos del modo portable cifrado: estado, desbloqueo, activación, desactivación, retomar una
//! conversión y cifrar archivos en claro encontrados. El formato y la conversión viven en
//! `datacrypt.rs`; la llave se desbloquea y se bloquea junto con la bóveda (`credentials.rs`).

use crate::datacrypt::{self, Op, Shared};
use crate::AppState;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager, State};
use zeroize::Zeroizing;

/// Estado del modo en la app.
#[derive(Default)]
pub struct DataMode {
    shared: Mutex<Option<Arc<Shared>>>,
    /// La llave de datos no se pudo leer (dañada o de una versión más nueva).
    error: Mutex<Option<String>>,
    /// Tareas del primer desbloqueo (respaldo diario, bloqueo automático) ya lanzadas.
    started: AtomicBool,
    /// Detener las grabaciones de log al bloquear (ajuste `dataLockStopLogs`).
    stop_logs: AtomicBool,
}

fn lk<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

impl DataMode {
    /// Al arrancar: limpia un diario de conversión sin llave y, si la carpeta está cifrada, la
    /// registra bloqueada (nada se lee ni se escribe hasta desbloquear).
    pub fn detect(data_dir: &Path) -> DataMode {
        let _ = datacrypt::startup_journal(data_dir);
        let mode = DataMode::default();
        if data_dir.join(datacrypt::KEY_FILE).exists() {
            let sh = Shared::new();
            datacrypt::register(data_dir, &sh);
            datacrypt::register(&data_dir.join("logs"), &sh);
            if let Some(j) = datacrypt::read_journal(data_dir).and_then(|j| j.logs) {
                datacrypt::register(&j, &sh);
            }
            *lk(&mode.error) = datacrypt::KeyFile::read(data_dir).err();
            // Conversión pendiente: nada se lee ni se escribe hasta retomarla o revertirla.
            sh.set_busy(datacrypt::read_journal(data_dir).is_some());
            *lk(&mode.shared) = Some(sh);
        }
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

/// Carpetas que cubre el modo: la de datos y la de logs en uso (la del diario si se retoma).
fn layout(state: &AppState) -> datacrypt::Layout {
    let custom = state.logs_root.lock().unwrap_or_else(|e| e.into_inner()).clone();
    let custom = custom.or_else(|| datacrypt::read_journal(&state.data_dir).and_then(|j| j.logs));
    datacrypt::Layout::new(&state.data_dir, custom.as_deref())
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
    }
}

#[tauri::command(async)]
pub fn datacrypt_status(state: State<'_, AppState>) -> Status {
    status_of(&state)
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

/// Al bloquear (a mano, por inactividad o al suspender): se bloquea la nota protegida abierta y, si
/// se pidió, se detienen las grabaciones de log. Sin pedirlo, cada log en curso sigue con la llave de
/// su propio archivo (nunca la DEK): las sesiones no se cortan y su evidencia no se pierde.
pub fn on_locked(app: &tauri::AppHandle) {
    let st = app.state::<AppState>();
    if !st.crypt.active() {
        return;
    }
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

/// Actividad en la app (teclado o ratón, informada como mucho cada 20 s por la interfaz): con la
/// carpeta cifrada cuenta para el bloqueo por inactividad.
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
    no_logs(&state)?;
    state.creds.verify_master(&master)?;
    enable_with(&app, &state, &master)
}

pub(crate) fn enable_with(app: &tauri::AppHandle, state: &AppState, master: &str) -> Result<datacrypt::Report, String> {
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
        }
        Some(dk) => {
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
/// desbloqueada.
#[tauri::command(async)]
pub fn datacrypt_resume(op: Op, app: tauri::AppHandle, state: State<'_, AppState>) -> Result<datacrypt::Report, String> {
    no_logs(&state)?;
    convert(&app, &state, op)
}

fn convert(app: &tauri::AppHandle, state: &AppState, op: Op) -> Result<datacrypt::Report, String> {
    let sh = state.crypt.shared().ok_or("La carpeta no está cifrada")?;
    let dk = sh.key_for_conversion().ok_or(datacrypt::LOCKED)?;
    let layout = layout(state);
    sh.set_busy(true);
    let r = datacrypt::resume(&layout, op, &dk, &datacrypt::no_hook, &mut progress(app));
    drop(dk);
    let pending = datacrypt::read_journal(&state.data_dir).is_some();
    match (&r, op) {
        (Ok(_), Op::Decrypt) => {
            // Carpeta en claro otra vez.
            sh.set_key(None);
            datacrypt::unregister(&sh);
            state.creds.detach_data();
            *lk(&state.crypt.shared) = None;
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

/// Desactiva el cifrado: verifica la contraseña, comprueba que todos los archivos se pueden
/// descifrar y recién entonces los vuelve a dejar en claro.
#[tauri::command(async)]
pub fn datacrypt_disable(master: String, app: tauri::AppHandle, state: State<'_, AppState>) -> Result<datacrypt::Report, String> {
    let master = Zeroizing::new(master);
    no_logs(&state)?;
    state.creds.verify_data(&master)?;
    convert(&app, &state, Op::Decrypt)
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

/// La carpeta de logs elegida por el usuario también queda cifrada mientras el modo está activo.
pub fn on_logs_dir(state: &AppState, dir: Option<&PathBuf>) {
    if let (Some(sh), Some(d)) = (state.crypt.shared(), dir) {
        datacrypt::register(d, &sh);
    }
}
