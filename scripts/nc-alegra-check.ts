import { prisma } from "../src/lib/db";
import { computeLedger } from "../src/lib/ledger";
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
async function main() {
  const facs = ["B1476", "B21434", "B32986", "B22357", "C1340", "B2261", "B1696", "B21018", "B133", "B169", "B31133", "B1377"];
  const s = await prisma.sale.findMany({ where: { invoice: { in: facs } } });
  console.log("facturas de NC que SÍ están en la BD:", s.map((x) => `${x.invoice} ${x.date} ${x.storeCode} ${x.method} ${fmt(x.amount)}`).join(" | ") || "ninguna");
  const led = await computeLedger();
  for (const r of led.summary.results) if (r.storeCode === "B2" && r.channel === "EFECTIVO" && r.salesDates.some((d) => d >= "2026-06-12" && d <= "2026-06-16")) console.log("LEDGER B2", r.status, r.salesDates.join("+"), "venta", fmt(r.salesAmount), "dep", r.depositDate, fmt(r.depositAmount), "dif", fmt(r.difference), r.note ?? "");
  await prisma.$disconnect();
}
main();
