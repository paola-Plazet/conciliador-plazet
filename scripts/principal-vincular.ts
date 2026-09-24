// Vínculo manual factura(s) PRINCIPAL ↔ cobro MP.
// Uso: npx tsx scripts/principal-vincular.ts <fecha> <valor MP> "<nota>" <recibo> [recibo...]
import { prisma } from "../src/lib/db";
async function main() {
  const [date, bruto, nota, ...invoices] = process.argv.slice(2);
  const mp = await prisma.mercadopagoEntry.findMany({ where: { date, bruto: Number(bruto) } });
  if (mp.length !== 1) throw new Error(`Se esperaba 1 cobro MP ${date} $${bruto}, hay ${mp.length}`);
  for (const invoice of invoices) {
    await prisma.principalVinculo.upsert({
      where: { invoice_opId: { invoice, opId: mp[0].opId } },
      create: { invoice, opId: mp[0].opId, nota },
      update: { nota },
    });
  }
  console.log("vinculado", invoices, "→ MP", mp[0].opId, mp[0].origen, mp[0].detalle);
}
main().finally(() => prisma.$disconnect());
