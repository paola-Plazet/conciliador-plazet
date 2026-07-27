"use client";

// Tablero por tienda: selector de mes, tienda y CANAL. Se puede ver todo o
// filtrar a un solo canal (efectivo / datafono / QR / Mercadopago / Rappi /
// Addi). Tarjetas por canal, gráfico diario y tabla día a día, sin Excel.

import { useEffect, useMemo, useState } from "react";
import {
  Banknote, CreditCard, QrCode, ShoppingBag, Wallet, Bike, Landmark,
  AlertTriangle, CheckCircle2, Clock4, LayoutGrid,
} from "lucide-react";

interface DiaEfe {
  venta: number; deposito: number | null; depositoFecha: string | null;
  grupo: string[]; dif: number; estado: string; late?: boolean; qrAlert?: boolean; nota?: string;
}
interface Dia {
  date: string; efe: DiaEfe; tar: { venta: number; plink: number; dif: number };
  qrVenta: number; qrBanco: number; qrDif: number;
  mercadopago: number; rappi: number; addi: number; otros: number;
}
interface Totales {
  efeVenta: number; efeDepositado: number; efeDif: number; efePendiente: number;
  tarVenta: number; tarPlink: number; tarDif: number;
  qrVenta: number; qrBanco: number; mercadopago: number; rappi: number; addi: number; otros: number;
}
interface ApiData {
  months: string[]; month: string; stores: { code: string; name: string }[];
  data: Record<string, { days: Dia[]; totales: Totales }>;
  qrEmpresa: { date: string; venta: number; banco: number; dif: number }[];
  qrResumen: { asignado: number; sinAsignar: number; revisar: { date: string; amount: number; stores: string[] }[] };
  mpEmpresa: { date: string; venta: number; bruto: number; neto: number; dif: number }[];
  mpResumen: { venta: number; bruto: number; neto: number; tieneRecaudo: boolean };
  cut: { sales: string | null; bank: string | null; qr: string | null; datafono: string | null };
}

const cop = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
const MESES: Record<string, string> = {
  "01": "Enero", "02": "Febrero", "03": "Marzo", "04": "Abril", "05": "Mayo", "06": "Junio",
  "07": "Julio", "08": "Agosto", "09": "Septiembre", "10": "Octubre", "11": "Noviembre", "12": "Diciembre",
};
const mesLabel = (m: string) => `${MESES[m.slice(5)]} ${m.slice(0, 4)}`;

type Canal = "todo" | "efectivo" | "datafono" | "qr" | "mercadopago" | "rappi" | "addi";
const CANALES: { id: Canal; label: string; icon: React.ReactNode }[] = [
  { id: "todo", label: "Todo", icon: <LayoutGrid size={15} /> },
  { id: "efectivo", label: "Efectivo", icon: <Banknote size={15} /> },
  { id: "datafono", label: "Datafono", icon: <CreditCard size={15} /> },
  { id: "qr", label: "QR", icon: <QrCode size={15} /> },
  { id: "mercadopago", label: "Mercadopago", icon: <Wallet size={15} /> },
  { id: "rappi", label: "Rappi", icon: <Bike size={15} /> },
  { id: "addi", label: "Addi", icon: <Landmark size={15} /> },
];

// Convención: se razona en "faltante" = venta − recaudo.
//   faltante > 0  → FALTA plata (recaudaron menos que la venta)  → ROJO
//   faltante < 0  → SOBRA plata (recaudaron de más)              → AMARILLO
//   |faltante| < TOL → cuadra                                     → VERDE
const TOL = 500;
type Estado = "cuadra" | "falta" | "sobra";
function estadoDe(faltante: number): Estado {
  if (Math.abs(faltante) < TOL) return "cuadra";
  return faltante > 0 ? "falta" : "sobra";
}
function difColor(faltante: number): string {
  return { cuadra: "text-plazet-700", falta: "text-red-600 font-semibold", sobra: "text-amber-600 font-semibold" }[estadoDe(faltante)];
}
function difBadge(faltante: number): string {
  return { cuadra: "bg-plazet-50 text-plazet-700", falta: "bg-red-50 text-red-700", sobra: "bg-amber-50 text-amber-700" }[estadoDe(faltante)];
}
// Texto claro: "falta $X" / "sobra $X" / "cuadra"
function difTexto(faltante: number): string {
  const e = estadoDe(faltante);
  return e === "cuadra" ? "cuadra" : `${e} ${cop(Math.abs(faltante))}`;
}

export default function TiendasPage() {
  const [api, setApi] = useState<ApiData | null>(null);
  const [month, setMonth] = useState<string>("");
  const [store, setStore] = useState<string>("");
  const [canal, setCanal] = useState<Canal>("todo");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/dashboard${month ? `?month=${month}` : ""}`)
      .then((r) => r.json())
      .then((d: ApiData) => {
        setApi(d);
        setMonth(d.month);
        if (!store && d.stores.length) setStore(d.stores[0].code);
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const tienda = api?.data?.[store];
  const dias = useMemo(() => tienda?.days ?? [], [tienda]);
  const tot = tienda?.totales;
  const maxDia = useMemo(
    () => Math.max(1, ...dias.map((d) => Math.max(d.efe.venta, d.tar.venta, d.efe.deposito ?? 0, d.tar.plink))),
    [dias],
  );
  const ver = (c: Canal) => canal === "todo" || canal === c;

  if (loading && !api) return <div className="p-10 text-plazet-600">Cargando tablero…</div>;
  if (!api || !api.months.length)
    return <div className="p-10 text-plazet-600">Aún no hay datos: carga archivos primero.</div>;

  return (
    <div className="px-8 py-6 max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tiendas</h1>
          <p className="text-sm text-gray-500">Venta vs recaudo por canal, día a día</p>
        </div>
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium shadow-sm"
        >
          {api.months.map((m) => <option key={m} value={m}>{mesLabel(m)}</option>)}
        </select>
      </div>

      {/* tiendas */}
      <div className="mt-5 flex flex-wrap gap-2">
        {api.stores.map((s) => (
          <button
            key={s.code}
            onClick={() => setStore(s.code)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              store === s.code ? "bg-plazet-500 text-white shadow" : "bg-white text-gray-600 border border-gray-200 hover:border-plazet-400"
            }`}
          >
            {s.name}
          </button>
        ))}
      </div>

      {/* canales */}
      <div className="mt-3 flex flex-wrap gap-2">
        {CANALES.map((c) => (
          <button
            key={c.id}
            onClick={() => setCanal(c.id)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              canal === c.id ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {c.icon} {c.label}
          </button>
        ))}
      </div>

      {/* tarjetas por canal (según filtro) */}
      {tot && (
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {ver("efectivo") && (
            <CardCanal icon={<Banknote size={18} />} titulo="Efectivo"
              venta={tot.efeVenta} recaudo={tot.efeDepositado} faltante={-tot.efeDif}
              extra={tot.efePendiente > 0 ? `Pendiente por consignar: ${cop(tot.efePendiente)}` : undefined} />
          )}
          {ver("datafono") && (
            <CardCanal icon={<CreditCard size={18} />} titulo="Datafono" venta={tot.tarVenta} recaudo={tot.tarPlink} faltante={tot.tarDif} />
          )}
          {ver("qr") && (
            <CardCanal icon={<QrCode size={18} />} titulo="QR" venta={tot.qrVenta}
              recaudo={tot.qrBanco > 0 ? tot.qrBanco : null}
              faltante={tot.qrBanco > 0 ? tot.qrVenta - tot.qrBanco : null}
              extra={tot.qrBanco > 0
                ? "Recaudo asignado por valor idéntico (aprox.) · empresa abajo ↓"
                : "El banco no separa QR por tienda — cuadre de empresa abajo ↓"} />
          )}
          {ver("mercadopago") && (
            <CardCanal icon={<Wallet size={18} />} titulo="Mercadopago" venta={tot.mercadopago} recaudo={null} faltante={null}
              extra="Es de Habbie · cuadre vs Mercado Pago (empresa) abajo ↓" />
          )}
          {ver("rappi") && <CardCanal icon={<Bike size={18} />} titulo="Rappi" venta={tot.rappi} recaudo={null} faltante={null} extra="Recaudado por Natural Light" />}
          {ver("addi") && <CardCanal icon={<Landmark size={18} />} titulo="Addi" venta={tot.addi} recaudo={null} faltante={null} />}
          {canal === "todo" && <CardCanal icon={<ShoppingBag size={18} />} titulo="Otros" venta={tot.otros} recaudo={null} faltante={null} />}
        </div>
      )}

      {/* gráfico diario (solo canales con recaudo comparable) */}
      {(canal === "todo" || canal === "efectivo" || canal === "datafono") && (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">
              {canal === "efectivo" ? "Efectivo diario: venta vs depósito" : canal === "datafono" ? "Datafono diario: venta vs Plink" : "Venta diaria vs recaudo"}
            </h2>
            <div className="flex items-center gap-4 text-xs text-gray-500">
              {ver("efectivo") && <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-plazet-500" /> Efectivo</span>}
              {ver("datafono") && <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-sky-500" /> Datafono</span>}
              <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-red-500" /> Falta</span>
              <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-400" /> Sobra</span>
            </div>
          </div>
          <div className="mt-4 flex items-end gap-[3px] h-36">
            {dias.map((d) => {
              // faltante efectivo = venta − depósito (positivo = falta)
              const faltEfe = d.efe.estado !== "AGRUPADO" && d.efe.estado !== "SIN_VENTA" ? -d.efe.dif : 0;
              const colEfe = estadoDe(faltEfe) === "falta" ? "bg-red-400" : estadoDe(faltEfe) === "sobra" ? "bg-amber-400" : "bg-plazet-500";
              const colTar = estadoDe(d.tar.dif) === "falta" ? "bg-red-300" : estadoDe(d.tar.dif) === "sobra" ? "bg-amber-300" : "bg-sky-400";
              return (
                <div key={d.date} className="group relative h-full flex-1 flex items-end gap-[2px]" title={d.date}>
                  {ver("efectivo") && (
                    <div className={`flex-1 rounded-t ${colEfe}`} style={{ height: `${(d.efe.venta / maxDia) * 100}%` }} />
                  )}
                  {ver("datafono") && (
                    <div className={`flex-1 rounded-t ${colTar}`} style={{ height: `${(d.tar.venta / maxDia) * 100}%` }} />
                  )}
                  <div className="pointer-events-none absolute -top-24 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-gray-900 px-3 py-2 text-[11px] text-white group-hover:block">
                    <div className="font-semibold">{d.date.slice(8)}/{d.date.slice(5, 7)}</div>
                    <div>EFE {cop(d.efe.venta)} · TAR {cop(d.tar.venta)}</div>
                    <div>QR {cop(d.qrVenta)} · MP {cop(d.mercadopago)}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex gap-[3px] text-[9px] text-gray-400">
            {dias.map((d) => <div key={d.date} className="flex-1 text-center">{d.date.slice(8)}</div>)}
          </div>
        </div>
      )}

      {/* tabla día a día (columnas según canal) */}
      <div className="mt-6 overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3">Día</th>
              {ver("efectivo") && <th className="px-3 py-3 text-right">Efectivo</th>}
              {ver("efectivo") && <th className="px-3 py-3 text-right">Depósito</th>}
              {ver("efectivo") && <th className="px-3 py-3 text-right">Dif EFE</th>}
              {ver("datafono") && <th className="px-3 py-3 text-right">Datafono</th>}
              {ver("datafono") && <th className="px-3 py-3 text-right">Plink</th>}
              {ver("datafono") && <th className="px-3 py-3 text-right">Dif TAR</th>}
              {ver("qr") && <th className="px-3 py-3 text-right">QR venta</th>}
              {canal === "qr" && <th className="px-3 py-3 text-right">QR banco</th>}
              {canal === "qr" && <th className="px-3 py-3 text-right">Dif QR</th>}
              {ver("mercadopago") && <th className="px-3 py-3 text-right">Mercadopago</th>}
              {ver("rappi") && <th className="px-3 py-3 text-right">Rappi</th>}
              {ver("addi") && <th className="px-3 py-3 text-right">Addi</th>}
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {dias
              .filter((d) => canal === "todo" || montoCanal(d, canal) !== 0 || (canal === "efectivo" && d.efe.venta) || (canal === "datafono" && d.tar.venta) || (canal === "qr" && d.qrBanco))
              .map((d) => <FilaDia key={d.date} d={d} ver={ver} canal={canal} />)}
          </tbody>
        </table>
      </div>

      {/* QR empresa (solo en Todo o QR) */}
      {ver("qr") && (() => {
        const totVenta = api.qrEmpresa.reduce((a, d) => a + d.venta, 0);
        const totBanco = api.qrEmpresa.reduce((a, d) => a + d.banco, 0);
        const falt = totVenta - totBanco; // + = falta en banco, − = sobra
        return (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700">QR Bancolombia — toda la empresa</h2>
          <p className="mt-1 text-xs text-gray-500">Los pagos QR entran a una sola cuenta sin tienda; se comparan a nivel empresa.</p>
          {api.qrResumen && (api.qrResumen.asignado > 0 || api.qrResumen.sinAsignar > 0) && (
            <p className="mt-1 text-[11px] text-plazet-700">
              Asignado a tiendas por valor idéntico: {cop(api.qrResumen.asignado)} · sin asignar: {cop(api.qrResumen.sinAsignar)}
            </p>
          )}
          {api.qrResumen?.revisar?.length > 0 && (
            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2">
              <p className="text-[11px] font-semibold text-amber-800">
                {api.qrResumen.revisar.length} pago(s) por revisar — mismo valor en 2+ tiendas el mismo día (no se asignaron):
              </p>
              <div className="mt-1 flex flex-col gap-0.5">
                {api.qrResumen.revisar.map((r, i) => (
                  <div key={i} className="text-[11px] text-amber-800">
                    {r.date.slice(8)}/{r.date.slice(5, 7)} · {cop(r.amount)} · entre: {r.stores.join(" / ")}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <Kpi label="Venta QR del mes" value={cop(totVenta)} />
            <Kpi label="Recibido en banco" value={cop(totBanco)} />
            <Kpi label={estadoDe(falt) === "sobra" ? "Sobra en banco" : "Falta en banco"} value={difTexto(falt)}
              tone={estadoDe(falt) === "cuadra" ? "ok" : estadoDe(falt) === "falta" ? "bad" : "warn"} />
            <Kpi label="Días descuadrados" value={String(api.qrEmpresa.filter((d) => Math.abs(d.dif) >= TOL).length)} />
          </div>
          <details className="mt-3" open>
            <summary className="cursor-pointer text-xs font-medium text-plazet-700">Ver día a día</summary>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-8">
              {api.qrEmpresa.filter((d) => d.venta || d.banco).map((d) => (
                <div key={d.date} className="flex items-center justify-between border-b border-gray-100 py-1 text-xs">
                  <span className="text-gray-500">{d.date.slice(8)}/{d.date.slice(5, 7)}</span>
                  <span>venta {cop(d.venta)}</span>
                  <span>banco {cop(d.banco)}</span>
                  <span className={difColor(d.dif)}>{difTexto(d.dif)}</span>
                </div>
              ))}
            </div>
          </details>
        </div>
        );
      })()}

      {/* Mercado Pago empresa (solo en Todo o Mercadopago) */}
      {ver("mercadopago") && api.mpResumen?.tieneRecaudo && (() => {
        const r = api.mpResumen;
        const falt = r.venta - r.bruto; // + = venta sin cobrar, − = cobros sin venta cargada
        const comision = r.bruto - r.neto;
        return (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700">Mercado Pago — toda la empresa</h2>
          <p className="mt-1 text-xs text-gray-500">Recaudo del settlement de Mercado Pago (es de Habbie). El cobro entra 1-4 días antes de facturarse en el POS; se compara a nivel empresa.</p>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <Kpi label="Venta Mercadopago (POS)" value={cop(r.venta)} />
            <Kpi label="Cobrado (bruto)" value={cop(r.bruto)} />
            <Kpi label="Neto recibido" value={cop(r.neto)} />
            <Kpi label="Comisiones + retención" value={cop(comision)} tone="warn" />
          </div>
          <div className="mt-2 text-xs text-gray-500">
            Venta vs cobrado: <span className={difColor(falt)}>{difTexto(falt)}</span>
            {Math.abs(falt) >= TOL && <span className="ml-1 text-gray-400">(suele ser desfase de días de facturación / falta cargar Karrot al día)</span>}
          </div>
          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-medium text-plazet-700">Ver día a día (por fecha de cobro)</summary>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-8">
              {api.mpEmpresa.filter((d) => d.venta || d.bruto).map((d) => (
                <div key={d.date} className="flex items-center justify-between border-b border-gray-100 py-1 text-xs">
                  <span className="text-gray-500">{d.date.slice(8)}/{d.date.slice(5, 7)}</span>
                  <span>venta {cop(d.venta)}</span>
                  <span>cobrado {cop(d.bruto)}</span>
                  <span className={difColor(d.dif)}>{difTexto(d.dif)}</span>
                </div>
              ))}
            </div>
          </details>
        </div>
        );
      })()}

      <p className="mt-4 text-xs text-gray-400">
        Datos al: ventas {api.cut.sales ?? "—"} · banco {api.cut.bank ?? "—"} · QR {api.cut.qr ?? "—"} · datafono {api.cut.datafono ?? "—"}
      </p>
    </div>
  );
}

function montoCanal(d: Dia, c: Canal): number {
  switch (c) {
    case "efectivo": return d.efe.venta;
    case "datafono": return d.tar.venta;
    case "qr": return d.qrVenta;
    case "mercadopago": return d.mercadopago;
    case "rappi": return d.rappi;
    case "addi": return d.addi;
    default: return 1;
  }
}

function CardCanal(props: {
  icon: React.ReactNode; titulo: string; venta: number; recaudo: number | null; faltante: number | null; extra?: string;
}) {
  const { icon, titulo, venta, recaudo, faltante, extra } = props;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-gray-500">
        <span className="text-plazet-600">{icon}</span>
        <span className="text-xs font-semibold uppercase tracking-wide">{titulo}</span>
      </div>
      <div className="mt-2 text-xl font-bold text-gray-900">{cop(venta)}</div>
      {recaudo != null && <div className="mt-1 text-xs text-gray-500">Recaudado: <span className="font-medium text-gray-700">{cop(recaudo)}</span></div>}
      {faltante != null && <div className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${difBadge(faltante)}`}>{difTexto(faltante)}</div>}
      {extra && <div className="mt-2 text-[11px] text-amber-700">{extra}</div>}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "ok" | "bad" | "warn" }) {
  const color = tone === "bad" ? "text-red-600" : tone === "warn" ? "text-amber-600" : "text-gray-900";
  return (
    <div className="rounded-lg bg-gray-50 p-3">
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className={`text-base font-bold capitalize ${color}`}>{value}</div>
    </div>
  );
}

function FilaDia({ d, ver, canal }: { d: Dia; ver: (c: Canal) => boolean; canal: Canal }) {
  const e = d.efe;
  const mostrarDifEfe = e.estado !== "AGRUPADO" && e.estado !== "SIN_VENTA";

  // señales de alerta SOLO de los canales visibles (para que el triángulo no se
  // prenda por un canal que no estás mirando)
  const tonos: Estado[] = [];
  if (ver("efectivo") && mostrarDifEfe && (e.venta || e.deposito) && e.estado !== "PENDIENTE")
    tonos.push(e.estado === "CUADRA" || e.estado === "MANUAL" ? "cuadra" : estadoDe(-e.dif));
  if (ver("datafono") && (d.tar.venta || d.tar.plink)) tonos.push(estadoDe(d.tar.dif));
  if (canal === "qr" && (d.qrVenta || d.qrBanco)) tonos.push(estadoDe(d.qrDif));
  const señales = {
    hayFalta: tonos.includes("falta"),
    haySobra: tonos.includes("sobra"),
    hayDato: tonos.length > 0,
  };

  return (
    <tr className="border-b border-gray-100 hover:bg-plazet-50/40">
      <td className="px-4 py-2 font-medium text-gray-700">{d.date.slice(8)}/{d.date.slice(5, 7)}</td>
      {ver("efectivo") && <td className="px-3 py-2 text-right">{e.venta ? cop(e.venta) : "—"}</td>}
      {ver("efectivo") && (
        <td className="px-3 py-2 text-right text-gray-600">
          {e.deposito != null ? (
            <span title={`Depositado el ${e.depositoFecha} · cubre días ${e.grupo.map((g) => g.slice(8)).join("+")}`}>
              {cop(e.deposito)}{e.grupo.length > 1 && <span className="ml-1 text-[10px] text-gray-400">({e.grupo.length}d)</span>}
            </span>
          ) : e.estado === "AGRUPADO" ? <span className="text-[11px] text-gray-400">agrupado ↓</span>
            : e.estado === "PENDIENTE" ? <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">pendiente</span>
            : "—"}
        </td>
      )}
      {ver("efectivo") && (
        <td className={`px-3 py-2 text-right ${mostrarDifEfe ? difColor(-e.dif) : "text-gray-300"}`}>
          {mostrarDifEfe && e.venta + (e.deposito ?? 0) !== 0 ? difTexto(-e.dif) : "—"}
        </td>
      )}
      {ver("datafono") && <td className="px-3 py-2 text-right">{d.tar.venta ? cop(d.tar.venta) : "—"}</td>}
      {ver("datafono") && <td className="px-3 py-2 text-right text-gray-600">{d.tar.plink ? cop(d.tar.plink) : "—"}</td>}
      {ver("datafono") && <td className={`px-3 py-2 text-right ${difColor(d.tar.dif)}`}>{d.tar.venta || d.tar.plink ? difTexto(d.tar.dif) : "—"}</td>}
      {ver("qr") && <td className="px-3 py-2 text-right">{d.qrVenta ? cop(d.qrVenta) : "—"}</td>}
      {canal === "qr" && <td className="px-3 py-2 text-right text-gray-600">{d.qrBanco ? cop(d.qrBanco) : "—"}</td>}
      {canal === "qr" && (
        <td className={`px-3 py-2 text-right ${d.qrVenta || d.qrBanco ? difColor(d.qrDif) : "text-gray-300"}`}>
          {d.qrVenta || d.qrBanco ? difTexto(d.qrDif) : "—"}
        </td>
      )}
      {ver("mercadopago") && <td className="px-3 py-2 text-right">{d.mercadopago ? cop(d.mercadopago) : "—"}</td>}
      {ver("rappi") && <td className="px-3 py-2 text-right">{d.rappi ? cop(d.rappi) : "—"}</td>}
      {ver("addi") && <td className="px-3 py-2 text-right">{d.addi ? cop(d.addi) : "—"}</td>}
      <td className="px-4 py-2">
        <div className="flex items-center gap-1.5">
          {(ver("efectivo")) && e.qrAlert && (
            <span title={e.nota ?? "El faltante entró como pago QR"} className="flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
              <QrCode size={11} /> ¿QR?
            </span>
          )}
          {(ver("efectivo")) && e.late && <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700"><Clock4 size={11} /> tardía</span>}
          {señales.hayFalta && <span className="flex items-center gap-1 text-red-600"><AlertTriangle size={15} /><span className="text-[10px] font-semibold">falta</span></span>}
          {!señales.hayFalta && señales.haySobra && <span className="flex items-center gap-1 text-amber-600"><AlertTriangle size={15} /><span className="text-[10px] font-semibold">sobra</span></span>}
          {!señales.hayFalta && !señales.haySobra && señales.hayDato && <CheckCircle2 size={15} className="text-plazet-500" />}
        </div>
      </td>
    </tr>
  );
}
