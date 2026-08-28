// Diagnóstico: movimientos de las referencias de tiendas cerradas NL aún sin asignar
//   npx tsx scripts/refs-sueltas.ts
import { prisma } from "../src/lib/db";

const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");

async function main() {
  for (const ref of ["3209052268", "31483657", "3165476343", "3172560775", "10030039979"]) {
    const rows = await prisma.bankEntry.findMany({ where: { reference: ref }, orderBy: { date: "asc" } });
    const total = rows.reduce((s, r) => s + r.amount, 0);
    console.log(`=== ref ${ref}: ${rows.length} movs, total ${fmt(total)}`);
    for (const r of rows.slice(0, 30)) console.log("  ", r.date, fmt(r.amount), r.kind ?? "");
    if (rows.length > 30) console.log(`   ... (+${rows.length - 30} movs más)`);
  }
  await prisma.$disconnect();
}
main();
