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
  console.log("Periodo ventas:", out.periodStart, "->", out.periodEnd);
  console.log("Total bank entries:", out.bank.length);
  console.log("Referencias:", out.references.map(r => `${r.reference}(${r.storeCode ?? "SIN"})`).join(", "));
  const byStore = new Map<string, number>();
  for (const s of out.sales) {
    if (s.method !== "EFECTIVO") continue;
    byStore.set(s.storeCode ?? "null", (byStore.get(s.storeCode ?? "null") ?? 0) + 1);
  }
  console.log("Ventas efectivo por tienda (conteo filas):", [...byStore.entries()]);
  console.log("\nRef 3209052268 depositos:");
  for (const b of out.bank.filter(b => b.reference === "3209052268")) console.log("  ", b.date, formatCOP(b.amount));
  console.log("\nUnicentro (B3) ventas efectivo (primeras 10):");
  for (const s of out.sales.filter(s => s.method === "EFECTIVO" && s.storeCode === "B3").slice(0, 10)) console.log("  ", s.date, formatCOP(s.amount));
}
main().then(() => process.exit(0));
