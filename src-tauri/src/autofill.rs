//! Autocompletado de la contraseña guardada al conectar. Mira solo la línea final de la
//! salida limpia (texto sin ANSI) y responde una única vez por conexión. Ante cualquier
//! señal de fallo o de un flujo distinto al login normal, se detiene para no bloquear
//! cuentas (TACACS/RADIUS) ni entregar la contraseña a un segundo prompt.

use std::time::{Duration, Instant};
use zeroize::Zeroizing;

/// Ventana desde la conexión en la que se acepta el prompt.
pub const WINDOW: Duration = Duration::from_secs(60);
const LINE_MAX: usize = 512;

/// Textos que cancelan el autocompletado: credencial rechazada o posible MITM.
const ABORT: [&str; 8] = [
    "permission denied",
    "access denied",
    "authentication failed",
    "% login invalid",
    "login incorrect",
    "% bad passwords",
    "remote host identification has changed",
    "possible dns spoofing",
];

/// Prompts de contraseña que no son el login: cambio de clave vencida, confirmaciones.
const NOT_LOGIN: [&str; 6] = ["new ", "old ", "current", "retype", "again", "confirm"];

/// Pedidos de usuario (en minúsculas) que el autocompletado responde o que el operador puede teclear.
const LOGIN_PROMPTS: [&str; 4] = ["username:", "login:", "user name:", "usuario:"];

const HOSTKEY: &str = "are you sure you want to continue connecting";

pub struct AutoFill {
    secret: Zeroizing<String>,
    /// Usuario para Telnet/Serial/TCP (SSH lo pasa con -l).
    user: Option<String>,
    newline: &'static str,
    started: Instant,
    line: String,
    user_sent: bool,
    done: bool,
    /// Con salto por un bastión (ProxyJump), host de destino que debe nombrar el prompt.
    /// El bastión pide su propia contraseña antes ("noc@bastion's password:") y no debe
    /// recibir la del equipo.
    only_host: Option<String>,
}

impl AutoFill {
    pub fn new(secret: Zeroizing<String>, user: Option<String>, newline: &'static str, started: Instant) -> Self {
        AutoFill { secret, user, newline, started, line: String::new(), user_sent: false, done: false, only_host: None }
    }

    /// Responde solo prompts de OpenSSH que nombran este host ("u@host's password:" o
    /// "(u@host) Password:"). Uno de otro host se deja al operador sin cancelar.
    pub fn only_host(mut self, host: Option<String>) -> Self {
        self.only_host = host.map(|h| h.trim().to_lowercase()).filter(|h| !h.is_empty());
        self
    }

    pub fn done(&self) -> bool {
        self.done
    }

    /// Desarma el autocompletado: ya no responde ningún pedido (la contraseña se suelta con él).
    /// Topología lo pide antes de enviar un comando de salto: si el pivote entró con llave SSH,
    /// el primer "Password:" sería el del vecino y no debe recibir la contraseña del pivote.
    pub fn disarm(&mut self) {
        self.stop();
    }

    /// El usuario envió Enter hacia la conexión (no cuenta lo que escribe el propio autocompletado).
    /// Lo que escribe el operador no lo ve este módulo, así que ante cualquier duda se desarma:
    /// sin llave SSH la primera línea tecleada puede ser un `ssh` a otro equipo cuyo "Password:" no
    /// debe recibir la contraseña guardada. Se mantiene armado solo en dos casos de login a mano:
    /// 1) la línea pendiente es un pedido de usuario con lo tecleado ("Username: noc", "srv login: noc"):
    ///    el usuario se tecleó a mano y se espera la contraseña autocompletada; el usuario ya cuenta
    ///    como enviado (si vuelve a pedirlo, el login falló y se detiene);
    /// 2) hay usuario guardado (Telnet/Raw/Serial), aún no se envió y la línea pendiente está vacía:
    ///    un Enter para despertar la consola, antes de que aparezca "Username:".
    pub fn user_enter(&mut self) {
        if self.done {
            return;
        }
        let line = self.line.trim();
        // Responde un pedido de login (contraseña del bastión, passphrase, OTP) o la pregunta de llave
        // de host: no ejecuta un comando, el autocompletado del destino sigue armado.
        if answers_login_request(line) {
            return;
        }
        if login_prompt_with_typed(line) && !self.user_sent {
            self.user_sent = true;
            return;
        }
        if line.is_empty() && self.user.is_some() && !self.user_sent {
            return;
        }
        self.stop();
    }

    fn stop(&mut self) {
        self.done = true;
        self.line.clear();
    }

    /// Procesa texto limpio. Devuelve los bytes a enviar al equipo, si corresponde.
    pub fn feed(&mut self, text: &str, now: Instant) -> Option<Zeroizing<Vec<u8>>> {
        if self.done {
            return None;
        }
        if now.duration_since(self.started) > WINDOW {
            self.stop();
            return None;
        }
        for c in text.chars() {
            if c == '\n' {
                // Línea completa: un abort o el prompt de comandos (también "prompt + Password:" en
                // el mismo bloque) desarma antes de mirar el pedido que viene detrás.
                if aborts(&self.line) || is_cli_prompt(&self.line) {
                    self.stop();
                    return None;
                }
                self.line.clear();
            } else {
                self.line.extend(c.to_lowercase());
            }
        }
        if self.line.len() > LINE_MAX {
            let mut cut = self.line.len() - LINE_MAX;
            while !self.line.is_char_boundary(cut) {
                cut += 1;
            }
            self.line.drain(..cut);
        }
        let line = self.line.trim_end();
        if aborts(line) {
            self.stop();
            return None;
        }
        // Ya se entró al equipo sin contraseña (llave SSH, sin login): el prompt de comandos está a la
        // vista. Cualquier "Password:" posterior es de otro equipo (un ssh o telnet lanzado desde aquí) o
        // de enable, y no recibe la contraseña de esta sesión.
        if is_cli_prompt(line) {
            self.stop();
            return None;
        }
        // Confirmación de llave de host pendiente: nunca se responde.
        if line.contains(HOSTKEY) {
            return None;
        }
        if line.ends_with("password:") || line.ends_with("contraseña:") {
            if line.contains("passphrase") {
                // Passphrase de la llave local: nunca recibe la contraseña guardada, pero si luego ssh
                // cae al "Password:" del destino ese sí se responde.
                return None;
            }
            if NOT_LOGIN.iter().any(|w| line.contains(w)) {
                self.stop();
                return None;
            }
            if let Some(host) = self.only_host.as_deref() {
                if !names_host(line, host) {
                    return None;
                }
            }
            let mut out = Zeroizing::new(Vec::with_capacity(self.secret.len() + 2));
            out.extend_from_slice(self.secret.as_bytes());
            out.extend_from_slice(self.newline.as_bytes());
            // Una sola vez: un segundo prompt (enable, reintento, prompt falso) no se responde.
            self.stop();
            return Some(out);
        }
        if let Some(user) = self.user.as_deref() {
            if ["username:", "login:", "user name:", "usuario:"].iter().any(|p| line.ends_with(p)) {
                if self.user_sent {
                    // Volvió a pedir usuario: el login anterior falló.
                    self.stop();
                    return None;
                }
                self.user_sent = true;
                self.line.clear();
                return Some(Zeroizing::new(format!("{user}{}", self.newline).into_bytes()));
            }
        }
        None
    }
}

/// Por qué no se escribe la contraseña guardada que pide un script.
pub const NO_PROMPT: &str = "La pantalla no muestra un pedido de contraseña";
pub const NOT_LOGIN_PROMPT: &str = "El pedido no es el de inicio de sesión (passphrase, cambio de clave o confirmación)";
pub const AFTER_DENIED: &str = "El equipo acaba de rechazar una contraseña: no se reintenta";
pub const OTHER_HOST: &str = "El pedido de contraseña es de otro equipo, no del destino de la sesión";
/// Líneas anteriores al pedido que se revisan en busca de un rechazo.
const RECENT_LINES: usize = 4;

/// Pedido de contraseña que la pantalla muestra ahora (última línea del texto limpio), para que
/// un script escriba la contraseña guardada sin verla (`type_saved_password`). Mismas reglas que
/// el autocompletado: termina en "password:" o "contraseña:", no es una passphrase de llave ni
/// un cambio de clave, ninguna de las líneas recién anteriores es un rechazo ("Permission
/// denied", "% Login invalid") o una advertencia de llave de host, y si nombra un host al estilo
/// OpenSSH ("u@host's password:", "(u@host) Password:") debe ser `host`. Con `strict` (sesión
/// con bastión) el pedido tiene que nombrar al host. Devuelve el byte de `tail` donde empieza
/// la línea del pedido, que identifica ese pedido (se responde una sola vez).
pub fn screen_prompt(tail: &str, host: Option<&str>, strict: bool) -> Result<usize, &'static str> {
    let start = tail.rfind('\n').map_or(0, |i| i + 1);
    let line = tail[start..].trim().to_lowercase();
    if !(line.ends_with("password:") || line.ends_with("contraseña:")) {
        return Err(NO_PROMPT);
    }
    if line.contains("passphrase") || line.contains(HOSTKEY) || NOT_LOGIN.iter().any(|w| line.contains(w)) {
        return Err(NOT_LOGIN_PROMPT);
    }
    let recent = tail[..start].lines().rev().filter(|l| !l.trim().is_empty()).take(RECENT_LINES);
    if recent.map(str::to_lowercase).any(|l| aborts(&l)) {
        return Err(AFTER_DENIED);
    }
    let host = host.map(|h| h.trim().to_lowercase()).filter(|h| !h.is_empty());
    match host.as_deref() {
        Some(h) if names_host(&line, h) => {}
        Some(_) if strict || names_some_host(&line) => return Err(OTHER_HOST),
        None if names_some_host(&line) => return Err(OTHER_HOST),
        _ => {}
    }
    Ok(start)
}

/// El pedido nombra un host al estilo OpenSSH (de cualquier equipo).
fn names_some_host(line: &str) -> bool {
    let line = line.trim_start();
    (line.ends_with("'s password:") && line.contains('@')) || (line.starts_with('(') && line.contains('@') && line.contains(") "))
}

/// El prompt de contraseña es de OpenSSH para `host` (ya en minúsculas).
fn names_host(line: &str, host: &str) -> bool {
    let line = line.trim_start();
    line.ends_with(&format!("@{host}'s password:"))
        || (line.starts_with('(') && line.ends_with("password:") && line.contains(&format!("@{host}) ")))
}

/// La línea pendiente es un pedido de contraseña, passphrase, código (OTP) o la pregunta de llave de
/// host: el Enter del usuario lo está respondiendo (la clave no se ve en pantalla).
fn answers_login_request(line: &str) -> bool {
    if line.contains(HOSTKEY) {
        return true;
    }
    line.ends_with(':')
        && ["password", "passphrase", "contraseña", "verification code", "passcode", "otp", "token", "código"].iter().any(|k| line.contains(k))
}

/// La línea pendiente es un pedido de usuario seguido de lo tecleado a mano ("username: noc",
/// "srv01 login: noc"): a lo sumo una palabra antes del pedido y una después, sin espacios.
fn login_prompt_with_typed(line: &str) -> bool {
    LOGIN_PROMPTS.iter().any(|p| {
        line.find(p).is_some_and(|i| {
            let (before, after) = (line[..i].trim(), line[i + p.len()..].trim());
            !before.contains(char::is_whitespace) && !after.contains(char::is_whitespace) && after.len() <= 64
        })
    })
}

/// Prompt de comandos de un equipo o shell ya logueado ("router#", "sw01>", "<HUAWEI>", "[~SW]",
/// "noc@srv:~$", "[noc@srv01 ~]$", "FGT60E (root) #", "[admin@MikroTik] >"). Conservador: un banner,
/// "####", un pedido que termina en ":" o una pregunta que termina en "?" no cuentan.
fn is_cli_prompt(line: &str) -> bool {
    let l = line.trim();
    if l.len() < 2 || l.len() > 80 || l.ends_with(':') || l.ends_with('?') {
        return false;
    }
    if l.contains(char::is_whitespace) {
        return spaced_prompt(l);
    }
    let first = l.chars().next().unwrap_or(' ');
    let last = l.chars().last().unwrap_or(' ');
    match first {
        '<' => last == '>',
        '[' => last == ']' || ((last == '#' || last == '$') && l.contains(']')),
        c if c.is_alphanumeric() => matches!(last, '#' | '>' | '$') && l[..l.len() - 1].chars().any(char::is_alphanumeric),
        _ => false,
    }
}

/// Palabra de usuario, host o ruta corta: letras, dígitos y `- _ .`.
fn word(s: &str) -> bool {
    !s.is_empty() && s.chars().all(|c| c.is_alphanumeric() || matches!(c, '-' | '_' | '.'))
}

/// Prompts con espacios, de 2 o 3 partes:
/// - FortiOS: "HOST #", "HOST $", "HOST (vdom) #".
/// - Con usuario@host: "[noc@srv01 ~]$", "noc@srv01 ~ %" (bash/zsh), "[admin@MikroTik] >",
///   "[admin@mt] /ip/address>" (MikroTik) y "user@host >" / "user@host #".
fn spaced_prompt(l: &str) -> bool {
    let t: Vec<&str> = l.split_whitespace().collect();
    if !(2..=3).contains(&t.len()) {
        return false;
    }
    let last = t[t.len() - 1];
    let paren = |s: &str| s.len() > 2 && s.starts_with('(') && s.ends_with(')') && !s.contains('@');
    if matches!(last, "#" | "$") && word(t[0]) && (t.len() == 2 || paren(t[1])) {
        return true;
    }
    let head = t[0].trim_start_matches('[').trim_end_matches(']');
    let Some((user, host)) = head.split_once('@') else { return false };
    if !word(user) || !word(host) || !matches!(last.chars().last(), Some('#' | '$' | '%' | '>')) {
        return false;
    }
    // Parte del medio (ruta o directorio): sin "@" ni ":" final.
    t.len() == 2 || !(t[1].contains('@') || t[1].ends_with(':'))
}

fn aborts(line: &str) -> bool {
    ABORT.iter().any(|a| line.contains(a))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn af(user: Option<&str>) -> (AutoFill, Instant) {
        let t = Instant::now();
        (AutoFill::new(Zeroizing::new("S3cret".into()), user.map(Into::into), "\r", t), t)
    }

    fn sent(v: Option<Zeroizing<Vec<u8>>>) -> Option<String> {
        v.map(|b| String::from_utf8(b.to_vec()).unwrap())
    }

    #[test]
    fn fills_ssh_prompt_once() {
        let (mut a, t) = af(None);
        assert_eq!(sent(a.feed("Warning: banner\nnoc@10.0.0.1's pass", t)), None);
        assert_eq!(sent(a.feed("word: ", t)).as_deref(), Some("S3cret\r"));
        assert!(a.done());
        // Segundo prompt (enable, reintento o prompt falso): nada.
        assert_eq!(sent(a.feed("\nrouter>enable\nPassword: ", t)), None);
    }

    #[test]
    fn spanish_prompt_and_case() {
        let (mut a, t) = af(None);
        assert_eq!(sent(a.feed("CONTRASEÑA: ", t)).as_deref(), Some("S3cret\r"));
    }

    #[test]
    fn never_after_denied() {
        for denied in [
            "Permission denied, please try again.\n",
            "% Login invalid\n\n",
            "Access denied\n",
            "Authentication failed.\n",
        ] {
            let (mut a, t) = af(None);
            assert_eq!(sent(a.feed(denied, t)), None);
            assert_eq!(sent(a.feed("Password: ", t)), None, "{denied}");
        }
    }

    #[test]
    fn never_on_key_passphrase_or_hostkey() {
        let (mut a, t) = af(None);
        assert_eq!(sent(a.feed("Enter passphrase for key '/home/u/.ssh/id_ed25519': ", t)), None);
        let (mut a, t) = af(None);
        assert_eq!(
            sent(a.feed("Are you sure you want to continue connecting (yes/no/[fingerprint])? ", t)),
            None
        );
        assert!(!a.done());
        // Tras responder (línea completa), el prompt de contraseña sí se completa.
        assert_eq!(sent(a.feed("yes\nWarning: Permanently added.\nPassword: ", t)).as_deref(), Some("S3cret\r"));
        // Cambio de contraseña vencida: no se responde.
        let (mut a, t) = af(None);
        assert_eq!(sent(a.feed("(current) UNIX password: ", t)), None);
        assert!(a.done());
    }

    #[test]
    fn jump_host_prompt_is_not_answered() {
        let t = Instant::now();
        let mut a = AutoFill::new(Zeroizing::new("S3cret".into()), None, "\r", t).only_host(Some("10.0.0.1".into()));
        // El bastión pide su contraseña primero: no recibe la del equipo y no se cancela.
        assert_eq!(sent(a.feed("noc@bastion.example's password: ", t)), None);
        assert_eq!(sent(a.feed("\n(noc@bastion.example) Password: ", t)), None);
        assert!(!a.done());
        // Un "Password:" sin host (o de otro) tampoco.
        assert_eq!(sent(a.feed("\nPassword: ", t)), None);
        assert_eq!(sent(a.feed("\nnoc@10.0.0.10's password: ", t)), None);
        assert_eq!(sent(a.feed("\nnoc@10.0.0.1's password: ", t)).as_deref(), Some("S3cret\r"));
        // Keyboard-interactive de OpenSSH con prefijo (usuario@host).
        let mut a = AutoFill::new(Zeroizing::new("S3cret".into()), None, "\r", t).only_host(Some("Router1".into()));
        assert_eq!(sent(a.feed("(noc@router1) Password: ", t)).as_deref(), Some("S3cret\r"));
    }

    #[test]
    fn device_prompt_disarms_before_a_neighbor_asks() {
        // Pivote con llave SSH: no hubo "Password:" y aparece su prompt. El "Password:" que sigue es del
        // vecino (comando de salto) y no recibe la contraseña del pivote.
        for prompt in ["core-sw01#", "core-sw01>", "<ar-wan01>", "[~ar-wan01]", "noc@srv01:~$", "fw01#"] {
            let (mut a, t) = af(None);
            assert_eq!(sent(a.feed(&format!("Last login: Mon\r\n{prompt}"), t)), None, "{prompt}");
            assert!(a.done(), "{prompt}");
            assert_eq!(sent(a.feed("ssh -l noc 192.0.2.11\r\nPassword: ", t)), None, "{prompt}");
        }
        // Lo que no es un prompt no desarma: banners, separadores y pedidos de login.
        for line in ["##########", "Authorized access only>", "User Access Verification", "login:", "-->"] {
            let (mut a, t) = af(None);
            a.feed(line, t);
            assert!(!a.done(), "{line}");
            assert_eq!(sent(a.feed("\nPassword: ", t)).as_deref(), Some("S3cret\r"), "{line}");
        }
    }

    #[test]
    fn disarm_stops_the_autofill() {
        let (mut a, t) = af(Some("noc"));
        a.disarm();
        assert!(a.done());
        assert_eq!(sent(a.feed("Username: ", t)), None);
        assert_eq!(sent(a.feed("\nPassword: ", t)), None);
    }

    #[test]
    fn never_after_window() {
        let (mut a, t) = af(None);
        assert_eq!(sent(a.feed("Password: ", t + WINDOW + Duration::from_secs(1))), None);
        assert!(a.done());
    }

    #[test]
    fn screen_prompt_for_scripts() {
        // Pedidos de login: el que no nombra host y el de OpenSSH del destino.
        assert_eq!(screen_prompt("router con\nPassword: ", None, false), Ok(11));
        assert!(screen_prompt("Contraseña:", None, false).is_ok());
        assert!(screen_prompt("banner\nnoc@10.0.0.1's password: ", Some("10.0.0.1"), false).is_ok());
        assert!(screen_prompt("(noc@Router1) Password: ", Some("router1"), true).is_ok());
        // Sin pedido en la última línea: un prompt de comandos o un pedido ya respondido.
        for tail in ["router#", "Password: \nrouter>", "", "show run | i password:\nrouter#"] {
            assert_eq!(screen_prompt(tail, None, false), Err(NO_PROMPT), "{tail:?}");
        }
        // Passphrase de llave, cambio de clave, confirmación de llave de host.
        for tail in ["Enter passphrase for key '/home/u/.ssh/id_ed25519': password:", "(current) UNIX password:", "Retype new password:"] {
            assert_eq!(screen_prompt(tail, None, false), Err(NOT_LOGIN_PROMPT), "{tail:?}");
        }
        // Justo después de un rechazo (también con líneas vacías de por medio): nunca.
        for tail in [
            "Permission denied, please try again.\nnoc@10.0.0.1's password: ",
            "% Login invalid\n\nUsername: noc\nPassword: ",
            "Password: \n% Bad passwords\n\nPassword: ",
            "Access denied\nPassword:",
        ] {
            assert_eq!(screen_prompt(tail, Some("10.0.0.1"), false), Err(AFTER_DENIED), "{tail:?}");
        }
        // Un rechazo antiguo (varias líneas atrás) no impide un login nuevo.
        assert!(screen_prompt("% Login invalid\na\nb\nc\nd\ne\nPassword: ", None, false).is_ok());
        // Pedido de otro equipo: un ssh lanzado dentro de la sesión, o el bastión.
        assert_eq!(screen_prompt("noc@evil.example's password: ", Some("10.0.0.1"), false), Err(OTHER_HOST));
        assert_eq!(screen_prompt("(noc@evil.example) Password: ", None, false), Err(OTHER_HOST));
        assert_eq!(screen_prompt("noc@bastion's password: ", Some("10.0.0.1"), true), Err(OTHER_HOST));
        // Con bastión, un "Password:" que no nombra al destino tampoco.
        assert_eq!(screen_prompt("Password: ", Some("10.0.0.1"), true), Err(OTHER_HOST));
        assert!(screen_prompt("Password: ", Some("10.0.0.1"), false).is_ok());
    }

    #[test]
    fn telnet_username_then_password() {
        let (mut a, t) = af(Some("noc"));
        assert_eq!(sent(a.feed("\r\nUser Access Verification\n\nUsername: ", t)).as_deref(), Some("noc\r"));
        assert_eq!(sent(a.feed("noc\n", t)), None);
        assert_eq!(sent(a.feed("Password: ", t)).as_deref(), Some("S3cret\r"));
        // Login fallido: vuelve a pedir usuario y no se reintenta.
        let (mut a, t) = af(Some("noc"));
        a.feed("login: ", t);
        assert_eq!(sent(a.feed("noc\nlogin: ", t)), None);
        assert!(a.done());
        // Sin usuario configurado, el prompt de usuario se deja al operador.
        let (mut a, t) = af(None);
        assert_eq!(sent(a.feed("Username: ", t)), None);
        assert!(!a.done());
    }

    #[test]
    fn spaced_prompts_are_recognized() {
        for p in [
            "[noc@srv01 ~]$",
            "[noc@srv01 ~]# ",
            "noc@srv01 ~ %",
            "noc@srv01:~$ ",
            "FGT60E #",
            "FGT60E (root) # ",
            "fw-edge01 (vdom1) #",
            "FGT60E $",
            "[admin@MikroTik] > ",
            "[admin@mt] /ip/address> ",
            "user@junos> ",
            "user@junos# ",
            "user@host >",
            "<HUAWEI-core>",
            "[~HUAWEI-core]",
            "[HUAWEI-GigabitEthernet0/0/1]",
            "core-sw01#",
            "core-sw01(config)#",
            "core-sw01(config-if)#",
        ] {
            assert!(is_cli_prompt(p), "{p:?}");
        }
        // Pedidos de login, preguntas y texto que no es un prompt.
        for p in [
            "Password:",
            "Username:",
            "login:",
            "srv01 login:",
            "noc@10.0.0.1's password:",
            "(noc@10.0.0.1) Password:",
            "[sudo] password for noc:",
            "Enter passphrase for key '/home/u/.ssh/id_ed25519':",
            "Are you sure you want to continue connecting (yes/no/[fingerprint])?",
            "Continue (yes/no)?",
            "Last login: Mon Jan 1 from 10.0.0.2",
            "Authorized access only >",
            "Press any key to continue #",
            "ping noc@srv01 now >",
            "##########",
            "-->",
            "",
        ] {
            assert!(!is_cli_prompt(p), "{p:?}");
        }
    }

    #[test]
    fn spaced_prompt_disarms_before_a_neighbor_asks() {
        for prompt in ["[noc@srv01 ~]$ ", "FGT60E # ", "FGT60E (root) # ", "[admin@MikroTik] > ", "user@junos> "] {
            let (mut a, t) = af(None);
            assert_eq!(sent(a.feed(&format!("Last login: Mon\r\n{prompt}"), t)), None, "{prompt:?}");
            assert!(a.done(), "{prompt:?}");
            assert_eq!(sent(a.feed("ssh -l noc 192.0.2.11\r\nPassword: ", t)), None, "{prompt:?}");
        }
    }

    #[test]
    fn prompt_and_password_in_the_same_block_is_not_answered() {
        for block in [
            "Last login: Mon\r\n[noc@srv01 ~]$ \r\nPassword: ",
            "FGT60E # \nPassword: ",
            "core-sw01#\r\nPassword: ",
            "[admin@MikroTik] > \nPassword: ",
        ] {
            let (mut a, t) = af(None);
            assert_eq!(sent(a.feed(block, t)), None, "{block:?}");
            assert!(a.done(), "{block:?}");
        }
        // Sin prompt antes, el mismo bloque con banner sí responde.
        let (mut a, t) = af(None);
        assert_eq!(sent(a.feed("Authorized access only\r\nPassword: ", t)).as_deref(), Some("S3cret\r"));
    }

    #[test]
    fn first_user_line_disarms() {
        // Entró con llave SSH (sin prompt reconocible) y el usuario teclea un ssh a otro equipo.
        let (mut a, t) = af(None);
        assert_eq!(sent(a.feed("Welcome to srv01\r\n", t)), None);
        a.user_enter();
        assert!(a.done());
        assert_eq!(sent(a.feed("ssh other\r\nnoc@other's password: ", t)), None);
        // Texto tecleado fuera de un pedido de usuario, aun con usuario guardado: desarma.
        let (mut a, t) = af(Some("noc"));
        a.feed("banner\nuser", t);
        a.user_enter();
        assert!(a.done());
        // Un Enter con el pedido de contraseña a la vista (carrera con el autocompletado): no escribe.
        let (mut a, t) = af(Some("noc"));
        a.feed("Username: noc\n", t);
        a.feed("Pass", t);
        a.user_enter();
        assert!(a.done());
        assert_eq!(sent(a.feed("word: ", t)), None);
    }

    #[test]
    fn user_typed_login_keeps_the_documented_password_fill() {
        // Telnet sin usuario guardado: el operador teclea el usuario y espera la contraseña.
        for prompt in ["Username: ", "srv01 login: ", "login: "] {
            let (mut a, t) = af(None);
            a.feed(prompt, t);
            a.feed("noc", t); // eco
            a.user_enter();
            assert!(!a.done(), "{prompt:?}");
            assert_eq!(sent(a.feed("\r\nPassword: ", t)).as_deref(), Some("S3cret\r"), "{prompt:?}");
        }
        // Con usuario guardado: tecleó el usuario a mano; si vuelve a pedirlo, el login falló.
        let (mut a, t) = af(Some("noc"));
        a.feed("Username: noc", t);
        a.user_enter();
        assert_eq!(sent(a.feed("\r\nUsername: ", t)), None);
        assert!(a.done());
        // Enter para despertar la consola serial antes del pedido de usuario: sigue armado.
        let (mut a, t) = af(Some("noc"));
        a.user_enter();
        assert!(!a.done());
        assert_eq!(sent(a.feed("\r\nUsername: ", t)).as_deref(), Some("noc\r"));
        assert_eq!(sent(a.feed("noc\r\nPassword: ", t)).as_deref(), Some("S3cret\r"));
        // Sin usuario guardado, el mismo Enter en vacío desarma (SSH).
        let (mut a, _) = af(None);
        a.user_enter();
        assert!(a.done());
        // Una línea con espacios que no es un pedido de usuario ("Last login: ...") desarma.
        let (mut a, t) = af(Some("noc"));
        a.feed("Last login: Mon Jan 1", t);
        a.user_enter();
        assert!(a.done());
    }

    #[test]
    fn enter_answering_a_login_request_keeps_the_autofill() {
        // (1) Jump host: el bastión pide su contraseña, el usuario la teclea + Enter; el destino se autocompleta.
        let t = Instant::now();
        let mut a = AutoFill::new(Zeroizing::new("S3cret".into()), None, "\r", t).only_host(Some("10.0.0.1".into()));
        assert_eq!(sent(a.feed("noc@bastion.example's password: ", t)), None);
        a.user_enter();
        assert!(!a.done());
        assert_eq!(sent(a.feed("\r\nnoc@10.0.0.1's password: ", t)).as_deref(), Some("S3cret\r"));
        // Código OTP del bastión + Enter.
        let mut a = AutoFill::new(Zeroizing::new("S3cret".into()), None, "\r", t).only_host(Some("10.0.0.1".into()));
        a.feed("Verification code: ", t);
        a.user_enter();
        assert!(!a.done());
        assert_eq!(sent(a.feed("\r\nPassword: ", t)), None, "con jump host un pedido sin host no se responde");
        assert_eq!(sent(a.feed("\r\nnoc@10.0.0.1's password: ", t)).as_deref(), Some("S3cret\r"));
        // (2) Passphrase de llave + Enter, luego la contraseña del destino.
        let (mut a, t) = af(None);
        assert_eq!(sent(a.feed("Enter passphrase for key '/home/u/.ssh/id_ed25519': ", t)), None);
        a.user_enter();
        assert!(!a.done());
        assert_eq!(sent(a.feed("\r\nnoc@10.0.0.1's password: ", t)).as_deref(), Some("S3cret\r"));
        // (3) "yes" a la llave de host + Enter no desarma.
        let (mut a, t) = af(None);
        a.feed("Are you sure you want to continue connecting (yes/no/[fingerprint])? yes", t);
        a.user_enter();
        assert!(!a.done());
        assert_eq!(sent(a.feed("\r\nWarning: Permanently added.\r\nPassword: ", t)).as_deref(), Some("S3cret\r"));
        // (4) Entró con llave, ssh manual y el Password del vecino: no se autocompleta.
        for shell in ["Welcome to srv01\r\n", "srv01 weird> ssh other"] {
            let (mut a, t) = af(None);
            a.feed(shell, t);
            a.user_enter();
            assert!(a.done(), "{shell:?}");
            assert_eq!(sent(a.feed("\r\nPassword: ", t)), None);
        }
        // Un "password" en medio de otra línea (no es un pedido pendiente) no es excepción.
        let (mut a, t) = af(None);
        a.feed("srv01> echo password", t);
        a.user_enter();
        assert!(a.done());
    }
}
