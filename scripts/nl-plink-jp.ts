// ¿Cuándo arrancó el datafono propio de Jardín Plaza (31029473)?
// Revisa los reportes Plink completos de abril y mayo.
import fs from "node:fs";
import { parseDatafono } from "../src/lib/parsers/datafono";

const MC = "C:/Users/Paola Agreda/OneDrive/Escritorio/PROYECTOS PAO/muestras-conciliacion";
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");

for (const f of [
  `${MC}/901987494_Reporte_Conciliar_20260401_20260430.xlsx`,
  `${MC}/901987494_Reporte_Conciliar_20260501_20260531.xlsx`,
]) {
  const out = parseDatafono(fs.readFileSync(f));
  const all = out.entries.map((e) => e.txDate).sort();
  console.log(`\n${f.split("/").pop()} — ${out.entries.length} trans, tx ${all[0]} → ${all[all.length - 1]}`);
  const porTienda = new Map<string, string[]>();
  for (const e of out.entries) {
    const k = `${e.establishment} → ${e.storeCode ?? "??"}`;
    (porTienda.get(k) ?? porTienda.set(k, []).get(k)!).push(e.txDate);
  }
  for (const [k, dates] of porTienda) {
    dates.sort();
    console.log(`   ${k.padEnd(18)} primera tx ${dates[0]}, última ${dates[dates.length - 1]}, ${dates.length} trans`);
  }
  // JP por día
  const jp = new Map<string, number>();
  for (const e of out.entries) if (e.storeCode === "JP") jp.set(e.txDate, (jp.get(e.txDate) ?? 0) + e.gross);
  if (jp.size) {
    console.log("   JP por día:");
    for (const [d, v] of [...jp.entries()].sort()) console.log(`      ${d}  ${fmt(v).padStart(12)}`);
  }
}
