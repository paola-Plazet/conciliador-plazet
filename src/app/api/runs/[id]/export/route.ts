import * as XLSX from "xlsx";
import { prisma } from "@/lib/db";
import type { ConciliationSummary } from "@/lib/engine";
import { formatDate } from "@/lib/dates";

export const runtime = "nodejs";

const STATUS_LABEL: Record<string, string> = {
  CUADRA: "Cuadra",
  DIFERENCIA: "Diferencia",
  SIN_CONCILIAR: "Sin conciliar",
  MANUAL: "Ajuste manual",
};

export async function GET(_req: Request, ctx: RouteContext<"/api/runs/[id]">) {
  const { id } = await ctx.params;
  const run = await prisma.run.findUnique({ where: { id: Number(id) } });
  if (!run) return Response.json({ error: "No encontrada" }, { status: 404 });

  const summary: ConciliationSummary = JSON.parse(run.resultsJson);

  // Hoja 1: detalle de conciliación
  const detalle = summary.results.map((r) => ({
    Canal: r.channel,
    Tienda: r.storeName,
    "Fecha depósito": formatDate(r.depositDate),
    "Monto depósito": Math.round(r.depositAmount),
    "Días de venta": r.salesDates.map(formatDate).join(", "),
    "Monto ventas": Math.round(r.salesAmount),
    Diferencia: Math.round(r.difference),
    Estado: STATUS_LABEL[r.status] ?? r.status,
    "Fecha esperada": r.expectedDate ? formatDate(r.expectedDate) : "",
    "Días atraso": r.daysLate ?? "",
    Nota: r.note ?? "",
  }));

  // Hoja 2: alertas por tienda
  const alertas = summary.alerts.map((a) => ({
    Tienda: a.storeName,
    Canal: a.channel,
    "Consignaciones tardías": a.lateCount,
    "Total conciliadas": a.totalCount,
    "% tardías": Math.round(a.latePct * 100) + "%",
    "Máx. días atraso": a.maxDaysLate,
    "Prom. días atraso": a.avgDaysLate.toFixed(1),
    Reincidente: a.recurrent ? "SÍ" : "No",
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(detalle),
    "Conciliación",
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(alertas.length ? alertas : [{ Aviso: "Sin alertas" }]),
    "Alertas",
  );

  const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const filename = `conciliacion-${run.periodStart ?? "run"}-${run.id}.xlsx`;

  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
