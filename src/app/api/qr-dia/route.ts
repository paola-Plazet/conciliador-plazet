import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/** Detalle QR de UN día, TODAS las tiendas, para revisar a mano:
 * - todas las facturas QR (ventas "QR Bancolombia") de ese día con su tienda, y
 * - para cada una, el pago del banco que mejor calza (mismo valor ±$500,
 *   hasta 6 días alrededor, prefiriendo el mismo día),
 * - más todos los pagos QR que entraron al banco ese día. */
export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Parámetro date requerido (YYYY-MM-DD)." }, { status: 400 });
  }
  const desde = new Date(Date.parse(date) - 6 * 86400000).toISOString().slice(0, 10);
  const hasta = new Date(Date.parse(date) + 6 * 86400000).toISOString().slice(0, 10);
  const [facturas, pagos, stores] = await Promise.all([
    prisma.sale.findMany({
      where: { method: "TRANSFERENCIA", date },
      orderBy: [{ storeCode: "asc" }, { amount: "desc" }],
    }),
    prisma.qrEntry.findMany({ where: { date: { gte: desde, lte: hasta } }, orderBy: { date: "asc" } }),
    prisma.store.findMany(),
  ]);
  const nombre = new Map(stores.map((s) => [s.code, s.name]));

  const usados = new Set<number>();
  const diaDif = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;
  const out = facturas.map((f) => {
    let best: (typeof pagos)[number] | null = null;
    let bestScore = Infinity;
    for (const p of pagos) {
      if (usados.has(p.id)) continue;
      const dv = Math.abs(p.amount - f.amount);
      if (dv > 500) continue;
      const score = diaDif(p.date, date) * 1000 + dv;
      if (score < bestScore) { bestScore = score; best = p; }
    }
    if (best) usados.add(best.id);
    return {
      invoice: f.invoice,
      store: f.storeCode ?? "?",
      storeName: f.storeCode ? (nombre.get(f.storeCode) ?? f.storeCode) : "Sin tienda",
      amount: f.amount,
      pago: best ? { date: best.date, amount: best.amount, payer: best.payer } : null,
    };
  });

  return NextResponse.json({
    date,
    facturas: out,
    pagosDelDia: pagos.filter((p) => p.date === date).map((p) => ({ amount: p.amount, payer: p.payer })),
  });
}
