import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/** Canal WEB: pedidos Shopify (Plazet + NL) cruzados contra los cobros de la
 * cuenta de Mercado Pago (la misma para las dos tiendas, cargada por archivo).
 *
 * Cruce por monto + fecha: cada pedido busca la operación MP no usada con
 * |bruto − total| ≤ $100 y ≤ 4 días de distancia (gana la más cercana).
 * El cruce se hace sobre TODO el histórico (los cobros pueden caer en el mes
 * siguiente) y la vista se filtra por mes del pedido.
 */
export async function GET(req: NextRequest) {
  const [orders, mpRows, uploads] = await Promise.all([
    prisma.shopifyOrder.findMany({ orderBy: [{ date: "asc" }, { id: "asc" }] }),
    prisma.mercadopagoEntry.findMany({ orderBy: { date: "asc" } }),
    prisma.upload.findMany({ where: { kind: "shopify" }, orderBy: { createdAt: "desc" }, take: 4 }),
  ]);

  const dayDiff = (a: string, b: string) =>
    Math.abs(Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / 86400000;

  // matching global orden → operación MP
  const used = new Array(mpRows.length).fill(false);
  const matchOf = new Map<number, number>(); // ShopifyOrder.id -> índice en mpRows
  for (const o of orders) {
    let best = -1;
    let bestScore = Infinity;
    for (let i = 0; i < mpRows.length; i++) {
      if (used[i]) continue;
      const da = Math.abs(mpRows[i].bruto - o.amount);
      if (da > 100) continue;
      const dd = dayDiff(mpRows[i].date, o.date);
      if (dd > 4) continue;
      const score = dd * 1000 + da;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best >= 0) {
      used[best] = true;
      matchOf.set(o.id, best);
    }
  }

  const monthsSet = new Set(orders.map((o) => o.date.slice(0, 7)));
  const months = [...monthsSet].sort().reverse();
  const month = req.nextUrl.searchParams.get("month") ?? months[0] ?? null;

  const shops: Record<string, unknown> = {};
  for (const key of ["PLAZET", "NL"]) {
    const mine = orders.filter((o) => o.shop === key && (!month || o.date.startsWith(month)));
    const rows = mine.map((o) => {
      const mi = matchOf.get(o.id);
      const m = mi != null ? mpRows[mi] : null;
      return {
        name: o.name,
        date: o.date,
        amount: o.amount,
        refund: o.refund,
        refundDate: o.refundDate,
        gateway: o.gateway,
        financial: o.financial,
        mp: m
          ? {
              opId: m.opId,
              date: m.date,
              bruto: m.bruto,
              neto: m.neto,
              fee: Math.round((m.bruto - m.neto) * 100) / 100,
              release: m.release,
              diff: Math.round((m.bruto - o.amount) * 100) / 100,
            }
          : null,
      };
    });
    const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((a, r) => a + f(r), 0);
    const sinCobro = rows.filter((r) => !r.mp);
    shops[key] = {
      rows: [...rows].sort((a, b) => b.date.localeCompare(a.date)),
      totals: {
        pedidos: rows.length,
        cobradoWeb: sum((r) => r.amount),
        reembolsos: sum((r) => r.refund),
        conCobro: rows.length - sinCobro.length,
        sinCobro: sinCobro.length,
        sinCobroMonto: sinCobro.reduce((a, r) => a + r.amount, 0),
        brutoMp: sum((r) => r.mp?.bruto ?? 0),
        netoMp: sum((r) => r.mp?.neto ?? 0),
        comision: sum((r) => r.mp?.fee ?? 0),
      },
    };
  }

  // última sincronización por tienda (Upload kind=shopify)
  const lastSync: Record<string, string | null> = { PLAZET: null, NL: null };
  for (const u of uploads) {
    const key = u.filename.includes("Natural") ? "NL" : "PLAZET";
    if (!lastSync[key]) lastSync[key] = u.createdAt.toISOString();
  }

  return NextResponse.json({ months, month, shops, lastSync, totalMpOps: mpRows.length });
}
