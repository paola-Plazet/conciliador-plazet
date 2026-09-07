import { prisma } from "../src/lib/db";
async function main() {
  const rows = await prisma.shopifyOrder.findMany();
  const por = new Map<string, number>();
  for (const r of rows) { const k = `${r.shop} ${r.date.slice(0, 7)} ${r.gateway}`; por.set(k, (por.get(k) ?? 0) + 1); }
  for (const [k, n] of [...por.entries()].sort()) console.log(k, "→", n);
  await prisma.$disconnect();
}
main();
