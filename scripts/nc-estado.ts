import { prisma } from "../src/lib/db";
async function main() {
  const nc = await prisma.creditNote.findMany({ where: { date: { gte: "2026-09-01" } }, orderBy: { date: "asc" } });
  for (const n of nc) console.log(n.date, n.storeCode ?? "?", "NC" + n.ncNumber, "fac", n.orderReceipt, n.net, "|", n.metodoOriginal, "→", n.metodoDevolucion);
  const cc = await prisma.cashierClose.groupBy({ by: ["date"], where: { date: { gte: "2026-09-01" } }, _count: true });
  console.log("cierres por día", cc.map((c) => c.date.slice(5) + ":" + c._count).join(" "));
  const dev = await prisma.sale.findMany({ where: { source: "karrot_devolucion", date: { gte: "2026-09-01" } }, orderBy: { date: "asc" } });
  for (const d of dev) console.log("DEV", d.date, d.storeCode, d.invoice, d.method, d.amount, d.bodega);
  process.exit(0);
}
main();
