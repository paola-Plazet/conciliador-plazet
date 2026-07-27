import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const holidays = await prisma.holiday.findMany({ orderBy: { date: "asc" } });
  return Response.json({ holidays });
}

/** Agrega un festivo. body: { date: 'YYYY-MM-DD', name: string } */
export async function POST(req: Request) {
  const body = (await req.json()) as { date: string; name: string };
  const date = String(body.date).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: "Fecha inválida (use YYYY-MM-DD)" }, { status: 400 });
  }
  const h = await prisma.holiday.upsert({
    where: { date },
    update: { name: body.name || "Festivo" },
    create: { date, name: body.name || "Festivo" },
  });
  return Response.json({ ok: true, holiday: h });
}

/** Elimina un festivo. body: { date } */
export async function DELETE(req: Request) {
  const body = (await req.json()) as { date: string };
  await prisma.holiday.deleteMany({ where: { date: String(body.date).trim() } });
  return Response.json({ ok: true });
}
