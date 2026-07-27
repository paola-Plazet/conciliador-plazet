// Simula la corrida de junio 2026: transacciones Alegra + extracto Alianza
// (extraído de la hoja "ALIANZA EFECTIVO" de conciliacion.xlsx, como si fuera
// el export real del banco) + CSV 191 del 1-jul (pagos QR de junio).
import fs from "node:fs";
import * as XLSX from "xlsx";
import { detectFileType } from "../src/lib/parsers/detect";
import { processFiles } from "../src/lib/process";
import { formatCOP } from "../src/lib/money";

// 1) Extraer hoja ALIANZA EFECTIVO como libro independiente
const src = XLSX.readFile("C:/Users/Paola Agreda/OneDrive/Escritorio/conciliacion.xlsx");
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, src.Sheets["ALIANZA EFECTIVO"], "Movimientos");
const bancoBuf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

const transBuf = fs.readFileSync("C:/Users/Paola Agreda/Downloads/Alegra - Reporte de transacciones - HABBIE SAS -.xlsx");
const qrBuf = fs.readFileSync("C:/Users/Paola Agreda/Downloads/CSV_19100003911_000000901987494_20260701_12020296.csv");

console.log("deteccion alianza:", detectFileType("alianza.xlsx", bancoBuf).kind);
console.log("deteccion csv191 :", detectFileType("csv191.csv", qrBuf).kind);

async function main() {
  const out = await processFiles({ alegraTrans: transBuf, banco: bancoBuf, datafonoBanco: qrBuf });
  console.log("\nPeriodo ventas:", out.periodStart, "->", out.periodEnd);
  console.log("Movs banco:", out.bank.length, "| QR banco:", out.qrBank.length);
  console.log("Referencias detectadas en banco:");
  for (const r of out.references) console.log(`   ${r.reference.padEnd(14)} ${String(r.count).padStart(3)}x ${formatCOP(r.total).padStart(15)}  -> ${r.storeCode ?? "SIN ASIGNAR"}`);
  console.log("\nTotales:", out.summary.totals);
  for (const ch of ["EFECTIVO", "QR"] as const) {
    const rs = out.summary.results.filter((r) => r.channel === ch);
    const jun = rs.filter((r) => r.depositDate >= "2026-06-01");
    const ok = jun.filter((r) => r.status === "CUADRA").length;
    const dif = jun.filter((r) => r.status === "DIFERENCIA").length;
    const sin = jun.filter((r) => r.status === "SIN_CONCILIAR").length;
    console.log(`  ${ch} (junio): ${jun.length} | cuadran ${ok} | dif ${dif} | sin conciliar ${sin}`);
  }
  console.log("\nEFECTIVO junio por tienda:");
  const byStore = new Map<string, { ok: number; tot: number; late: number }>();
  for (const r of out.summary.results.filter((r) => r.channel === "EFECTIVO" && r.depositDate >= "2026-06-01")) {
    const s = byStore.get(r.storeName) ?? { ok: 0, tot: 0, late: 0 };
    s.tot++;
    if (r.status === "CUADRA") s.ok++;
    if (r.late) s.late++;
    byStore.set(r.storeName, s);
  }
  for (const [name, s] of byStore) console.log(`   ${name.padEnd(24)} ${s.ok}/${s.tot} cuadran, ${s.late} tardías`);
  console.log("\nAlertas de efectivo consignado por QR:");
  for (const r of out.summary.results.filter((r) => r.qrAlert)) {
    console.log(`   ${r.storeName} | dep ${r.depositDate} ${formatCOP(r.depositAmount)} | falta ${formatCOP(-r.difference)}`);
    console.log(`     ${r.note}`);
  }
  if (out.warnings.length) console.log("\nAvisos:", out.warnings);
}
main().then(() => process.exit(0));
