import { prisma } from "../src/lib/db";
async function main() {
  const rows = await prisma.mercadopagoEntry.findMany();
  const por = new Map<string, { n: number; bruto: number }>();
  for (const r of rows) { const m = r.date.slice(0, 7); const a = por.get(m) ?? { n: 0, bruto: 0 }; a.n++; a.bruto += r.bruto; por.set(m, a); }
  for (const [m, a] of [...por.entries()].sort()) console.log(m, a.n, "ops", "$" + Math.round(a.bruto).toLocaleString("es-CO"));
  await prisma.$disconnect();
}
main();
