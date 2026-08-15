// Totalizado general (todo el histórico cargado): cuánto falta o sobra por
// método de pago, por mes y por tienda. Convención unificada con el tablero
// de tiendas: faltante = venta − recaudo (falta = venta>recaudo, sobra =
// recaudo>venta). En ConciliationResult, difference = recaudo − venta para
// EFECTIVO/DATAFONO/QR, así que faltante = -difference en esos 3 canales.

import { prisma } from "@/lib/db";
import { computeLedger } from "@/lib/ledger";
import { loadHolidays } from "@/lib/process";
import { nextBusinessDay } from "@/lib/dates";
import { STORES, storeName } from "@/lib/stores";

export const runtime = "nodejs";

interface Totales {
  venta: number;
  recaudo: number;
  falta: number;
  sobra: number;
}
const vacio = (): Totales => ({ venta: 0, recaudo: 0, falta: 0, sobra: 0 });
function acumula(t: Totales, venta: number, recaudo: number) {
  t.venta += venta;
  t.recaudo += recaudo;
  const faltante = venta - recaudo;
  if (faltante > 0) t.falta += faltante;
  else t.sobra += -faltante;
}

export async function GET() {
  const [ledger, holidaysArr, salesRows, mpRows] = await Promise.all([
    computeLedger(),
    loadHolidays(),
    prisma.sale.findMany(),
    prisma.mercadopagoEntry.findMany(),
  ]);
  const holidays = new Set(holidaysArr);
  const stores = STORES.filter((s) => s.code !== "PRIN");

  const porMetodo: Record<string, Totales> = {
    efectivo: vacio(),
    datafono: vacio(),
    qr: vacio(),
    mercadopago: vacio(),
  };
  const porMes = new Map<string, Totales>(); // suma efectivo+datafono+qr+mercadopago
  const porTienda = new Map<string, Totales>(); // suma efectivo+datafono (únicos con tienda)
  const mesOf = (t: Map<string, Totales>, k: string) => {
    if (!t.has(k)) t.set(k, vacio());
    return t.get(k)!;
  };

  // ── EFECTIVO / DATAFONO / QR: desde los resultados ya calculados del motor.
  // Se excluyen los SIN_CONCILIAR "no comparable" / "faltan ventas previas":
  // no es plata faltante, es que aún no se ha cargado el extracto/reporte de
  // ese borde de fechas (si no, "falta" queda inflada con huecos de archivo).
  const esHuecoDeArchivo = (r: (typeof ledger.summary.results)[number]) =>
    r.status === "SIN_CONCILIAR" &&
    (r.note?.includes("no comparable") || r.note?.includes("Faltan ventas previas"));
  for (const r of ledger.summary.results) {
    if (r.channel !== "EFECTIVO" && r.channel !== "DATAFONO" && r.channel !== "QR") continue;
    if (esHuecoDeArchivo(r)) continue;
    const recaudo = r.depositAmount;
    const venta = r.salesAmount;
    const metodo = r.channel === "EFECTIVO" ? "efectivo" : r.channel === "DATAFONO" ? "datafono" : "qr";
    acumula(porMetodo[metodo], venta, recaudo);
    const mes = r.month ?? r.depositDate.slice(0, 7);
    acumula(mesOf(porMes, mes), venta, recaudo);
    if ((r.channel === "EFECTIVO" || r.channel === "DATAFONO") && r.storeCode) {
      acumula(mesOf(porTienda, r.storeCode), venta, recaudo);
    }
  }

  // ── EFECTIVO pendiente (aún sin consignar): solo cuenta como "falta" lo
  // VENCIDO (ya debió consignarse); lo "en plazo" (se consigna el día hábil
  // siguiente) no es un problema todavía, igual que en el tablero de tiendas.
  for (const p of ledger.summary.pendings) {
    for (const d of p.days) {
      const enPlazo = ledger.cut.bank != null && nextBusinessDay(d.date, holidays) > ledger.cut.bank;
      if (enPlazo) continue;
      porMetodo.efectivo.venta += d.amount;
      porMetodo.efectivo.falta += d.amount;
      const mes = d.date.slice(0, 7);
      const tm = mesOf(porMes, mes);
      tm.venta += d.amount;
      tm.falta += d.amount;
      if (p.storeCode) {
        const tt = mesOf(porTienda, p.storeCode);
        tt.venta += d.amount;
        tt.falta += d.amount;
      }
    }
  }

  // ── MERCADO PAGO: venta (POS, a nivel empresa) vs bruto liquidado, por día
  const mpVentaDia = new Map<string, number>();
  for (const s of salesRows) {
    if (!s.bodega.toUpperCase().includes("MERCADO")) continue;
    mpVentaDia.set(s.date, (mpVentaDia.get(s.date) ?? 0) + s.amount);
  }
  const mpBrutoDia = new Map<string, number>();
  for (const e of mpRows) mpBrutoDia.set(e.date, (mpBrutoDia.get(e.date) ?? 0) + e.bruto);
  const mpDias = new Set<string>([...mpVentaDia.keys(), ...mpBrutoDia.keys()]);
  for (const d of mpDias) {
    const venta = mpVentaDia.get(d) ?? 0;
    const bruto = mpBrutoDia.get(d) ?? 0;
    acumula(porMetodo.mercadopago, venta, bruto);
    acumula(mesOf(porMes, d.slice(0, 7)), venta, bruto);
  }

  // ── ADDI / RAPPI / NEQUI / OTROS: sin archivo de recaudo cargado en la app
  // (se concilian aparte); se muestra solo la venta, informativo.
  const otrosVenta = new Map<string, number>(); // plataforma -> venta
  const plataforma = (bodega: string): string => {
    const b = bodega.toUpperCase();
    if (b.includes("RAPPI")) return "Rappi";
    if (b.includes("ADDI")) return "Addi";
    if (b.includes("NEQUI")) return "Nequi";
    if (b.includes("MERCADO")) return "";
    return "Otros";
  };
  for (const s of salesRows) {
    if (s.method !== "OTRO") continue;
    const p = plataforma(s.bodega);
    if (!p) continue;
    otrosVenta.set(p, (otrosVenta.get(p) ?? 0) + s.amount);
  }

  const toArray = (t: Totales) => ({ venta: t.venta, recaudo: t.recaudo, falta: t.falta, sobra: t.sobra, neto: t.venta - t.recaudo });

  return Response.json({
    cut: ledger.cut,
    porMetodo: {
      efectivo: toArray(porMetodo.efectivo),
      datafono: toArray(porMetodo.datafono),
      qr: toArray(porMetodo.qr),
      mercadopago: toArray(porMetodo.mercadopago),
    },
    otrosVenta: [...otrosVenta.entries()].map(([plataforma, venta]) => ({ plataforma, venta })),
    porMes: [...porMes.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([mes, t]) => ({ mes, ...toArray(t) })),
    porTienda: stores
      .map((s) => ({ code: s.code, name: storeName(s.code), ...toArray(porTienda.get(s.code) ?? vacio()) }))
      .filter((s) => s.venta > 0 || s.recaudo > 0),
  });
}
