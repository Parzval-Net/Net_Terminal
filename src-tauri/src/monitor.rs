//! Sondas de disponibilidad: ICMP (ping del sistema, sin privilegios) o TCP (acceso a
//! un puerto, p. ej. 22/23/443). Emiten una muestra por intervalo al frontend, que
//! calcula estado, pérdida, jitter y alarmas.

use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::net::{TcpStream, ToSocketAddrs};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

#[derive(Deserialize, Clone)]
pub struct ProbeConfig {
    pub id: String,
    pub kind: String, // "icmp" | "tcp"
    pub host: String,
    pub port: Option<u16>,
    pub interval_ms: u64,
    pub timeout_ms: u64,
}

#[derive(Serialize, Clone)]
pub struct Sample {
    pub id: String,
    pub ts: i64,
    pub ok: bool,
    pub rtt: Option<f64>,
    pub error: Option<String>,
}

#[derive(Default)]
pub struct Monitor {
    running: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

impl Monitor {
    pub fn start(&self, app: AppHandle, cfg: ProbeConfig) -> Result<(), String> {
        validate_host(&cfg.host)?;
        if cfg.kind == "tcp" && cfg.port.is_none() {
            return Err("La sonda TCP requiere puerto".into());
        }
        self.stop(&cfg.id);
        let flag = Arc::new(AtomicBool::new(true));
        self.running.lock().unwrap().insert(cfg.id.clone(), flag.clone());
        std::thread::spawn(move || {
            let interval = Duration::from_millis(cfg.interval_ms.clamp(200, 3_600_000));
            while flag.load(Ordering::SeqCst) {
                let start = Instant::now();
                let (ok, rtt, error) = probe(&cfg);
                if !flag.load(Ordering::SeqCst) {
                    break;
                }
                let _ = app.emit(
                    "monitor-sample",
                    Sample { id: cfg.id.clone(), ts: chrono::Utc::now().timestamp_millis(), ok, rtt, error },
                );
                // Duerme el resto del intervalo en tramos cortos para detenerse rápido.
                while start.elapsed() < interval && flag.load(Ordering::SeqCst) {
                    std::thread::sleep(Duration::from_millis(100).min(interval.saturating_sub(start.elapsed())));
                }
            }
        });
        Ok(())
    }

    pub fn stop(&self, id: &str) {
        if let Some(flag) = self.running.lock().unwrap().remove(id) {
            flag.store(false, Ordering::SeqCst);
        }
    }

    pub fn running(&self) -> Vec<String> {
        self.running.lock().unwrap().keys().cloned().collect()
    }
}

/// Host seguro para pasarlo a comandos del sistema: sin espacios ni "-" inicial.
/// Los corchetes solo se aceptan envolviendo el host completo (IPv6): ping los quita y
/// "[-f]" llegaría como opción.
pub fn validate_host(host: &str) -> Result<(), String> {
    let h = host.trim();
    let inner = h.strip_prefix('[').and_then(|x| x.strip_suffix(']')).unwrap_or(h);
    let ok = !inner.is_empty()
        && h.len() <= 253
        && !inner.starts_with('-')
        && inner.chars().all(|c| c.is_ascii_alphanumeric() || ".-:_%".contains(c));
    if ok {
        Ok(())
    } else {
        Err(format!("Host inválido: {host}"))
    }
}

pub fn probe(cfg: &ProbeConfig) -> (bool, Option<f64>, Option<String>) {
    let timeout = Duration::from_millis(cfg.timeout_ms.clamp(100, 30_000));
    if cfg.kind == "tcp" {
        tcp_probe(cfg.host.trim(), cfg.port.unwrap_or(22), timeout)
    } else {
        icmp_probe(cfg.host.trim(), timeout)
    }
}

pub fn tcp_probe(host: &str, port: u16, timeout: Duration) -> (bool, Option<f64>, Option<String>) {
    match resolve(host, port) {
        Ok(addrs) => tcp_probe_addrs(&addrs, timeout),
        Err(e) => (false, None, Some(e)),
    }
}

/// Direcciones del host (acepta IPv6 entre corchetes). El error ya viene con el prefijo "DNS:".
pub fn resolve(host: &str, port: u16) -> Result<Vec<std::net::SocketAddr>, String> {
    let host = host.trim_matches(|c| c == '[' || c == ']');
    (host, port).to_socket_addrs().map(Iterator::collect).map_err(|e| format!("DNS: {e}"))
}

/// Conecta a la primera dirección que responda.
pub fn tcp_probe_addrs(addrs: &[std::net::SocketAddr], timeout: Duration) -> (bool, Option<f64>, Option<String>) {
    let mut last = String::from("sin dirección");
    for addr in addrs {
        let t0 = Instant::now();
        match TcpStream::connect_timeout(addr, timeout) {
            Ok(_) => return (true, Some(t0.elapsed().as_secs_f64() * 1000.0), None),
            Err(e) => last = e.to_string(),
        }
    }
    (false, None, Some(last))
}

/// Comando del sistema sin ventana de consola en Windows.
pub fn command(bin: &str) -> Command {
    #[allow(unused_mut)]
    let mut c = Command::new(bin);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x0800_0000);
    }
    #[cfg(not(windows))]
    c.env("LC_ALL", "C");
    c
}

fn icmp_probe(host: &str, timeout: Duration) -> (bool, Option<f64>, Option<String>) {
    let ms = timeout.as_millis().max(100);
    let v6 = host.contains(':');
    let mut cmd = if cfg!(windows) {
        let mut c = command("ping");
        c.args(["-n", "1", "-w", &ms.to_string()]);
        c
    } else if cfg!(target_os = "macos") {
        // ping6 de macOS no acepta -W; el tiempo lo limita el propio ping con -c 1.
        let mut c = command(if v6 { "ping6" } else { "ping" });
        c.args(["-c", "1"]);
        if !v6 {
            c.args(["-W", &ms.to_string()]);
        }
        c
    } else {
        let mut c = command("ping");
        c.args(["-c", "1", "-W", &ms.div_ceil(1000).to_string()]);
        c
    };
    // "[2001:db8::1]" es válido como host, pero ping no acepta los corchetes.
    cmd.arg(host.trim_matches(|c| c == '[' || c == ']'));
    let t0 = Instant::now();
    let out = match cmd.output() {
        Ok(o) => o,
        Err(e) => return (false, None, Some(format!("No se pudo ejecutar ping: {e}"))),
    };
    let wall = t0.elapsed().as_secs_f64() * 1000.0;
    let text = String::from_utf8_lossy(&out.stdout).to_string() + &String::from_utf8_lossy(&out.stderr);
    parse_ping(out.status.success(), &text, wall)
}

/// Interpreta la salida de ping en cualquier idioma. "TTL=" aparece en todas las
/// localizaciones y distingue una respuesta real de "host inaccesible" (Windows
/// devuelve código 0 aunque el gateway responda que el destino no es alcanzable).
pub fn parse_ping(success: bool, text: &str, wall_ms: f64) -> (bool, Option<f64>, Option<String>) {
    static RTT: OnceLock<Regex> = OnceLock::new();
    let lower = text.to_lowercase();
    let replied = success && (lower.contains("ttl=") || lower.contains("hlim="));
    if !replied {
        let reason = text
            .lines()
            .map(str::trim)
            .find(|l| {
                let l = l.to_lowercase();
                ["timeout", "timed out", "tiempo de espera", "unreachable", "inaccesible", "no se pudo", "unknown host", "cannot resolve", "could not find", "100% packet loss", "100% perdidos"]
                    .iter()
                    .any(|k| l.contains(k))
            })
            .unwrap_or("Sin respuesta")
            .to_string();
        return (false, None, Some(reason));
    }
    let re = RTT.get_or_init(|| Regex::new(r"(?i)(?:time|tiempo|zeit|temps|tempo|durée)\s*[=<]\s*([\d.,]+)\s*ms").unwrap());
    let rtt = re
        .captures(text)
        .and_then(|c| c[1].replace(',', ".").parse::<f64>().ok())
        .unwrap_or(wall_ms);
    (true, Some(rtt), None)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_ping_in_several_languages() {
        let mac = "64 bytes from 1.1.1.1: icmp_seq=0 ttl=57 time=12.345 ms";
        assert_eq!(parse_ping(true, mac, 50.0), (true, Some(12.345), None));
        let win_es = "Respuesta desde 8.8.8.8: bytes=32 tiempo=14ms TTL=117";
        assert_eq!(parse_ping(true, win_es, 50.0).1, Some(14.0));
        let win_lt = "Reply from 10.0.0.1: bytes=32 time<1ms TTL=64";
        assert_eq!(parse_ping(true, win_lt, 50.0).1, Some(1.0));
        // Windows: código 0 pero el gateway informa inaccesible -> caído
        let unreach = "Respuesta desde 10.0.0.254: Host de destino inaccesible.";
        let r = parse_ping(true, unreach, 5.0);
        assert!(!r.0 && r.2.unwrap().contains("inaccesible"));
        let timeout = "Request timeout for icmp_seq 0\n--- 10.9.9.9 ping statistics ---\n1 packets transmitted, 0 packets received, 100.0% packet loss";
        assert!(!parse_ping(false, timeout, 1000.0).0);
    }

    fn up(text: &str) -> Option<f64> {
        let r = parse_ping(true, text, 777.0);
        assert!(r.0 && r.2.is_none(), "{text:?} -> {r:?}");
        r.1
    }

    fn down(success: bool, text: &str) -> String {
        let r = parse_ping(success, text, 777.0);
        assert!(!r.0 && r.1.is_none(), "{text:?} -> {r:?}");
        r.2.unwrap()
    }

    #[test]
    fn ping_windows_english_and_spanish() {
        assert_eq!(up("Reply from 192.0.2.1: bytes=32 time=14ms TTL=117"), Some(14.0));
        assert_eq!(up("Reply from 192.0.2.1: bytes=32 time<1ms TTL=64"), Some(1.0));
        assert_eq!(up("Respuesta desde 192.0.2.1: bytes=32 tiempo=3ms TTL=64"), Some(3.0));
        // Ping completo de Windows con estadísticas: toma el tiempo de la respuesta, no del resumen.
        let full = "Pinging 192.0.2.1 with 32 bytes of data:\r\nReply from 192.0.2.1: bytes=32 time=21ms TTL=58\r\n\r\nPing statistics for 192.0.2.1:\r\n    Packets: Sent = 1, Received = 1, Lost = 0 (0% loss),\r\nApproximate round trip times in milli-seconds:\r\n    Minimum = 21ms, Maximum = 21ms, Average = 21ms\r\n";
        assert_eq!(up(full), Some(21.0));
        // Windows devuelve código 0 aunque el destino sea inaccesible o el TTL expire en tránsito.
        assert!(down(true, "Reply from 192.0.2.254: Destination host unreachable.").contains("unreachable"));
        assert!(down(true, "Reply from 192.0.2.254: Destination net unreachable.").contains("unreachable"));
        down(true, "Reply from 198.51.100.1: TTL expired in transit.");
        assert!(down(true, "Respuesta desde 192.0.2.254: Host de destino inaccesible.").contains("inaccesible"));
    }

    #[test]
    fn ping_windows_timeouts_and_resolution_errors() {
        assert!(down(false, "Pinging 192.0.2.9 with 32 bytes of data:\r\nRequest timed out.\r\n").contains("timed out"));
        assert!(down(false, "Haciendo ping a 192.0.2.9 con 32 bytes de datos:\r\nTiempo de espera agotado para esta solicitud.\r\n").contains("Tiempo de espera"));
        assert!(down(false, "Ping request could not find host nohost.example. Please check the name and try again.").contains("could not find"));
        assert!(down(false, "Error en la transmisión. Error de hardware o de GENERAL FAILURE.\r\nNo se pudo encontrar el host").contains("No se pudo"));
        // Idiomas sin palabra clave: motivo genérico, y sigue contando como caído.
        assert_eq!(down(false, "Zeitüberschreitung der Anforderung."), "Sin respuesta");
        // Un "TTL=" con código de salida distinto de 0 no cuenta como respuesta.
        down(false, "Reply from 192.0.2.1: bytes=32 time=1ms TTL=64");
    }

    #[test]
    fn ping_other_locales_rtt() {
        assert_eq!(up("Antwort von 192.0.2.1: Bytes=32 Zeit=15ms TTL=64"), Some(15.0));
        assert_eq!(up("Antwort von 192.0.2.1: Bytes=32 Zeit<1ms TTL=64"), Some(1.0));
        assert_eq!(up("Réponse de 192.0.2.1 : octets=32 temps=9 ms TTL=64"), Some(9.0));
        assert_eq!(up("Resposta de 192.0.2.1: bytes=32 tempo=8ms TTL=64"), Some(8.0));
        // Decimal con coma.
        assert_eq!(up("64 bytes from 192.0.2.1: icmp_seq=1 ttl=64 time=0,321 ms"), Some(0.321));
    }

    #[test]
    fn ping_macos_and_linux() {
        let mac = "PING 192.0.2.1 (192.0.2.1): 56 data bytes\n64 bytes from 192.0.2.1: icmp_seq=0 ttl=64 time=1.234 ms\n\n--- 192.0.2.1 ping statistics ---\n1 packets transmitted, 1 packets received, 0.0% packet loss\nround-trip min/avg/max/stddev = 1.234/1.234/1.234/0.000 ms\n";
        assert_eq!(up(mac), Some(1.234));
        let linux = "PING 192.0.2.1 (192.0.2.1) 56(84) bytes of data.\n64 bytes from 192.0.2.1: icmp_seq=1 ttl=63 time=0.456 ms\n\n--- 192.0.2.1 ping statistics ---\n1 packets transmitted, 1 received, 0% packet loss, time 0ms\nrtt min/avg/max/mdev = 0.456/0.456/0.456/0.000 ms\n";
        assert_eq!(up(linux), Some(0.456));
        // IPv6: macOS y Linux usan hlim/ttl; el RTT sigue en "time=".
        assert_eq!(up("16 bytes from 2001:db8::1, icmp_seq=0 hlim=64 time=2.5 ms"), Some(2.5));
        assert_eq!(up("64 bytes from 2001:db8::1: icmp_seq=1 ttl=64 time=3.25 ms"), Some(3.25));
        // Sin "time=" legible pero con respuesta: usa el tiempo de pared medido.
        assert_eq!(up("64 bytes from 192.0.2.1: icmp_seq=1 ttl=64"), Some(777.0));
    }

    #[test]
    fn ping_macos_and_linux_loss_and_errors() {
        let loss = "PING 192.0.2.9 (192.0.2.9): 56 data bytes\nRequest timeout for icmp_seq 0\n\n--- 192.0.2.9 ping statistics ---\n1 packets transmitted, 0 packets received, 100.0% packet loss\n";
        assert!(down(false, loss).contains("timeout"));
        let linux_loss = "PING 192.0.2.9 (192.0.2.9) 56(84) bytes of data.\n\n--- 192.0.2.9 ping statistics ---\n1 packets transmitted, 0 received, 100% packet loss, time 0ms\n";
        assert!(down(false, linux_loss).contains("100% packet loss"));
        assert!(down(false, "From 192.0.2.1 icmp_seq=1 Destination Host Unreachable").contains("Unreachable"));
        assert!(down(false, "ping: cannot resolve nohost.example: Unknown host").to_lowercase().contains("unknown host"));
        assert!(down(false, "ping: unknown host nohost.example").contains("unknown host"));
        assert!(down(false, "Paquetes: enviados = 1, recibidos = 0, perdidos = 1 (100% perdidos),").contains("100% perdidos"));
        assert_eq!(down(false, ""), "Sin respuesta");
        assert_eq!(down(true, ""), "Sin respuesta");
        // Con éxito pero sin TTL ni hlim no hay respuesta real.
        assert_eq!(down(true, "1 packets transmitted, 1 received"), "Sin respuesta");
    }

    /// Salida de Windows en español para tiempos menores a 1 ms. A CONFIRMAR con un equipo real:
    /// según Windows en español el texto es "tiempo<1m" (sin "s"); el regex exige "ms" y el
    /// RTT sale como el tiempo de pared del proceso (decenas de ms) en vez de 1 ms.
    #[test]
    #[ignore = "a confirmar: Windows es-ES imprime 'tiempo<1m'; hoy el RTT cae al tiempo de pared"]
    fn ping_windows_spanish_sub_millisecond_without_s() {
        assert_eq!(parse_ping(true, "Respuesta desde 192.0.2.1: bytes=32 tiempo<1m TTL=64", 777.0).1, Some(1.0));
    }

    #[test]
    fn validate_host_boundaries() {
        assert!(validate_host(&"a".repeat(253)).is_ok());
        assert!(validate_host(&"a".repeat(254)).is_err());
        assert!(validate_host("  192.0.2.1  ").is_ok(), "se recorta");
        assert!(validate_host("").is_err() && validate_host("   ").is_err());
        for bad in ["a b", "a\tb", "a\nb", "a;b", "a|b", "a&b", "a$b", "a`b", "a'b", "a/b", "ñandú.example", "192.0.2.1\0", "--help", "-1", "$(id)"] {
            assert!(validate_host(bad).is_err(), "{bad:?}");
        }
        for ok in ["192.0.2.1", "r1_core-01.example.net", "fe80::1%eth0", "2001:db8::1", "[2001:db8::1]", "LOCALHOST"] {
            assert!(validate_host(ok).is_ok(), "{ok}");
        }
    }

    #[test]
    fn resolve_accepts_ip_literals_without_dns() {
        let a = resolve("[2001:db8::1]", 22).unwrap();
        assert_eq!(a[0].to_string(), "[2001:db8::1]:22");
        assert_eq!(resolve("192.0.2.1", 8080).unwrap()[0].to_string(), "192.0.2.1:8080");
        // Sin direcciones: falla sin conectar y con el motivo.
        let r = tcp_probe_addrs(&[], Duration::from_millis(100));
        assert_eq!((r.0, r.1, r.2.as_deref()), (false, None, Some("sin dirección")));
    }

    #[test]
    fn rejects_option_injection_in_host() {
        assert!(validate_host("-f").is_err());
        assert!(validate_host("10.0.0.1; rm -rf /").is_err());
        assert!(validate_host("router-core.lab").is_ok());
        assert!(validate_host("2001:db8::1").is_ok());
        assert!(validate_host("[2001:db8::1]").is_ok());
        // ping recibe el host sin corchetes: "[-f]" no puede convertirse en opción.
        for bad in ["[-f]", "[-c99]", "[]", "[[-f]]", "-[x]", "a]b", "[a"] {
            assert!(validate_host(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn tcp_probe_detects_open_and_closed_ports() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        assert!(tcp_probe("127.0.0.1", port, Duration::from_secs(1)).0);
        drop(listener);
        // Otro test en paralelo puede tomar justo ese puerto efímero: se reintenta con uno
        // nuevo antes de concluir que la detección de "cerrado" falla.
        let closed = (0..5).any(|_| {
            let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
            let p = l.local_addr().unwrap().port();
            drop(l);
            !tcp_probe("127.0.0.1", p, Duration::from_millis(300)).0
        });
        assert!(closed || !tcp_probe("127.0.0.1", port, Duration::from_millis(300)).0);
    }
}
