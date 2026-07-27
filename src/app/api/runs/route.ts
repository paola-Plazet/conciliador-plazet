import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const runs = await prisma.run.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      createdAt: true,
      label: true,
      periodStart: true,
      periodEnd: true,
      resultsJson: true,
    },
  });

  const list = runs.map((r) => {
    let totals = null;
    try {
      totals = JSON.parse(r.resultsJson).totals ?? null;
    } catch {
      // ignore
    }
    return {
      id: r.id,
      createdAt: r.createdAt,
      label: r.label,
      periodStart: r.periodStart,
      periodEnd: r.periodEnd,
      totals,
    };
  });

  return Response.json({ runs: list });
}
