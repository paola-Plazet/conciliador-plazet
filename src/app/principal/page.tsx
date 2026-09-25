"use client";

// Bodega PRINCIPAL (Karrot, desde sep-2026): Elba factura ahí la web de NL y
// Plazet, Mercado Libre, las empresas y alguna venta en efectivo. Cada factura
// se cruza con su cobro (Mercado Pago o banco) y, al revés, se listan los
// cobros web / Mercado Libre que no tienen factura.

import { useCallback, useEffect, useState } from "react";
import { Warehouse, AlertTriangle, CheckCircle2, Clock, FileX2, Link2 } from "lucide-react";
import type { PrincipalOut, FacturaPrincipal, CobroMp, Canal } from "@/lib/principal-cruce";

const cop = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
const MESES: Record<string, string> = {
  "01": "Enero", "02": "Febrero", "03": "Marzo", "04": "Abril", "05": "Mayo", "06": "Junio",
  "07": "Julio", "08": "Agosto", "09": "Septiembre", "10": "Octubre", "11": "Noviembre", "12": "Diciembre",
};
const mesLabel = (m: string) => `${MESES[m.slice(5)]} ${m.slice(0, 4)}`;
const fecha = (d: string | null) => (d ? `${d.slice(8)}/${d.slice(5, 7)}` : "—");

const CANAL: Record<Canal | string, { label: string; cls: string }> = {
  "web-nl": { label: "Web NL", cls: "bg-emerald-50 text-emerald-700" },
  "web-plazet": { label: "Web Plazet", cls: "bg-plazet-50 text-plazet-700" },
  mercadolibre: { label: "Mercado Libre", cls: "bg-yellow-50 text-yellow-800" },
  empresa: { label: "Empresa", cls: "bg-sky-50 text-sky-700" },
  efectivo: { label: "Efectivo", cls: "bg-gray-100 text-gray-600" },
  otro: { label: "Otro", cls: "bg-gray-100 text-gray-500" },
};

const neto = (f: FacturaPrincipal) => (f.anulada ? 0 : f.amount);

export default function PrincipalPage() {
  const [api, setApi] = useState<PrincipalOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [soloRevisar, setSoloRevisar] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback((m?: string) => {
    setLoading(true);
    fetch(`/api/principal${m ? `?month=${m}` : ""}`)
      .then((r) => r.json())
      .then((d: PrincipalOut) => { setApi(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function vincular(method: "POST" | "DELETE", body: object) {
    setMsg(null);
    const r = await fetch("/api/principal/vincular", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg(`⚠ ${d.error ?? "No se pudo guardar."}`); return; }
    load(api?.month);
  }
  const acciones: Acciones = {
    confirmar: (f) => f.posible && vincular("POST", { invoices: [f.invoice], opId: f.posible.opId, nota: `Confirmado a mano (dif ${cop(f.posible.bruto - f.amount)})` }),
    deshacer: (f) => vincular("DELETE", { invoice: f.invoice }),
  };

  if (loading && !api) return <div className="p-4 sm:p-8 text-sm text-gray-500">Cargando bodega Principal…</div>;
  if (!api) return <div className="p-4 sm:p-8 text-sm text-red-600">No se pudo cargar la bodega Principal.</div>;

  const vivas = api.facturas.filter((f) => !f.anulada);
  const conCobro = vivas.filter((f) => f.cobro);
  const revisar = vivas.filter((f) => f.aviso);
  const sinFac = api.sinFactura.filter((c) => !c.reciente);
  const recientes = api.sinFactura.filter((c) => c.reciente);
  const comisionMp = conCobro.reduce((a, f) => a + (f.cobro?.tipo === "mp" && !f.grupo ? f.cobro.bruto - f.cobro.neto : 0), 0);
  const filas = soloRevisar ? api.facturas.filter((f) => f.aviso || Math.abs(f.dif) > 500) : api.facturas;

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900">
            <Warehouse size={20} className="text-plazet-600" /> Bodega Principal
          </h1>
          <p className="mt-1 text-xs text-gray-500">
            Facturas de Karrot (web NL y Plazet, Mercado Libre, empresas) contra su cobro en Mercado Pago o en el banco.
          </p>
        </div>
        {api.months.length > 0 && (
          <select
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            value={api.month}
            onChange={(e) => load(e.target.value)}
          >
            {api.months.map((m) => <option key={m} value={m}>{mesLabel(m)}</option>)}
          </select>
        )}
      </div>

      <p className="mt-2 text-[11px] text-gray-400">
        Datos al día: Karrot hasta {fecha(api.karrotHasta)} · Mercado Pago hasta {fecha(api.mpHasta)} · banco hasta {fecha(api.bancoHasta)}
      </p>

      {msg && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{msg}</div>}

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-5">
        <Kpi label="Facturado (sin anuladas)" value={`${vivas.length} · ${cop(vivas.reduce((a, f) => a + neto(f), 0))}`} />
        <Kpi label="Con su cobro" value={`${conCobro.length} / ${vivas.length}`} tone={conCobro.length === vivas.length ? "ok" : undefined} />
        <Kpi label="Por revisar" value={revisar.length ? `${revisar.length} · ${cop(revisar.reduce((a, f) => a + f.amount, 0))}` : "0"} tone={revisar.length ? "bad" : "ok"} />
        <Kpi label="Cobros sin factura" value={sinFac.length ? `${sinFac.length} · ${cop(sinFac.reduce((a, c) => a + c.bruto, 0))}` : "0"} tone={sinFac.length ? "bad" : "ok"} />
        <Kpi label="Comisión Mercado Pago/ML" value={cop(comisionMp)} />
      </div>

      {/* cobros sin factura */}
      <section className="mt-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-800">
          <FileX2 size={16} className="text-red-500" /> Cobros sin factura en Karrot
        </h2>
        <p className="mt-1 text-[11px] text-gray-500">
          Plata que entró por Mercado Pago (web o Mercado Libre) sin factura en Karrot. Los pedidos de la web Plazet deberían entrar solos por la integración Shopify → Karrot (a la tienda de donde sale la mercancía); si salen aquí es que no llegaron.
        </p>
        {api.sinFactura.length === 0 ? (
          <p className="mt-3 text-xs text-plazet-700">Todo cobro tiene su factura. ✓</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="py-2 pr-3">Fecha</th>
                  <th className="py-2 pr-3">Canal</th>
                  <th className="py-2 pr-3">Pedido / detalle</th>
                  <th className="py-2 pr-3 text-right">Cobrado</th>
                  <th className="py-2 pr-3 text-right">Neto MP</th>
                  <th className="py-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {[...sinFac, ...recientes].map((c) => (
                  <tr key={c.opId} className="border-b border-gray-100">
                    <td className="py-2 pr-3 text-gray-600">{fecha(c.date)}</td>
                    <td className="py-2 pr-3"><CanalChip canal={c.origen ?? "otro"} /></td>
                    <td className="py-2 pr-3 text-gray-700" title={`Operación MP ${c.opId}`}>
                      {c.pedido ?? <span className="text-gray-500">{c.detalle ?? "—"}</span>}
                    </td>
                    <td className="py-2 pr-3 text-right">{cop(c.bruto)}</td>
                    <td className="py-2 pr-3 text-right text-gray-500">{cop(c.neto)}</td>
                    <td className="py-2">
                      {c.reciente ? (
                        <Chip tone="muted" icon={<Clock size={12} />} text="reciente: Karrot aún no cargado" />
                      ) : (
                        <Chip tone="bad" icon={<AlertTriangle size={12} />} text={c.origen === "web-plazet" ? "no llegó de Shopify a Karrot" : "sin factura"} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* facturas */}
      <section className="mt-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-gray-800">Facturas de Principal</h2>
          <div className="flex overflow-hidden rounded-lg border border-gray-300 text-xs">
            <button onClick={() => setSoloRevisar(true)} className={`px-3 py-1.5 ${soloRevisar ? "bg-plazet-600 text-white" : "bg-white text-gray-600"}`}>
              Por revisar ({api.facturas.filter((f) => f.aviso || Math.abs(f.dif) > 500).length})
            </button>
            <button onClick={() => setSoloRevisar(false)} className={`px-3 py-1.5 ${!soloRevisar ? "bg-plazet-600 text-white" : "bg-white text-gray-600"}`}>
              Todas ({api.facturas.length})
            </button>
          </div>
        </div>
        {filas.length === 0 ? (
          <p className="mt-3 text-xs text-plazet-700">Nada por revisar este mes. ✓</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="py-2 pr-3">Fecha</th>
                  <th className="py-2 pr-3">Factura</th>
                  <th className="py-2 pr-3">Cliente</th>
                  <th className="py-2 pr-3">Canal</th>
                  <th className="py-2 pr-3 text-right">Valor</th>
                  <th className="py-2 pr-3">Cobro</th>
                  <th className="py-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.id} className={`border-b border-gray-100 align-top ${f.anulada ? "text-gray-400" : ""}`}>
                    <td className="py-2 pr-3 text-gray-600">{fecha(f.date)}</td>
                    <td className="py-2 pr-3 font-medium">{f.invoice}<div className="text-[10px] font-normal text-gray-400">{f.metodo}</div></td>
                    <td className="max-w-[180px] truncate py-2 pr-3 text-gray-700" title={f.cliente ?? ""}>{f.cliente ?? "—"}</td>
                    <td className="py-2 pr-3"><CanalChip canal={f.canal} /></td>
                    <td className={`py-2 pr-3 text-right ${f.anulada ? "line-through" : ""}`}>{cop(f.amount)}</td>
                    <td className="py-2 pr-3 text-xs text-gray-600"><CobroCell f={f} acciones={acciones} /></td>
                    <td className="py-2"><Estado f={f} acciones={acciones} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="mt-4 text-[11px] text-gray-400">
        Cruce: método Mercadopago → cobro de Mercado Pago del mismo valor (±$300) entre 7 días antes y 1 después de la factura
        (prefiere la web de NL para pedidos NL y Mercado Libre / Plazet para los demás; suma varias facturas del mismo cliente y día).
        Transferencias, efectivo y lo que no apareció en MP → entradas de Bancolombia (transferencias, llaves) o de Alianza sin tienda
        (±$1.000, hasta 60 días después). Las facturas anuladas con nota crédito no se cruzan.
      </p>
    </div>
  );
}

interface Acciones {
  confirmar: (f: FacturaPrincipal) => unknown;
  deshacer: (f: FacturaPrincipal) => unknown;
}

function CobroCell({ f, acciones }: { f: FacturaPrincipal; acciones: Acciones }) {
  const c = f.cobro;
  if (f.anulada) return <span>—</span>;
  if (!c) {
    if (f.posible) {
      return (
        <div>
          <Posible c={f.posible} />
          <button onClick={() => acciones.confirmar(f)} className="mt-1 rounded border border-amber-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-amber-700 hover:bg-amber-50">
            Sí, es este cobro
          </button>
        </div>
      );
    }
    return <span className="text-red-600">—</span>;
  }
  if (c.tipo === "banco") {
    return (
      <span>
        {c.cuenta} {fecha(c.date)} · {cop(c.amount)}
        <div className="max-w-[200px] truncate text-[10px] text-gray-400" title={c.concepto}>{c.concepto}</div>
      </span>
    );
  }
  return (
    <span title={`Operación MP ${c.opId} · ${c.medio}`}>
      MP {fecha(c.date)} · {cop(c.bruto)}
      <div className="text-[10px] text-gray-400">
        {c.pedido ?? c.detalle ?? ""}
        {f.grupo && <> · junto con {f.grupo.join(", ")}</>}
        {f.dif !== 0 && <span className="ml-1 text-amber-600">(dif {cop(f.dif)})</span>}
      </div>
    </span>
  );
}

function Posible({ c }: { c: CobroMp }) {
  return (
    <span className="text-amber-700" title={`Operación MP ${c.opId}`}>
      <Link2 size={11} className="mr-0.5 inline" />¿{c.pedido ?? "MP"} {fecha(c.date)} · {cop(c.bruto)}?
      <div className="text-[10px] text-gray-400">parecido, no exacto</div>
    </span>
  );
}

function Estado({ f, acciones }: { f: FacturaPrincipal; acciones: Acciones }) {
  if (f.anulada) return <Chip tone="muted" icon={null} text={`anulada (NC ${f.nc})`} />;
  if (f.manual) {
    return (
      <div className="max-w-[240px]">
        <Chip tone="ok" icon={<Link2 size={12} />} text="vinculado a mano" />
        <div className="mt-0.5 text-[10px] leading-tight text-gray-500">{f.manual}</div>
        <button onClick={() => acciones.deshacer(f)} className="mt-0.5 text-[10px] text-gray-400 underline hover:text-red-600">deshacer</button>
      </div>
    );
  }
  if (f.aviso) {
    const tone = f.cobro ? "warn" : "bad";
    return (
      <div className="max-w-[240px]">
        <Chip tone={tone} icon={<AlertTriangle size={12} />} text={f.cobro ? "revisar" : "sin cobro"} />
        <div className="mt-0.5 text-[10px] leading-tight text-gray-500">{f.aviso}</div>
      </div>
    );
  }
  return <Chip tone="ok" icon={<CheckCircle2 size={12} />} text={f.nc ? `cobrado (NC ${f.nc})` : "cobrado"} />;
}

function CanalChip({ canal }: { canal: string }) {
  const c = CANAL[canal] ?? CANAL.otro;
  return <span className={`inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium ${c.cls}`}>{c.label}</span>;
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

function Chip({ tone, icon, text }: { tone: "ok" | "bad" | "warn" | "muted"; icon: React.ReactNode; text: string }) {
  const cls = {
    ok: "bg-plazet-50 text-plazet-700",
    bad: "bg-red-50 text-red-700",
    warn: "bg-amber-50 text-amber-700",
    muted: "bg-gray-100 text-gray-500",
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>
      {icon} {text}
    </span>
  );
}
