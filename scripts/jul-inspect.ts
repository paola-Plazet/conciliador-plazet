// Inspección de los archivos nuevos de julio: movimientos del encargo (.xls),
// allsales (¿Karrot?), Plink 0701-0716 y CSV QR fresco.
import fs from "node:fs";
import * as XLSX from "xlsx";
import { parseDatafono } from "../src/lib/parsers/datafono";
import { parseDatafonoBanco } from "../src/lib/parsers/datafono-banco";
import { detectFileType } from "../src/lib/parsers/detect";

const MC = "C:/Users/Paola Agreda/OneDrive/Escritorio/PROYECTOS PAO/muestras-conciliacion";
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
const toDate = (v: any): string =>
  typeof v === "number"
    ? new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10)
    : String(v ?? "").trim();

// 1) movimientos encargo (42)
{
  const buf = fs.readFileSync(`${MC}/movimientos_10030039979 (42).xls`);
  console.log("movimientos (42) — detección:", detectFileType("movimientos_10030039979 (42).xls", buf).kind);
  const wb = XLSX.read(buf);
  for (const name of wb.SheetNames) {
    const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1 });
    console.log(`  hoja "${name}" ${rows.length} filas; primeras 5:`);
    for (const r of rows.slice(0, 5)) console.log("   ", JSON.stringify(r).slice(0, 160));
    // rango de fechas: buscar números serial o strings fecha en col 0-2
    const fechas: string[] = [];
    for (const r of rows) for (const c of (r ?? []).slice(0, 3)) {
      const d = toDate(c);
      if (/^2026-\d{2}-\d{2}$/.test(d)) fechas.push(d);
    }
    fechas.sort();
    if (fechas.length) console.log(`    fechas ${fechas[0]} → ${fechas[fechas.length - 1]} (${fechas.length})`);
  }
}

// 2) allsales
{
  const buf = fs.readFileSync(`${MC}/allsales-a2b47fd9-3c80-4506-8700-49c3de1b8966-20260716T234911269Z.xlsx`);
  const wb = XLSX.read(buf);
  console.log("\nallsales — hojas:", wb.SheetNames.join(", "));
  const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
  console.log(`  ${rows.length} filas; encabezado:`, JSON.stringify(rows[0]).slice(0, 400));
  console.log("  fila 1:", JSON.stringify(rows[1]).slice(0, 400));
}

// 3) Plink julio 0701-0716
{
  const out = parseDatafono(fs.readFileSync(`${MC}/901987494_Reporte_Conciliar_20260701_20260716.xlsx`));
  const dates = out.entries.map((e) => e.txDate).sort();
  console.log(`\nPlink jul: ${out.entries.length} trans, tx ${dates[0]} → ${dates[dates.length - 1]}, bruto ${fmt(out.totalGross)}`);
  if (out.warnings.length) console.log("  avisos:", out.warnings.join(" | "));
}

// 4) CSV QR nuevo
{
  const out = parseDatafonoBanco(
    fs.readFileSync(
      "C:/Users/PAOLAA~1/AppData/Local/Temp/claude/C--Users-Paola-Agreda/7720aa15-7adf-4037-a9b8-80a2e1315e28/scratchpad/csv191/CSV_20260716/CSV_19100003911_000000901987494_20260716_22463619.csv",
    ),
  );
  const dates = out.qr.map((q) => q.date).sort();
  console.log(`\nCSV QR 16-jul: ${out.qr.length} pagos QR ${dates[0] ?? "-"} → ${dates[dates.length - 1] ?? "-"}, total ${fmt(out.totalQr)}`);
}
