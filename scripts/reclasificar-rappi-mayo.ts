// Reclasifica a RAPPI las facturas de mayo que el POS registró como QR y que SÍ
// aparecen en la liquidación de Rappi 23661380 (4–10 may 2026, cuenta de
// Comercializadora Natural Light). Pedido de Paola 07-sep-2026.
//   npx tsx scripts/reclasificar-rappi-mayo.ts
import { prisma } from "../src/lib/db";
import { reclasificarVenta } from "../src/lib/overrides";
const casos: [string, string, string, number, string][] = [
  // tienda, fecha, factura, valor, orden Rappi
  ["B1", "2026-05-07", "527", 20600, "2456238946"],
  ["B1", "2026-05-07", "545", 35650, "2456305158"],
  ["B1", "2026-05-08", "727", 74450, "2456792635"],
  ["B1", "2026-05-09", "791", 20750, "2457005581"],
  ["B2", "2026-05-07", "502", 107250, "2456218963"],
  ["B2", "2026-05-07", "505", 69650, "2456225075"],
  ["B2", "2026-05-09", "801", 37950, "2457081260"],
];
async function main() {
  for (const [storeCode, date, invoice, amount, orden] of casos) {
    const f = await reclasificarVenta({ date, storeCode, invoice, amount, plataforma: "Rappi", nota: `Orden Rappi ${orden} (liquidación 23661380)`, autor: "Claude (cruce liquidación Rappi)" });
    console.log(`✓ ${storeCode} ${date} fac ${invoice} $${amount.toLocaleString("es-CO")} → Rappi (override #${f.id}, antes ${f.metodoOriginal})`);
  }
  const check = await prisma.sale.findMany({ where: { date: { gte: "2026-05-07", lte: "2026-05-09" }, storeCode: { in: ["B1", "B2"] }, invoice: { in: casos.map((c) => c[2]) } } });
  for (const v of check) console.log("   ahora:", v.date, v.storeCode, v.invoice, v.method, v.bodega, v.amount);
  await prisma.$disconnect();
}
main();
