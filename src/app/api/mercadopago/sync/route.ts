import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { validarSesion, SESSION_COOKIE } from "@/lib/sso";
import { fetchMpPayments, MP_SINCE } from "@/lib/mercadopago-api";
import { loadClosedMonths } from "@/lib/ledger";

export const runtime = "nodejs";
export const maxDuration = 60;

const NIVEL: Record<string, number> = { VIEWER: 0, EDITOR: 1, ADMIN: 2 };

/** Sincroniza los cobros de Mercado Pago por API (reemplaza el archivo de
 * liquidaciones). Reemplaza las operaciones desde MP_SINCE, respetando los
 * meses cerrados (no se borran ni se insertan). Rol EDITOR+. */
export async function POST(req: NextRequest) {
  const sesion = await validarSesion(req.cookies.get(SESSION_COOKIE)?.value);
  if (!sesion) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  if (NIVEL[sesion.rol] < NIVEL.EDITOR) {
    return NextResponse.json({ error: "Tu rol no permite sincronizar." }, { status: 403 });
  }

  try {
    const closed = await loadClosedMonths();
    const all = await fetchMpPayments();
    const rows = all.filter((r) => !closed.has(r.date.slice(0, 7)));
    const dates = rows.map((r) => r.date).sort();
    const from = dates[0] ?? MP_SINCE;
    const to = dates[dates.length - 1] ?? MP_SINCE;

    // borrar solo meses abiertos dentro del rango y reinsertar
    const months = [...new Set(rows.map((r) => r.date.slice(0, 7)))].filter((m) => !closed.has(m));
    if (months.length > 0) {
      await prisma.mercadopagoEntry.deleteMany({
        where: { date: { gte: from, lte: to }, OR: months.map((m) => ({ date: { startsWith: m } })) },
      });
      await prisma.mercadopagoEntry.createMany({ data: rows });
    }
    await prisma.upload.create({
      data: {
        filename: "Mercado Pago (API)",
        kind: "mercadopago_api",
        dateFrom: from,
        dateTo: to,
        rows: rows.length,
        skipped: all.length - rows.length,
      },
    });
    return NextResponse.json({ ok: true, ops: rows.length, from, to, omitidasMesCerrado: all.length - rows.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
