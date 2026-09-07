import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { validarSesion, SESSION_COOKIE } from "@/lib/sso";
import { reclasificarVenta, deshacerOverride, PLATAFORMAS, type Plataforma } from "@/lib/overrides";

export const runtime = "nodejs";

/** Reclasifica una venta que el POS registró como QR: "en realidad fue Rappi/Addi…".
 * POST { date, store, invoice, amount, plataforma, nota? } · DELETE { id } · GET ?month= */
export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get("month");
  const filas = await prisma.saleOverride.findMany({
    where: month ? { date: { startsWith: month } } : undefined,
    orderBy: [{ date: "asc" }, { id: "asc" }],
  });
  return NextResponse.json({ overrides: filas });
}

export async function POST(req: NextRequest) {
  const sesion = await validarSesion(req.cookies.get(SESSION_COOKIE)?.value);
  if (!sesion) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  const body = (await req.json()) as { date?: string; store?: string; invoice?: string; amount?: number; plataforma?: string; nota?: string };
  if (!body.date || !body.store || !body.invoice || !body.amount || !body.plataforma) {
    return NextResponse.json({ error: "Faltan datos (date, store, invoice, amount, plataforma)." }, { status: 400 });
  }
  if (!(PLATAFORMAS as readonly string[]).includes(body.plataforma)) {
    return NextResponse.json({ error: `Plataforma inválida. Opciones: ${PLATAFORMAS.join(", ")}.` }, { status: 400 });
  }
  try {
    const fila = await reclasificarVenta({
      date: body.date, storeCode: body.store, invoice: body.invoice, amount: Math.round(body.amount),
      plataforma: body.plataforma as Plataforma, nota: body.nota ?? null, autor: sesion.name || sesion.email || null,
    });
    return NextResponse.json({ ok: true, override: fila });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo reclasificar." }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const sesion = await validarSesion(req.cookies.get(SESSION_COOKIE)?.value);
  if (!sesion) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  const body = (await req.json()) as { id?: number };
  if (!body.id) return NextResponse.json({ error: "Falta id." }, { status: 400 });
  await deshacerOverride(body.id);
  return NextResponse.json({ ok: true });
}
