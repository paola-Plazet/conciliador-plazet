import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ALEGRA_CONFIABLE_HASTA } from "@/lib/alegra-api";
import { QR_DIAS_ANTES } from "@/lib/qr-reglas";

export const runtime = "nodejs";

/** Detalle QR de UN día, TODAS las tiendas, para revisar a mano:
 * - todas las facturas QR (ventas "QR Bancolombia") de ese día con su tienda, y
 * - para cada una, el pago del banco que mejor calza (mismo valor ±$500, del
 *   mismo día o hasta QR_DIAS_ANTES días ANTES — un QR nunca entra después de
 *   facturado —, prefiriendo el mismo día),
 * - más todos los pagos QR que entraron al banco ese día. */
export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") ?? "";
  const store = req.nextUrl.searchParams.get("store"); // opcional: solo esa tienda
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Parámetro date requerido (YYYY-MM-DD)." }, { status: 400 });
  }
  // regla: el pago QR entra el mismo día o hasta QR_DIAS_ANTES antes, nunca después de la factura
  const desde = new Date(Date.parse(date) - QR_DIAS_ANTES * 86400000).toISOString().slice(0, 10);
  const hasta = date;
  const [facturas, pagos, stores, alegra] = await Promise.all([
    prisma.sale.findMany({
      where: { method: "TRANSFERENCIA", date, ...(store ? { storeCode: store } : {}) },
      orderBy: [{ storeCode: "asc" }, { amount: "desc" }],
    }),
    prisma.qrEntry.findMany({ where: { date: { gte: desde, lte: hasta } }, orderBy: { date: "asc" } }),
    prisma.store.findMany(),
    date <= ALEGRA_CONFIABLE_HASTA
      ? prisma.alegraPago.findMany({ where: { date, metodo: "transfer" } })
      : Promise.resolve([]),
  ]);
  const nombre = new Map(stores.map((s) => [s.code, s.name]));
  // cuenta destino según Alegra, por valor (multiconjunto: se consume una vez)
  const cuentaPorValor = new Map<number, string[]>();
  for (const a of alegra) {
    const arr = cuentaPorValor.get(Math.round(a.amount)) ?? [];
    arr.push(a.cuenta);
    cuentaPorValor.set(Math.round(a.amount), arr);
  }

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
    const cuentas = cuentaPorValor.get(Math.round(f.amount));
    const cuentaAlegra = cuentas?.shift() ?? null; // consume una por factura
    return {
      invoice: f.invoice,
      store: f.storeCode ?? "?",
      storeName: f.storeCode ? (nombre.get(f.storeCode) ?? f.storeCode) : "Sin tienda",
      amount: f.amount,
      cuentaAlegra,
      pago: best ? { date: best.date, amount: best.amount, payer: best.payer } : null,
    };
  });

  return NextResponse.json({
    date,
    facturas: out,
    pagosDelDia: pagos.filter((p) => p.date === date).map((p) => ({ amount: p.amount, payer: p.payer })),
  });
}
