// Respaldo de configuración (src/lib/backup.ts): perfiles, limpieza de salida, validación y pool.
// Salidas de ejemplo con IPs de documentación (RFC 5737) y nombres ficticios.
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, next) {
    if (/^\.\.?\//.test(specifier) && !/\.[cm]?[jt]s$/.test(specifier) && context.parentURL?.endsWith(".ts")) {
      for (const cand of [`${specifier}.ts`, `${specifier}/index.ts`]) {
        try {
          return next(cand, context);
        } catch {
          /* sigue con el siguiente candidato */
        }
      }
    }
    return next(specifier, context);
  },
});

const B = await import("../../src/lib/backup.ts");
const { computeRisk } = await import("../../src/lib/packs.ts");

// ---------- Perfiles ----------
assert.equal(new Set(B.BACKUP_PROFILES.map((p) => p.id)).size, B.BACKUP_PROFILES.length, "ids únicos");
for (const p of B.BACKUP_PROFILES) {
  assert.equal(computeRisk(p.cmd), "read", `el comando de respaldo de ${p.id} debe ser de consulta`);
  assert.ok(B.isReadOnly(p.cmd), p.id);
}
assert.equal(B.profileById("juniper").cmd, "show configuration | display set");
assert.equal(B.profileById("no-existe").id, "cisco", "desconocido: el primero");
const sess = (o) => ({ id: "s", name: "r1", type: "ssh", ...o });
assert.equal(B.guessBackupProfile(sess({})), "cisco");
assert.equal(B.guessBackupProfile(sess({ platform: "r81.20" })), "checkpoint");
assert.equal(B.guessBackupProfile(sess({ platform: "fos7" })), "fortinet");
assert.equal(B.guessBackupProfile(sess({ platform: "junos" })), "juniper");
assert.equal(B.guessBackupProfile(sess({ platform: "vrp5" })), "huawei");
assert.equal(B.guessBackupProfile(sess({ platform: "yunshan" })), "huawei");
assert.equal(B.guessBackupProfile(sess({ highlight: "huawei" })), "huawei");
assert.equal(B.guessBackupProfile(sess({ highlight: "juniper" })), "juniper");
assert.equal(B.guessBackupProfile(sess({ highlight: "fortinet" })), "fortinet");
assert.equal(B.guessBackupProfile(sess({ highlight: "otro" })), "cisco");
assert.equal(B.guessBackupProfile(sess({ platform: "junos", highlight: "huawei" })), "juniper", "la plataforma detectada manda");

// ---------- isReadOnly ----------
for (const c of ["show running-config", "  display current-configuration  ", "show version | include uptime"]) assert.ok(B.isReadOnly(c), c);
for (const c of ["", "   ", "reload", "write erase", "show run\nreload", "show run\rreload", "configure terminal", "show run; reload", "show run | tee /tmp/x", "show $(reload)"])
  assert.ok(!B.isReadOnly(c), JSON.stringify(c));

// ---------- cleanConfig ----------
const ios = "show running-config\r\nBuilding configuration...\r\n\r\nCurrent configuration : 1234 bytes\r\n!\r\nhostname R1\r\ninterface Gi0/1\r\n ip address 192.0.2.1 255.255.255.0\r\n!\r\nend\r\n\r\nR1#";
assert.equal(B.cleanConfig(ios, "show running-config"), "!\nhostname R1\ninterface Gi0/1\n ip address 192.0.2.1 255.255.255.0\n!\nend\n");
// Lo anterior al eco se descarta (prompt, banner).
assert.equal(B.cleanConfig("R1#show run\r\nhostname R1\r\nend\r\nR1#", "show run"), "hostname R1\nend\n");
// Sin eco del comando: queda todo, salvo el prompt final.
assert.equal(B.cleanConfig("hostname R1\r\nend\r\nR1#", "show run"), "hostname R1\nend\n");
// Paginación de Cisco con retrocesos: " --More-- " + backspaces + espacios.
const more = "show run\r\nhostname R1\r\n --More-- \b\b\b\b\b\b\b\b\b\b          \b\b\b\b\b\b\b\b\b\binterface Gi0/1\r\nend\r\nR1#";
assert.equal(B.cleanConfig(more, "show run"), "hostname R1\ninterface Gi0/1\nend\n");
// Huawei: "---- More ----" + retroceso del cursor + borrado.
const hw = "display current-configuration\r\n#\r\nsysname R2\r\n---- More ----\x1b[42D                                          \x1b[42D#\r\nreturn\r\n<R2>";
assert.equal(B.cleanConfig(hw, "display current-configuration"), "#\nsysname R2\n#\nreturn\n");
// Colores ANSI fuera.
assert.equal(B.cleanConfig("show run\r\n\x1b[1;32mhostname R1\x1b[0m\r\nend\r\nR1#", "show run"), "hostname R1\nend\n");
// Junos "(more 50%)".
assert.equal(B.cleanConfig("show configuration\nset system host-name r3\n---(more 50%)---" + "\b".repeat(16) + "set system services ssh\nuser@r3> ", "show configuration"), "set system host-name r3\nset system services ssh\n");
// FortiOS: prompt "FGT # ".
assert.equal(B.cleanConfig("show\r\nconfig system global\r\n    set hostname \"FGT\"\r\nend\r\nFGT # ", "show"), "config system global\n    set hostname \"FGT\"\nend\n");
// Espacios al final de línea se recortan; las líneas internas vacías se conservan.
assert.equal(B.cleanConfig("show run\r\na   \r\n\r\nb\r\nR1#", "show run"), "a\n\nb\n");
// Salida vacía o solo prompt.
assert.equal(B.cleanConfig("", "show run"), "");
assert.equal(B.cleanConfig("show run\r\nR1#", "show run"), "");
// La cabecera variable solo se quita al inicio (hasta 4 líneas).
assert.equal(B.cleanConfig("show run\nBuilding configuration...\nhostname R1\nBuilding configuration...\nend\nR1#", "show run"), "hostname R1\nBuilding configuration...\nend\n");
// Idempotente.
const once = B.cleanConfig(ios, "show running-config");
assert.equal(B.cleanConfig(once, "zzz"), once.replace(/\n?$/, "\n"));

// ---------- configProblem ----------
assert.equal(B.configProblem(""), "El equipo no devolvió configuración");
assert.equal(B.configProblem("  \n "), "El equipo no devolvió configuración");
assert.ok(B.configProblem("% Invalid input detected at '^' marker.\nx\ny\nz")?.includes("Invalid input"));
assert.equal(B.configProblem("hostname R1\n"), "Salida demasiado corta para ser una configuración");
// Cuenta el "\n" final como una línea más: dos líneas reales ya pasan (el límite efectivo es 2, no 3).
assert.equal(B.configProblem("hostname R1\nend\n"), null);
assert.equal(B.configProblem("hostname R1\ninterface Gi0/1\nend\n"), null);

// ---------- pool ----------
{
  const done = [];
  let live = 0;
  let peak = 0;
  const tick = () => new Promise((r) => setImmediate(r));
  await B.pool([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
    live++;
    peak = Math.max(peak, live);
    await tick();
    await tick();
    done.push(n);
    live--;
  }, () => false);
  assert.deepEqual(done.slice().sort(), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(peak, 3, "concurrencia máxima respetada");
  // Detener: no inicia nuevas tareas.
  const ran = [];
  let stop = false;
  await B.pool([1, 2, 3, 4, 5, 6], 1, async (n) => {
    ran.push(n);
    if (n === 2) stop = true;
  }, () => stop);
  assert.deepEqual(ran, [1, 2]);
  // Lista vacía y límite mayor que la cantidad.
  await B.pool([], 4, async () => assert.fail("no debe ejecutar"), () => false);
  let count = 0;
  await B.pool([1, 2], 10, async () => void count++, () => false);
  assert.equal(count, 2);
}

// ---------- backupLabel ----------
assert.equal(B.backupLabel("2026-10-21_143005.txt"), "21-10-2026 14:30:05");
assert.equal(B.backupLabel("2026-10-21_143005-2.txt"), "21-10-2026 14:30:05-2");
assert.equal(B.backupLabel("notas.txt"), "notas.txt");
assert.equal(B.backupLabel("2026-10-21_143005.txt.bak"), "2026-10-21_143005.txt.bak");
assert.equal(B.backupLabel(""), "");

console.log("backup: ok");
