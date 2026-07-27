// Inspecciona los reportes Conciliar (Plink) de abril-mayo: columnas,
// establecimientos y rango de fechas de cada archivo.
import fs from "node:fs";
import { parseDatafono } from "../src/lib/parsers/datafono";

const FILES = [
  "C:/Users/Paola Agreda/Downloads/901987494_Reporte_Conciliar_20260401_20260501.xlsx",
  "C:/Users/Paola Agreda/Downloads/901987494_Reporte_Conciliar_20260409_20260504.xlsx",
  "C:/Users/Paola Agreda/Downloads/901987494_Reporte_Conciliar_20260501_20260511.xlsx",
  "C:/Users/Paola Agreda/Downloads/901987494_Reporte_Conciliar_20260413_20260512.xlsx",
  "C:/Users/Paola Agreda/Downloads/901987494_Reporte_Conciliar_20260414_20260513.xlsx",
  "C:/Users/Paola Agreda/OneDrive/Escritorio/PROYECTOS PAO/muestras-conciliacion/901987494_Reporte_Conciliar_20260527_20260625.xlsx",
];

const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");

for (const f of FILES) {
  const buf = fs.readFileSync(f);
  const out = parseDatafono(buf);
  const dates = out.entries.map((e) => e.txDate).sort();
  const ests = new Map<string, number>();
  for (const e of out.entries) {
    const k = `${e.establishment} → ${e.storeCode ?? "??"}`;
    ests.set(k, (ests.get(k) ?? 0) + e.gross);
  }
  console.log(`\n${f.split("/").pop()}`);
  console.log(`   ${out.entries.length} trans | tx ${dates[0]} → ${dates[dates.length - 1]} | bruto ${fmt(out.totalGross)}`);
  for (const [k, v] of ests) console.log(`   ${k.padEnd(30)} ${fmt(v).padStart(14)}`);
  if (out.warnings.length) console.log("   avisos:", out.warnings.join(" | "));
}
