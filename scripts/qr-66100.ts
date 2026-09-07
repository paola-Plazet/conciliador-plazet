// ¿Por qué el QR de $66.100 del 7-may no se asignó a Plaza (B1)?
import { prisma } from "../src/lib/db";
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
async function main() {
  console.log("— Pagos QR en el banco del 4 al 10 de mayo:");
  const qr = await prisma.qrEntry.findMany({ where: { date: { gte: "2026-05-04", lte: "2026-05-10" } }, orderBy: { date: "asc" } });
  for (const q of qr) console.log("  ", q.date, fmt(q.amount).padStart(11), q.payer);
  console.log("\n— Ventas QR/transferencia por tienda del 4 al 10 de mayo:");
  const ventas = await prisma.sale.findMany({ where: { method: "TRANSFERENCIA", date: { gte: "2026-05-04", lte: "2026-05-10" } }, orderBy: { date: "asc" } });
  for (const v of ventas) console.log("  ", v.date, (v.storeCode ?? "?").padEnd(4), fmt(v.amount).padStart(11), v.invoice, v.bodega.slice(0, 25));
  // candidatos al pago de 66100: ventas con ese valor ±500 a ≤6 días
  const pago = qr.find((q) => Math.round(q.amount) === 66100);
  if (pago) {
    console.log(`\n— Candidatas para el pago ${fmt(pago.amount)} del ${pago.date} (±$500, ≤6 días):`);
    const cands = await prisma.sale.findMany({ where: { method: "TRANSFERENCIA", amount: { gte: pago.amount - 500, lte: pago.amount + 500 } } });
    for (const c of cands) {
      const dd = Math.abs(Date.parse(c.date) - Date.parse(pago.date)) / 86400000;
      if (dd <= 6) console.log("  ", c.date, c.storeCode, fmt(c.amount), c.invoice, `(a ${dd} días)`);
    }
  } else console.log("\n⚠ NO hay ningún pago QR de $66.100 en la tabla QrEntry esa semana.");
  await prisma.$disconnect();
}
main();
