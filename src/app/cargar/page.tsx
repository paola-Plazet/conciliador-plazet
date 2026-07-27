"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileCheck2, AlertTriangle, Loader2 } from "lucide-react";
import { PageHeader, Card } from "@/components/ui";

const KIND_LABEL: Record<string, string> = {
  alegra: "Ventas Alegra (facturas)",
  alegra_trans: "Ventas Alegra (transacciones)",
  banco: "Banco efectivo",
  datafono: "Datáfono",
  datafono_banco: "Banco datáfono (QR)",
  unknown: "No reconocido",
};

interface ProcessResponse {
  detected: {
    name: string;
    kind: string;
    rows: number;
    skipped: number;
    from: string | null;
    to: string | null;
  }[];
  warnings: string[];
  totals: Record<string, number>;
  months: { month: string; closed: boolean; clean: boolean }[];
  counts: { sales: number; bank: number; datafono: number; qr: number };
  cut: { sales: string | null; bank: string | null; qr: string | null; datafono: string | null };
}

export default function CargarPage() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ProcessResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    setFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files)]);
  }, []);

  async function handleProcess() {
    if (files.length === 0) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      for (const f of files) fd.append("files", f);
      const res = await fetch("/api/process", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error procesando");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Cargar archivos"
        subtitle="Sube las ventas de Alegra, el extracto del banco y el reporte del datáfono"
      />
      <div className="p-8 space-y-6 max-w-4xl">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
            dragging ? "border-plazet-500 bg-plazet-50" : "border-plazet-200 bg-white"
          }`}
        >
          <Upload className="mx-auto text-plazet-400" size={40} />
          <p className="mt-3 font-medium text-plazet-900">
            Arrastra aquí tus archivos
          </p>
          <p className="text-sm text-gray-500">
            CSV de Alegra · XLS del banco · XLSX del datáfono (se detectan
            automáticamente)
          </p>
          <label className="mt-4 inline-block cursor-pointer rounded-lg bg-plazet-500 px-4 py-2 text-sm font-medium text-white hover:bg-plazet-600">
            Seleccionar archivos
            <input
              type="file"
              multiple
              className="hidden"
              onChange={(e) =>
                setFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])])
              }
            />
          </label>
        </div>

        {files.length > 0 && (
          <Card>
            <h3 className="font-semibold text-plazet-900">Archivos seleccionados</h3>
            <ul className="mt-3 space-y-2">
              {files.map((f, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between rounded-lg bg-plazet-50 px-3 py-2 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <FileCheck2 size={16} className="text-plazet-500" />
                    {f.name}
                  </span>
                  <button
                    onClick={() => setFiles(files.filter((_, j) => j !== i))}
                    className="text-rose-500 hover:underline"
                  >
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
            <button
              onClick={handleProcess}
              disabled={loading}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-plazet-600 px-5 py-2.5 font-medium text-white hover:bg-plazet-700 disabled:opacity-60"
            >
              {loading && <Loader2 size={18} className="animate-spin" />}
              {loading ? "Procesando…" : "Procesar y conciliar"}
            </button>
          </Card>
        )}

        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-rose-50 px-4 py-3 text-rose-700">
            <AlertTriangle size={18} /> {error}
          </div>
        )}

        {result && (
          <Card className="space-y-4">
            <h3 className="text-lg font-semibold text-plazet-900">
              Procesado correctamente
            </h3>
            <div className="flex flex-wrap gap-2 text-sm">
              {result.detected.map((d, i) => (
                <span
                  key={i}
                  className="rounded-full bg-plazet-100 px-3 py-1 text-plazet-800"
                >
                  {d.name} → {KIND_LABEL[d.kind] ?? d.kind}
                  {d.from && (
                    <span className="text-plazet-600">
                      {" "}({d.from} a {d.to}, {d.rows} filas
                      {d.skipped > 0 ? `, ${d.skipped} omitidas por mes cerrado` : ""})
                    </span>
                  )}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-4 gap-3 text-center">
              <Stat label="Ventas" value={result.counts.sales} />
              <Stat label="Mov. banco" value={result.counts.bank} />
              <Stat label="Tx datáfono" value={result.counts.datafono} />
              <Stat label="Pagos QR" value={result.counts.qr} />
            </div>
            <div className="grid grid-cols-4 gap-3 text-center">
              <Stat label="Cuadran" value={result.totals.cuadran} tone="good" />
              <Stat label="Diferencias" value={result.totals.diferencias} tone="warn" />
              <Stat label="Sin conciliar" value={result.totals.sinConciliar} tone="bad" />
              <Stat label="Tardías" value={result.totals.tardias} tone="warn" />
            </div>

            {result.warnings.length > 0 && (
              <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                <div className="font-medium">Avisos:</div>
                <ul className="ml-4 list-disc">
                  {result.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rounded-lg bg-sky-50 p-3 text-sm text-sky-800">
              La carga se acumuló al histórico: cada archivo reemplaza el rango
              de fechas que cubre. Si hay referencias de efectivo sin asignar,
              revísalas en{" "}
              <a href="/configuracion" className="font-medium underline">
                Configuración
              </a>
              .
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => router.push("/conciliacion")}
                className="rounded-lg bg-plazet-600 px-5 py-2.5 font-medium text-white hover:bg-plazet-700"
              >
                Ver conciliación
              </button>
              <button
                onClick={() => router.push("/")}
                className="rounded-lg border border-plazet-300 px-5 py-2.5 font-medium text-plazet-700 hover:bg-plazet-50"
              >
                Ir al tablero
              </button>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const tones = {
    default: "text-plazet-900",
    good: "text-plazet-600",
    warn: "text-amber-600",
    bad: "text-rose-600",
  };
  return (
    <div className="rounded-lg border border-plazet-100 bg-plazet-50/40 py-3">
      <div className={`text-2xl font-bold ${tones[tone]}`}>{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}
