"use client";

// "Hoy" (antes Tablero, rediseño sep-2026): la plata que importa arriba, la
// lista de lo que hay que atender ordenada por urgencia y monto, y cada tienda
// en una tarjeta con su barra de estado. Todo sale de /api/dashboard (el mismo
// cálculo de Tiendas) + las notas de revisión: un día con nota cuenta como
// "explicado". No cambia ninguna regla de conciliación.

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/ui";

const TOL = 500;
const cop = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
const MESES = ["", "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const mesLabel = (m: string) => `${MESES[Number(m.slice(5, 7))].replace(/^./, (c) => c.toUpperCase())} ${m.slice(0, 4)}`;
const diaMes = (f: string) => `${Number(f.slice(8))} ${MESES[Number(f.slice(5, 7))].slice(0, 3)}`;
/** "20, 21 y 22 sep" */
function listaDias(fechas: string[]): string {
  if (fechas.length === 0) return "";
  const mes = MESES[Number(fechas[0].slice(5, 7))].slice(0, 3);
  const dias = fechas.map((f) => String(Number(f.slice(8))));
  const txt = dias.length === 1 ? dias[0] : `${dias.slice(0, -1).join(", ")} y ${dias[dias.length - 1]}`;
  return `${txt} ${mes}`;
}

interface Dia {
  date: string;
  efe: { venta: number; deposito: number | null; dif: number; estado: string; qrAlert?: boolean; nota?: string; enPlazo?: boolean };
  tar: { venta: number; plink: number; falta: number; sobra: number; sinCargar: boolean; cc?: boolean };
  qrVenta: number; qrBanco: number; qrDif: number; qrSinCargar: boolean;
}
interface Corte { desde: string; hasta: string; netoEsperado: number; pagoLimite: string; dif: number; estado: string }
interface ApiData {
  months: string[]; month: string;
  stores: { code: string; name: string; recaudo?: string | null }[];
  data: Record<string, { days: Dia[]; cortes?: Corte[] }>;
  qrResumen: { revisar: { date: string; amount: number; payer: string; stores: string[] }[] };
  cut: { sales: string | null; bank: string | null; qr: string | null; datafono: string | null };
}
interface Nota { date: string; storeCode: string | null }

type Nivel = "alta" | "media" | "qr";
interface Item { nivel: Nivel; tienda: string; titulo: string; detalle: string; monto: number; href: string; accion: string }
const ORDEN: Record<Nivel, number> = { alta: 0, media: 1, qr: 2 };
const PUNTO: Record<Nivel, string> = { alta: "bg-red-500", media: "bg-amber-500", qr: "bg-violet-500" };
const COLOR: Record<Nivel, string> = { alta: "text-red-600", media: "text-amber-600", qr: "text-violet-600" };

interface Tienda {
  code: string; name: string;
  estado: { texto: string; clase: string };
  linea: { texto: string; monto: string; clase: string };
  ok: number; dif: number; falta: number;
}

export default function HoyPage() {
  const [month, setMonth] = useState("");
  const [api, setApi] = useState<ApiData | null>(null);
  const [notas, setNotas] = useState<Nota[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/dashboard${month ? `?month=${month}` : ""}`)
      .then((r) => r.json())
      .then((d: ApiData) => {
        if (!vivo) return;
        setApi(d);
        setCargando(false);
        return fetch(`/api/notas?month=${d.month}`).then((r) => r.json()).then((n) => vivo && setNotas(n.notas ?? []));
      })
      .catch(() => vivo && setCargando(false));
    return () => { vivo = false; };
  }, [month]);

  const r = useMemo(() => {
    if (!api) return null;
    const conNota = new Set(notas.map((n) => `${n.date}|${n.storeCode ?? ""}`));
    const items: Item[] = [];
    const tiendas: Tienda[] = [];
    let faltaConsignar = 0, tiendasFalta = 0, sinExplicar = 0, diasSinExplicar = 0, posibleQr = 0, casosQr = 0, diasOk = 0, diasConDato = 0;

    for (const s of api.stores) {
      const t = api.data[s.code];
      if (!t) continue;
      const href = (tab: string) => `/tiendas?store=${s.code}&tab=${tab}`;
      const sinConsignar: string[] = []; let montoSinConsignar = 0;
      const difs: Record<string, { dias: string[]; monto: number }> = {};
      const qrs: { dias: string[]; monto: number } = { dias: [], monto: 0 };
      let ok = 0, dif = 0, falta = 0;

      for (const d of t.days) {
        const e = d.efe;
        const explicado = conNota.has(`${d.date}|${s.code}`);
        const tonos: ("ok" | "dif" | "falta")[] = [];
        // efectivo
        if (e.estado === "PENDIENTE" && !e.enPlazo && e.venta > 0) {
          sinConsignar.push(d.date); montoSinConsignar += e.venta; tonos.push("falta");
        } else if ((e.estado === "DIFERENCIA" || e.estado === "SIN_CONCILIAR") && Math.abs(e.dif) >= TOL) {
          const falt = -e.dif; // + falta, − sobra
          tonos.push(falt > 0 ? "falta" : "dif");
          if (e.qrAlert) { qrs.dias.push(d.date); qrs.monto += Math.abs(falt); }
          else if (!explicado) { (difs.Efectivo ??= { dias: [], monto: 0 }).dias.push(d.date); difs.Efectivo.monto += Math.abs(falt); }
        } else if (e.estado === "CUADRA" || e.estado === "MANUAL" || (e.estado === "DIFERENCIA" && Math.abs(e.dif) < TOL)) {
          tonos.push("ok");
        }
        // datáfono: diferencia neta del día (lo mismo que muestra Tiendas)
        if (!d.tar.sinCargar && !d.tar.cc && (d.tar.venta || d.tar.plink)) {
          const neto = d.tar.falta - d.tar.sobra;
          if (Math.abs(neto) >= TOL) {
            tonos.push(neto > 0 ? "falta" : "dif");
            if (!explicado) { (difs["Datáfono"] ??= { dias: [], monto: 0 }).dias.push(d.date); difs["Datáfono"].monto += Math.abs(neto); }
          } else tonos.push("ok");
        }
        // QR asignado a la tienda
        if (!d.qrSinCargar && (d.qrVenta || d.qrBanco)) {
          if (Math.abs(d.qrDif) >= TOL) {
            tonos.push(d.qrDif > 0 ? "falta" : "dif");
            if (!explicado) { (difs.QR ??= { dias: [], monto: 0 }).dias.push(d.date); difs.QR.monto += Math.abs(d.qrDif); }
          } else tonos.push("ok");
        }
        if (tonos.length) {
          diasConDato++;
          if (tonos.includes("falta")) falta++;
          else if (tonos.includes("dif")) dif++;
          else { ok++; diasOk++; }
        }
      }

      if (sinConsignar.length) {
        faltaConsignar += montoSinConsignar; tiendasFalta++;
        items.push({ nivel: "alta", tienda: s.name, titulo: "Efectivo sin consignar", detalle: listaDias(sinConsignar), monto: montoSinConsignar, href: href("dia"), accion: "Ver" });
      }
      for (const [canal, v] of Object.entries(difs)) {
        sinExplicar += v.monto; diasSinExplicar += v.dias.length;
        items.push({
          nivel: "media", tienda: s.name, titulo: `${canal} con diferencia`,
          detalle: `${listaDias(v.dias)} · sin nota de revisión`, monto: v.monto, href: href("dia"), accion: "Explicar",
        });
      }
      if (qrs.dias.length) {
        posibleQr += qrs.monto; casosQr += qrs.dias.length;
        items.push({ nivel: "qr", tienda: s.name, titulo: "¿Pagaron por QR y faltó en efectivo?", detalle: listaDias(qrs.dias), monto: qrs.monto, href: href("dia"), accion: "Revisar" });
      }
      // centro comercial (Floresta): cortes vencidos o con diferencia
      let corteVencido = 0;
      for (const c of t.cortes ?? []) {
        if (c.estado === "VENCIDO") {
          corteVencido += c.netoEsperado;
          items.push({ nivel: "alta", tienda: s.name, titulo: "Corte del centro comercial sin pagar", detalle: `corte ${diaMes(c.desde)} – ${diaMes(c.hasta)} · debía llegar el ${diaMes(c.pagoLimite)}`, monto: c.netoEsperado, href: href("canal"), accion: "Ver" });
        } else if (c.estado === "DIFERENCIA" && Math.abs(c.dif) >= TOL) {
          items.push({ nivel: "media", tienda: s.name, titulo: "Corte del centro comercial con diferencia", detalle: `corte ${diaMes(c.desde)} – ${diaMes(c.hasta)}`, monto: Math.abs(c.dif), href: href("canal"), accion: "Ver" });
        }
      }

      const montoDifs = Object.values(difs).reduce((a, v) => a + v.monto, 0);
      tiendas.push({
        code: s.code, name: s.name, ok, dif, falta,
        estado: montoSinConsignar > 0 ? { texto: "Falta", clase: "bg-red-50 text-red-700" }
          : corteVencido > 0 ? { texto: "Corte pendiente", clase: "bg-amber-50 text-amber-700" }
          : montoDifs > 0 ? { texto: "Diferencia", clase: "bg-amber-50 text-amber-700" }
          : { texto: "Al día", clase: "bg-plazet-50 text-plazet-700" },
        linea: montoSinConsignar > 0 ? { texto: "Sin consignar", monto: cop(montoSinConsignar), clase: "text-red-600" }
          : corteVencido > 0 ? { texto: "Por recibir del centro comercial", monto: cop(corteVencido), clase: "text-amber-600" }
          : montoDifs > 0 ? { texto: "Sin explicar", monto: cop(montoDifs), clase: "text-amber-600" }
          : { texto: "Pendiente", monto: "$0", clase: "text-gray-900" },
      });
    }

    // pagos QR que el conciliador no pudo asignar a una sola tienda
    const revisar = api.qrResumen?.revisar ?? [];
    if (revisar.length) {
      items.push({
        nivel: "qr", tienda: "Empresa", titulo: `${revisar.length} pago${revisar.length === 1 ? "" : "s"} QR sin tienda asignada`,
        detalle: "podría ser de varias tiendas: asígnalo a mano", monto: revisar.reduce((a, q) => a + q.amount, 0),
        href: "/tiendas?tab=qrmp", accion: "Asignar",
      });
    }

    items.sort((a, b) => ORDEN[a.nivel] - ORDEN[b.nivel] || b.monto - a.monto);
    return {
      items, tiendas, faltaConsignar, tiendasFalta, sinExplicar, diasSinExplicar, posibleQr, casosQr,
      pctOk: diasConDato ? Math.round((diasOk / diasConDato) * 100) : null,
    };
  }, [api, notas]);

  if (cargando && !api) {
    return (<><PageHeader title="Hoy" /><div className="p-4 text-gray-500 sm:p-8">Cargando…</div></>);
  }
  if (!api || !r || !api.months?.length) {
    return (<><PageHeader title="Hoy" /><div className="p-4 text-gray-500 sm:p-8">Todavía no hay datos cargados.</div></>);
  }

  return (
    <>
      <PageHeader title="Hoy" subtitle={`${mesLabel(api.month)} · ${r.items.length ? "con pendientes por atender" : "todo al día"}`}>
        <select
          value={api.month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-[10px] border border-gray-200 bg-white px-3 py-2 text-sm font-semibold"
        >
          {api.months.map((m) => <option key={m} value={m}>{mesLabel(m)}</option>)}
        </select>
      </PageHeader>

      <div className="space-y-4 p-4 sm:p-8">
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
          <span>Datos al: ventas <b className="font-semibold text-gray-600">{api.cut.sales ? diaMes(api.cut.sales) : "—"}</b></span>
          <span>banco <b className="font-semibold text-gray-600">{api.cut.bank ? diaMes(api.cut.bank) : "—"}</b></span>
          <span>QR <b className="font-semibold text-gray-600">{api.cut.qr ? diaMes(api.cut.qr) : "—"}</b></span>
          <span>datáfono <b className="font-semibold text-gray-600">{api.cut.datafono ? diaMes(api.cut.datafono) : "—"}</b></span>
        </p>

        {/* la plata que importa */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Falta por consignar" valor={cop(r.faltaConsignar)} clase={r.faltaConsignar ? "text-red-600" : "text-gray-900"}
            nota={r.tiendasFalta ? `efectivo de ${r.tiendasFalta} tienda${r.tiendasFalta === 1 ? "" : "s"}` : "nada vencido"} />
          <Kpi label="Diferencias sin explicar" valor={cop(r.sinExplicar)} clase={r.sinExplicar ? "text-amber-600" : "text-gray-900"}
            nota={r.diasSinExplicar ? `${r.diasSinExplicar} día${r.diasSinExplicar === 1 ? "" : "s"} sin nota` : "todo explicado"} />
          <Kpi label="Posible QR a cuenta equivocada" valor={cop(r.posibleQr)} clase={r.posibleQr ? "text-violet-600" : "text-gray-900"}
            nota={`${r.casosQr} caso${r.casosQr === 1 ? "" : "s"}`} />
          <Kpi label="Cuadra" valor={r.pctOk === null ? "—" : `${r.pctOk} %`} clase="text-plazet-600" nota="de los días con datos" />
        </div>

        {/* para atender */}
        <section className="rounded-2xl border border-gray-200 bg-white">
          <h2 className="flex items-center justify-between px-4 pb-2 pt-4 text-sm font-semibold text-gray-900 sm:px-5">
            <span>{r.items.length ? `Para atender · ${r.items.length}` : "Para atender"}</span>
            <span className="font-sans text-xs font-medium text-gray-400">por urgencia y monto</span>
          </h2>
          {r.items.length === 0 ? (
            <p className="px-4 pb-5 text-sm text-gray-500 sm:px-5">Nada pendiente este mes. ¡Todo cuadra o está explicado! 🎉</p>
          ) : (
            <ul>
              {r.items.map((it, i) => (
                <li key={i} className="border-t border-gray-100">
                  <Link href={it.href} className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50 sm:px-5">
                    <span className={`h-2 w-2 flex-shrink-0 rounded-full ${PUNTO[it.nivel]}`} />
                    <span className="hidden w-28 flex-shrink-0 truncate text-xs text-gray-400 sm:block">{it.tienda}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-gray-900">
                        <span className="sm:hidden">{it.tienda} · </span>{it.titulo}
                      </span>
                      <span className="block truncate text-xs text-gray-500">{it.detalle}</span>
                    </span>
                    <span className={`whitespace-nowrap text-sm font-bold tabular-nums ${COLOR[it.nivel]}`}>{cop(it.monto)}</span>
                    <span className="flex flex-shrink-0 items-center text-sm font-semibold text-plazet-600">
                      <span className="hidden md:inline">{it.accion}</span>
                      <ChevronRight size={16} className="transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* por tienda */}
        <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
          <h2 className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold text-gray-900">
            <span>Por tienda</span>
            <span className="font-sans text-xs font-medium text-gray-400">verde cuadra · ámbar diferencia · rojo falta</span>
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {r.tiendas.map((t) => {
              const total = Math.max(1, t.ok + t.dif + t.falta);
              return (
                <Link key={t.code} href={`/tiendas?store=${t.code}&tab=dia`} className="rounded-xl border border-gray-200 p-3.5 transition-colors hover:border-plazet-300">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-gray-900">{t.name}</span>
                    <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${t.estado.clase}`}>{t.estado.texto}</span>
                  </div>
                  <div className="mt-2.5 flex h-1.5 overflow-hidden rounded-full bg-gray-100" title={`${t.ok} días cuadran · ${t.dif} con diferencia · ${t.falta} con faltante`}>
                    <i className="block h-full bg-plazet-500" style={{ width: `${(t.ok / total) * 100}%` }} />
                    <i className="block h-full bg-amber-400" style={{ width: `${(t.dif / total) * 100}%` }} />
                    <i className="block h-full bg-red-500" style={{ width: `${(t.falta / total) * 100}%` }} />
                  </div>
                  <div className="mt-2 flex justify-between text-xs text-gray-500">
                    <span>{t.linea.texto}</span>
                    <span className={`font-bold tabular-nums ${t.linea.clase}`}>{t.linea.monto}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </>
  );
}

function Kpi({ label, valor, clase, nota }: { label: string; valor: string; clase: string; nota: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3.5">
      <div className="truncate text-xs text-gray-500">{label}</div>
      <div className={`mt-1 truncate text-lg font-bold tabular-nums sm:text-[22px] ${clase}`}>{valor}</div>
      <div className="truncate text-[11.5px] text-gray-400">{nota}</div>
    </div>
  );
}
