"use client";

import { useEffect, useState, useCallback } from "react";
import type { ConciliationSummary } from "./engine";

export interface MonthRow {
  month: string; // YYYY-MM
  closed: boolean;
  totals: {
    cuadran: number;
    diferencias: number;
    sinConciliar: number;
    manuales: number;
    tardias: number;
  };
  clean: boolean;
}

export interface LedgerData {
  summary: ConciliationSummary;
  cut: {
    sales: string | null;
    bank: string | null;
    qr: string | null;
    datafono: string | null;
  };
  months: MonthRow[];
  adjustments: { resultId: string; salesDates: string[]; note: string }[];
}

/** Carga el estado del libro acumulado (conciliación continua por mes) */
export function useLedger() {
  const [data, setData] = useState<LedgerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ledger");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error cargando datos");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error cargando datos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, loading, error, reload, setData };
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** "2026-07" -> "Julio 2026" */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  const name = MESES[Number(m) - 1] ?? month;
  return name.charAt(0).toUpperCase() + name.slice(1) + " " + y;
}
