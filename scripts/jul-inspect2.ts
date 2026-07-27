// allsales de Karrot: columnas completas, rango de fechas, almacenes, canales,
// métodos de pago y columnas de dinero. Y el detalle del extracto del encargo.
import fs from "node:fs";
import * as XLSX from "xlsx";

const MC = "C:/Users/Paola Agreda/OneDrive/Escritorio/PROYECTOS PAO/muestras-conciliacion";
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");

const wb = XLSX.read(fs.readFileSync(`${MC}/allsales-a2b47fd9-3c80-4506-8700-49c3de1b8966-20260716T234911269Z.xlsx`));
const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
const header = rows[0].map((c: any) => String(c ?? ""));
console.log("Columnas:");
header.forEach((h, i) => console.log(`   [${i}] ${h}`));

const idx = (name: string) => header.findIndex((h) => h === name);
const iFecha = idx("Fecha"), iAlm = idx("Nombre Almacén"), iCanal = idx("Canal de Venta"), iMetodo = idx("Método de Pago Principal"), iFac = idx("# Factura");
const fechas = new Set<string>(), alm = new Map<string, number>(), canal = new Map<string, number>(), metodo = new Map<string, number>();
for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  if (!r || r[iFecha] == null) continue;
  fechas.add(String(r[iFecha]));
  alm.set(String(r[iAlm]), (alm.get(String(r[iAlm])) ?? 0) + 1);
  canal.set(String(r[iCanal]), (canal.get(String(r[iCanal])) ?? 0) + 1);
  metodo.set(String(r[iMetodo]), (metodo.get(String(r[iMetodo])) ?? 0) + 1);
}
const fs2 = [...fechas].sort();
console.log(`\nFechas: ${fs2[0]} → ${fs2[fs2.length - 1]} (${fs2.length} días)`);
console.log("Almacenes:", [...alm.entries()].map(([k, v]) => `${k}(${v})`).join(" | "));
console.log("Canales:", [...canal.entries()].map(([k, v]) => `${k}(${v})`).join(" | "));
console.log("Métodos:", [...metodo.entries()].map(([k, v]) => `${k}(${v})`).join(" | "));

// fila de ejemplo completa
console.log("\nFila ejemplo completa:");
header.forEach((h, i) => console.log(`   ${h}: ${JSON.stringify(rows[1]?.[i])}`));

// Extracto encargo: filas 6+ de la hoja
const wb2 = XLSX.read(fs.readFileSync(`${MC}/movimientos_10030039979 (42).xls`));
const r2: any[][] = XLSX.utils.sheet_to_json(wb2.Sheets["Page 1"], { header: 1 });
console.log("\nExtracto encargo julio — filas 5..12:");
for (const r of r2.slice(5, 13)) console.log("  ", JSON.stringify(r).slice(0, 200));
