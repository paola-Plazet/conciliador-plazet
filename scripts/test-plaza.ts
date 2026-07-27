// Diagnóstico: detalle EFECTIVO de Plaza de las Américas (B1) en junio
import fs from "node:fs";
import * as XLSX from "xlsx";
import { processFiles } from "../src/lib/process";
import { formatCOP } from "../src/lib/money";

const src = XLSX.readFile("C:/Users/Paola Agreda/OneDrive/Escritorio/conciliacion.xlsx");
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, src.Sheets["ALIANZA EFECTIVO"], "Movimientos");
const bancoBuf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
const transBuf = fs.readFileSync("C:/Users/Paola Agreda/Downloads/Alegra - Reporte de transacciones - HABBIE SAS -.xlsx");

async function main() {
  const out = await processFiles({ alegraTrans: transBuf, banco: bancoBuf });
  console.log("Depósitos B1 por día (con referencia):");
  for (const b of out.bank.filter((b) => b.storeCode === "B1" && b.kind === "RECAUDO_EFECTIVO" && b.date >= "2026-05-28"))
    console.log(`  ${b.date}  ${formatCOP(b.amount).padStart(13)}  ref=${b.reference}`);
  console.log("\nVentas efectivo B1 por día:");
  const byDay = new Map<string, number>();
  for (const s of out.sales.filter((s) => s.storeCode === "B1" && s.method === "EFECTIVO"))
    byDay.set(s.date, (byDay.get(s.date) ?? 0) + s.amount);
  for (const [d, v] of [...byDay.entries()].sort()) console.log(`  ${d}  ${formatCOP(v).padStart(13)}`);
  console.log("\nResultados EFECTIVO B1 junio:");
  for (const r of out.summary.results.filter((r) => r.channel === "EFECTIVO" && r.storeCode === "B1" && r.depositDate >= "2026-06-01"))
    console.log(`  dep ${r.depositDate} ${formatCOP(r.depositAmount).padStart(13)} | ventas [${r.salesDates.join(",")}] ${formatCOP(r.salesAmount).padStart(13)} | dif ${formatCOP(r.difference).padStart(11)} | ${r.status}`);
}
main().then(() => process.exit(0));
