"use client";

import { useMemo, useState } from "react";
import { Lock, LockOpen, Pencil, X } from "lucide-react";
import { useLedger, monthLabel, type LedgerData } from "@/lib/client";
import { PageHeader, Card, StatusBadge, LateBadge } from "@/components/ui";
import { formatCOP } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import type { Channel, ConciliationStatus, ConciliationResult } from "@/lib/types";

export default function ConciliacionPage() {
  const { data, loading, setData, reload } = useLedger();
  const [month, setMonth] = useState<string | null>(null);
  const [channel, setChannel] = useState<Channel | "TODOS">("TODOS");
  const [status, setStatus] = useState<ConciliationStatus | "TODOS">("TODOS");
  const [store, setStore] = useState<string>("TODOS");
  const [editing, setEditing] = useState<ConciliationResult | null>(null);
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);

  const months = data?.months ?? [];
  const selected = month ?? months[0]?.month ?? null;
  const monthInfo = months.find((m) => m.month === selected) ?? null;

  const results = useMemo(
    () => (data?.summary.results ?? []).filter((r) => !selected || r.month === selected),
    [data, selected],
  );

  const stores = useMemo(
    () => [...new Set(results.map((r) => r.storeName))].sort(),
    [results],
  );

  const filtered = useMemo(
    () =>
      results.filter(
        (r) =>
          (channel === "TODOS" || r.channel === channel) &&
          (status === "TODOS" || r.status === status) &&
          (store === "TODOS" || r.storeName === store),
      ),
    [results, channel, status, store],
  );

  async function saveAdjustment(resultId: string, salesDates: string[], note: string) {
    const res = await fetch(`/api/adjust`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resultId, salesDates, note }),
    });
    const json = await res.json();
    if (res.ok) {
      setData(json as LedgerData & { ok: boolean });
      setEditing(null);
    } else {
      alert(json.error ?? "No se pudo guardar el ajuste");
    }
  }

  async function toggleClose() {
    if (!selected) return;
    setClosing(true);
    setCloseError(null);
    const res = await fetch("/api/months", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        month: selected,
        action: monthInfo?.closed ? "reopen" : "close",
      }),
    });
    const json = await res.json();
    setClosing(false);
    if (!res.ok) {
      setCloseError(json.error ?? "No se pudo cambiar el estado del mes");
      return;
    }
    reload();
  }

  if (loading)
    return (
      <>
        <PageHeader title="Conciliación" />
        <div className="p-8 text-gray-500">Cargando…</div>
      </>
    );

  if (!data || data.summary.results.length === 0)
    return (
      <>
        <PageHeader title="Conciliación" />
        <div className="p-8 text-gray-500">
          No hay datos. Carga archivos primero.
        </div>
      </>
    );

  return (
    <>
      <PageHeader
        title="Conciliación"
        subtitle={`${filtered.length} de ${results.length} registros · ${selected ? monthLabel(selected) : ""}${monthInfo?.closed ? " · CERRADO" : ""}`}
      >
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
          <button
            onClick={toggleClose}
            disabled={closing || (!monthInfo?.closed && !monthInfo?.clean)}
            title={
              monthInfo?.closed
                ? "Reabrir el mes para poder modificarlo"
                : monthInfo?.clean
                  ? "Cerrar el mes (queda protegido)"
                  : "Solo se puede cerrar cuando todo esté cuadrado o ajustado"
            }
            className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium ${
              monthInfo?.closed
                ? "border border-gray-300 text-gray-700 hover:bg-gray-50"
                : "bg-plazet-600 text-white hover:bg-plazet-700 disabled:opacity-40"
            }`}
          >
            {monthInfo?.closed ? <LockOpen size={15} /> : <Lock size={15} />}
            {monthInfo?.closed ? "Reabrir mes" : "Cerrar mes"}
          </button>
        </div>
      </PageHeader>
      <div className="space-y-4 p-8">
        {closeError && (
          <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {closeError}
          </div>
        )}
        <Card className="flex flex-wrap gap-4">
          <Filter label="Canal" value={channel} onChange={(v) => setChannel(v as Channel | "TODOS")} options={[["TODOS", "Todos"], ["EFECTIVO", "Efectivo"], ["DATAFONO", "Datáfono"], ["QR", "QR"]]} />
          <Filter label="Estado" value={status} onChange={(v) => setStatus(v as ConciliationStatus | "TODOS")} options={[["TODOS", "Todos"], ["CUADRA", "Cuadran"], ["DIFERENCIA", "Diferencias"], ["SIN_CONCILIAR", "Sin conciliar"], ["MANUAL", "Manual"]]} />
          <Filter label="Tienda" value={store} onChange={setStore} options={[["TODOS", "Todas"], ...stores.map((s) => [s, s] as [string, string])]} />
        </Card>

        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-plazet-100 bg-plazet-50/50 text-left text-gray-600">
                <th className="px-4 py-3">Canal</th>
                <th className="px-4 py-3">Tienda</th>
                <th className="px-4 py-3">Fecha depósito</th>
                <th className="px-4 py-3 text-right">Depósito</th>
                <th className="px-4 py-3">Días de venta</th>
                <th className="px-4 py-3 text-right">Ventas</th>
                <th className="px-4 py-3 text-right">Diferencia</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-plazet-50 hover:bg-plazet-50/30">
                  <td className="px-4 py-2.5 text-gray-500">
                    {r.channel === "EFECTIVO" ? "Efectivo" : r.channel === "QR" ? "QR" : "Datáfono"}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-plazet-900">{r.storeName}</td>
                  <td className="px-4 py-2.5">{formatDate(r.depositDate)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatCOP(r.depositAmount)}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">
                    {r.salesDates.map(formatDate).join(", ") || "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatCOP(r.salesAmount)}</td>
                  <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${Math.abs(r.difference) <= 500 ? "text-gray-400" : r.difference < 0 ? "text-rose-600" : "text-amber-600"}`}>
                    {formatCOP(r.difference)}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <StatusBadge status={r.status} />
                      {r.late && <LateBadge days={r.daysLate ?? 0} />}
                      {r.qrAlert && (
                        <span
                          className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700"
                          title="El faltante de efectivo aparece como pago QR en la cuenta del datáfono"
                        >
                          ¿QR?
                        </span>
                      )}
                    </div>
                    {r.note && <div className="mt-0.5 text-xs text-gray-400">{r.note}</div>}
                  </td>
                  <td className="px-4 py-2.5">
                    {r.channel === "EFECTIVO" && !monthInfo?.closed && (
                      <button
                        onClick={() => setEditing(r)}
                        className="text-plazet-600 hover:text-plazet-800"
                        title="Ajuste manual"
                      >
                        <Pencil size={15} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="p-8 text-center text-gray-400">Sin registros con esos filtros</div>
          )}
        </Card>
      </div>

      {editing && (
        <AdjustModal
          result={editing}
          onClose={() => setEditing(null)}
          onSave={saveAdjustment}
        />
      )}
    </>
  );
}

function Filter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="text-sm">
      <span className="mr-2 text-gray-500">{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-plazet-200 bg-white px-3 py-1.5"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

function AdjustModal({
  result,
  onClose,
  onSave,
}: {
  result: ConciliationResult;
  onClose: () => void;
  onSave: (id: string, dates: string[], note: string) => void;
}) {
  const [dates, setDates] = useState(result.salesDates.join(", "));
  const [note, setNote] = useState(result.note ?? "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-plazet-900">Ajuste manual</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>
        <p className="mb-4 text-sm text-gray-500">
          {result.storeName} · depósito {formatDate(result.depositDate)} por{" "}
          {formatCOP(result.depositAmount)}.
        </p>
        <label className="block text-sm font-medium text-gray-700">
          Días de venta a asignar (YYYY-MM-DD, separados por coma)
          <input
            value={dates}
            onChange={(e) => setDates(e.target.value)}
            placeholder="2026-06-05, 2026-06-06, 2026-06-07"
            className="mt-1 w-full rounded-lg border border-plazet-200 px-3 py-2"
          />
        </label>
        <label className="mt-3 block text-sm font-medium text-gray-700">
          Nota
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="mt-1 w-full rounded-lg border border-plazet-200 px-3 py-2"
          />
        </label>
        <div className="mt-5 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm">
            Cancelar
          </button>
          <button
            onClick={() =>
              onSave(
                result.id,
                dates.split(",").map((d) => d.trim()).filter(Boolean),
                note || "Ajuste manual",
              )
            }
            className="rounded-lg bg-plazet-600 px-4 py-2 text-sm font-medium text-white hover:bg-plazet-700"
          >
            Guardar y recalcular
          </button>
        </div>
      </div>
    </div>
  );
}
