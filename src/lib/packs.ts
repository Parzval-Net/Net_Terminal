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
 */
const READ_START =
  /^(show|display|get|dir|more|ping|traceroute|tracert|tracepath|verify|monitor (traffic(?!.*\bwrite-file\b)|interface|start|stop)|test policy|compare configuration|who|policy-check|tcpdump|dnslookup|nslookup|vpn-tunnel diag-report|(undo )?terminal (logging|monitor|debugging|trapping)|request system storage cleanup dry-run|request system software validate|admin show|packet-tracer|ethanalyzer local(?!.*\bwrite\b)|terminal (length|width|monitor|pager)|no page\s*$|checkpoint diff\b|diag cable-diagnostic show\b|cd \/md\S*\s*$|mdconnect\s*$|screen-length\s+\d+\s+temporary|screen-width|set cli |file (list|show|checksum)|commit check|request support information|diagnose (sys (top|status|session (stat|list)|session filter(?=\s*$)|ha (status|checksum (?!recalculate)))|vpn (ike gateway|tunnel) list|sniffer packet|ip (route|arp) list|firewall iprope lookup|test application(?!\s+\S+\s+99\b))|execute (ping6?|traceroute6?|telnet|ssh)(?!-)|execute (ping|traceroute)-options view-settings|tftp \S+ put|copy (running-config|startup-config|run|start) (tftp|scp|ftp|http)|execute backup)\b/i;

/**
 * Cortan servicio o sesiones, o dejan el equipo en otro estado (conmutación, rollback,
 * borrado de tablas, túneles o SA, reinicio de equipos administrados, módems o daemons,
 * prueba de cable TDR). Incluye el "debug" de IOS, que puede saturar la CPU.
 */
const DISRUPTIVE =
  /^(reload(?! cancel)|reboot|shutdown|halt|poweroff|power-off|erase|format(?!-(Table|List|Wide|Custom|Hex)\b)|write erase|delete|undelete|rmdir|squeeze|zeroize|factory|configure replace|configure revert now|reset saved-configuration|reset (bgp|ospf|isis|mpls|ip ospf|ike sa|ipsec sa|recycle-bin|mac-address(?! flapping))|rollback (configuration|running-config)\b|checkpoint rollback|commit replace|abort trial|debug(ging)?\b|redundancy (force-)?switchover|(system|slave|master) switchover|test cable-diagnostics|diag cable-diagnostic test|show cable-diag\b|diagnose switch physical-ports cable-diag|clear (ip )?(bgp|ospf|isis|eigrp)(?!.*\bsoft\b)|clear bgp(?!.*\bsoft\b)|clear (ip )?route|clear arp\s*$|clear ip nat translation|clear crypto\b|clear mac(-| )address-table\b|clear interfaces statistics all\b|clear ethernet-switching table\s*$|clear security flow session\b|request system (reboot|halt|power-off|zeroize|logout|software rollback)|request chassis cluster failover|request chassis routing-engine master\b|request node (reboot|halt|power-off|offline)|restart \S+|set interfaces \S+( unit \d+)? disable\b|cfg -x|execute (reboot|shutdown|factoryreset\w*|formatlogdisk|restore|ha failover|disk format|sim-switch|clear system arp table|poe-reset|(bpdu|loop)-guard reset)|execute (lte|5g)-modem (reboot|power-off|sim-switch|start-upgrade|firmware-upgrade|carrier-config switch)|execute switch-controller (switch-action (poe reset|cable-diag|bpdu-guard reset|loop-guard reset|restart|set-standalone|factory-reset)|poe-reset|switch-software upgrade)|execute wireless-controller (reset-wtp|restart-\S+|push-wtp-image|rolling-wtp-upgrade)|execute extender (reset-fortiextender|restart-fortiextender-daemon|push-fortiextender-image|install-forticloud-\S+)|execute router clear (bgp|ospf)(?!.*\bsoft\b)|diagnose sys session clear|diagnose sys ha reset-uptime|diagnose switch-controller restart-daemon|diagnose test application \S+ 99\b|diagnose vpn tunnel down\b|diagnose vpn ike (gateway (clear|flush)|restart)\b|diagnose vpn "?\/ike\/restart|diagnose firewall auth clear\b|fnsysctl killall\b|schedule reboot|install (activate|remove|commit)|install add\b.*\sactivate\b|deactivate|cpstop|cpstart|cprestart|cphastop|mdsstop|fw unload(local)?|clusterXL_admin down|set cluster member admin down|fwaccel off|fw tab\b.*\s-x\b|fw ctl conntab\b.*\s-x\b|fw ctl zdebug\b|fw ctl debug (?!(0|-x)\s*$)\S|vpn tu (del|delete)\b|save config\s*$|load configuration\b|set interface \S+ state off\b|set static-route\b.*\boff\b|upgrade system\b|upgrade\s*$|vpn-tunnel rekey\b|cluster (failover|reboot|reset)\b|import config\b|restore (image|factory-default|backup-image)\b|restore-defaults\b|boot system( flash)?( primary| secondary)?\s*$|interface \S+ (disable|speed-duplex)\b|no interface \S+ power-over-ethernet\b|vsx update-software\b|poe mode disable|apboot\b|ap-re(group|name)\b|ifconfig \S+ down|ip (-\S+ )*l(i(nk?)?)? s(et?)? (dev )?\S+ down|cphaprob\b.*-s problem)\b/i;

/**
 * FortiOS: "diagnose ..." consulta salvo que lleve un verbo que cambia estado ("up" y "down"
 * levantan o bajan túneles, "wtp_filter" o "sniff" fijan filtros o capturas en el AP). El verbo
 * se busca también unido con "_" o "-". "diagnose debug" va aparte (FORTI_DEBUG_READ): casi
 * todo lo que lleva activa o ajusta la depuración, que es un cambio de estado.
 */
const FORTI_DIAG_READ =
  /^diagnose(?!\s+debug\b)(?!.*(?:^|[\s_-])(clear|delete|del|reset|kill|killall|restart|flush|enable|disable|set|unset|start|stop|filter|update|purge|failover|clean|reload|test(?!-connectivity)|run|reboot|shutdown|up|down|recalculate|refresh|kick\w*|sniff|plain-ctl|atcmd|cmd|trigger|push|upgrade|add|remove|renew|release|erase|format|toggle|block|unblock)(?=$|[\s_-]))/i;
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
 * unregister), las capturas que escriben a disco (-o) y el menú interactivo "vpn tu", que
 * permite borrar SA.
 */
const CHECKPOINT_READ =
  /^(fw (ver|stat|tab\b(?!.*\s-x\b)|ctl (iflist|arp|conntab(?!.*\s-x\b)|multik (stat|print_heavy_conn)|affinity -l|fast_accel show_table|pstat|chain|get)\b|up_execute|samp get|log|lslogs|getifs)|fwaccel (stat|stats|conns|ver)\b|cphaprob\b(?!.*\s-d\b)(?!.*\b(un)?register\b)|cpstat|cpinfo(?!.*\s-o\b)|cplic print|cpview|cpwd_admin list|api status|mdsstat|mdsenv|\$MDSVERUTIL|vpn (tu (tlist|list)\b|overlap_encdom)|vsenv|vsx stat|ips stat|mgmt_cli show|asg (monitor|stat)|connection_pipelining (status|heaviest_conn)|dynamic_balancing -p|cppcap(?!.*\s-o\b)|fw monitor(?!.*\s-o\b)|fgate stat|cp_log_export show|set virtual-system \S+$)/i;

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
 */
const LINUX_READ = new RegExp(
  "^((top|uptime|free|df|du|cat|less|tail|head|grep|ls|lsof|lsns|lsblk|lscpu|lsmod|lsusb|lshw|uname|raid_diagnostic|lspci|netstat)(\\s|$)|dmidecode(?!.*\\s--dump-bin\\b)(\\s|$)|hostname( -\\w+)*\\s*$|" +
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
  // tcpdump: -w escribe la captura y -G rota archivos (exige -w); tshark: -w y -b (anillo).
  /^tcpdump\b.*\s-[A-Za-z]*[wG]\b/,
  /^tshark\b.*\s-[A-Za-z]*[wb]\b/,
  // dmesg -c/-C vacía el buffer del kernel; -n, -D y -E cambian el nivel de la consola.
  /^dmesg\b.*\s(-[A-Za-z]*[cCnDE]|--(clear|read-clear|console-\w+))/,
  // ss -K cierra conexiones; -D vuelca a un archivo.
  /^ss\b.*\s(-[A-Za-z]*[KD]|--(kill|diag)\b)/,
  // curl: otro método, datos o subida (-X, -d, -F, -T, --json…), escribir archivos (-o salvo a
  // /dev/null, -O, -D, -c) o leer opciones de un archivo (-K) ya no es una consulta.
  /^curl\b.*\s(-[A-Za-z]*[XdDFTOKcQ]|-[A-Za-z]*o\s*(?!\/dev\/null\b|nul\b|\$null\b)\S|--(request|data|form|upload-file|output|remote-name|config|json|cookie-jar|post30[123]|dump-header|trace|trace-ascii|stderr|libcurl|create-dirs|ftp-create-dirs|quote|mail-rcpt))/,
];
const WRITE_FLAGS: Record<string, RegExp> = { tcpdump: TCPDUMP_WRITE, tshark: TSHARK_WRITE, dmesg: DMESG_WRITE, ss: SS_WRITE, curl: CURL_WRITE };

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
      // netsh [contexto...] show: "show" debe ser el verbo (antes de él solo contextos).
      "netsh(\\s+-[rcup]\\s+\\S+)*(\\s+(?!(set|add|delete|del|reset|start|stop|dump|connect|disconnect|import|export|install|uninstall|exec|flush|renew|release|refresh|reconnect|update|init|commit|abort|alias|unalias|offline|online|pushd|popd)\\b)[a-z0-9][\\w-]*){0,5}\\s+show\\b",
      "route print|getmac|nbtstat -[acnsS]\\b|pathping|systeminfo|whoami|typeperf(?!.*\\s-o\\b)|w32tm /(query|stripchart|monitor|tz)\\b",
      "pktmon (status|list|filter list|counters|etl2txt|etl2pcap|format|pcapng)\\b",
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
      "/usr/libexec/ApplicationFirewall/socketfilterfw --(get|list)\\w*(?!.*\\s--(set|add|remove|block|unblock))",
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
 * si solo abre la sesión y, con ssh, el comando que se ejecutará en el otro equipo (su
 * riesgo es el de ese comando: "ssh host reboot" corta servicio). Una opción que ejecuta
 * algo localmente (ProxyCommand, LocalCommand) o que lee comandos de un archivo no es consulta.
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
        if (c === "O" || c === "F") return null;
        const arg = k < t.length - 1 ? t.slice(k + 1) : toks[++i] ?? "";
        if (c === "o" && /(proxy|local|knownhosts)command|permitlocalcommand/i.test(arg)) return null;
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
    const cmd = toks.slice(i).join(" ");
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
 * Una consulta deja de serlo si su salida se ejecuta, se escribe a disco o termina procesos.
 * "| save" (Junos), "| redirect" / "| append" (IOS) y "| file disk0:x" (IOS XR) guardan la
 * salida en el equipo. En PowerShell, los cmdlets cuyo verbo cambia algo (Set-Content,
 * Add-Content, Export-Csv, Out-File, Remove-Item, Invoke-…) y Tee-Object salvo con -Variable.
 */
const PS_CHANGE_VERBS =
  "Add|Block|Clear|Close|Compress|Connect|Copy|Disable|Disconnect|Dismount|Enable|Export|Grant|Initialize|Install|Invoke|Lock|Mount|Move|New|Publish|Register|Remove|Rename|Repair|Reset|Restart|Restore|Resume|Revoke|Save|Send|Set|Start|Stop|Suspend|Sync|Unblock|Uninstall|Unlock|Unregister|Update|Format(?!-(Table|List|Wide|Custom|Hex)\\b)|Write(?!-(Output|Host|Verbose|Debug|Information|Warning|Error|Progress)\\b)";
const PIPE_CHANGES = new RegExp(
  `^(sh|bash|zsh|ksh|dash|fish|csh|tcsh|python[\\d.]*|perl|ruby|node|php|pwsh|powershell|cmd|source|xargs|parallel|sudo|doas|iex|Invoke-Expression|save|redirect|append|file\\s+\\S*:|Tee-Object(?!\\s+-Var(iable)?\\b)|tee|Out-(File|Printer)|(${PS_CHANGE_VERBS})-\\w+)(?![\\w-])`,
  "i",
);
/** ForEach-Object / Where-Object (o % y ?) con un bloque que cambia algo o ejecuta texto. */
const PS_BLOCK = /^(ForEach-Object|foreach|Where-Object|%|\?)(\s|\{|$)/i;
const PS_BLOCK_CHANGES = new RegExp(`\\b((${PS_CHANGE_VERBS})-\\w+|iex|Invoke-Expression|Out-File|Tee-Object)\\b|&\\s*[$({'"]`, "i");
/**
 * Llamadas a métodos (".Delete()", ".Reboot()" de WMI o .NET). Solo los de esta lista son de
 * consulta; los de POWER_METHOD reinician o apagan el equipo o sueltan su IP.
 */
const METHOD_CALL = /\.([A-Za-z_]\w*)\s*\(/g;
const READ_METHOD = /^(To\w+|Trim\w*|Split|Replace|Contains\w*|StartsWith|EndsWith|Substring|(Last)?IndexOf\w*|Pad(Left|Right)|Get\w*|Equals|CompareTo|Add(Days|Hours|Minutes|Seconds|Milliseconds|Months|Years|Ticks)|Normalize|IsMatch|Match(es)?|Format|Where|Count)$/i;
const POWER_METHOD = /^(Reboot|Shutdown|Win32Shutdown\w*|ReleaseDHCPLease\w*|Disable)$/i;
/**
 * ">" y ">>" (también "2>", "&>") escriben un archivo, salvo a /dev/null, $null o nul. "2>&1" y
 * ">&2" solo redirigen a otra salida.
 */
const REDIRECT_WRITE = /(?:^|[^-=<>])(?:\d|&)?>{1,2}\s*(?!&\d|\/dev\/(null|stdout|stderr)\b|\$null\b|nul\b)\S/i;
/** Redirecciones que no escriben nada: se quitan antes de reconocer la consulta. */
const SAFE_REDIRECT = /\s+(?:\d|&)?>{1,2}\s*(?:&\d|\/dev\/null|\$null|nul)(?=\s|$)/gi;

/**
 * sudo y sus opciones: las que llevan argumento (-u usuario, -g grupo…) consumen también la
 * palabra siguiente. Distingue mayúsculas: -H, -P y -S son banderas.
 */
const SUDO = /^sudo(\s+(-[ugCDpRrTU]\s+\S+|--(user|group|chdir|host|prompt|role|type|close-from|other-user)=\S+|-\S+))*\s+/;

/** Navegación de contexto en FortiOS con VDOM (no cambia configuración). */
const FORTI_CONTEXT = /^(config global|config vdom|edit \S+|end|next)$/i;

/** ethtool -s (minúscula) cambia velocidad/dúplex y renegocia el enlace; -S solo muestra. */
const ETHTOOL_SET = /^ethtool -s\b/;

/**
 * Dentro de un bloque de configuración, estas órdenes cortan servicio: apagar la interfaz o su
 * PoE, reiniciarla ("restart" de VRP), devolverla a fábrica ("default interface"), cambiar su
 * velocidad, cambiar o quitar su IP (IOS, VRP y la forma "ip a.b.c.d/n" de Fireware) o "apply",
 * que en Fireware aplica de inmediato todos los cambios pendientes de políticas.
 */
const DISRUPTIVE_IN_CONFIG =
  /^(shutdown|set (status|admin|admin-status) (down|disable)|set poe-status disable|disable|no enable\s*$|restart\s*$|default interface\b|power inline never|undo poe enable|poe mode disable|link-speed\b|(no |undo )?ip address\b|ip \d+\.\d+\.\d+\.\d+\/\d+|apply\s*$|set .*admin-status down)\b/i;

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
 * Partes de una línea separadas por "|" fuera de comillas: en "grep -E 'up|reboot' x" el "|"
 * es parte de la expresión regular. Con comillas sin cerrar se corta en todos los "|".
 */
function splitPipes(line: string): string[] {
  if (!line.includes("|")) return [line];
  if (!line.includes("'") && !line.includes('"')) return line.split("|");
  const parts: string[] = [];
  let quote = "";
  let start = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) quote = "";
    } else if (c === "'" || c === '"') quote = c;
    else if (c === "|") {
      parts.push(line.slice(start, i));
      start = i + 1;
    }
  }
  if (quote) return line.split("|");
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

const riskCache = new Map<string, Risk>();

/**
 * Riesgo según el contenido. Analiza cada línea (sin lo que va tras "|"). Un comando que
 * no se reconoce como consulta se trata como cambio: ante la duda, se pide confirmación.
 */
/** Riesgo mayor entre las líneas de un texto de varios comandos (aprobaciones MCP). */
export function textRisk(text: string): Risk {
  return text
    .split(/\r?\n|\r/)
    .filter((l) => l.trim())
    .map((l) => computeRisk(l))
    .reduce<Risk>((a, b) => maxRisk(a, b), "read");
}

export function computeRisk(cmd: string): Risk {
  let risk = riskCache.get(cmd);
  if (risk === undefined) {
    // Es pura: se memoriza para no repetir las regex al recargar o reconstruir el catálogo.
    if (riskCache.size >= 10000) riskCache.clear();
    risk = evalRisk(cmd);
    riskCache.set(cmd, risk);
  }
  return risk;
}

const cuts = (x: string) => DISRUPTIVE.test(x) || OS_DISRUPTIVE.test(x);

/** La línea es una consulta (`word`: su primera palabra en minúsculas). */
function isRead(line: string, word: string): boolean {
  if (word === "ip" || word === "bridge") return iprouteRead(line.split(/\s+/), word === "ip" ? IP : BRIDGE);
  if (word === "nmcli") return nmcliRead(line.split(/\s+/));
  if (word === "diagnose" && /^diagnose\s+debug\b/i.test(line)) return FORTI_DEBUG_READ.test(line);
  return (
    READ_START.test(line) ||
    abbrevRead(line) ||
    FORTI_DIAG_READ.test(line) ||
    FORTI_EXEC_READ.test(line) ||
    FORTIAP_READ.test(line) ||
    CHECKPOINT_READ.test(line) ||
    LINUX_READ.test(line) ||
    ETHTOOL_READ.test(line) ||
    IPTABLES_READ.test(line) ||
    OS_READ.test(line)
  );
}

function evalRisk(cmd: string): Risk {
  // Un "\r" suelto también separa comandos en el equipo, y Ctrl-Z termina la línea (IOS).
  if (/[\r\x1a]/.test(cmd)) cmd = cmd.replace(/\r\n?|\x1a/g, "\n");
  if (CONTROL_CHARS.test(cmd)) {
    // Esc, Ctrl-D o un carácter invisible: lo que se ejecuta depende del equipo.
    if (OPAQUE_CHARS.test(cmd)) return "disruptive";
    // Teclas de edición: vale lo que verá el equipo y también cada tramo por separado, por si
    // el equipo no las interpreta igual (BS como carácter, Ctrl-C que no borra).
    return maxRisk(evalRisk(cmd.split("\n").map(editedLine).join("\n")), evalRisk(cmd.replace(EDIT_KEYS, "\n")));
  }
  let risk: Risk = "read";
  const lines = cmd
    .split("\n")
    .map((l) => l.split("|")[0].trim())
    .filter(Boolean);
  const multi = lines.length > 1;
  // "config vdom / edit X" o "config global": solo cambia de contexto.
  if (lines.every((l) => FORTI_CONTEXT.test(l)) && /^config (global|vdom)$/i.test(lines[0]) && lines.length <= 2) return "read";
  // Una sustitución `...` o $(...) ejecuta un comando que no se analiza.
  if (/`|\$\(/.test(cmd)) risk = "change";
  const parts = cmd.split("\n").flatMap(splitChain);
  for (const raw of parts.map((l) => l.trim()).filter(Boolean)) {
    // "sudo" no cambia la naturaleza del comando: se evalúa lo que ejecuta.
    const segments = splitPipes(raw).map((x) => x.trim().replace(SUDO, "").replace(/^ip netns exec \S+\s+/i, ""));
    const line = segments[0].includes(">") ? segments[0].replace(SAFE_REDIRECT, "") : segments[0];
    const pipes = segments.slice(1);
    const word = (/^\S+/.exec(line)?.[0] ?? "").toLowerCase();
    // Tras un "|" de shell también corre un comando ("cat x | sudo reboot"). Tras show/display
    // el "|" es un filtro y lo que sigue puede ser una expresión regular ("| include
    // up|reload"): ahí no se evalúa como comando.
    if (cuts(line) || ETHTOOL_SET.test(line) || (multi && DISRUPTIVE_IN_CONFIG.test(line))) return "disruptive";
    if (pipes.length && word !== "show" && word !== "display" && word !== "get" && !abbrevRead(line) && pipes.some(cuts)) return "disruptive";
    const remote = word === "ssh" || word === "telnet" || word === "stelnet" ? remoteCommand(line) : null;
    if (remote) {
      const r = evalRisk(remote);
      if (r === "disruptive") return r;
      risk = maxRisk(risk, r);
    } else if (remote === null && (!isRead(line, word) || WRITE_FLAGS[word]?.test(line))) risk = maxRisk(risk, "change");
    if (pipes.some((x) => PIPE_CHANGES.test(x) || (PS_BLOCK.test(x) && PS_BLOCK_CHANGES.test(x))) || (raw.includes(">") && REDIRECT_WRITE.test(raw))) risk = maxRisk(risk, "change");
    if (raw.includes("(")) {
      for (const [, name] of raw.matchAll(METHOD_CALL)) {
        if (POWER_METHOD.test(name)) return "disruptive";
        if (!READ_METHOD.test(name)) risk = maxRisk(risk, "change");
      }
    }
  }
  return risk;
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
