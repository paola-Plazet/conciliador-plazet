// Canal CENTRO COMERCIAL (Floresta: tiendas B4 y B5).
//
// En estas tiendas la caja es del centro comercial: él recauda el EFECTIVO y
// el DATÁFONO de la tienda, hace cortes cada 10 días (1–10, 11–20, 21–fin de
// mes) y le paga a Habbie 2-3 días hábiles después de cada corte (regla de
// Paola, 10-sep-2026). No hay consignación diaria ni datáfono propio, así que
// esas ventas NO van por los canales EFECTIVO/DATAFONO: se arma cada corte con
// las ventas del POS y se busca UN pago del centro comercial por el total en
// los extractos cargados (Alianza = cuenta de efectivo, Bancolombia = cuenta
// del datáfono/QR). El QR de estas tiendas sí entra a Bancolombia como en las
// demás y va por el canal QR normal.
//
// Supuestos hasta que llegue el primer pago real: el pago llega completo (sin
// comisión descontada) y a una de las dos cuentas cargadas. Si el centro
// comercial descuenta algo o paga a otra cuenta, ajustar aquí.

import type { SaleInvoice, BankCashEntry, QrBankEntry } from "./types";
import { storeName } from "./stores";
import { addDaysStr, nextBusinessDay } from "./dates";
import { formatCOP } from "./money";

/** El centro comercial paga a los 2-3 días hábiles del corte */
export const CC_PLAZO_HABILES = 3;
/** Hasta cuántos días hábiles después del corte se busca el pago antes de darlo por vencido */
export const CC_VENTANA_HABILES = 6;

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

export interface PagoCC {
  cuenta: "ALIANZA" | "BANCOLOMBIA";
  date: string;
  amount: number;
  concept: string;
}

export type EstadoCorteCC = "EN_PLAZO" | "VENCIDO" | "CUADRA" | "DIFERENCIA";

export interface CorteCC {
  storeCode: string;
  storeName: string;
  desde: string;
  hasta: string;
  dias: { date: string; efectivo: number; datafono: number }[];
  ventaEfectivo: number;
  ventaDatafono: number;
  total: number;
  /** día hábil en que se espera el pago (hasta + CC_PLAZO_HABILES) */
  pagoEsperado: string;
  /** último día hábil en que se busca el pago (hasta + CC_VENTANA_HABILES) */
  pagoLimite: string;
  pago: PagoCC | null;
  /** pago − total (negativo = el centro comercial pagó de menos) */
  dif: number;
  estado: EstadoCorteCC;
  nota?: string;
}

/**
 * Arma los cortes de las tiendas de centro comercial y les busca el pago.
 * `ventasCC` = solo ventas EFECTIVO/TARJETA de tiendas con recaudo
 * CENTRO_COMERCIAL. Devuelve también los abonos usados, para que el cruce QR
 * no los tome como pagos de clientes.
 */
export function calcularCortesCC(
  ventasCC: SaleInvoice[],
  bank: BankCashEntry[],
  qrBank: QrBankEntry[],
  holidays: Set<string>,
  tolerance: number,
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
        total: 0,
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
      dia = { date: s.date, efectivo: 0, datafono: 0 };
      g.dias.push(dia);
    }
    if (s.method === "EFECTIVO") {
      dia.efectivo += s.amount;
      g.ventaEfectivo += s.amount;
    } else {
      dia.datafono += s.amount;
      g.ventaDatafono += s.amount;
    }
    g.total += s.amount;
  }
  const cortes = [...grupos.values()]
    .filter((g) => Math.round(g.total) !== 0)
    .sort((a, b) => a.hasta.localeCompare(b.hasta) || a.storeCode.localeCompare(b.storeCode));
  for (const g of cortes) g.dias.sort((a, b) => a.date.localeCompare(b.date));
  if (cortes.length === 0) return { cortes, pagosUsados: [] };

  // Candidatos a pago del centro comercial: abonos que NO son el recaudo de
  // efectivo de las tiendas (Alianza) ni pagos QR/llave de clientes (Bancolombia)
  const esQrCliente = (concept: string) => /^PAGO (QR|LLAVE)/i.test(concept.trim());
  const candidatos: (PagoCC & { used: boolean })[] = [
    ...bank
      .filter((b) => b.amount > 0 && b.kind !== "RECAUDO_EFECTIVO")
      .map((b) => ({ cuenta: "ALIANZA" as const, date: b.date, amount: b.amount, concept: b.concept, used: false })),
    ...qrBank
      .filter((q) => q.amount > 0 && !esQrCliente(q.concept))
      .map((q) => ({ cuenta: "BANCOLOMBIA" as const, date: q.date, amount: q.amount, concept: q.concept, used: false })),
  ];
  const corteBanco = [...bank.map((b) => b.date), ...qrBank.map((q) => q.date)].sort().pop() ?? null;
  const pagosUsados: PagoCC[] = [];
  const porValor = (total: number) => (a: PagoCC, b: PagoCC) =>
    Math.abs(a.amount - total) - Math.abs(b.amount - total) || a.date.localeCompare(b.date);

  const asignar = (g: CorteCC, c: PagoCC & { used: boolean }, monto: number, nota?: string) => {
    c.used = true;
    const pago: PagoCC = { cuenta: c.cuenta, date: c.date, amount: monto, concept: c.concept };
    g.pago = pago;
    g.dif = monto - g.total;
    g.estado = Math.abs(g.dif) <= tolerance ? "CUADRA" : "DIFERENCIA";
    pagosUsados.push({ ...pago, amount: c.amount });
    if (nota) g.nota = nota;
    else if (g.estado === "DIFERENCIA")
      g.nota = `El centro comercial pagó ${formatCOP(monto)} por un corte de ${formatCOP(g.total)} (${c.concept}).`;
  };

  for (const g of cortes) {
    if (g.pago) continue;
    const desdePago = addDaysStr(g.hasta, 1);
    const enVentana = candidatos.filter((c) => !c.used && c.date >= desdePago && c.date <= g.pagoLimite);

    // 1) un pago por el total del corte (± tolerancia)
    const exacto = enVentana.filter((c) => Math.abs(c.amount - g.total) <= tolerance).sort(porValor(g.total))[0];
    if (exacto) {
      asignar(g, exacto, exacto.amount);
      continue;
    }
    // 2) un solo pago que cubre los cortes del MISMO período de varias tiendas
    //    del mismo centro comercial (p.ej. Floresta + Burbuja juntas)
    const hermanos = cortes.filter((h) => h !== g && !h.pago && h.hasta === g.hasta);
    const suma = g.total + hermanos.reduce((a, h) => a + h.total, 0);
    const conjunto = hermanos.length > 0 ? enVentana.filter((c) => Math.abs(c.amount - suma) <= tolerance).sort(porValor(suma))[0] : undefined;
    if (conjunto) {
      const nota = `Pago conjunto de ${[g, ...hermanos].map((h) => h.storeName).join(" + ")} (${formatCOP(conjunto.amount)}).`;
      asignar(g, conjunto, g.total, nota);
      for (const h of hermanos) {
        h.pago = { cuenta: conjunto.cuenta, date: conjunto.date, amount: h.total, concept: conjunto.concept };
        h.dif = 0;
        h.estado = "CUADRA";
        h.nota = nota;
      }
      continue;
    }
    // 3) el rótulo identifica al centro comercial aunque el valor no calce
    const porNombre = enVentana.filter((c) => /FLORESTA/i.test(c.concept)).sort(porValor(g.total))[0];
    if (porNombre) {
      asignar(g, porNombre, porNombre.amount);
      continue;
    }
    if (corteBanco && corteBanco > g.pagoLimite) {
      g.estado = "VENCIDO";
      g.nota = `Sin pago del centro comercial entre el ${desdePago} y el ${g.pagoLimite} (extractos cargados hasta el ${corteBanco}).`;
    } else {
      g.estado = "EN_PLAZO";
    }
  }
  return { cortes, pagosUsados };
}
