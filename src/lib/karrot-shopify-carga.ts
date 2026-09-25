// Carga las ventas de la ubicación SHOPIFY de Karrot (web Plazet) reemplazando
// su rango de fechas (solo source "karrot_shopify", meses abiertos).
import { prisma } from "@/lib/db";
import { loadClosedMonths } from "@/lib/ledger";
import { parseKarrotShopify } from "@/lib/parsers/karrot-shopify";

export async function cargarKarrotShopify(csv: string) {
  const closed = await loadClosedMonths();
  const todas = parseKarrotShopify(csv);
  const ventas = todas.filter((v) => !closed.has(v.date.slice(0, 7)));
  if (ventas.length === 0) return { filas: 0, from: null, to: null, omitidasMesCerrado: todas.length };
  const dates = ventas.map((v) => v.date).sort();
  const from = dates[0];
  const to = dates[dates.length - 1];
  await prisma.sale.deleteMany({ where: { source: "karrot_shopify", date: { gte: from, lte: to } } });
  await prisma.sale.createMany({
    data: ventas.map((v) => ({
      date: v.date, invoice: v.invoice, bodega: "SHOPIFY · Pago Online", storeCode: null, method: "OTRO",
      amount: v.amount, source: "karrot_shopify", hora: v.hora, cliente: v.cliente, fe: v.fe,
    })),
  });
  return { filas: ventas.length, from, to, omitidasMesCerrado: todas.length - ventas.length };
}
