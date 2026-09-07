import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { validarSesion, SESSION_COOKIE } from "@/lib/sso";

export const runtime = "nodejs";

const NIVEL: Record<string, number> = { VIEWER: 0, EDITOR: 1, ADMIN: 2 };
const MAX_BYTES = 3 * 1024 * 1024; // el navegador ya la comprime (≤1600px JPEG)

/** Pega una imagen (foto del comprobante) a una nota existente.
 * Body: { noteId, name, mime, data } — data en base64. Una imagen por llamada.
 * Cualquier usuario con sesión puede hacerlo (también el de solo lectura). */
export async function POST(req: NextRequest) {
  const sesion = await validarSesion(req.cookies.get(SESSION_COOKIE)?.value);
  if (!sesion) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  const body = (await req.json()) as { noteId?: number; name?: string; mime?: string; data?: string };
  if (!body.noteId || !body.data || !body.mime?.startsWith("image/")) {
    return NextResponse.json({ error: "Faltan datos (noteId, mime image/*, data)." }, { status: 400 });
  }
  const bytes = Buffer.from(body.data, "base64");
  if (bytes.length === 0 || bytes.length > MAX_BYTES) {
    return NextResponse.json({ error: "La imagen está vacía o pesa más de 3 MB." }, { status: 413 });
  }
  const nota = await prisma.dayNote.findUnique({ where: { id: body.noteId }, select: { id: true } });
  if (!nota) return NextResponse.json({ error: "La nota no existe." }, { status: 404 });
  const adj = await prisma.noteAttachment.create({
    data: { noteId: nota.id, name: (body.name || "comprobante.jpg").slice(0, 120), mime: body.mime, size: bytes.length, data: bytes },
    select: { id: true, name: true, mime: true, size: true },
  });
  return NextResponse.json({ ok: true, adjunto: adj });
}

/** Borra una imagen. Body: { id } */
export async function DELETE(req: NextRequest) {
  const sesion = await validarSesion(req.cookies.get(SESSION_COOKIE)?.value);
  if (!sesion) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  if (NIVEL[sesion.rol] < NIVEL.EDITOR) {
    return NextResponse.json({ error: "Tu rol no permite borrar imágenes." }, { status: 403 });
  }
  const body = (await req.json()) as { id?: number };
  if (!body.id) return NextResponse.json({ error: "Falta id." }, { status: 400 });
  await prisma.noteAttachment.delete({ where: { id: body.id } });
  return NextResponse.json({ ok: true });
}
