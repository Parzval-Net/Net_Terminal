/**
 * Asistente de Transferencias: qué comando escribir en el equipo para cada tarea (cargar firmware,
 * copiar un archivo al equipo, respaldar la configuración o traer un archivo a este PC), con qué
 * protocolo y qué necesita estar listo en este PC (servidor activo, subidas permitidas).
 *
 * Cisco, NX-OS, Huawei y Junos reutilizan los perfiles del gestor de archivos (devicefs.ts).
 * FortiGate se agrega aquí porque su flujo es distinto: no copia a una carpeta del equipo, instala
 * la imagen y reinicia.
 * - FortiOS "execute restore image tftp <archivo> <ip>": carga la imagen desde un servidor TFTP,
 *   pide confirmación y reinicia. Fortinet, FortiOS 7.6.6 CLI Reference, "execute restore",
 *   https://docs.fortinet.com/document/fortigate/7.6.6/cli-reference/150608926/execute-restore
 * - FortiOS "execute backup config tftp <archivo> <ip>": Fortinet, FortiOS 7.4.8 CLI Reference,
 *   "execute backup", https://docs.fortinet.com/document/fortigate/7.4.8/cli-reference/229031989/execute-backup
 */
import { profiles, type Vars } from "./devicefs";

export type Vendor = "fortigate" | "cisco" | "nxos" | "huawei" | "juniper";
export type Action = "firmware" | "copy" | "backup" | "pull";
export type Proto = "tftp" | "http";

export const VENDORS: { id: Vendor; label: string }[] = [
  { id: "fortigate", label: "FortiGate (FortiOS)" },
  { id: "cisco", label: "Cisco IOS / IOS-XE / Arista" },
  { id: "nxos", label: "Cisco NX-OS" },
  { id: "huawei", label: "Huawei VRP / H3C" },
  { id: "juniper", label: "Juniper Junos" },
];

export const ACTIONS: { id: Action; label: string; hint: string }[] = [
  { id: "firmware", label: "Cargar firmware", hint: "El equipo descarga la imagen desde este PC" },
  { id: "copy", label: "Copiar archivo al equipo", hint: "El equipo descarga un archivo a su memoria" },
  { id: "backup", label: "Respaldar configuración", hint: "El equipo envía su configuración a este PC" },
  { id: "pull", label: "Traer archivo del equipo", hint: "El equipo envía un archivo de su memoria a este PC" },
];

export interface Recipe {
  command: string;
  /** El equipo escribe en este PC: el servidor TFTP debe aceptar subidas. */
  needsWrite: boolean;
  /** Reinicia o reemplaza el sistema del equipo: se confirma antes de escribirlo en la pestaña. */
  disruptive: boolean;
  /** Aviso corto para el usuario (qué pasa al ejecutarlo, requisitos del fabricante). */
  note?: string;
  source?: string;
}

/** Protocolos con los que el fabricante hace la acción (en orden de preferencia). */
export function protocolsFor(vendor: Vendor, action: Action): Proto[] {
  if (vendor === "fortigate") return action === "firmware" || action === "backup" ? ["tftp"] : [];
  if (vendor === "huawei") return action === "backup" ? [] : ["tftp"];
  if (vendor === "juniper") return action === "firmware" || action === "copy" ? ["http", "tftp"] : [];
  return action === "firmware" || action === "copy" ? ["tftp", "http"] : ["tftp"];
}

const FORTI_RESTORE = "https://docs.fortinet.com/document/fortigate/7.6.6/cli-reference/150608926/execute-restore";
const FORTI_BACKUP = "https://docs.fortinet.com/document/fortigate/7.4.8/cli-reference/229031989/execute-backup";

/**
 * Comando para el equipo, o null si el fabricante no hace esa acción con ese protocolo.
 * `fs` y `extra` vienen del perfil (carpeta del equipo, VRF de NX-OS).
 */
export function recipe(vendor: Vendor, action: Action, proto: Proto, v: { ip: string; port: number; file: string; fs?: string; extra?: string }): Recipe | null {
  if (!protocolsFor(vendor, action).includes(proto)) return null;
  const file = v.file.trim() || "archivo.bin";
  if (vendor === "fortigate") {
    if (action === "firmware")
      return {
        command: `execute restore image tftp ${file} ${v.ip}`,
        needsWrite: false,
        disruptive: true,
        note: "Pide confirmación (y/n) y el equipo se reinicia con la nueva imagen. Respalda la configuración antes.",
        source: FORTI_RESTORE,
      };
    return {
      command: `execute backup config tftp ${file} ${v.ip}`,
      needsWrite: true,
      disruptive: false,
      source: FORTI_BACKUP,
    };
  }
  const p = profiles.find((x) => x.id === vendor);
  if (!p) return null;
  const vars: Vars = { ip: v.ip, port: v.port, file, fs: v.fs ?? p.fs, extra: v.extra ?? "" };
  switch (action) {
    case "firmware":
    case "copy":
      return {
        command: p.upload(vars, proto),
        needsWrite: false,
        disruptive: false,
        note: action === "firmware" ? "Copia la imagen a la memoria del equipo; activarla (boot system, reload) es un paso aparte." : p.note,
      };
    case "backup":
      return p.backup ? { command: p.backup(vars), needsWrite: true, disruptive: false, note: p.note } : null;
    case "pull":
      return p.download ? { command: p.download(vars), needsWrite: true, disruptive: false, note: p.note } : null;
  }
}

/** Fabricante sugerido para la pestaña (plataforma detectada o resaltado), FortiGate incluido. */
export function guessVendor(session?: { platform?: string; highlight?: string }): Vendor {
  const p = session?.platform ?? "";
  if (/^fos/.test(p) || session?.highlight === "fortinet") return "fortigate";
  if (p === "nxos") return "nxos";
  if (/^(junos|ex-legacy)/.test(p) || session?.highlight === "juniper") return "juniper";
  if (/^(vrp|yunshan)/.test(p) || session?.highlight === "huawei") return "huawei";
  return "cisco";
}

/** Nombre sugerido para un respaldo: equipo_AAAAMMDD-HHMM.cfg (solo caracteres seguros para TFTP). */
export function backupName(device: string, now: Date): string {
  const safe = device.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "equipo";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${safe}_${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.cfg`;
}

/** Velocidad media en bytes/s entre el inicio y la última muestra (null si aún no hay datos). */
export function rate(bytes: number, startTs: number, lastTs: number): number | null {
  const s = (lastTs - startTs) / 1000;
  return s >= 0.5 && bytes > 0 ? bytes / s : null;
}

// ---------- Recuperación desde el arranque (consola) ----------

/**
 * Guía para cargar una imagen desde el gestor de arranque, cuando el equipo no tiene firmware o no
 * inicia: el equipo pide los datos por la consola y descarga la imagen por TFTP (siempre puerto 69).
 * Cada paso puede traer valores para copiar o enviar a la pestaña de consola.
 * - FortiGate: Fortinet, "Installing firmware from system reboot" (Administration Guide 7.2.4,
 *   https://docs.fortinet.com/document/fortigate/7.2.4/administration-guide/556915) y "FortiGate BIOS
 *   variations and firmware loading options" (https://community.fortinet.com/t5/FortiGate/FortiGate-BIOS-variations-and-firmware-loading-options/ta-p/190977).
 * - Cisco ROMMON tftpdnld (ISR 1700/2600/2800/3800): Cisco, "How to Use the tftpdnld ROMmon Command",
 *   https://www.cisco.com/c/en/us/support/docs/routers/2600-series-multiservice-platforms/12714-76.html
 */
export interface RecoveryValue {
  label: string;
  value: string;
  /** Se puede enviar a la consola: una línea de comando o la respuesta a una pregunta (con Enter). */
  send: boolean;
  /** Tecla de menú: se envía sola, sin Enter (los menús del boot loader responden a una tecla). */
  key?: boolean;
}
export interface RecoveryStep {
  text: string;
  values?: RecoveryValue[];
  warn?: boolean;
}
export interface RecoveryGuide {
  title: string;
  steps: RecoveryStep[];
  sources: string[];
}

export const RECOVERY_VENDORS: Vendor[] = ["fortigate", "cisco"];

export function recoveryGuide(vendor: Vendor, v: { pcIp: string; deviceIp: string; mask: string; gateway: string; file: string }): RecoveryGuide | null {
  const file = v.file.trim() || "imagen.out";
  if (vendor === "fortigate")
    return {
      title: "FortiGate: cargar firmware desde el menú del boot loader",
      sources: [
        "https://docs.fortinet.com/document/fortigate/7.2.4/administration-guide/556915",
        "https://community.fortinet.com/t5/FortiGate/FortiGate-BIOS-variations-and-firmware-loading-options/ta-p/190977",
        FORTI_RESTORE,
      ],
      steps: [
        { text: "Respalda la configuración si aún hay acceso y usa la imagen .out del modelo exacto (por ejemplo, una de 101F no sirve en un 100F). Compara su checksum con el que publica Fortinet." },
        { text: "Conecta la consola (pestaña Serial, 9600 8N1, control de flujo None) y un cable de red directo entre este PC y el puerto de descarga del equipo (MGMT en un 100F; el boot loader lo indica en \"Image download port\")." },
        { text: `Fija en esa tarjeta la IP ${v.pcIp}/${v.mask} sin puerta de enlace, elígela arriba e inicia TFTP en el puerto 69 escuchando en esa IP.` },
        { text: "Reinicia el equipo (execute reboot o cortando la energía). Cuando aparezca \"press any key to display configuration menu\", presiona una tecla de inmediato." },
        {
          text: "Revisa los parámetros con R: Image download port, Local IP address, TFTP server IP address y Firmware file name deben coincidir con estos valores.",
          values: [{ label: "Revisar parámetros", value: "R", send: true, key: true }],
        },
        {
          text: "Si algo no coincide, entra a C y ajusta: T (servidor TFTP), I (IP local), S (máscara) y F (archivo). N hace ping a este PC; Q vuelve al menú.",
          values: [
            { label: "Configurar", value: "C", send: true, key: true },
            { label: "T · servidor TFTP (este PC)", value: v.pcIp, send: true },
            { label: "I · IP local del FortiGate", value: v.deviceIp, send: true },
            { label: "S · máscara", value: v.mask, send: true },
            { label: "F · archivo de firmware", value: file, send: true },
          ],
        },
        { text: "Formatear (F, confirmar con yes) borra firmware y configuración: úsalo solo si se perdieron las credenciales o el disco está dañado, y después de validar R y el ping.", warn: true },
        { text: "Inicia la transferencia con T y no desconectes el cable ni la energía. El avance se ve en la lista de transferencias.", values: [{ label: "Iniciar transferencia", value: "T", send: true, key: true }] },
        {
          text: "Al terminar pregunta Default/Backup/Run [D/B/R]: D la deja como firmware por defecto y Y confirma el reparticionado (se pierden la imagen por defecto y la de respaldo anteriores).",
          warn: true,
          values: [
            { label: "Guardar como predeterminado", value: "D", send: true, key: true },
            { label: "Confirmar", value: "Y", send: true, key: true },
          ],
        },
        { text: "Primer ingreso: usuario admin y contraseña en blanco; el equipo obliga a definir una nueva." },
        {
          text: "Recomendado: deja también la imagen en la partición de respaldo (desde la CLI, con TFTP aún activo) y verifica las dos particiones y la versión.",
          values: [
            { label: "Imagen de respaldo", value: `execute restore secondary-image tftp ${file} ${v.pcIp}`, send: true },
            { label: "Particiones", value: "diagnose sys flash list", send: true },
            { label: "Versión", value: "get system status", send: true },
          ],
        },
      ],
    };
  if (vendor === "cisco")
    return {
      title: "Cisco ROMMON: tftpdnld (ISR 1700, 2600, 2800, 3800)",
      sources: ["https://www.cisco.com/c/en/us/support/docs/routers/2600-series-multiservice-platforms/12714-76.html"],
      steps: [
        { text: "Conecta la consola y un cable de red entre este PC y el primer puerto Ethernet del router (tftpdnld solo usa ese puerto)." },
        { text: `Fija en este PC la IP ${v.pcIp} con máscara ${v.mask}, elígela arriba e inicia TFTP en el puerto 69. La imagen va en la carpeta compartida (raíz del servidor).` },
        { text: "Con el router en rommon, envía las variables (distinguen mayúsculas y minúsculas). DEFAULT_GATEWAY no puede ser la misma IP del router.", values: [
            { label: "IP del router", value: `IP_ADDRESS=${v.deviceIp}`, send: true },
            { label: "Máscara", value: `IP_SUBNET_MASK=${v.mask}`, send: true },
            { label: "Gateway", value: `DEFAULT_GATEWAY=${v.gateway}`, send: true },
            { label: "Servidor TFTP (este PC)", value: `TFTP_SERVER=${v.pcIp}`, send: true },
            { label: "Archivo", value: `TFTP_FILE=${file}`, send: true },
          ] },
        { text: "tftpdnld borra la flash antes de copiar la imagen y pide confirmación.", warn: true, values: [{ label: "Descargar", value: "tftpdnld", send: true }] },
        { text: "Al terminar, arranca con la imagen nueva.", values: [{ label: "Reiniciar", value: "reset", send: true }] },
      ],
    };
  return null;
}

const ipNum = (ip: string): number | null => {
  const m = ip.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const p = m.slice(1).map(Number);
  return p.some((x) => x > 255) ? null : ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0;
};
const numIp = (n: number) => [24, 16, 8, 0].map((s) => (n >>> s) & 255).join(".");

/** Ambas IP en la misma red con esa máscara (IPv4). */
export function sameSubnet(a: string, b: string, mask: string): boolean {
  const [x, y, m] = [ipNum(a), ipNum(b), ipNum(mask)];
  return x !== null && y !== null && m !== null && ((x & m) >>> 0) === ((y & m) >>> 0);
}

/** IP sugerida para el equipo: la siguiente a la del PC en su red /24 (o la anterior si es .254). */
export function suggestDeviceIp(pcIp: string): string {
  const n = ipNum(pcIp);
  if (n === null) return "192.168.1.99";
  const last = n & 255;
  return numIp(last >= 254 ? n - 1 : n + 1);
}

/** IP autoasignada (169.254.x.x): la tarjeta no tiene IP fija ni DHCP; el equipo en arranque no la alcanzará. */
export const isLinkLocal = (ip: string) => /^169\.254\./.test(ip.trim());

export type Os = "mac" | "windows" | "linux";
export function detectOs(ua: string): Os {
  return /Mac|iPhone|iPad/.test(ua) ? "mac" : /Windows/.test(ua) ? "windows" : "linux";
}

/**
 * Lo que cambia según el sistema para que un equipo llegue al TFTP de este PC. El servidor es el
 * mismo en los tres (Rust, UDP); cambian los permisos del puerto 69 y el firewall.
 * - Linux: los puertos bajo 1024 requieren privilegios salvo que se baje
 *   net.ipv4.ip_unprivileged_port_start (kernel 4.11+, documentación de ip-sysctl del kernel:
 *   https://www.kernel.org/doc/html/latest/networking/ip-sysctl.html). El cambio dura hasta reiniciar.
 * - Windows: una red por cable directo sin DHCP suele quedar como "Red no identificada" con perfil
 *   Público; si el firewall solo permitió la app en redes privadas, el TFTP no recibe nada.
 *   Set-NetConnectionProfile: https://learn.microsoft.com/powershell/module/netconnection/set-netconnectionprofile
 */
export function osTips(os: Os): { text: string; command?: string }[] {
  if (os === "linux")
    return [
      { text: "Linux reserva el puerto 69 para root. Para permitirlo hasta el próximo reinicio:", command: "sudo sysctl -w net.ipv4.ip_unprivileged_port_start=69" },
      { text: "Si usas firewalld o ufw, abre UDP 69 en la interfaz conectada al equipo." },
    ];
  if (os === "windows")
    return [
      { text: "Cuando el firewall de Windows pregunte, permite NetTerminal. Un cable directo sin DHCP suele quedar como red Pública: cámbiala a Privada (PowerShell como administrador, con el nombre de tu tarjeta):", command: 'Set-NetConnectionProfile -InterfaceAlias "Ethernet" -NetworkCategory Private' },
    ];
  return [{ text: "Si macOS pregunta si NetTerminal puede aceptar conexiones entrantes, permítelo (Ajustes del Sistema › Red › Firewall)." }];
}

/** La IPv4 está en alguna de las entradas (IP o CIDR) de "Clientes permitidos"; lista vacía: todas. */
export function ipAllowed(ip: string, entries: string[]): boolean {
  if (!entries.length) return true;
  const n = ipNum(ip);
  if (n === null) return false;
  return entries.some((e) => {
    const [base, bits] = e.split("/");
    const b = ipNum(base);
    if (b === null) return false;
    const len = bits === undefined ? 32 : Number(bits);
    if (!Number.isInteger(len) || len < 0 || len > 32) return false;
    const m = len === 0 ? 0 : (0xffffffff << (32 - len)) >>> 0;
    return ((n & m) >>> 0) === ((b & m) >>> 0);
  });
}
