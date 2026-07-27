"use client";

import { Download, FileSpreadsheet, Lock, LockOpen } from "lucide-react";
import { useLedger, monthLabel } from "@/lib/client";
import { PageHeader, Card } from "@/components/ui";
import { formatDate } from "@/lib/dates";

export default function ReportesPage() {
  const { data, loading, reload } = useLedger();
  const months = data?.months ?? [];

  async function toggle(month: string, closed: boolean) {
    const res = await fetch("/api/months", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month, action: closed ? "reopen" : "close" }),
    });
    if (!res.ok) {
      const json = await res.json();
      alert(json.error ?? "No se pudo cambiar el estado del mes");
      return;
    }
    reload();
  }

  return (
    <>
      <PageHeader
        title="Reportes"
        subtitle={
          data?.cut.sales
            ? `Datos al ${formatDate(data.cut.sales)} (ventas) · exportación a Excel por mes`
            : "Conciliación por mes y exportación a Excel"
        }
      >
        <a
          href="/api/export"
          className="flex items-center gap-1.5 rounded-lg border border-plazet-300 px-4 py-2 text-sm font-medium text-plazet-700 hover:bg-plazet-50"
        >
          <Download size={15} /> Exportar todo
        </a>
      </PageHeader>
      <div className="p-8">
        <Card className="p-0 overflow-x-auto">
          {loading ? (
            <div className="p-8 text-gray-400">Cargando…</div>
          ) : months.length === 0 ? (
            <div className="p-10 text-center text-gray-400">
              <FileSpreadsheet className="mx-auto mb-2" size={36} />
              No hay datos todavía.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-plazet-100 bg-plazet-50/50 text-left text-gray-600">
                  <th className="px-4 py-3">Mes</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3 text-center">Cuadran</th>
                  <th className="px-4 py-3 text-center">Diferencias</th>
                  <th className="px-4 py-3 text-center">Sin conciliar</th>
                  <th className="px-4 py-3 text-center">Tardías</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {months.map((m) => (
                  <tr key={m.month} className="border-b border-plazet-50">
                    <td className="px-4 py-3 font-medium text-plazet-900">
                      {monthLabel(m.month)}
                    </td>
                    <td className="px-4 py-3">
                      {m.closed ? (
                        <span className="flex w-fit items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                          <Lock size={11} /> Cerrado
                        </span>
                      ) : m.clean ? (
                        <span className="rounded-full bg-plazet-100 px-2.5 py-0.5 text-xs font-medium text-plazet-800">
                          Al día
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                          Con pendientes
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-plazet-600">
                      {m.totals.cuadran + m.totals.manuales}
                    </td>
                    <td className="px-4 py-3 text-center text-amber-600">{m.totals.diferencias}</td>
                    <td className="px-4 py-3 text-center text-rose-600">{m.totals.sinConciliar}</td>
                    <td className="px-4 py-3 text-center text-orange-600">{m.totals.tardias}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-3">
                        <a
                          href={`/api/export?month=${m.month}`}
                          className="flex items-center gap-1 text-plazet-600 hover:text-plazet-800"
                        >
                          <Download size={16} /> Excel
                        </a>
                        <button
                          onClick={() => toggle(m.month, m.closed)}
                          disabled={!m.closed && !m.clean}
                          title={
                            m.closed
                              ? "Reabrir mes"
                              : m.clean
                                ? "Cerrar mes"
                                : "Solo se cierra cuando todo esté cuadrado o ajustado"
                          }
                          className="flex items-center gap-1 text-gray-500 hover:text-gray-800 disabled:opacity-30"
                        >
                          {m.closed ? <LockOpen size={16} /> : <Lock size={16} />}
                          {m.closed ? "Reabrir" : "Cerrar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  );
}
