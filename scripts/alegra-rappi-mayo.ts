import { prisma } from "../src/lib/db";
async function main() {
  const pagos = await prisma.alegraPago.findMany({ where: { cuenta: { in: ["Rappi / Addi", "Mercadopago", "Nequi"] }, date: { lte: "2026-07-08" } }, orderBy: { date: "asc" } });
  console.log("PAGOS NO-QR hasta 8-jul:", pagos.length);
  for (const p of pagos) {
    const ventas = await prisma.sale.findMany({ where: { date: p.date, amount: { gte: Math.round(p.amount) - 1, lte: Math.round(p.amount) + 1 } } });
    console.log(p.date, p.metodo, p.cuenta, Math.round(p.amount), p.invoice ?? "", "→ ventas mismo día/monto:", ventas.map((v) => `${v.storeCode}/${v.method}/${v.bodega}/${v.invoice}`).join(" ; ") || "NINGUNA");
  }
}
main().finally(() => prisma.$disconnect());
