import * as XLSX from "xlsx";
import fs from "node:fs";
const dir = "C:/Users/Paola Agreda/Downloads";
const files = fs.readdirSync(dir).filter((n) => /^(report|download)( \(\d+\))?\.xlsx$/i.test(n)).sort();
for (const n of files) {
  try {
    const wb = XLSX.readFile(dir + "/" + n);
    const hojas = wb.SheetNames;
    let info = "";
    if (hojas.includes("Resumen")) {
      const r = XLSX.utils.sheet_to_json<any[]>(wb.Sheets["Resumen"], { header: 1, raw: false, defval: "" });
      const fila = r.find((x) => String(x[0]).includes("NATURAL LIGHT") || String(x[0]).includes("HABBIE") || String(x[3] ?? "").match(/^\d{8}$/));
      info = fila ? `${fila[0]} | semanas ${fila[2]} | pago ${fila[3]} | ${fila[4]} | total ${fila[5]}` : "sin fila de resumen";
      const ventas = XLSX.utils.sheet_to_json<any[]>(wb.Sheets["1. Ventas por Orden"] ?? {}, { header: 1, raw: false, defval: "" }).slice(3).filter((x) => x[1]);
      const plazet = ventas.filter((x) => String(x[2]).toUpperCase().includes("PLAZET"));
      info += ` | órdenes ${ventas.length} (Plazet ${plazet.length})`;
    } else {
      const r = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[hojas[0]], { header: 1, raw: false, defval: "" });
      info = `hojas: ${hojas.join(", ")} | fila0: ${JSON.stringify(r[0]).slice(0, 200)} | fila1: ${JSON.stringify(r[1]).slice(0, 200)} | filas ${r.length}`;
    }
    console.log(`${n.padEnd(20)} → ${info}`);
  } catch (e) { console.log(`${n.padEnd(20)} → ERROR ${(e as Error).message}`); }
}
