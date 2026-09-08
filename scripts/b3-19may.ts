import { prisma } from "../src/lib/db";
import { computeLedger } from "../src/lib/ledger";
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
async function main() {
  const led = await computeLedger();
  for (const r of led.summary.results) if (r.channel === "EFECTIVO" && r.storeCode === "B3" && r.salesDates.some((d) => d >= "2026-05-17" && d <= "2026-05-23")) console.log("LEDGER B3", r.status, r.salesDates.join("+"), "venta", fmt(r.salesAmount), "dep", r.depositDate, fmt(r.depositAmount), "dif", fmt(r.difference), r.note ?? "");
  for (const d of ["2026-05-18", "2026-05-19", "2026-05-20", "2026-05-21"]) { const s = await prisma.sale.aggregate({ where: { storeCode: "B3", date: d, method: "EFECTIVO" }, _sum: { amount: true } }); console.log("venta efectivo B3", d, fmt(s._sum.amount ?? 0)); }
  const bank = await prisma.bankEntry.findMany({ where: { date: { gte: "2026-05-19", lte: "2026-05-22" } }, orderBy: [{ date: "asc" }, { amount: "desc" }] });
  const refs = await prisma.cashReference.findMany({ include: { store: true } as any });
  const refMap = new Map(refs.map((r: any) => [r.reference, r.store?.code ?? r.storeId]));
  console.log("\nBANCO 19–22 may:");
  for (const b of bank) console.log(`   ${b.date} ${fmt(b.amount).padStart(12)} ref ${String(b.reference ?? "-").padEnd(12)} → ${refMap.get(b.reference ?? "") ?? "SIN TIENDA"}  ${b.kind} ${b.concept.slice(0, 40)} (id ${b.id})`);
  // ¿dónde aparece 247.600 exacto?
  const x = await prisma.bankEntry.findMany({ where: { amount: { gte: 247599, lte: 247601 } } });
  console.log("\n247.600 en banco:", x.map((b) => `${b.date} ref ${b.reference} → ${refMap.get(b.reference ?? "") ?? "SIN TIENDA"} (id ${b.id})`).join(" | ") || "no está");
  for (const r of led.summary.results) if (r.channel === "EFECTIVO" && r.depositDate === "2026-05-21") console.log("LEDGER dep 21-may:", r.storeCode, r.status, r.salesDates.join("+"), "venta", fmt(r.salesAmount), "dep", fmt(r.depositAmount), "dif", fmt(r.difference));
  await prisma.$disconnect();
}
main();
