import { prisma } from "../src/lib/db";
async function main() {
  const ov = await prisma.saleOverride.findMany({ orderBy: { id: "asc" } });
  for (const o of ov) {
    const filas = await prisma.sale.findMany({ where: { date: o.date, storeCode: o.storeCode, invoice: o.invoice, source: { notIn: ["linux", "karrot_devolucion"] } } });
    console.log(`#${o.id} ${o.date} ${o.storeCode} fac ${o.invoice} $${o.amount} → filas con esa factura: ${filas.map((f) => `${f.method} $${f.amount} [${f.bodega}]`).join(" | ")}`);
  }
  const b1may = await prisma.sale.groupBy({ by: ["method"], where: { storeCode: "B1", date: { startsWith: "2026-05" }, source: "alegra" }, _count: { _all: true }, _sum: { amount: true } });
  console.log("B1 mayo (alegra) por método:", JSON.stringify(b1may));
  const rappi = await prisma.sale.count({ where: { source: "alegra", bodega: { contains: "· Rappi" } } });
  console.log("filas alegra marcadas Rappi:", rappi);
  const dup = await prisma.$queryRawUnsafe<{ invoice: string; date: string; n: number }[]>(`select invoice, date, count(*)::int n from "Sale" where source='alegra' and "storeCode"='B1' and date like '2026-05%' group by 1,2 having count(*)>1 order by 3 desc limit 8`);
  console.log("facturas repetidas B1 mayo:", JSON.stringify(dup));
  await prisma.$disconnect();
}
main();
