// Diagnóstico (solo lectura): ¿hay consignaciones de Plaza (B1) cayendo en fin de semana?
//   npx tsx scripts/diag-domingo-b1.ts [YYYY-MM]
import { prisma } from "../src/lib/db";
import { computeLedger } from "../src/lib/ledger";
import { dayOfWeek } from "../src/lib/dates";

const DOW = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
const wd = (d: string) => `${d} ${DOW[dayOfWeek(d)]}`;

async function main() {
  const month = process.argv[2] ?? "2026-08";
  const refs = await prisma.cashReference.findMany({ include: { store: true } });
  const refMap = new Map(refs.map((r) => [r.reference, r.store.code]));
  console.log("refMap:", [...refMap.entries()].map(([r, s]) => `${r}→${s}`).join("  "));

  // 1) Extracto crudo: recaudos por día de la semana (todas las tiendas)
  const bank = await prisma.bankEntry.findMany({ where: { kind: "RECAUDO_EFECTIVO" }, orderBy: { date: "asc" } });
  const porDow = new Array(7).fill(0);
  for (const b of bank) porDow[dayOfWeek(b.date)]++;
  console.log("\n=== Recaudos efectivo en el extracto por día de semana (todas las tiendas):");
  console.log(DOW.map((d, i) => `${d}=${porDow[i]}`).join("  "));
  const finde = bank.filter((b) => [0, 6].includes(dayOfWeek(b.date)));
  console.log(`Fin de semana: ${finde.length} filas`);
  for (const b of finde) console.log("  ", wd(b.date), (refMap.get(b.reference ?? "") ?? "?").padEnd(4), b.reference, fmt(b.amount), "|", b.concept.slice(0, 50));

  // 2) Plaza (B1) mes pedido: extracto crudo
  const b1 = bank.filter((b) => refMap.get(b.reference ?? "") === "B1" && b.date.startsWith(month));
  console.log(`\n=== Extracto B1 ${month}: ${b1.length} recaudos`);
  for (const b of b1) console.log("  ", wd(b.date), b.reference, fmt(b.amount));

  // 3) Ventas efectivo B1 del mes por día
  const sales = await prisma.sale.findMany({ where: { storeCode: "B1", method: "EFECTIVO", date: { startsWith: month } } });
  const porDia = new Map<string, number>();
  for (const s of sales) porDia.set(s.date, (porDia.get(s.date) ?? 0) + s.amount);
  console.log(`\n=== Ventas efectivo B1 ${month} por día:`);
  for (const [d, v] of [...porDia.entries()].sort()) console.log("  ", wd(d), fmt(v));

  // 4) Resultado del motor para B1 EFECTIVO en el mes
  const ledger = await computeLedger();
  const res = ledger.summary.results.filter(
    (r) => r.channel === "EFECTIVO" && r.storeCode === "B1" && ((r.month ?? r.depositDate.slice(0, 7)) === month || r.salesDates.some((d) => d.startsWith(month))),
  );
  console.log(`\n=== Motor B1 EFECTIVO ${month}: ${res.length} resultados`);
  for (const r of res.sort((a, b) => a.depositDate.localeCompare(b.depositDate))) {
    const sd = [...r.salesDates].sort();
    console.log(
      "  dep", wd(r.depositDate), fmt(r.depositAmount).padStart(12),
      "| ventas", sd.map(wd).join(", ") || "—", fmt(r.salesAmount ?? 0).padStart(12),
      "| dif", fmt(r.difference), r.status, r.late ? `TARDE ${r.daysLate}d` : "",
    );
  }
  await prisma.$disconnect();
}
main();
