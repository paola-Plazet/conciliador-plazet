"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, Clock, Lock, PiggyBank, TrendingUp, Upload } from "lucide-react";
import { useLedger, monthLabel } from "@/lib/client";
import { PageHeader, Card, StatCard } from "@/components/ui";
import { formatCOP } from "@/lib/money";
import { formatDate } from "@/lib/dates";

export default function DashboardPage() {
  const { data, loading } = useLedger();
  const [month, setMonth] = useState<string | null>(null);

  const months = data?.months ?? [];
  const selected = month ?? months[0]?.month ?? null;
  const monthInfo = months.find((m) => m.month === selected) ?? null;

  const results = useMemo(
    () => (data?.summary.results ?? []).filter((r) => !selected || r.month === selected),
    [data, selected],
  );

  const byStore = useMemo(() => {
    const map = new Map<
      string,
      { name: string; cuadran: number; dif: number; sin: number; tardias: number; difMonto: number }
    >();
    for (const r of results) {
      const key = r.storeName;
      if (!map.has(key))
        map.set(key, { name: key, cuadran: 0, dif: 0, sin: 0, tardias: 0, difMonto: 0 });
      const s = map.get(key)!;
      if (r.status === "CUADRA" || r.status === "MANUAL") s.cuadran++;
      else if (r.status === "DIFERENCIA") {
        s.dif++;
        s.difMonto += Math.abs(r.difference);
      } else if (r.status === "SIN_CONCILIAR") s.sin++;
      if (r.late) s.tardias++;
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [results]);

  // pendientes por consignar del mes seleccionado (días de ese mes)
  const pendings = useMemo(() => {
    if (!data) return [];
    return data.summary.pendings
      .map((p) => {
        const days = selected ? p.days.filter((d) => d.date.startsWith(selected)) : p.days;
        return { ...p, days, total: days.reduce((a, d) => a + d.amount, 0) };
      })
      .filter((p) => p.days.length > 0);
  }, [data, selected]);

  if (loading) {
    return (
      <>
        <PageHeader title="Tablero" />
        <div className="p-8 text-gray-500">Cargando…</div>
      </>
    );
  }

  if (!data || data.summary.results.length === 0) {
    return (
      <>
        <PageHeader title="Tablero" subtitle="Conciliación de efectivo, datáfono y QR" />
        <div className="p-8">
          <Card className="text-center py-12">
            <Upload className="mx-auto text-plazet-300" size={48} />
            <p className="mt-4 text-lg font-medium text-plazet-900">
              Aún no has procesado archivos
            </p>
            <p className="text-gray-500">
              Empieza cargando las ventas, el extracto del banco y el datáfono.
            </p>
            <Link
              href="/cargar"
              className="mt-5 inline-block rounded-lg bg-plazet-600 px-5 py-2.5 font-medium text-white hover:bg-plazet-700"
            >
              Cargar archivos
            </Link>
          </Card>
        </div>
      </>
    );
  }

  const t = monthInfo?.totals ?? { cuadran: 0, diferencias: 0, sinConciliar: 0, manuales: 0, tardias: 0 };
  const alerts = data.summary.alerts;
  const cut = data.cut;

  return (
    <>
      <PageHeader title="Tablero" subtitle="Conciliación continua por mes">
        <div className="flex items-center gap-3">
          <select
            value={selected ?? ""}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-lg border border-plazet-200 bg-white px-3 py-2 text-sm"
          >
            {months.map((m) => (
              <option key={m.month} value={m.month}>
                {monthLabel(m.month)} {m.closed ? "· Cerrado" : ""}
              </option>
            ))}
          </select>
          <Link
            href="/cargar"
            className="rounded-lg bg-plazet-600 px-4 py-2 text-sm font-medium text-white hover:bg-plazet-700"
          >
            Nueva carga
          </Link>
        </div>
      </PageHeader>

      <div className="space-y-6 p-8">
        {/* Estado del mes + corte de datos */}
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {monthInfo?.closed ? (
              <span className="flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700">
                <Lock size={14} /> Mes cerrado
              </span>
            ) : monthInfo?.clean ? (
              <span className="rounded-full bg-plazet-100 px-3 py-1 text-sm font-medium text-plazet-800">
                Al día — listo para cerrar
              </span>
            ) : (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-800">
                Con pendientes por ajustar
              </span>
            )}
            <span className="text-sm text-gray-500">{selected ? monthLabel(selected) : ""}</span>
          </div>
          <div className="text-xs text-gray-500">
            Datos al: ventas {cut.sales ? formatDate(cut.sales) : "—"} · banco{" "}
            {cut.bank ? formatDate(cut.bank) : "—"} · QR {cut.qr ? formatDate(cut.qr) : "—"} ·
            datáfono {cut.datafono ? formatDate(cut.datafono) : "—"}
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Cuadran" value={t.cuadran + t.manuales} tone="good" />
          <StatCard label="Diferencias" value={t.diferencias} tone="warn" />
          <StatCard label="Sin conciliar" value={t.sinConciliar} tone="bad" />
          <StatCard label="Consignaciones tardías" value={t.tardias} tone="warn" />
        </div>

        {/* Pendientes por consignar */}
        {pendings.length > 0 && (
          <Card className="border-sky-200 bg-sky-50/50">
            <div className="flex items-center gap-2 font-semibold text-sky-900">
              <PiggyBank size={18} /> Pendiente por consignar (ventas en efectivo sin depósito)
            </div>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="py-1.5">Tienda</th>
                  <th className="py-1.5">Días pendientes</th>
                  <th className="py-1.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {pendings.map((p) => (
                  <tr key={p.storeName} className="border-t border-sky-100">
                    <td className="py-2 font-medium text-sky-900">{p.storeName}</td>
                    <td className="py-2 text-xs text-gray-600">
                      {p.days.map((d) => formatDate(d.date)).join(", ")}
                    </td>
                    <td className="py-2 text-right font-medium tabular-nums">
                      {formatCOP(p.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        {alerts.some((a) => a.recurrent) && (
          <Card className="border-orange-200 bg-orange-50">
            <div className="flex items-center gap-2 font-semibold text-orange-800">
              <AlertTriangle size={18} />
              Alertas de consignación tardía recurrente
            </div>
            <ul className="mt-3 space-y-2">
              {alerts
                .filter((a) => a.recurrent)
                .map((a) => (
                  <li
                    key={a.storeCode ?? a.storeName}
                    className="flex items-center gap-2 text-sm text-orange-900"
                  >
                    <Clock size={15} />
                    <span className="font-medium">{a.storeName}</span> consigna tarde el{" "}
                    {Math.round(a.latePct * 100)}% de las veces ({a.lateCount} de {a.totalCount}),
                    hasta {a.maxDaysLate} días hábiles de atraso.
                  </li>
                ))}
            </ul>
          </Card>
        )}

        <Card>
          <div className="mb-3 flex items-center gap-2 font-semibold text-plazet-900">
            <TrendingUp size={18} /> Estado por tienda — {selected ? monthLabel(selected) : ""}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-plazet-100 text-left text-gray-500">
                  <th className="py-2">Tienda</th>
                  <th className="py-2 text-center">Cuadran</th>
                  <th className="py-2 text-center">Diferencias</th>
                  <th className="py-2 text-center">Sin conciliar</th>
                  <th className="py-2 text-center">Tardías</th>
                  <th className="py-2 text-right">Monto en diferencia</th>
                </tr>
              </thead>
              <tbody>
                {byStore.map((s) => (
                  <tr key={s.name} className="border-b border-plazet-50">
                    <td className="py-2 font-medium text-plazet-900">{s.name}</td>
                    <td className="py-2 text-center text-plazet-600">{s.cuadran}</td>
                    <td className="py-2 text-center text-amber-600">{s.dif}</td>
                    <td className="py-2 text-center text-rose-600">{s.sin}</td>
                    <td className="py-2 text-center text-orange-600">{s.tardias}</td>
                    <td className="py-2 text-right font-medium">
                      {s.difMonto > 0 ? formatCOP(s.difMonto) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 text-right">
            <Link
              href="/conciliacion"
              className="text-sm font-medium text-plazet-600 hover:underline"
            >
              Ver detalle de conciliación →
            </Link>
          </div>
        </Card>
      </div>
    </>
  );
}
