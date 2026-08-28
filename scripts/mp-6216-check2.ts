// ¿Existe la operación MP 164414384091 (21-jun) y por cuánto?
//   npx tsx scripts/mp-6216-check2.ts
import { prisma } from "../src/lib/db";

async function main() {
  const porId = await prisma.mercadopagoEntry.findMany({ where: { opId: "164414384091" } });
  console.log("op 164414384091:", JSON.stringify(porId));
  const dias = await prisma.mercadopagoEntry.findMany({
    where: { date: { gte: "2026-06-20", lte: "2026-06-23" } },
    orderBy: { date: "asc" },
  });
  console.log("operaciones MP 20-23 jun:", dias.length);
  for (const r of dias) console.log("  ", r.date, r.opId, r.medio, "bruto", r.bruto, "neto", r.neto, "release", r.release ?? "");
  await prisma.$disconnect();
}
main();
