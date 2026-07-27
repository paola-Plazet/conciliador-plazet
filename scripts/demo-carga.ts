// DEMO: carga a la app (libro acumulado) todos los archivos reales, tal como
// si se subieran por /cargar, y muestra el estado de la conciliación.
import fs from "node:fs";
import * as XLSX from "xlsx";
import { detectFileType } from "../src/lib/parsers/detect";
import { ingestFiles, computeLedger } from "../src/lib/ledger";

const MC = "C:/Users/Paola Agreda/OneDrive/Escritorio/PROYECTOS PAO/muestras-conciliacion";
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");

// La hoja ALIANZA EFECTIVO (abr-jun) como si fuera el export del banco
const src = XLSX.readFile("C:/Users/Paola Agreda/OneDrive/Escritorio/conciliacion.xlsx");
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, src.Sheets["ALIANZA EFECTIVO"], "Movimientos");
const bancoAbrJun = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

const files = [
  { filename: "allsales Karrot 8-16 jul.xlsx", buffer: fs.readFileSync(`${MC}/allsales-a2b47fd9-3c80-4506-8700-49c3de1b8966-20260716T234911269Z.xlsx`) },
  { filename: "banco efectivo abr-jun.xlsx", buffer: bancoAbrJun },
  { filename: "movimientos_10030039979 (42).xls", buffer: fs.readFileSync(`${MC}/movimientos_10030039979 (42).xls`) },
  { filename: "Plink junio.xlsx", buffer: fs.readFileSync(`${MC}/901987494_Reporte_Conciliar_20260601_20260630 (1).xlsx`) },
  { filename: "Plink julio 1-16.xlsx", buffer: fs.readFileSync(`${MC}/901987494_Reporte_Conciliar_20260701_20260716.xlsx`) },
  { filename: "CSV 191 (QR) 13-jul.csv", buffer: fs.readFileSync("C:/Users/PAOLAA~1/AppData/Local/Temp/claude/C--Users-Paola-Agreda/7720aa15-7adf-4037-a9b8-80a2e1315e28/scratchpad/csv191/CSV_19100003911_000000901987494_20260713_16341016/CSV_19100003911_000000901987494_20260713_16341016.csv") },
  { filename: "CSV 191 (QR) 16-jul.csv", buffer: fs.readFileSync("C:/Users/PAOLAA~1/AppData/Local/Temp/claude/C--Users-Paola-Agreda/7720aa15-7adf-4037-a9b8-80a2e1315e28/scratchpad/csv191/CSV_20260716/CSV_19100003911_000000901987494_20260716_22463619.csv") },
];

async function main() {
  for (const f of files) console.log(`${f.filename.padEnd(42)} → ${detectFileType(f.filename, f.buffer).kind}`);
  console.log("\nIngresando...");
  const out = await ingestFiles(files);
  for (const f of out.files)
    console.log(`   ${f.filename.padEnd(42)} ${String(f.inserted).padStart(5)} filas  ${f.from ?? "-"} → ${f.to ?? "-"}`);
  for (const w of out.warnings) console.log(`   ⚠ ${w}`);

  const st = await computeLedger();
  console.log("\nCortes:", JSON.stringify(st.cut));
  console.log("Meses:");
  for (const m of st.months)
    console.log(
      `   ${m.month}  cuadran ${m.totals.cuadran} | dif ${m.totals.diferencias} | sin conciliar ${m.totals.sinConciliar} | tardías ${m.totals.tardias} ${m.clean ? "✔ limpio" : ""}${m.closed ? " (CERRADO)" : ""}`,
    );
  process.exit(0);
}
main();
