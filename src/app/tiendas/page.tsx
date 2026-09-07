"use client";

// Tablero por tienda: selector de mes, tienda y CANAL. Se puede ver todo o
// filtrar a un solo canal (efectivo / datafono / QR / Mercadopago / Rappi /
// Addi). Tarjetas por canal, gráfico diario y tabla día a día, sin Excel.

import { useEffect, useMemo, useRef, useState } from "react";
import { subirAdjunto } from "@/lib/imagen-cliente";
import {
  Banknote, CreditCard, QrCode, ShoppingBag, Wallet, Bike, Landmark,
  AlertTriangle, CheckCircle2, Clock4, FileClock, LayoutGrid,
} from "lucide-react";
import { dayOfWeek } from "@/lib/dates";

interface DiaEfe {
  venta: number; deposito: number | null; depositoFecha: string | null;
  grupo: string[]; dif: number; estado: string; late?: boolean; qrAlert?: boolean; nota?: string;
  enPlazo?: boolean; // pendiente pero aún en plazo (se consigna al día hábil siguiente)
}
interface Dia {
  date: string; efe: DiaEfe; tar: { venta: number; plink: number; dif: number; sinCargar: boolean };
  qrVenta: number; qrBanco: number; qrDif: number; qrSinCargar: boolean;
  mercadopago: number; rappi: number; addi: number; otros: number;
}
interface Totales {
  efeVenta: number; efeDepositado: number; efeDif: number; efePendiente: number; efeVencido: number;
  efeFaltaTotal: number; efeSobraTotal: number;
  tarVenta: number; tarPlink: number; tarDif: number; tarSinCargar: number;
  tarFaltaTotal: number; tarSobraTotal: number;
  qrVenta: number; qrBanco: number; qrSinCargar: number;
  qrFaltaTotal: number; qrSobraTotal: number;
  mercadopago: number; rappi: number; addi: number; otros: number;
}
interface ApiData {
  months: string[]; month: string; stores: { code: string; name: string }[];
  data: Record<string, { days: Dia[]; totales: Totales }>;
  qrEmpresa: { date: string; venta: number; banco: number; dif: number }[];
  qrResumen: { asignado: number; sinAsignar: number; revisar: { date: string; amount: number; payer: string; stores: string[] }[] };
  mpEmpresa: { date: string; venta: number; bruto: number; neto: number; dif: number }[];
  mpResumen: { venta: number; bruto: number; neto: number; tieneRecaudo: boolean };
  cut: { sales: string | null; bank: string | null; qr: string | null; datafono: string | null };
}

const cop = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
const DOW = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
/** "lun 24/08" — para dejar claro el día real en que se consignó */
const diaCorto = (f: string) => `${DOW[dayOfWeek(f)]} ${f.slice(8)}/${f.slice(5, 7)}`;
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
  const [qrDia, setQrDia] = useState<{ date: string; store?: string; label?: string } | null>(null); // detalle QR abierto
  const [tarDia, setTarDia] = useState<{ date: string; store: string; label: string } | null>(null); // detalle datáfono abierto
  const [refresh, setRefresh] = useState(0);
  const [notaDe, setNotaDe] = useState<string | null>(null); // día al que se le agrega nota
  const [notas, setNotas] = useState<Nota[]>([]);
  const [verImg, setVerImg] = useState<{ id: number; name: string } | null>(null); // adjunto abierto en grande
  const [adjuntarA, setAdjuntarA] = useState<number | null>(null); // nota a la que se le pegan fotos
  const [subiendo, setSubiendo] = useState(false);
  const inputFotos = useRef<HTMLInputElement>(null);
  // rol en Conciliaciones: el de solo lectura puede crear notas y pegar fotos, nada más
  const [rol, setRol] = useState<string>("ADMIN");
  useEffect(() => {
    fetch("/api/me").then((r) => (r.ok ? r.json() : null)).then((d) => d?.rol && setRol(d.rol)).catch(() => {});
  }, []);
  const puedeGestionar = rol !== "VIEWER";

  /** pega las fotos elegidas a una nota existente (desde la lista del mes) */
  async function pegarFotos(noteId: number, files: FileList | null) {
    if (!files?.length) return;
    setSubiendo(true);
    const errores: string[] = [];
    for (const f of Array.from(files)) { const e = await subirAdjunto(noteId, f); if (e) errores.push(e); }
    setSubiendo(false);
    if (errores.length) alert(errores.join("\n"));
    setRefresh((x) => x + 1);
  }
  async function borrarAdjunto(id: number) {
    const res = await fetch("/api/notas/adjunto", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    if (res.ok) setRefresh((x) => x + 1);
  }

  /** Resuelve un empate: asigna el pago QR a la tienda elegida y recarga */
  async function asignarQr(r: { date: string; amount: number; payer: string }, storeCode: string) {
    const res = await fetch("/api/qr-asignar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: r.date, amount: r.amount, payer: r.payer, store: storeCode }),
    });
    if (res.ok) setRefresh((x) => x + 1);
  }

  /** resolver / reabrir / borrar una nota de revisión */
  async function notaAccion(id: number, action: "resolve" | "reopen" | "delete") {
    const res = await fetch("/api/notas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    if (res.ok) setRefresh((x) => x + 1);
  }

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
  }, [month, refresh]);

  // notas de revisión del mes
  useEffect(() => {
    if (!month) return;
    fetch(`/api/notas?month=${month}`)
      .then((r) => r.json())
      .then((d) => setNotas(d.notas ?? []))
      .catch(() => {});
  }, [month, refresh]);

  const tienda = api?.data?.[store];
  const dias = useMemo(() => tienda?.days ?? [], [tienda]);
  const tot = tienda?.totales;
  const maxDia = useMemo(
    () => Math.max(1, ...dias.map((d) => Math.max(d.efe.venta, d.tar.venta, d.efe.deposito ?? 0, d.tar.plink))),
    [dias],
  );
  const ver = (c: Canal) => canal === "todo" || canal === c;
  const notasKeys = new Set(notas.filter((n) => !n.resolved).map((n) => `${n.date}|${n.storeCode ?? ""}`));

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
              desglose={{ falta: tot.efeFaltaTotal, sobra: tot.efeSobraTotal }}
              extra={tot.efePendiente > 0 ? `⏳ En plazo (se consigna el día hábil sig.): ${cop(tot.efePendiente)}` : undefined} />
          )}
          {ver("datafono") && (
            <CardCanal icon={<CreditCard size={18} />} titulo="Datafono" venta={tot.tarVenta} recaudo={tot.tarPlink} faltante={tot.tarDif}
              desglose={{ falta: tot.tarFaltaTotal, sobra: tot.tarSobraTotal }}
              extra={tot.tarSinCargar > 0 ? `📄 Falta cargar Plink (llega al ${api.cut.datafono?.slice(8)}/${api.cut.datafono?.slice(5, 7)}): ${cop(tot.tarSinCargar)}` : undefined} />
          )}
          {ver("qr") && (
            <CardCanal icon={<QrCode size={18} />} titulo="QR" venta={tot.qrVenta}
              recaudo={tot.qrBanco > 0 ? tot.qrBanco : null}
              faltante={tot.qrBanco > 0 ? tot.qrVenta - tot.qrSinCargar - tot.qrBanco : null}
              desglose={tot.qrBanco > 0 ? { falta: tot.qrFaltaTotal, sobra: tot.qrSobraTotal } : undefined}
              extra={tot.qrSinCargar > 0
                ? `📄 Falta cargar extracto QR (llega al ${api.cut.qr?.slice(8)}/${api.cut.qr?.slice(5, 7)}): ${cop(tot.qrSinCargar)}`
                : tot.qrBanco > 0
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
              <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-gray-300" /> En plazo</span>
            </div>
          </div>
          <div className="mt-4 flex items-end gap-[3px] h-36">
            {dias.map((d) => {
              // faltante efectivo = venta − depósito (positivo = falta);
              // lo pendiente EN PLAZO se pinta gris (no es faltante todavía)
              const efePend = d.efe.estado === "PENDIENTE" && d.efe.enPlazo;
              const faltEfe = !efePend && d.efe.estado !== "AGRUPADO" && d.efe.estado !== "SIN_VENTA" ? -d.efe.dif : 0;
              const colEfe = efePend ? "bg-gray-300" : estadoDe(faltEfe) === "falta" ? "bg-red-400" : estadoDe(faltEfe) === "sobra" ? "bg-amber-400" : "bg-plazet-500";
              const colTar = d.tar.sinCargar ? "bg-gray-200" : estadoDe(d.tar.dif) === "falta" ? "bg-red-300" : estadoDe(d.tar.dif) === "sobra" ? "bg-amber-300" : "bg-sky-400";
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
              {ver("qr") && <th className="px-3 py-3 text-right">QR banco</th>}
              {ver("qr") && <th className="px-3 py-3 text-right">Dif QR</th>}
              {ver("mercadopago") && <th className="px-3 py-3 text-right">Mercadopago</th>}
              {ver("rappi") && <th className="px-3 py-3 text-right">Rappi</th>}
              {ver("addi") && <th className="px-3 py-3 text-right">Addi</th>}
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {dias
              .filter((d) => canal === "todo" || montoCanal(d, canal) !== 0 || (canal === "efectivo" && d.efe.venta) || (canal === "datafono" && d.tar.venta) || (canal === "qr" && d.qrBanco))
              .map((d) => (
                <FilaDia
                  key={d.date}
                  d={d}
                  ver={ver}
                  canal={canal}
                  onQrClick={(f) => setQrDia({ date: f, store, label: api.stores.find((s) => s.code === store)?.name ?? store })}
                  onTarClick={(f) => setTarDia({ date: f, store, label: api.stores.find((s) => s.code === store)?.name ?? store })}
                  onNota={setNotaDe}
                  tieneNota={notasKeys.has(`${d.date}|${store}`)}
                />
              ))}
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
          <h2 className="text-sm font-semibold text-gray-700">QR Bancolombia — por tienda</h2>
          <p className="mt-1 text-xs text-gray-500">
            Los pagos QR entran a una sola cuenta que no dice la tienda. El conciliador asigna cada pago a su
            tienda cuando encuentra el mismo valor en las ventas; lo que no calza queda &quot;sin asignar&quot;.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm lg:grid-cols-4">
            {api.stores.map((s) => {
              const t2 = api.data[s.code]?.totales;
              if (!t2 || (t2.qrVenta === 0 && t2.qrBanco === 0)) return null;
              const difQr = t2.qrVenta - t2.qrSinCargar - t2.qrBanco;
              return (
                <div key={s.code} className={`rounded-lg border p-3 ${store === s.code ? "border-plazet-300 bg-plazet-50/50" : "border-gray-200 bg-gray-50"}`}>
                  <div className="text-[11px] font-semibold text-gray-600">{s.name}</div>
                  <div className="mt-1 flex items-baseline justify-between gap-2 text-xs text-gray-500">
                    <span>venta {cop(t2.qrVenta)}</span>
                    <span>banco {cop(t2.qrBanco)}</span>
                  </div>
                  <div className={`mt-1 text-xs ${difColor(difQr)}`}>
                    {difTexto(difQr)}{t2.qrSinCargar > 0 && <span className="ml-1 text-[10px] text-gray-400">(📄 {cop(t2.qrSinCargar)} sin extracto)</span>}
                  </div>
                </div>
              );
            })}
          </div>
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
                  <div key={i} className="flex flex-wrap items-center gap-1.5 text-[11px] text-amber-800">
                    <span>
                      {r.date.slice(8)}/{r.date.slice(5, 7)} · {cop(r.amount)}{r.payer ? ` · ${r.payer}` : ""} — ¿de qué tienda es?
                    </span>
                    {r.stores.map((s) => (
                      <button
                        key={s}
                        onClick={() => asignarQr(r, s)}
                        className="rounded-full border border-amber-300 bg-white px-2 py-0.5 font-semibold text-amber-900 hover:bg-amber-100"
                        title="Asignar este pago a esta tienda (queda guardado)"
                      >
                        {api.stores.find((x) => x.code === s)?.name ?? s}
                      </button>
                    ))}
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
          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-medium text-plazet-700">Ver día a día (toda la empresa)</summary>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-8">
              {api.qrEmpresa.filter((d) => d.venta || d.banco).map((d) => (
                <button
                  key={d.date}
                  onClick={() => setQrDia({ date: d.date })}
                  title="Ver el detalle QR de este día"
                  className="flex w-full items-center justify-between border-b border-gray-100 py-1 text-left text-xs hover:bg-plazet-50"
                >
                  <span className="text-gray-500 underline decoration-dotted underline-offset-2">{d.date.slice(8)}/{d.date.slice(5, 7)}</span>
                  <span>venta {cop(d.venta)}</span>
                  <span>banco {cop(d.banco)}</span>
                  <span className={difColor(d.dif)}>{difTexto(d.dif)}</span>
                </button>
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

      {qrDia && <QrDetalleModal date={qrDia.date} store={qrDia.store} storeLabel={qrDia.label} onClose={() => setQrDia(null)} />}
      {tarDia && <DatafonoDetalleModal date={tarDia.date} store={tarDia.store} storeLabel={tarDia.label} onClose={() => setTarDia(null)} />}
      {/* selector oculto: "📎 foto" en una nota de la lista lo dispara */}
      <input
        ref={inputFotos}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => { const id = adjuntarA; const files = e.target.files; e.target.value = ""; if (id) pegarFotos(id, files); }}
      />
      {verImg && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4" onClick={() => setVerImg(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/notas/adjunto/${verImg.id}`} alt={verImg.name} className="max-h-[92vh] max-w-[95vw] rounded-lg shadow-2xl" />
        </div>
      )}
      {notaDe && (
        <NotaModal
          date={notaDe}
          store={store}
          storeName={api.stores.find((s) => s.code === store)?.name ?? store}
          canal={canal}
          onSaved={() => setRefresh((x) => x + 1)}
          onClose={() => setNotaDe(null)}
        />
      )}

      {notas.length > 0 && (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700">📝 Notas de revisión del mes</h2>
          <p className="mt-1 text-xs text-gray-500">
            Las ven todos los usuarios (cada una dice quién la escribió) y se les pueden pegar fotos de los comprobantes. Claude las lee después para analizarlas y cuadrar juntas.
          </p>
          <div className="mt-3 flex flex-col gap-1.5">
            {notas.map((n) => (
              <div key={n.id} className={`border-b border-gray-100 pb-1.5 text-xs ${n.resolved ? "opacity-50" : ""}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-gray-600">{n.date.slice(8)}/{n.date.slice(5, 7)}</span>
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-gray-500">
                    {api.stores.find((s) => s.code === n.storeCode)?.name ?? "Empresa"} · {n.channel}
                  </span>
                  <span className="flex-1 text-gray-700">{n.note}</span>
                  {n.autor && <span className="text-[10px] text-gray-400" title={n.autor}>— {autorCorto(n.autor)}</span>}
                  <button
                    onClick={() => { setAdjuntarA(n.id); inputFotos.current?.click(); }}
                    disabled={subiendo}
                    title="Pegar foto del comprobante"
                    className="text-gray-500 hover:text-plazet-700 disabled:opacity-50"
                  >
                    📎 foto
                  </button>
                  {puedeGestionar && (
                    <>
                      <button onClick={() => notaAccion(n.id, n.resolved ? "reopen" : "resolve")} className="font-medium text-plazet-700 hover:underline">
                        {n.resolved ? "reabrir" : "✓ resuelta"}
                      </button>
                      <button onClick={() => notaAccion(n.id, "delete")} className="text-gray-400 hover:text-red-600">borrar</button>
                    </>
                  )}
                </div>
                {n.adjuntos?.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-2 pl-8">
                    {n.adjuntos.map((a) => (
                      <div key={a.id} className="group relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/notas/adjunto/${a.id}`}
                          alt={a.name}
                          title={`${a.name} · ${Math.round(a.size / 1024)} KB — clic para ampliar`}
                          onClick={() => setVerImg({ id: a.id, name: a.name })}
                          className="h-16 w-16 cursor-zoom-in rounded-md border border-gray-200 object-cover hover:border-plazet-500"
                        />
                        {puedeGestionar && (
                          <button
                            onClick={() => { if (confirm("¿Borrar esta imagen?")) borrarAdjunto(a.id); }}
                            title="Borrar imagen"
                            className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] text-red-600 shadow group-hover:flex"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="mt-4 text-xs text-gray-400">
        Datos al: ventas {api.cut.sales ?? "—"} · banco {api.cut.bank ?? "—"} · QR {api.cut.qr ?? "—"} · datafono {api.cut.datafono ?? "—"}
      </p>
    </div>
  );
}

/** Detalle QR de un día: facturas (de una tienda, o de todas si se abre desde
 * el listado de empresa) vs los pagos TOTALES que entraron al banco ese día */
function QrDetalleModal({ date, store, storeLabel, onClose }: { date: string; store?: string; storeLabel?: string; onClose: () => void }) {
  interface Det {
    facturas: { invoice: string; store: string; storeName: string; amount: number; cuentaAlegra: string | null; pago: { date: string; amount: number; payer: string } | null }[];
    pagosDelDia: { amount: number; payer: string }[];
  }
  const [det, setDet] = useState<Det | null>(null);
  useEffect(() => {
    setDet(null);
    fetch(`/api/qr-dia?date=${date}${store ? `&store=${store}` : ""}`).then((r) => r.json()).then(setDet);
  }, [date, store]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-800">
            QR del {diaCorto(date)} — {storeLabel ?? "todas las tiendas"}
          </h3>
          <button onClick={onClose} className="rounded px-2 py-1 text-sm text-gray-500 hover:bg-gray-100">✕ cerrar</button>
        </div>
        {!det ? (
          <p className="mt-4 text-sm text-gray-500">Cargando…</p>
        ) : (
          <>
            <p className="mt-1 text-xs text-gray-500">
              Cada factura QR del POS con el pago del banco que mejor le calza (mismo valor ±$500, hasta 6 días).
            </p>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-[11px] uppercase tracking-wide text-gray-500">
                  {!store && <th className="py-2 pr-2">Tienda</th>}
                  <th className="py-2 pr-2">Factura</th>
                  <th className="py-2 pr-2 text-right">Valor</th>
                  <th className="py-2">Pago en el banco</th>
                </tr>
              </thead>
              <tbody>
                {det.facturas.length === 0 && (
                  <tr><td colSpan={store ? 3 : 4} className="py-3 text-gray-400">No se facturó QR ese día.</td></tr>
                )}
                {det.facturas.map((f) => (
                  <tr key={f.invoice} className="border-b border-gray-100">
                    {!store && <td className="py-2 pr-2 text-xs text-gray-500">{f.storeName}</td>}
                    <td className="py-2 pr-2 font-medium text-gray-700">{f.invoice}</td>
                    <td className="py-2 pr-2 text-right">{cop(f.amount)}</td>
                    <td className="py-2">
                      {f.pago ? (
                        f.pago.date === date ? (
                          <span className="text-plazet-700">✓ {f.pago.payer} · {cop(f.pago.amount)} (mismo día)</span>
                        ) : (
                          <span className="text-amber-600">⚠ {f.pago.payer} · {cop(f.pago.amount)} el {diaCorto(f.pago.date)}</span>
                        )
                      ) : f.cuentaAlegra && f.cuentaAlegra !== "QR Bancolombia" ? (
                        <span className="text-sky-700">→ Alegra dice: entró por <b>{f.cuentaAlegra}</b> (no es QR)</span>
                      ) : (
                        <span className="font-medium text-red-600">✗ sin pago que calce</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h4 className="mt-5 text-[11px] font-bold uppercase tracking-wide text-gray-500">
              Todos los pagos QR que entraron al banco ese día (toda la empresa)
            </h4>
            <div className="mt-2 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              {det.pagosDelDia.length === 0 && <p className="text-xs text-gray-400">Ninguno.</p>}
              {det.pagosDelDia.map((p, i) => (
                <div key={i} className="flex justify-between border-b border-gray-100 py-1 text-xs text-gray-600">
                  <span>{p.payer}</span><span>{cop(p.amount)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Detalle del datáfono de un día: cada pago con tarjeta del POS contra cada
 * transacción del reporte Conciliar, para ver CUÁL es la que no cuadra. */
function DatafonoDetalleModal({ date, store, storeLabel, onClose }: { date: string; store: string; storeLabel: string; onClose: () => void }) {
  interface Match { via: "autorizacion" | "valor+tarjeta" | "valor"; gross: number; net: number; franchise: string; cardType: string; ultimos4: string | null; autorizacion: string | null; difValor: number }
  interface Det {
    pos: { id: number; invoice: string; hora: string | null; franquicia: string | null; tipo: string; ultimos4: string | null; autorizacion: string | null; amount: number; match: Match | null }[];
    sueltas: { id: number; franchise: string; cardType: string; gross: number; net: number; depositDate: string; autorizacion: string | null; ultimos4: string | null }[];
    totales: { pos: number; datafono: number; dif: number };
    tieneAutorizacion: boolean;
  }
  const [det, setDet] = useState<Det | null>(null);
  useEffect(() => {
    setDet(null);
    fetch(`/api/datafono-dia?date=${date}&store=${store}`).then((r) => r.json()).then(setDet);
  }, [date, store]);
  const tarjeta = (f: string | null, t: string | null, u4: string | null) =>
    [f || "", t ? (t.startsWith("CR") ? "crédito" : t.startsWith("DB") || t.startsWith("DEB") ? "débito" : t.toLowerCase()) : "", u4 ? `····${u4}` : ""].filter(Boolean).join(" ");
  const sinCuadrar = det ? det.pos.filter((p) => !p.match || p.match.difValor !== 0).length + det.sueltas.length : 0;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-800">Datáfono del {diaCorto(date)} — {storeLabel}</h3>
          <button onClick={onClose} className="rounded px-2 py-1 text-sm text-gray-500 hover:bg-gray-100">✕ cerrar</button>
        </div>
        {!det ? (
          <p className="mt-4 text-sm text-gray-500">Cargando…</p>
        ) : (
          <>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
              <span>POS: <b>{cop(det.totales.pos)}</b></span>
              <span>Datáfono: <b>{cop(det.totales.datafono)}</b></span>
              <span className={difColor(det.totales.dif)}>{difTexto(det.totales.dif)}</span>
              {sinCuadrar > 0 ? (
                <span className="rounded-full bg-red-50 px-2 py-0.5 font-medium text-red-700">{sinCuadrar} transacción{sinCuadrar > 1 ? "es" : ""} por revisar</span>
              ) : (
                <span className="rounded-full bg-plazet-50 px-2 py-0.5 font-medium text-plazet-700">todo cruza una a una</span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-gray-400">
              {det.tieneAutorizacion
                ? "Cruce por código de autorización; si no lo hay, por valor y últimos 4 dígitos, y por último solo por valor."
                : "Este día el POS no trae código de autorización (formato viejo): el cruce es solo por valor."}
            </p>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-[11px] uppercase tracking-wide text-gray-500">
                  <th className="py-2 pr-2">Factura</th>
                  <th className="py-2 pr-2">Hora</th>
                  <th className="py-2 pr-2">Tarjeta (POS)</th>
                  <th className="py-2 pr-2">Aut.</th>
                  <th className="py-2 pr-2 text-right">Valor POS</th>
                  <th className="py-2">En el datáfono</th>
                </tr>
              </thead>
              <tbody>
                {det.pos.length === 0 && <tr><td colSpan={6} className="py-3 text-gray-400">No hubo pagos con tarjeta en el POS ese día.</td></tr>}
                {det.pos.map((p) => {
                  const m = p.match;
                  const mal = !m || m.difValor !== 0;
                  return (
                    <tr key={p.id} className={`border-b border-gray-100 ${mal ? "bg-red-50/60" : ""}`}>
                      <td className="py-1.5 pr-2 font-medium text-gray-700">{p.invoice}</td>
                      <td className="py-1.5 pr-2 text-xs text-gray-500">{p.hora ?? "—"}</td>
                      <td className="py-1.5 pr-2 text-xs text-gray-600">{tarjeta(p.franquicia, p.tipo, p.ultimos4) || "—"}</td>
                      <td className="py-1.5 pr-2 font-mono text-[11px] text-gray-500">{p.autorizacion ?? "—"}</td>
                      <td className="py-1.5 pr-2 text-right">{cop(p.amount)}</td>
                      <td className="py-1.5 text-xs">
                        {!m ? (
                          <span className="font-medium text-red-600">✗ no está en el datáfono</span>
                        ) : m.difValor !== 0 ? (
                          <span className="font-medium text-red-600">
                            ⚠ aut. {m.autorizacion} por <b>{cop(m.gross)}</b> ({m.difValor > 0 ? "+" : ""}{cop(m.difValor)}) · {tarjeta(m.franchise, m.cardType, m.ultimos4)}
                          </span>
                        ) : (
                          <span className="text-plazet-700">
                            ✓ {cop(m.gross)} · {tarjeta(m.franchise, m.cardType, m.ultimos4)}
                            <span className="ml-1 text-gray-400">({m.via === "autorizacion" ? `aut. ${m.autorizacion}` : m.via === "valor+tarjeta" ? "valor + tarjeta" : "solo valor"})</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <h4 className="mt-5 text-[11px] font-bold uppercase tracking-wide text-gray-500">
              Transacciones del datáfono que no tienen pago en el POS
            </h4>
            {det.sueltas.length === 0 ? (
              <p className="mt-1 text-xs text-gray-400">Ninguna.</p>
            ) : (
              <table className="mt-2 w-full text-sm">
                <tbody>
                  {det.sueltas.map((t) => (
                    <tr key={t.id} className="border-b border-gray-100 bg-amber-50/60">
                      <td className="py-1.5 pr-2 text-xs text-gray-600">{tarjeta(t.franchise, t.cardType, t.ultimos4)}</td>
                      <td className="py-1.5 pr-2 font-mono text-[11px] text-gray-500">aut. {t.autorizacion ?? "—"}</td>
                      <td className="py-1.5 pr-2 text-xs text-gray-500">canje {diaCorto(t.depositDate)}</td>
                      <td className="py-1.5 text-right font-medium text-amber-700">{cop(t.gross)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Nota de revisión de un día (la ven todos los usuarios, con su autor y sus fotos) */
interface Nota {
  id: number;
  date: string;
  storeCode: string | null;
  channel: string;
  note: string;
  autor: string | null;
  resolved: boolean;
  adjuntos: { id: number; name: string; mime: string; size: number }[];
}

/** "Paola Agreda" → "Paola Agreda"; "jero@plazet.co" → "jero" */
function autorCorto(a: string): string {
  return a.includes("@") ? a.split("@")[0] : a;
}

function NotaModal({ date, store, storeName, canal, onSaved, onClose }: { date: string; store: string; storeName: string; canal: Canal; onSaved: () => void; onClose: () => void }) {
  const [texto, setTexto] = useState("");
  const [fotos, setFotos] = useState<File[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // previsualizaciones (se liberan al cambiar la lista)
  const previews = useMemo(() => fotos.map((f) => URL.createObjectURL(f)), [fotos]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  async function guardar() {
    if (!texto.trim() || guardando) return;
    setGuardando(true);
    setError(null);
    const res = await fetch("/api/notas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, storeCode: store, channel: canal === "todo" ? "otro" : canal, note: texto }),
    });
    if (!res.ok) { setGuardando(false); setError("No se pudo guardar la nota."); return; }
    const { nota } = (await res.json()) as { nota: { id: number } };
    const errores: string[] = [];
    for (const f of fotos) { const e = await subirAdjunto(nota.id, f); if (e) errores.push(e); }
    setGuardando(false);
    if (errores.length) { setError("La nota quedó guardada, pero: " + errores.join(" · ")); onSaved(); return; }
    onSaved();
    onClose();
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-bold text-gray-800">📝 Nota — {storeName} · {diaCorto(date)}</h3>
        <textarea
          autoFocus
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={4}
          placeholder="Ej: la diferencia es un pago que la clienta hizo por Nequi / valor pendiente por confirmar con la asesora…"
          className="mt-3 w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:border-plazet-500 focus:outline-none"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="cursor-pointer rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:border-plazet-500 hover:text-plazet-700">
            📎 Pegar foto del comprobante
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => { const nuevos = Array.from(e.target.files ?? []); e.target.value = ""; if (nuevos.length) setFotos((f) => [...f, ...nuevos]); }}
            />
          </label>
          {fotos.length > 0 && <span className="text-[11px] text-gray-400">{fotos.length} foto{fotos.length > 1 ? "s" : ""} (se comprimen al subir)</span>}
        </div>
        {fotos.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {fotos.map((f, i) => (
              <div key={i} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previews[i]} alt={f.name} title={f.name} className="h-16 w-16 rounded-md border border-gray-200 object-cover" />
                <button
                  onClick={() => setFotos((arr) => arr.filter((_, j) => j !== i))}
                  title="Quitar"
                  className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] text-red-600 shadow"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="mt-1 text-[11px] text-gray-400">Queda guardada en la lista del mes, con tu nombre, para que la vean los demás y revisarla luego con Claude.</p>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100">Cancelar</button>
          <button onClick={guardar} disabled={!texto.trim() || guardando} className="rounded-lg bg-plazet-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-plazet-700 disabled:opacity-50">
            {guardando ? (fotos.length ? "Guardando y subiendo fotos…" : "Guardando…") : "Guardar nota"}
          </button>
        </div>
      </div>
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
  /** total de días con falta / total de días con sobra en el mes (se compensan en el neto) */
  desglose?: { falta: number; sobra: number };
}) {
  const { icon, titulo, venta, recaudo, faltante, extra, desglose } = props;
  // el desglose solo aporta info si hay AMBOS (faltas y sobras compensándose);
  // si todo fue en un solo sentido, el badge de arriba ya lo dice.
  const mostrarDesglose = desglose && desglose.falta >= TOL && desglose.sobra >= TOL;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-gray-500">
        <span className="text-plazet-600">{icon}</span>
        <span className="text-xs font-semibold uppercase tracking-wide">{titulo}</span>
      </div>
      <div className="mt-2 text-xl font-bold text-gray-900">{cop(venta)}</div>
      {recaudo != null && <div className="mt-1 text-xs text-gray-500">Recaudado: <span className="font-medium text-gray-700">{cop(recaudo)}</span></div>}
      {faltante != null && (
        <div className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${difBadge(faltante)}`}>
          {difTexto(faltante)}{mostrarDesglose && <span className="normal-case font-normal"> (neto del mes)</span>}
        </div>
      )}
      {mostrarDesglose && (
        <div className="mt-1.5 text-[11px] text-gray-500">
          Faltó {cop(desglose!.falta)} · Sobró {cop(desglose!.sobra)} en días distintos
        </div>
      )}
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

function FilaDia({ d, ver, canal, onQrClick, onTarClick, onNota, tieneNota }: { d: Dia; ver: (c: Canal) => boolean; canal: Canal; onQrClick?: (date: string) => void; onTarClick?: (date: string) => void; onNota?: (date: string) => void; tieneNota?: boolean }) {
  const e = d.efe;
  const mostrarDifEfe = e.estado !== "AGRUPADO" && e.estado !== "SIN_VENTA";

  // señales de alerta SOLO de los canales visibles (para que el triángulo no se
  // prenda por un canal que no estás mirando). Lo pendiente EN PLAZO no alerta.
  const efeEnPlazo = e.estado === "PENDIENTE" && e.enPlazo;
  const tonos: Estado[] = [];
  if (ver("efectivo") && mostrarDifEfe && (e.venta || e.deposito) && !efeEnPlazo)
    tonos.push(e.estado === "CUADRA" || e.estado === "MANUAL" ? "cuadra" : estadoDe(-e.dif));
  if (ver("datafono") && (d.tar.venta || d.tar.plink) && !d.tar.sinCargar) tonos.push(estadoDe(d.tar.dif));
  if (ver("qr") && (d.qrVenta || d.qrBanco) && !d.qrSinCargar) tonos.push(estadoDe(d.qrDif));
  const hayEnPlazo = ver("efectivo") && efeEnPlazo;
  const haySinCargar = (ver("datafono") && d.tar.sinCargar) || (ver("qr") && d.qrSinCargar);
  const señales = {
    hayFalta: tonos.includes("falta"),
    haySobra: tonos.includes("sobra"),
    hayDato: tonos.length > 0,
  };

  return (
    <tr className="border-b border-gray-100 hover:bg-plazet-50/40">
      <td className="whitespace-nowrap px-4 py-2 font-medium text-gray-700">
        {d.date.slice(8)}/{d.date.slice(5, 7)}
        <button
          onClick={() => onNota?.(d.date)}
          title={tieneNota ? "Este día tiene notas — agregar otra" : "Agregar nota de revisión a este día"}
          className={`ml-1.5 text-[11px] ${tieneNota ? "" : "opacity-30 hover:opacity-100"}`}
        >
          📝
        </button>
      </td>
      {ver("efectivo") && <td className="px-3 py-2 text-right">{e.venta ? cop(e.venta) : "—"}</td>}
      {ver("efectivo") && (
        <td className="px-3 py-2 text-right text-gray-600">
          {e.deposito != null ? (
            <span title={`Depositado el ${e.depositoFecha} · cubre días ${e.grupo.map((g) => g.slice(8)).join("+")}`}>
              {cop(e.deposito)}{e.grupo.length > 1 && <span className="ml-1 text-[10px] text-gray-400">({e.grupo.length}d)</span>}
              {/* El monto va en la fila del ÚLTIMO día de venta que cubre (ej. domingo);
                  aquí se aclara el día real de la consignación para que no parezca que se
                  consignó ese día. */}
              {e.depositoFecha && (
                <div className="text-[10px] leading-tight text-gray-400">consignado {diaCorto(e.depositoFecha)}</div>
              )}
            </span>
          ) : e.estado === "AGRUPADO" ? <span className="text-[11px] text-gray-400">agrupado ↓</span>
            : e.estado === "PENDIENTE" && e.enPlazo ? <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-500">⏳ en plazo</span>
            : e.estado === "PENDIENTE" ? <span className="rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-medium text-red-700">sin consignar</span>
            : "—"}
        </td>
      )}
      {ver("efectivo") && (
        <td className={`px-3 py-2 text-right ${efeEnPlazo ? "text-gray-400" : mostrarDifEfe ? difColor(-e.dif) : "text-gray-300"}`}>
          {efeEnPlazo ? "en plazo" : mostrarDifEfe && e.venta + (e.deposito ?? 0) !== 0 ? difTexto(-e.dif) : "—"}
        </td>
      )}
      {ver("datafono") && (
        <td className="px-3 py-2 text-right">
          {d.tar.venta || d.tar.plink ? (
            <button
              className="underline decoration-dotted underline-offset-2 hover:text-plazet-700"
              title="Ver el detalle del datáfono de este día (cada pago del POS vs cada transacción del datáfono)"
              onClick={() => onTarClick?.(d.date)}
            >
              {d.tar.venta ? cop(d.tar.venta) : "—"}
            </button>
          ) : "—"}
        </td>
      )}
      {ver("datafono") && <td className="px-3 py-2 text-right text-gray-600">{d.tar.sinCargar ? <span className="text-[11px] text-gray-400">📄</span> : d.tar.plink ? cop(d.tar.plink) : "—"}</td>}
      {ver("datafono") && (
        <td className={`px-3 py-2 text-right ${d.tar.sinCargar ? "text-gray-400" : difColor(d.tar.dif)}`}>
          {d.tar.sinCargar ? "sin cargar" : d.tar.venta || d.tar.plink ? difTexto(d.tar.dif) : "—"}
        </td>
      )}
      {ver("qr") && (
        <td className="px-3 py-2 text-right">
          {d.qrVenta ? (
            <button
              className="underline decoration-dotted underline-offset-2 hover:text-plazet-700"
              title="Ver el detalle QR de este día (facturas vs pagos del banco)"
              onClick={() => onQrClick?.(d.date)}
            >
              {cop(d.qrVenta)}
            </button>
          ) : "—"}
        </td>
      )}
      {ver("qr") && <td className="px-3 py-2 text-right text-gray-600">{d.qrSinCargar ? <span className="text-[11px] text-gray-400">📄</span> : d.qrBanco ? cop(d.qrBanco) : "—"}</td>}
      {ver("qr") && (
        <td className={`px-3 py-2 text-right ${d.qrSinCargar ? "text-gray-400" : d.qrVenta || d.qrBanco ? difColor(d.qrDif) : "text-gray-300"}`}>
          {d.qrSinCargar ? "sin cargar" : d.qrVenta || d.qrBanco ? difTexto(d.qrDif) : "—"}
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
          {!señales.hayFalta && !señales.haySobra && hayEnPlazo && <span className="flex items-center gap-1 text-gray-400"><Clock4 size={14} /><span className="text-[10px] font-medium">en plazo</span></span>}
          {!señales.hayFalta && !señales.haySobra && haySinCargar && <span className="flex items-center gap-1 text-gray-400"><FileClock size={14} /><span className="text-[10px] font-medium">sin cargar</span></span>}
          {!señales.hayFalta && !señales.haySobra && !hayEnPlazo && !haySinCargar && señales.hayDato && <CheckCircle2 size={15} className="text-plazet-500" />}
        </div>
      </td>
    </tr>
  );
}
