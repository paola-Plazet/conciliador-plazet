import { prisma } from "@/lib/db";
import { computeLedger } from "@/lib/ledger";

export const runtime = "nodejs";

/** Lista de meses con su estado */
export async function GET() {
  const { months, cut } = await computeLedger();
  return Response.json({ months, cut });
}

/** Cierra o reabre un mes. Body: { month: "YYYY-MM", action: "close" | "reopen", force?: boolean } */
export async function POST(req: Request) {
  const body = (await req.json()) as {
    month?: string;
    action?: "close" | "reopen";
    force?: boolean;
  };
  const month = body.month ?? "";
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return Response.json({ error: "Mes inválido (formato YYYY-MM)." }, { status: 400 });
  }

  if (body.action === "reopen") {
    await prisma.monthStatus.upsert({
      where: { month },
      create: { month, closed: false },
      update: { closed: false, closedAt: null },
    });
    return Response.json({ ok: true, month, closed: false });
  }

  // cerrar: validar que el mes esté limpio (todo CUADRA o MANUAL)
  const { months } = await computeLedger();
  const m = months.find((x) => x.month === month);
  if (!m) {
    return Response.json({ error: `No hay datos del mes ${month}.` }, { status: 404 });
  }
  if (!m.clean && !body.force) {
    return Response.json(
      {
        error: `El mes ${month} aún tiene ${m.totals.diferencias} diferencia(s) y ${m.totals.sinConciliar} sin conciliar. Ajústalas o usa "force" para cerrar de todas formas.`,
        totals: m.totals,
      },
      { status: 409 },
    );
  }

  await prisma.monthStatus.upsert({
    where: { month },
    create: { month, closed: true, closedAt: new Date() },
    update: { closed: true, closedAt: new Date() },
  });
  return Response.json({ ok: true, month, closed: true });
}
