import { prisma } from "../src/lib/db";
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
// órdenes Rappi de Plazet en la liquidación 23661380 (4–10 may 2026)
const ordenes: [string, string, number, string, string][] = [
  ["B1", "2026-05-04", 20600, "cc", "2455422167"], ["B1", "2026-05-05", 35650, "cash", "2455546282"], ["B1", "2026-05-05", 102300, "cc", "2455657572"],
  ["B1", "2026-05-06", 35650, "cash", "2455927420"], ["B1", "2026-05-06", 74600, "cc", "2456075908"],
  ["B2", "2026-05-07", 102300, "cc", "2456119462"], ["B2", "2026-05-07", 107250, "cash", "2456218963"], ["B2", "2026-05-07", 69650, "cc", "2456225075"],
  ["B1", "2026-05-07", 20600, "cc", "2456238946"], ["B1", "2026-05-07", 35650, "cc", "2456305158"], ["B2", "2026-05-07", 18150, "cc", "2456326371"],
  ["B1", "2026-05-08", 74450, "cc", "2456792635"], ["B1", "2026-05-09", 91950, "cash", "2456934702"], ["B1", "2026-05-09", 20750, "cc", "2457005581"],
  ["B2", "2026-05-09", 37950, "cc", "2457081260"],
];
async function main() {
  for (const [st, d, monto, met, id] of ordenes) {
    const d1 = new Date(Date.parse(d + "T00:00:00Z") + 86400000).toISOString().slice(0, 10);
    const ventas = await prisma.sale.findMany({ where: { storeCode: st, date: { in: [d, d1] }, amount: { gte: monto - 1, lte: monto + 1 } } });
    const desc = ventas.length ? ventas.map((v) => `${v.date} ${v.method === "TRANSFERENCIA" ? "QR ✗" : v.method === "OTRO" ? `OTRO(${v.bodega.split(" · ")[1] ?? v.bodega}) ✓` : v.method} fac ${v.invoice} [${v.source}]`).join(" ; ") : "SIN VENTA en POS ese día ni el siguiente";
    console.log(`${st} ${d} ${fmt(monto).padStart(10)} ${met.padEnd(4)} orden ${id} → ${desc}`);
  }
  await prisma.$disconnect();
}
main();
