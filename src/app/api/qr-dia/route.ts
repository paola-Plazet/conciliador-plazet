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
  const [facturas, pagos, stores, alegra, reclasificadas] = await Promise.all([
    prisma.sale.findMany({
      where: { method: "TRANSFERENCIA", date, source: { not: "karrot_devolucion" }, ...(store ? { storeCode: store } : {}) },
      orderBy: [{ storeCode: "asc" }, { amount: "desc" }],
    }),
    prisma.qrEntry.findMany({ where: { date: { gte: desde, lte: hasta } }, orderBy: { date: "asc" } }),
    prisma.store.findMany(),
    date <= ALEGRA_CONFIABLE_HASTA
      ? prisma.alegraPago.findMany({ where: { date, metodo: "transfer" } })
      : Promise.resolve([]),
    // facturas de ese día que alguien marcó a mano como Rappi/Addi (ya no cuentan como QR)
    prisma.saleOverride.findMany({ where: { date, ...(store ? { storeCode: store } : {}) }, orderBy: { id: "asc" } }),
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
    // sin pago único: ¿DOS pagos del mismo cliente que sumen la factura? (ej. Michel Castro 47.100 + 35.500)
    let par: { date: string; amount: number; payer: string } | null = null;
    if (!best) {
      const libres = pagos.filter((p) => !usados.has(p.id));
      for (let i = 0; i < libres.length && !par; i++) {
        for (let j = i + 1; j < libres.length; j++) {
          const a = libres[i], b = libres[j];
          if (a.payer === b.payer && Math.abs(a.amount + b.amount - f.amount) <= 500) {
            usados.add(a.id); usados.add(b.id);
            par = { date: a.date, amount: a.amount + b.amount, payer: `${a.payer} (2 pagos: ${Math.round(a.amount).toLocaleString("es-CO")} + ${Math.round(b.amount).toLocaleString("es-CO")})` };
            break;
          }
        }
      }
    }
    const cuentas = cuentaPorValor.get(Math.round(f.amount));
    const cuentaAlegra = cuentas?.shift() ?? null; // consume una por factura
    return {
      invoice: f.invoice,
      store: f.storeCode ?? "?",
      storeName: f.storeCode ? (nombre.get(f.storeCode) ?? f.storeCode) : "Sin tienda",
      amount: f.amount,
      cuentaAlegra,
      pago: best ? { date: best.date, amount: best.amount, payer: best.payer } : par,
    };
  });

  // UN solo pago QR que cubre DOS facturas de la misma tienda (Nini Johana 224.600 = 224.000 + 600)
  const sinPago = out.filter((o) => !o.pago);
  for (let i = 0; i < sinPago.length; i++) {
    for (let j = i + 1; j < sinPago.length; j++) {
      const a = sinPago[i], b = sinPago[j];
      if (a.pago || b.pago || a.store !== b.store) continue;
      const p = pagos.find((x) => !usados.has(x.id) && Math.abs(x.amount - (a.amount + b.amount)) <= 500);
      if (!p) continue;
      usados.add(p.id);
      const compartido = { date: p.date, amount: p.amount, payer: `${p.payer} (un solo pago cubre ${a.invoice} + ${b.invoice})` };
      a.pago = compartido;
      b.pago = compartido;
    }
  }

  return NextResponse.json({
    date,
    facturas: out,
    pagosDelDia: pagos.filter((p) => p.date === date).map((p) => ({ amount: p.amount, payer: p.payer })),
    reclasificadas: reclasificadas.map((r) => ({
      id: r.id, invoice: r.invoice, store: r.storeCode, storeName: nombre.get(r.storeCode) ?? r.storeCode,
      amount: r.amount, plataforma: r.plataforma, nota: r.nota, autor: r.autor,
    })),
  });
}
