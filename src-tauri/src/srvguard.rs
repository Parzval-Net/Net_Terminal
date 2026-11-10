//! Controles comunes de los servidores integrados (TFTP, HTTP, FTP y Syslog): interfaz de
//! escucha, lista de clientes permitidos (IP o subred CIDR) y detención automática por
//! inactividad. Todo es pasivo: no hay hilos ni temporizadores propios. Cada servidor llama a
//! `Guard::pulse` en su ciclo de recepción (que ya despierta cada 200-500 ms mientras corre), así
//! que sin servidor activo no existe nada que consuma recursos.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::net::{IpAddr, Ipv4Addr};
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// Minutos sin actividad tras los que un servidor se detiene si el usuario no indica otro valor.
pub const DEFAULT_IDLE_MIN: u32 = 30;
/// Tope del valor configurable (un día).
pub const MAX_IDLE_MIN: u32 = 24 * 60;
/// Entradas máximas de la lista de clientes permitidos.
const MAX_ENTRIES: usize = 64;
/// Cada cuánto como máximo se avisa a la interfaz de nuevos rechazos (no inundar ante un flood).
const EMIT_EVERY_MS: u64 = 1000;

/// Preferencias de un servidor, como llegan de la interfaz. Sin valor: todas las interfaces, sin
/// filtro de clientes y detención a los 30 minutos (0 la desactiva).
#[derive(Deserialize, Default, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ServerOpts {
    /// IP local donde escuchar; vacío o "all": todas las interfaces IPv4 (0.0.0.0).
    pub bind: Option<String>,
    /// IP o subredes CIDR permitidas; vacío: cualquier origen.
    pub allow: Option<Vec<String>>,
    pub idle_minutes: Option<u32>,
}

pub struct Resolved {
    pub bind: IpAddr,
    pub allow: AllowList,
    pub idle: Option<Duration>,
}

impl ServerOpts {
    pub fn resolve(&self) -> Result<Resolved, String> {
        let bind = resolve_bind(self.bind.as_deref())?;
        let allow = AllowList::parse(self.allow.as_deref().unwrap_or(&[]))?;
        let idle = match self.idle_minutes.unwrap_or(DEFAULT_IDLE_MIN) {
            0 => None,
            m => Some(Duration::from_secs(u64::from(m.min(MAX_IDLE_MIN)) * 60)),
        };
        Ok(Resolved { bind, allow, idle })
    }
}

/// IP de escucha: "" o "all" son todas las interfaces; una IP concreta debe ser de este equipo.
pub fn resolve_bind(bind: Option<&str>) -> Result<IpAddr, String> {
    let b = bind.unwrap_or("").trim();
    if b.is_empty() || b.eq_ignore_ascii_case("all") || b == "0.0.0.0" {
        return Ok(Ipv4Addr::UNSPECIFIED.into());
    }
    let ip: IpAddr = b.parse().map_err(|_| format!("Dirección de escucha inválida: {b}"))?;
    let mine = if_addrs::get_if_addrs().map(|l| l.iter().any(|i| i.ip() == ip)).unwrap_or(false);
    if !mine {
        return Err(format!("La IP {ip} no pertenece a este equipo (cambió de red). Elige otra interfaz."));
    }
    Ok(ip)
}

// ---------- Clientes permitidos ----------

#[derive(Clone, Debug, PartialEq)]
enum Net {
    V4(u32, u8),
    V6(u128, u8),
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct AllowList(Vec<Net>);

fn mask4(len: u8) -> u32 {
    if len == 0 {
        0
    } else {
        u32::MAX << (32 - u32::from(len))
    }
}

fn mask6(len: u8) -> u128 {
    if len == 0 {
        0
    } else {
        u128::MAX << (128 - u32::from(len))
    }
}

impl AllowList {
    /// Cada texto puede traer varias entradas separadas por coma, punto y coma o espacios.
    /// Una IP sola equivale a /32 (IPv4) o /128 (IPv6). Entradas inválidas se rechazan, no se
    /// ignoran: un error de tipeo no debe dejar el servidor abierto a todos sin aviso.
    pub fn parse(items: &[String]) -> Result<AllowList, String> {
        let mut out = Vec::new();
        for entry in items.iter().flat_map(|s| s.split(|c: char| c == ',' || c == ';' || c.is_whitespace())).filter(|s| !s.is_empty()) {
            if out.len() >= MAX_ENTRIES {
                return Err(format!("Demasiadas entradas en la lista de clientes (máximo {MAX_ENTRIES})"));
            }
            let (addr, len) = match entry.split_once('/') {
                Some((a, l)) => (a, Some(l.parse::<u8>().map_err(|_| format!("Prefijo inválido en {entry}"))?)),
                None => (entry, None),
            };
            let ip: IpAddr = addr.parse().map_err(|_| format!("Cliente permitido inválido: {entry} (usa una IP o una subred como 10.0.0.0/24)"))?;
            out.push(match normalize(ip) {
                IpAddr::V4(v) => {
                    let len = len.unwrap_or(32);
                    if len > 32 {
                        return Err(format!("Prefijo fuera de rango en {entry}"));
                    }
                    Net::V4(u32::from(v) & mask4(len), len)
                }
                IpAddr::V6(v) => {
                    let len = len.unwrap_or(128);
                    if len > 128 {
                        return Err(format!("Prefijo fuera de rango en {entry}"));
                    }
                    Net::V6(u128::from(v) & mask6(len), len)
                }
            });
        }
        Ok(AllowList(out))
    }

    pub fn len(&self) -> usize {
        self.0.len()
    }

    /// Lista vacía: cualquier origen.
    pub fn allows(&self, ip: IpAddr) -> bool {
        if self.0.is_empty() {
            return true;
        }
        match normalize(ip) {
            IpAddr::V4(v) => self.0.iter().any(|n| matches!(n, Net::V4(net, len) if u32::from(v) & mask4(*len) == *net)),
            IpAddr::V6(v) => self.0.iter().any(|n| matches!(n, Net::V6(net, len) if u128::from(v) & mask6(*len) == *net)),
        }
    }
}

/// Una IPv4 recibida por un socket de doble pila llega como ::ffff:a.b.c.d.
fn normalize(ip: IpAddr) -> IpAddr {
    match ip {
        IpAddr::V6(v) => v.to_ipv4_mapped().map(IpAddr::V4).unwrap_or(ip),
        v4 => v4,
    }
}

// ---------- Guardia de un servidor en marcha ----------

/// Avisa a la interfaz: (evento, datos).
pub type Emit = Arc<dyn Fn(&'static str, Value) + Send + Sync>;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GuardStats {
    pub kind: &'static str,
    pub rejected: u64,
    pub last: Option<String>,
    /// Entradas de la lista de clientes permitidos (0: cualquiera).
    pub allow: usize,
    pub idle_minutes: Option<u64>,
}

pub struct Guard {
    kind: &'static str,
    allow: AllowList,
    idle: Option<Duration>,
    t0: Instant,
    /// Última actividad, en ms desde `t0`.
    last: AtomicU64,
    /// Transferencias o conexiones en curso: con alguna, el servidor no está inactivo.
    busy: AtomicUsize,
    rejected: AtomicU64,
    dirty: AtomicBool,
    last_ip: Mutex<Option<IpAddr>>,
    last_emit: AtomicU64,
    emit: Emit,
    on_idle: Box<dyn Fn() + Send + Sync>,
}

/// Marca una operación válida en curso (transferencia, sesión FTP autenticada) mientras vive.
pub struct Busy(Arc<Guard>);

impl Drop for Busy {
    fn drop(&mut self) {
        self.0.busy.fetch_sub(1, Ordering::SeqCst);
        self.0.touch();
    }
}

impl Guard {
    pub fn new(kind: &'static str, r: &Resolved, emit: Emit, on_idle: Box<dyn Fn() + Send + Sync>) -> Arc<Guard> {
        Arc::new(Guard {
            kind,
            allow: r.allow.clone(),
            idle: r.idle,
            t0: Instant::now(),
            last: AtomicU64::new(0),
            busy: AtomicUsize::new(0),
            rejected: AtomicU64::new(0),
            dirty: AtomicBool::new(false),
            last_ip: Mutex::new(None),
            last_emit: AtomicU64::new(u64::MAX),
            emit,
            on_idle,
        })
    }

    fn now_ms(&self) -> u64 {
        self.t0.elapsed().as_millis() as u64
    }

    /// Registra actividad válida (reinicia el plazo de inactividad). Solo la llaman los servidores
    /// ante una operación que sirvió algo: transferencia TFTP iniciada, petición HTTP 2xx/3xx,
    /// login FTP correcto y sus comandos, mensaje syslog aceptado.
    pub fn touch(&self) {
        self.last.store(self.now_ms(), Ordering::SeqCst);
    }

    /// Decide si se atiende a `ip` según la lista de clientes permitidos. No cuenta como
    /// actividad ni siquiera si se permite: un escáner, una conexión sin credenciales o un login
    /// fallido no deben mantener vivo el servidor. Lo rechazado se registra (contador y último
    /// origen).
    pub fn admit(&self, ip: IpAddr) -> bool {
        if self.allow.allows(ip) {
            return true;
        }
        self.rejected.fetch_add(1, Ordering::SeqCst);
        *self.last_ip.lock().unwrap() = Some(normalize(ip));
        self.dirty.store(true, Ordering::SeqCst);
        false
    }

    /// Operación válida en curso: cuenta como actividad al empezar y al terminar, y mientras
    /// viva el servidor no está inactivo. Se crea solo tras validar la operación (no al aceptar
    /// la conexión o el datagrama).
    pub fn busy(self: &Arc<Self>) -> Busy {
        self.busy.fetch_add(1, Ordering::SeqCst);
        self.touch();
        Busy(self.clone())
    }

    pub fn stats(&self) -> GuardStats {
        GuardStats {
            kind: self.kind,
            rejected: self.rejected.load(Ordering::SeqCst),
            last: self.last_ip.lock().unwrap().map(|i| i.to_string()),
            allow: self.allow.len(),
            idle_minutes: self.idle.map(|d| d.as_secs() / 60),
        }
    }

    pub fn idle_expired(&self) -> bool {
        match self.idle {
            Some(d) if self.busy.load(Ordering::SeqCst) == 0 => self.now_ms().saturating_sub(self.last.load(Ordering::SeqCst)) >= d.as_millis() as u64,
            _ => false,
        }
    }

    fn flush(&self, force: bool) {
        if !self.dirty.load(Ordering::SeqCst) {
            return;
        }
        let now = self.now_ms();
        let prev = self.last_emit.load(Ordering::SeqCst);
        if !force && prev != u64::MAX && now.saturating_sub(prev) < EMIT_EVERY_MS {
            return;
        }
        self.dirty.store(false, Ordering::SeqCst);
        self.last_emit.store(now, Ordering::SeqCst);
        (self.emit)("server-guard", serde_json::to_value(self.stats()).unwrap_or(Value::Null));
    }

    /// Se llama en cada vuelta del ciclo de recepción. Informa los rechazos nuevos (como máximo
    /// uno por segundo) y, si pasó el plazo sin actividad, apaga el servidor y avisa. Devuelve
    /// false cuando el ciclo debe terminar.
    pub fn pulse(&self, flag: &AtomicBool) -> bool {
        self.flush(false);
        if !self.idle_expired() {
            return true;
        }
        self.flush(true);
        flag.store(false, Ordering::SeqCst);
        (self.emit)("server-stopped", json!({ "kind": self.kind, "reason": "idle", "minutes": self.idle.map(|d| d.as_secs() / 60) }));
        (self.on_idle)();
        false
    }
}

/// Guardia sin avisos a la interfaz, para las pruebas de los servidores.
#[cfg(test)]
pub(crate) fn test_guard(allow: &[&str], idle_ms: Option<u64>) -> Arc<Guard> {
    let allow = AllowList::parse(&allow.iter().map(|s| s.to_string()).collect::<Vec<_>>()).unwrap();
    let r = Resolved { bind: IpAddr::from([127, 0, 0, 1]), allow, idle: idle_ms.map(Duration::from_millis) };
    Guard::new("test", &r, Arc::new(|_, _| {}), Box::new(|| {}))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn list(items: &[&str]) -> AllowList {
        AllowList::parse(&items.iter().map(|s| s.to_string()).collect::<Vec<_>>()).unwrap()
    }
    fn ip(s: &str) -> IpAddr {
        s.parse().unwrap()
    }

    #[test]
    fn empty_list_allows_anyone() {
        let l = list(&[]);
        assert!(l.len() == 0 && l.allows(ip("203.0.113.9")) && l.allows(ip("2001:db8::1")));
    }

    #[test]
    fn cidr_v4_matches_only_the_subnet() {
        let l = list(&["10.1.2.0/24", "192.168.5.7"]);
        assert!(l.allows(ip("10.1.2.0")) && l.allows(ip("10.1.2.255")));
        assert!(!l.allows(ip("10.1.3.1")) && !l.allows(ip("10.1.1.255")));
        assert!(l.allows(ip("192.168.5.7")) && !l.allows(ip("192.168.5.8")));
        // /0 permite todo IPv4; /32 solo la IP.
        assert!(list(&["0.0.0.0/0"]).allows(ip("8.8.8.8")));
        assert!(!list(&["8.8.8.8/32"]).allows(ip("8.8.8.9")));
        // El prefijo ignora los bits de host de la entrada (10.1.2.77/24 = 10.1.2.0/24).
        assert!(list(&["10.1.2.77/24"]).allows(ip("10.1.2.1")));
        assert!(list(&["10.0.0.0/8"]).allows(ip("10.255.255.255")) && !list(&["10.0.0.0/8"]).allows(ip("11.0.0.1")));
    }

    #[test]
    fn cidr_v6_and_mapped_addresses() {
        let l = list(&["fd00:abcd::/32", "2001:db8::5"]);
        assert!(l.allows(ip("fd00:abcd:1::9")) && !l.allows(ip("fd00:abce::1")));
        assert!(l.allows(ip("2001:db8::5")) && !l.allows(ip("2001:db8::6")));
        // IPv4 no coincide con una lista solo IPv6 y al revés.
        assert!(!l.allows(ip("10.0.0.1")));
        assert!(!list(&["10.0.0.0/8"]).allows(ip("fd00::1")));
        // IPv4 mapeada en IPv6 se evalúa como IPv4.
        assert!(list(&["10.0.0.0/8"]).allows(ip("::ffff:10.2.3.4")));
        assert!(!list(&["10.0.0.0/8"]).allows(ip("::ffff:11.2.3.4")));
        assert!(list(&["::/0"]).allows(ip("2001:db8::1")));
    }

    #[test]
    fn parses_separators_and_rejects_bad_entries() {
        let l = list(&["10.0.0.1, 10.0.0.2;10.0.0.3\n10.0.0.0/30"]);
        assert_eq!(l.len(), 4);
        for bad in ["10.0.0.0/33", "10.0.0.0/x", "hola", "300.1.1.1", "fd00::/129", "10.0.0.0/-1"] {
            assert!(AllowList::parse(&[bad.to_string()]).is_err(), "{bad} debía fallar");
        }
        let many: Vec<String> = (0..65).map(|i| format!("10.0.0.{i}")).collect();
        assert!(AllowList::parse(&many).unwrap_err().contains("Demasiadas"));
        // Un error en una entrada no deja pasar a todos: toda la lista se rechaza.
        assert!(AllowList::parse(&["10.0.0.1 10.0.0.x".into()]).is_err());
    }

    #[test]
    fn bind_resolution() {
        assert_eq!(resolve_bind(None).unwrap(), IpAddr::from([0, 0, 0, 0]));
        assert_eq!(resolve_bind(Some("all")).unwrap(), IpAddr::from([0, 0, 0, 0]));
        assert_eq!(resolve_bind(Some("  ")).unwrap(), IpAddr::from([0, 0, 0, 0]));
        assert_eq!(resolve_bind(Some("127.0.0.1")).unwrap(), IpAddr::from([127, 0, 0, 1]));
        assert!(resolve_bind(Some("no-es-ip")).is_err());
        // Una IP que no es de este equipo (documentación RFC 5737) se rechaza con mensaje claro.
        assert!(resolve_bind(Some("192.0.2.77")).unwrap_err().contains("no pertenece"));
    }

    #[test]
    fn opts_defaults_and_idle_limits() {
        let r = ServerOpts::default().resolve().unwrap();
        assert_eq!(r.idle, Some(Duration::from_secs(30 * 60)));
        assert_eq!(r.allow.len(), 0);
        assert_eq!(ServerOpts { idle_minutes: Some(0), ..Default::default() }.resolve().unwrap().idle, None);
        assert_eq!(ServerOpts { idle_minutes: Some(999_999), ..Default::default() }.resolve().unwrap().idle, Some(Duration::from_secs(24 * 3600)));
        assert!(ServerOpts { allow: Some(vec!["x".into()]), ..Default::default() }.resolve().is_err());
    }

    type Events = Arc<Mutex<Vec<(&'static str, Value)>>>;

    fn guard(allow: &[&str], idle_ms: Option<u64>) -> (Arc<Guard>, Events, Arc<AtomicBool>) {
        let events: Events = Arc::default();
        let ev = events.clone();
        let idled = Arc::new(AtomicBool::new(false));
        let id = idled.clone();
        let r = Resolved { bind: ip("127.0.0.1"), allow: list(allow), idle: idle_ms.map(Duration::from_millis) };
        let g = Guard::new("tftp", &r, Arc::new(move |k, v| ev.lock().unwrap().push((k, v))), Box::new(move || id.store(true, Ordering::SeqCst)));
        (g, events, idled)
    }

    #[test]
    fn rejections_are_counted_and_reported_throttled() {
        let (g, events, _) = guard(&["10.0.0.0/24"], None);
        assert!(g.admit(ip("10.0.0.5")));
        assert!(!g.admit(ip("198.51.100.1")) && !g.admit(ip("198.51.100.2")));
        let st = g.stats();
        assert_eq!((st.rejected, st.last.as_deref(), st.allow), (2, Some("198.51.100.2"), 1));
        let flag = AtomicBool::new(true);
        assert!(g.pulse(&flag));
        {
            let ev = events.lock().unwrap();
            assert_eq!(ev.len(), 1);
            assert_eq!(ev[0].1["rejected"], 2);
        }
        // Sin rechazos nuevos no hay más avisos; con nuevos, se limitan a uno por segundo.
        assert!(g.pulse(&flag));
        assert!(!g.admit(ip("198.51.100.3")));
        assert!(g.pulse(&flag));
        assert_eq!(events.lock().unwrap().len(), 1, "limitado a uno por segundo");
        std::thread::sleep(Duration::from_millis(1100));
        assert!(g.pulse(&flag));
        assert_eq!(events.lock().unwrap().len(), 2);
        assert_eq!(events.lock().unwrap()[1].1["rejected"], 3);
    }

    #[test]
    fn rejected_traffic_does_not_keep_the_server_alive() {
        let (g, _, _) = guard(&["10.0.0.0/24"], Some(120));
        for _ in 0..5 {
            std::thread::sleep(Duration::from_millis(40));
            assert!(!g.admit(ip("198.51.100.1")));
        }
        assert!(g.idle_expired());
    }

    #[test]
    fn allowed_but_unvalidated_traffic_does_not_keep_the_server_alive() {
        // Un escáner desde una IP permitida (o sin filtro) que no completa nada útil.
        let (g, _, _) = guard(&[], Some(120));
        for _ in 0..5 {
            std::thread::sleep(Duration::from_millis(40));
            assert!(g.admit(ip("203.0.113.7")), "se atiende, pero no cuenta como actividad");
        }
        assert!(g.idle_expired());
        // Una operación válida sí reinicia el plazo.
        g.touch();
        assert!(!g.idle_expired());
        std::thread::sleep(Duration::from_millis(130));
        assert!(g.idle_expired());
        // Y una operación en curso la sostiene.
        let b = g.busy();
        std::thread::sleep(Duration::from_millis(130));
        assert!(!g.idle_expired());
        drop(b);
        assert!(!g.idle_expired());
    }

    #[test]
    fn idle_timeout_stops_and_notifies_once() {
        let (g, events, idled) = guard(&[], Some(150));
        let flag = AtomicBool::new(true);
        assert!(g.pulse(&flag) && flag.load(Ordering::SeqCst));
        std::thread::sleep(Duration::from_millis(100));
        assert!(g.admit(ip("10.0.0.1")));
        g.touch(); // actividad válida: reinicia el plazo
        std::thread::sleep(Duration::from_millis(100));
        assert!(g.pulse(&flag), "100 ms desde la última actividad: sigue activo");
        std::thread::sleep(Duration::from_millis(100));
        assert!(!g.pulse(&flag));
        assert!(!flag.load(Ordering::SeqCst) && idled.load(Ordering::SeqCst));
        let ev = events.lock().unwrap();
        let stop: Vec<_> = ev.iter().filter(|(k, _)| *k == "server-stopped").collect();
        assert_eq!(stop.len(), 1);
        assert_eq!(stop[0].1["reason"], "idle");
    }

    #[test]
    fn transfers_in_progress_are_not_idle() {
        let (g, _, _) = guard(&[], Some(60));
        let busy = g.busy();
        std::thread::sleep(Duration::from_millis(150));
        assert!(!g.idle_expired(), "una transferencia larga no se corta");
        drop(busy);
        assert!(!g.idle_expired(), "al terminar cuenta como actividad");
        std::thread::sleep(Duration::from_millis(100));
        assert!(g.idle_expired());
    }

    #[test]
    fn idle_disabled_never_expires() {
        let (g, _, _) = guard(&[], None);
        std::thread::sleep(Duration::from_millis(50));
        assert!(!g.idle_expired());
    }
}
