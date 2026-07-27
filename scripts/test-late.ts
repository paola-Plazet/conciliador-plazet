import { conciliar } from "../src/lib/engine";
import { holidaysForYears } from "../src/lib/holidays";
import type { SaleInvoice, BankCashEntry } from "../src/lib/types";

const holidays = holidaysForYears([2026]).map((h) => h.date);
// 2026-06-08 = Corpus Christi (festivo)

function sale(date: string, amount: number): SaleInvoice {
  return { invoice: date + "-" + amount, date, bodega: "B1", storeCode: "B1", method: "EFECTIVO", amount };
}
function dep(date: string, amount: number): BankCashEntry {
  return { date, concept: "RECAUDO REFE: 1 - EFECTIVO", amount, reference: "1", storeCode: "B1", kind: "RECAUDO_EFECTIVO" };
}

console.log("=== Escenario 1: a tiempo (mar->mie) ===");
let r = conciliar({
  sales: [sale("2026-06-02", 100000)],
  bank: [dep("2026-06-03", 100000)],
  datafono: [], holidays,
}).results.filter((x) => x.channel === "EFECTIVO");
r.forEach((x) => console.log(`  dep ${x.depositDate} esperado ${x.expectedDate} atraso=${x.daysLate} late=${x.late} ${x.status}`));

console.log("=== Escenario 2: tardía (mar venta, consigna vie) ===");
r = conciliar({
  sales: [sale("2026-06-02", 100000)],
  bank: [dep("2026-06-05", 100000)],
  datafono: [], holidays,
}).results.filter((x) => x.channel === "EFECTIVO");
r.forEach((x) => console.log(`  dep ${x.depositDate} esperado ${x.expectedDate} atraso=${x.daysLate} late=${x.late} ${x.status}`));

console.log("=== Escenario 3: fin de semana + festivo lunes (vie/sab/dom -> consigna martes) ===");
r = conciliar({
  sales: [sale("2026-06-05", 50000), sale("2026-06-06", 30000), sale("2026-06-07", 20000)],
  bank: [dep("2026-06-09", 100000)],
  datafono: [], holidays,
}).results.filter((x) => x.channel === "EFECTIVO");
r.forEach((x) => console.log(`  dep ${x.depositDate} esperado ${x.expectedDate} cubre [${x.salesDates}] atraso=${x.daysLate} late=${x.late} ${x.status}`));

console.log("=== Escenario 4: PDV reincidente (4 tardías de 5) ===");
const sales: SaleInvoice[] = [];
const deps: BankCashEntry[] = [];
// 5 ventas en días hábiles, 4 consignadas tarde
const pairs: [string, string][] = [
  ["2026-06-01", "2026-06-04"], // tarde
  ["2026-06-09", "2026-06-11"], // tarde
  ["2026-06-10", "2026-06-12"], // tarde
  ["2026-06-15", "2026-06-16"], // a tiempo
  ["2026-06-17", "2026-06-19"], // tarde
];
for (const [s, d] of pairs) { sales.push(sale(s, 200000)); deps.push(dep(d, 200000)); }
const out = conciliar({ sales, bank: deps, datafono: [], holidays });
console.log("  totals:", out.totals);
console.log("  alerts:", JSON.stringify(out.alerts, null, 2));
