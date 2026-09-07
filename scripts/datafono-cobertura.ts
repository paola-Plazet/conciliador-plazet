import { prisma } from "../src/lib/db";
async function main() {
  const r = await prisma.$queryRawUnsafe<{ m: string; n: number; d0: string; d1: string }[]>(`select substr("txDate",1,7) m, count(*)::int n, min("txDate") d0, max("txDate") d1 from "DataphoneEntry" group by 1 order by 1`);
  console.log(JSON.stringify(r));
  const ups = await prisma.upload.findMany({ where: { kind: "datafono" }, orderBy: { id: "desc" }, take: 8, select: { filename: true, dateFrom: true, dateTo: true, rows: true, createdAt: true } });
  for (const u of ups) console.log(u.createdAt.toISOString().slice(0, 10), u.filename, u.dateFrom, "→", u.dateTo, u.rows);
}
main().finally(() => prisma.$disconnect());
