//! Los módulos de datos sobre una carpeta cifrada: lo mismo que en claro, sin nada en claro en disco.

use super::tests::{en, fixture, tmp};
use super::*;

/// Carpeta de ejemplo ya cifrada y registrada (desbloqueada). Al soltarse se desregistra y se borra.
struct Enc {
    d: PathBuf,
    sh: Arc<Shared>,
}

impl Enc {
    fn new(tag: &str) -> Enc {
        let d = tmp(tag);
        fixture(&d);
        let layout = Layout::new(&d, None);
        let (dk, _) = en(&layout, "maestra-de-prueba", &no_hook, &mut |_| {}).unwrap();
        let sh = Shared::new();
        register(&d, &sh);
        sh.set_key(Some(dk));
        Enc { d, sh }
    }

    fn dk(&self) -> Arc<DataKey> {
        self.sh.key().unwrap()
    }

    /// Ningún archivo cubierto quedó en claro (salvo el aviso para versiones anteriores).
    fn no_plaintext(&self) {
        assert!(plaintext_found(&Layout::new(&self.d, None)).is_empty(), "{:?}", plaintext_found(&Layout::new(&self.d, None)));
    }
}

impl Drop for Enc {
    fn drop(&mut self) {
        unregister(&self.sh);
        let _ = fs::remove_dir_all(&self.d);
    }
}

#[test]
fn sessions_settings_and_backups_of_data_files() {
    let e = Enc::new("int-data");
    let d = &e.d;
    // Sesiones: se leen las cifradas (no el aviso) y se guardan cifradas.
    let store = crate::session_store::SessionStore::new(d);
    assert_eq!(store.list().iter().map(|s| s.name.as_str()).collect::<Vec<_>>(), vec!["core"]);
    assert!(store.trusted());
    let s: crate::models::Session = serde_json::from_str(r#"{"id":"","name":"borde","type":"ssh","host":"192.0.2.7","created_at":""}"#).unwrap();
    store.save(s).unwrap();
    assert!(is_stub(&fs::read(d.join("sessions.json")).unwrap()), "el aviso no se toca");
    assert_eq!(crate::session_store::SessionStore::new(d).list().len(), 2);
    // Ajustes y topología.
    let files = crate::datafiles::DataFiles::new(d);
    let (v, n) = files.load(crate::datafiles::Kind::Settings);
    assert_eq!(v["fontSize"], 13);
    assert!(!n.corrupt);
    files.save(crate::datafiles::Kind::Settings, serde_json::json!({"fontSize": 15, "mcpToken": "secreto-de-prueba-123456"})).unwrap();
    assert_eq!(files.load(crate::datafiles::Kind::Settings).0["fontSize"], 15);
    // Respaldo diario: copia cifrada (sin el token).
    let r = crate::datafiles::rotate_backup(&d.join("settings.json"), &crate::datafiles::valid_object, SystemTime::now(), std::time::Duration::ZERO);
    assert_eq!(r, crate::datafiles::Rotation::Rotated);
    let bak = read(&d.join("settings.json.bak")).unwrap();
    assert!(!String::from_utf8_lossy(&bak).contains("secreto-de-prueba"));
    assert!(!d.join("settings.json.bak").exists() && d.join("settings.json.bak2.nte").exists(), "el .bak anterior pasó a .bak2 cifrado");
    // Un archivo cifrado alterado se trata como dañado: copia aparte y restauración desde el respaldo.
    let p = d.join("settings.json.nte");
    let mut b = fs::read(&p).unwrap();
    let k = b.len() - 25;
    b[k] ^= 1;
    fs::write(&p, &b).unwrap();
    let (v, n) = crate::datafiles::DataFiles::new(d).load(crate::datafiles::Kind::Settings);
    assert!(n.corrupt);
    assert_eq!(n.restored_from.as_deref(), Some("settings.json.bak"));
    assert_eq!(v["fontSize"], 15);
    assert!(read_dir(d).unwrap().iter().any(|x| x.name.starts_with("settings.corrupt-")), "copia de lo dañado (cifrada)");
    // Historial.
    crate::history::cmd_add(d, "core", "show version").unwrap();
    crate::history::recent_add(d, "192.0.2.50").unwrap();
    assert_eq!(crate::history::cmd_list(d, "core")[0].cmd, "show version");
    assert_eq!(crate::history::recent_list(d)[0], "192.0.2.50");
    e.no_plaintext();
}

#[test]
fn notes_backups_and_audit() {
    let e = Enc::new("int-notes");
    let notes = e.d.join("notes");
    assert!(crate::notes::list(&notes).iter().any(|n| n.name == "red" && !n.protected));
    crate::notes::save(&notes, "plan", "cambio en 192.0.2.1").unwrap();
    assert_eq!(crate::notes::read(&notes, "plan").unwrap(), "cambio en 192.0.2.1");
    assert!(crate::notes::search(&notes, "ñandú").iter().any(|m| m.name == "red"));
    assert_eq!(crate::notes::rename(&notes, "plan", "plan2").unwrap(), "plan2");
    crate::notes::delete(&notes, "plan2").unwrap();
    assert!(!crate::notes::list(&notes).iter().any(|n| n.name.starts_with("plan")));
    // Nota protegida dentro de la carpeta cifrada: su propio cifrado, como siempre.
    let sec = crate::notes::SecureNotes::with(super::tests::KDF);
    sec.protect(&notes, "red", "clave-de-la-nota", 300).unwrap();
    assert!(notes.join("red.ntenc").exists() && !notes.join("red.txt.nte").exists());
    assert_eq!(&*sec.unlock(&notes, "red", "clave-de-la-nota", 300).unwrap(), "interfaz Gi1/0/1 ñandú");
    // Respaldos de configuración con huellas de secretos.
    let name = crate::backups::save(&e.d, "edge-rt", "hostname edge\nenable secret 5 $1$abc\n", true).unwrap();
    let list = crate::backups::list(&e.d);
    assert!(list.iter().any(|x| x.device == "edge-rt" && x.files[0].name == name));
    assert!(crate::backups::read(&e.d, "edge-rt", &name).unwrap().contains("enable secret 5 ****"));
    assert!(!crate::backups::read_secrets(&e.d, "edge-rt", &name).unwrap().is_empty());
    // Auditoría MCP: un bloque por evento, se lee de vuelta.
    let ev = crate::mcp_audit::Event { client: "Agente", client_version: "1", tool: "run_command", connection: None, target: None, command: Some("show clock"), risk: Some("read"), decision: "aprobado" };
    crate::mcp_audit::append(&e.d, &ev).unwrap();
    crate::mcp_audit::append(&e.d, &ev).unwrap();
    let tail = crate::mcp_audit::tail(&e.d, 10);
    assert_eq!(tail.len(), 3, "la línea del ejemplo y las dos nuevas");
    assert_eq!(tail[2]["command"], "show clock");
    assert!(decrypt_all(&e.dk(), &fs::read(e.d.join("mcp-audit/audit.jsonl.nte")).unwrap()).is_ok(), "cerrado tras cada evento");
    e.no_plaintext();
}

#[test]
fn session_logs_are_encrypted_by_blocks_and_searchable() {
    use crate::logfile::{LogOptions, LogVars, LogWriter};
    let e = Enc::new("int-logs");
    let logs = e.d.join("logs");
    let vars = LogVars { session: "core".into(), host: "192.0.2.1".into(), folder: String::new() };
    let o = LogOptions { pattern: "{session}".into(), ..Default::default() };
    let mut w = LogWriter::create(&logs, o.clone(), vars.clone()).unwrap();
    let path = w.path().to_path_buf();
    assert!(path.to_string_lossy().ends_with("core.log.nte"));
    w.write(b"Router# show run\r\nusername admin secret 0 Clave123\r\nRouter#");
    // Mientras graba se busca (lo íntegro hasta ahora; sin bloque de cierre).
    let roots = crate::logsearch::Roots { logs: logs.clone(), backups: e.d.join("backups"), notes: e.d.join("notes") };
    let params = crate::logsearch::SearchParams { query: "username admin".into(), kinds: vec!["logs".into(), "backups".into(), "notes".into()], ..Default::default() };
    let (files, _) = crate::logsearch::search_now(&roots, &params, std::time::Duration::from_secs(10)).unwrap();
    assert_eq!(files.len(), 1);
    assert_eq!(files[0].rel, "core.log");
    assert!(files[0].hits[0].text.contains("secret 0 ****"), "el log se enmascara igual");
    drop(w);
    // Reconexión: sigue en el mismo archivo.
    let mut w = LogWriter::resume(&path, &logs, o.clone(), vars.clone()).unwrap();
    w.write(b"show clock\r\n");
    drop(w);
    let text = String::from_utf8(decrypt_all(&e.dk(), &fs::read(&path).unwrap()).unwrap()).unwrap();
    assert!(!text.contains("Clave123") && text.contains("Reconectado") && text.ends_with("show clock\n"), "{text}");
    // Dos pestañas que anexan al mismo log a la vez.
    let ap = LogOptions { append: true, pattern: "compartido".into(), ..Default::default() };
    let hs: Vec<_> = (0..4)
        .map(|i| {
            let (logs, ap, vars) = (logs.clone(), ap.clone(), vars.clone());
            std::thread::spawn(move || {
                let mut w = LogWriter::create(&logs, ap, vars).unwrap();
                for j in 0..100 {
                    w.write(format!("t{i} linea {j}\n").as_bytes());
                }
            })
        })
        .collect();
    for h in hs {
        h.join().unwrap();
    }
    let shared = String::from_utf8(decrypt_all(&e.dk(), &fs::read(logs.join("compartido.log.nte")).unwrap()).unwrap()).unwrap();
    assert_eq!(shared.lines().filter(|l| l.contains(" linea ")).count(), 400);
    // Un log en claro que apareció en la carpeta cifrada no se lee.
    fs::write(logs.join("intruso.log"), "username admin secreto").unwrap();
    let (files, _) = crate::logsearch::search_now(&roots, &params, std::time::Duration::from_secs(10)).unwrap();
    assert!(files.iter().all(|f| f.rel != "intruso.log"));
    fs::remove_file(logs.join("intruso.log")).unwrap();
    // Visor y exportación descifrada (fuera de la carpeta).
    let t = crate::logsearch::read_text(&roots, crate::logsearch::Kind::Logs, "core.log").unwrap();
    assert!(t.encrypted && !t.incomplete && t.text.contains("show run"));
    let out = tmp("export").join("core.log");
    crate::logsearch::export_plain(&roots, crate::logsearch::Kind::Logs, "core.log", &out).unwrap();
    assert_eq!(fs::read_to_string(&out).unwrap(), text);
    assert!(crate::bundle::check_export_dest(&e.d.join("x.txt"), &e.d).is_err());
    assert!(crate::bundle::check_export_dest(&logs.join("x.txt"), &e.d).is_err());
    assert!(crate::bundle::check_export_dest(&out, &e.d).is_ok());
    let _ = fs::remove_dir_all(out.parent().unwrap());
    // Abrir afuera no se puede (habría que escribirlo en claro).
    assert!(crate::logsearch::resolve_file(&roots, crate::logsearch::Kind::Logs, "core.log").unwrap().to_string_lossy().ends_with(".nte"));
    e.no_plaintext();
}

#[test]
fn locked_folder_reads_and_writes_nothing() {
    use crate::logfile::{LogOptions, LogVars, LogWriter};
    let e = Enc::new("int-locked");
    let d = e.d.clone();
    let before: Vec<(PathBuf, Vec<u8>)> = walk(&Layout::new(&d, None)).into_iter().map(|f| (f.phys.clone(), fs::read(&f.phys).unwrap())).collect();
    e.sh.set_key(None);
    // Sesiones: no se leen ni se guardan (una lista vacía nunca reemplaza la guardada).
    let store = crate::session_store::SessionStore::deferred(&d);
    store.load();
    assert!(store.list().is_empty());
    let s: crate::models::Session = serde_json::from_str(r#"{"id":"","name":"x","type":"ssh","host":"192.0.2.9","created_at":""}"#).unwrap();
    assert!(store.save(s).is_err());
    // Ajustes: ni lectura ni "restauración".
    let files = crate::datafiles::DataFiles::new(&d);
    let (v, n) = files.load(crate::datafiles::Kind::Settings);
    assert!(v.is_null() && !n.corrupt && n.restored_from.is_none());
    assert!(files.save(crate::datafiles::Kind::Settings, serde_json::json!({})).is_err());
    assert!(crate::history::cmd_add(&d, "core", "show ip route").is_err());
    assert!(crate::notes::save(&d.join("notes"), "x", "y").is_err());
    assert!(crate::backups::save(&d, "core-sw", "x", true).is_err());
    let o = LogOptions { pattern: "nuevo".into(), ..Default::default() };
    assert!(LogWriter::create(&d.join("logs"), o, LogVars::default()).is_err());
    // Nada cambió en disco.
    for (p, b) in before {
        assert_eq!(fs::read(&p).unwrap(), b, "{}", p.display());
    }
    assert_eq!(read_dir(&d).unwrap().iter().filter(|x| x.name.contains("corrupt")).count(), 1, "solo la copia del ejemplo");
}

/// Una grabación en curso sigue al bloquear: usa la llave de su archivo, no la DEK.
#[test]
fn recording_keeps_going_after_lock_with_its_own_file_key() {
    use crate::logfile::{LogOptions, LogVars, LogWriter};
    let e = Enc::new("int-rec");
    let dk = e.dk();
    let logs = e.d.join("logs");
    let mut w = LogWriter::create(&logs, LogOptions { pattern: "vivo".into(), ..Default::default() }, LogVars::default()).unwrap();
    w.write(b"antes\n");
    e.sh.set_key(None);
    w.write(b"despues\n");
    let p = w.path().to_path_buf();
    drop(w);
    assert_eq!(decrypt_all(&dk, &fs::read(&p).unwrap()).unwrap(), b"antes\ndespues\n");
}
