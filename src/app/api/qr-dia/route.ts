import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/** Detalle QR de UN día y UNA tienda, para revisar a mano:
 * - las facturas QR (ventas "QR Bancolombia") de esa tienda ese día, y
 * - para cada una, el pago del banco que mejor calza (mismo valor ±$500,
 *   hasta 6 días alrededor, prefiriendo el mismo día),
 * - más todos los pagos QR que entraron al banco ese día (toda la empresa).
 */
export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") ?? "";
  const store = req.nextUrl.searchParams.get("store") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !store) {
    return NextResponse.json({ error: "Parámetros date y store requeridos." }, { status: 400 });
  }
  const desde = new Date(Date.parse(date) - 6 * 86400000).toISOString().slice(0, 10);
  const hasta = new Date(Date.parse(date) + 6 * 86400000).toISOString().slice(0, 10);
  const [facturas, pagos] = await Promise.all([
    prisma.sale.findMany({ where: { method: "TRANSFERENCIA", storeCode: store, date }, orderBy: { amount: "desc" } }),
    prisma.qrEntry.findMany({ where: { date: { gte: desde, lte: hasta } }, orderBy: { date: "asc" } }),
  ]);

  const usados = new Set<number>();
  const diaDif = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;
  const out = facturas.map((f) => {
    let best: (typeof pagos)[number] | null = null;
    let bestScore = Infinity;
    for (const p of pagos) {
      if (usados.has(p.id)) continue;
      const dv = Math.abs(p.amount - f.amount);
      if (dv > 500) continue;
      const dd = diaDif(p.date, date);
      const score = dd * 1000 + dv;
      if (score < bestScore) { bestScore = score; best = p; }
    }
    if (best) usados.add(best.id);
    return {
      invoice: f.invoice,
      amount: f.amount,
      pago: best ? { date: best.date, amount: best.amount, payer: best.payer } : null,
    };
  });

  return NextResponse.json({
    date,
    store,
    facturas: out,
    pagosDelDia: pagos.filter((p) => p.date === date).map((p) => ({ amount: p.amount, payer: p.payer })),
  });
}
