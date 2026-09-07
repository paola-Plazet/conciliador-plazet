// Ventas QR de Unioccidente que calzan con órdenes Rappi sueltas el mismo día con el
// patrón de -350 (Rappi liquida unos pesos menos que el POS). Cruce inverso 07-sep.
import { prisma } from "../src/lib/db";
import { reclasificarVenta } from "../src/lib/overrides";
const casos: [string, string, string, number, string, number][] = [
  ["B2", "2026-05-07", "552", 18500, "2456326371", 18150],
  ["B2", "2026-05-20", "1904", 80050, "2461045186", 79700],
  ["B2", "2026-05-20", "1947", 13150, "2461112335", 12800],
];
async function main() {
  for (const [storeCode, date, invoice, amount, orden, montoRappi] of casos) {
    const f = await reclasificarVenta({ date, storeCode, invoice, amount, plataforma: "Rappi", nota: `Orden Rappi ${orden} por $${montoRappi.toLocaleString("es-CO")} (dif ${montoRappi - amount}, patrón -350)`, autor: "Claude (cruce liquidación Rappi)" });
    console.log(`✓ ${storeCode} ${date} fac ${invoice} $${amount.toLocaleString("es-CO")} → Rappi (#${f.id})`);
  }
  await prisma.$disconnect();
}
main();
