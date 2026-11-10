/**
 * Packs de comandos: archivos JSON (solo datos) que amplían el catálogo por fabricante.
 *
 * Seguridad: un pack nunca ejecuta nada. Al cargarlo se valida su esquema y tamaño, y el
 * riesgo de cada comando se recalcula aquí: se usa el MAYOR entre el declarado y el
 * calculado, de modo que un pack no puede hacer pasar "reload" por una consulta.
 */
import { riskyRegex } from "./highlight";

export type Risk = "read" | "change" | "disruptive";

export interface Platform {
  id: string;
  label: string;
  /** Regex (sin delimitadores) que reconoce la plataforma en la salida de detectCommand. */
  detect?: string;
  note?: string;
}

export interface Variant {
  platforms: string[];
  cmd: string;
}

export interface PackCommand {
  cmd: string;
  desc: string;
  cat: string;
  risk: Risk;
  platforms?: string[];
  variants?: Variant[];
  note?: string;
  source?: string;
}

export interface Pack {
  format: "netterminal-commands";
  formatVersion: 1;
  id: string;
  name: string;
  vendor: string;
  vendorName: string;
  version?: string;
  author?: string;
  description?: string;
  detectCommand?: string;
  platforms?: Platform[];
  commands: PackCommand[];
  /** Incluido en la app (no se puede borrar, sí desactivar). */
  builtin?: boolean;
}

/** Comando listo para mostrar: con su pack de origen y riesgo efectivo. */
export interface CatalogEntry extends PackCommand {
  packId: string;
  packName: string;
  builtin: boolean;
  declaredRisk: Risk;
  /** true si la app subió el riesgo declarado por el pack. */
  escalated: boolean;
}

export interface CatalogVendor {
  id: string;
  name: string;
  detectCommand?: string;
  platforms: Platform[];
  commands: CatalogEntry[];
}

export const CATEGORIES = [
  "Sistema",
  "Hardware",
  "Interfaces",
  "Capa 2",
  "Enrutamiento",
  "MPLS / VPN",
  "Seguridad",
  "Alta disponibilidad",
  "QoS",
  "Diagnóstico",
  "Logs",
  "Configuración",
  "DNS",
  "Conexiones y tráfico",
  "Otros",
];

/** Catálogos de sistemas operativos (el resto son equipos de red). */
export const OS_VENDORS = ["windows", "macos", "linux"];

export const riskLabel: Record<Risk, string> = {
  read: "Consulta",
  change: "Cambia config/estado",
  disruptive: "Puede cortar servicio",
};

const RANK: Record<Risk, number> = { read: 0, change: 1, disruptive: 2 };
const maxRisk = (a: Risk, b: Risk): Risk => (RANK[a] >= RANK[b] ? a : b);

// ---------- Riesgo calculado ----------

/**
 * Comandos que solo consultan o ajustan la sesión actual. Quedan fuera a propósito: copiar la
 * configuración a la flash local (escribe un archivo), "monitor traffic ... write-file",
 * "execute ping-options <ajuste>" (cambia opciones de la sesión) y "diagnose sys session
 * filter <criterio>" (fija un filtro); "diagnose test authserver" prueba credenciales.
 * ssh, telnet y stelnet se reconocen aparte (remoteCommand): con argumentos de más son
 * configuración ("ssh server enable", "telnet 10.0.0.0 255.0.0.0 inside") o un comando remoto.
 * Tampoco son consulta las transferencias ("copy … tftp:", "tftp <ip> put", "execute backup"): sacan
 * datos del equipo hacia un servidor externo aunque no cambien su configuración (ver leavesDevice).
 * "diagnose test application <proceso> <nivel>" (FortiOS) ejecuta la acción número <nivel> del proceso: unas
 * muestran y otras vacían cachés, alternan el motor IPS o su bypass, recargan, detienen o reinician. Es cambio
 * salvo una lista corta de niveles que solo muestran, según los menús que publica Fortinet: ipsmonitor 1
 * (información del motor) y 3 (registro de reinicios); dnsproxy 2 (estadísticas), 3 (configuración DNS), 6 (FQDN),
 * 7 (caché) y 8 (base DNS); fcnacd 2 (conectividad con EMS) y 7 (caché ZTNA y de rutas); nr5gd 1, 3, 6 y 15 (estado,
 * conexión, slot y señal del módem 5G). La numeración cambia entre versiones: solo entran niveles bajos y estables. Cortan
 * servicio el 99 (reinicia el proceso) e ipsmonitor 97/98 (inician o detienen todos los motores IPS): DISRUPTIVE.
 */
const READ_START =
  /^(show|display|get|dir|more|ping|traceroute|tracert|tracepath|verify|monitor (traffic(?!.*\swr)|interface|start|stop)|test policy|compare configuration|who|policy-check|tcpdump|dnslookup|nslookup|vpn-tunnel diag-report|(undo )?terminal (logging|monitor|debugging|trapping)|request system storage cleanup dry-run|request system software validate|admin show|packet-tracer|ethanalyzer local(?!.*\swr)|terminal (length|width|(no )?monitor|pager)|no page\s*$|checkpoint diff\b|diag cable-diagnostic show\b|cd \/md\S*\s*$|mdconnect\s*$|screen-length\s+\d+\s+temporary|screen-width|set cli |file (list|show|checksum)|commit check|request support information|diagnose (sys (top|status|session (stat|list)|session filter(?=\s*$)|ha (status|checksum (?!rec)))|vpn (ike gateway|tunnel) list|sniffer packet|ip (route|arp) list|firewall iprope lookup|test application (ipsmonitor [13]|dnsproxy [23678]|fcnacd [27]|nr5gd (1|3|6|15))(?=\s*$))|execute (ping6?|traceroute6?|telnet|ssh)(?!-)|execute (ping|traceroute)-options view-settings)\b/i;
/**
 * Cortan servicio o sesiones, o dejan el equipo en otro estado (conmutación, rollback,
 * borrado de tablas, túneles o SA, reinicio de equipos administrados, módems o daemons,
 * prueba de cable TDR). Incluye el "debug" de IOS, que puede saturar la CPU.
 */
const DISRUPTIVE =
  /^(reload(?! cancel)|reboot|shutdown|halt|poweroff|power-off|erase|format(?!-(Table|List|Wide|Custom|Hex)\b)|write erase|delete|undelete|rmdir|squeeze|zeroize|factory|configure replace|configure revert now|reset saved-configuration|reset (bgp|ospf|isis|mpls|ip ospf|ike sa|ipsec sa|recycle-bin|mac-address(?! flapping))|rollback (configuration|running-config)\b|checkpoint rollback|commit replace|abort trial|debug(ging)?\b|redundancy (force-)?switchover|(system|slave|master) switchover|test cable-diagnostics|diag cable-diagnostic test|show cable-diag\b|diagnose switch physical-ports cable-diag|clear (ip )?(bgp|ospf|isis|eigrp)(?!.*\bsoft\b)|clear bgp(?!.*\bsoft\b)|clear (ip )?route|clear arp\s*$|clear ip nat translation|clear crypto\b|clear mac(-| )address-table\b|clear interfaces statistics all\b|clear ethernet-switching table\s*$|clear security flow session\b|request system (reboot|halt|power-off|zeroize|logout|software rollback)|request chassis cluster failover|request chassis routing-engine master\b|request node (reboot|halt|power-off|offline)|restart \S+|set interfaces \S+( unit \d+)? disable\b|cfg -x|execute (reboot|shutdown|factoryreset\w*|formatlogdisk|restore|ha failover|disk format|sim-switch|clear system arp table|poe-reset|(bpdu|loop)-guard reset)|execute (lte|5g)-modem (reboot|power-off|sim-switch|start-upgrade|firmware-upgrade|carrier-config switch)|execute switch-controller (switch-action (poe reset|cable-diag|bpdu-guard reset|loop-guard reset|restart|set-standalone|factory-reset)|poe-reset|switch-software upgrade)|execute wireless-controller (reset-wtp|restart-\S+|push-wtp-image|rolling-wtp-upgrade)|execute extender (reset-fortiextender|restart-fortiextender-daemon|push-fortiextender-image|install-forticloud-\S+)|execute router clear (bgp|ospf)(?!.*\bsoft\b)|diagnose sys session clear|diagnose sys ha reset-uptime|diagnose switch-controller restart-daemon|diagnose test application (\S+ 99|ipsmonitor 9[78])\b|diagnose vpn tunnel down\b|diagnose vpn ike (gateway (clear|flush)|restart)\b|diagnose vpn "?\/ike\/restart|diagnose firewall auth clear\b|fnsysctl killall\b|schedule reboot|install (activate|remove|commit)|install add\b.*\sactivate\b|deactivate|cpstop|cpstart|cprestart|cphastop|mdsstop|fw unload(local)?|clusterXL_admin down|set cluster member admin down|fwaccel off|fw tab\b.*\s-x\b|fw ctl conntab\b.*\s-x\b|fw ctl zdebug\b|fw ctl debug (?!(0|-x)\s*$)\S|vpn tu (del|delete)\b|save config\s*$|load configuration\b|set interface \S+ state off\b|set static-route\b.*\boff\b|upgrade system\b|upgrade\s*$|vpn-tunnel rekey\b|cluster (failover|reboot|reset)\b|import config\b|restore (image|factory-default|backup-image)\b|restore-defaults\b|boot system( flash)?( primary| secondary)?\s*$|interface \S+ (disable|speed-duplex)\b|no interface \S+ power-over-ethernet\b|vsx update-software\b|poe mode disable|apboot\b|ap-re(group|name)\b|ifconfig \S+ down|ip (-\S+ )*l(i(nk?)?)? s(et?)? (dev )?\S+ down|cphaprob\b.*-s problem)\b/i;

/**
 * Cortan servicio y solo se reconocen por el fabricante (revisión del catálogo: los comandos se
 * declaraban "disruptive" y el motor daba "change" al escribirlos a mano). Cada alternativa lleva su
 * propia frontera: los valores pueden ser variables "{{x}}" y el "\b" final de DISRUPTIVE no las ve.
 * Aruba: trunk LACP (corta los puertos al agruparlos), IP de una VLAN (puede ser la de gestión),
 * "copy tftp startup-config" (reemplaza el arranque), AirMatch inmediato y borrar un usuario (reautentica).
 * FortiAP: VLAN de gestión y "restore <imagen> <ip>" (carga firmware). FortiOS: "diagnose sys kill" con
 * cualquier señal y comandos AT al módem. Grandstream (y todo equipo con "speed" como orden de interfaz):
 * velocidad fija y renegociación del enlace. Huawei: borrar MAC dinámicas. WatchGuard: terminar la sesión L2TP.
 * Solo al inicio de la línea: "show speed" o "type" en otro contexto no coinciden.
 */
const DISRUPTIVE_VENDOR = new RegExp(
  "^(" +
    [
      "trunk \\S+ trk\\S+ (lacp|trunk)(\\s|$)",
      "(no )?vlan \\S+ ip address(\\s|$)",
      "copy tftp startup-config(\\s|$)",
      "airmatch runnow(\\s|$)",
      "aaa user delete(\\s|$)",
      "cfg -a\\s+AP_MGMT_VLAN_ID=",
      "restore \\S+ (\\d{1,3}(\\.\\d{1,3}){3}|\\{\\{\\w+\\}\\})(\\s|$)",
      "diagnose sys kill \\S+",
      "diagnose extender cmd(\\s|$)",
      "speed (auto|\\d+[gm]?|\\{\\{\\w+\\}\\})(\\s|$)",
      "undo mac-address (dynamic|all)(\\s|$)",
      "no vpn-status l2tp(\\s|$)",
    ].join("|") +
    ")",
  "i",
);
/**
 * "spanning-tree mode <modo>" (Grandstream): reconverge el árbol. Solo con los modos de ese
 * fabricante y sin una línea "spanning-tree" suelta en el mismo texto: esa forma (Aruba, "spanning-tree"
 * y luego "spanning-tree mode mstp") habilita STP, no cambia el modo de uno que ya corre.
 */
const STP_MODE = /^spanning-tree mode (stp|rstp|mstp|pvst|rpvst|\{\{\w+\}\})\s*$/i;

/**
 * FortiOS: "diagnose ..." consulta salvo que lleve un verbo que cambia estado ("up" y "down"
 * levantan o bajan túneles, "wtp_filter" o "sniff" fijan filtros o capturas en el AP). El verbo
 * se busca también unido con "_" o "-" ("upload", "backup", "export" y "send" sacan datos del equipo).
 * "diagnose debug" va aparte (FORTI_DEBUG_READ): casi
 * todo lo que lleva activa o ajusta la depuración, que es un cambio de estado.
 */
const FORTI_DIAG_READ =
  /^diagnose(?!\s+debug\b)(?!.*(?:^|[\s_-])(clear|delete|del|reset|kill|killall|restart|flush|enable|disable|set|unset|start|stop|filter|update|purge|failover|clean|reload|test(?!-connectivity)|run|reboot|shutdown|up|down|recalculate|refresh|kick\w*|sniff|plain-ctl|atcmd|cmd|trigger|push|upgrade|add|remove|renew|release|erase|format|toggle|block|unblock|upload|backup|export|send)(?=$|[\s_-]))/i;
/** "diagnose debug" de solo lectura: estado, reportes y registros ya guardados. */
const FORTI_DEBUG_READ = /^diagnose debug (info|report|rating|crashlog read|config-error-log read|authd fsso (list|server-status|summary))\s*$/i;
const FORTI_EXEC_READ =
  /^execute (date|time|sensor list|disk list|dhcp lease-list|tac report|log display|log filter dump|ping6|traceroute6|ha manage|log fortianalyzer test-connectivity|switch-controller (get-conn-status|diagnose-connection|get-physical-conn|get-sync-status|get-upgrade-status|switch-software list-available)|extender list-fortiextender-image|modemfw (show all|getIMEI|checkSIM)|lte-modem (wireless-profile|PLMN-profile) list|usb-device list|5g-modem (carrier-config list|esim profile list)|vpn (ipsec|sslvpn) list)\b(?!\s+\d)/i;
/**
 * FortiAP (shell del AP): estado, configuración local y diagnósticos de solo lectura.
 * Quedan fuera cfg -a/-r/-c/-x, cw_diag -c scan-clr-all, vlan-probe-cmd, sniff, debug y
 * plain-ctl, que cambian estado o configuración.
 */
const FORTIAP_READ =
  /^(fap-get-status|fap-tech|presult|kinfo|cfg -[seh]|diag_debug_crashlog read|iwconfig( \S+)?|cw_diag (help|uptime|sys-performance|kernel-panic|power|stats \S+|-c (wtp-cfg|radio-cfg|vap-cfg|acs|acs-chan-stats|ha|ap-scan|sta-scan|sta-cap|wids|ap-suppress|darrp|temperature|all-countries|mesh|mesh-ap|k-lan-host|vlan-probe-rpt|wan1x|snmp)))\s*$/i;
/**
 * Check Point (Gaia clish/expert): comandos de consulta propios. Excluye explícitamente
 * las opciones que modifican (fw tab -x, fw ctl conntab -x, cphaprob -d ... register o
 * unregister), las capturas que escriben a disco (-o), el menú interactivo "vpn tu", que
 * permite borrar SA, y "mgmt_cli show" contra otro servidor (-m), que le entrega las credenciales.
 */
const CHECKPOINT_READ =
  /^(fw (ver|stat|tab\b(?!.*\s-x\b)|ctl (iflist|arp|conntab(?!.*\s-x\b)|multik (stat|print_heavy_conn)|affinity -l|fast_accel show_table|pstat|chain|get)\b|up_execute|samp get|log|lslogs|getifs)|fwaccel (stat|stats|conns|ver)\b|cphaprob\b(?!.*\s-d\b)(?!.*\b(un)?register\b)|cpstat|cpinfo(?!.*\s-o\b)|cplic print|cpview|cpwd_admin list|api status|mdsstat|mdsenv|\$MDSVERUTIL|vpn (tu (tlist|list)\b|overlap_encdom)|vsenv|vsx stat|ips stat|mgmt_cli show(?!.*\s(-m|--management)\s)|asg (monitor|stat)|connection_pipelining (status|heaviest_conn)|dynamic_balancing -p|cppcap(?!.*\s-o\b)|fw monitor(?!.*\s-o\b)|fgate stat|cp_log_export show|set virtual-system \S+$)/i;

/**
 * arp de consulta (Windows, macOS, Linux): solo opciones de lectura y a lo más una dirección.
 * "arp -a -d" borra todo en BSD/macOS, "arp -s" fija una entrada y "arp 192.0.2.1
 * 0000.1111.2222 arpa" o "arp arpa" son configuración de IOS: nada de eso es consulta.
 */
const ARP_OPT = "(\\s+(-[anveg]+|-[iNH]\\s+\\S+))*";
const ARP_READ = `arp${ARP_OPT}(\\s+((?=[^\\s]*[.:])[\\da-f.:]+|\\{\\{\\w+\\}\\})${ARP_OPT})?\\s*$`;

/**
 * Herramientas Linux de solo lectura (modo expert de Gaia y equipos basados en Linux). Cada
 * nombre termina en espacio o fin de línea: "ls" no cubre "lsof" ni "hostname" a
 * "hostnamectl". "date" y "hostname" con argumento que fija un valor quedan fuera ("date
 * 0101120025" fija la hora en BSD y GNU; "date -f" también en BSD salvo con -j). "ip" va
 * aparte (iprouteRead): "ip route ..." también es la ruta estática de IOS o VRP.
 * "top" y "free" también son órdenes de equipos de red: "top <comando>" de Junos ejecuta un comando de
 * configuración desde la raíz (normalize lo evalúa por ese comando) y "free user-interface|line" de VRP y Comware
 * desconecta a un usuario (EXTRA_DISRUPTIVE). Por eso solo son consulta solos o con opciones de Linux.
 */
const LINUX_READ = new RegExp(
  "^((uptime|df|du|cat|less|tail|head|grep|ls|lsof|lsns|lsblk|lscpu|lsmod|lsusb|lshw|uname|raid_diagnostic|lspci|netstat|ps|w|id|pwd)(\\s|$)|top(\\s+-.*)?$|free(\\s+(-\\S+|\\d+))*$|find(?!.*\\s-(exec|execdir|ok|okdir|delete|fprint\\w*|fls)\\b)(\\s|$)|dmidecode(?!.*\\s--dump-bin\\b)(\\s|$)|hostname( -\\w+)*\\s*$|" +
    "date(?!.*\\s(-s|--set)\\b)(?!(?!.*\\s-\\w*j).*\\s-\\w*f\\b)(?!(\\s+-\\w+)*\\s+\\d[\\d.]*\\s*$)(\\s|$)|" +
    ARP_READ +
    "|ss\\b|ifconfig( \\S+)?$)",
  "i",
);

/**
 * Opciones que escriben a disco o cambian estado, por comando; distinguen mayúsculas (sin
 * bandera "i").
 */
const [TCPDUMP_WRITE, TSHARK_WRITE, DMESG_WRITE, SS_WRITE, CURL_WRITE] = [
  // tcpdump: -w escribe la captura, -G rota archivos y -z ejecuta un comando al rotar. El argumento puede ir pegado
  // ("-wcap.pcap") y la letra puede cerrar un grupo de banderas sin argumento ("-nnw"); "-iwlan0" no cuenta (-i lleva
  // argumento). tshark: -w, -b (anillo) y -X (extensiones Lua).
  /^tcpdump\b.*\s-[^\sBcCEFGijmMrsTVwWyzZ]*[wGz]/,
  /^tshark\b.*\s-[nqQVxlpPSDL2]*[wbX]/,
  // dmesg -c/-C vacía el buffer del kernel; -n, -D y -E cambian el nivel de la consola. getopt_long acepta
  // prefijos inequívocos de las opciones largas ("--cl" es --clear).
  /^dmesg\b.*\s(-[A-Za-z]*[cCnDE]|--(cl|read-c|cons))/,
  // ss -D vuelca a un archivo (-K, que cierra conexiones, corta servicio: EXTRA_DISRUPTIVE_CS).
  /^ss\b.*\s(-[A-Za-z]*D|--d)/,
  // curl: otro método, datos o subida (-X, -d, -F, -T, --json…), escribir archivos (-o salvo a /dev/null, -O, -D, -c,
  // --etag-save, --hsts, --alt-svc, "-w %output{…}" desde curl 8.3) o leer opciones de un archivo (-K) ya no es una
  // consulta; tampoco un esquema que habla con otro servicio (gopher://, telnet://, dict://… envían comandos). Envían
  // el contenido de un archivo local al servidor: cookies (-b, --cookie), cabeceras "-H @archivo", --url-query,
  // --netrc-file y las variables de curl 8.3 (--variable nombre@archivo con --expand-*).
  /^curl\b.*(\s(-[A-Za-z]*[XdDFTOKcQb]|-[A-Za-z]*o\s*(?!\/dev\/null\b|nul\b|\$null\b)\S|--(request|data|form|upload-file|output|remote-name|config|json|cookie|post30[123]|dump-header|trace|trace-ascii|stderr|libcurl|create-dirs|ftp-create-dirs|quote|mail-rcpt|etag-save|hsts|alt-svc|output-dir|variable|expand-|url-query|netrc-file)|(-H|--header|--proxy-header)\s*['"]?@)|%output\{|\b(gopher|telnet|dict|ldaps?|smtps?|imaps?|pop3s?|mqtts?|rtsp|tftp|file|scp|sftp|smbs?|wss?):\/\/)/,
];
const WRITE_FLAGS: Record<string, RegExp> = {
  tcpdump: TCPDUMP_WRITE,
  tshark: TSHARK_WRITE,
  dmesg: DMESG_WRITE,
  ss: SS_WRITE,
  curl: CURL_WRITE,
  // nc sin -z abre una conexión de datos: lo que llegue por la entrada sale al otro equipo.
  nc: /^nc\b(?!.*\s-[A-Za-z46]*z)/,
  // dig -f lee las consultas de un archivo: cada línea sale como un nombre DNS hacia el servidor.
  dig: /^dig\b.*\s-[46mru]*f/,
  // openssl s_client: -sess_out, -keylogfile, -msgfile y -out escriben un archivo.
  openssl: /^openssl\b.*\s-(sess_out|keylogfile|msgfile|out)\b/,
};

/**
 * wget solo es consulta como "wget --spider <url>" con opciones de salida y de conexión. Cualquier otra opción
 * puede enviar un archivo (--post-file, --body-file), leer las URL de un archivo (-i, que con --base las arma con
 * cada línea) o escribir en disco.
 */
const WGET_READ_OPT = /^(--spider|-q|--quiet|-S|--server-response|-nv|--no-verbose|-v|--verbose|-4|-6|--inet[46]-only|--no-check-certificate|-T\d*|--timeout=\d+|-t\d*|--tries=\d+|--max-redirect=\d+)$/;
function wgetRead(line: string): boolean {
  const toks = line.split(/\s+/);
  for (let i = 1; i < toks.length; i++) {
    const t = toks[i];
    if (!t) continue;
    if (t[0] !== "-") continue;
    if (!WGET_READ_OPT.test(t)) return false;
    // -T 5, -t 3: el número va aparte.
    if ((t === "-T" || t === "-t") && /^\d+$/.test(toks[i + 1] ?? "")) i++;
  }
  return true;
}

/**
 * ethtool distingue mayúsculas: -k/-g/-a/-l/-c muestran y -K/-G/-A/-L/-C cambian (y -E
 * escribe la EEPROM), así que esta regla no puede ir con la bandera "i".
 */
const ETHTOOL_READ = /^ethtool( -[iSkgacmlTPne])? \S+$/;
/** iptables también distingue mayúsculas (-L lista, -A/-I/-D/-F cambian reglas). */
const IPTABLES_READ = /^ip6?tables(-legacy|-nft)?( -t \w+)?( (-[LSnvxV]+|--list\S*|--line-numbers|--version|[A-Za-z_][\w-]*))*$/;

/** firewall-cmd: todas las opciones deben ser de consulta (--list/--get/--query/--state/--info). */
const FWCMD_OPT = "\\s+(--(zone|policy|ipset|service|helper|icmptype)=\\S+|--permanent|-q|--quiet|--(state|list|get|query|info)[\\w=./:{}-]*)";

/**
 * Sistemas operativos (Windows, macOS, Linux): consultas de red. Los subcomandos que
 * cambian estado (add, del, set, flush, up/down…) quedan fuera a propósito.
 */
const OS_READ = new RegExp(
  "^(" +
    [
      // Windows
      "ipconfig(\\s+/(all|displaydns|allcompartments))*\\s*$",
      // Test-ComputerSecureChannel -Repair rehace la relación con el dominio; Format-Volume borra.
      "(Get|Test(?!-ComputerSecureChannel\\b.*\\s-Repair\\b)|Resolve|Find|Measure|Select|Where|Sort|Show|Compare)-\\w+|Format-(Table|List|Wide|Custom|Hex)\\b",
      // netsh [contexto...] show: "show" debe ser el verbo (antes de él solo contextos). "-r equipo" (con -u/-p) se
      // conecta por RPC a otro equipo y se autentica ante él: no es consulta.
      "netsh(\\s+-c\\s+\\S+)*(\\s+(?!(set|add|delete|del|reset|start|stop|dump|connect|disconnect|import|export|install|uninstall|exec|flush|renew|release|refresh|reconnect|update|init|commit|abort|alias|unalias|offline|online|pushd|popd)\\b)[a-z0-9][\\w-]*){0,5}\\s+show\\b",
      "route print|getmac|nbtstat -[acnsS]\\b|pathping|systeminfo|whoami|typeperf(?!.*\\s-o\\b)|w32tm /(query|stripchart|monitor|tz)\\b",
      // pktmon etl2txt|etl2pcap|format|pcapng escriben un archivo convertido: no son consulta.
      "pktmon (status|list|filter list|counters)\\b",
      "(Get-Content|gc|type) .*hosts$",
      "\\(Get-\\w+|\\$PSVersionTable\\b|tasklist\\b|rasdial$|net (use|view|share|config \\w+|statistics \\w+)$",
      "nltest /(dsgetdc|sc_query|sc_verify|dclist|domain_trusts|dsgetsite|query|parentdomain|dnsgetdc)\\b",
      // macOS
      "ipconfig (getifaddr|getpacket|getsummary|getoption|getiflist|getv6packet|getra)\\b",
      "networksetup -(list|get|print|show|version|help)\\w*",
      "scutil (-r\\b|--(dns|nwi|proxy|get)\\b|--nc (list|status|show|statistics)\\b)",
      "dscacheutil -(q|statistics|cachedump)\\b",
      "dns-sd -[BGLQZ]\\b",
      // wdutil diagnose y wdutil log escriben archivos o cambian el nivel de registro.
      "nettop|ndp(\\s+-[anprt]+)+(\\s+[^\\s-]\\S*)?\\s*$|(\\S*/)?airport -[Is]\\b|ifconfig( -\\w+)*( \\S+)?$|system_profiler|sw_vers|networkQuality|wdutil( info)?\\s*$",
      "(\\S*/)?socketfilterfw --(get|list)\\w*(?!.*\\s--(set|add|remove|block|unblock))",
      // pfctl procesa todas sus opciones: "pfctl -sr -F all" también vacía reglas.
      "pfctl(\\s+(-[vgrqn]*s\\s*\\w+|-[vgrqn]+|-a\\s+\\S+))+\\s*$",
      "log (show|stream)\\b",
      "route (-n )?(get|monitor)\\b|route(\\s+-[nveFC]+)*\\s*$",
      ARP_READ,
      // Linux. resolvectl dns|domain|llmnr… con interfaz y valor fija ese valor.
      "resolvectl(\\s+(status|query|statistics|show-cache|show-server-state|monitor)\\b.*|\\s+(dns|domain|llmnr|mdns|dnssec|dnsovertls|default-route|nta)(\\s+\\S+)?\\s*|\\s*)$",
      "systemd-resolve --(status|statistics)\\b",
      "netplan (get|status)\\b",
      "networkctl (status|list|lldp|cat)\\b",
      "wicked (show|ifstatus|show-config)\\b",
      "ifquery\\b",
      "iw (list|event\\b.*|reg get\\b.*|(dev|phy)(\\s+\\S+)?(\\s+(info|link|station (dump|get \\S+)|survey dump|scan( dump)?|mpath dump|mpp dump|get \\S+|channels|wowlan show|coalesce show))?)\\s*$",
      "nstat|sar -n|vnstat(?!.*\\s(-[ur]\\b|--(add|remove|rename|setalias|alias|delete|create|update|reset\\w*|rebuild\\w*|enable|disable|force|config)))|iftop|nload|bmon|tshark|mtr\\b|getent\\b|dig\\b|host\\b|wget --spider|curl\\b",
      // nc solo para probar un puerto (sin -e/-c, que ejecutan, ni -l, que escucha).
      "nc(\\s+(-[zvnu46]+|-[zvnu46]*[wGi]\\s*\\d+))+(\\s+[^\\s-]\\S*){1,2}\\s*$",
      "conntrack -[LSCE]\\b|nft( -[ancsejyNSpTt]+)* (list|monitor)\\b|ip6?tables(-legacy|-nft)?-save$",
      `firewall-cmd(?=.*\\s--(state|list|get|query|info))(${FWCMD_OPT})+\\s*$|ufw status\\b|ufw show\\b`,
      // arping -U/-A (ARP gratuito) o -s (otro origen) alteran las tablas ARP de los vecinos.
      "arping(?!.*\\s-[a-zA-Z]*[UAs])\\b.*-c \\d+|lldpctl\\b|lldpcli show\\b|swanctl --(list|stats)\\S*|wg( show\\b|$)|getenforce$|sestatus\\b|aa-status$|openssl s_client\\b|teamdctl \\S+ state( view| dump| item get \\S+)?\\s*$",
      "tc (-\\w+ )*(qdisc|class|filter) show\\b",
      "sysctl(\\s+-[aAbeNnoqrxXdh]+|\\s+[a-z][\\w.-]*)*\\s*$|journalctl\\b(?!.*\\s--(vacuum|rotate|flush|sync|relinquish|smart-relinquish|setup-keys|update-catalog))|dmesg\\b|hostnamectl( status)?$|timedatectl( (status|show|timesync-status|show-timesync))?$|chronyc (tracking|sources|sourcestats)\\b",
      "rc-service \\S+ status|rc-status\\b|systemctl (status|is-active|is-enabled|is-failed|show|cat|list-[\\w-]+)\\b",
      "traceroute6|ping6|tracepath6?",
    ].join("|") +
    ")",
  "i",
);

/** Sistemas operativos: acciones que cortan la red del equipo o requieren reinicio. */
const OS_DISRUPTIVE = new RegExp(
  "^(" +
    [
      "ipconfig /release6?\\b",
      "netsh wlan (disconnect|connect)\\b|rasdial\\b.*/disconnect\\b",
      "(Disable|Restart)-NetAdapter\\b|Remove-NetIPAddress\\b|Remove-NetRoute\\b|Set-DnsClientServerAddress\\b|(Restart|Stop)-Computer\\b|Format-Volume\\b",
      "netsh (int|interface) (ip|ipv4|ipv6|tcp) reset\\b|netsh winsock reset\\b",
      // Quitar o vaciar direcciones y rutas, o reemplazar la ruta por defecto.
      "ip (-\\S+ )*(addr|address|a) (flush|del|delete)\\b|ip (-\\S+ )*(route|r) (flush|del|delete)\\b|ip (-\\S+ )*(route|r) (replace|change) default\\b",
      "nmcli( -\\S+)* ((c|con|connection) down|(n|networking) off|(r|radio) \\S+ off|(d|dev|device) (disconnect|down))\\b",
      "systemctl (restart|stop) (NetworkManager|networking|network|systemd-networkd|wicked)\\b",
      "netplan apply\\b|dhclient -r\\b|ifdown\\b|rc-service networking (restart|stop)\\b|networkctl (reconfigure|down)\\b|wicked (ifreload|ifdown)\\b",
      // Cambiar DNS, IP o el modo DHCP de un servicio corta la resolución o la sesión remota.
      "networksetup -(setnetworkserviceenabled \\S+ off|setairportpower \\S+ off|setdnsservers|setmanual\\b|setdhcp|setairportnetwork)",
      "ipconfig set \\S+ (DHCP|BOOTP|MANUAL|INFORM|NONE|LINKLOCAL)\\b",
      // Borrar cualquier ruta (no solo la por defecto) o vaciar la tabla ARP completa.
      "route (-n )?(delete|del)\\b",
      "arp -d (\\*|-a)(\\s|$)|arp(?=.*\\s-[a-z]*a)(?=.*\\s-[a-z]*d)\\b",
    ].join("|") +
    ")",
  "i",
);

/** Abreviaturas inequívocas de "show" (Cisco, Junos): palabras que pueden seguir a "sh"/"sho". */
const SHOW_WORDS = [
  "aaa", "access-lists", "accounting", "adjacency", "aliases", "ap", "archive", "arp", "authentication", "bfd", "bgp", "boot",
  "bootflash:", "bootvar", "buffers", "cable-diagnostics", "cdp", "chassis", "class-map", "clock", "cluster", "conn", "configuration",
  "controllers", "crypto", "cts", "debugging", "device-tracking", "dhcp", "diag", "dot1x", "eigrp", "environment", "errdisable",
  "etherchannel", "ethernet-switching", "failover", "feature", "fex", "file", "firewall", "flash:", "hardware", "history",
  "hosts", "hsrp", "idprom", "interfaces", "inventory", "ip", "ipv6", "isis", "lacp", "license", "line", "lldp", "logging",
  "mac", "mac-address-table", "memory", "module", "monitor", "mpls", "nat", "nve", "ntp", "object-group", "ospf", "platform",
  "policy-map", "port-channel", "power", "privilege", "processes", "protocols", "qos", "redundancy", "rip", "route", "route-map",
  "running-config", "sdm", "security", "services", "snmp", "spanning-tree", "ssh", "standby", "startup-config", "storm-control",
  "switch", "system", "tech-support", "terminal", "track", "udld", "users", "version", "vlan", "vpc", "vpn-sessiondb", "vrf",
  "vrrp", "vtp", "wlan", "xlate",
];

/**
 * "sh"/"sho" (show) y "dis"…"displa" (display de Huawei) seguidos de una palabra de consulta.
 * Para "sh" la palabra debe ser el comienzo (2 letras o más) de una de SHOW_WORDS o "?": así
 * "sh -c reboot", "sh ./x.sh" o "sh deploy" (shell de Linux) no pasan por consulta. "dis" de
 * IOS es ambiguo (disable, disconnect) y el equipo lo rechaza sin ejecutar nada.
 */
function abbrevRead(line: string): boolean {
  const m = /^(sho?|dis(?:p(?:l(?:a)?)?)?)\s+(\S+)/i.exec(line);
  if (!m) return false;
  const t = m[2].toLowerCase();
  if (m[1][0] === "d" || m[1][0] === "D") return /^[a-z?]/.test(t);
  if (t === "?") return true;
  const w = t.endsWith("?") ? t.slice(0, -1) : t;
  return w.length >= 2 && /^[a-z][a-z0-9-]*:?$/.test(w) && SHOW_WORDS.some((x) => x.startsWith(w));
}

/** Prefijo de `word` (abreviaturas por prefijo de iproute2 y nmcli). */
const isAbbr = (t: string, word: string) => t.length > 0 && word.startsWith(t);

/**
 * Subcomandos de iproute2 que cambian algo. Una abreviatura de consulta que también es el
 * comienzo de uno de ellos no se acepta: "ip link s" es "set", no "show".
 */
const IP_CHANGE_SUBS = ["add", "append", "attach", "change", "chg", "del", "delete", "deleteall", "exec", "flush", "prepend", "property", "replace", "restore", "save", "set", "test", "update"];

interface IpTool {
  /** Objetos en el orden en que el programa resuelve las abreviaturas (gana el primero). */
  objects: string[];
  /** Subcomandos de consulta por objeto (true: todo es consulta, como "monitor"). */
  read: Record<string, readonly string[] | true>;
}

const SHOW_LIST = ["show", "list", "lst"];
const IP: IpTool = {
  objects: ["address", "addrlabel", "maddress", "route", "rule", "neighbor", "neighbour", "ntable", "ntbl", "link", "l2tp", "fou", "ila", "macsec", "tunnel", "tuntap", "tap", "token", "tcpmetrics", "tcp_metrics", "monitor", "xfrm", "mroute", "mrule", "netns", "netconf", "vrf", "sr", "nexthop", "mptcp", "ioam", "stats", "help"],
  read: {
    address: [...SHOW_LIST, "showdump"], addrlabel: ["list"], maddress: SHOW_LIST, route: [...SHOW_LIST, "get"], rule: SHOW_LIST,
    neighbor: [...SHOW_LIST, "get"], neighbour: [...SHOW_LIST, "get"], ntable: SHOW_LIST, ntbl: SHOW_LIST,
    link: [...SHOW_LIST, "xstats", "afstats"], l2tp: ["show"], fou: ["show"], ila: SHOW_LIST, macsec: ["show"],
    tunnel: SHOW_LIST, tuntap: SHOW_LIST, tap: SHOW_LIST, token: ["list", "get"], tcpmetrics: [...SHOW_LIST, "get"],
    tcp_metrics: [...SHOW_LIST, "get"], monitor: true, mroute: SHOW_LIST, mrule: SHOW_LIST,
    netns: ["list", "list-id", "identify", "pids", "monitor"], netconf: ["show"], vrf: [...SHOW_LIST, "identify", "pids"],
    nexthop: [...SHOW_LIST, "get"], stats: ["show"], help: true,
  },
};
const BRIDGE: IpTool = {
  objects: ["link", "fdb", "mdb", "vlan", "vni", "monitor", "help"],
  read: { link: SHOW_LIST, fdb: [...SHOW_LIST, "get"], mdb: SHOW_LIST, vlan: [...SHOW_LIST, "tunnelshow"], vni: SHOW_LIST, monitor: true, help: true },
};

/**
 * "ip" y "bridge" de iproute2: consulta solo sin subcomando o con show/list/get (y sus
 * abreviaturas). Así "ip route 0.0.0.0 0.0.0.0 192.0.2.1" (ruta estática de IOS/VRP),
 * "ip address 192.0.2.2 24" o "bridge fdb add …" no pasan por la consulta de Linux.
 */
function iprouteRead(toks: string[], tool: IpTool): boolean {
  let i = 1;
  for (; i < toks.length && toks[i][0] === "-"; i++) {
    const o = toks[i].replace(/^--?/, "");
    // -batch (y -force) ejecutan los comandos de un archivo.
    if (/^(b|ba\w*|fo\w*)$/.test(o)) return false;
    // Opciones con argumento: -family, -netns, -loops, -rcvbuf.
    if (/^(f|fa\w*|n|ne\w*|l|lo\w*|rc|rcv\w*)$/.test(o)) i++;
  }
  if (i >= toks.length) return true;
  const t = toks[i].toLowerCase();
  const obj = tool.objects.find((w) => isAbbr(t, w));
  const rule = obj && tool.read[obj];
  if (!rule) return obj === "xfrm" && xfrmRead(toks.slice(i + 1));
  if (rule === true || i + 1 >= toks.length) return true;
  return readSub(toks[i + 1].toLowerCase(), rule);
}

const readSub = (s: string, words: readonly string[]) => words.some((w) => isAbbr(s, w)) && !IP_CHANGE_SUBS.some((w) => isAbbr(s, w));

/** "ip xfrm state|policy [list|get|count]" y "ip xfrm monitor". */
function xfrmRead(rest: string[]): boolean {
  const o = rest[0]?.toLowerCase() ?? "";
  if (isAbbr(o, "monitor") && o.length > 1) return true;
  if (!isAbbr(o, "state") && !isAbbr(o, "policy")) return false;
  return rest.length < 2 || readSub(rest[1].toLowerCase(), ["list", "get", "count"]);
}

/** nmcli: opciones que llevan argumento. */
const NMCLI_ARG = /^(-[mcfgew]|--(mode|colors|fields|get-values|escape|wait))$/;

/**
 * nmcli de consulta. Objetos y subcomandos se abrevian por prefijo (nmcli toma el primero
 * de su lista), así que un prefijo que también es de un subcomando que cambia no se acepta
 * ("nmcli c m" es modify). "general hostname X", "radio wifi off" o "device wifi hotspot"
 * cambian estado.
 */
function nmcliRead(toks: string[]): boolean {
  let i = 1;
  for (; i < toks.length && toks[i][0] === "-"; i++) if (NMCLI_ARG.test(toks[i])) i++;
  if (i >= toks.length) return true;
  const objects = ["general", "networking", "radio", "connection", "device", "agent", "monitor", "help"];
  const obj = objects.find((w) => isAbbr(toks[i].toLowerCase(), w));
  const rest = toks.slice(i + 1).map((x) => x.toLowerCase());
  const sub = (read: string[], change: string[]) => !rest.length || (read.some((w) => isAbbr(rest[0], w)) && !change.some((w) => isAbbr(rest[0], w)));
  switch (obj) {
    case "monitor":
    case "help":
      return true;
    case "general":
      return rest.length <= 1 && sub(["status", "hostname", "permissions", "logging"], ["reload"]);
    case "networking":
      return !rest.length || (isAbbr(rest[0], "connectivity") && (rest.length === 1 || (rest.length === 2 && rest[1] === "check")));
    case "radio":
      return rest.length <= 1 && sub(["all", "wifi", "wwan"], []);
    case "connection":
      return sub(["show", "monitor"], ["up", "down", "add", "modify", "clone", "edit", "delete", "reload", "load", "import", "export", "migrate"]);
    case "device": {
      const change = ["set", "connect", "reapply", "modify", "disconnect", "delete", "up", "down"];
      if (!rest.length || (rest.length <= 2 && sub(["status", "show", "monitor"], change))) return true;
      if (isAbbr(rest[0], "wifi") || isAbbr(rest[0], "lldp")) return rest.length === 1 || isAbbr(rest[1], "list") || rest[1] === "show-password";
      return false;
    }
    default:
      return false;
  }
}

/**
 * ssh (OpenSSH): banderas sin argumento. Cualquier otra letra (-l, -p, -o, -i… y las de IOS
 * como -c o -m) se trata como opción con argumento.
 */
const SSH_FLAG = "46AaCfGgKkMNnqsTtVvXxYy";
/** Palabras que tras ssh/telnet/stelnet son configuración del servidor o del cliente, no un destino. */
const LOGIN_CONFIG = /^(server|server-source|client|client-source|user|version|timeout|key|key-exchange|cipher|hmac|stricthostkeycheck|authentication-retries|authentication-type|login-attempts|scp|sftp|port|pubkey-chain|maxstartups|keepalive|rekey|ipv4|source-interface|acl|acl6|vpn-instance-source|dh|rsa|ecc|password|max-sessions|first-time|enable|disable|listen|session)$/i;

/**
 * Cliente ssh/telnet/stelnet: null si no lo es (configuración o una forma desconocida), ""
 * si solo abre la sesión y, con ssh, el comando que se ejecutará en el otro equipo (vale al
 * menos cambio: corre en otro equipo y su salida o la entrada local cruzan hacia él; "ssh host
 * reboot" corta servicio). Una opción que ejecuta algo localmente (ProxyCommand, LocalCommand),
 * que lee comandos de un archivo o que abre un túnel o reenvía puertos no es consulta.
 */
function remoteCommand(line: string): string | null {
  const m = /^(ssh|telnet|stelnet)\s+(\S.*)$/i.exec(line);
  if (!m) return null;
  const toks = m[2].split(/\s+/);
  const kind = m[1].toLowerCase();
  let i = 0;
  if (kind === "ssh") {
    for (; i < toks.length && toks[i][0] === "-" && toks[i].length > 1; i++) {
      const t = toks[i];
      if (t.startsWith("--")) continue;
      // IOS: -vrf X, -source-interface X.
      if (/^-(vrf|source-interface)$/i.test(t)) {
        i++;
        continue;
      }
      for (let k = 1; k < t.length; k++) {
        const c = t[k];
        if (SSH_FLAG.includes(c)) {
          // IOS: "-v 2" fija la versión de SSH (en OpenSSH -v no lleva argumento).
          if (c === "v" && k === t.length - 1 && /^[12]$/.test(toks[i + 1] ?? "")) i++;
          continue;
        }
        // -O (control), -F (archivo de configuración) e -I (biblioteca PKCS#11) cargan o ejecutan algo local. -L, -R,
        // -D, -W y -w abren un túnel o reenvían puertos (un canal de datos hacia o desde otro equipo); -E escribe un archivo.
        if ("OFILRDWwE".includes(c)) return null;
        const arg = k < t.length - 1 ? t.slice(k + 1) : toks[++i] ?? "";
        if (c === "o") {
          const opt = arg.replace(/['"]/g, "");
          if (/(proxy|local|knownhosts)command|permitlocalcommand|pkcs11provider|securitykeyprovider|forward|tunnel|sendenv|setenv|stdinnull|sessiontype|logfile/i.test(opt)) return null;
          // RemoteCommand: el comando que corre en el otro equipo (con lo que sigue, por si venía entre comillas).
          if (/^remotecommand\b/i.test(opt)) return [opt.replace(/^remotecommand\s*=?\s*/i, ""), ...toks.slice(i + 1)].join(" ").replace(/['"]/g, "");
        }
        break;
      }
    }
    const dest = toks[i];
    if (!dest || LOGIN_CONFIG.test(dest)) return null;
    // Junos y VRP aceptan opciones tras el destino (routing-instance X, port N, inet…).
    for (i++; i < toks.length; i++) {
      if (/^(routing-instance|source|port|logical-system|interface|vpn-instance|identity-key|user-identity-key|prefer_\w+)$/i.test(toks[i])) i++;
      else if (!/^(inet6?|bypass-routing|no-resolve)$/i.test(toks[i])) break;
    }
    const cmd = toks.slice(toks[i] === "--" ? i + 1 : i).join(" ");
    const q = /^(["'])(.*)\1$/.exec(cmd);
    return q ? q[2] : cmd;
  }
  // telnet/stelnet: destino y a lo más un puerto, con las opciones de cada sistema (IOS
  // /vrf X, Junos port N o routing-instance X, VRP -a/-i origen, Linux -l usuario). -n
  // escribe un archivo de traza.
  const positional: string[] = [];
  for (; i < toks.length; i++) {
    const t = toks[i];
    if (/^-n$/.test(t)) return null;
    if (/^(-[abilpe]|\/(vrf|source-interface|route:?)|port|routing-instance|source|interface|vpn-instance|-vpn-instance|identity-key|user-identity-key|prefer_\w+)$/i.test(t)) i++;
    else if (/^(-\S*|\/\S+|inet6?|bypass-routing|no-resolve|ipv6)$/i.test(t)) continue;
    else positional.push(t);
  }
  if (!positional.length || LOGIN_CONFIG.test(positional[0])) return null;
  if (positional.length > 2 || (positional[1] !== undefined && !/^(\d+|[a-z][\w-]*|\{\{\w+\}\})$/i.test(positional[1]))) return null;
  // "telnet 10.0.0.0 255.0.0.0" sin interfaz tampoco es un cliente (es incompleto de ASA).
  if (positional[1] && /^\d+\.\d+\.\d+\.\d+$/.test(positional[1])) return null;
  return "";
}

/**
 * Llamadas a métodos (".Delete()", ".Reboot()" de WMI o .NET). Solo los de esta lista son de
 * consulta; los de POWER_METHOD reinician o apagan el equipo, sueltan su IP o terminan procesos.
 */
const METHOD_CALL = /\.([A-Za-z_]\w*)\s*\(/g;
const READ_METHOD = /^(To\w+|Trim\w*|Split|Replace|Contains\w*|StartsWith|EndsWith|Substring|(Last)?IndexOf\w*|Pad(Left|Right)|Get\w*|Equals|CompareTo|Add(Days|Hours|Minutes|Seconds|Milliseconds|Months|Years|Ticks)|Normalize|IsMatch|Match(es)?|Format|Where|Count)$/i;
const POWER_METHOD = /^(Reboot|Shutdown|Win32Shutdown\w*|ReleaseDHCPLease\w*|Disable|Kill|Terminate)$/i;
/**
 * ">" y ">>" (también "2>", "&>") escriben un archivo, salvo a /dev/null, $null o nul. "2>&1" y
 * ">&2" solo redirigen a otra salida. "<>" abre el archivo para leer y escribir.
 */
const REDIRECT_WRITE = /(?:^|[^-=<>])(?:\d|&)?>{1,2}\s*(?!&\d|\/dev\/(null|stdout|stderr)\b|\$null\b|nul\b)\S|<>\s*\S/i;
/**
 * Redirecciones que no escriben nada: se quitan antes de reconocer la consulta. Solo empieza al comienzo de
 * un tramo de espacios ((?<!\s)): sin eso, cada espacio de una línea larga era un intento nuevo que recorría
 * el resto del tramo (tiempo cuadrático: 100 KB de espacios tardaban segundos).
 */
const SAFE_REDIRECT = /(?<!\s)\s+(?:\d|&)?>{1,2}\s*(?:&\d|\/dev\/null|\$null|nul)(?=\s|$)/gi;

/** Navegación de contexto en FortiOS con VDOM (no cambia configuración). El nombre no lleva metacaracteres de shell. */
const FORTI_CONTEXT = /^(config global|config vdom|edit ("[^"$`]*"|[\w.@:/-]+|\{\{\w+\}\})|end|next)$/i;

/**
 * Cortan servicio y el motor de catálogo no los cubría (auditoría del motor de riesgo). Red: sesiones y tablas de
 * ASA/IOS (conn, xlate, line, arp-cache) y "free user-interface" de VRP, quitar un proceso de enrutamiento o una interfaz lógica, failover de ASA,
 * "boot" de ArubaOS-Switch (reinicia), aplicar un checkpoint de Aruba, instalar Junos con reboot, reinicio de
 * procesos de FortiOS, sacar a un administrador, "fw sam" de inhibición (bloquea tráfico) y "del" con un sistema de
 * archivos de IOS ("del flash:x"; "del C:\x" de Windows queda como cambio). Sistemas: apagar o aislar con systemctl,
 * detener servicios (service, sc, Stop-Service, launchctl), runlevels 0/1/6, formatear o escribir discos, vaciar el
 * firewall o la tabla de rutas, borrar interfaces, rm/chmod recursivos sobre "/", bajar interfaces o cambiar la IP
 * (netsh, Set-NetIPAddress), reiniciar por WMI/CIM o con -AutoReboot, y apagar el acceso remoto de macOS.
 */
const BLOCK_DEV = "\\/dev\\/(sd[a-z]|nvme\\d|hd[a-z]|vd[a-z]|xvd[a-z]|mmcblk\\d|r?disk\\d|md\\d|dm-\\d|mapper\\/|loop\\d|mtd(block)?\\d)";
const EXTRA_DISRUPTIVE = new RegExp(
  "^(" +
    [
      "clear (conn|xlate|local-host|line|arp-cache)\\b",
      // VRP y Comware: desconectar a un usuario de una línea (como "clear line" de IOS).
      "free (user-interface|line)\\b",
      "clear configuration interface\\b",
      "no router (bgp|ospf|ospfv3|eigrp|isis|rip)\\b",
      "undo (ospf|ospfv3|bgp|isis|rip)(\\s+\\d+)?\\s*$",
      "(no|undo) interface \\S+\\s*$",
      "no failover\\s*$|failover (active|reload-standby)\\b",
      "boot\\s*$",
      "copy checkpoint \\S+ running-config\\b",
      "request system software add\\b.*\\sreboot\\b",
      "execute router restart\\b",
      "fw sam\\b.*\\s-[a-z]*[ij]\\b",
      "del(ete)?\\s+(\\/\\S+\\s+)*[a-z][\\w-]+:",
      "systemctl(\\s+-\\S+)*\\s+(reboot|poweroff|halt|kexec|soft-reboot|isolate|emergency|rescue|suspend|hibernate|hybrid-sleep|suspend-then-hibernate|stop|kill)\\b",
      "service \\S+ stop\\b",
      "(tel)?init\\s+[016sS]\\s*$",
      "(mkfs|mke2fs|mkswap|wipefs|mkdosfs|mkntfs|newfs)\\S*(\\s|$)",
      `(dd|shred)\\b.*\\s(of=)?${BLOCK_DEV}`,
      "nft(\\s+-\\S+)*\\s+(flush|delete)\\s+(ruleset|table)\\b",
      "ip\\s+(-\\S+\\s+)*l(i(nk?)?)?\\s+(del|delete)\\b",
      "rm(?=\\s)(?=.*\\s(-[a-z]*r[a-z]*|--recursive)(\\s|$))(?=.*\\s(\\/|\\/\\*|\\/\\.\\*)(\\s|$))",
      "(chmod|chown|chgrp)(?=\\s)(?=.*\\s(-[a-z]*r|--recursive)(\\s|$))(?=.*\\s\\/(\\s|$))",
      "taskkill\\b|Stop-Process\\b|spps\\b",
      "Stop-Service\\b|spsv\\b|sc(\\.exe)?\\s+(\\\\\\\\\\S+\\s+)?(stop|pause)\\b",
      "launchctl\\s+(unload|bootout|stop|remove|kill)\\b",
      "diskutil\\s+(eraseDisk|eraseVolume|zeroDisk|randomDisk|secureErase|partitionDisk|reformat|apfs\\s+(deleteContainer|eraseVolume|deleteVolume))\\b",
      "route\\s+(-n\\s+)?flush\\b",
      "networksetup\\s+-(setv6off|setv4off)\\b",
      "systemsetup\\s+-setremotelogin\\s+off\\b",
      "(Set-NetIPAddress|Disable-NetAdapterBinding|Remove-NetAdapter\\w*)\\b",
      "netsh\\s+(int|interface)\\s+set\\s+(int|interface)\\b.*\\s(disabled?|admin=disabled?)(\\s|$)",
      "netsh\\s+(int|interface)\\s+(ip|ipv4|ipv6)\\s+(set|delete)\\s+(address|dns\\w*)\\b",
      "Invoke-(Cim|Wmi)Method\\b.*\\s-(MethodName|Name)\\s+['\"]?(Reboot|Shutdown|Win32Shutdown\\w*|Terminate)\\b",
      "\\S.*\\s-AutoReboot\\b",
    ].join("|") +
    ")",
  "i",
);
/** Los mismos, con opciones que distinguen mayúsculas (iptables -F vacía, -f es fragmento; route -f de Windows; pfctl -F). */
const EXTRA_DISRUPTIVE_CS = new RegExp(
  "^(" +
    [
      // Vaciar las reglas o fijar la política en DROP/REJECT: con política por defecto DROP, vaciar corta la sesión.
      "ip6?tables(-legacy|-nft)?\\b.*\\s(-[a-zA-Z]*F|--flush|(-P|--policy)\\s+\\S+\\s+(DROP|REJECT))(\\s|$)",
      "pfctl\\b.*\\s-[a-zA-Z]*F",
      "route\\s+([-/][a-zA-Z]+\\s+)*[-/]f(\\s|$)",
      "ss\\b.*\\s(-[A-Za-z]*K|--k)",
    ].join("|") +
    ")",
);
/** Abren el watchdog (reinicio al vencer) o disparan SysRq: cortan aunque solo se lean. Un disco como destino de escritura. */
const SPECIAL_PATH = /\/dev\/watchdog\d*\b|\/proc\/sysrq-trigger\b/;
const BLOCK_WRITE = new RegExp(`>{1,2}\\s*${BLOCK_DEV}|^tee\\b(\\s+-\\S+)*\\s+${BLOCK_DEV}`, "i");

/**
 * Formas de consulta que en realidad cambian algo (la regla de consulta del comando las aceptaba): "fw tab -a"
 * agrega una entrada, "fw logswitch" rota el log, "fwaccel stats -r" y "nstat -r" reinician contadores, "cpview
 * history" lo enciende o apaga, "systemd-resolve --flush-caches" y similares, "date -us" o "--se=" (prefijo de
 * --set), journalctl con prefijos de --vacuum/--rotate/--flush…, "write" abreviado en capturas de Junos y NX-OS,
 * FortiOS "execute date|time <valor>" y "Get-WindowsUpdate -Install".
 */
const EXTRA_CHANGE = new RegExp(
  "^(" +
    [
      "fw (tab\\b.*\\s-a\\b|logswitch\\b)",
      "fwaccel stats?\\b.*\\s-r\\b",
      "cpview\\b.*\\shistory\\b",
      "systemd-resolve\\b.*\\s--(flush|reset|set|revert|interface)",
      "resolvectl\\b.*\\s(flush-caches|reset-\\S+|revert)\\b",
      "nstat\\b.*\\s(-[a-z]*r|--reset)\\b",
      "journalctl\\b.*\\s--(vac|rot|flu|syn|rel|sma|set|upd)",
      "execute (date|time)\\s+\\S",
      "Get-\\w+\\b.*\\s-(Install|AcceptAll|Download)\\b",
    ].join("|") +
    ")",
  "i",
);
/** date: -s y --set (también en grupo, "-us", y abreviado, "--se"); -I lleva su argumento pegado ("-Iseconds"). */
const DATE_SET = /^date\b.*\s(-(?!I)[a-zA-Z]*s|--se?t?(=|\s|$))/;

/**
 * Filtros de tubería que solo leen su entrada. Aplica tras un "|" y también como primer comando (con su validación:
 * "sort -o" y "uniq entrada salida" escriben, "Tee-Object" solo con -Variable). awk, sed y find van aparte.
 */
const PIPE_READ_WORDS = new Set(
  (
    "grep egrep fgrep zgrep rg head tail wc cut tr less more tac nl column fold fmt rev expand unexpand jq xxd hexdump od strings " +
    "base64 md5sum sha1sum sha256sum sha512sum cksum findstr echo true cat diff cmp comm pr " +
    "select-string sls where-object where ? select-object select sort-object measure-object measure out-string oss out-host oh " +
    "out-null out-gridview ogv group-object group get-unique gu get-member gm format-table ft format-list fl format-wide " +
    "format-custom convertto-json convertto-csv convertto-html convertto-xml convertfrom-json convertfrom-csv convertfrom-string " +
    "select-xml compare-object write-output"
  ).split(" "),
);
const PIPE_READ_CHECK = new Map<string, (c: string) => boolean>([
  ["sort", (c) => !/\s(-[a-zA-Z]*o|--o)/.test(c)],
  ["uniq", (c) => c.split(/\s+/).filter((t, i) => i > 0 && !t.startsWith("-")).length <= 1],
  ["tee-object", (c) => /\s-Var(iable)?\b/i.test(c)],
]);

/**
 * Filtros de "|" tras un show/display/get de equipo de red. Los de REGEX toman el resto de la línea como expresión
 * ("| include up|reload": el segundo "|" es parte de ella). Los de WRITE guardan la salida en el equipo ("| redirect"
 * y "| append" de IOS, "| tee", "| save" de Junos, "| file" de IOS XR) y se reconocen abreviados como los acepta el
 * equipo ("| red", "| appe", "| te", "| sav"). Ante una abreviatura que puede ser de los dos, gana la escritura,
 * salvo "| s" (section en IOS, save en Junos): es save solo con un único argumento con forma de archivo.
 */
const SHOW_REGEX_FILTERS = ["include", "exclude", "begin", "section", "match", "except", "find", "grep", "egrep"];
const SHOW_READ_FILTERS = ["count", "no-more", "last", "display", "json", "json-pretty", "xml", "trim", "hold", "resolve", "compare", "head", "tail", "wc", "sort", "uniq", "less", "more", "format", "linenum", "refresh", "utility"];
const SHOW_WRITE_FILTERS = ["redirect", "append", "tee", "save", "file"];
const SHOW_HEADS = new Set(["show", "display", "get", "dir", "more"]);

/** Intérpretes: ejecutan lo que reciben por la entrada estándar o en un argumento. */
const SHELLS = new Set(["sh", "bash", "zsh", "ksh", "mksh", "dash", "ash", "yash", "fish", "csh", "tcsh", "rbash"]);
const INTERPRETERS = /^(python[\d.]*|pypy\d*|perl\d*|ruby|node|nodejs|deno|bun|php[\d.]*|lua[\d.]*|osascript|tclsh[\d.]*|wish|expect|rscript|irb|jshell|groovy|scala|at|batch|crontab|source|parallel)$/i;
/** Prefijos que solo cambian cómo corre el comando que sigue: se evalúa ese comando. "exec" reemplaza el shell (cierra la sesión al terminar). */
const PLAIN_WRAPPERS = new Set(["nohup", "time", "builtin", "setsid", "unbuffer", "caffeinate", "pkexec", "do", "then", "else", "elif", "if", "while", "until", "!", "busybox", "noglob", "nocorrect"]);
/** Palabras de PowerShell que abren un bloque o una expresión: no son comandos. */
const PS_KEYWORDS = new Set(["process", "begin", "end", "else", "elseif", "if", "try", "catch", "finally", "do", "while", "until", "for", "foreach", "switch", "trap", "return", "throw", "exit", "break", "continue", "param", "function", "filter", "data"]);

/**
 * Abreviaturas de los verbos que cortan servicio en equipos de red. Los CLI aceptan cualquier prefijo inequívoco de
 * cada palabra (IOS, NX-OS, VRP, Junos, FortiOS): "relo", "wr er", "req sys reb", "cle ip bg *", "exe reboot",
 * "diagnose sys kil 11 1234". Se expande cada palabra que es prefijo (con un largo mínimo) de una del árbol y se
 * evalúa también la línea expandida (gana el mayor riesgo). Un prefijo ambiguo en el equipo se rechaza allá: aquí
 * solo sube el riesgo, nunca lo baja.
 */
type Abbr = readonly [word: string, min: number, next?: readonly Abbr[]];
const ROUTING: readonly Abbr[] = [["bgp", 2], ["ospf", 2], ["isis", 2], ["eigrp", 2], ["route", 3], ["mpls", 2]];
const NET_ABBR: readonly Abbr[] = [
  ["reload", 3], ["reboot", 3], ["shutdown", 3], ["squeeze", 3], ["erase", 2], ["format", 4], ["delete", 4], ["debug", 3], ["zeroize", 3], ["undelete", 4],
  ["write", 2, [["erase", 1]]],
  ["configure", 4, [["replace", 3], ["revert", 3, [["now", 1]]]]],
  ["reset", 3, [["saved-configuration", 2], ...ROUTING, ["ike", 2, [["sa", 1]]], ["ipsec", 3, [["sa", 1]]], ["recycle-bin", 3], ["ip", 2, [["ospf", 2]]]]],
  ["request", 3, [
    ["system", 2, [["reboot", 3], ["halt", 2], ["power-off", 2], ["zeroize", 1], ["logout", 3], ["software", 2, [["rollback", 2]]]]],
    ["node", 2, [["reboot", 3], ["halt", 2], ["power-off", 2], ["offline", 2]]],
    ["chassis", 2, [["cluster", 2, [["failover", 1]]], ["routing-engine", 2, [["master", 1]]]]],
  ]],
  ["clear", 3, [
    ["ip", 1, [...ROUTING, ["nat", 2, [["translation", 1]]], ["arp", 3]]], ...ROUTING, ["crypto", 2], ["conn", 4], ["xlate", 2], ["line", 2],
    ["arp-cache", 4], ["local-host", 2], ["configuration", 4, [["interface", 2]]], ["mac", 3, [["address-table", 2]]], ["mac-address-table", 5],
  ]],
  ["execute", 3, [
    ["reboot", 3], ["shutdown", 3], ["factoryreset", 4], ["formatlogdisk", 4], ["restore", 3],
    ["ha", 2, [["failover", 1]]], ["router", 3, [["restart", 4], ["clear", 3]]],
  ]],
  ["diagnose", 4, [
    ["sys", 2, [["kill", 3], ["session", 2, [["clear", 3]]], ["ha", 2, [["reset-uptime", 3]]]]],
    ["vpn", 2, [["tunnel", 2, [["down", 3]]], ["ike", 2, [["gateway", 2, [["clear", 3], ["flush", 3]]], ["restart", 4]]]]],
    ["firewall", 2, [["auth", 2, [["clear", 3]]]]],
    ["test", 3, [["application", 3, [["ipsmonitor", 4]]]]],
  ]],
  ["undo", 4, [["interface", 3], ["ospf", 2], ["bgp", 2], ["isis", 2]]],
  ["no", 2, [["router", 3, [["bgp", 2], ["ospf", 2], ["eigrp", 2], ["isis", 2], ["rip", 2]]], ["interface", 3], ["failover", 4]]],
  ["failover", 4, [["active", 3], ["reload-standby", 3]]],
  ["redundancy", 4, [["force-switchover", 2], ["switchover", 2]]],
];
/** Verbos de "diagnose" de FortiOS que cambian estado (FORTI_DIAG_READ): también abreviados ("cle", "dow", "recalc"). */
const FORTI_DIAG_VERBS = ["clear", "delete", "reset", "kill", "killall", "restart", "flush", "enable", "disable", "unset", "start", "stop", "filter", "update", "purge", "failover", "clean", "reload", "test", "reboot", "shutdown", "down", "recalculate", "refresh", "kick", "sniff", "plain-ctl", "atcmd", "trigger", "push", "upgrade", "remove", "renew", "release", "erase", "format", "toggle", "block", "unblock", "upload", "backup", "export", "send"];

/**
 * Prompt pegado delante del comando (copiado de la terminal o de un manual): "Router# ", "Router(config-if)# ",
 * "<HUAWEI> ", "[HUAWEI] ", "[edit] user@host# ", "FGT (vdom) # ", "PS C:\> ", "C:\Users\x> ", "user@host:~$ ".
 * Cuantificadores acotados y anclado: tiempo constante.
 */
const PROMPT = /^(?:\[[^\]\n]{1,80}\]\s*)?(?:PS [^>\n]{1,200}>|[A-Za-z]:\\[^>\n]{0,200}>|<[^<>\s]{1,64}>|\[[~*]?[^\]\s]{1,64}\]|([\w.@:/~+-]{1,64})(\s?\([^()\n]{1,64}\))?\s?([#>$%]))\s+(?=\S)/;

/** ethtool -s (minúscula) cambia velocidad/dúplex y renegocia el enlace; -S solo muestra. */
const ETHTOOL_SET = /^ethtool -s\b/;

/**
 * Dentro de un bloque de configuración, estas órdenes cortan servicio: apagar la interfaz o su
 * PoE, reiniciarla ("restart" de VRP), devolverla a fábrica ("default interface"), cambiar su
 * velocidad, cambiar o quitar su IP (IOS, VRP y la forma "ip a.b.c.d/n" de Fireware) o "apply",
 * que en Fireware aplica de inmediato todos los cambios pendientes de políticas, o "set status
 * suppressed" (FortiOS, ap-status: el controlador deautentica clientes del AP rogue). Los de
 * WatchGuard que dependen del bloque ("type trusted|optional|external" bajo la interfaz y "mode
 * dynamic|static" bajo link-aggregation) están en `blockDisruptive`.
 */
const DISRUPTIVE_IN_CONFIG =
  /^(shutdown|set disable\s*$|set (status|admin|admin-status) (down|disable)|set poe-status disable|disable|no enable\s*$|restart\s*$|default interface\b|power inline never|undo poe enable|poe mode disable|link-speed\b|(no |undo )?ip address\b|ip \d+\.\d+\.\d+\.\d+\/\d+|apply\s*$|set .*admin-status down|set status suppressed)\b/i;

/**
 * Órdenes que cortan servicio solo por el bloque en que van (varias líneas). Se exige la línea que
 * fija el contexto para no subir de nivel un "type" ni un "mode" de otro fabricante: en WatchGuard
 * Fireware "interface FastEthernet 1" (número separado por espacio) con "type trusted|optional|external"
 * cambia la zona de la interfaz, y "link-aggregation <nombre>" con "mode dynamic|static" rehace el enlace.
 */
const WG_IFACE = /^interface \S+ (\d+|\{\{\w+\}\})$/i;
const WG_IFACE_TYPE = /^type (trusted|optional|external)$/i;
const WG_LAG = /^link-aggregation \S+$/i;
const WG_LAG_MODE = /^mode (dynamic|static)$/i;
function blockDisruptive(lines: string[]): boolean {
  const has = (re: RegExp) => lines.some((l) => re.test(l));
  return (has(WG_IFACE) && has(WG_IFACE_TYPE)) || (has(WG_LAG) && has(WG_LAG_MODE));
}

/**
 * ";" "&&" "||" y "&" encadenan otro comando en la misma línea (shells, cmd y NX-OS): se
 * separan para evaluar cada parte y que "cat x; reboot" no pase como consulta. No separan
 * dentro de comillas ni de (), {} o [] (filtros de tcpdump, hashtables de PowerShell), ni en
 * "2>&1" o "&>". Lo que queda agrupado no se reconoce como consulta y pide confirmación.
 */
function splitChain(line: string): string[] {
  const parts: string[] = [];
  let quote = "";
  let depth = 0;
  let start = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) quote = "";
      continue;
    }
    if (c === "'" || c === '"') quote = c;
    else if ("({[".includes(c)) depth++;
    else if (")}]".includes(c)) depth = Math.max(0, depth - 1);
    else if (depth === 0) {
      const two = line.slice(i, i + 2);
      const sep =
        c === ";" ? 1 : two === "&&" || two === "||" ? 2 : c === "&" && !/[<>&]/.test(line[i - 1] ?? "") && line[i + 1] !== ">" ? 1 : 0;
      if (sep) {
        parts.push(line.slice(start, i));
        start = i + sep;
        i += sep - 1;
      }
    }
  }
  // Comillas o paréntesis sin cerrar (un apóstrofo en una descripción) no esconden un separador.
  if (quote || depth) return line.split(/;|&&|\|\||&/);
  parts.push(line.slice(start));
  return parts;
}

/**
 * Partes de una línea separadas por "|" fuera de comillas y de (), {} o []: en "grep -E 'up|reboot' x" el "|" es
 * parte de la expresión regular y en "% { $_ | Stop-Process }" va dentro del bloque (que se evalúa aparte). Con
 * comillas o paréntesis sin cerrar se corta en todos los "|".
 */
function splitPipes(line: string): string[] {
  if (!line.includes("|")) return [line];
  const parts: string[] = [];
  let quote = "";
  let depth = 0;
  let start = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) quote = "";
    } else if (c === "'" || c === '"') quote = c;
    else if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") depth = Math.max(0, depth - 1);
    else if (c === "|" && depth === 0) {
      parts.push(line.slice(start, i));
      start = i + 1;
    }
  }
  if (quote || depth) return line.split("|");
  parts.push(line.slice(start));
  return parts;
}

// ---------- Teclas que el equipo interpreta ----------

/** Caracteres de control (menos Tab y saltos de línea) y de formato Unicode. */
const CONTROL_CHARS = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/;
/**
 * Los que no editan la línea: Esc (flechas, historial, Esc-b), Ctrl-D, Ctrl-R, Ctrl-P, NUL,
 * los de C1 y los de dirección o ancho cero. Con ellos no se sabe qué ejecutará el equipo.
 */
const OPAQUE_CHARS = /[\x00-\x02\x04-\x07\x0b\x0c\x0e-\x14\x16\x18\x19\x1b-\x1f\x80-\x9f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/;
/** Teclas de edición: retroceso (BS, DEL), Ctrl-U y Ctrl-C (borran la línea) y Ctrl-W (palabra). */
const EDIT_KEYS = /[\x03\x08\x15\x17\x7f]+/g;

/**
 * La línea como la arma el CLI del equipo tras las teclas de edición: misma semántica que
 * split_commits de src-tauri/src/scripts.rs (retroceso borra un carácter, Ctrl-U y Ctrl-C la
 * línea, Ctrl-W hasta el espacio anterior tras quitar los espacios del final).
 */
export function editedLine(line: string): string {
  let buf: string[] = [];
  for (const c of line) {
    if (c === "\x7f" || c === "\b") buf.pop();
    else if (c === "\x15" || c === "\x03") buf = [];
    else if (c === "\x17") {
      const s = buf.join("").trimEnd();
      buf = [...s.slice(0, s.lastIndexOf(" ") + 1)];
    } else buf.push(c);
  }
  return buf.join("");
}

/**
 * Lo que la evaluación anota de paso, además del riesgo: algún tramo ejecuta un cliente de red (contacta un destino
 * que elige quien escribe) o abre un programa interactivo (las líneas siguientes las leería ese programa). Se
 * acumulan en `seen` durante una evaluación (síncrona; los niveles anidados suman a la misma).
 */
const NET = 1;
const INTERACTIVE = 2;
let seen = 0;
const RISKS: readonly Risk[] = ["read", "change", "disruptive"];
/** Resultado memorizado por comando: rango del riesgo << 2 | anotaciones. */
const riskCache = new Map<string, number>();

function analyze(cmd: string): number {
  let v = riskCache.get(cmd);
  if (v === undefined) {
    // Es pura: se memoriza para no repetir las regex al recargar o reconstruir el catálogo.
    if (riskCache.size >= 10000) riskCache.clear();
    seen = 0;
    v = (RANK[evalRisk(cmd, 0)] << 2) | seen;
    riskCache.set(cmd, v);
  }
  return v;
}

/** Riesgo mayor entre las líneas de un texto de varios comandos (aprobaciones MCP). */
export function textRisk(text: string): Risk {
  return text
    .split(/\r?\n|\r/)
    .filter((l) => l.trim())
    .map((l) => computeRisk(l))
    .reduce<Risk>((a, b) => maxRisk(a, b), "read");
}

/**
 * Riesgo según el contenido. Ante la duda, cambio: un comando solo es consulta si está en una lista blanca
 * (consultas por fabricante y filtros de tubería conocidos). Diseño en docs/TECNICO.md («Motor de riesgo»).
 */
export function computeRisk(cmd: string): Risk {
  return RISKS[analyze(cmd) >> 2];
}

/**
 * Algún tramo del comando ejecuta un cliente de red hacia un destino que elige quien escribe (ping, traceroute,
 * nslookup, curl, ssh, telnet, Resolve-DnsName, "execute ping" de FortiOS, "show host <nombre>" de Junos, nltest,
 * nbtstat -a…), con la misma normalización que computeRisk: prefijos (sudo, env, time, timeout, busybox…), comillas,
 * subexpresiones, tuberías, cadenas y comandos anidados. Lo usa la ventana de consultas del MCP: un agente podría
 * sacar un dato poniéndolo en el nombre de destino (DNS, ICMP, URL). Si el riesgo es "disruptive" la evaluación se
 * corta antes y puede no verlo (la ventana no aprueba ese riesgo).
 */
export function contactsNetwork(cmd: string): boolean {
  return (analyze(cmd) & NET) !== 0;
}

/**
 * Algún tramo abre un programa interactivo (less, more, top, cpview, vi, man, watch, journalctl con paginador, ssh o
 * telnet sin comando…): las líneas que se escriban después las leería ese programa y no el equipo. Para quien escribe
 * a mano siguen siendo consulta; la ventana de consultas del MCP no los envía sin diálogo.
 */
export function opensInteractive(cmd: string): boolean {
  return (analyze(cmd) & INTERACTIVE) !== 0;
}

const cuts = (x: string) =>
  DISRUPTIVE.test(x) || OS_DISRUPTIVE.test(x) || DISRUPTIVE_VENDOR.test(x) || EXTRA_DISRUPTIVE.test(x) || EXTRA_DISRUPTIVE_CS.test(x) || ETHTOOL_SET.test(x);

/** "diagnose …" de consulta: sin verbo que cambia estado, tampoco abreviado ("cle" es clear, "recalc" es recalculate). */
function fortiDiagRead(line: string): boolean {
  if (!FORTI_DIAG_READ.test(line)) return false;
  for (const t of line.toLowerCase().split(/[\s_-]+/)) if (t.length >= 3 && t !== "sta" && FORTI_DIAG_VERBS.some((v) => v.length > t.length && v.startsWith(t))) return false;
  return true;
}

/** La línea es una consulta (`word`: su primera palabra en minúsculas). */
function isRead(line: string, word: string): boolean {
  if (word === "ip" || word === "bridge") return iprouteRead(line.split(/\s+/), word === "ip" ? IP : BRIDGE);
  if (word === "nmcli") return nmcliRead(line.split(/\s+/));
  if (word === "diagnose" && /^diagnose\s+debug\b/i.test(line)) return FORTI_DEBUG_READ.test(line);
  return (
    READ_START.test(line) ||
    abbrevRead(line) ||
    fortiDiagRead(line) ||
    FORTI_EXEC_READ.test(line) ||
    FORTIAP_READ.test(line) ||
    CHECKPOINT_READ.test(line) ||
    LINUX_READ.test(line) ||
    ETHTOOL_READ.test(line) ||
    IPTABLES_READ.test(line) ||
    OS_READ.test(line)
  );
}

// ---------- Evaluación ----------

/** Una línea más larga que esto no es un comando escrito a mano: se confirma sin pasar por las regex. */
const MAX_LINE = 8192;
/** Niveles de anidamiento ($(…), bloques, sh -c, ssh host cmd, iex…). Más profundo: "puede cortar servicio". */
const MAX_DEPTH = 5;
/** Prefijos encadenados (sudo nohup env …) que se quitan por segmento. Más: "puede cortar servicio". */
const MAX_WRAPPERS = 16;
/** Comandos encadenados o tramos de tubería en una línea. Más no es algo que se escriba a mano: "puede cortar servicio". */
const MAX_PARTS = 100;

interface Ctx {
  multi: boolean;
  lines: string[];
  depth: number;
}
/** Variables ("X=reboot") y alias ("alias ls=reboot") definidos antes en la misma línea. */
type Vars = Map<string, string>;

const LINE_BREAKS = /[\r\x1a\u2028\u2029]/;
/** Espacios Unicode (NBSP, de ancho fijo…): \s de las regex ya los tomaba como separadores; se normalizan a " ". */
const UNI_SPACE = /[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/;
const UNI_SPACE_G = new RegExp(UNI_SPACE.source, "g");
const NESTED = /[`(){}]/;
const TEMPLATE_VAR = /\{\{\s*[\w.-]+\s*\}\}/g;
const QUOTED = /'[^']*'|"[^"]*"/g;
const PS_LIKE = /^[([{$&.@]|^[A-Za-z]+-[A-Za-z]|^(%|\?|foreach|where|select|sort|measure|group|ft|fl|iex|icm)(\s|$)|\$_|@\{/i;

function longestLine(s: string): number {
  let max = 0;
  for (let start = 0; ; ) {
    const i = s.indexOf("\n", start);
    const end = i < 0 ? s.length : i;
    if (end - start > max) max = end - start;
    if (i < 0) return max;
    start = i + 1;
  }
}

function evalRisk(cmd: string, depth: number): Risk {
  if (depth > MAX_DEPTH) return "disruptive";
  // Un "\r" suelto también separa comandos en el equipo, Ctrl-Z termina la línea (IOS) y U+2028/U+2029 son saltos
  // de línea para quien muestra el texto: se evalúa cada tramo como una línea.
  if (LINE_BREAKS.test(cmd)) cmd = cmd.replace(/\r\n?|\x1a|\u2028|\u2029/g, "\n");
  if (cmd.length > MAX_LINE && longestLine(cmd) > MAX_LINE) return "disruptive";
  if (CONTROL_CHARS.test(cmd)) {
    // Esc, Ctrl-D o un carácter invisible: lo que se ejecuta depende del equipo.
    if (OPAQUE_CHARS.test(cmd)) return "disruptive";
    // Teclas de edición: vale lo que verá el equipo y también cada tramo por separado, por si
    // el equipo no las interpreta igual (BS como carácter, Ctrl-C que no borra).
    return maxRisk(evalRisk(cmd.split("\n").map(editedLine).join("\n"), depth), evalRisk(cmd.replace(EDIT_KEYS, "\n"), depth));
  }
  if (UNI_SPACE.test(cmd)) cmd = cmd.replace(UNI_SPACE_G, " ");
  if (cmd.includes("\t")) {
    // Tab completa en el equipo: "rel<Tab>" es reload y "re<Tab>load", si "re" es ambiguo, queda "reload". Vale la
    // lectura con espacio y, si es más grave, la de la palabra unida.
    const r = evalBody(cmd.replace(/\t/g, " "), depth);
    return r !== "disruptive" && evalBody(cmd.replace(/\t/g, ""), depth) === "disruptive" ? "disruptive" : r;
  }
  return evalBody(cmd, depth);
}

function evalBody(cmd: string, depth: number): Risk {
  const lines = cmd
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return "read";
  // "config vdom / edit X" o "config global": solo cambia de contexto.
  if (lines.length <= 2 && /^config (global|vdom)$/i.test(lines[0]) && lines.every((l) => FORTI_CONTEXT.test(l))) return "read";
  const c: Ctx = { multi: lines.length > 1, lines, depth };
  if (c.multi && blockDisruptive(lines)) return "disruptive";
  let risk: Risk = "read";
  for (const l of lines) {
    risk = maxRisk(risk, lineRisk(l, c));
    if (risk === "disruptive") break;
  }
  return risk;
}

/** Una línea: sin el prompt pegado delante, si lo hay. */
function lineRisk(line: string, c: Ctx): Risk {
  const m = /[#>$%\]]/.test(line) ? PROMPT.exec(line) : null;
  // En un shell "ls> x" redirige: un nombre de equipo seguido de ">" lleva mayúscula, dígito, guion, "@" o ":".
  if (m && !(m[3] === ">" && !m[2] && !/[A-Z0-9@:-]/.test(m[1]))) {
    const r = chainRisk(line.slice(m[0].length), c);
    // "reboot # x" o "halt> x" en un shell ejecutan la primera palabra.
    if (m[1] && r !== "disruptive" && segRisk(m[1], c, false, new Map(), false) === "disruptive") return "disruptive";
    return r;
  }
  return chainRisk(line, c);
}

/** Comandos encadenados (";", "&&", "||", "&"): vale el mayor. */
function chainRisk(line: string, c: Ctx): Risk {
  const vars: Vars = new Map();
  let risk: Risk = "read";
  const parts = /[;&|]/.test(line) ? splitChain(line) : [line];
  if (parts.length > MAX_PARTS) return "disruptive";
  for (const part of parts) {
    const p = part.trim();
    if (!p) continue;
    risk = maxRisk(risk, pipelineRisk(p, c, vars, false));
    if (risk === "disruptive") break;
  }
  return risk;
}

/** Cómo trata un show/display/get la palabra que sigue a "|". */
function showFilter(seg: string): "regex" | "read" | "write" | null {
  const sp = seg.search(/\s/);
  const t = (sp < 0 ? seg : seg.slice(0, sp)).toLowerCase();
  if (!/^[a-z][a-z-]*$/.test(t)) return null;
  if (SHOW_REGEX_FILTERS.includes(t)) return "regex";
  if (SHOW_READ_FILTERS.includes(t)) return "read";
  if (SHOW_WRITE_FILTERS.some((w) => w.startsWith(t))) {
    if (t !== "s") return "write";
    const arg = sp < 0 ? "" : seg.slice(sp).trim();
    return /^\S*[/:.]\S*$/.test(arg) ? "write" : "regex";
  }
  if (SHOW_REGEX_FILTERS.some((w) => w.startsWith(t))) return "regex";
  if (SHOW_READ_FILTERS.some((w) => w.startsWith(t))) return "read";
  return null;
}

/**
 * Tubería: cada tramo se evalúa como comando completo y vale el mayor. Tras un show/display/get de equipo de red el
 * "|" es un filtro (lista de arriba); fuera de ellos, lo que sigue a "|" solo es consulta si es un filtro conocido
 * (PIPE_READ_WORDS, awk sin system(), sed sin -i ni "e"…): lo desconocido es al menos cambio.
 */
function pipelineRisk(part: string, c: Ctx, vars: Vars, expr: boolean): Risk {
  const segs = part.includes("|") ? splitPipes(part) : [part];
  if (segs.length > MAX_PARTS) return "disruptive";
  const head = { word: "", cmd: "" };
  let risk = segRisk(segs[0], c, false, vars, expr, head);
  if (segs.length === 1 || risk === "disruptive") return risk;
  const show = SHOW_HEADS.has(head.word) || abbrevRead(head.cmd);
  let regexTail = false;
  for (let i = 1; i < segs.length; i++) {
    const s = segs[i].trim();
    if (show) {
      const f = showFilter(s);
      if (regexTail) {
        // "| include a|b": el resto es la expresión; solo cuenta un filtro que escribe o un intérprete.
        if (f === "write" || SHELLS.has(s.split(/\s/, 1)[0].toLowerCase())) risk = maxRisk(risk, "change");
        continue;
      }
      if (f === "write") {
        risk = maxRisk(risk, "change");
        continue;
      }
      if (f === "regex") regexTail = true;
      if (f) continue;
    }
    risk = maxRisk(risk, segRisk(s, c, true, vars, false));
    if (risk === "disruptive") break;
  }
  return risk;
}

interface Group {
  kind: "$(" | "<(" | ">(" | "(" | "{" | "@{" | "`";
  text: string;
  start: number;
}

/** Cierre del grupo que abre s[i], con anidamiento y comillas. Sin cierre: el final del texto. */
function matchClose(s: string, i: number, open: string, close: string): number {
  let depth = 0;
  let q = "";
  for (let j = i; j < s.length; j++) {
    const ch = s[j];
    if (q) {
      if (ch === q) q = "";
      else if (ch === "\\" && q === '"') j++;
      continue;
    }
    if (ch === "\\") j++;
    else if (ch === "'" || ch === '"') q = ch;
    else if (ch === open) depth++;
    else if (ch === close && --depth === 0) return j;
  }
  return s.length;
}

/** Grupos de primer nivel de un tramo: sustituciones, subshells, bloques y hashtables. Una sola pasada. */
function scanGroups(s: string): Group[] {
  const out: Group[] = [];
  let q = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q === "'") {
      if (ch === "'") q = "";
      continue;
    }
    if (ch === "\\") {
      i++;
      continue;
    }
    if (ch === "`") {
      const e = s.indexOf("`", i + 1);
      const end = e < 0 ? s.length : e;
      out.push({ kind: "`", text: s.slice(i + 1, end), start: i });
      i = end;
      continue;
    }
    const prev = s[i - 1];
    if (ch === "(" && (q !== '"' || prev === "$")) {
      const kind = prev === "$" ? "$(" : prev === "<" ? "<(" : prev === ">" ? ">(" : "(";
      const end = matchClose(s, i, "(", ")");
      out.push({ kind, text: s.slice(i + 1, end), start: kind === "(" ? i : i - 1 });
      i = end;
      continue;
    }
    if (q === '"') {
      if (ch === '"') q = "";
      continue;
    }
    if (ch === "'" || ch === '"') q = ch;
    else if (ch === "{") {
      const end = matchClose(s, i, "{", "}");
      // "${VAR}" es una variable, no un bloque.
      if (prev !== "$") out.push({ kind: prev === "@" ? "@{" : "{", text: s.slice(i + 1, end), start: prev === "@" ? i - 1 : i });
      i = end;
    }
  }
  return out;
}

/**
 * Contenido de los grupos: $(…), `…`, <(…) y >(…) ejecutan un comando (al menos cambio, como antes); en PowerShell
 * cada (…) y {…} es una subexpresión o un bloque que puede correr ("Get-Date (Restart-Computer)", "Measure-Command
 * { … }", "Sort-Object { … }", "@{e={…}}"); en un shell, (…) o {…} al comienzo es un subshell o un grupo.
 */
function groupsRisk(seg: string, c: Ctx, ps: boolean): Risk {
  if (c.depth + 1 > MAX_DEPTH) return "disruptive";
  let risk: Risk = "read";
  for (const g of scanGroups(seg)) {
    let r: Risk;
    if (g.kind === "$(" || g.kind === "`" || g.kind === "<(" || g.kind === ">(") r = maxRisk("change", evalRisk(g.text, c.depth + 1));
    else if (g.kind === "@{") r = groupsRisk(g.text, { ...c, depth: c.depth + 1 }, true);
    else if (ps) r = blockRisk(g.text, c);
    else if (g.start === 0) r = evalRisk(g.text, c.depth + 1);
    else continue;
    risk = maxRisk(risk, r);
    if (risk === "disruptive") break;
  }
  return risk;
}

/**
 * Bloque o subexpresión de PowerShell: cada sentencia que empieza con un nombre es un comando (se evalúa entero);
 * las que empiezan con "$", un literal o una palabra clave (process, if, foreach…) son expresiones: valen sus grupos
 * y métodos. "& $x" o "& 'archivo'" ejecutan algo que no se ve: cambio.
 */
function blockRisk(text: string, c: Ctx): Risk {
  const depth = c.depth + 1;
  if (depth > MAX_DEPTH) return "disruptive";
  const cc: Ctx = { multi: false, lines: c.lines, depth };
  let risk: Risk = /(^|[;{(\s|])&\s*[$'"(]/.test(text) ? "change" : "read";
  const vars: Vars = new Map();
  for (const line of text.split("\n")) {
    for (const part of splitChain(line)) {
      const s = part.trim();
      if (!s) continue;
      const w = /^[A-Za-z][\w-]*/.exec(s)?.[0].toLowerCase();
      risk = maxRisk(risk, pipelineRisk(s, cc, vars, !w || PS_KEYWORDS.has(w)));
      if (risk === "disruptive") return risk;
    }
  }
  return risk;
}

interface Tok {
  val: string;
  start: number;
  end: number;
  quoted: boolean;
}
const isSpace = (ch: string) => ch <= " ";

/**
 * Palabra que empieza en i (o después de los espacios), sin comillas ni escapes como la ve un shell: "re\boot" y
 * 're''boot' son reboot. Una ruta de Windows ("C:\…", "\\servidor\…") se toma tal cual.
 */
function tokenAt(s: string, i: number): Tok | null {
  while (i < s.length && isSpace(s[i])) i++;
  if (i >= s.length) return null;
  const start = i;
  if (/^([A-Za-z]:\\|\\\\)/.test(s.slice(i, i + 3))) {
    while (i < s.length && !isSpace(s[i])) i++;
    return { val: s.slice(start, i), start, end: i, quoted: false };
  }
  let val = "";
  let q = "";
  let quoted = false;
  for (; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === q) q = "";
      else if (ch === "\\" && q === '"' && /[$`"\\]/.test(s[i + 1] ?? "")) val += s[++i];
      else val += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      q = ch;
      quoted = true;
    } else if (ch === "\\" && i + 1 < s.length) val += s[++i];
    else if (isSpace(ch)) break;
    else val += ch;
  }
  return { val, start, end: i, quoted };
}

/** Salta las opciones ("-x", "--opción", y el argumento de las de `withArg`) y devuelve desde el comando. "--" las termina. */
function skipOpts(s: string, withArg: RegExp | null): string {
  let i = 0;
  for (;;) {
    const t = tokenAt(s, i);
    if (!t) return "";
    if (t.val === "--") return s.slice(t.end).trimStart();
    if (t.quoted || t.val.length < 2 || t.val[0] !== "-") return s.slice(t.start);
    i = t.end;
    if (withArg?.test(t.val)) {
      const a = tokenAt(s, i);
      i = a ? a.end : s.length;
    }
  }
}

/** Nombre del programa sin su ruta ("/sbin/reboot", "C:\…\shutdown.exe") ni la extensión .exe/.com. */
function basename(v: string): string {
  const i = Math.max(v.lastIndexOf("/"), v.lastIndexOf("\\"));
  const b = i >= 0 && i < v.length - 1 ? v.slice(i + 1) : v;
  return /\.(exe|com)$/i.test(b) ? b.slice(0, -4) : b;
}

/** Quita las comillas que envuelven todo el texto ("cmd /c "shutdown /r""). */
const unwrap = (s: string) => {
  const t = s.trim();
  return t.length > 1 && (t[0] === '"' || t[0] === "'") && t[t.length - 1] === t[0] ? t.slice(1, -1) : t;
};

interface Norm {
  cmd: string;
  word: string;
  risk: Risk;
  done: boolean;
}

const SUDO_ARG = /^(-[ugCDpRrTUhc]|--(user|group|chdir|host|prompt|role|type|close-from|other-user|command-timeout))$/;
const PS_ARG = /^(executionpolicy|ex|ep|windowstyle|w|win\w*|configurationname|config\w*|workingdirectory|wd|version|v|inputformat|in\w*|outputformat|o\w*|psconsolefile|custompipename|settingsfile)$/;

/**
 * Lo que de verdad se ejecuta en un tramo: quita prefijos que solo cambian cómo corre el comando (sudo, doas, env
 * VAR=x, nohup, time, timeout, watch, nice, xargs, exec, do/run/top/up de los equipos, palabras clave del shell…), la ruta
 * y las comillas del nombre, y resuelve variables y alias de la misma línea. Los intérpretes con un comando en un
 * argumento (sh -c, cmd /c, powershell -Command, clish -c, su -c, eval, iex, vi -c ':!…') se evalúan por ese
 * argumento; -EncodedCommand oculta el comando: "puede cortar servicio".
 */
function normalize(seg: string, c: Ctx, vars: Vars): Norm {
  let s = seg;
  let risk: Risk = "read";
  const nested = (text: string) => evalRisk(text, c.depth + 1);
  const done = (r: Risk): Norm => ({ cmd: s, word: "", risk: maxRisk(risk, r), done: true });
  for (let k = 0; k < MAX_WRAPPERS; k++) {
    const t = tokenAt(s, 0);
    if (!t) return done("read");
    const rest = s.slice(t.end).trimStart();
    const v = t.val;
    // Variables y alias definidos antes en la misma línea.
    const vm = /^\$\{?([A-Za-z_]\w*)\}?$/.exec(v);
    if (vm && vars.has(vm[1])) {
      s = `${vars.get(vm[1])} ${rest}`;
      continue;
    }
    if (!t.quoted && vars.has(`alias:${v}`)) {
      s = `${vars.get(`alias:${v}`)} ${rest}`;
      continue;
    }
    // PowerShell: "$x = <comando>" ejecuta el comando.
    if (/^\$[\w:]+$/.test(v) && /^=(?!=)/.test(rest)) {
      s = rest.slice(1);
      continue;
    }
    // Shell: VAR=valor antes del comando; sola, define la variable.
    if (/^[A-Za-z_]\w*=/.test(s.slice(t.start))) {
      const eq = v.indexOf("=");
      if (!rest) {
        vars.set(v.slice(0, eq), v.slice(eq + 1));
        return done("change");
      }
      s = rest;
      continue;
    }
    const base = basename(v);
    const w = base.toLowerCase();
    if (w === "alias") {
      const a = tokenAt(rest, 0);
      const eq = a ? a.val.indexOf("=") : -1;
      if (a && eq > 0) vars.set(`alias:${a.val.slice(0, eq)}`, a.val.slice(eq + 1));
      return done("change");
    }
    if (PLAIN_WRAPPERS.has(w) && !t.quoted) {
      s = rest;
      continue;
    }
    switch (w) {
      case "sudo":
      case "doas":
      case "runuser":
        s = skipOpts(rest, SUDO_ARG);
        // Sin comando abre un shell (sudo -s, sudo -i).
        if (!s) return done("change");
        continue;
      case "env":
        if (/(^|\s)(-S|--split-string)/.test(rest)) risk = maxRisk(risk, "change");
        s = skipOpts(rest, /^(-[uCS]|--(unset|chdir|split-string))$/);
        continue;
      case "nice":
        s = skipOpts(rest, /^(-n|--adjustment)$/);
        continue;
      case "ionice":
        s = skipOpts(rest, /^(-[cnpPu]|--(class|classdata|pid|pgid|uid))$/);
        if (!s) return done("change");
        continue;
      case "stdbuf":
        s = skipOpts(rest, /^-[ioe]$/);
        continue;
      case "timeout":
      case "chrt":
      case "taskset": {
        // Tras las opciones va la duración, la prioridad o la máscara de CPU.
        const r = skipOpts(rest, w === "timeout" ? /^(-[sk]|--(signal|kill-after))$/ : null);
        const d = tokenAt(r, 0);
        s = d ? r.slice(d.end).trimStart() : "";
        if (!s) return done("change");
        continue;
      }
      case "watch":
        // Pantalla completa hasta Ctrl-C.
        seen |= INTERACTIVE;
        s = skipOpts(rest, /^(-n|--interval|-q|--equexit)$/);
        continue;
      case "top":
      case "up": {
        // Junos (configuración): "top <comando>" y "up [n] <comando>" ejecutan ese comando desde la raíz o desde un
        // nivel más arriba ("top delete", "top run request system reboot"): vale ese comando y al menos cambio. "top" con
        // opciones es el de Linux (LINUX_READ); solo, o "up [n]", cambia de nivel.
        let r = rest;
        const n = w === "up" ? tokenAt(r, 0) : null;
        if (n && /^\d+$/.test(n.val)) r = r.slice(n.end).trimStart();
        const x = tokenAt(r, 0);
        if (!x || (w === "top" && !x.quoted && x.val.startsWith("-"))) break;
        risk = maxRisk(risk, "change");
        s = r;
        continue;
      }
      case "xargs":
        risk = maxRisk(risk, "change");
        s = skipOpts(rest, /^(-[aEdIiLlnPs]|--(arg-file|eof|delimiter|max-lines|max-args|max-procs|max-chars|process-slot-var))$/);
        if (!s) return done("change");
        continue;
      case "exec":
        // Reemplaza el shell: la sesión termina con el comando.
        risk = maxRisk(risk, "change");
        s = skipOpts(rest, /^-a$/);
        if (!s) return done("change");
        continue;
      case "command":
      case "builtin":
        if (/^-[a-zA-Z]*[vV](\s|$)/.test(rest)) return done("read");
        s = skipOpts(rest, null);
        continue;
      case "run": {
        // Junos "run <comando>" desde configuración; NX-OS "run bash <comando>".
        const b = tokenAt(rest, 0);
        s = b && b.val === "bash" ? rest.slice(b.end).trimStart() : rest;
        if (!s) return done("change");
        continue;
      }
      case "ip":
        if (/^(netns|vrf)\s+exec\s+\S+\s+/i.test(rest)) {
          s = rest.replace(/^(netns|vrf)\s+exec\s+\S+\s+/i, "");
          continue;
        }
        break;
      case "eval":
      case "iex":
      case "invoke-expression": {
        // El texto se ejecuta como comando: lo que diga ese texto, y al menos cambio (puede venir de una variable).
        const words: string[] = [];
        for (let x = tokenAt(rest, 0); x; x = tokenAt(rest, x.end)) words.push(x.val);
        return done(maxRisk("change", words.length ? nested(words.join(" ")) : "change"));
      }
      case "cmd": {
        for (let x = tokenAt(rest, 0); x; x = tokenAt(rest, x.end)) {
          if (/^\/[ckr]$/i.test(x.val)) return done(nested(unwrap(rest.slice(x.end))));
          if (!x.val.startsWith("/")) break;
        }
        return done("change");
      }
      case "powershell":
      case "pwsh":
      case "powershell_ise": {
        for (let x = tokenAt(rest, 0); x; x = tokenAt(rest, x.end)) {
          const o = x.val.toLowerCase();
          if (o[0] !== "-" && o[0] !== "/") return done(nested(unwrap(rest.slice(x.start))));
          const name = o.slice(1);
          if (!name) continue;
          // -EncodedCommand (y sus prefijos -e, -en, -enc…, -ec): el comando va en base64, no se ve.
          if ("encodedcommand".startsWith(name) || name === "ec") return done("disruptive");
          if ("command".startsWith(name)) return done(nested(unwrap(rest.slice(x.end))));
          if ("file".startsWith(name)) return done("change");
          if (PS_ARG.test(name)) x = tokenAt(rest, x.end) ?? x;
        }
        return done("change");
      }
      case "clish":
      case "vtysh": {
        let r: Risk | null = null;
        for (let x = tokenAt(rest, 0); x; x = tokenAt(rest, x.end)) {
          if (x.val === "-c" || x.val === "--command") {
            const a = tokenAt(rest, x.end);
            if (!a) break;
            r = maxRisk(r ?? "read", nested(a.val));
            x = a;
          } else if (/^-[fd]$|^--(inputfile|daemon)$/.test(x.val)) r = maxRisk(r ?? "read", "change");
        }
        return done(r ?? "change");
      }
      case "su": {
        for (let x = tokenAt(rest, 0); x; x = tokenAt(rest, x.end)) {
          if (x.val === "-c" || x.val === "--command") {
            const a = tokenAt(rest, x.end);
            return done(a ? nested(a.val) : "change");
          }
          if (x.val.startsWith("--command=")) return done(nested(x.val.slice(10)));
        }
        return done("change");
      }
      case "source":
      case ".":
        // ". { … }" de PowerShell: el bloque ya se evaluó (groupsRisk). Un archivo: no se ve qué ejecuta.
        return done(rest.startsWith("{") ? "read" : "change");
      case "vi":
      case "vim":
      case "nvim":
      case "view":
      case "ex":
      case "gvim": {
        seen |= INTERACTIVE;
        let r: Risk = "change";
        for (let x = tokenAt(rest, 0); x; x = tokenAt(rest, x.end)) {
          let arg: string | null = null;
          if (x.val === "-c" || x.val === "--cmd") {
            const a = tokenAt(rest, x.end);
            if (a) {
              arg = a.val;
              x = a;
            }
          } else if (x.val.startsWith("+")) arg = x.val.slice(1);
          const bang = arg && /^:?\s*!(.*)$/s.exec(arg);
          if (bang) r = maxRisk(r, nested(bang[1]));
        }
        return done(r);
      }
    }
    if (SHELLS.has(w) && !(w === "sh" && abbrevRead(`sh ${rest}`))) {
      for (let x = tokenAt(rest, 0); x; x = tokenAt(rest, x.end)) {
        if (!/^[-+]./.test(x.val) || x.quoted) break;
        if (/^-[a-zA-Z]*c[a-zA-Z]*$/.test(x.val)) {
          const a = tokenAt(rest, x.end);
          return done(a ? nested(a.val) : "change");
        }
        if (/^([-+][oO]|--rcfile|--init-file)$/.test(x.val)) x = tokenAt(rest, x.end) ?? x;
      }
      // Un script o la entrada estándar: no se ve qué ejecuta.
      return done("change");
    }
    if (INTERPRETERS.test(w)) return done("change");
    return { cmd: rest ? `${base} ${rest}` : base, word: w, risk, done: false };
  }
  return done("disruptive");
}

/** Abreviaturas de NET_ABBR: alguna expansión de la línea corta servicio. */
function abbrevCuts(cmd: string, c: Ctx): boolean {
  const sp = cmd.search(/\s/);
  const first = (sp < 0 ? cmd : cmd.slice(0, sp)).toLowerCase();
  if (!NET_ABBR.some(([w, min]) => first.length >= min && w.startsWith(first))) return false;
  const toks: string[] = [];
  const re = /\s*(\S+)/y;
  let end = 0;
  for (let k = 0; k < 7; k++) {
    re.lastIndex = end;
    const m = re.exec(cmd);
    if (!m) break;
    toks.push(m[1]);
    end = re.lastIndex;
  }
  const tail = cmd.slice(end);
  const out: string[] = [];
  const walk = (level: readonly Abbr[], i: number, acc: string[]): void => {
    const t = toks[i]?.toLowerCase();
    let hit = false;
    if (t)
      for (const [w, min, next] of level) {
        if (t.length < min || !w.startsWith(t)) continue;
        hit = true;
        if (next && i + 1 < toks.length) walk(next, i + 1, [...acc, w]);
        else out.push([...acc, w, ...toks.slice(i + 1)].join(" ") + tail);
      }
    if (!hit && i > 0) out.push([...acc, ...toks.slice(i)].join(" ") + tail);
  };
  walk(NET_ABBR, 0, []);
  const lower = cmd.toLowerCase();
  return out.some((e) => e.toLowerCase() !== lower && (cuts(e) || (c.multi && DISRUPTIVE_IN_CONFIG.test(e))));
}

/**
 * Un tramo de tubería: rutas especiales, grupos anidados, redirecciones, métodos, abreviaturas y, tras quitar los
 * prefijos (normalize), el comando. `out` recibe el comando normalizado (para saber si es un show). `expr`: una
 * sentencia de un bloque de PowerShell que no empieza con un comando (solo valen sus grupos y métodos).
 */
function segRisk(seg0: string, c: Ctx, afterPipe: boolean, vars: Vars, expr: boolean, out?: { word: string; cmd: string }): Risk {
  const seg = seg0.trim();
  if (!seg) return "read";
  if (c.depth > MAX_DEPTH) return "disruptive";
  if ((seg.includes("/dev/") || seg.includes("/proc/")) && (SPECIAL_PATH.test(seg) || BLOCK_WRITE.test(seg))) return "disruptive";
  let risk: Risk = "read";
  // Las variables de plantilla del catálogo ("{{interfaz}}") no son bloques de código.
  const g = seg.includes("{{") ? seg.replace(TEMPLATE_VAR, "X") : seg;
  if (NESTED.test(g)) {
    risk = groupsRisk(g, c, expr || PS_LIKE.test(g));
    if (risk === "disruptive") return risk;
  }
  // Un ">" entre comillas es texto ("awk '$3 > 100'", "grep '->'"), no una redirección.
  if (seg.includes(">") && REDIRECT_WRITE.test(seg.replace(QUOTED, "''"))) risk = maxRisk(risk, "change");
  if (g.includes("(")) {
    for (const [, name] of g.matchAll(METHOD_CALL)) {
      if (POWER_METHOD.test(name)) return "disruptive";
      if (!READ_METHOD.test(name)) risk = maxRisk(risk, "change");
    }
  }
  const n = normalize(seg, c, vars);
  risk = maxRisk(risk, n.risk);
  if (risk === "disruptive") return risk;
  // Abreviaturas también sobre el texto tal cual: "exec factoryreset" (FortiOS) empieza con un prefijo de shell.
  if (n.cmd !== seg && abbrevCuts(seg, c)) return "disruptive";
  if (n.done) return risk;
  if (out) {
    out.word = n.word;
    out.cmd = n.cmd;
  }
  if (expr && (!/^[A-Za-z]/.test(n.cmd) || PS_KEYWORDS.has(n.word))) return risk;
  return maxRisk(risk, simpleRisk(n.cmd, n.word, c, afterPipe));
}

/** kill y similares: terminar procesos corta servicio; HUP, USR1/2, CONT o WINCH solo piden recargar o continuar. */
function killRisk(cmd: string): Risk {
  const toks = cmd.split(/\s+/, 8);
  for (let i = 1; i < toks.length; i++) {
    const t = toks[i];
    if (!t.startsWith("-") || t === "--") break;
    if (/^-(l|L)$|^--(list|table)$/.test(t)) return "change";
    const sig = t === "-s" || t === "-n" || t === "--signal" ? (toks[i + 1] ?? "") : t.startsWith("--signal=") ? t.slice(9) : t.slice(1);
    return /^(SIG)?(HUP|USR1|USR2|CONT|WINCH)$|^(0|1|10|12|18|28)$/i.test(sig) ? "change" : "disruptive";
  }
  return "disruptive";
}

/** find: consulta sin -exec/-ok/-delete/-fprint; lo de -exec se evalúa con "{}" reemplazado por la ruta inicial. */
function findRisk(cmd: string, c: Ctx): Risk {
  if (!/\s-(exec|execdir|ok|okdir|delete|fprint\w*|fls)\b/.test(cmd)) return "read";
  let risk: Risk = "change";
  const root = /^\S+\s+(?!-)(\S+)/.exec(cmd)?.[1] ?? ".";
  for (const m of cmd.matchAll(/\s-(?:exec|execdir|ok|okdir)\s+(.*?)(?:\s\\?;|\s\+|$)/g)) {
    risk = maxRisk(risk, evalRisk(m[1].replace(/\{\}/g, root), c.depth + 1));
    if (risk === "disruptive") break;
  }
  return risk;
}

/** awk: system("…") ejecuta ese texto; print > archivo, "cmd" | getline, print | "cmd" e -i inplace cambian. */
function awkRisk(cmd: string, c: Ctx): Risk {
  let risk: Risk = "read";
  if (/\bsystem\s*\(/.test(cmd)) {
    risk = "change";
    for (const m of cmd.matchAll(/\bsystem\s*\(\s*"((?:[^"\\]|\\.)*)"/g)) risk = maxRisk(risk, evalRisk(m[1].replace(/\\(.)/g, "$1"), c.depth + 1));
  }
  if (/\|\s*"|"\s*\||\bprintf?\b[^;}]*>|\s-i\s*inplace|--inplace/.test(cmd)) risk = maxRisk(risk, "change");
  return risk;
}

/** sed: -i escribe el archivo; el comando "e" de GNU sed ejecuta su argumento; "w" y el flag /w o /e escriben o ejecutan. */
function sedRisk(cmd: string, c: Ctx): Risk {
  if (/\s(-[a-zA-Z]*i|--in-place)/.test(cmd)) return "change";
  let risk: Risk = "read";
  const e = /(?:^|[\s'";{}\d$])e\s+([^'";}]+)/.exec(cmd.slice(3));
  if (e) risk = maxRisk("change", evalRisk(e[1], c.depth + 1));
  if (/(?:^|[\s'";{}\d$/])[wW]\s+\S|\/[gIimMp\d]*[ew][gIimMp\d]*(?=['";}\s]|$)/.test(cmd.slice(3))) risk = maxRisk(risk, "change");
  return risk;
}

/** ForEach-Object con -MemberName (o "% Nombre"): llama ese método en cada objeto. */
function memberRisk(cmd: string): Risk {
  const m = /^\S+\s+(?:-(?:MemberName|Mem\w*|M)\s+)?['"]?([A-Za-z_]\w*)/i.exec(cmd);
  if (!m) return "read";
  if (POWER_METHOD.test(m[1]) || /^Stop$/i.test(m[1])) return "disruptive";
  return READ_METHOD.test(m[1]) ? "read" : "change";
}

/**
 * Datos que salen del equipo (o entran desde otro) en un comando que por su forma es consulta. Solo se revisan
 * las consultas: el resto ya es al menos cambio. Las transferencias explícitas (copy, tftp, ftp, scp, sftp, rsync,
 * socat, ncat, execute backup, file copy, Copy-Item, Invoke-WebRequest, certutil, bitsadmin…) no están en ninguna
 * lista de consulta y quedan como cambio sin pasar por aquí.
 *
 * - Clientes de red que contactan el destino de su argumento (ping, nslookup, Resolve-DnsName, curl, nc -z…): no
 *   son consulta si el destino o los datos se arman con el contenido del equipo, ya sea por la entrada ("| ping",
 *   "< archivo", "<<<") o por una expansión ($x, $(…), (…), `…`, %VAR%), que permite sacarlo en nombres DNS o
 *   en la URL (exfiltración por DNS o ICMP).
 * - Lectores de archivos de los equipos de red (more, dir, verify, file show, show, display, type) con una URL
 *   remota: abren una conexión hacia otro servidor.
 * - Rutas UNC ("\\servidor\recurso", "//servidor/recurso", "FileSystem::\\servidor\…", "\\?\UNC\servidor\…") y
 *   consultas a otro equipo por WMI, CIM, RPC o LDAP (remoteAuth): Windows se autentica ante ese equipo con la
 *   cuenta de la sesión (Kerberos o NTLM) y un servidor elegido por quien escribe recibe el hash NTLM.
 */
const NET_CLIENTS = new Set(
  (
    "ping ping6 traceroute traceroute6 tracert tracepath tracepath6 pathping mtr arping nping hping3 nslookup dig host getent " +
    "nc curl wget openssl resolve-dnsname test-netconnection tnc test-connection"
  ).split(" "),
);
const URL_READERS = new Set(["more", "dir", "type", "verify", "file", "show", "display", "request"]);
/** "<", "<<" y "<<<" alimentan la entrada estándar ("<(…)" ya se evalúa como grupo; "<>" es REDIRECT_WRITE). */
const STDIN_REDIRECT = /(?:^|[^<])<(?![(>])/;
const DYNAMIC_ARG = /[$`(]|%\w+%/;
const SINGLE_QUOTED = /'[^']*'/g;
const REMOTE_URL = /(?:^|[\s"'=])(?:tftp|ftps?|sftp|scp|rcp|https?|smb|cifs|nfs):/i;
/** Ruta UNC con "\\" o "//" (PowerShell y cmd aceptan las dos). Tras ":" sin otro ":" es una URL ("http://"), no UNC. */
const UNC_PATH = /(?:^|[\s"'=,(]|::)(?:\\\\|\/\/)(?:[?.]\\UNC\\)?[A-Za-z0-9{][^\s\\/"']*[\\/]/i;

/**
 * PowerShell con un equipo de destino: -ComputerName (y su alias -Cn), -CimSession, -Server o -Session, también
 * abreviados como los acepta PowerShell ("-Comp", "-ComputerName:x"). Solo en los cmdlets de consulta de OS_READ.
 */
const PS_CMDLET = /^(get|test|resolve|find|measure|select|where|sort|show|compare|format)-/;
const PS_REMOTE = /\s-(comp(u(t(e(r(n(a(m(e)?)?)?)?)?)?)?)?|cn|cims(e(s(s(i(o(n)?)?)?)?)?)?|serv(e(r)?)?|sess(i(o(n)?)?)?)(?=[\s:]|$)/i;
/**
 * Herramientas de Windows con un equipo de destino que se autentican ante él: systeminfo, tasklist, getmac y
 * driverquery /s, typeperf -s, "w32tm /query /computer:", "nltest /server:" y Test-WSMan con destino.
 */
const WIN_REMOTE = /^((systeminfo|tasklist|getmac|driverquery)\b.*\s[/-]s(?=[\s:]|$)|typeperf\b.*\s-s\s|w32tm\b(?=.*\/query\b).*\/computer:|nltest\b.*\/server:|test-wsman\s+\S)/i;
const WIN_REMOTE_WORDS = new Set(["systeminfo", "tasklist", "getmac", "driverquery", "typeperf", "w32tm", "nltest", "test-wsman"]);

/** Consulta que se autentica ante otro equipo con la cuenta de la sesión (ver leavesDevice). */
function remoteAuth(line: string, word: string): boolean {
  if (PS_CMDLET.test(word)) {
    // Test-Connection, Test-NetConnection y Resolve-DnsName no se autentican (ICMP, TCP, DNS); Test-Connection -Source
    // o -Credential sí (WMI en el equipo de origen).
    if (word === "test-connection") return /\s-(so|cr)\w*(?=[\s:]|$)/i.test(line);
    if (!NET_CLIENTS.has(word) && PS_REMOTE.test(line)) return true;
  }
  return WIN_REMOTE_WORDS.has(word) && WIN_REMOTE.test(line);
}

function leavesDevice(line: string, word: string, afterPipe: boolean): boolean {
  if (NET_CLIENTS.has(word)) {
    if (afterPipe) return true;
    const bare = line.replace(SINGLE_QUOTED, "''");
    if (DYNAMIC_ARG.test(bare) || (bare.includes("<") && STDIN_REDIRECT.test(bare.replace(QUOTED, "''")))) return true;
  }
  if (URL_READERS.has(word) && REMOTE_URL.test(line)) return true;
  if (remoteAuth(line, word)) return true;
  return (line.includes("\\\\") || line.includes("//")) && UNC_PATH.test(line);
}

/**
 * Clientes de red para contactsNetwork: los de NET_CLIENTS, ssh, telnet y stelnet (en su propio caso de simpleRisk),
 * ncat, "dnslookup" y "packet-tracer", y tras "execute" (FortiOS, también abreviado) o "admin" (IOS XR).
 */
const NET_TOOLS = new Set([...NET_CLIENTS, "ssh", "telnet", "stelnet", "ncat", "dnslookup", "packet-tracer"]);
const EXEC_PREFIX = /^(?:exe(?:c(?:u(?:te?)?)?)?|admin)\s+(\S+)/i;
/**
 * Contactan un destino que elige quien escribe sin ser uno de esos clientes: "show host <nombre>" de Junos (resuelve
 * el nombre), nbtstat -a/-A (NetBIOS), "w32tm /stripchart|/monitor" (NTP), nltest (localiza controladores de dominio
 * por DNS), "dns-sd -G|-Q", "dscacheutil -q host", "resolvectl query" y "scutil -r" (resuelven el nombre).
 */
const NET_FORMS = /^(sh(ow?)?\s+host?\s+\S|nbtstat\b.*\s-a(\s|$)|w32tm\b.*\/(stripchart|monitor)\b|nltest\b|dns-sd\s+-[GQ]\b|dscacheutil\s+-q\s+host\b|resolvectl\s+query\b|scutil\s+-r\b)/i;
const NET_FORM_WORDS = new Set(["sh", "sho", "show", "nbtstat", "w32tm", "nltest", "dns-sd", "dscacheutil", "resolvectl", "scutil"]);

/** Programas que toman la terminal (paginadores, editores, monitores de pantalla completa). */
const FULLSCREEN = new Set(["less", "most", "pg", "man", "info", "htop", "atop", "btop", "nload", "bmon", "cpview", "nano", "pico", "emacs", "screen", "tmux", "nmtui"]);

/** El comando abre un programa interactivo (ver opensInteractive). `word`: su primera palabra en minúsculas. */
function interactive(cmd: string, word: string, afterPipe: boolean): boolean {
  switch (word) {
    case "more":
      // "more flash:x" (IOS) muestra un archivo del equipo; en Linux, macOS y Windows es un paginador.
      return afterPipe || !/\s[a-z][\w-]*:/i.test(cmd);
    case "top":
      // -b (por lotes), -n (iteraciones) o -l (macOS) terminan solos.
      return !/\s-[A-Za-z]*[bnl]/.test(cmd);
    case "iftop":
      return !/\s-[A-Za-z]*t/.test(cmd);
    case "nettop":
      return !/\s-[A-Za-z]*[lL]/.test(cmd);
    case "mtr":
      return !/\s(-[A-Za-z]*[rwjCxlp]|--(report|json|csv|xml|raw|split))/.test(cmd);
    case "journalctl":
    case "systemctl":
    case "networkctl":
      // systemd abre un paginador si la salida no cabe en la pantalla, salvo --no-pager, "journalctl -f" o "systemctl is-…".
      return !/\s--no-pager\b/.test(cmd) && !(word === "journalctl" && /\s(-[A-Za-z]*f|--follow)\b/.test(cmd)) && !(word === "systemctl" && /\sis-/.test(cmd));
    case "nslookup":
      // Sin destino abre su propio intérprete.
      return !/\s[^\s-]/.test(cmd);
    case "diagnose":
      return /^diagnose\s+sys\s+top(?![\w-])/i.test(cmd);
    case "get":
      return /^get\s+system\s+performance\s+top\b/i.test(cmd);
    case "monitor":
      // Junos: pantalla completa que acepta teclas ("c" borra los contadores).
      return /^monitor\s+interface\b/i.test(cmd);
  }
  return FULLSCREEN.has(word);
}

/** Anota en `seen` si el comando contacta un destino elegido o abre un programa interactivo. */
function noteUse(cmd: string, word: string, afterPipe: boolean): void {
  const ex = word === "admin" || word.startsWith("exe") ? EXEC_PREFIX.exec(cmd) : null;
  if (ex) {
    const w = ex[1].toLowerCase();
    if (NET_TOOLS.has(w)) seen |= NET;
    // "execute ssh|telnet" y "execute ha manage" abren una sesión en otro equipo.
    if (w === "ssh" || w === "telnet" || /^\S+\s+ha\s+manage\b/i.test(cmd)) seen |= INTERACTIVE;
    return;
  }
  if ((NET_TOOLS.has(word) && word !== "ssh" && word !== "telnet" && word !== "stelnet") || (NET_FORM_WORDS.has(word) && NET_FORMS.test(cmd)) || remoteAuth(cmd, word)) seen |= NET;
  if (interactive(cmd, word, afterPipe)) seen |= INTERACTIVE;
}

/** Un comando ya normalizado: corta servicio, es una consulta conocida o, si no, cambio. */
function simpleRisk(cmd: string, word: string, c: Ctx, afterPipe: boolean): Risk {
  if (cuts(cmd) || (c.multi && DISRUPTIVE_IN_CONFIG.test(cmd))) return "disruptive";
  if (STP_MODE.test(cmd) && !c.lines.some((l) => /^spanning-tree$/i.test(l))) return "disruptive";
  if (abbrevCuts(cmd, c)) return "disruptive";
  noteUse(cmd, word, afterPipe);
  switch (word) {
    case "kill":
    case "killall":
    case "pkill":
    case "killall5":
    case "skill":
      return killRisk(cmd);
    case "ssh":
    case "telnet":
    case "stelnet": {
      const remote = remoteCommand(cmd);
      // Cliente (no configuración del servidor): contacta el destino; sin comando abre una sesión en el otro equipo.
      if (remote !== null) seen |= remote === "" ? NET | INTERACTIVE : NET;
      // Tras un "|" o con "<" el cliente lee de la entrada y la envía al otro equipo (comandos o un archivo).
      if (remote === "") return afterPipe || STDIN_REDIRECT.test(cmd.replace(QUOTED, "''")) ? "change" : "read";
      if (remote !== null) return maxRisk("change", evalRisk(remote, c.depth + 1));
      break;
    }
    case "find":
      return findRisk(cmd, c);
    case "awk":
    case "gawk":
    case "mawk":
    case "nawk":
      return awkRisk(cmd, c);
    case "sed":
      return sedRisk(cmd, c);
    case "%":
    case "foreach-object":
    case "foreach":
      return memberRisk(cmd);
  }
  const line = cmd.includes(">") ? cmd.replace(SAFE_REDIRECT, "") : cmd;
  const check = PIPE_READ_CHECK.get(word);
  const read =
    (isRead(line, word) &&
      !WRITE_FLAGS[word]?.test(line) &&
      !EXTRA_CHANGE.test(line) &&
      !(word === "date" && DATE_SET.test(line)) &&
      !(word === "wget" && !wgetRead(line))) ||
    (check ? check(line) : PIPE_READ_WORDS.has(word));
  return read && !leavesDevice(line, word, afterPipe) ? "read" : "change";
}

// ---------- Validación ----------

const ID = /^[a-z0-9][a-z0-9_.-]{0,63}$/;
const MAX_COMMANDS = 3000;
const str = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max;
/**
 * Caracteres que el catálogo no muestra pero el equipo sí interpreta: un "\r" suelto ejecuta
 * otra línea, Ctrl-U o backspace borran lo anterior y los de dirección Unicode reordenan el
 * texto. Un pack importado podría usarlos para que "show clock" esconda un "reload".
 */
const HIDDEN_CHARS = /[\x00-\x08\x0b-\x1f\x7f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/;
const VARIABLE_OK = (cmd: string) => (cmd.match(/\{\{[^}]*\}\}/g) ?? []).every((m) => /^\{\{\s*[\w.-]+\s*\}\}$/.test(m));

export interface Validation {
  pack: Pack | null;
  errors: string[];
  warnings: string[];
}

/** Valida y normaliza un pack. Descarta comandos inválidos con aviso, sin aceptar basura. */
export function validatePack(raw: unknown): Validation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const o = raw as Record<string, unknown>;
  if (!o || typeof o !== "object") return { pack: null, errors: ["No es un objeto JSON"], warnings };
  if (o.format !== "netterminal-commands") errors.push('Falta "format": "netterminal-commands"');
  if (o.formatVersion !== 1) errors.push('"formatVersion" debe ser 1');
  if (!str(o.id, 64) || !ID.test(o.id)) errors.push("id inválido (minúsculas, números, - _ .)");
  if (!str(o.name, 120)) errors.push("Falta name");
  if (!str(o.vendor, 32) || !ID.test(o.vendor)) errors.push("vendor inválido");
  if (!Array.isArray(o.commands)) errors.push("Falta la lista commands");
  if (errors.length) return { pack: null, errors, warnings };

  const platforms: Platform[] = [];
  for (const p of (Array.isArray(o.platforms) ? o.platforms : []) as Record<string, unknown>[]) {
    if (!p || !str(p.id, 32) || !ID.test(p.id) || !str(p.label, 120)) {
      warnings.push("Plataforma inválida descartada");
      continue;
    }
    let detect: string | undefined;
    if (str(p.detect, 300)) {
      try {
        new RegExp(p.detect, "im");
        if (riskyRegex(p.detect)) warnings.push(`Regex de detección de ${p.id} descartada (potencialmente lenta)`);
        else detect = p.detect;
      } catch {
        warnings.push(`Regex de detección inválida en ${p.id}`);
      }
    }
    platforms.push({ id: p.id, label: p.label, detect, note: str(p.note, 300) ? p.note : undefined });
  }
  const platformIds = new Set(platforms.map((p) => p.id));

  const commands: PackCommand[] = [];
  const seen = new Set<string>();
  const list = o.commands as Record<string, unknown>[];
  if (list.length > MAX_COMMANDS) warnings.push(`Se cargan solo los primeros ${MAX_COMMANDS} comandos`);
  for (const c of list.slice(0, MAX_COMMANDS)) {
    if (!c || !str(c.cmd, 2000) || !str(c.desc, 1000)) {
      warnings.push("Comando sin cmd o desc descartado");
      continue;
    }
    if (HIDDEN_CHARS.test(c.cmd)) {
      warnings.push(`Comando con caracteres de control descartado: ${c.cmd.replace(HIDDEN_CHARS, "?").slice(0, 60)}`);
      continue;
    }
    if (!VARIABLE_OK(c.cmd)) {
      warnings.push(`Variable inválida en: ${c.cmd.slice(0, 60)}`);
      continue;
    }
    if (seen.has(c.cmd)) continue;
    seen.add(c.cmd);
    const risk: Risk = c.risk === "read" || c.risk === "change" || c.risk === "disruptive" ? c.risk : "change";
    const cat = typeof c.cat === "string" && CATEGORIES.includes(c.cat) ? c.cat : "Otros";
    const plats = Array.isArray(c.platforms) ? (c.platforms as unknown[]).filter((x): x is string => typeof x === "string" && platformIds.has(x)) : undefined;
    const variants = Array.isArray(c.variants)
      ? (c.variants as Record<string, unknown>[])
          .filter((v) => v && str(v.cmd, 2000) && !HIDDEN_CHARS.test(v.cmd) && Array.isArray(v.platforms) && VARIABLE_OK(v.cmd as string))
          .map((v) => ({
            cmd: v.cmd as string,
            platforms: (v.platforms as unknown[]).filter((x): x is string => typeof x === "string" && platformIds.has(x)),
          }))
          .filter((v) => v.platforms.length)
      : undefined;
    const source = str(c.source, 500) && /^https:\/\//.test(c.source) ? c.source : undefined;
    commands.push({
      cmd: c.cmd,
      desc: c.desc,
      cat,
      risk,
      platforms: plats?.length ? plats : undefined,
      variants: variants?.length ? variants : undefined,
      note: str(c.note, 600) ? c.note : undefined,
      source,
    });
  }
  if (!commands.length) return { pack: null, errors: ["El pack no tiene comandos válidos"], warnings };

  return {
    pack: {
      format: "netterminal-commands",
      formatVersion: 1,
      id: o.id as string,
      name: o.name as string,
      vendor: o.vendor as string,
      vendorName: str(o.vendorName, 60) ? o.vendorName : (o.vendor as string),
      version: str(o.version, 30) ? o.version : undefined,
      author: str(o.author, 120) ? o.author : undefined,
      description: str(o.description, 600) ? o.description : undefined,
      detectCommand: str(o.detectCommand, 120) && computeRisk(o.detectCommand) === "read" ? o.detectCommand : undefined,
      platforms,
      commands,
    },
    errors,
    warnings,
  };
}

// ---------- Catálogo combinado ----------

/**
 * Orden de los packs para el catálogo: primero "Mis comandos" (user-<fabricante>), luego los
 * incluidos y al final los importados. Ante el mismo comando gana el primero, así que una
 * actualización que agrega a los incluidos un comando que el usuario ya tenía no oculta su
 * versión (descripción, riesgo, notas). Un importado con el id de uno incluido se ignora.
 */
export function orderPacks(builtin: Pack[], user: Pack[]): Pack[] {
  const own = user.filter((p) => p.id.startsWith("user-"));
  const imported = user.filter((p) => !p.id.startsWith("user-") && !builtin.some((b) => b.id === p.id));
  return [...own, ...builtin, ...imported];
}

export function buildCatalog(packs: Pack[], disabled: string[]): CatalogVendor[] {
  const vendors = new Map<string, CatalogVendor>();
  // Comandos ya agregados por fabricante (evita buscar en la lista en cada comando).
  const seen = new Map<string, Set<string>>();
  for (const pack of packs) {
    if (disabled.includes(pack.id)) continue;
    let v = vendors.get(pack.vendor);
    if (!v) {
      v = { id: pack.vendor, name: pack.vendorName, platforms: [], commands: [] };
      vendors.set(pack.vendor, v);
    }
    v.detectCommand ??= pack.detectCommand;
    for (const p of pack.platforms ?? []) if (!v.platforms.some((x) => x.id === p.id)) v.platforms.push(p);
    let cmds = seen.get(v.id);
    if (!cmds) seen.set(v.id, (cmds = new Set()));
    for (const c of pack.commands) {
      if (cmds.has(c.cmd)) continue;
      cmds.add(c.cmd);
      const computed = computeRisk([c.cmd, ...(c.variants ?? []).map((x) => x.cmd)].join("\n"));
      const effective = maxRisk(c.risk, computed);
      v.commands.push({
        ...c,
        risk: effective,
        declaredRisk: c.risk,
        escalated: effective !== c.risk,
        packId: pack.id,
        packName: pack.name,
        builtin: !!pack.builtin,
      });
    }
  }
  return [...vendors.values()];
}

/** Sintaxis del comando para una plataforma (variante si existe). */
export function commandFor(c: PackCommand, platform: string | null): string {
  if (!platform) return c.cmd;
  return c.variants?.find((v) => v.platforms.includes(platform))?.cmd ?? c.cmd;
}

/** ¿El comando aplica a la plataforma? (sin plataforma elegida, todos aplican) */
export function appliesTo(c: PackCommand, platform: string | null): boolean {
  if (!platform || !c.platforms?.length) return true;
  return c.platforms.includes(platform) || !!c.variants?.some((v) => v.platforms.includes(platform));
}

/** Plataforma según la salida del comando de detección. */
export function detectPlatform(v: CatalogVendor, output: string): Platform | null {
  for (const p of v.platforms) {
    if (!p.detect) continue;
    try {
      if (new RegExp(p.detect, "im").test(output.slice(0, 20000))) return p;
    } catch {
      /* regex inválida: se ignora */
    }
  }
  return null;
}
