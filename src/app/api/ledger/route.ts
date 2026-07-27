import { computeLedger } from "@/lib/ledger";

export const runtime = "nodejs";

/** Estado completo del libro acumulado: resultados, corte y meses */
export async function GET() {
  try {
    const status = await computeLedger();
    const adjustments = await import("@/lib/db").then(({ prisma }) =>
      prisma.adjustment.findMany(),
    );
    return Response.json({
      ...status,
      adjustments: adjustments.map((a) => ({
        resultId: a.resultId,
        salesDates: JSON.parse(a.salesDates),
        note: a.note,
      })),
    });
  } catch (err) {
    console.error("Error en /api/ledger:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Error calculando conciliación." },
      { status: 500 },
    );
  }
}
