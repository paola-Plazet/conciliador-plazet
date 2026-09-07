import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/** Detalle DATÁFONO de UN día y UNA tienda, transacción por transacción:
 * cada pago con tarjeta del POS (Karrot trae franquicia, crédito/débito,
 * últimos 4 dígitos y código de autorización) contra cada transacción del
 * reporte Conciliar. Cruce en tres pases, en orden:
 *   1. mismo código de AUTORIZACIÓN (aunque el valor difiera → ESA es la que no cuadra),
 *   2. mismo valor + mismos 4 dígitos,
 *   3. mismo valor.
 * Lo que queda suelto a cada lado es la transacción que falta o sobra. */
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

  const auth = (a: string | null | undefined) => {
    const s = (a ?? "").trim();
    if (!s) return "";
    return /^\d+$/.test(s) ? String(Number(s)) : s.toUpperCase(); // "012345" ≡ "12345"
  };
  const r = (n: number) => Math.round(n);

  interface Trans {
    id: number;
    franchise: string;
    cardType: string;
    gross: number;
    net: number;
    depositDate: string;
    autorizacion: string | null;
    ultimos4: string | null;
    used: boolean;
  }
  const tx: Trans[] = trans.map((t) => ({
    id: t.id,
    franchise: t.franchise,
    cardType: t.cardType,
    gross: t.gross,
    net: t.net,
    depositDate: t.depositDate,
    autorizacion: t.autorizacion,
    ultimos4: t.ultimos4,
    used: false,
  }));

  type Via = "autorizacion" | "valor+tarjeta" | "valor";
  const pos = ventas.map((v) => ({
    id: v.id,
    invoice: v.invoice,
    hora: v.hora,
    franquicia: v.franquicia,
    tipo: v.method === "TARJETA_CREDITO" ? "CR" : "DB",
    ultimos4: v.ultimos4,
    autorizacion: v.autorizacion,
    amount: v.amount,
    match: null as null | { via: Via; gross: number; net: number; franchise: string; cardType: string; ultimos4: string | null; autorizacion: string | null; difValor: number },
  }));

  const asignar = (p: (typeof pos)[number], t: Trans, via: Via) => {
    t.used = true;
    p.match = {
      via,
      gross: t.gross,
      net: t.net,
      franchise: t.franchise,
      cardType: t.cardType,
      ultimos4: t.ultimos4,
      autorizacion: t.autorizacion,
      difValor: r(t.gross) - r(p.amount),
    };
  };
  // pase 1: autorización
  for (const p of pos) {
    const a = auth(p.autorizacion);
    if (!a) continue;
    const t = tx.find((x) => !x.used && auth(x.autorizacion) === a);
    if (t) asignar(p, t, "autorizacion");
  }
  // pase 1b: misma tarjeta (últimos 4) y autorización "parecida" (una es prefijo
  // de la otra: en el POS a veces se digita incompleta, ej. 98898 vs 988984) →
  // es la MISMA transacción; si el valor difiere, esa es la que no cuadra.
  for (const p of pos) {
    const a = auth(p.autorizacion);
    if (p.match || !a || a.length < 4 || !p.ultimos4) continue;
    const t = tx.find((x) => {
      if (x.used || x.ultimos4 !== p.ultimos4) return false;
      const b = auth(x.autorizacion);
      return b.length >= 4 && (b.startsWith(a) || a.startsWith(b));
    });
    if (t) asignar(p, t, "autorizacion");
  }
  // pase 2: valor + últimos 4
  for (const p of pos) {
    if (p.match || !p.ultimos4) continue;
    const t = tx.find((x) => !x.used && r(x.gross) === r(p.amount) && x.ultimos4 === p.ultimos4);
    if (t) asignar(p, t, "valor+tarjeta");
  }
  // pase 3: valor
  for (const p of pos) {
    if (p.match) continue;
    const t = tx.find((x) => !x.used && r(x.gross) === r(p.amount));
    if (t) asignar(p, t, "valor");
  }

  const sueltas = tx.filter((t) => !t.used).map(({ used: _u, ...t }) => t);
  const totalPos = pos.reduce((s, p) => s + p.amount, 0);
  const totalDat = tx.reduce((s, t) => s + t.gross, 0);
  const conAuth = pos.filter((p) => p.autorizacion).length;

  return NextResponse.json({
    date,
    store,
    pos,
    sueltas,
    totales: { pos: totalPos, datafono: totalDat, dif: totalDat - totalPos },
    /** el POS de esa fecha trae códigos de autorización (formato Karrot nuevo) */
    tieneAutorizacion: conAuth > 0,
  });
}
