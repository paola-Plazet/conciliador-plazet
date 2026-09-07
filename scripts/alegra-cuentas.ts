import { prisma } from "../src/lib/db";
async function main() {
  const rows = await prisma.alegraPago.groupBy({ by: ["metodo", "cuenta"], _count: { _all: true }, _sum: { amount: true } });
  for (const r of rows) console.log(r.metodo, "|", r.cuenta, "|", r._count._all, "|", Math.round(r._sum.amount ?? 0));
  const may = await prisma.alegraPago.groupBy({ by: ["cuenta"], where: { date: { startsWith: "2026-05" } }, _count: { _all: true } });
  console.log("MAYO:", JSON.stringify(may));
  const meses = await prisma.$queryRawUnsafe<{ m: string; n: number }[]>(`select substr(date,1,7) m, count(*)::int n from "AlegraPago" group by 1 order by 1`);
  console.log("MESES:", JSON.stringify(meses));
}
main().finally(() => prisma.$disconnect());
