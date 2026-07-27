// Terminal "Principal" (31014111) en Plink: todas sus transacciones, y
// comparación contra los pagos con tarjeta de Alegra del 1-may en Unioccidente.
import fs from "node:fs";
import { parseDatafono } from "../src/lib/parsers/datafono";
import { parseAlegraTrans } from "../src/lib/parsers/alegra-trans";

const PP = "C:/Users/Paola Agreda/OneDrive/Escritorio/PROYECTOS PAO";
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");

const txs: { txDate: string; gross: number; franchise: string; cardType: string }[] = [];
for (const f of [
  `${PP}/muestras-conciliacion/901987494_Reporte_Conciliar_20260401_20260430.xlsx`,
  `${PP}/muestras-conciliacion/901987494_Reporte_Conciliar_20260501_20260531.xlsx`,
  `${PP}/muestras-conciliacion/901987494_Reporte_Conciliar_20260601_20260630 (1).xlsx`,
]) {
  const out = parseDatafono(fs.readFileSync(f));
  for (const e of out.entries) if (e.establishment === "31014111") txs.push(e);
}
txs.sort((a, b) => a.txDate.localeCompare(b.txDate) || b.gross - a.gross);
console.log(`Terminal 31014111 "Principal": ${txs.length} transacciones, total ${fmt(txs.reduce((s, t) => s + t.gross, 0))}`);
for (const t of txs) console.log(`   ${t.txDate}  ${fmt(t.gross).padStart(11)}  ${t.franchise} ${t.cardType}`);

const alegra = parseAlegraTrans(
  fs.readFileSync(`${PP}/muestras-conciliacion/sistemas anteriores/Alegra - Reporte de transacciones - HABBIE SAS -.xlsx`),
);
const q9 = alegra.sales
  .filter((s) => s.storeCode === "B2" && s.date === "2026-05-01" && (s.method === "TARJETA_CREDITO" || s.method === "TARJETA_DEBITO"))
  .sort((a, b) => b.amount - a.amount);
console.log(`\nAlegra Unioccidente 1-may tarjetas: ${q9.length} pagos, total ${fmt(q9.reduce((s, v) => s + v.amount, 0))}`);
for (const v of q9) console.log(`   ${fmt(v.amount).padStart(11)}  ${v.invoice}  ${v.method}`);

// calce uno a uno por valor
const usados = new Set<number>();
let calzan = 0, sumCalza = 0;
for (const v of q9) {
  const i = txs.findIndex((t, idx) => !usados.has(idx) && t.txDate === "2026-05-01" && Math.abs(t.gross - v.amount) <= 100);
  if (i >= 0) { usados.add(i); calzan++; sumCalza += v.amount; }
}
console.log(`\nPagos Alegra 1-may que calzan con transacciones del terminal Principal: ${calzan}/${q9.length} (${fmt(sumCalza)})`);
