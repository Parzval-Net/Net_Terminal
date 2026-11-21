//! Comandos de archivo sobre una sesión abierta (listar el flash, copy desde/hacia el
//! servidor TFTP/HTTP local) respondiendo automáticamente las confirmaciones típicas
//! del equipo y la paginación "--More--".

use crate::expect;
use regex::Regex;
use serde::Serialize;
use serde_json::json;
use std::collections::HashMap;
use std::net::ToSocketAddrs;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Serialize, Clone)]
struct JobEvent {
    job: String,
    kind: &'static str,
    text: String,
    data: Option<serde_json::Value>,
}

struct Patterns {
    more: Regex,
    prompt: Regex,
    confirm: Regex,
    yes_no: Regex,
    /// Pregunta que borra, formatea, sobrescribe o reinicia: no se confirma nunca sola.
    destructive: Regex,
    error: Regex,
}

fn patterns() -> &'static Patterns {
    static P: OnceLock<Patterns> = OnceLock::new();
    P.get_or_init(|| Patterns {
        // " --More-- " (IOS, NX-OS), "  ---- More ----" (VRP) y "---(more)---" o "---(more 45%)---" (Junos):
        // el mismo marcador que PAGER en src/lib/cliText.ts. Antes "\(more\)\s*$" exigía el fin de línea
        // tras el paréntesis: el paginador de Junos no se reconocía, el trabajo esperaba el plazo completo,
        // devolvía solo la primera página y el comando siguiente se tecleaba dentro del paginador.
        more: Regex::new(r"(?i)(-{2,}\s*\(?more(?:\s+\d+%)?\)?\s*-{2,}|\(more\)|press any key)\s*$").unwrap(),
        // Los mismos prompts que src/lib/cliText.ts (lista común en scripts/tests/fixtures/prompts.json):
        // Huawei/H3C <SW>, [~SW], [*SW-GE1/0/1]; MikroTik [admin@MikroTik] >; shell RHEL
        // [user@host ~]$; Junos, PAN-OS y shells user@host>, user@host:~$; Cisco/Arista/Aruba
        // Router#, Router(config-if)#, IOS-XR RP/0/RSP0/CPU0:asr9k#, ASA ciscoasa/admin#; FortiOS fw01 #, con VDOM
        // fw01 (root) (interface) #.
        prompt: Regex::new(concat!(
            r"(?m)^<[\w.\-]+>\s*$",
            r"|^\[[\w.\-]+@[\w.\-]+\](?: /[\w/\-]*)? ?>\s*$",
            r"|^\[[\w.\-]+@[\w.\-]+(?: [^\]\n]*)?\][#$]\s*$",
            r"|^\[[~*]{0,2}[\w.\-]+(?:[^\]\w.\-\s][^\]\s]*)?\]\s*$",
            r"|^[\w.\-]+@[\w.\-]+(?::\S*)?[>#%$]\s*$",
            r"|^(?:[\w/]+:)?[\w.\-]+(?:/[\w.\-]+){0,2}(?: ?\([^()\n]*\)){0,3} ?[#>$%]\s*$",
        ))
        .unwrap(),
        // "Destination filename [ios.bin]?", "[confirm]", "Address or name of remote host []?"
        confirm: Regex::new(r"(?i)(\[confirm\]|\[[^\]\n]*\]\s*\?)\s*$").unwrap(),
        // Huawei / H3C: "(y/n)[n]:", "[Y/N]:"
        yes_no: Regex::new(r"(?i)(\(y/n\)(\[\w\])?|\[y/n\])\s*:?\s*$").unwrap(),
        // "Erase flash: before copying? [confirm]" (IOS clase B/C), "Do you want to over write? [confirm]",
        // "Delete filename [x]?", "Proceed with reload? [confirm]", VRP "Overwrite it? (y/n)[n]:" y
        // "Format flash:? (y/n)", FortiOS "...and reboot the system! Do you want to continue? (y/n)".
        destructive: Regex::new(r"(?i)\b(eras(e|ing)|format(ting)?|delet(e|ing)|over[\s-]?writ(e|ten|ing)|reload(ing)?|reboot(ing)?|squeez(e|ing)|restart(ing)?)\b").unwrap(),
        error: Regex::new(r"(?im)^\s*(%\s*error|%\s*invalid|error:|.*timed out|.*no such file|.*permission denied|.*not enough space|.*failed)").unwrap(),
    })
}

/// Ejecuta un comando en la sesión y transmite su salida. Responde Enter a
/// confirmaciones con valor por defecto, "y" a preguntas sí/no y espacio a "--More--".
/// Las preguntas destructivas (borrar, formatear, sobrescribir, reiniciar) se responden que no
/// siempre (ver `destructive_question`). Termina cuando vuelve a aparecer el prompt o vence el plazo.
/// Tope de la salida de un comando: evita agotar memoria si el equipo no deja de enviar datos.
const MAX_OUTPUT: usize = 16 * 1024 * 1024;
/// Texto final que se conserva para reconocer preguntas de confirmación.
const TAIL_KEEP: usize = 4096;
/// Tope de confirmaciones respondidas por comando (Enter, "y", "n", Ctrl+C): más es un bucle.
const MAX_CONFIRMS: u32 = 200;
/// Tope de páginas del paginador por comando. Va aparte de las confirmaciones: una salida larga
/// ("show interfaces" de un chasis, unas 4.600 líneas) pasa de 200 páginas y antes se cortaba ahí
/// con "Demasiadas confirmaciones", y lo leído se procesaba como si fuera la salida completa.
const MAX_PAGES: u32 = 5000;
pub const TOO_MANY_CONFIRMS: &str = "Demasiadas confirmaciones; se detuvo por seguridad";
pub const TOO_MANY_PAGES: &str = "Demasiadas páginas del paginador; se detuvo la lectura";

/// Qué hacer con lo último que envió el equipo.
#[derive(Debug, PartialEq)]
enum Auto {
    /// Nada que responder.
    Wait,
    /// Respuesta que se escribe en la sesión.
    Reply(&'static str),
    /// Se superó un tope: el trabajo se corta con este motivo.
    Stop(&'static str),
}

/// Respuestas automáticas de un comando, con un tope para el paginador y otro para las confirmaciones.
#[derive(Default)]
struct AutoReplies {
    pages: u32,
    confirms: u32,
    /// Pregunta del equipo respondida con "no" (con `answer = false`, o destructiva con cualquier `answer`).
    declined: Option<String>,
}

impl AutoReplies {
    /// `tail`: texto desde la última respuesta automática, sin espacios al final.
    fn next(&mut self, p: &Patterns, tail: &str, answer: bool) -> Auto {
        if p.more.is_match(tail) {
            self.pages += 1;
            return if self.pages > MAX_PAGES { Auto::Stop(TOO_MANY_PAGES) } else { Auto::Reply(" ") };
        }
        let yes_no = p.yes_no.is_match(tail);
        if !yes_no && !p.confirm.is_match(tail) {
            return Auto::Wait;
        }
        self.confirms += 1;
        if self.confirms > MAX_CONFIRMS {
            return Auto::Stop(TOO_MANY_CONFIRMS);
        }
        // "Erase flash: before copying? [confirm]" dentro de un copy borraría la imagen en uso: lo que
        // borra, formatea, sobrescribe o reinicia lo decide el usuario en la terminal, aunque `answer`.
        let answer = answer && !destructive_question(p, tail);
        if !answer {
            self.declined.get_or_insert_with(|| tail.lines().last().unwrap_or("").trim().chars().take(200).collect());
        }
        Auto::Reply(match (yes_no, answer) {
            (true, true) => "y\r",
            (true, false) => "n\r",
            (false, true) => "\r",
            (false, false) => "\x03",
        })
    }
}

/// La pregunta del equipo borra, formatea, sobrescribe o reinicia. Se miran las últimas 3 líneas
/// (FortiOS avisa el reinicio en la línea anterior a "Do you want to continue? (y/n)"), sin lo que va
/// entre corchetes (el valor por defecto) ni palabras con "/", ":" o "." en medio (rutas y nombres de
/// archivo): "Destination filename [erase-me.bin]?" o "tftp://10.0.0.5/format.cfg" no cuentan.
fn destructive_question(p: &Patterns, tail: &str) -> bool {
    tail.lines().rev().map(str::trim).filter(|l| !l.is_empty()).take(3).any(|line| {
        let mut plain = String::with_capacity(line.len());
        let mut depth = 0u32;
        for c in line.chars() {
            match c {
                '[' => depth += 1,
                ']' => depth = depth.saturating_sub(1),
                _ if depth == 0 => plain.push(c),
                _ => {}
            }
        }
        let words: Vec<&str> = plain
            .split_whitespace()
            .map(|w| w.trim_end_matches(['?', '!', ',', ';', ':', '.']))
            .filter(|w| !w.contains(['/', ':', '.', '\\']))
            .collect();
        p.destructive.is_match(&words.join(" "))
    })
}

/// Un solo comando a la vez por sesión: dos trabajos en paralelo escribirían su comando mientras el
/// otro responde "--More--" o espera el prompt, y el equipo se comería el primer carácter
/// ("how interfaces"). Los trabajos de una misma sesión se encolan; el plazo corre desde que
/// empiezan, no desde que se pidieron.
fn session_lock(conn: &str) -> Arc<Mutex<()>> {
    static LOCKS: OnceLock<Mutex<HashMap<String, Arc<Mutex<()>>>>> = OnceLock::new();
    let mut map = LOCKS.get_or_init(Default::default).lock().unwrap_or_else(|e| e.into_inner());
    // Sesiones cerradas: solo quedan las entradas que alguien usa.
    if map.len() > 64 {
        map.retain(|_, l| Arc::strong_count(l) > 1);
    }
    map.entry(conn.to_string()).or_default().clone()
}

/// Aviso al frontend mientras un trabajo espera el turno de su sesión (evento "wait").
pub const WAIT_TURN: &str = "Esperando turno: la sesión está ocupada con otro trabajo (respaldo, transferencia o lectura)";
/// El turno no llegó dentro del plazo del trabajo: se cancela sin enviar nada al equipo.
pub const TURN_TIMEOUT: &str = "La sesión siguió ocupada con otro trabajo (respaldo, transferencia o lectura) durante todo el plazo: no se envió el comando. Reintenta cuando termine";

/// Toma el turno de la sesión esperando como máximo `max`. Si está ocupada llama a `waiting` una
/// vez (para avisar "esperando turno") y sigue intentando; pasado el plazo devuelve None. Antes un
/// trabajo corto (descubrimiento, tráfico) quedaba en silencio detrás de uno de hasta 2 h.
fn take_turn<'a>(lock: &'a Mutex<()>, max: Duration, mut waiting: impl FnMut()) -> Option<std::sync::MutexGuard<'a, ()>> {
    let start = Instant::now();
    let mut told = false;
    loop {
        match lock.try_lock() {
            Ok(g) => return Some(g),
            Err(std::sync::TryLockError::Poisoned(e)) => return Some(e.into_inner()),
            Err(std::sync::TryLockError::WouldBlock) => {}
        }
        if !told {
            told = true;
            waiting();
        }
        if start.elapsed() >= max {
            return None;
        }
        std::thread::sleep(Duration::from_millis(100).min(max.saturating_sub(start.elapsed()).max(Duration::from_millis(1))));
    }
}

/// `answer = false`: no confirma nada; ante una pregunta responde que no (Ctrl+C en "[confirm]"),
/// espera el prompt y lo informa en el resultado (`declined`). Con `answer = true` pasa lo mismo con
/// las preguntas destructivas (`destructive_question`): quien llama muestra `declined`.
/// `lines = false`: sin eventos "line" (quien llama solo usa "result"); el resto de los eventos no cambia.
pub fn run(app: AppHandle, conn: String, command: String, timeout_secs: u64, answer: bool, lines: bool) -> Result<String, String> {
    if command.contains(['\r', '\n']) {
        return Err("Un solo comando por operación".into());
    }
    let state = app.state::<crate::AppState>();
    state.conns.info(&conn).ok_or("La sesión no está conectada")?;
    // Solo lectura: se rechaza de inmediato (la escritura también lo vigila, ver ConnectionManager::set_read_only).
    if state.conns.is_read_only(&conn) {
        return Err(crate::connection::READ_ONLY.into());
    }
    let job = uuid::Uuid::new_v4().to_string();
    let id = job.clone();
    let deadline = Duration::from_secs(timeout_secs.clamp(5, 7200));

    std::thread::spawn(move || {
        let emit = |kind: &'static str, text: String, data: Option<serde_json::Value>| {
            let _ = app.emit("tool-job", JobEvent { job: id.clone(), kind, text, data });
        };
        let conns = &app.state::<crate::AppState>().conns;
        let r = run_core(conns, &conn, &command, deadline, answer, lines, &emit);
        if r.ran {
            emit("result", String::new(), Some(json!({ "ok": r.ok, "output": r.output, "declined": r.declined })));
        }
        emit("done", String::new(), None);
    });
    Ok(job)
}

/// Resultado de un comando ejecutado con `run_core`.
pub struct RunOutcome {
    /// Todo lo recibido (eco, salida y prompt final).
    pub output: String,
    /// Sin errores reconocidos en la salida ni preguntas rechazadas.
    pub ok: bool,
    /// Pregunta del equipo respondida con "no" (con `answer = false`, o destructiva con cualquier `answer`).
    pub declined: Option<String>,
    /// Por qué se cortó (plazo, sesión cerrada, tope de salida, solo lectura).
    pub error: Option<String>,
    /// El comando llegó a enviarse.
    pub ran: bool,
}

impl RunOutcome {
    fn failed(e: String) -> Self {
        RunOutcome { output: String::new(), ok: false, declined: None, error: Some(e), ran: false }
    }
}

/// Versión bloqueante de `run` (servidor MCP): misma cola por sesión, paginación, plazo y
/// respuestas automáticas. Devuelve cuando vuelve el prompt, vence el plazo o la sesión se cierra.
pub fn run_blocking(conns: &crate::connection::ConnectionManager, conn: &str, command: &str, timeout: Duration, answer: bool) -> Result<RunOutcome, String> {
    if command.contains(['\r', '\n']) {
        return Err("Un solo comando por operación".into());
    }
    conns.info(conn).ok_or("La sesión no está conectada")?;
    if conns.is_read_only(conn) {
        return Err(crate::connection::READ_ONLY.into());
    }
    // Sin interfaz que muestre líneas: no se arman (el emisor las descartaba igual).
    Ok(run_core(conns, conn, command, timeout, answer, false, &|_, _, _| {}))
}

type Emit<'a> = &'a dyn Fn(&'static str, String, Option<serde_json::Value>);

/// Envía a `emit` las líneas completas de `partial` (sin las vacías) y las quita de una vez; con `all`
/// también el resto sin salto de línea (prompts, preguntas de confirmación).
fn flush_lines(partial: &mut String, all: bool, emit: Emit) {
    let mut done = 0;
    while let Some(i) = partial[done..].find('\n') {
        let line = partial[done..done + i].trim_end();
        if !line.is_empty() {
            emit("line", line.to_string(), None);
        }
        done += i + 1;
    }
    // Un solo drain por bloque: antes cada línea corría el resto del búfer.
    partial.drain(..done);
    if all && !partial.trim().is_empty() {
        emit("line", partial.trim_end().to_string(), None);
        partial.clear();
    }
}

/// `lines = false`: no se arman ni se emiten los eventos "line" (`partial` solo los alimenta).
fn run_core(conns: &crate::connection::ConnectionManager, conn: &str, command: &str, deadline: Duration, answer: bool, lines: bool, emit: Emit) -> RunOutcome {
    {
        let p = patterns();
        let lock = session_lock(conn);
        // El plazo de espera del turno es el mismo del trabajo: un descubrimiento de 60 s no espera 2 h.
        let Some(_turn) = take_turn(&lock, deadline, || emit("wait", WAIT_TURN.into(), None)) else {
            emit("error", TURN_TIMEOUT.into(), None);
            return RunOutcome::failed(TURN_TIMEOUT.into());
        };
        // La suscripción se toma recién al tocar el turno: antes acumularía la salida del trabajo anterior.
        let Some(rx) = conns.tap(conn) else {
            emit("error", "La sesión no está conectada".into(), None);
            return RunOutcome::failed("La sesión no está conectada".into());
        };
        expect::drain(&rx);
        if let Err(e) = conns.write(conn, format!("{command}\r").as_bytes()) {
            emit("error", e.clone(), None);
            return RunOutcome::failed(e);
        }
        let mut error: Option<String> = None;
        let fail = |error: &mut Option<String>, e: String| {
            emit("error", e.clone(), None);
            *error = Some(e);
        };
        let start = Instant::now();
        let mut output = String::new();
        let mut tail = String::new(); // texto desde la última respuesta automática
        let mut auto = AutoReplies::default();
        let mut echo = EchoScan::default();
        // Líneas completas hacia la interfaz: un fragmento puede cortar una línea a la mitad.
        let mut partial = String::new();
        let flush = |partial: &mut String, all: bool| {
            if lines {
                flush_lines(partial, all, emit);
            }
        };
        loop {
            if start.elapsed() > deadline {
                flush(&mut partial, true);
                leave_pager(conns, conn, p, &tail);
                fail(&mut error, "Tiempo agotado esperando al equipo".into());
                break;
            }
            let chunk = match rx.recv_timeout(Duration::from_millis(500)) {
                Ok(c) => c,
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                    flush(&mut partial, true);
                    continue;
                }
                // La sesión se cerró: sin esto el hilo giraba hasta el plazo con el turno tomado y
                // bloqueaba los siguientes trabajos de la pestaña al reconectar.
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                    flush(&mut partial, true);
                    fail(&mut error, "La sesión se cerró".into());
                    break;
                }
            };
            if output.len() + chunk.len() > MAX_OUTPUT {
                flush(&mut partial, true);
                leave_pager(conns, conn, p, &tail);
                fail(&mut error, "La salida del equipo superó el máximo permitido; se detuvo la lectura".into());
                break;
            }
            output.push_str(&chunk);
            tail.push_str(&chunk);
            // Las preguntas del equipo están al final: basta con lo último, sin releer todo en cada bloque.
            if tail.len() > TAIL_KEEP * 2 {
                let mut cut = tail.len() - TAIL_KEEP;
                while !tail.is_char_boundary(cut) {
                    cut += 1;
                }
                tail.drain(..cut);
            }
            if lines {
                partial.push_str(&chunk);
            }
            flush(&mut partial, false);
            match auto.next(p, tail.trim_end_matches([' ', '\t']), answer) {
                Auto::Wait => {}
                Auto::Stop(why) => {
                    flush(&mut partial, true);
                    leave_pager(conns, conn, p, &tail);
                    fail(&mut error, why.into());
                    break;
                }
                Auto::Reply(r) => {
                    // Si la pestaña pasó a solo lectura con el trabajo en curso, se detiene en esta escritura.
                    if let Err(e) = conns.write(conn, r.as_bytes()) {
                        flush(&mut partial, true);
                        fail(&mut error, format!("{e}. Se detuvo el trabajo"));
                        break;
                    }
                    tail.clear();
                    continue;
                }
            }
            if echo.finished(p, &output, command.trim()) {
                break;
            }
        }
        flush(&mut partial, true);
        let declined = auto.declined;
        let failed = p.error.is_match(&output) || declined.is_some();
        RunOutcome { output, ok: !failed, declined, error, ran: true }
    }
}

/// La línea es un prompt de equipo (misma lista que src/lib/cliText.ts).
pub fn is_prompt(line: &str) -> bool {
    patterns().prompt.is_match(line)
}

/// Si el trabajo se corta con el equipo esperando en "--More--", la sesión queda en el paginador y se
/// comería el primer carácter del comando siguiente: "q" lo cierra (IOS, NX-OS, VRP, Junos).
fn leave_pager(conns: &crate::connection::ConnectionManager, conn: &str, p: &Patterns, tail: &str) {
    if p.more.is_match(tail.trim_end_matches([' ', '\t'])) {
        let _ = conns.write(conn, b"q");
    }
}

/// El comando terminó si, después de su eco, la última línea es un prompt del equipo.
/// Si el eco no aparece tal cual (líneas largas que el equipo recorta), se usa toda la
/// salida, exigiendo al menos un salto de línea.
#[cfg(test)]
fn finished(p: &Patterns, output: &str, command: &str) -> bool {
    EchoScan::default().finished(p, output, command)
}

/// Recuerda dónde terminó el eco del comando (o hasta dónde ya se buscó): la salida solo
/// crece, así que no se vuelve a recorrer completa con cada fragmento.
#[derive(Default)]
struct EchoScan {
    end: Option<usize>,
    searched: usize,
}

impl EchoScan {
    fn finished(&mut self, p: &Patterns, output: &str, command: &str) -> bool {
        if self.end.is_none() {
            // El eco puede haber quedado partido entre el fragmento anterior y este.
            let mut from = self.searched.saturating_sub(command.len());
            while !output.is_char_boundary(from) {
                from -= 1;
            }
            self.end = output[from..].find(command).map(|i| from + i + command.len());
            self.searched = output.len();
        }
        ends_at_prompt(p, &output[self.end.unwrap_or(0)..])
    }
}

/// Hay al menos un salto de línea y la última línea es un prompt del equipo.
fn ends_at_prompt(p: &Patterns, after: &str) -> bool {
    if !after.contains('\n') {
        return false;
    }
    let last = after.trim_end_matches([' ', '\t']).rsplit('\n').next().unwrap_or("");
    p.prompt.is_match(last)
}

/// Fin de un envío de varias líneas (`send_command` del servidor MCP), con la misma regla que
/// `run`: los ecos de todas las líneas aparecen en orden y, tras el último, la última línea es un
/// prompt. Sin eco reconocible (líneas que el equipo recorta, sesiones sin eco) no se da por
/// terminado y quien llama sigue esperando el silencio, como antes.
pub fn lines_finished(output: &str, lines: &[&str]) -> bool {
    let p = patterns();
    // Lo barato primero: casi siempre el final todavía no es un prompt.
    if !ends_at_prompt(p, output) {
        return false;
    }
    let mut pos = 0;
    for l in lines.iter().map(|l| l.trim()).filter(|l| !l.is_empty()) {
        match output[pos..].find(l) {
            Some(i) => pos += i + l.len(),
            None => return false,
        }
    }
    pos > 0 && ends_at_prompt(p, &output[pos..])
}

/// IP local que el sistema usaría para llegar a `host` (la que el equipo debe usar
/// para descargar desde este PC). No envía tráfico: solo consulta la tabla de rutas.
pub fn source_ip_for(host: &str) -> Result<String, String> {
    crate::monitor::validate_host(host)?;
    let addr = (host.trim_matches(['[', ']']), 9)
        .to_socket_addrs()
        .map_err(|e| e.to_string())?
        .find(|a| a.is_ipv4())
        .ok_or("El host no tiene dirección IPv4")?;
    crate::nettools::route_source(addr).ok_or_else(|| "Sin ruta hacia el equipo".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn jobs_of_one_session_share_a_turn() {
        let a = session_lock("conn-a");
        assert!(Arc::ptr_eq(&a, &session_lock("conn-a")), "misma sesión, mismo turno");
        assert!(!Arc::ptr_eq(&a, &session_lock("conn-b")), "otra sesión no espera");
        let _held = a.lock().unwrap();
        assert!(session_lock("conn-a").try_lock().is_err(), "un segundo trabajo espera su turno");
        assert!(session_lock("conn-b").try_lock().is_ok());
    }

    #[test]
    fn busy_session_waits_with_notice_and_gives_up_at_the_deadline() {
        let lock = Mutex::new(());
        // Libre: sin aviso.
        let mut told = 0;
        assert!(take_turn(&lock, Duration::from_millis(50), || told += 1).is_some());
        assert_eq!(told, 0);
        // Ocupada todo el plazo: un aviso y se rinde.
        let held = lock.lock().unwrap();
        let t = Instant::now();
        let mut told = 0;
        assert!(take_turn(&lock, Duration::from_millis(250), || told += 1).is_none());
        assert_eq!(told, 1, "se avisa una sola vez");
        assert!(t.elapsed() >= Duration::from_millis(250) && t.elapsed() < Duration::from_secs(2));
        drop(held);
        // Se libera durante la espera: toma el turno.
        let lock = Arc::new(Mutex::new(()));
        let held = lock.clone();
        let (tx, rx) = std::sync::mpsc::channel();
        let h = std::thread::spawn(move || {
            let _g = held.lock().unwrap();
            tx.send(()).unwrap();
            std::thread::sleep(Duration::from_millis(200));
        });
        rx.recv().unwrap();
        let mut told = 0;
        assert!(take_turn(&lock, Duration::from_secs(5), || told += 1).is_some());
        assert_eq!(told, 1);
        h.join().unwrap();
    }

    #[test]
    fn recognizes_prompts_and_confirmations() {
        let p = patterns();
        assert!(p.confirm.is_match("Destination filename [c2960.bin]?"));
        assert!(p.confirm.is_match("Do you want to over write? [confirm]"));
        assert!(p.confirm.is_match("Address or name of remote host [10.0.0.5]? "));
        assert!(!p.confirm.is_match("copy tftp://10.0.0.5/a.bin flash:"));
        assert!(p.yes_no.is_match("Are you sure to download file? (y/n)[n]:"));
        assert!(p.more.is_match(" --More-- "));
        assert!(p.more.is_match("  ---- More ----"));
        // Junos, sin y con porcentaje: antes ninguno calzaba y el trabajo esperaba el plazo completo.
        assert!(p.more.is_match("---(more)---"));
        assert!(p.more.is_match("---(more 45%)---"));
        assert!(p.more.is_match("ge-0/0/1  up  up\n---(more 100%)---"));
        assert!(!p.more.is_match("Learn more -- see the documentation"));
        assert!(!p.more.is_match("---(more 45%)--- ge-0/0/2 up up"), "con texto después ya no es el paginador en espera");
        for prompt in ["Router#", "SW-CORE(config)#", "<HUAWEI>", "[HUAWEI]", "noc@mx01>", "fw01 #"] {
            assert!(p.prompt.is_match(prompt), "{prompt}");
        }
        assert!(!p.prompt.is_match("Accessing tftp://10.0.0.5/ios.bin..."));
        // Lista común con src/lib/cliText.ts.
        let fx: serde_json::Value = serde_json::from_str(include_str!("../../scripts/tests/fixtures/prompts.json")).unwrap();
        for pair in fx["prompts"].as_array().unwrap() {
            let line = pair[0].as_str().unwrap();
            assert!(p.prompt.is_match(line), "debería ser prompt: {line:?}");
        }
        for line in fx["not_prompts"].as_array().unwrap() {
            let line = line.as_str().unwrap();
            assert!(!p.prompt.is_match(line), "no es prompt: {line:?}");
        }
        assert!(p.error.is_match("%Error opening tftp://10.0.0.5/x.bin (Timed out)"));
        assert!(!p.error.is_match("[OK - 33591768 bytes]"));
    }

    #[test]
    fn pager_pages_do_not_count_as_confirmations() {
        let p = patterns();
        // 201 páginas (unas 4.600 líneas): todas se avanzan; antes la 201 cortaba con "Demasiadas confirmaciones".
        let mut auto = AutoReplies::default();
        for i in 0..201 {
            let tail = if i % 2 == 0 { "Gi1/0/1 is up\n --More-- " } else { "ge-0/0/1 up up\n---(more 45%)---" };
            assert_eq!(auto.next(p, tail.trim_end_matches([' ', '\t']), true), Auto::Reply(" "), "página {i}");
        }
        assert_eq!((auto.pages, auto.confirms), (201, 0));
        // Las confirmaciones conservan su tope, aunque haya páginas entre medio.
        for _ in 0..MAX_CONFIRMS {
            assert_eq!(auto.next(p, "Destination filename [a.bin]?", true), Auto::Reply("\r"));
        }
        assert_eq!(auto.next(p, "  ---- More ----", true), Auto::Reply(" "));
        assert_eq!(auto.next(p, "Destination filename [a.bin]?", true), Auto::Stop(TOO_MANY_CONFIRMS));
        // El paginador también tiene tope: un equipo que repite "--More--" sin fin no ocupa la sesión.
        let mut auto = AutoReplies::default();
        for _ in 0..MAX_PAGES {
            assert_eq!(auto.next(p, " --More--", true), Auto::Reply(" "));
        }
        assert_eq!(auto.next(p, " --More--", true), Auto::Stop(TOO_MANY_PAGES));
        // Sin nada que responder, y sin confirmar cuando `answer` es false (queda la primera pregunta).
        let mut auto = AutoReplies::default();
        assert_eq!(auto.next(p, "Router#show clock\n10:00", false), Auto::Wait);
        assert_eq!(auto.next(p, "Are you sure to download file? (y/n)[n]:", false), Auto::Reply("n\r"));
        assert_eq!(auto.next(p, "Proceed with reload? [confirm]", false), Auto::Reply("\x03"));
        assert_eq!(auto.declined.as_deref(), Some("Are you sure to download file? (y/n)[n]:"));
        assert_eq!(AutoReplies::default().next(p, "Copy flash:/a.cfg to flash:/b.cfg? (y/n)[n]:", true), Auto::Reply("y\r"));
    }

    #[test]
    fn destructive_questions_are_declined_even_when_answering() {
        let p = patterns();
        // Borrar, formatear, sobrescribir o reiniciar: "no" (Ctrl+C o "n") y queda en `declined`.
        for (tail, reply) in [
            ("Loading c2960.bin from 10.0.0.5 (via Vlan1): !!!\nErase flash: before copying? [confirm]", "\x03"),
            ("%Warning:There is a file already existing with this name\nDo you want to over write? [confirm]", "\x03"),
            ("Delete filename [old.bin]?", "\x03"),
            ("Proceed with reload? [confirm]", "\x03"),
            ("Info: The file flash:/b.cfg exists. Overwrite it? (y/n)[n]:", "n\r"),
            ("All data will be lost. Format flash:? (y/n)[n]:", "n\r"),
            ("This operation will replace the current firmware version and reboot the system!\nDo you want to continue? (y/n)", "n\r"),
            ("Squeeze operation may take a while. Continue? [confirm]", "\x03"),
        ] {
            let mut auto = AutoReplies::default();
            assert_eq!(auto.next(p, tail, true), Auto::Reply(reply), "{tail}");
            assert_eq!(auto.declined.as_deref(), Some(tail.lines().last().unwrap()), "{tail}");
        }
        // Nombres de archivo, rutas y valores por defecto con esas palabras no cuentan.
        for tail in [
            "Destination filename [erase-me.bin]?",
            "Accessing tftp://10.0.0.5/format.cfg...\nDestination filename [format.cfg]?",
            "Address or name of remote host [10.0.0.5]?",
            "Destination filename [startup-config]?",
        ] {
            let mut auto = AutoReplies::default();
            assert_eq!(auto.next(p, tail, true), Auto::Reply("\r"), "{tail}");
            assert_eq!(auto.declined, None, "{tail}");
        }
    }

    #[test]
    fn detects_command_completion() {
        let p = patterns();
        let cmd = "dir flash:";
        assert!(!finished(p, "Router#dir flash:", cmd));
        assert!(!finished(p, "Router#dir flash:\nDirectory of flash:/\n  1  -rw-  33591768  ios.bin", cmd));
        assert!(finished(p, "Router#dir flash:\nDirectory of flash:/\n  1  -rw- 1 a.bin\nRouter#", cmd));
        assert!(finished(p, "<HUAWEI>dir\n  0  -rw-  1  x.cc\n<HUAWEI>", "dir"));
        // Incremental: eco partido entre fragmentos y salida que llega por partes.
        let mut e = EchoScan::default();
        let mut out = String::from("Router#dir fl");
        assert!(!e.finished(p, &out, cmd));
        out.push_str("ash:\nDirectory of flash:/\n");
        assert!(!e.finished(p, &out, cmd));
        out.push_str("  1  -rw- 1 a.bin\nRouter#");
        assert!(e.finished(p, &out, cmd));
    }

    #[test]
    fn lines_finished_needs_every_echo_in_order_and_a_final_prompt() {
        assert!(lines_finished("R1#show clock\r\n*10:00 UTC\r\nR1#", &["show clock"]));
        assert!(!lines_finished("R1#show clock\r\n*10:00 UTC\r\n", &["show clock"]));
        assert!(!lines_finished("R1#show clock", &["show clock"]), "solo el eco");
        // Paginador o pregunta del equipo: no es fin (se espera el silencio, como antes).
        assert!(!lines_finished("R1#show run\r\nhostname R1\r\n --More-- ", &["show run"]));
        assert!(!lines_finished("R1#reload\r\nProceed with reload? [confirm]", &["reload"]));
        // Varias líneas iguales: hace falta el eco de cada una.
        let two = ["show clock", "show clock"];
        assert!(!lines_finished("R1#show clock\r\n10:00\r\nR1#", &two));
        assert!(lines_finished("R1#show clock\r\n10:00\r\nR1#show clock\r\n10:01\r\nR1#", &two));
        assert!(lines_finished("sw01#conf t\r\nsw01(config)#interface Gi1/0/1\r\nsw01(config-if)#", &["conf t", "interface Gi1/0/1"]));
        // Sin eco reconocible: no se adivina.
        assert!(!lines_finished("R1#\r\nR1#", &["show clock"]));
        assert!(!lines_finished("\r\nR1#", &[]));
    }

    #[test]
    fn source_ip_uses_routing_table() {
        assert_eq!(source_ip_for("127.0.0.1").unwrap(), "127.0.0.1");
        assert!(source_ip_for("-x").is_err());
    }

    /// `flush_lines` (un solo drain por bloque) emite exactamente lo mismo que la versión anterior
    /// (un drain por línea), con bloques que cortan líneas, CRLF, líneas vacías y texto multibyte.
    #[test]
    fn flush_lines_matches_the_line_by_line_version() {
        fn before(partial: &mut String, all: bool, out: &mut Vec<String>) {
            while let Some(i) = partial.find('\n') {
                let line = partial[..i].trim_end().to_string();
                partial.drain(..=i);
                if !line.is_empty() {
                    out.push(line);
                }
            }
            if all && !partial.trim().is_empty() {
                out.push(partial.trim_end().to_string());
                partial.clear();
            }
        }
        let text = "show ver\r\nCisco IOS  \r\n\r\n\nuptime año ñandú\n  \n --More-- \rsw1#\nconfirm [y/n] ";
        for size in [1, 2, 3, 5, 7, 16, 64, text.len()] {
            let (mut a, mut b) = (String::new(), String::new());
            let (mut out_a, mut out_b) = (Vec::new(), Vec::new());
            let chars: Vec<char> = text.chars().collect();
            for (k, chunk) in chars.chunks(size).enumerate() {
                let chunk: String = chunk.iter().collect();
                a.push_str(&chunk);
                b.push_str(&chunk);
                let all = k % 3 == 2; // pausas intermedias (recv_timeout) también
                before(&mut a, all, &mut out_a);
                let got = std::cell::RefCell::new(Vec::new());
                flush_lines(&mut b, all, &|kind, line, data| {
                    assert_eq!((kind, data), ("line", None));
                    got.borrow_mut().push(line);
                });
                out_b.extend(got.into_inner());
                assert_eq!(a, b, "mismo resto pendiente (bloques de {size})");
            }
            before(&mut a, true, &mut out_a);
            let got = std::cell::RefCell::new(Vec::new());
            flush_lines(&mut b, true, &|_, line, _| got.borrow_mut().push(line));
            out_b.extend(got.into_inner());
            assert_eq!(out_a, out_b, "mismas líneas (bloques de {size})");
            assert_eq!(a, b, "mismo resto (solo espacios) al final");
        }
    }
}
