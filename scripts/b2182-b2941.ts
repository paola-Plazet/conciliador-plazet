import * as XLSX from "xlsx";
import { prisma } from "../src/lib/db";
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
async function main() {
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(XLSX.readFile("C:/Users/Paola Agreda/Downloads/Alegra - Reporte de transacciones - HABBIE SAS -.xlsx").Sheets["Worksheet"], { raw: false, defval: "" });
  for (const fac of ["B2182", "B2941", "B2182 ", "B21018"]) {
    const rs = rows.filter((r) => new RegExp(`Facturas:\s*${fac.trim()}(\b|$)`).test(String(r["Asociaciones"])));
    console.log(`\nAlegra trans con factura ${fac.trim()}:`);
    for (const r of rs) console.log(`   ${r["Fecha"]} #${r["Número"]} ${String(r["Cuenta"]).padEnd(40)} ${String(r["Valor"]).padStart(8)} ${String(r["Método de pago"]).padEnd(14)} ${r["Tipo"]} ${r["Estado"]} ${r["Cliente"]} | ${r["Observaciones"]} ${r["Notas"]}`);
  }
  const db = await prisma.sale.findMany({ where: { invoice: { in: ["B2182", "B2941"] } }, orderBy: { date: "asc" } });
  console.log("\nBD:", db.map((s) => `${s.date} ${s.storeCode} ${s.invoice} ${s.method} ${fmt(s.amount)} [${s.source}]`).join(" | "));
  await prisma.$disconnect();
}
main();
