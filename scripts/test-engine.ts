import fs from "node:fs";
import { parseAlegra } from "../src/lib/parsers/alegra";
import { parseBanco } from "../src/lib/parsers/banco";
import { parseDatafono } from "../src/lib/parsers/datafono";
import { conciliar } from "../src/lib/engine";
import { holidaysForYears } from "../src/lib/holidays";
import { formatCOP } from "../src/lib/money";
import { STORES } from "../src/lib/stores";

const DIR = "C:\\Users\\Paola Agreda\\OneDrive\\Escritorio\\PROYECTOS PAO\\muestras-conciliacion\\";

const a = parseAlegra(fs.readFileSync(DIR + "Alegra - Facturas - HABBIE SAS -.csv"));
const bRaw = parseBanco(fs.readFileSync(DIR + "movimientos_10030039979 (33).xls"));
const d = parseDatafono(fs.readFileSync(DIR + "901987494_Reporte_Conciliar_20260527_20260625.xlsx"));
const holidays = holidaysForYears([2026]).map((h) => h.date);

// Cash sales por tienda (total) para auto-sugerir mapeo referencia->tienda
const cashByStore: Record<string, number> = {};
for (const s of a.sales) if (s.method === "EFECTIVO" && s.storeCode) cashByStore[s.storeCode] = (cashByStore[s.storeCode] ?? 0) + s.amount;
console.log("Efectivo POS por tienda:");
for (const [k, v] of Object.entries(cashByStore)) console.log(`   ${k} (${STORES.find(s=>s.code===k)?.name}) = ${formatCOP(v)}`);

console.log("\nReferencias banco (total):");
for (const r of bRaw.references) console.log(`   ${r.reference} = ${formatCOP(r.total)}`);

// Auto-mapeo greedy: cada referencia principal -> tienda con total más cercano
// (solo las 5 referencias de mayor monto, una por tienda)
const topRefs = bRaw.references.slice(0, 5);
const storeTargets = Object.entries(cashByStore).sort((x, y) => y[1] - x[1]);
const refMap = new Map<string, string>();
const usedStores = new Set<string>();
for (const r of topRefs) {
  let best = "";
  let bestDiff = Infinity;
  for (const [store, total] of storeTargets) {
    if (usedStores.has(store)) continue;
    const diff = Math.abs(total - r.total);
    if (diff < bestDiff) { bestDiff = diff; best = store; }
  }
  if (best) { refMap.set(r.reference, best); usedStores.add(best); }
}
console.log("\nAuto-mapeo referencia -> tienda (heurística por total):");
for (const [ref, store] of refMap) console.log(`   ${ref} -> ${store} (${STORES.find(s=>s.code===store)?.name})`);

// Re-parsear banco con el refMap
const b = parseBanco(fs.readFileSync(DIR + "movimientos_10030039979 (33).xls"), refMap);

const { results, totals } = conciliar({
  sales: a.sales,
  bank: b.entries,
  datafono: d.entries,
  holidays,
});

console.log("\n===== RESULTADOS GLOBALES =====");
console.log(totals);

for (const channel of ["EFECTIVO", "DATAFONO"] as const) {
  const rs = results.filter((r) => r.channel === channel);
  const cuadran = rs.filter((r) => r.status === "CUADRA").length;
  console.log(`\n--- ${channel}: ${rs.length} resultados, ${cuadran} cuadran (${Math.round(100*cuadran/Math.max(rs.length,1))}%) ---`);
  // mostrar primeros 8
  for (const r of rs.slice(0, 8)) {
    console.log(`   ${r.storeName.padEnd(22)} dep ${r.depositDate} ${formatCOP(r.depositAmount).padStart(14)} | ventas ${formatCOP(r.salesAmount).padStart(14)} (${r.salesDates.join(",")}) | dif ${formatCOP(r.difference).padStart(12)} | ${r.status}`);
  }
}
