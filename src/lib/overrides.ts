// Reclasificaciones manuales de ventas (SaleOverride): "esta factura no fue QR,
// fue Rappi/Addi". Se aplican sobre las filas Sale y se REAPLICAN después de
// cada recarga de ventas (las recargas borran y recrean las filas).

import { prisma } from "./db";

export const PLATAFORMAS = ["Rappi", "Addi", "Mercadopago", "Nequi", "Bono Regalo", "Efectivo", "QR Bancolombia"] as const;
export type Plataforma = (typeof PLATAFORMAS)[number];

const bodegaBase = (b: string) => b.split(" · ")[0];
/** A qué método y bodega lleva cada reclasificación. "Efectivo" y "QR Bancolombia" son
 * métodos reales (la venta vuelve a un canal que sí se concilia); el resto son
 * plataformas informativas (OTRO con la plataforma en la bodega). */
function destino(plataforma: string, bodega: string): { method: string; bodega: string } {
  const base = bodegaBase(bodega);
  if (plataforma === "Efectivo") return { method: "EFECTIVO", bodega: base };
  if (plataforma === "QR Bancolombia") return { method: "TRANSFERENCIA", bodega: base };
  return { method: "OTRO", bodega: `${base} · ${plataforma}` };
}

/** Aplica TODAS las reclasificaciones (o solo las de unas fechas) sobre Sale. */
export async function aplicarOverrides(fechas?: string[]): Promise<number> {
  const overrides = await prisma.saleOverride.findMany({ where: fechas?.length ? { date: { in: fechas } } : undefined });
  let n = 0;
  for (const o of overrides) {
    let ventas = await prisma.sale.findMany({
      where: { date: o.date, storeCode: o.storeCode, invoice: o.invoice, amount: { gte: o.amount - 1, lte: o.amount + 1 }, source: { notIn: ["linux", "karrot_devolucion"] } },
    });
    if (ventas.length === 0) {
      // El número de factura pudo cambiar con una recarga (ej. Alegra pasó del número
      // de comprobante "527" al de factura "B1240"). Se busca por fecha/tienda/valor con
      // el método ORIGINAL y, si hay una sola candidata, se adopta su número nuevo.
      const cands = await prisma.sale.findMany({
        where: { date: o.date, storeCode: o.storeCode, amount: { gte: o.amount - 1, lte: o.amount + 1 }, method: o.metodoOriginal, source: { notIn: ["linux", "karrot_devolucion"] } },
      });
      if (cands.length === 1) {
        await prisma.saleOverride.update({ where: { id: o.id }, data: { invoice: cands[0].invoice, bodegaOriginal: cands[0].bodega } });
        ventas = cands;
      }
    }
    for (const v of ventas) {
      const d = destino(o.plataforma, v.bodega);
      if (v.method === d.method && v.bodega === d.bodega) continue; // ya aplicada
      await prisma.sale.update({ where: { id: v.id }, data: { method: d.method, bodega: d.bodega } });
      n++;
    }
  }
  return n;
}

/** Crea (o actualiza) una reclasificación y la aplica. Devuelve la fila. */
export async function reclasificarVenta(input: {
  date: string; storeCode: string; invoice: string; amount: number; plataforma: Plataforma; nota?: string | null; autor?: string | null;
}) {
  const venta = await prisma.sale.findFirst({
    where: { date: input.date, storeCode: input.storeCode, invoice: input.invoice, amount: { gte: input.amount - 1, lte: input.amount + 1 }, source: { notIn: ["linux", "karrot_devolucion"] } },
    orderBy: { id: "asc" },
  });
  if (!venta) throw new Error(`No existe la venta ${input.invoice} de ${input.storeCode} el ${input.date} por ${input.amount}.`);
  const existente = await prisma.saleOverride.findUnique({
    where: { date_storeCode_invoice_amount: { date: input.date, storeCode: input.storeCode, invoice: input.invoice, amount: input.amount } },
  });
  const data = {
    plataforma: input.plataforma,
    nota: input.nota ?? null,
    autor: input.autor ?? null,
    // el método/bodega ORIGINAL se conserva del primer registro (para poder deshacer)
    metodoOriginal: existente?.metodoOriginal ?? venta.method,
    bodegaOriginal: existente?.bodegaOriginal ?? venta.bodega,
  };
  const fila = existente
    ? await prisma.saleOverride.update({ where: { id: existente.id }, data })
    : await prisma.saleOverride.create({ data: { date: input.date, storeCode: input.storeCode, invoice: input.invoice, amount: input.amount, ...data } });
  await aplicarOverrides([input.date]);
  return fila;
}

/** Deshace una reclasificación: restaura método/bodega originales y la borra. */
export async function deshacerOverride(id: number): Promise<void> {
  const o = await prisma.saleOverride.findUnique({ where: { id } });
  if (!o) return;
  await prisma.sale.updateMany({
    where: { date: o.date, storeCode: o.storeCode, invoice: o.invoice, amount: { gte: o.amount - 1, lte: o.amount + 1 }, source: { notIn: ["linux", "karrot_devolucion"] } },
    data: { method: o.metodoOriginal, bodega: o.bodegaOriginal },
  });
  await prisma.saleOverride.delete({ where: { id } });
}
