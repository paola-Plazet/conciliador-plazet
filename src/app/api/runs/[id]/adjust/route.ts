import { prisma } from "@/lib/db";
import { recompute } from "@/lib/process";
import type {
  SaleInvoice,
  BankCashEntry,
  DataphoneEntry,
  QrBankEntry,
  ManualAdjustment,
} from "@/lib/types";

export const runtime = "nodejs";

/** Guarda/actualiza un ajuste manual y recalcula la corrida */
export async function POST(req: Request, ctx: RouteContext<"/api/runs/[id]">) {
  const { id } = await ctx.params;
  const runId = Number(id);
  const run = await prisma.run.findUnique({ where: { id: runId } });
  if (!run) return Response.json({ error: "Corrida no encontrada" }, { status: 404 });

  const body = (await req.json()) as {
    resultId: string;
    salesDates?: string[];
    note?: string;
    remove?: boolean;
  };

  const adjustments: ManualAdjustment[] = JSON.parse(run.adjustmentsJson || "[]");
  const without = adjustments.filter((a) => a.resultId !== body.resultId);
  if (!body.remove) {
    without.push({
      resultId: body.resultId,
      salesDates: body.salesDates ?? [],
      note: body.note ?? "Ajuste manual",
    });
  }

  const sales: SaleInvoice[] = JSON.parse(run.salesJson);
  const bank: BankCashEntry[] = JSON.parse(run.bankJson);
  const datafono: DataphoneEntry[] = JSON.parse(run.dataphoneJson);
  const qrBank: QrBankEntry[] = JSON.parse(run.qrBankJson || "[]");

  const summary = await recompute(sales, bank, datafono, qrBank, without);

  await prisma.run.update({
    where: { id: runId },
    data: {
      adjustmentsJson: JSON.stringify(without),
      resultsJson: JSON.stringify(summary),
    },
  });

  return Response.json({ ok: true, summary, adjustments: without });
}
