import { prisma } from "../src/lib/db";
async function main() {
  const rows = await prisma.alegraPago.groupBy({ by: ["date"], _count: true });
  const por = new Map<string, number>();
  for (const r of rows) por.set(r.date.slice(0, 7), (por.get(r.date.slice(0, 7)) ?? 0) + r._count);
  console.log([...por.entries()].sort().map(([m, n]) => `${m}:${n}`).join("  ") || "(vacío)");
  const cuentas = await prisma.alegraPago.groupBy({ by: ["cuenta"], _count: true });
  for (const c of cuentas) console.log(" ", c.cuenta, c._count);
  await prisma.$disconnect();
}
main();
