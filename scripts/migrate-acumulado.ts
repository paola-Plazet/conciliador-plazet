// Migra los datos de junio 2026 al libro acumulado (ingesta normal).
import fs from "node:fs";
import * as XLSX from "xlsx";
import { prisma } from "../src/lib/db";
import { ingestFiles, computeLedger } from "../src/lib/ledger";
import { formatCOP } from "../src/lib/money";

const src = XLSX.readFile("C:/Users/Paola Agreda/OneDrive/Escritorio/conciliacion.xlsx");
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, src.Sheets["ALIANZA EFECTIVO"], "Movimientos");
const bancoBuf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

async function main() {
  const out = await ingestFiles([
    {
      filename: "Alegra - Reporte de transacciones - HABBIE SAS -.xlsx",
      buffer: fs.readFileSync("C:/Users/Paola Agreda/Downloads/Alegra - Reporte de transacciones - HABBIE SAS -.xlsx"),
    },
    { filename: "alianza-efectivo.xlsx", buffer: bancoBuf },
    {
      filename: "CSV_19100003911_20260701.csv",
      buffer: fs.readFileSync("C:/Users/Paola Agreda/Downloads/CSV_19100003911_000000901987494_20260701_12020296.csv"),
    },
  ]);
  for (const f of out.files) {
    console.log(`${f.filename} -> ${f.kind} | ${f.inserted} filas | ${f.from} a ${f.to}`);
  }
  if (out.warnings.length) console.log("Avisos:", out.warnings);

  const status = await computeLedger();
  console.log("\nCorte:", status.cut);
  console.log("Meses:");
  for (const m of status.months) {
    console.log(
      `  ${m.month} ${m.closed ? "[CERRADO]" : ""} cuadran=${m.totals.cuadran} dif=${m.totals.diferencias} sin=${m.totals.sinConciliar} ${m.clean ? "· AL DÍA" : ""}`,
    );
  }
  console.log("\nPendientes por consignar:");
  for (const p of status.summary.pendings) {
    console.log(`  ${p.storeName}: ${p.days.length} día(s), ${formatCOP(p.total)} (${p.days.map((d) => d.date).join(", ")})`);
  }
}
main().finally(() => prisma.$disconnect());
