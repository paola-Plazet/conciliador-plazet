import * as XLSX from "xlsx";
import fs from "node:fs";

const DIR = "C:/Users/Paola Agreda/OneDrive/Escritorio/PROYECTOS PAO/muestras-conciliacion";

function peek(path: string, maxRows = 8) {
  console.log(`\n════ ${path.replace(DIR + "/", "")} ════`);
  const wb = XLSX.readFile(path);
  for (const name of wb.SheetNames) {
    const rows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true });
    console.log(`  Hoja "${name}": ${rows.length} filas`);
    for (let i = 0; i < Math.min(rows.length, maxRows); i++) {
      const r = (rows[i] ?? []).slice(0, 12).map(c => c == null ? "" : String(c).slice(0, 22));
      console.log(`    [${i}] ${r.join(" | ")}`);
    }
  }
}

peek(`${DIR}/sistemas anteriores/ventaSabmyju.xlsx`);
peek(`${DIR}/sistemas anteriores/consignaciones linux.xlsx`, 12);
peek(`${DIR}/reporte_ventas_2026-07-01_2026-07-13.xlsx`, 10);
