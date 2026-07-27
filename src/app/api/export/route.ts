import * as XLSX from "xlsx";
import { computeLedger } from "@/lib/ledger";
import { formatDate } from "@/lib/dates";

export const runtime = "nodejs";

const STATUS_LABEL: Record<string, string> = {
  CUADRA: "Cuadra",
  DIFERENCIA: "Diferencia",
  SIN_CONCILIAR: "Sin conciliar",
  MANUAL: "Ajuste manual",
};

/** Exporta la conciliación a Excel. ?month=YYYY-MM filtra un mes; sin
 * parámetro exporta todo el acumulado. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const month = url.searchParams.get("month");
  const { summary } = await computeLedger();

  const results = month
    ? summary.results.filter((r) => r.month === month)
    : summary.results;

  const detalle = results.map((r) => ({
    Mes: r.month ?? "",
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

  const pendientes = summary.pendings.map((p) => ({
    Tienda: p.storeName,
    "Días pendientes": p.days.map((d) => formatDate(d.date)).join(", "),
    "Total por consignar": Math.round(p.total),
  }));

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
    XLSX.utils.json_to_sheet(detalle.length ? detalle : [{ Aviso: "Sin registros" }]),
    "Conciliación",
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(pendientes.length ? pendientes : [{ Aviso: "Sin pendientes" }]),
    "Pendientes por consignar",
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(alertas.length ? alertas : [{ Aviso: "Sin alertas" }]),
    "Alertas",
  );

  const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const filename = `conciliacion-${month ?? "todo"}.xlsx`;

  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
