import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { validarSesion, SESSION_COOKIE } from "@/lib/sso";

export const runtime = "nodejs";

const NIVEL: Record<string, number> = { VIEWER: 0, EDITOR: 1, ADMIN: 2 };

/** Asigna manualmente un pago QR del banco (empatado entre tiendas) a una
 * tienda. Clave: (date, amount, payer) — sobrevive recargas del extracto. */
export async function POST(req: NextRequest) {
  const sesion = await validarSesion(req.cookies.get(SESSION_COOKIE)?.value);
  if (!sesion) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  if (NIVEL[sesion.rol] < NIVEL.EDITOR) {
    return NextResponse.json({ error: "Tu rol no permite asignar pagos." }, { status: 403 });
  }
  const body = (await req.json()) as { date?: string; amount?: number; payer?: string; store?: string; note?: string };
  if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date) || !body.amount || !body.store || body.payer == null) {
    return NextResponse.json({ error: "Faltan datos (date, amount, payer, store)." }, { status: 400 });
  }
  await prisma.qrAssignment.upsert({
    where: { date_amount_payer: { date: body.date, amount: body.amount, payer: body.payer } },
    create: { date: body.date, amount: body.amount, payer: body.payer, storeCode: body.store, note: body.note ?? `Asignado por ${sesion.email ?? "usuario"}` },
    update: { storeCode: body.store, note: body.note ?? `Reasignado por ${sesion.email ?? "usuario"}` },
  });
  return NextResponse.json({ ok: true });
}

/** Quita una asignación manual (para deshacer). */
export async function DELETE(req: NextRequest) {
  const sesion = await validarSesion(req.cookies.get(SESSION_COOKIE)?.value);
  if (!sesion) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  if (NIVEL[sesion.rol] < NIVEL.EDITOR) {
    return NextResponse.json({ error: "Tu rol no permite esta acción." }, { status: 403 });
  }
  const body = (await req.json()) as { date?: string; amount?: number; payer?: string };
  if (!body.date || !body.amount || body.payer == null) {
    return NextResponse.json({ error: "Faltan datos (date, amount, payer)." }, { status: 400 });
  }
  await prisma.qrAssignment.deleteMany({ where: { date: body.date, amount: body.amount, payer: body.payer } });
  return NextResponse.json({ ok: true });
}

/** Lista las asignaciones manuales existentes. */
export async function GET() {
  const rows = await prisma.qrAssignment.findMany({ orderBy: { date: "desc" } });
  return NextResponse.json({ asignaciones: rows });
}
