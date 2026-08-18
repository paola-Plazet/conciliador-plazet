"use client";

// Cierre de mes: cuando un mes queda todo conciliado (o con sus diferencias
// aceptadas con nota) se cierra: se congela una foto de sus resultados y las
// cargas de archivos ya no lo tocan. Reabrir es solo para ADMIN.

import { useCallback, useEffect, useState } from "react";
import { Lock, LockOpen, CheckCircle2, AlertTriangle } from "lucide-react";
import { PageHeader, Card, StatusBadge } from "@/components/ui";
import { monthLabel } from "@/lib/client";
import type { ConciliationResult } from "@/lib/types";

const cop = (n: number) =>
  "$" + new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(Math.round(n));

interface MonthRow {
  month: string;
  closed: boolean;
  closedAt: string | null;
  closedBy: string | null;
  clean: boolean;
  totals: { cuadran: number; diferencias: number; sinConciliar: number; manuales: number; tardias: number };
}

export default function MesesPage() {
  const [months, setMonths] = useState<MonthRow[]>([]);
  const [rol, setRol] = useState<string>("VIEWER");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // mes expandido con sus pendientes por aceptar
  const [open, setOpen] = useState<string | null>(null);
  const [pending, setPending] = useState<ConciliationResult[]>([]);
  const [notas, setNotas] = useState<Record<string, string>>({});
  // confirmación en dos pasos (evita window.confirm)
  const [confirming, setConfirming] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const r = await fetch("/api/months");
    const d = await r.json();
    setMonths(d.months ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    cargar();
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.rol && setRol(d.rol))
      .catch(() => {});
  }, [cargar]);

  const cargarPendientes = useCallback(async (month: string) => {
    const r = await fetch(`/api/months?month=${month}`);
    const d = await r.json();
    setPending(d.pending ?? []);
  }, []);

  async function accion(month: string, action: "close" | "reopen") {
    setBusy(true);
    setError(null);
    const r = await fetch("/api/months", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month, action }),
    });
    const d = await r.json();
    if (!r.ok) setError(d.error ?? "No se pudo completar la acción.");
    setConfirming(null);
    setOpen(null);
    await cargar();
    setBusy(false);
  }

  async function aceptar(r: ConciliationResult) {
    setBusy(true);
    setError(null);
    const nota = notas[r.id]?.trim();
    const res = await fetch("/api/adjust", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resultId: r.id,
        salesDates: r.salesDates,
        note: nota || "Diferencia aceptada al cerrar el mes",
      }),
    });
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? "No se pudo aceptar la diferencia.");
    } else if (open) {
      await cargarPendientes(open);
      await cargar();
    }
    setBusy(false);
  }

  const puedeEditar = rol === "ADMIN" || rol === "EDITOR";

  return (
    <>
      <PageHeader
        title="Cierre de mes"
        subtitle="Un mes cerrado queda congelado: las cargas de archivos no lo tocan y sus resultados no cambian."
      />
      <div className="p-8 space-y-4 max-w-4xl">
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}
        {loading && <p className="text-sm text-gray-500">Calculando meses…</p>}

        {months.map((m) => {
          const abierto = open === m.month;
          const pendientes = m.totals.diferencias + m.totals.sinConciliar;
          return (
            <Card key={m.month} className="!p-0 overflow-hidden">
              <div className="flex items-center gap-4 px-5 py-4">
                {m.closed ? (
                  <Lock size={20} className="shrink-0 text-plazet-600" />
                ) : (
                  <LockOpen size={20} className="shrink-0 text-gray-400" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-plazet-950">{monthLabel(m.month)}</span>
                    {m.closed ? (
                      <span className="rounded-full bg-plazet-100 px-2.5 py-0.5 text-xs font-medium text-plazet-800">
                        Cerrado
                      </span>
                    ) : m.clean ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                        <CheckCircle2 size={12} /> Listo para cerrar
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                        <AlertTriangle size={12} /> {pendientes} pendiente{pendientes === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {m.totals.cuadran} cuadran · {m.totals.diferencias} diferencias ·{" "}
                    {m.totals.sinConciliar} sin conciliar · {m.totals.manuales} manuales
                    {m.closed && m.closedAt && (
                      <>
                        {" "}
                        — cerrado el {new Date(m.closedAt).toLocaleDateString("es-CO")}
                        {m.closedBy ? ` por ${m.closedBy}` : ""}
                      </>
                    )}
                  </p>
                </div>

                {/* Acciones */}
                {m.closed ? (
                  rol === "ADMIN" &&
                  (confirming === m.month ? (
                    <span className="flex items-center gap-2">
                      <button
                        disabled={busy}
                        onClick={() => accion(m.month, "reopen")}
                        className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                      >
                        Sí, reabrir
                      </button>
                      <button
                        onClick={() => setConfirming(null)}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                      >
                        Cancelar
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirming(m.month)}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                    >
                      Reabrir…
                    </button>
                  ))
                ) : puedeEditar && m.clean ? (
                  confirming === m.month ? (
                    <span className="flex items-center gap-2">
                      <button
                        disabled={busy}
                        onClick={() => accion(m.month, "close")}
                        className="rounded-lg bg-plazet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-plazet-700 disabled:opacity-50"
                      >
                        Sí, cerrar {monthLabel(m.month)}
                      </button>
                      <button
                        onClick={() => setConfirming(null)}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                      >
                        Cancelar
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirming(m.month)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-plazet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-plazet-700"
                    >
                      <Lock size={13} /> Cerrar mes
                    </button>
                  )
                ) : puedeEditar ? (
                  <button
                    onClick={() => {
                      if (abierto) {
                        setOpen(null);
                      } else {
                        setOpen(m.month);
                        setPending([]);
                        cargarPendientes(m.month);
                      }
                    }}
                    className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
                  >
                    {abierto ? "Ocultar pendientes" : "Revisar pendientes…"}
                  </button>
                ) : null}
              </div>

              {/* Pendientes por aceptar antes de poder cerrar */}
              {abierto && !m.closed && (
                <div className="border-t border-plazet-100 bg-plazet-50/40 px-5 py-4 space-y-3">
                  <p className="text-xs text-gray-600">
                    Para poder cerrar, cada diferencia debe quedar aceptada con una nota que
                    explique por qué se da por buena. Quedará marcada como ajuste manual.
                  </p>
                  {pending.length === 0 && (
                    <p className="text-sm text-gray-500">Cargando pendientes…</p>
                  )}
                  {pending.map((r) => (
                    <div
                      key={r.id}
                      className="rounded-lg border border-plazet-100 bg-white px-4 py-3"
                    >
                      <div className="flex items-center gap-2 flex-wrap text-sm">
                        <StatusBadge status={r.status} />
                        <span className="font-medium text-plazet-900">{r.storeName}</span>
                        <span className="text-gray-400">·</span>
                        <span className="text-gray-600">{r.channel}</span>
                        <span className="text-gray-400">·</span>
                        <span className="text-gray-600">dep {r.depositDate}</span>
                      </div>
                      <p className="mt-1 text-xs text-gray-600">
                        Recaudo {cop(r.depositAmount)} · venta {cop(r.salesAmount)} ·{" "}
                        <span
                          className={
                            r.difference < 0
                              ? "font-semibold text-rose-600"
                              : "font-semibold text-amber-600"
                          }
                        >
                          {r.difference < 0 ? "falta" : "sobra"} {cop(Math.abs(r.difference))}
                        </span>
                        {r.note ? ` — ${r.note}` : ""}
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Nota: por qué se acepta esta diferencia"
                          value={notas[r.id] ?? ""}
                          onChange={(e) => setNotas((n) => ({ ...n, [r.id]: e.target.value }))}
                          className="flex-1 rounded-lg border border-plazet-200 px-3 py-1.5 text-sm focus:border-plazet-500 focus:outline-none"
                        />
                        <button
                          disabled={busy || !(notas[r.id] ?? "").trim()}
                          onClick={() => aceptar(r)}
                          className="rounded-lg bg-plazet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-plazet-700 disabled:opacity-40"
                        >
                          Aceptar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}
