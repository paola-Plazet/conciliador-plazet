// Backfill local de pagos Alegra de un mes: npx tsx scripts/alegra-backfill.ts 2026-04
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { fetchAlegraPagosMes } from "../src/lib/alegra-api";
async function main() {
  const month = process.argv[2];
  if (!/^\d{4}-\d{2}$/.test(month ?? "")) throw new Error("mes YYYY-MM requerido");
  const pagos = await fetchAlegraPagosMes(month!);
  await prisma.alegraPago.deleteMany({ where: { date: { startsWith: month! } } });
  if (pagos.length) await prisma.alegraPago.createMany({ data: pagos, skipDuplicates: true });
  console.log(month, "→", pagos.length, "pagos guardados");
  await prisma.$disconnect();
}
main();
