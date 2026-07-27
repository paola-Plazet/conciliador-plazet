// Crea una corrida real de junio 2026 en la BD (igual que /api/process):
// transacciones Alegra + extracto Alianza (hoja de conciliacion.xlsx) + CSV 191.
import fs from "node:fs";
import * as XLSX from "xlsx";
import { prisma } from "../src/lib/db";
import { processFiles } from "../src/lib/process";

const src = XLSX.readFile("C:/Users/Paola Agreda/OneDrive/Escritorio/conciliacion.xlsx");
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, src.Sheets["ALIANZA EFECTIVO"], "Movimientos");
const bancoBuf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
const transBuf = fs.readFileSync("C:/Users/Paola Agreda/Downloads/Alegra - Reporte de transacciones - HABBIE SAS -.xlsx");
const qrBuf = fs.readFileSync("C:/Users/Paola Agreda/Downloads/CSV_19100003911_000000901987494_20260701_12020296.csv");

async function main() {
  const out = await processFiles({ alegraTrans: transBuf, banco: bancoBuf, datafonoBanco: qrBuf });
  const run = await prisma.run.create({
    data: {
      label: "Junio 2026 (transacciones + Alianza + QR)",
      periodStart: out.periodStart ?? null,
      periodEnd: out.periodEnd ?? null,
      salesJson: JSON.stringify(out.sales),
      bankJson: JSON.stringify(out.bank),
      dataphoneJson: JSON.stringify(out.datafono),
      qrBankJson: JSON.stringify(out.qrBank),
      resultsJson: JSON.stringify(out.summary),
      adjustmentsJson: "[]",
    },
  });
  console.log(`Corrida #${run.id} creada: ${out.periodStart} -> ${out.periodEnd}`);
  console.log("Totales:", out.summary.totals);
}
main().finally(() => prisma.$disconnect());
