import * as XLSX from "xlsx";
import fs from "node:fs";
const dir = "C:/Users/Paola Agreda/Downloads";
const f = fs.readdirSync(dir).filter((n) => /^Alegra - Reporte de transacciones.*\.xlsx$/i.test(n) && !n.startsWith("~$")).map((n) => ({ n, t: fs.statSync(dir + "/" + n).mtimeMs, s: fs.statSync(dir + "/" + n).size })).sort((a, b) => b.t - a.t)[0];
console.log("archivo:", f.n, f.s, "bytes");
const wb = XLSX.readFile(dir + "/" + f.n, { cellDates: true });
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: false, defval: "" });
console.log("hojas:", wb.SheetNames.join(" | "), "filas:", rows.length);
const hdrIdx = rows.findIndex((r) => r.some((c) => String(c).toUpperCase().includes("CUENTA")));
const hdr = rows[hdrIdx];
console.log("fila encabezado", hdrIdx, ":", hdr.map((h: any, i: number) => `${String.fromCharCode(65 + i)}=${h}`).join(" | "));
for (let i = hdrIdx + 1; i < hdrIdx + 4; i++) console.log(JSON.stringify(rows[i]).slice(0, 400));
// rango de fechas: buscar columna FECHA
const cF = hdr.findIndex((h: any) => String(h).toUpperCase().startsWith("FECHA"));
const fechas = rows.slice(hdrIdx + 1).map((r) => String(r[cF])).filter(Boolean).sort();
console.log("col fecha", cF, "rango", fechas[0], "→", fechas[fechas.length - 1]);
