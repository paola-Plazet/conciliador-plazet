import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { validarSesion, SESSION_COOKIE } from "@/lib/sso";

export const runtime = "nodejs";

const NIVEL: Record<string, number> = { VIEWER: 0, EDITOR: 1, ADMIN: 2 };

/** Notas de revisión por día/tienda/canal. GET ?month=YYYY-MM lista el mes. */
export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get("month");
  const notas = await prisma.dayNote.findMany({
    where: month ? { date: { startsWith: month } } : undefined,
    orderBy: [{ date: "desc" }, { id: "desc" }],
    include: { adjuntos: { select: { id: true, name: true, mime: true, size: true }, orderBy: { id: "asc" } } },
  });
  return NextResponse.json({ notas });
}

/** Crea una nota. Body: { date, storeCode?, channel, note }.
 * Cualquier usuario con sesión puede crear notas (también el de solo lectura). */
export async function POST(req: NextRequest) {
  const sesion = await validarSesion(req.cookies.get(SESSION_COOKIE)?.value);
  if (!sesion) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  const body = (await req.json()) as { date?: string; storeCode?: string; channel?: string; note?: string };
  if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date) || !body.note?.trim()) {
    return NextResponse.json({ error: "Faltan datos (date, note)." }, { status: 400 });
  }
  const nota = await prisma.dayNote.create({
    data: {
      date: body.date,
      storeCode: body.storeCode ?? null,
      channel: body.channel ?? "otro",
      note: body.note.trim(),
      autor: sesion.name || sesion.email || null, // quién la escribió (la ven todos)
    },
  });
  return NextResponse.json({ ok: true, nota });
}

/** Edita el texto, marca resuelta / reabre o borra una nota.
 * Body: { id, action: "edit" | "resolve" | "reopen" | "delete", note? }
 * EDITOR+ puede todo; el rol de solo lectura solo puede EDITAR sus propias notas. */
export async function PATCH(req: NextRequest) {
  const sesion = await validarSesion(req.cookies.get(SESSION_COOKIE)?.value);
  if (!sesion) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  const body = (await req.json()) as { id?: number; action?: "edit" | "resolve" | "reopen" | "delete"; note?: string };
  if (!body.id || !body.action) return NextResponse.json({ error: "Faltan datos (id, action)." }, { status: 400 });
  const nota = await prisma.dayNote.findUnique({ where: { id: body.id }, select: { autor: true } });
  if (!nota) return NextResponse.json({ error: "La nota no existe." }, { status: 404 });
  const esMia = !!nota.autor && (nota.autor === sesion.name || nota.autor === sesion.email);
  if (NIVEL[sesion.rol] < NIVEL.EDITOR && !(body.action === "edit" && esMia)) {
    return NextResponse.json({ error: "Tu rol solo permite editar tus propias notas." }, { status: 403 });
  }
  if (body.action === "edit") {
    if (!body.note?.trim()) return NextResponse.json({ error: "La nota no puede quedar vacía." }, { status: 400 });
    await prisma.dayNote.update({ where: { id: body.id }, data: { note: body.note.trim() } });
  } else if (body.action === "delete") {
    await prisma.dayNote.delete({ where: { id: body.id } });
  } else {
    await prisma.dayNote.update({ where: { id: body.id }, data: { resolved: body.action === "resolve" } });
  }
  return NextResponse.json({ ok: true });
}
