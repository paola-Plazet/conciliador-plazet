// Verificar punto 7 del estado de cuenta NL: factura 6216 (22-jun, $118.250)
// ¿el dinero entró como Mercado Pago a Habbie? (operación MP 164414384091 del 21-jun)
//   npx tsx scripts/mp-6216-check.ts
import { prisma } from "../src/lib/db";

async function main() {
  const exact = await prisma.bankEntry.findMany({ where: { amount: 118250 } });
  console.log("movs banco con valor exacto 118250:", exact.length);
  for (const r of exact) console.log("  ", r.date, r.amount, r.kind, r.reference ?? "", (r as any).raw ?? "");

  const rows = await prisma.bankEntry.findMany({
    where: { date: { gte: "2026-06-19", lte: "2026-06-25" } },
    orderBy: { date: "asc" },
  });
  console.log("movs banco 19-25 jun:", rows.length);
  for (const r of rows) console.log("  ", r.date, r.amount, r.kind, r.reference ?? "");

  // ventas de esos días por método, a nivel empresa
  const sales = await prisma.sale.findMany({ where: { date: { gte: "2026-06-19", lte: "2026-06-23" } } });
  const porMetodo: Record<string, number> = {};
  for (const s of sales) {
    const k = `${s.date} ${(s as any).method ?? (s as any).channel ?? "?"}`;
    porMetodo[k] = (porMetodo[k] ?? 0) + s.amount;
  }
  console.log("ventas 19-23 jun por día/método:");
  for (const [k, v] of Object.entries(porMetodo).sort()) console.log("  ", k, v);
  await prisma.$disconnect();
}
main();
