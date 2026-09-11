// Canal CENTRO COMERCIAL (Floresta: local B5 y la isla/burbuja B6).
//
// En estas tiendas la caja es del centro comercial: él recauda el EFECTIVO y
// el DATÁFONO de la tienda, hace cortes cada 10 días (1–10, 11–20, 21–fin de
// mes), DESCUENTA EL ARRIENDO de cada corte y le paga a Habbie el neto 2-3 días
// hábiles después (regla de Paola, 10/11-sep-2026). No hay consignación diaria
// ni datáfono propio: esas ventas NO van por los canales EFECTIVO/DATAFONO. Se
// arma cada corte con las ventas del POS, se liquida el arriendo del contrato
// (stores.ts → contratoCC) y se busca UN abono por el neto en el extracto de
// BANCOLOMBIA (CSV 191, la cuenta del datáfono/QR; Paola 11-sep). El QR de
// estas tiendas sí entra a Bancolombia como en las demás y va por el canal QR
// normal.
//
// Arriendo por corte (contrato Floresta): canon = MAYOR entre la cuota mínima
// decadal y el 13 % de las ventas reportadas; + publicidad 1 % de las ventas
// reportadas; + IVA 19 % sobre canon y publicidad.
//
// Supuestos hasta que llegue el primer pago real (ajustar aquí si no calzan):
//  - "ventas reportadas" = TODO lo facturado por el POS en la tienda durante el
//    corte (efectivo + datáfono + QR + otros), no solo lo que recauda el
//    centro comercial;
//  - la publicidad también lleva IVA;
//  - el neto llega a Bancolombia; si el arriendo supera lo
//    recaudado, el centro comercial no paga y Habbie le debe la diferencia
//    (estado HABBIE_PAGA, informativo).

import type { SaleInvoice, QrBankEntry } from "./types";
import { STORES, storeName } from "./stores";
import { addDaysStr, nextBusinessDay } from "./dates";
import { formatCOP } from "./money";

/** El centro comercial paga a los 2-3 días hábiles del corte */
export const CC_PLAZO_HABILES = 3;
/** Hasta cuántos días hábiles después del corte se busca el pago antes de darlo por vencido */
export const CC_VENTANA_HABILES = 6;
/** Tolerancia del cruce (la liquidación del centro comercial redondea) */
export const CC_TOLERANCIA = 1000;

export interface CortePeriodo {
  desde: string;
  hasta: string;
}

/** Corte de 10 días al que pertenece una fecha: 1–10, 11–20, 21–fin de mes */
export function corteDe(date: string): CortePeriodo {
  const ym = date.slice(0, 7);
  const d = Number(date.slice(8, 10));
  if (d <= 10) return { desde: `${ym}-01`, hasta: `${ym}-10` };
  if (d <= 20) return { desde: `${ym}-11`, hasta: `${ym}-20` };
  const [y, m] = ym.split("-").map(Number);
  const fin = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { desde: `${ym}-21`, hasta: `${ym}-${String(fin).padStart(2, "0")}` };
}

/** Suma n días hábiles a una fecha */
export function sumarHabiles(date: string, n: number, holidays: Set<string>): string {
  let cur = date;
  for (let i = 0; i < n; i++) cur = nextBusinessDay(cur, holidays);
  return cur;
}

export interface ArriendoCC {
  /** cuota mínima decadal del contrato (sin IVA) */
  canonMinimo: number;
  /** variable: % del contrato sobre las ventas reportadas (sin IVA) */
  canonVariable: number;
  /** el mayor entre mínimo y variable */
  canon: number;
  publicidad: number;
  iva: number;
  /** canon + publicidad + IVA = lo que el centro comercial descuenta del corte */
  total: number;
  /** explicación corta para la UI */
  detalle: string;
}

/** Liquida el arriendo de un corte según el contrato de la tienda */
export function liquidarArriendo(storeCode: string, ventasReportadas: number): ArriendoCC | null {
  const c = STORES.find((s) => s.code === storeCode)?.contratoCC;
  if (!c) return null;
  const canonVariable = Math.round(ventasReportadas * c.variablePct);
  const canon = Math.max(c.cuotaMinimaDecadal, canonVariable);
  const publicidad = Math.round(ventasReportadas * c.publicidadPct);
  const iva = Math.round((canon + publicidad) * c.ivaPct);
  const total = canon + publicidad + iva;
  const pct = (p: number) => `${Math.round(p * 1000) / 10} %`;
  const detalle =
    canon === c.cuotaMinimaDecadal
      ? `Canon mínimo decadal ${formatCOP(c.cuotaMinimaDecadal)} (el ${pct(c.variablePct)} de ${formatCOP(ventasReportadas)} = ${formatCOP(canonVariable)} no lo supera)`
      : `Canon ${pct(c.variablePct)} de ${formatCOP(ventasReportadas)} = ${formatCOP(canonVariable)} (supera el mínimo ${formatCOP(c.cuotaMinimaDecadal)})`;
  return {
    canonMinimo: c.cuotaMinimaDecadal,
    canonVariable,
    canon,
    publicidad,
    iva,
    total,
    detalle: `${detalle} + publicidad ${pct(c.publicidadPct)} ${formatCOP(publicidad)} + IVA ${pct(c.ivaPct)} ${formatCOP(iva)}`,
  };
}

export interface PagoCC {
  cuenta: "ALIANZA" | "BANCOLOMBIA";
  date: string;
  amount: number;
  concept: string;
}

export type EstadoCorteCC = "EN_PLAZO" | "VENCIDO" | "CUADRA" | "DIFERENCIA" | "HABBIE_PAGA";

export interface CorteCC {
  storeCode: string;
  storeName: string;
  desde: string;
  hasta: string;
  dias: { date: string; efectivo: number; datafono: number; otros: number }[];
  ventaEfectivo: number;
  ventaDatafono: number;
  /** QR + Mercadopago + otros métodos que NO recauda el centro comercial */
  ventaOtros: number;
  /** base del arriendo: todo lo facturado en la tienda en el corte */
  ventasReportadas: number;
  /** efectivo + datáfono = lo que recauda el centro comercial */
  recaudado: number;
  arriendo: ArriendoCC | null;
  /** recaudado − arriendo: lo que el centro comercial debe girar (negativo = Habbie le debe) */
  netoEsperado: number;
  /** día hábil en que se espera el pago (hasta + CC_PLAZO_HABILES) */
  pagoEsperado: string;
  /** último día hábil en que se busca el pago (hasta + CC_VENTANA_HABILES) */
  pagoLimite: string;
  pago: PagoCC | null;
  /** pago − netoEsperado (negativo = el centro comercial pagó de menos) */
  dif: number;
  estado: EstadoCorteCC;
  nota?: string;
}

/**
 * Arma los cortes de las tiendas de centro comercial, liquida el arriendo y
 * les busca el pago del neto. `ventasCC` = TODAS las ventas (cualquier
 * método) de las tiendas con recaudo CENTRO_COMERCIAL. Devuelve también los
 * abonos usados, para que el cruce QR no los tome como pagos de clientes.
 */
export function calcularCortesCC(
  ventasCC: SaleInvoice[],
  qrBank: QrBankEntry[],
  holidays: Set<string>,
  tolerance: number = CC_TOLERANCIA,
): { cortes: CorteCC[]; pagosUsados: PagoCC[] } {
  const grupos = new Map<string, CorteCC>();
  for (const s of ventasCC) {
    if (!s.storeCode) continue;
    const c = corteDe(s.date);
    const key = `${s.storeCode}|${c.desde}`;
    let g = grupos.get(key);
    if (!g) {
      g = {
        storeCode: s.storeCode,
        storeName: storeName(s.storeCode),
        desde: c.desde,
        hasta: c.hasta,
        dias: [],
        ventaEfectivo: 0,
        ventaDatafono: 0,
        ventaOtros: 0,
        ventasReportadas: 0,
        recaudado: 0,
        arriendo: null,
        netoEsperado: 0,
        pagoEsperado: sumarHabiles(c.hasta, CC_PLAZO_HABILES, holidays),
        pagoLimite: sumarHabiles(c.hasta, CC_VENTANA_HABILES, holidays),
        pago: null,
        dif: 0,
        estado: "EN_PLAZO",
      };
      grupos.set(key, g);
    }
    let dia = g.dias.find((d) => d.date === s.date);
    if (!dia) {
      dia = { date: s.date, efectivo: 0, datafono: 0, otros: 0 };
      g.dias.push(dia);
    }
    if (s.method === "EFECTIVO") {
      dia.efectivo += s.amount;
      g.ventaEfectivo += s.amount;
    } else if (s.method === "TARJETA_CREDITO" || s.method === "TARJETA_DEBITO") {
      dia.datafono += s.amount;
      g.ventaDatafono += s.amount;
    } else {
      dia.otros += s.amount;
      g.ventaOtros += s.amount;
    }
    g.ventasReportadas += s.amount;
  }
  const cortes = [...grupos.values()]
    .filter((g) => Math.round(g.ventasReportadas) !== 0)
    .sort((a, b) => a.hasta.localeCompare(b.hasta) || a.storeCode.localeCompare(b.storeCode));
  for (const g of cortes) {
    g.dias.sort((a, b) => a.date.localeCompare(b.date));
    g.recaudado = g.ventaEfectivo + g.ventaDatafono;
    g.arriendo = liquidarArriendo(g.storeCode, g.ventasReportadas);
    g.netoEsperado = g.recaudado - (g.arriendo?.total ?? 0);
  }
  if (cortes.length === 0) return { cortes, pagosUsados: [] };

  // Candidatos a pago del centro comercial: el giro entra a BANCOLOMBIA (cuenta
  // del datáfono/QR, CSV 191 — Paola, 11-sep): abonos que no son pagos QR/llave
  // de clientes. La cuenta de efectivo (Alianza) no se mira.
  const esQrCliente = (concept: string) => /^PAGO (QR|LLAVE)/i.test(concept.trim());
  const candidatos: (PagoCC & { used: boolean })[] = qrBank
    .filter((q) => q.amount > 0 && !esQrCliente(q.concept))
    .map((q) => ({ cuenta: "BANCOLOMBIA" as const, date: q.date, amount: q.amount, concept: q.concept, used: false }));
  const corteBanco = qrBank.map((q) => q.date).sort().pop() ?? null;
  const pagosUsados: PagoCC[] = [];
  const porValor = (total: number) => (a: PagoCC, b: PagoCC) =>
    Math.abs(a.amount - total) - Math.abs(b.amount - total) || a.date.localeCompare(b.date);
  const resumenArriendo = (g: CorteCC) =>
    g.arriendo
      ? `Recaudado ${formatCOP(g.recaudado)} − arriendo ${formatCOP(g.arriendo.total)} (IVA incl.) = ${formatCOP(g.netoEsperado)} a recibir.`
      : `Recaudado ${formatCOP(g.recaudado)} (sin contrato configurado: no se descuenta arriendo).`;

  const asignar = (g: CorteCC, c: PagoCC & { used: boolean }, monto: number, nota?: string) => {
    c.used = true;
    const pago: PagoCC = { cuenta: c.cuenta, date: c.date, amount: monto, concept: c.concept };
    g.pago = pago;
    g.dif = monto - g.netoEsperado;
    g.estado = Math.abs(g.dif) <= tolerance ? "CUADRA" : "DIFERENCIA";
    pagosUsados.push({ ...pago, amount: c.amount });
    g.nota = nota ?? resumenArriendo(g);
    if (!nota && g.estado === "DIFERENCIA")
      g.nota += ` El centro comercial pagó ${formatCOP(monto)} (${c.concept}).`;
  };

  for (const g of cortes) {
    if (g.pago) continue;
    if (g.netoEsperado <= 0) {
      // el arriendo se come lo recaudado: no hay giro que esperar
      g.estado = "HABBIE_PAGA";
      g.nota = `${resumenArriendo(g)} El arriendo supera lo recaudado: Habbie le debe ${formatCOP(-g.netoEsperado)} al centro comercial por este corte.`;
      continue;
    }
    const desdePago = addDaysStr(g.hasta, 1);
    const enVentana = candidatos.filter((c) => !c.used && c.date >= desdePago && c.date <= g.pagoLimite);

    // 1) un pago por el neto del corte (± tolerancia)
    const exacto = enVentana.filter((c) => Math.abs(c.amount - g.netoEsperado) <= tolerance).sort(porValor(g.netoEsperado))[0];
    if (exacto) {
      asignar(g, exacto, exacto.amount);
      continue;
    }
    // 2) un solo pago que cubre los cortes del MISMO período de las dos
    //    tiendas del centro comercial (local + isla)
    const hermanos = cortes.filter((h) => h !== g && !h.pago && h.hasta === g.hasta && h.netoEsperado > 0);
    const suma = g.netoEsperado + hermanos.reduce((a, h) => a + h.netoEsperado, 0);
    const conjunto = hermanos.length > 0 ? enVentana.filter((c) => Math.abs(c.amount - suma) <= tolerance).sort(porValor(suma))[0] : undefined;
    if (conjunto) {
      const nota = `Pago conjunto de ${[g, ...hermanos].map((h) => h.storeName).join(" + ")} (${formatCOP(conjunto.amount)}). `;
      asignar(g, conjunto, g.netoEsperado, nota + resumenArriendo(g));
      for (const h of hermanos) {
        h.pago = { cuenta: conjunto.cuenta, date: conjunto.date, amount: h.netoEsperado, concept: conjunto.concept };
        h.dif = 0;
        h.estado = "CUADRA";
        h.nota = nota + resumenArriendo(h);
      }
      continue;
    }
    // 3) el rótulo identifica al centro comercial aunque el valor no calce
    const porNombre = enVentana.filter((c) => /FLORESTA/i.test(c.concept)).sort(porValor(g.netoEsperado))[0];
    if (porNombre) {
      asignar(g, porNombre, porNombre.amount);
      continue;
    }
    if (corteBanco && corteBanco > g.pagoLimite) {
      g.estado = "VENCIDO";
      g.nota = `${resumenArriendo(g)} Sin pago del centro comercial entre el ${desdePago} y el ${g.pagoLimite} (extractos cargados hasta el ${corteBanco}).`;
    } else {
      g.estado = "EN_PLAZO";
      g.nota = resumenArriendo(g);
    }
  }
  return { cortes, pagosUsados };
}
