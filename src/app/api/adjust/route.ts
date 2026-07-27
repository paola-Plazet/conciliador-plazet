import { prisma } from "@/lib/db";
import { computeLedger } from "@/lib/ledger";

export const runtime = "nodejs";

/** Guarda/quita un ajuste manual persistente y devuelve el estado recalculado.
 * Body: { resultId, salesDates?, note?, remove? } */
export async function POST(req: Request) {
  const body = (await req.json()) as {
    resultId?: string;
    salesDates?: string[];
    note?: string;
    remove?: boolean;
  };
  if (!body.resultId) {
    return Response.json({ error: "Falta resultId." }, { status: 400 });
  }

  // un resultado de un mes cerrado no se ajusta
  const closed = await prisma.monthStatus.findMany({ where: { closed: true } });
  const { summary } = await computeLedger();
  const target = summary.results.find((r) => r.id === body.resultId);
  if (target?.month && closed.some((m) => m.month === target.month)) {
    return Response.json(
      { error: `El mes ${target.month} está cerrado. Reábrelo para ajustar.` },
      { status: 409 },
    );
  }

  if (body.remove) {
    await prisma.adjustment.deleteMany({ where: { resultId: body.resultId } });
  } else {
    await prisma.adjustment.upsert({
      where: { resultId: body.resultId },
      create: {
        resultId: body.resultId,
        salesDates: JSON.stringify(body.salesDates ?? []),
        note: body.note ?? "Ajuste manual",
      },
      update: {
        salesDates: JSON.stringify(body.salesDates ?? []),
        note: body.note ?? "Ajuste manual",
      },
    });
  }

  const status = await computeLedger();
  return Response.json({ ok: true, ...status });
}
