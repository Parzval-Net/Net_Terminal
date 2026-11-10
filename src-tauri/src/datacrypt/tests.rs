use super::*;

/// Argon2id liviano para las pruebas (el real es de 64 MiB).
pub(crate) const KDF: Kdf = Kdf { m: 64, t: 1, p: 1 };

/// `enable` con el Argon2id liviano de las pruebas; devuelve la DEK junto al informe.
pub(crate) fn en(layout: &Layout, pw: &str, hook: Hook, progress: &mut dyn FnMut(&Progress)) -> Result<(DataKey, Report), String> {
    let mut key = None;
    let r = enable(layout, pw, KDF, hook, progress, &mut key)?;
    Ok((key.expect("llave escrita"), r))
}

pub(crate) fn tmp(tag: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("nt-datacrypt-{tag}-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&d).unwrap();
    d
}

fn chunks_of(data: &[u8]) -> Vec<(usize, usize)> {
    // (inicio, largo total del registro) de cada bloque.
    let mut out = Vec::new();
    let mut pos = HEADER_LEN;
    while pos + 4 <= data.len() {
        let raw = u32::from_le_bytes(data[pos..pos + 4].try_into().unwrap());
        let len = (raw & !FINAL_BIT) as usize;
        out.push((pos, REC_HEAD + len));
        pos += REC_HEAD + len;
    }
    out
}

#[test]
fn whole_file_round_trip_and_sizes() {
    let dk = DataKey::generate();
    for size in [0usize, 1, 100, WRITE_CHUNK - 1, WRITE_CHUNK, WRITE_CHUNK * 3 + 17] {
        let data: Vec<u8> = (0..size).map(|i| (i % 251) as u8).collect();
        let enc = encrypt_all(&dk, &data).unwrap();
        assert_eq!(decrypt_all(&dk, &enc).unwrap(), data, "{size}");
        // Dos cifrados del mismo contenido no se parecen (llave por archivo y nonces aleatorios).
        assert_ne!(encrypt_all(&dk, &data).unwrap(), enc);
        // El texto en claro no aparece en el archivo.
        if size >= 100 {
            assert!(!enc.windows(32).any(|w| w == &data[10..42]));
        }
    }
}

#[test]
fn tampered_block_header_or_trailer_is_rejected() {
    let dk = DataKey::generate();
    let data = vec![7u8; WRITE_CHUNK * 2 + 5];
    let enc = encrypt_all(&dk, &data).unwrap();
    // Cualquier byte alterado (cabecera, largo, nonce, texto cifrado, etiqueta, cierre) falla.
    for i in [0, 7, 10, 30, 50, 70, 111, HEADER_LEN, HEADER_LEN + 5, HEADER_LEN + 40, enc.len() / 2, enc.len() - 1] {
        let mut t = enc.clone();
        t[i] ^= 0x01;
        assert!(decrypt_all(&dk, &t).is_err(), "byte {i}");
    }
    // Bytes extra después del cierre.
    let mut t = enc.clone();
    t.push(0);
    assert!(decrypt_all(&dk, &t).is_err());
    // Otra DEK (otra carpeta).
    assert!(decrypt_all(&DataKey::generate(), &enc).unwrap_err().to_string().contains("otra carpeta"));
}

#[test]
fn truncation_is_detected() {
    let dk = DataKey::generate();
    let data = vec![3u8; WRITE_CHUNK * 2 + 9];
    let enc = encrypt_all(&dk, &data).unwrap();
    let ch = chunks_of(&enc);
    assert_eq!(ch.len(), 4, "3 bloques de datos + cierre");
    // Sin el bloque de cierre: estricto falla; tolerante entrega lo íntegro y avisa.
    let cut = &enc[..ch[3].0];
    assert!(decrypt_all(&dk, cut).is_err());
    let mut r = EncReader::new(cut, &dk, false).unwrap();
    let mut out = Vec::new();
    r.read_to_end(&mut out).unwrap();
    assert_eq!(out, data);
    assert!(r.incomplete());
    // Cortado a mitad de un bloque: tolerante se queda con los bloques completos.
    let cut = &enc[..ch[1].0 + 100];
    let mut r = EncReader::new(cut, &dk, false).unwrap();
    let mut out = Vec::new();
    r.read_to_end(&mut out).unwrap();
    assert_eq!(out, data[..WRITE_CHUNK]);
    assert!(r.incomplete());
    // Quitar un bloque del medio: el número de bloque no calza.
    let mut t = enc[..ch[1].0].to_vec();
    t.extend_from_slice(&enc[ch[2].0..]);
    assert!(decrypt_all(&dk, &t).is_err());
    // Cabecera cortada.
    assert!(decrypt_all(&dk, &enc[..50]).is_err());
}

#[test]
fn reordered_blocks_and_blocks_from_another_file_fail() {
    let dk = DataKey::generate();
    let a = encrypt_all(&dk, &vec![1u8; WRITE_CHUNK * 2]).unwrap();
    let b = encrypt_all(&dk, &vec![1u8; WRITE_CHUNK * 2]).unwrap();
    let (ca, cb) = (chunks_of(&a), chunks_of(&b));
    // Intercambiar los bloques 0 y 1 (mismo contenido en claro, distinto número).
    let mut t = a[..HEADER_LEN].to_vec();
    t.extend_from_slice(&a[ca[1].0..ca[1].0 + ca[1].1]);
    t.extend_from_slice(&a[ca[0].0..ca[0].0 + ca[0].1]);
    t.extend_from_slice(&a[ca[2].0..]);
    assert!(decrypt_all(&dk, &t).is_err());
    // El bloque 1 de otro archivo de la misma carpeta (mismo número, misma DEK).
    let mut t = a[..ca[1].0].to_vec();
    t.extend_from_slice(&b[cb[1].0..cb[1].0 + cb[1].1]);
    t.extend_from_slice(&a[ca[2].0..]);
    assert!(decrypt_all(&dk, &t).is_err());
    // La cabecera de otro archivo con los bloques de este.
    let mut t = b[..HEADER_LEN].to_vec();
    t.extend_from_slice(&a[HEADER_LEN..]);
    assert!(decrypt_all(&dk, &t).is_err());
    // El cierre de otro archivo.
    let mut t = a[..ca[2].0].to_vec();
    t.extend_from_slice(&b[cb[2].0..]);
    assert!(decrypt_all(&dk, &t).is_err());
}

#[test]
fn key_file_password_slots_and_change() {
    let d = tmp("key");
    let dk = DataKey::generate();
    let mut kf = KeyFile::create(&dk, "clave-correcta-1", KDF).unwrap();
    kf.write(&d).unwrap();
    let back = KeyFile::read(&d).unwrap().unwrap();
    let (k, slot) = back.unwrap("clave-correcta-1").unwrap();
    assert_eq!((slot, *k.key, k.id), (0, *dk.key, dk.id));
    assert!(back.unwrap("otra-clave-123").is_err(), "contraseña incorrecta");
    // Cambio de maestra: paso 1 agrega la ranura nueva; ambas abren.
    let s = kf.add_slot(&dk, "clave-nueva-2", KDF, 0).unwrap();
    kf.write(&d).unwrap();
    let both = KeyFile::read(&d).unwrap().unwrap();
    assert_eq!(both.slots(), 2);
    assert!(both.unwrap("clave-correcta-1").is_ok() && both.unwrap("clave-nueva-2").is_ok());
    // Paso final: queda solo la nueva.
    kf.keep_only(s);
    kf.write(&d).unwrap();
    let only = KeyFile::read(&d).unwrap().unwrap();
    assert!(only.unwrap("clave-correcta-1").is_err());
    assert_eq!(*only.unwrap("clave-nueva-2").unwrap().0.key, *dk.key);
    // Ranura con otra DEK: se rechaza.
    assert!(kf.add_slot(&DataKey::generate(), "x-12345678", KDF, 0).is_err());
    // Archivo alterado o de versión futura.
    let mut b = fs::read(d.join(KEY_FILE)).unwrap();
    b[40] ^= 1;
    assert!(KeyFile::decode(&b).unwrap().unwrap("clave-nueva-2").is_err());
    b[8] = 9;
    assert!(KeyFile::decode(&b).err().unwrap().contains("más nueva"));
    // Parámetros desmedidos en un archivo manipulado: se rechazan antes de derivar.
    let mut b = fs::read(d.join(KEY_FILE)).unwrap();
    b[KEY_HEAD..KEY_HEAD + 4].copy_from_slice(&(4u32 * 1024 * 1024).to_le_bytes());
    assert!(KeyFile::decode(&b).is_err());
    assert!(KeyFile::read(&d.join("no")).unwrap().is_none());
    let _ = fs::remove_dir_all(d);
}

#[test]
fn appender_survives_reopen_crash_and_shares_state() {
    let d = tmp("app");
    let dk = DataKey::generate();
    let p = d.join("a.log.nte");
    {
        let (a, had) = open_append(&p, Some(&dk), OpenMode::CreateNew).unwrap();
        assert!(!had);
        a.append(b"uno\n").unwrap();
        a.append(b"dos\n").unwrap();
    }
    // Cerrado: tiene cierre y se lee estricto.
    assert_eq!(decrypt_all(&dk, &fs::read(&p).unwrap()).unwrap(), b"uno\ndos\n");
    // CreateNew no pisa uno existente.
    assert!(open_append(&p, Some(&dk), OpenMode::CreateNew).is_err());
    // Retomar: quita el cierre y sigue numerando.
    {
        let (a, had) = open_append(&p, Some(&dk), OpenMode::Existing).unwrap();
        assert!(had);
        a.append(b"tres\n").unwrap();
    }
    // Simula un corte al escribir (la app cerrada a la fuerza): sin el bloque de cierre y con el
    // comienzo de un bloque que no alcanzó a escribirse entero (los bytes son un prefijo correcto).
    let full = fs::read(&p).unwrap();
    let ch = chunks_of(&full);
    let (fin_at, _) = *ch.last().unwrap();
    let (prev_at, prev_len) = ch[ch.len() - 2];
    for cut in [3usize, 4, 20, prev_len - 1] {
        let mut raw = full[..fin_at].to_vec();
        raw.extend_from_slice(&full[prev_at..prev_at + cut]);
        fs::write(&p, &raw).unwrap();
        assert!(decrypt_all(&dk, &raw).is_err(), "sin cierre y con un bloque a medias");
        // Se recorta solo la cola incompleta y se sigue con nonces nuevos.
        {
            let (a, _) = open_append(&p, Some(&dk), OpenMode::Append).unwrap();
            a.append(b"cuatro\n").unwrap();
        }
        assert_eq!(decrypt_all(&dk, &fs::read(&p).unwrap()).unwrap(), b"uno\ndos\ntres\ncuatro\n", "corte de {cut} bytes");
        assert!(damaged_list().iter().all(|x| !x.contains("a.dañado")), "una cola cortada no es daño");
    }
    // Bloqueada (sin DEK) no se puede abrir un archivo que nadie tiene abierto.
    assert_eq!(open_append(&p, None, OpenMode::Append).err().unwrap().kind(), io::ErrorKind::PermissionDenied);
    let _ = fs::remove_dir_all(d);
}

/// Un daño que no es la cola cortada de una escritura (un bloque del medio, el último, un largo
/// imposible, la cabecera): no se trunca ni se escribe encima. El archivo se aparta como
/// `.dañado-<fecha>` (cifrado, recuperable hasta el daño), se avisa y se sigue en uno nuevo.
#[test]
fn damaged_append_file_is_set_aside_never_truncated() {
    let dk = DataKey::generate();
    let notified = Arc::new(Mutex::new(Vec::<String>::new()));
    {
        let n = notified.clone();
        set_notifier(Box::new(move |p| n.lock().unwrap().push(p.to_string())));
    }
    for (what, flip) in [("bloque del medio", 1usize), ("último bloque", 3), ("largo imposible", 99), ("cabecera", 98)] {
        let d = tmp("dmg");
        let p = d.join("b.log.nte");
        {
            let (a, _) = open_append(&p, Some(&dk), OpenMode::CreateNew).unwrap();
            for i in 0..4 {
                a.append(format!("linea {i}\n").as_bytes()).unwrap();
            }
        }
        let mut raw = fs::read(&p).unwrap();
        let ch = chunks_of(&raw);
        match flip {
            99 => raw[ch[1].0 + 3] = 0x7f,  // largo enorme en el bloque 1
            98 => raw[70] ^= 1,             // llave del archivo
            i => raw[ch[i].0 + 30] ^= 1,    // texto cifrado del bloque i
        }
        // Sin el cierre: así el bloque 3 es el último.
        let raw = raw[..ch[4].0].to_vec();
        fs::write(&p, &raw).unwrap();
        let before = raw.clone();
        let (a, had) = open_append(&p, Some(&dk), OpenMode::Append).unwrap();
        assert!(!had, "{what}: sigue en un archivo nuevo");
        a.append(b"nuevo\n").unwrap();
        drop(a);
        assert_eq!(decrypt_all(&dk, &fs::read(&p).unwrap()).unwrap(), b"nuevo\n", "{what}");
        let aside: Vec<PathBuf> = fs::read_dir(&d).unwrap().flatten().map(|e| e.path()).filter(|x| x.to_string_lossy().contains(".dañado-")).collect();
        assert_eq!(aside.len(), 1, "{what}");
        assert_eq!(fs::read(&aside[0]).unwrap(), before, "{what}: el apartado queda intacto");
        assert!(aside[0].to_string_lossy().ends_with(".log.nte"), "sigue siendo un log cifrado");
        assert!(damaged_list().iter().any(|x| x == &aside[0].to_string_lossy()), "{what}: queda en la lista de avisos");
        assert!(notified.lock().unwrap().iter().any(|x| x == &aside[0].to_string_lossy()), "{what}: se avisó");
        // El rescate entrega lo íntegro antes del daño.
        let r = EncReader::new(File::open(&aside[0]).unwrap(), &dk, false);
        if flip != 98 {
            let mut out = Vec::new();
            let mut s = r.unwrap().salvage();
            s.read_to_end(&mut out).unwrap();
            assert!(s.incomplete());
            let expect: String = (0..flip.min(4)).map(|i| format!("linea {i}\n")).collect();
            if flip != 99 {
                assert_eq!(String::from_utf8(out).unwrap(), expect, "{what}");
            }
        } else {
            assert!(r.is_err(), "cabecera dañada: no se abre");
        }
        let _ = fs::remove_dir_all(d);
    }
}

#[test]
fn concurrent_appends_stay_ordered_and_complete() {
    let d = tmp("conc");
    let dk = Arc::new(DataKey::generate());
    let p = d.join("c.log.nte");
    let threads: Vec<_> = (0..8u8)
        .map(|i| {
            let (p, dk) = (p.clone(), dk.clone());
            std::thread::spawn(move || {
                // Cada hilo abre por su cuenta (como dos pestañas que anexan al mismo log).
                let (a, _) = open_append(&p, Some(&dk), OpenMode::Append).unwrap();
                for j in 0..200u32 {
                    a.append(format!("h{i}-{j:04}\n").as_bytes()).unwrap();
                }
            })
        })
        .collect();
    for t in threads {
        t.join().unwrap();
    }
    let text = String::from_utf8(decrypt_all(&dk, &fs::read(&p).unwrap()).unwrap()).unwrap();
    let lines: Vec<&str> = text.lines().collect();
    assert_eq!(lines.len(), 1600);
    for i in 0..8 {
        let mine: Vec<&&str> = lines.iter().filter(|l| l.starts_with(&format!("h{i}-"))).collect();
        assert_eq!(mine.len(), 200);
        assert!(mine.windows(2).all(|w| w[0] < w[1]), "orden por hilo");
    }
    let _ = fs::remove_dir_all(d);
}

#[test]
fn layer_maps_names_and_refuses_when_locked() {
    let d = tmp("layer");
    let sh = Shared::new();
    register(&d, &sh);
    let f = d.join("settings.json");
    // Bloqueada: ni lee ni escribe.
    assert!(write_atomic(&f, b"{}").unwrap_err().contains("bloqueados"));
    assert_eq!(unavailable(&d), Some(LOCKED));
    sh.set_key(Some(DataKey::generate()));
    assert_eq!(unavailable(&d), None);
    write_atomic(&f, br#"{"a":1}"#).unwrap();
    assert!(!f.exists() && d.join("settings.json.nte").exists());
    assert_eq!(read(&f).unwrap(), br#"{"a":1}"#);
    assert!(exists(&f));
    // Un claro con el mismo nombre no se lee ni se lista.
    fs::write(d.join("command_history.json"), b"{}").unwrap();
    assert_eq!(read(&d.join("command_history.json")).unwrap_err().kind(), io::ErrorKind::NotFound);
    let names: Vec<String> = read_dir(&d).unwrap().into_iter().map(|e| e.name).collect();
    assert_eq!(names, vec!["settings.json".to_string()]);
    // Exentos: la bóveda se lee tal cual.
    fs::write(d.join(VAULT_FILE), b"NTVAULT").unwrap();
    assert_eq!(read(&d.join(VAULT_FILE)).unwrap(), b"NTVAULT");
    // copiar y renombrar entre nombres lógicos.
    copy(&f, &d.join("settings.json.bak")).unwrap();
    assert_eq!(read(&d.join("settings.json.bak")).unwrap(), br#"{"a":1}"#);
    rename(&d.join("settings.json.bak"), &d.join("settings.json.bak2")).unwrap();
    assert!(exists(&d.join("settings.json.bak2")) && !exists(&d.join("settings.json.bak")));
    remove_file(&d.join("settings.json.bak2")).unwrap();
    // En conversión, nada.
    sh.set_busy(true);
    assert!(read(&f).unwrap_err().to_string().contains("conversión"));
    sh.set_busy(false);
    // Lector en flujo.
    let mut s = String::new();
    open_read(&f).unwrap().read_to_string(&mut s).unwrap();
    assert_eq!(s, r#"{"a":1}"#);
    sh.set_key(None);
    assert_eq!(read(&f).unwrap_err().kind(), io::ErrorKind::PermissionDenied);
    unregister(&sh);
    // Sin registro: std::fs tal cual.
    assert_eq!(read(&f).unwrap_err().kind(), io::ErrorKind::NotFound);
    let _ = fs::remove_dir_all(d);
}

/// Carpeta de datos de ejemplo con todo lo que cubre el modo.
pub(crate) fn fixture(d: &Path) -> Vec<(String, Vec<u8>)> {
    let files: Vec<(&str, Vec<u8>)> = vec![
        ("sessions.json", br#"[{"id":"a","name":"core","type":"ssh","host":"192.0.2.1","created_at":""}]"#.to_vec()),
        ("settings.json", br#"{"fontSize":13,"mcpToken":""}"#.to_vec()),
        ("settings.json.bak", br#"{"fontSize":12}"#.to_vec()),
        ("topology.json", br#"{"topology":{"nodes":[],"links":[]}}"#.to_vec()),
        ("settings.v0.bak.json", b"{}".to_vec()),
        ("sessions.corrupt-1700000000.json", b"roto".to_vec()),
        ("command_history.json", br#"{"devices":{}}"#.to_vec()),
        ("recent_targets.json", br#"["192.0.2.9"]"#.to_vec()),
        ("notes/red.txt", "interfaz Gi1/0/1 ñandú".as_bytes().to_vec()),
        ("backups/core-sw/2026-01-02_101010.txt", b"hostname core-sw\n".to_vec()),
        ("backups/core-sw/.secret-key", vec![5u8; 32]),
        ("backups/core-sw/.2026-01-02_101010.txt.secrets.json", b"{}".to_vec()),
        ("mcp-audit/audit.jsonl", b"{\"tool\":\"x\"}\n".to_vec()),
        ("logs/Clientes/core_20260101.log", vec![b'x'; WRITE_CHUNK + 33]),
        ("logs/b.txt", b"log b".to_vec()),
    ];
    for (rel, body) in &files {
        let p = d.join(rel);
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(&p, body).unwrap();
    }
    // Lo que no se cubre queda tal cual.
    for rel in ["credentials.vault", "notes/secreta.ntenc", "tftp/fw.bin", "command-packs/p.json", "scripts/s.py"] {
        let p = d.join(rel);
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(&p, b"intacto").unwrap();
    }
    files.into_iter().map(|(r, b)| (r.to_string(), b)).collect()
}

fn assert_plain(d: &Path, files: &[(String, Vec<u8>)]) {
    for (rel, body) in files {
        assert_eq!(&fs::read(d.join(rel)).unwrap_or_else(|_| panic!("{rel}")), body, "{rel}");
        assert!(!d.join(format!("{rel}.nte")).exists(), "{rel}.nte");
    }
}

fn assert_encrypted(d: &Path, dk: &DataKey, files: &[(String, Vec<u8>)]) {
    for (rel, body) in files {
        let p = d.join(format!("{rel}.nte"));
        assert_eq!(&decrypt_all(dk, &fs::read(&p).unwrap_or_else(|_| panic!("{rel}"))).unwrap(), body, "{rel}");
        if rel != "sessions.json" {
            assert!(!d.join(rel).exists(), "{rel} en claro");
        }
    }
    assert!(is_stub(&fs::read(d.join("sessions.json")).unwrap()));
    for rel in ["credentials.vault", "notes/secreta.ntenc", "tftp/fw.bin", "command-packs/p.json", "scripts/s.py"] {
        assert_eq!(fs::read(d.join(rel)).unwrap(), b"intacto", "{rel}");
    }
}

fn no_temps(d: &Path) {
    fn walk(p: &Path, out: &mut Vec<PathBuf>) {
        for e in fs::read_dir(p).unwrap().flatten() {
            if e.path().is_dir() {
                walk(&e.path(), out);
            } else if e.file_name().to_string_lossy().ends_with(".tmp") {
                out.push(e.path());
            }
        }
    }
    let mut v = Vec::new();
    walk(d, &mut v);
    assert!(v.is_empty(), "{v:?}");
}

#[test]
fn enable_and_disable_round_trip() {
    let d = tmp("conv");
    let files = fixture(&d);
    let layout = Layout::new(&d, &[]);
    let mut seen = Vec::new();
    let (dk, rep) = en(&layout, "maestra-de-prueba", &no_hook, &mut |p| seen.push(p.clone())).unwrap();
    assert_eq!(rep.converted, files.len());
    assert!(seen.last().is_some_and(|p| p.done == p.total && p.bytes == p.total_bytes));
    assert_encrypted(&d, &dk, &files);
    assert!(d.join(README_FILE).exists() && !d.join(JOURNAL_FILE).exists());
    assert!(plaintext_found(&layout).is_empty());
    no_temps(&d);
    // La llave abre con la maestra.
    assert_eq!(*KeyFile::read(&d).unwrap().unwrap().unwrap("maestra-de-prueba").unwrap().0.key, *dk.key);
    let rep = disable(&layout, &dk, &[], &no_hook, &mut |_| {}).unwrap();
    assert_eq!(rep.converted, files.len());
    assert_plain(&d, &files);
    assert!(!d.join(KEY_FILE).exists() && !d.join(README_FILE).exists() && !d.join(JOURNAL_FILE).exists());
    no_temps(&d);
    let _ = fs::remove_dir_all(d);
}

/// Corte en cada paso de la conversión (en cada archivo): al retomar no se pierde nada y el
/// resultado es el mismo. También revertir a mitad de camino.
#[test]
fn interrupted_conversion_resumes_or_reverts_at_every_step() {
    let steps = [Step::Journal, Step::KeyFile, Step::Temp, Step::Renamed, Step::Verified, Step::Removed, Step::Finish];
    for step in steps {
        for nth in [1usize, 4] {
            for revert in [false, true] {
                let d = tmp("cut");
                let files = fixture(&d);
                let layout = Layout::new(&d, &[]);
                let count = std::cell::Cell::new(0usize);
                let hook = |s: Step| {
                    if s == step {
                        count.set(count.get() + 1);
                        if count.get() == nth {
                            return Err(io::Error::other("corte simulado"));
                        }
                    }
                    Ok(())
                };
                let r = en(&layout, "maestra-de-prueba", &hook, &mut |_| {});
                if r.is_ok() {
                    // El paso no se alcanzó `nth` veces (Journal, KeyFile y Finish ocurren una vez).
                    let _ = fs::remove_dir_all(d);
                    continue;
                }
                no_dataloss(&d, &files);
                // Al arrancar: sin llave escrita, el diario se descarta y todo sigue en claro.
                match startup_journal(&d) {
                    None => {
                        assert!(!d.join(KEY_FILE).exists());
                        assert_plain(&d, &files);
                    }
                    Some(j) => {
                        assert_eq!(j.op, Op::Encrypt);
                        let (dk, _) = KeyFile::read(&d).unwrap().unwrap().unwrap("maestra-de-prueba").unwrap();
                        if revert {
                            resume(&layout, Op::Decrypt, &dk, &no_hook, &mut |_| {}).unwrap();
                            assert_plain(&d, &files);
                            assert!(!d.join(KEY_FILE).exists());
                        } else {
                            resume(&layout, Op::Encrypt, &dk, &no_hook, &mut |_| {}).unwrap();
                            assert_encrypted(&d, &dk, &files);
                            assert!(plaintext_found(&layout).is_empty());
                        }
                        assert!(!d.join(JOURNAL_FILE).exists());
                    }
                }
                no_temps(&d);
                let _ = fs::remove_dir_all(d);
            }
        }
    }
}

/// Corte al desactivar: retomar termina de descifrar; revertir vuelve a cifrar.
#[test]
fn interrupted_decryption_resumes_or_reverts() {
    for step in [Step::Temp, Step::Renamed, Step::Verified, Step::Removed, Step::Finish] {
        for revert in [false, true] {
            let d = tmp("dcut");
            let files = fixture(&d);
            let layout = Layout::new(&d, &[]);
            let (dk, _) = en(&layout, "maestra-de-prueba", &no_hook, &mut |_| {}).unwrap();
            let count = std::cell::Cell::new(0usize);
            let hook = |s: Step| {
                if s == step {
                    count.set(count.get() + 1);
                    if count.get() == if step == Step::Finish { 1 } else { 3 } {
                        return Err(io::Error::other("corte simulado"));
                    }
                }
                Ok(())
            };
            assert!(disable(&layout, &dk, &[], &hook, &mut |_| {}).is_err());
            no_dataloss_with(&d, &files, Some(&dk));
            match startup_journal(&d) {
                None => {
                    // El corte fue después de borrar la llave: ya está todo en claro.
                    assert_plain(&d, &files);
                }
                Some(j) => {
                    assert_eq!(j.op, Op::Decrypt);
                    if revert {
                        resume(&layout, Op::Encrypt, &dk, &no_hook, &mut |_| {}).unwrap();
                        assert_encrypted(&d, &dk, &files);
                    } else {
                        resume(&layout, Op::Decrypt, &dk, &no_hook, &mut |_| {}).unwrap();
                        assert_plain(&d, &files);
                    }
                }
            }
            no_temps(&d);
            let _ = fs::remove_dir_all(d);
        }
    }
}

/// Cada archivo existe íntegro en claro o cifrado (o ambos).
fn no_dataloss(d: &Path, files: &[(String, Vec<u8>)]) {
    let dk = KeyFile::read(d).ok().flatten().and_then(|k| k.unwrap("maestra-de-prueba").ok()).map(|x| x.0);
    no_dataloss_with(d, files, dk.as_ref());
}

fn no_dataloss_with(d: &Path, files: &[(String, Vec<u8>)], dk: Option<&DataKey>) {
    for (rel, body) in files {
        let plain = fs::read(d.join(rel)).ok().filter(|b| !(rel == "sessions.json" && is_stub(b)));
        let enc = dk.and_then(|k| fs::read(d.join(format!("{rel}.nte"))).ok().and_then(|b| decrypt_all(k, &b).ok()));
        assert!(plain.as_ref() == Some(body) || enc.as_ref() == Some(body), "{rel} perdido");
    }
}

#[test]
fn plaintext_found_in_encrypted_folder_is_reported_and_fixed_without_loss() {
    let d = tmp("found");
    let files = fixture(&d);
    let layout = Layout::new(&d, &[]);
    let (dk, _) = en(&layout, "maestra-de-prueba", &no_hook, &mut |_| {}).unwrap();
    // Una versión anterior abrió la carpeta: creó ajustes y una nota en claro, y rotó el aviso.
    fs::write(d.join("settings.json"), br#"{"fontSize":20}"#).unwrap();
    fs::write(d.join("notes/nueva.txt"), b"nota nueva").unwrap();
    fs::copy(d.join("sessions.json"), d.join("sessions.json.bak")).unwrap();
    let mut found = plaintext_found(&layout);
    found.sort();
    assert_eq!(found, vec!["notes/nueva.txt".to_string(), "settings.json".to_string()], "el aviso y su copia no cuentan");
    // La capa no los lee.
    let sh = Shared::new();
    register(&d, &sh);
    sh.set_key(Some(KeyFile::read(&d).unwrap().unwrap().unwrap("maestra-de-prueba").unwrap().0));
    assert_eq!(read(&d.join("settings.json")).unwrap(), br#"{"fontSize":13,"mcpToken":""}"#);
    unregister(&sh);
    let rep = fix_plaintext(&layout, &dk).unwrap();
    assert_eq!(rep.converted, 2);
    assert_eq!(rep.aside.len(), 1, "settings.json chocaba con el cifrado: queda apartado");
    assert!(plaintext_found(&layout).is_empty());
    // El cifrado original sigue mandando y el claro no se perdió.
    assert_eq!(decrypt_all(&dk, &fs::read(d.join("settings.json.nte")).unwrap()).unwrap(), br#"{"fontSize":13,"mcpToken":""}"#);
    let aside = walk(&layout).into_iter().find(|f| f.logical.to_string_lossy().contains(".encontrado-")).unwrap();
    assert!(aside.encrypted);
    assert_eq!(decrypt_all(&dk, &fs::read(&aside.phys).unwrap()).unwrap(), br#"{"fontSize":20}"#);
    assert_eq!(decrypt_all(&dk, &fs::read(d.join("notes/nueva.txt.nte")).unwrap()).unwrap(), b"nota nueva");
    // Al desactivar, el apartado también vuelve a claro.
    disable(&layout, &dk, &[], &no_hook, &mut |_| {}).unwrap();
    assert!(walk(&layout).iter().all(|f| !f.encrypted));
    assert_eq!(fs::read(d.join("settings.json")).unwrap(), br#"{"fontSize":13,"mcpToken":""}"#);
    drop(files);
    let _ = fs::remove_dir_all(d);
}

#[test]
fn disable_refuses_when_a_file_was_tampered() {
    let d = tmp("tamper");
    let files = fixture(&d);
    let layout = Layout::new(&d, &[]);
    let (dk, _) = en(&layout, "maestra-de-prueba", &no_hook, &mut |_| {}).unwrap();
    let p = d.join("notes/red.txt.nte");
    let mut b = fs::read(&p).unwrap();
    let n = b.len();
    b[n - 30] ^= 1;
    fs::write(&p, &b).unwrap();
    let e = disable(&layout, &dk, &[], &no_hook, &mut |_| {}).unwrap_err();
    assert!(e.message.contains("notes/red.txt"), "{e:?}");
    // No se tocó nada.
    assert!(d.join(KEY_FILE).exists() && d.join("settings.json.nte").exists() && !d.join("settings.json").exists());
    assert!(!d.join(JOURNAL_FILE).exists());
    drop(files);
    let _ = fs::remove_dir_all(d);
}

#[test]
fn custom_logs_folder_is_converted_too() {
    let d = tmp("logs");
    let ext = tmp("ext");
    fs::write(ext.join("x.log"), b"externo").unwrap();
    fs::create_dir_all(ext.join("sub")).unwrap();
    fs::write(ext.join("sub/y.txt"), b"y").unwrap();
    fs::write(ext.join("z.bin"), b"no es log").unwrap();
    fs::write(ext.join("Informe (copia).log"), b"ajeno").unwrap();
    fs::create_dir_all(ext.join("Clientes")).unwrap();
    fs::write(ext.join("Clientes/core_sw_20260101-101010.log"), b"de la app").unwrap();
    let layout = Layout::new(&d, std::slice::from_ref(&ext));
    let (dk, rep) = en(&layout, "maestra-de-prueba", &no_hook, &mut |_| {}).unwrap();
    // En una carpeta elegida por el usuario solo se cifran los nombres que genera la app.
    assert_eq!(rep.converted, 2);
    assert_eq!(decrypt_all(&dk, &fs::read(ext.join("x.log.nte")).unwrap()).unwrap(), b"externo");
    assert!(ext.join("Clientes/core_sw_20260101-101010.log.nte").exists());
    assert_eq!(fs::read(ext.join("sub/y.txt")).unwrap(), b"y", "un .txt ajeno no se toca");
    assert_eq!(fs::read(ext.join("Informe (copia).log")).unwrap(), b"ajeno", "un .log con nombre ajeno no se toca");
    assert_eq!(fs::read(ext.join("z.bin")).unwrap(), b"no es log");
    assert!(plaintext_found(&layout).is_empty(), "los ajenos tampoco cuentan como claro encontrado");
    assert_eq!(read_roots(&d), vec![ext.clone()], "la carpeta queda anotada junto a la llave");
    assert_eq!(read_journal(&d).map(|j| j.op), None);
    let _ = fs::remove_dir_all(d);
    let _ = fs::remove_dir_all(ext);
}

/// Lo que ve una versión anterior: el aviso es un sessions.json válido para el formato de sesiones de
/// siempre, y ninguno de los nombres cifrados coincide con un archivo que lea.
#[test]
fn previous_versions_see_the_stub_and_never_the_encrypted_files() {
    let s: Vec<crate::models::Session> = serde_json::from_slice(&stub_bytes()).unwrap();
    assert_eq!(s.len(), 1);
    assert_eq!(s[0].session_type, crate::models::SessionType::Local);
    assert!(s[0].name.contains("cifrada"));
    let d = tmp("old");
    fixture(&d);
    en(&Layout::new(&d, &[]), "maestra-de-prueba", &no_hook, &mut |_| {}).unwrap();
    // El SessionStore actual sin registro (como una versión anterior) lee el aviso y no reescribe nada.
    let before = fs::read(d.join("sessions.json.nte")).unwrap();
    let store = crate::session_store::SessionStore::new(&d);
    assert_eq!(store.list()[0].id, STUB_ID);
    assert_eq!(fs::read(d.join("sessions.json.nte")).unwrap(), before);
    let _ = fs::remove_dir_all(d);
}
