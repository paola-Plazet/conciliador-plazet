// Caso Paola 07-sep: Plaza (B1) 8-may, dif QR 82.450 vs detalle. Ventas QR de B1 del 6 al 9 de mayo y pagos del banco del 2 al 14.
import { prisma } from "../src/lib/db";
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
async function main() {
  const ventas = await prisma.sale.findMany({ where: { method: "TRANSFERENCIA", date: { gte: "2026-05-07", lte: "2026-05-09" }, storeCode: { in: ["B1", "B2"] } }, orderBy: [{ date: "asc" }, { storeCode: "asc" }, { amount: "desc" }] });
  console.log("VENTAS QR B1/B2 7-9 may:");
  for (const v of ventas) console.log("  ", v.date, v.storeCode, fmt(v.amount), v.invoice);
  const pagos = await prisma.qrEntry.findMany({ where: { date: { gte: "2026-05-04", lte: "2026-05-14" } }, orderBy: [{ date: "asc" }, { amount: "desc" }] });
  const montos = new Set(ventas.map((v) => Math.round(v.amount)));
  console.log("\nPAGOS QR banco 4-14 may que calzan ±500 con alguna venta de arriba:");
  for (const p of pagos) { const m = Math.round(p.amount); if ([...montos].some((x) => Math.abs(x - m) <= 500)) console.log("  ", p.date, fmt(p.amount), p.payer); }
  const b1_8 = ventas.filter((v) => v.storeCode === "B1" && v.date === "2026-05-08");
  console.log("\nB1 8-may total venta QR:", fmt(b1_8.reduce((s, v) => s + v.amount, 0)), "en", b1_8.length, "facturas");
}
main().finally(() => prisma.$disconnect());
