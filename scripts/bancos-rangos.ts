// Solo lectura: hojas y rango de fechas del consolidado "movimientos bancos.xlsx"
import * as XLSX from "xlsx";
import { readFileSync } from "fs";
const wb = XLSX.read(readFileSync("C:/Users/Paola Agreda/OneDrive/Escritorio/HABBIE/PLAZET/MOVIMIENTOS BANCOS/movimientos bancos.xlsx"), { type: "buffer", cellDates: true });
for (const name of wb.SheetNames) {
  const rows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: null });
  const dates: string[] = [];
  for (const r of rows) for (const c of r) { const s = String(c ?? ""); const m = s.match(/^(\d{4}-\d{2}-\d{2})|^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) { dates.push(s.slice(0, 10)); break; } }
  console.log(name.padEnd(20), rows.length, "filas", dates.length ? `fechas ~${dates[0]} … ${dates[dates.length - 1]}` : "(sin fechas detectadas)");
}
