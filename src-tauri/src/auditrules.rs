//! Packs de reglas de auditoría (formato `netterminal-rules`): los importados y el del usuario, en
//! `<datos>/audit-rules` como `<capa>-<id>.json`. Son solo datos: la validación (esquema, ReDoS,
//! tamaño) y la evaluación ocurren en el frontend (src/lib/auditRules.ts). Se escriben con
//! `datacrypt::write_atomic` (atómico y cifrado en el modo portable cifrado), como los respaldos.
//!
//! También lee la configuración que el usuario elige auditar desde un archivo (solo lectura).

use crate::datacrypt as dfs;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

/// Igual que MAX_PACK_BYTES de auditRules.ts.
pub const MAX_PACK_BYTES: u64 = 512 * 1024;
/// Igual que MAX_CONFIG_BYTES de auditParse.ts.
pub const MAX_CONFIG_BYTES: u64 = 20 * 1024 * 1024;
const LAYERS: [&str; 2] = ["imported", "user"];
pub const DIR: &str = "audit-rules";

fn dir(data: &Path) -> Result<PathBuf, String> {
    let d = data.join(DIR);
    fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d)
}

/// Mismo formato que el id de auditRules.ts (`^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`).
fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id.chars().all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c))
        && id.chars().next().is_some_and(|c| c.is_ascii_alphanumeric())
}

fn file_name(layer: &str, id: &str) -> Result<String, String> {
    if !LAYERS.contains(&layer) {
        return Err("Capa inválida (imported o user)".into());
    }
    if !valid_id(id) {
        return Err("id de pack inválido (letras, números, punto, guion; máx. 64)".into());
    }
    Ok(format!("{layer}-{id}.json"))
}

/// Packs guardados: `{ layer, file, pack }`, o `{ layer, file, error }` si un archivo no se pudo leer
/// (la interfaz lo muestra en vez de ocultarlo en silencio).
pub fn list(data: &Path) -> Result<Vec<serde_json::Value>, String> {
    let d = dir(data)?;
    if let Some(why) = dfs::unavailable(&d) {
        return Err(why.to_string());
    }
    let mut out = Vec::new();
    for e in dfs::read_dir(&d).map_err(|e| e.to_string())? {
        if e.is_dir() || !e.name.ends_with(".json") {
            continue;
        }
        let Some(layer) = LAYERS.iter().find(|l| e.name.starts_with(&format!("{l}-"))) else { continue };
        let read = || -> Result<serde_json::Value, String> {
            let len = dfs::metadata(&e.path).map_err(|x| x.to_string())?.len();
            // El archivo cifrado pesa algo más que el texto: el margen evita rechazar un pack en el límite.
            if len > MAX_PACK_BYTES + 64 * 1024 {
                return Err(format!("El pack supera {} KB", MAX_PACK_BYTES / 1024));
            }
            let bytes = dfs::read(&e.path).map_err(|x| x.to_string())?;
            serde_json::from_slice(&bytes).map_err(|x| format!("JSON inválido: {x}"))
        };
        out.push(match read() {
            Ok(pack) => serde_json::json!({ "layer": layer, "file": e.name, "pack": pack }),
            Err(error) => serde_json::json!({ "layer": layer, "file": e.name, "error": error }),
        });
    }
    out.sort_by(|a, b| a["file"].as_str().cmp(&b["file"].as_str()));
    Ok(out)
}

/// Guarda un pack ya validado por el frontend. Reemplaza el de la misma capa e id.
pub fn save(data: &Path, layer: &str, pack: &serde_json::Value) -> Result<String, String> {
    let id = pack["id"].as_str().ok_or("Falta el id del pack")?;
    if pack["format"].as_str() != Some("netterminal-rules") {
        return Err("El pack debe tener format \"netterminal-rules\"".into());
    }
    let name = file_name(layer, id)?;
    let json = serde_json::to_string_pretty(pack).map_err(|e| e.to_string())?;
    if json.len() as u64 > MAX_PACK_BYTES {
        return Err(format!("El pack supera {} KB", MAX_PACK_BYTES / 1024));
    }
    let d = dir(data)?;
    if let Some(why) = dfs::unavailable(&d) {
        return Err(why.to_string());
    }
    dfs::write_atomic(&d.join(&name), json.as_bytes())?;
    Ok(id.to_string())
}

pub fn delete(data: &Path, layer: &str, id: &str) -> Result<(), String> {
    let name = file_name(layer, id)?;
    let p = dir(data)?.join(name);
    if !dfs::exists(&p) {
        return Ok(());
    }
    dfs::remove_file(&p).map_err(|e| e.to_string())
}

/// Lee como texto un archivo elegido por el usuario en el diálogo, con tope de tamaño. No lo
/// interpreta ni lo instala: el frontend valida (pack) o audita (configuración) el texto.
fn read_text(path: &str, max: u64, what: &str) -> Result<String, String> {
    let p = Path::new(path);
    let meta = fs::metadata(p).map_err(|e| e.to_string())?;
    if !meta.is_file() {
        return Err("No es un archivo".into());
    }
    if meta.len() > max {
        return Err(format!("{what} supera {}", if max >= 1024 * 1024 { format!("{} MB", max / 1024 / 1024) } else { format!("{} KB", max / 1024) }));
    }
    let mut buf = Vec::with_capacity(meta.len() as usize);
    fs::File::open(p).and_then(|f| f.take(max + 1).read_to_end(&mut buf)).map_err(|e| e.to_string())?;
    if buf.len() as u64 > max {
        return Err(format!("{what} creció mientras se leía"));
    }
    // Sin BOM y con reemplazo de bytes inválidos: un archivo en Latin-1 se audita igual.
    let text = String::from_utf8_lossy(&buf).into_owned();
    Ok(text.strip_prefix('\u{feff}').map(str::to_string).unwrap_or(text))
}

/// Pack elegido por el usuario para importar (texto JSON, sin instalarlo).
pub fn read_external(path: &str) -> Result<String, String> {
    read_text(path, MAX_PACK_BYTES, "El pack")
}

/// Configuración elegida por el usuario para auditar.
pub fn read_config(path: &str) -> Result<String, String> {
    read_text(path, MAX_CONFIG_BYTES, "La configuración")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(tag: &str) -> PathBuf {
        std::env::temp_dir().join(format!("nt-auditrules-{tag}-{}", uuid::Uuid::new_v4()))
    }

    fn pack(id: &str) -> serde_json::Value {
        serde_json::json!({"format": "netterminal-rules", "formatVersion": 1, "id": id, "name": "Pack", "version": "1.0.0", "rules": []})
    }

    #[test]
    fn saves_lists_and_deletes_by_layer() {
        let data = tmp("crud");
        assert_eq!(save(&data, "user", &pack("usuario")).unwrap(), "usuario");
        save(&data, "imported", &pack("Hardening.Core-1")).unwrap();
        // El mismo id en otra capa es otro archivo.
        save(&data, "imported", &pack("usuario")).unwrap();
        let l = list(&data).unwrap();
        assert_eq!(l.len(), 3);
        assert!(l.iter().all(|x| x["pack"]["format"] == "netterminal-rules"));
        assert_eq!(l.iter().filter(|x| x["layer"] == "user").count(), 1);
        delete(&data, "imported", "usuario").unwrap();
        delete(&data, "imported", "no-existe").unwrap();
        assert_eq!(list(&data).unwrap().len(), 2);
        let tmps = fs::read_dir(data.join(DIR)).unwrap().flatten().filter(|e| e.file_name().to_string_lossy().ends_with(".tmp")).count();
        assert_eq!(tmps, 0);
        let _ = fs::remove_dir_all(data);
    }

    #[test]
    fn rejects_bad_ids_layers_and_formats() {
        let data = tmp("bad");
        for bad in ["../x", ".oculto", "", "a/b", "con espacio", &"x".repeat(65)] {
            assert!(save(&data, "user", &pack(bad)).is_err(), "{bad}");
        }
        assert!(save(&data, "builtin", &pack("ok")).is_err(), "la capa integrada no se guarda");
        assert!(save(&data, "user", &serde_json::json!({"id": "ok", "format": "netterminal-commands"})).is_err());
        assert!(delete(&data, "user", "../../etc").is_err());
        let big = serde_json::json!({"format": "netterminal-rules", "id": "grande", "pad": "x".repeat(MAX_PACK_BYTES as usize)});
        assert!(save(&data, "user", &big).is_err());
        let _ = fs::remove_dir_all(data);
    }

    #[test]
    fn broken_files_are_reported_not_hidden() {
        let data = tmp("broken");
        save(&data, "user", &pack("bueno")).unwrap();
        fs::write(data.join(DIR).join("imported-roto.json"), "{ no es json").unwrap();
        fs::write(data.join(DIR).join("otro.json"), "{}").unwrap();
        let l = list(&data).unwrap();
        assert_eq!(l.len(), 2, "un archivo sin capa en el nombre se ignora");
        let roto = l.iter().find(|x| x["file"] == "imported-roto.json").unwrap();
        assert!(roto["error"].as_str().unwrap().contains("JSON inválido"));
        let _ = fs::remove_dir_all(data);
    }

    #[test]
    fn encrypted_mode_conversion_covers_the_packs() {
        // Al activar el modo portable cifrado, la conversión recorre esta carpeta: si no, los packs
        // quedarían en claro y la capa de archivos dejaría de listarlos.
        let data = tmp("walk");
        save(&data, "user", &pack("mis-reglas")).unwrap();
        let found = dfs::walk(&dfs::Layout::new(&data, &[]));
        assert!(found.iter().any(|f| f.logical.ends_with(Path::new(DIR).join("user-mis-reglas.json"))));
        let _ = fs::remove_dir_all(data);
    }

    #[test]
    fn reads_external_text_with_limits() {
        let data = tmp("ext");
        fs::create_dir_all(&data).unwrap();
        let cfg = data.join("fw.conf");
        fs::write(&cfg, b"\xef\xbb\xbfconfig system global\n    set hostname \"FW\"\xe9\nend\n").unwrap();
        let t = read_config(cfg.to_str().unwrap()).unwrap();
        assert!(t.starts_with("config system global"), "sin BOM");
        assert!(t.contains('\u{fffd}'), "bytes inválidos se reemplazan");
        let big = data.join("grande.json");
        fs::write(&big, vec![b' '; MAX_PACK_BYTES as usize + 1]).unwrap();
        assert!(read_external(big.to_str().unwrap()).unwrap_err().contains("512 KB"));
        assert!(read_config(data.to_str().unwrap()).is_err(), "una carpeta no se lee");
        let _ = fs::remove_dir_all(data);
    }
}
