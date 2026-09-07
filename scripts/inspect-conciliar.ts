import * as XLSX from "xlsx";
import fs from "node:fs";
const dir = "C:/Users/Paola Agreda/Downloads";
const f = fs.readdirSync(dir).filter((n) => /Reporte_Conciliar.*\.xlsx$/i.test(n)).map((n) => ({ n, t: fs.statSync(dir + "/" + n).mtimeMs })).sort((a, b) => b.t - a.t)[0];
console.log("archivo:", f?.n);
const wb = XLSX.readFile(dir + "/" + f.n);
for (const name of wb.SheetNames) {
  const rows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[name], { header: 1, raw: false, defval: "" });
  console.log(`== ${name}: ${rows.length} filas`);
  for (let i = 0; i < Math.min(6, rows.length); i++) console.log(i, JSON.stringify(rows[i]).slice(0, 900));
}
