import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { validarSesion, SESSION_COOKIE } from "@/lib/sso";
import { fetchAlegraPagosMes } from "@/lib/alegra-api";

export const runtime = "nodejs";
export const maxDuration = 60;

const NIVEL: Record<string, number> = { VIEWER: 0, EDITOR: 1, ADMIN: 2 };

/** Sincroniza desde Alegra los pagos de un mes (?month=YYYY-MM, por defecto el
 * actual) con su cuenta destino. Reemplaza lo que hubiera de ese mes. */
export async function POST(req: NextRequest) {
  const sesion = await validarSesion(req.cookies.get(SESSION_COOKIE)?.value);
  if (!sesion) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  if (NIVEL[sesion.rol] < NIVEL.EDITOR) {
    return NextResponse.json({ error: "Tu rol no permite sincronizar." }, { status: 403 });
  }
  const month = req.nextUrl.searchParams.get("month") ?? new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "Mes inválido (YYYY-MM)." }, { status: 400 });
  }
  try {
    const pagos = await fetchAlegraPagosMes(month);
    await prisma.alegraPago.deleteMany({ where: { date: { startsWith: month } } });
    if (pagos.length > 0) {
      await prisma.alegraPago.createMany({ data: pagos, skipDuplicates: true });
    }
    await prisma.upload.create({
      data: {
        filename: `Alegra pagos ${month} (API)`,
        kind: "alegra_pagos",
        dateFrom: `${month}-01`,
        dateTo: pagos.map((p) => p.date).sort().pop() ?? `${month}-01`,
        rows: pagos.length,
      },
    });
    return NextResponse.json({ ok: true, month, pagos: pagos.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
