import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { cruzarDatafono } from "@/lib/datafono-cruce";

export const runtime = "nodejs";

/** Detalle DATÁFONO de UN día y UNA tienda, transacción por transacción:
 * cada pago con tarjeta del POS (Karrot trae franquicia, crédito/débito,
 * últimos 4 dígitos y código de autorización) contra cada transacción del
 * reporte Conciliar. Cruce EXACTO (src/lib/datafono-cruce.ts): lo del POS que
 * no está en el datáfono es FALTA, lo del datáfono sin factura es SOBRA; no
 * se netea. Las devoluciones registradas en el POS (montos negativos) se
 * cruzan contra reversiones del datáfono. */
export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") ?? "";
  const store = req.nextUrl.searchParams.get("store") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !store) {
    return NextResponse.json({ error: "Parámetros date (YYYY-MM-DD) y store requeridos." }, { status: 400 });
  }
  const [ventas, trans] = await Promise.all([
    prisma.sale.findMany({
      where: { date, storeCode: store, method: { in: ["TARJETA_CREDITO", "TARJETA_DEBITO"] } },
      orderBy: [{ hora: "asc" }, { invoice: "asc" }, { id: "asc" }],
    }),
    prisma.dataphoneEntry.findMany({ where: { txDate: date, storeCode: store }, orderBy: { id: "asc" } }),
  ]);

  const posIn = ventas.map((v) => ({
    id: v.id,
    invoice: v.source === "karrot_devolucion" ? "devolución" : v.invoice,
    hora: v.hora,
    franquicia: v.franquicia,
    tipo: v.method === "TARJETA_CREDITO" ? "CR" : "DB",
    ultimos4: v.ultimos4,
    autorizacion: v.autorizacion,
    amount: v.amount,
    esDevolucion: v.source === "karrot_devolucion",
  }));
  const txIn = trans.map((t) => ({
    id: t.id,
    franchise: t.franchise,
    cardType: t.cardType,
    gross: t.gross,
    net: t.net,
    depositDate: t.depositDate,
    autorizacion: t.autorizacion,
    ultimos4: t.ultimos4,
  }));
  const cruce = cruzarDatafono(posIn, txIn);
  const parPorPos = new Map(cruce.pares.map((p) => [p.pos.id, p]));

  const pos = posIn.map((p) => {
    const par = parPorPos.get(p.id);
    return {
      ...p,
      match: par
        ? {
            via: par.via,
            // con dos tarjetas, gross = suma de las dos transacciones
            gross: par.tx.gross + (par.tx2?.gross ?? 0),
            tx2Gross: par.tx2?.gross ?? null,
            compartida: !!par.compartida,
            net: par.tx.net + (par.tx2?.net ?? 0),
            franchise: par.tx.franchise, cardType: par.tx.cardType, ultimos4: par.tx.ultimos4, autorizacion: par.tx.autorizacion,
            difValor: par.difValor,
          }
        : null,
    };
  });
  const sueltas = cruce.txSueltas;
  const devueltoDatafono = posIn.filter((p) => p.esDevolucion).reduce((s, p) => s + p.amount, 0);
  const totalPos = posIn.reduce((s, p) => s + p.amount, 0);
  const totalDat = txIn.reduce((s, t) => s + t.gross, 0);

  return NextResponse.json({
    date,
    store,
    pos,
    sueltas,
    /** devoluciones por datáfono del cierre de caja (negativo o 0), incluidas en totales.pos */
    devueltoDatafono,
    /** cruce exacto sin netear */
    falta: cruce.falta,
    sobra: cruce.sobra,
    totales: { pos: totalPos, datafono: totalDat, dif: totalDat - totalPos },
    /** el POS de esa fecha trae códigos de autorización (formato Karrot nuevo) */
    tieneAutorizacion: posIn.some((p) => p.autorizacion),
  });
}
