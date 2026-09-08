import { prisma } from "../src/lib/db";
import { computeLedger } from "../src/lib/ledger";
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
async function main() {
  for (const d of ["2026-05-28", "2026-05-29", "2026-05-30", "2026-05-31", "2026-06-01"]) {
    const g = await prisma.sale.groupBy({ by: ["method", "source"], where: { storeCode: "B2", date: d }, _sum: { amount: true }, _count: { _all: true } });
    console.log(d, "B2:", g.map((x) => `${x.method}[${x.source}] ${x._count._all} ${fmt(x._sum.amount ?? 0)}`).join(" | "));
  }
  const led = await computeLedger();
  for (const r of led.summary.results) if (r.storeCode === "B2" && r.channel === "EFECTIVO" && r.salesDates.some((s) => s >= "2026-05-27" && s <= "2026-06-02")) console.log("LEDGER B2", r.status, r.salesDates.join("+"), "venta", fmt(r.salesAmount), "dep", r.depositDate, fmt(r.depositAmount), "dif", fmt(r.difference), r.note ?? "");
  const bank = await prisma.bankEntry.findMany({ where: { date: { gte: "2026-05-28", lte: "2026-06-03" }, reference: "3105543462" }, orderBy: { date: "asc" } });
  console.log("BANCO B2 (ref 3105543462):", bank.map((b) => `${b.date} ${fmt(b.amount)}`).join(" | "));
  await prisma.$disconnect();
}
main();
