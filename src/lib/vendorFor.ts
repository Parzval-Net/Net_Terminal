/**
 * Fabricante sugerido según el resaltado de la sesión. Vive aparte de commands.ts (el catálogo, unos
 * 36 KB) para que App lo use sin cargar el catálogo en el paquete principal; commands.ts lo reexporta.
 */
export function vendorFor(highlight?: string): string {
  if (highlight === "huawei" || highlight === "fortinet" || highlight === "juniper") return highlight;
  return "cisco";
}
