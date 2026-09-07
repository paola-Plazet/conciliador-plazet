// 1) Reaplica las reclasificaciones manuales (autocorrigen su número de factura).
// 2) Crea una nota de revisión por cada día/tienda con ventas que Alegra contabilizó
//    en la cuenta "Efectivo POS" con método "Transferencia" (QR mal clasificado),
//    indicando factura, valor y el pago QR del banco que las respalda. Pedido de Paola 07-sep.
import { prisma } from "../src/lib/db";
import { aplicarOverrides } from "../src/lib/overrides";
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
async function main() {
  const n = await aplicarOverrides();
  console.log("reclasificaciones reaplicadas:", n);
  const casos = await prisma.sale.findMany({ where: { source: "alegra", method: "TRANSFERENCIA", bodega: { startsWith: "Efectivo POS" } }, orderBy: [{ date: "asc" }, { invoice: "asc" }] });
  console.log("QR mal clasificados (cuenta Efectivo POS + método Transferencia):", casos.length);
  const porDia = new Map<string, typeof casos>();
  for (const c of casos) { const k = `${c.date}|${c.storeCode}`; porDia.set(k, [...(porDia.get(k) ?? []), c]); }
  let creadas = 0;
  for (const [k, arr] of porDia) {
    const [date, storeCode] = k.split("|");
    const partes: string[] = [];
    for (const c of arr) {
      const d0 = new Date(Date.parse(c.date + "T00:00:00Z") - 2 * 86400000).toISOString().slice(0, 10);
      const q = await prisma.qrEntry.findFirst({ where: { date: { gte: d0, lte: c.date }, amount: { gte: c.amount - 1, lte: c.amount + 1 } }, orderBy: { date: "desc" } });
      partes.push(`${c.invoice} por ${fmt(c.amount)}${q ? ` (en el banco: QR de ${q.payer.trim()}${q.date !== c.date ? " del " + q.date.slice(5) : ""})` : " (NO aparece en el banco)"}`);
    }
    const note = `QR mal clasificado: ${arr.length === 1 ? "la factura" : "las facturas"} ${partes.join("; ")} ${arr.length === 1 ? "se contabilizó" : "se contabilizaron"} en Alegra en la cuenta Efectivo POS con método Transferencia. El conciliador ya ${arr.length === 1 ? "la" : "las"} toma como QR, no como efectivo.`;
    const existe = await prisma.dayNote.findFirst({ where: { date, storeCode, note: { startsWith: "QR mal clasificado:" } } });
    if (existe) { await prisma.dayNote.update({ where: { id: existe.id }, data: { note } }); continue; }
    await prisma.dayNote.create({ data: { date, storeCode, channel: "qr", note, autor: "Claude" } });
    creadas++;
    console.log(`   📝 ${date} ${storeCode}: ${note.slice(0, 110)}…`);
  }
  console.log("notas creadas:", creadas);
  await prisma.$disconnect();
}
main();
