import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { validarSesion, SESSION_COOKIE } from "@/lib/sso";

export const runtime = "nodejs";

const NIVEL: Record<string, number> = { VIEWER: 0, EDITOR: 1, ADMIN: 2 };

async function editor(req: NextRequest) {
  const sesion = await validarSesion(req.cookies.get(SESSION_COOKIE)?.value);
  if (!sesion) return { error: NextResponse.json({ error: "Sesión requerida." }, { status: 401 }) };
  if (NIVEL[sesion.rol] < NIVEL.EDITOR) return { error: NextResponse.json({ error: "Tu rol no permite vincular cobros." }, { status: 403 }) };
  return { sesion };
}

/** Vincula a mano una o varias facturas de PRINCIPAL con un cobro de MP. */
export async function POST(req: NextRequest) {
  const { sesion, error } = await editor(req);
  if (error) return error;
  const body = (await req.json()) as { invoices?: string[]; opId?: string; nota?: string };
  if (!body.opId || !body.invoices?.length) return NextResponse.json({ error: "Faltan datos (invoices, opId)." }, { status: 400 });
  const nota = body.nota || `Vinculado por ${sesion!.email ?? "usuario"}`;
  for (const invoice of body.invoices) {
    await prisma.principalVinculo.upsert({
      where: { invoice_opId: { invoice, opId: body.opId } },
      create: { invoice, opId: body.opId, nota },
      update: { nota },
    });
  }
  return NextResponse.json({ ok: true });
}

/** Deshace el vínculo manual de una factura. */
export async function DELETE(req: NextRequest) {
  const { error } = await editor(req);
  if (error) return error;
  const body = (await req.json()) as { invoice?: string };
  if (!body.invoice) return NextResponse.json({ error: "Falta invoice." }, { status: 400 });
  await prisma.principalVinculo.deleteMany({ where: { invoice: body.invoice } });
  return NextResponse.json({ ok: true });
}
