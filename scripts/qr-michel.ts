import { prisma } from "../src/lib/db";
async function main() {
  const q = await prisma.qrEntry.findMany({ where: { date: { gte: "2026-05-06", lte: "2026-05-12" }, OR: [{ payer: { contains: "MICHEL", mode: "insensitive" } }, { amount: { in: [47100, 35500, 82600] } }] }, orderBy: { date: "asc" } });
  for (const x of q) console.log(x.date, x.amount, x.payer);
  await prisma.$disconnect();
}
main();
