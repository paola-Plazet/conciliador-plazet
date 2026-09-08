"use client";

import { useEffect, useState } from "react";
import { PageHeader, Card } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { monthLabel } from "@/lib/client";

const cop = (n: number) => new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(Math.round(n));

type Totales = { venta: number; recaudo: number; falta: number; sobra: number; neto: number };
interface ApiData {
  cut: { sales: string | null; bank: string | null; qr: string | null; datafono: string | null };
  porMetodo: { efectivo: Totales; datafono: Totales; qr: Totales; mercadopago: Totales };
  otrosVenta: { plataforma: string; venta: number }[];
  porMes: (Totales & { mes: string })[];
  porTienda: (Totales & { code: string; name: string })[];
}

function estadoDe(neto: number): "cuadra" | "falta" | "sobra" {
  if (Math.abs(neto) < 500) return "cuadra";
  return neto > 0 ? "falta" : "sobra";
}
function netoColor(neto: number): string {
  return { cuadra: "text-plazet-700", falta: "text-red-600 font-semibold", sobra: "text-amber-600 font-semibold" }[
    estadoDe(neto)
  ];
}
function netoTexto(neto: number): string {
  const e = estadoDe(neto);
  return e === "cuadra" ? "cuadra" : `${e} ${cop(Math.abs(neto))}`;
}

function FilaMetodo({ label, t }: { label: string; t: Totales }) {
  return (
    <tr className="border-b border-plazet-50">
      <td className="px-4 py-2.5 font-medium text-plazet-900">{label}</td>
      <td className="px-4 py-2.5 text-right">{cop(t.venta)}</td>
      <td className="px-4 py-2.5 text-right">{cop(t.recaudo)}</td>
      <td className="px-4 py-2.5 text-right text-red-600">{t.falta ? cop(t.falta) : "—"}</td>
      <td className="px-4 py-2.5 text-right text-amber-600">{t.sobra ? cop(t.sobra) : "—"}</td>
      <td className={`px-4 py-2.5 text-right ${netoColor(t.neto)}`}>{netoTexto(t.neto)}</td>
    </tr>
  );
}

export default function ResumenPage() {
  const [api, setApi] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/resumen")
      .then((r) => r.json())
      .then(setApi)
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <PageHeader
        title="Resumen general"
        subtitle={
          api?.cut.sales
            ? `Totalizado de todo el histórico cargado, al ${formatDate(api.cut.sales)}`
            : "Cuánto falta o sobra, por método de pago, por mes y por tienda"
        }
      />
      <div className="p-8 space-y-6">
        {loading || !api ? (
          <Card>
            <div className="p-8 text-gray-400">Cargando…</div>
          </Card>
        ) : (
          <>
            <Card className="p-0 overflow-x-auto">
              <div className="px-5 pt-4 pb-1 text-sm font-semibold text-plazet-900">Por método de pago</div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-plazet-100 bg-plazet-50/50 text-left text-gray-600">
                    <th className="px-4 py-2.5">Método</th>
                    <th className="px-4 py-2.5 text-right">Venta</th>
                    <th className="px-4 py-2.5 text-right">Recaudo</th>
                    <th className="px-4 py-2.5 text-right">Falta total</th>
                    <th className="px-4 py-2.5 text-right">Sobra total</th>
                    <th className="px-4 py-2.5 text-right">Neto</th>
                  </tr>
                </thead>
                <tbody>
                  <FilaMetodo label="Efectivo" t={api.porMetodo.efectivo} />
                  <FilaMetodo label="Datáfono (tarjetas)" t={api.porMetodo.datafono} />
                  <FilaMetodo label="QR" t={api.porMetodo.qr} />
                  <FilaMetodo label="Mercado Pago" t={api.porMetodo.mercadopago} />
                </tbody>
              </table>
              {api.otrosVenta.length > 0 && (
                <div className="px-5 py-3 text-xs text-gray-500 border-t border-plazet-50">
                  Sin archivo de recaudo cargado en la app (Rappi y Addi los recauda Natural Light, por ahora; se concilian aparte):{" "}
                  {api.otrosVenta.map((o) => `${o.plataforma} ${cop(o.venta)}`).join(" · ")}
                </div>
              )}
            </Card>

            <Card className="p-0 overflow-x-auto">
              <div className="px-5 pt-4 pb-1 text-sm font-semibold text-plazet-900">
                Resumen general de la empresa — por mes
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-plazet-100 bg-plazet-50/50 text-left text-gray-600">
                    <th className="px-4 py-2.5">Mes</th>
                    <th className="px-4 py-2.5 text-right">Venta</th>
                    <th className="px-4 py-2.5 text-right">Recaudo</th>
                    <th className="px-4 py-2.5 text-right">Falta total</th>
                    <th className="px-4 py-2.5 text-right">Sobra total</th>
                    <th className="px-4 py-2.5 text-right">Neto</th>
                  </tr>
                </thead>
                <tbody>
                  {api.porMes.map((m) => (
                    <tr key={m.mes} className="border-b border-plazet-50">
                      <td className="px-4 py-2.5 font-medium text-plazet-900">{monthLabel(m.mes)}</td>
                      <td className="px-4 py-2.5 text-right">{cop(m.venta)}</td>
                      <td className="px-4 py-2.5 text-right">{cop(m.recaudo)}</td>
                      <td className="px-4 py-2.5 text-right text-red-600">{m.falta ? cop(m.falta) : "—"}</td>
                      <td className="px-4 py-2.5 text-right text-amber-600">{m.sobra ? cop(m.sobra) : "—"}</td>
                      <td className={`px-4 py-2.5 text-right ${netoColor(m.neto)}`}>{netoTexto(m.neto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-5 py-3 text-xs text-gray-500 border-t border-plazet-50">
                Suma efectivo + datáfono + QR + Mercado Pago.
              </div>
            </Card>

            <Card className="p-0 overflow-x-auto">
              <div className="px-5 pt-4 pb-1 text-sm font-semibold text-plazet-900">
                Resumen general de la empresa — por tienda
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-plazet-100 bg-plazet-50/50 text-left text-gray-600">
                    <th className="px-4 py-2.5">Tienda</th>
                    <th className="px-4 py-2.5 text-right">Venta</th>
                    <th className="px-4 py-2.5 text-right">Recaudo</th>
                    <th className="px-4 py-2.5 text-right">Falta total</th>
                    <th className="px-4 py-2.5 text-right">Sobra total</th>
                    <th className="px-4 py-2.5 text-right">Neto</th>
                  </tr>
                </thead>
                <tbody>
                  {api.porTienda.map((s) => (
                    <tr key={s.code} className="border-b border-plazet-50">
                      <td className="px-4 py-2.5 font-medium text-plazet-900">{s.name}</td>
                      <td className="px-4 py-2.5 text-right">{cop(s.venta)}</td>
                      <td className="px-4 py-2.5 text-right">{cop(s.recaudo)}</td>
                      <td className="px-4 py-2.5 text-right text-red-600">{s.falta ? cop(s.falta) : "—"}</td>
                      <td className="px-4 py-2.5 text-right text-amber-600">{s.sobra ? cop(s.sobra) : "—"}</td>
                      <td className={`px-4 py-2.5 text-right ${netoColor(s.neto)}`}>{netoTexto(s.neto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-5 py-3 text-xs text-gray-500 border-t border-plazet-50">
                Suma efectivo + datáfono (los únicos canales que se identifican por tienda). QR y Mercado Pago entran
                al banco a nivel empresa, sin desglose confiable por tienda.
              </div>
            </Card>
          </>
        )}
      </div>
    </>
  );
}
