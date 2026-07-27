import { prisma } from "@/lib/db";
import type { ConciliationSummary } from "@/lib/engine";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: RouteContext<"/api/runs/[id]">) {
  const { id } = await ctx.params;
  const run = await prisma.run.findUnique({ where: { id: Number(id) } });
  if (!run) return Response.json({ error: "Corrida no encontrada" }, { status: 404 });

  let summary: ConciliationSummary | null = null;
  try {
    summary = JSON.parse(run.resultsJson);
  } catch {
    // ignore
  }

  return Response.json({
    id: run.id,
    createdAt: run.createdAt,
    label: run.label,
    periodStart: run.periodStart,
    periodEnd: run.periodEnd,
    summary,
    adjustments: JSON.parse(run.adjustmentsJson || "[]"),
  });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/runs/[id]">) {
  const { id } = await ctx.params;
  await prisma.run.delete({ where: { id: Number(id) } });
  return Response.json({ ok: true });
}
