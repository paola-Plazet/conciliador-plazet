"use client";

// Ventas web (Shopify): pedidos de las tiendas online de Plazet y Natural
// Light (sincronizados por API) cruzados contra los cobros de la cuenta de
// Mercado Pago (compartida por las dos tiendas, cargada por archivo).

import { useCallback, useEffect, useState } from "react";
import { Globe, RefreshCw, AlertTriangle, CheckCircle2, Undo2 } from "lucide-react";

interface MpMatch {
  opId: string;
  date: string;
  bruto: number;
  neto: number;
  fee: number;
  release: string | null;
  diff: number;
}
interface Row {
  name: string;
  date: string;
  amount: number;
  refund: number;
  refundDate: string | null;
  gateway: string;
  financial: string;
  mp: MpMatch | null;
}
interface ShopData {
  rows: Row[];
  totals: {
    pedidos: number;
    cobradoWeb: number;
    reembolsos: number;
    conCobro: number;
    sinCobro: number;
    sinCobroMonto: number;
    brutoMp: number;
    netoMp: number;
    comision: number;
  };
}
interface ApiData {
  months: string[];
  month: string | null;
  shops: Record<string, ShopData>;
  lastSync: Record<string, string | null>;
  totalMpOps: number;
}

const cop = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
const MESES: Record<string, string> = {
  "01": "Enero", "02": "Febrero", "03": "Marzo", "04": "Abril", "05": "Mayo", "06": "Junio",
  "07": "Julio", "08": "Agosto", "09": "Septiembre", "10": "Octubre", "11": "Noviembre", "12": "Diciembre",
};
const mesLabel = (m: string) => `${MESES[m.slice(5)]} ${m.slice(0, 4)}`;
const fecha = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`;

const SHOPS: { key: string; label: string }[] = [
  { key: "PLAZET", label: "Plazet — plazet.co" },
  { key: "NL", label: "Natural Light — naturallight.com.co" },
];

export default function WebPage() {
  const [api, setApi] = useState<ApiData | null>(null);
  const [month, setMonth] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback((m?: string) => {
    setLoading(true);
    fetch(`/api/web${m ? `?month=${m}` : ""}`)
      .then((r) => r.json())
      .then((d: ApiData) => {
        setApi(d);
        if (d.month) setMonth(d.month);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function sync() {
    setSyncing(true);
    setMsg(null);
    try {
      const r = await fetch("/api/shopify/sync", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Error al sincronizar.");
      const parts = (d.shops as { label: string; orders: number }[]).map((s) => `${s.label}: ${s.orders} pedidos`);
      // luego los cobros de Mercado Pago por API
      let mpMsg = "";
      try {
        const r2 = await fetch("/api/mercadopago/sync", { method: "POST" });
        const d2 = await r2.json();
        mpMsg = r2.ok ? ` · Mercado Pago: ${d2.ops} cobros` : ` · ⚠ MP: ${d2.error ?? "error"}`;
      } catch {
        mpMsg = " · ⚠ MP: sin conexión";
      }
      setMsg(`Sincronizado · ${parts.join(" · ")}${mpMsg}${d.errors?.length ? ` · ⚠ ${d.errors.join(" · ")}` : ""}`);
      load(month || undefined);
    } catch (e) {
      setMsg(`⚠ ${e instanceof Error ? e.message : "Error al sincronizar."}`);
    } finally {
      setSyncing(false);
    }
  }

  if (loading && !api) {
    return <div className="p-8 text-sm text-gray-500">Cargando ventas web…</div>;
  }

  const sinDatos = !api || api.months.length === 0;

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900">
            <Globe size={20} className="text-plazet-600" /> Ventas web (Shopify)
          </h1>
          <p className="mt-1 text-xs text-gray-500">
            Pedidos online de Plazet y Natural Light contra los cobros de Mercado Pago (cuenta compartida).
          </p>
        </div>
        <div className="flex items-center gap-2">
          {api && api.months.length > 0 && (
            <select
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
              value={month}
              onChange={(e) => { setMonth(e.target.value); load(e.target.value); }}
            >
              {api.months.map((m) => <option key={m} value={m}>{mesLabel(m)}</option>)}
            </select>
          )}
          <button
            onClick={sync}
            disabled={syncing}
            className="flex items-center gap-2 rounded-lg bg-plazet-600 px-4 py-2 text-sm font-medium text-white hover:bg-plazet-700 disabled:opacity-60"
          >
            <RefreshCw size={15} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Sincronizando…" : "Sincronizar (Shopify + MP)"}
          </button>
        </div>
      </div>

      {msg && (
        <div className={`mt-3 rounded-lg border p-3 text-sm ${msg.startsWith("⚠") ? "border-amber-200 bg-amber-50 text-amber-800" : "border-plazet-200 bg-plazet-50 text-plazet-800"}`}>
          {msg}
        </div>
      )}

      {sinDatos && (
        <div className="mt-8 rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          Aún no hay pedidos sincronizados. Dale a <b>Sincronizar Shopify</b> para traerlos por API.
        </div>
      )}

      {!sinDatos && SHOPS.map(({ key, label }) => {
        const shop = api!.shops[key];
        if (!shop) return null;
        const t = shop.totals;
        const last = api!.lastSync[key];
        return (
          <div key={key} className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-gray-800">{label}</h2>
              <span className="text-[11px] text-gray-400">
                {last ? `Última sincronización: ${new Date(last).toLocaleString("es-CO")}` : "Sin sincronizar aún"}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
              <Kpi label="Pedidos pagados" value={String(t.pedidos)} />
              <Kpi label="Cobrado en la web" value={cop(t.cobradoWeb)} />
              <Kpi label="Con cobro MP" value={`${t.conCobro} / ${t.pedidos}`} tone={t.sinCobro === 0 ? "ok" : undefined} />
              <Kpi label="Sin cobro MP" value={t.sinCobro ? `${t.sinCobro} · ${cop(t.sinCobroMonto)}` : "0"} tone={t.sinCobro ? "bad" : "ok"} />
              <Kpi label="Comisión MP" value={cop(t.comision)} />
              <Kpi label="Neto MP" value={cop(t.netoMp)} />
            </div>

            {t.reembolsos > 0 && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                <Undo2 size={14} /> Reembolsos del mes: {cop(t.reembolsos)} (MP los descuenta de las liberaciones)
              </div>
            )}

            {shop.rows.length === 0 ? (
              <p className="mt-4 text-xs text-gray-400">Sin pedidos pagados este mes.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                      <th className="py-2 pr-3">Fecha</th>
                      <th className="py-2 pr-3">Pedido</th>
                      <th className="py-2 pr-3 text-right">Total web</th>
                      <th className="py-2 pr-3">Cobro MP</th>
                      <th className="py-2 pr-3 text-right">Comisión</th>
                      <th className="py-2 pr-3 text-right">Neto</th>
                      <th className="py-2">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shop.rows.map((r) => (
                      <tr key={r.name} className="border-b border-gray-100 hover:bg-plazet-50/40">
                        <td className="py-2 pr-3 text-gray-600">{fecha(r.date)}</td>
                        <td className="py-2 pr-3 font-medium text-gray-800">{r.name}</td>
                        <td className="py-2 pr-3 text-right">{cop(r.amount)}</td>
                        <td className="py-2 pr-3 text-gray-600">
                          {r.mp ? (
                            <span title={`Operación MP ${r.mp.opId}${r.mp.release ? ` · liberado ${r.mp.release}` : ""}`}>
                              {fecha(r.mp.date)}{r.mp.diff !== 0 && <span className="ml-1 text-[10px] text-amber-600">(dif {cop(r.mp.diff)})</span>}
                            </span>
                          ) : (
                            <span className="text-red-600">—</span>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-right text-gray-500">{r.mp ? cop(r.mp.fee) : "—"}</td>
                        <td className="py-2 pr-3 text-right">{r.mp ? cop(r.mp.neto) : "—"}</td>
                        <td className="py-2">
                          {r.refund > 0 ? (
                            <Chip tone="warn" icon={<Undo2 size={12} />} text={`reembolsado ${cop(r.refund)}`} />
                          ) : r.mp ? (
                            <Chip tone="ok" icon={<CheckCircle2 size={12} />} text="cobrado" />
                          ) : (
                            <Chip tone="bad" icon={<AlertTriangle size={12} />} text="sin cobro MP" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

      {!sinDatos && (
        <p className="mt-4 text-[11px] text-gray-400">
          El cruce busca para cada pedido la operación de Mercado Pago con el mismo valor (±$100) hasta 4 días
          alrededor. Un pedido &quot;sin cobro MP&quot; puede deberse a que falta cargar el archivo de liquidaciones de
          esos días ({api!.totalMpOps} operaciones MP cargadas).
        </p>
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "ok" | "bad" }) {
  const color = tone === "bad" ? "text-red-600" : tone === "ok" ? "text-plazet-700" : "text-gray-900";
  return (
    <div className="rounded-lg bg-gray-50 p-3">
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className={`text-sm font-bold ${color}`}>{value}</div>
    </div>
  );
}

function Chip({ tone, icon, text }: { tone: "ok" | "bad" | "warn"; icon: React.ReactNode; text: string }) {
  const cls = {
    ok: "bg-plazet-50 text-plazet-700",
    bad: "bg-red-50 text-red-700",
    warn: "bg-amber-50 text-amber-700",
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>
      {icon} {text}
    </span>
  );
}
