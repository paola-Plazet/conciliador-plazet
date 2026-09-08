import { prisma } from "../src/lib/db";
import { computeLedger } from "../src/lib/ledger";
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
async function main() {
  const led = await computeLedger();
  for (const r of led.summary.results) if (r.storeCode === "B2" && r.channel === "EFECTIVO" && r.salesDates.some((s) => s >= "2026-05-04" && s <= "2026-05-07")) console.log("LEDGER B2", r.status, r.salesDates.join("+"), "venta", fmt(r.salesAmount), "dep", r.depositDate, fmt(r.depositAmount), "dif", fmt(r.difference), r.note ?? "");
  const vec = await prisma.sale.findMany({ where: { storeCode: "B2", invoice: { in: ["B2179", "B2180", "B2181", "B2182", "B2183", "B2184", "B2185", "B2939", "B2940", "B2941", "B2942", "B2943"] } }, orderBy: { invoice: "asc" } });
  console.log("vecinas:", vec.map((v) => `${v.invoice} ${v.date} ${v.method} ${fmt(v.amount)}`).join(" | "));
  const b2mayo = await prisma.sale.findMany({ where: { storeCode: "B2", date: { startsWith: "2026-05" }, method: "EFECTIVO" }, orderBy: { date: "asc" } });
  // facturas cuyo número está muy por debajo de las del día (posible pago re-fechado)
  const num = (inv: string) => Number(inv.replace(/^B2/, "")) || 0;
  const porDia = new Map<string, number[]>();
  for (const s of b2mayo) porDia.set(s.date, [...(porDia.get(s.date) ?? []), num(s.invoice)]);
  for (const s of b2mayo) { const nums = porDia.get(s.date)!.sort((a, b) => a - b); const mediana = nums[Math.floor(nums.length / 2)]; if (mediana - num(s.invoice) > 150) console.log(`   sospechosa: ${s.date} ${s.invoice} ${fmt(s.amount)} (mediana del día #${mediana})`); }
  await prisma.$disconnect();
}
main();
