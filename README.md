<p align="center">
  <img src="docs/logo.svg" alt="Logo de NetTerminal" width="96">
</p>

<h1 align="center">NetTerminal</h1>

<p align="center">
  <a href="https://github.com/Parzval-Net/Net_Terminal/releases/latest"><b>Descargar la última versión</b></a> ·
  <a href="https://parzval-net.github.io/Net_Terminal/">Página del producto</a> ·
  <a href="https://parzval-net.github.io/Net_Terminal/#como-usar">Tutoriales en video</a>
</p>

NetTerminal es un cliente de conexión liviano para el trabajo diario con equipos de red y servidores. Reúne **SSH, Telnet, Serial y terminal local** en una sola app, con sesiones guardadas en carpetas y pestañas, un catálogo de comandos verificados por fabricante y las herramientas de red que se usan en terreno y en la oficina. Está pensada para ingenieros y técnicos de redes que necesitan conectarse rápido y ejecutar comandos con seguridad. Funciona en macOS, Windows y Linux, pesa unos 8 MB y no consume CPU cuando no la estás usando.

## Herramientas

- **Sesiones y conexión rápida:** equipos en carpetas, importación desde PuTTY, SecureCRT, MobaXterm, ssh_config o CSV, exportación a XML y conexión al vuelo sin guardar.
- **Catálogo de comandos verificados** con fuente oficial, con la sintaxis de la plataforma detectada y el nivel de riesgo de cada comando.
- **Sugerencias de comandos** mientras escribes, también con abreviaturas, sin interferir con el autocompletado del equipo.
- **Topología** de vecinos CDP/LLDP con estado de puertos, revisiones de enlaces (dúplex, VLAN nativa, Port-channel, CRC), tráfico por enlace con lo que requiere atención resaltado, saltos encadenados entre vecinos, comparación antes y después de un cambio y exportación a draw.io.
- **CLI Lab:** scripts de varios comandos ejecutados en una o varias sesiones, línea a línea, con la respuesta de cada equipo.
- **Notas, plantillas y envío a varias sesiones** con variables y confirmación según el riesgo.
- **Transferencias** por TFTP, HTTP, FTP y SFTP con verificación MD5, y **respaldos** con comparación de configuraciones.
- **SNMP** v1, v2c y v3 de solo lectura, receptor de traps y generador de configuración.
- **Monitoreo** con alarma, ping, traceroute, puertos, calculadora de subredes, speedtest e iperf3.
- **Ciclo de vida del equipo** (opcional): modelo, versión y etapa de fin de venta y de soporte.
- **Automatización** con scripts Python y plugins, de solo lectura por defecto.
- **Contraseñas en una bóveda cifrada** que nunca las muestra.
- **Interfaz** con modo claro y oscuro, 17 temas de terminal, pestañas horizontales o verticales, vista dividida de hasta 4 equipos y modo foco.

## Alcances

| Ámbito | Cobertura |
| --- | --- |
| Sistemas | Windows 10/11, macOS (Intel y Apple Silicon) y Linux (AppImage y `.deb`), más una versión portable para los tres |
| Protocolos | SSH (incluido jump host y algoritmos legacy opcionales), Telnet, Serial, TCP crudo y terminal local |
| Fabricantes de red | Cisco (IOS, IOS-XE, NX-OS, IOS-XR, ASA), Juniper (Junos, Evolved), Fortinet (FortiOS 6.2 a 7.6, FortiSwitch, FortiAP, FortiExtender), Huawei (VRP5, VRP8, YunShan), Aruba (AOS-CX, ArubaOS-Switch, ArubaOS 8, AOS 10, Instant), Check Point, WatchGuard y Grandstream |
| Sistemas operativos (consultas de red) | Windows (PowerShell), macOS y Linux (Debian, Ubuntu, RHEL/Rocky/Alma, Fedora, SUSE, Arch, Alpine) |
| Importación | PuTTY, SecureCRT, MobaXterm, ssh_config y CSV (sin contraseñas) |
| Seguridad | Control de riesgo por comando, bóveda cifrada, actualizaciones firmadas y funciones sensibles apagadas por defecto |

## Así se ve

| | |
| --- | --- |
| **Sesiones en carpetas y catálogo de comandos**<br>![Terminal con sesiones y catálogo de comandos](docs/screenshots/terminal.png) | **Sugerencias mientras escribes**<br>![Sugerencias de comandos](docs/screenshots/sugerencias-comandos.png) |
| **Topología con ruta resaltada**<br>![Topología CDP/LLDP](docs/screenshots/topologia.png) | **Vista dividida para varios equipos**<br>![Vista dividida 2x2](docs/screenshots/vista-dividida.png) |
| **Notas y plantillas con variables**<br>![Notas y plantillas](docs/screenshots/notas.png) | **Modo oscuro**<br>![Modo oscuro](docs/screenshots/modo-oscuro.png) |

Las capturas usan datos ficticios. Instaladores en la [última versión publicada](https://github.com/Parzval-Net/Net_Terminal/releases/latest); detalle técnico en [docs/TECNICO.md](docs/TECNICO.md) y política de seguridad en [SECURITY.md](SECURITY.md).

## Licencia

NetTerminal se distribuye bajo la [PolyForm Noncommercial License 1.0.0](LICENSE).

- **Permitido:** uso personal (estudio, aficiones, investigación privada) y uso en organizaciones sin fines de lucro, como instituciones educativas, de investigación pública o entidades de gobierno.
- **Requiere autorización previa del autor:** cualquier uso comercial, incluido el uso dentro de una empresa (aunque sea interno o gratuito), su venta, redistribución o inclusión en productos o servicios.

Para solicitar autorización, abre un [issue](https://github.com/Parzval-Net/Net_Terminal/issues) indicando la organización y el uso previsto. Las bibliotecas de terceros incluidas mantienen sus propias licencias: el detalle está en [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Creado por Nicolás Rivera · Desarrollado en conjunto con Claude.
