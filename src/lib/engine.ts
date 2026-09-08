// Motor de conciliación.
//
// Canal EFECTIVO (el difícil): las tiendas consignan el efectivo del día
// anterior; si hay fin de semana/festivo de por medio, acumulan varios días.
// Se usa un emparejamiento secuencial por tienda: para cada consignación se
// acumulan los días de venta pendientes (1..N) hasta hallar el monto dentro de
// la tolerancia. Así se manejan automáticamente los lunes (vie+sáb+dom) y los
// puentes festivos.
//
// Canal DATAFONO (directo): cada transacción del datafono ya viene fechada, así
// que se compara la venta con tarjeta del POS contra el bruto del datafono, por
// tienda y por día.

import type {
  SaleInvoice,
  BankCashEntry,
  DataphoneEntry,
  QrBankEntry,
  ConciliationResult,
  ManualAdjustment,
  StoreAlert,
  PendingDeposit,
} from "./types";
import { storeName, STORES } from "./stores";
import { within, DEFAULT_TOLERANCE, formatCOP } from "./money";
import {
  expectedSalesDays,
  nextBusinessDay,
  isBusinessDay,
  businessDaysBetween,
} from "./dates";

export interface EngineOptions {
  tolerance?: number;
  maxGroupDays?: number; // máximo de días a acumular en una consignación
  lateThresholdPct?: number; // % de tardías para marcar reincidencia (def 0.34)
  lateThresholdCount?: number; // mínimo de tardías para reincidencia (def 3)
}

/** Calcula el atraso (en días hábiles) de una consignación que cubre un grupo
 * de días de venta. A tiempo = 0. Se mide desde el día hábil más antiguo del
 * grupo: ese día debió consignarse al siguiente día hábil. */
function computeLate(
  salesDates: string[],
  depositDate: string,
  holidays: Set<string>,
): { expectedDate: string; daysLate: number } {
  const businessDays = salesDates.filter((d) => isBusinessDay(d, holidays));
  const anchor = (businessDays[0] ?? salesDates[0]) || depositDate;
  const expectedDate = nextBusinessDay(anchor, holidays);
  const daysLate = businessDaysBetween(expectedDate, depositDate, holidays);
  return { expectedDate, daysLate };
}

interface DayAmount {
  date: string;
  amount: number;
}

/** Suma montos por (tienda, fecha) en un mapa anidado */
function groupByStoreDay<T>(
  items: T[],
  storeOf: (t: T) => string | null,
  dateOf: (t: T) => string,
  amountOf: (t: T) => number,
): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const it of items) {
    const store = storeOf(it) ?? "?";
    const date = dateOf(it);
    if (!out.has(store)) out.set(store, new Map());
    const m = out.get(store)!;
    m.set(date, (m.get(date) ?? 0) + amountOf(it));
  }
  return out;
}

function sortedDays(m: Map<string, number>): DayAmount[] {
  return [...m.entries()]
    .map(([date, amount]) => ({ date, amount }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** ───────────────────── Canal EFECTIVO ───────────────────── */
function conciliarEfectivo(
  sales: SaleInvoice[],
  bank: BankCashEntry[],
  holidays: Set<string>,
  tolerance: number,
  maxGroupDays: number,
): { results: ConciliationResult[]; pendings: PendingDeposit[] } {
  const results: ConciliationResult[] = [];
  const pendings: PendingDeposit[] = [];

  const salesByStore = groupByStoreDay(
    sales.filter((s) => s.method === "EFECTIVO"),
    (s) => s.storeCode,
    (s) => s.date,
    (s) => s.amount,
  );

  const cashEntries = bank.filter((b) => b.kind === "RECAUDO_EFECTIVO");
  const entriesByStore = new Map<string, BankCashEntry[]>();
  for (const b of cashEntries) {
    const store = b.storeCode ?? "?";
    if (!entriesByStore.has(store)) entriesByStore.set(store, []);
    entriesByStore.get(store)!.push(b);
  }

  // rango de fechas con datos de ventas (para distinguir "faltan ventas")
  const allSalesDates = sales.map((s) => s.date).sort();
  const salesMinDate = allSalesDates[0];

  const storeCodes = new Set<string>([
    ...salesByStore.keys(),
    ...entriesByStore.keys(),
  ]);

  for (const store of storeCodes) {
    const salesDays = sortedDays(salesByStore.get(store) ?? new Map());
    let ptr = 0; // índice del primer día de venta no conciliado
    const seenDepDates = new Map<string, number>(); // ids únicos por fecha de depósito

    const nextId = (date: string) => {
      const n = (seenDepDates.get(date) ?? 0) + 1;
      seenDepDates.set(date, n);
      return n === 1 ? `EFECTIVO:${store}:${date}` : `EFECTIVO:${store}:${date}:${n}`;
    };

    // ── Pase 1: calce EXACTO, probando primero cada consignación
    // INDIVIDUAL y —si ninguna calza sola— la SUMA de las del mismo día.
    // Dos consignaciones del mismo día pueden ser cosas distintas: una el
    // pago exacto de un día de venta, otra ajena (transferencia, ajuste).
    // Sumarlas de entrada (como antes) arrastra el desfase a todas las
    // consignaciones siguientes (bug real detectado por Paola en Unicentro
    // Norte mayo: una consignación suelta del 8-may hacía parecer un
    // descuadre de -$610.900 el 11-may, cuando en realidad ese depósito era
    // el pago exacto y puntual del 7-may). Se repite en varias barridas
    // porque, al resolver una consignación, el puntero avanza y libera el
    // calce de otra que antes no alcanzaba (ver 707.000/459.300 del 6-may:
    // una necesita que la otra se resuelva primero).
    const tryMatch = (amount: number, beforeDate: string) => {
      // Si el día pendiente más antiguo queda muy lejos de esta consignación,
      // no se intenta: significa que hay un rezago sin resolver de antes (un
      // hueco real que le toca al pase de respaldo, no a esta consignación
      // posterior) y no una coincidencia. Sin este límite, una consignación
      // meses después puede "calzar" por azar contra ese rezago viejo (bug
      // real: julio calzó por coincidencia con ventas de mayo).
      if (
        ptr < salesDays.length &&
        businessDaysBetween(salesDays[ptr].date, beforeDate, holidays) > maxGroupDays + 4
      ) {
        return null;
      }
      const available: DayAmount[] = [];
      let j = ptr;
      while (j < salesDays.length && salesDays[j].date < beforeDate) {
        available.push(salesDays[j]);
        j++;
      }
      let cum = 0;
      const limit = Math.min(available.length, maxGroupDays);
      for (let k = 0; k < limit; k++) {
        cum += available[k].amount;
        if (within(cum, amount, tolerance)) return { matchEnd: k, sum: cum, available };
      }
      return null;
    };

    const recordMatch = (
      date: string,
      amount: number,
      match: { matchEnd: number; sum: number; available: DayAmount[] },
    ) => {
      const days = match.available.slice(0, match.matchEnd + 1).map((d) => d.date);
      const { expectedDate, daysLate } = computeLate(days, date, holidays);
      results.push({
        id: nextId(date),
        channel: "EFECTIVO",
        storeCode: store === "?" ? null : store,
        storeName: storeName(store === "?" ? null : store),
        method: "EFECTIVO",
        depositDate: date,
        depositAmount: amount,
        salesDates: days,
        salesAmount: match.sum,
        difference: amount - match.sum,
        status: "CUADRA",
        expectedDate,
        daysLate,
        late: daysLate > 0,
      });
      ptr += match.matchEnd + 1;
    };

    const entries = entriesByStore
      .get(store)
      ?.slice()
      .sort((a, b) => a.date.localeCompare(b.date) || a.amount - b.amount) ?? [];
    const idxByDate = new Map<string, number[]>();
    entries.forEach((e, i) => {
      if (!idxByDate.has(e.date)) idxByDate.set(e.date, []);
      idxByDate.get(e.date)!.push(i);
    });
    const entryDates = [...idxByDate.keys()].sort();
    const done = new Array(entries.length).fill(false);

    // Barre las consignaciones buscando calces EXACTOS (fecha por fecha,
    // repitiendo hasta que una barrida completa no logre nada más: resolver
    // una consignación puede destrabar otra que antes no alcanzaba, p.ej.
    // dos consignaciones del mismo día que cubren cada una un solo día).
    const runExactSweep = () => {
      let progress = true;
      while (progress) {
        progress = false;
        for (const date of entryDates) {
          const idxs = idxByDate.get(date)!;
          for (const i of idxs) {
            if (done[i]) continue;
            const m = tryMatch(entries[i].amount, date);
            if (!m) continue;
            recordMatch(date, entries[i].amount, m);
            done[i] = true;
            progress = true;
          }
          const remaining = idxs.filter((i) => !done[i]);
          if (remaining.length >= 2) {
            const sum = remaining.reduce((a, i) => a + entries[i].amount, 0);
            const m = tryMatch(sum, date);
            if (m) {
              recordMatch(date, sum, m);
              for (const i of remaining) done[i] = true;
              progress = true;
            }
          }
        }
      }
    };
    runExactSweep();

    // Lo que no calzó exacto se resuelve UNA fecha a la vez (la más antigua
    // primero) con el algoritmo de respaldo de siempre (acumula días hasta
    // la ventana esperada, aunque no cuadre exacto). Tras cada una se
    // reintenta el calce exacto: liberar esa fecha puede destrabar una
    // consignación posterior que sí calzaba justo (bug real: una
    // consignación suelta sin relación con las ventas —ni sola ni sumada al
    // resto de su día— forzaba a "tragarse" un día de venta que en realidad
    // pertenecía, exacto, a una consignación de días después).
    let pendingDates = entryDates.filter((d) => idxByDate.get(d)!.some((i) => !done[i]));
    while (pendingDates.length > 0) {
      const date = pendingDates[0];
      const idxs = idxByDate.get(date)!.filter((i) => !done[i]);
      const amount = idxs.reduce((a, i) => a + entries[i].amount, 0);

      const available: DayAmount[] = [];
      let j = ptr;
      while (j < salesDays.length && salesDays[j].date < date) {
        available.push(salesDays[j]);
        j++;
      }

      const baseResult = {
        id: nextId(date),
        channel: "EFECTIVO" as const,
        storeCode: store === "?" ? null : store,
        storeName: storeName(store === "?" ? null : store),
        method: "EFECTIVO" as const,
        depositDate: date,
        depositAmount: amount,
      };

      if (available.length === 0) {
        // No hay ventas previas en el archivo para esta consignación
        const faltan = !salesMinDate || date <= salesMinDate;
        results.push({
          ...baseResult,
          salesDates: [],
          salesAmount: 0,
          difference: amount,
          status: "SIN_CONCILIAR",
          note: faltan
            ? "Faltan ventas previas en el archivo de Alegra (consignación de ventas anteriores al rango)."
            : "No hay ventas en efectivo pendientes para esta consignación.",
        });
      } else {
        // Acumular 1..maxGroupDays días buscando un calce dentro de tolerancia
        let matchEnd = -1;
        let cum = 0;
        let bestCum = 0;
        const limit = Math.min(available.length, maxGroupDays);
        for (let k = 0; k < limit; k++) {
          cum += available[k].amount;
          if (within(cum, amount, tolerance)) {
            matchEnd = k;
            bestCum = cum;
            break;
          }
        }

        if (matchEnd >= 0) {
          const days = available.slice(0, matchEnd + 1).map((d) => d.date);
          const { expectedDate, daysLate } = computeLate(days, date, holidays);
          results.push({
            ...baseResult,
            salesDates: days,
            salesAmount: bestCum,
            difference: amount - bestCum,
            status: within(bestCum, amount, tolerance) ? "CUADRA" : "DIFERENCIA",
            expectedDate,
            daysLate,
            late: daysLate > 0,
          });
          ptr += matchEnd + 1;
        } else {
          // Sin calce: agrupar un PREFIJO CONTIGUO de los días pendientes, desde
          // el más antiguo hasta el último día de la ventana esperada del
          // depósito. Nunca se filtran días intermedios: si un día de venta no
          // aparece en ningún depósito, debe verse como diferencia, no
          // desaparecer (bug detectado por Paola: la venta del 11-jun de
          // Unicentro se saltaba).
          const expected = new Set(expectedSalesDays(date, holidays));
          let end = -1;
          for (let k = 0; k < available.length; k++) {
            if (expected.has(available[k].date)) end = k;
          }
          const group =
            end >= 0
              ? available.slice(0, end + 1)
              : available.slice(0, Math.min(available.length, maxGroupDays));
          const sum = group.reduce((a, d) => a + d.amount, 0);
          const diff = amount - sum;
          const gDays = group.map((d) => d.date);
          const { expectedDate, daysLate } = computeLate(gDays, date, holidays);
          results.push({
            ...baseResult,
            salesDates: gDays,
            salesAmount: sum,
            difference: diff,
            status: within(sum, amount, tolerance) ? "CUADRA" : "DIFERENCIA",
            expectedDate,
            daysLate,
            late: daysLate > 0,
          });
          ptr += group.length;
        }
      }

      for (const i of idxs) done[i] = true;
      runExactSweep(); // el puntero avanzó: reintentar por si destraba algo posterior
      pendingDates = entryDates.filter((d) => idxByDate.get(d)!.some((i) => !done[i]));
    }

    // Días de venta que ningún depósito cubrió: pendientes por consignar
    const leftover = salesDays.slice(ptr);
    if (leftover.length > 0) {
      pendings.push({
        storeCode: store === "?" ? null : store,
        storeName: storeName(store === "?" ? null : store),
        days: leftover.map((d) => ({ date: d.date, amount: d.amount })),
        total: leftover.reduce((a, d) => a + d.amount, 0),
      });
    }
  }

  return { results, pendings };
}

/** ───────────────────── Canal DATAFONO ───────────────────── */
function conciliarDatafono(
  sales: SaleInvoice[],
  datafono: DataphoneEntry[],
  tolerance: number,
): ConciliationResult[] {
  const results: ConciliationResult[] = [];

  // Ventas con tarjeta (crédito + débito) por tienda y día
  const cardSales = groupByStoreDay(
    sales.filter(
      (s) => s.method === "TARJETA_CREDITO" || s.method === "TARJETA_DEBITO",
    ),
    (s) => s.storeCode,
    (s) => s.date,
    (s) => s.amount,
  );
  // Bruto del datafono por tienda y día de transacción
  const dataGross = groupByStoreDay(
    datafono,
    (d) => d.storeCode,
    (d) => d.txDate,
    (d) => d.gross,
  );

  // Rangos de cobertura de cada fuente (para distinguir "fuera de rango")
  const dfDates = datafono.map((e) => e.txDate).sort();
  const dfMin = dfDates[0];
  const dfMax = dfDates[dfDates.length - 1];
  const posCardDates = sales
    .filter((s) => s.method === "TARJETA_CREDITO" || s.method === "TARJETA_DEBITO")
    .map((s) => s.date)
    .sort();
  const posMin = posCardDates[0];
  const posMax = posCardDates[posCardDates.length - 1];

  const storeCodes = new Set<string>([
    ...cardSales.keys(),
    ...dataGross.keys(),
  ]);

  for (const store of storeCodes) {
    const posDays = cardSales.get(store) ?? new Map<string, number>();
    const dataDays = dataGross.get(store) ?? new Map<string, number>();
    const allDays = new Set<string>([...posDays.keys(), ...dataDays.keys()]);

    for (const day of [...allDays].sort()) {
      const pos = posDays.get(day) ?? 0;
      const data = dataDays.get(day) ?? 0;
      if (data === 0 && pos === 0) continue;

      const base = {
        id: `DATAFONO:${store}:${day}`,
        channel: "DATAFONO" as const,
        storeCode: store === "?" ? null : store,
        storeName: storeName(store === "?" ? null : store),
        method: "TARJETAS" as const,
        depositDate: day,
        depositAmount: data,
        salesDates: [day],
        salesAmount: pos,
        difference: data - pos,
      };

      // Fuera del rango de alguno de los archivos -> no es un descuadre real
      const outOfDatafono = !dfMin || day < dfMin || day > dfMax;
      const outOfPos = !posMin || day < posMin || day > posMax;
      if (data === 0 && outOfDatafono) {
        results.push({
          ...base,
          status: "SIN_CONCILIAR",
          note: "Día fuera del rango del reporte de datafono (no comparable).",
        });
        continue;
      }
      if (pos === 0 && outOfPos) {
        results.push({
          ...base,
          status: "SIN_CONCILIAR",
          note: "Día fuera del rango del reporte de ventas (no comparable).",
        });
        continue;
      }

      results.push({
        ...base,
        status: within(data, pos, tolerance) ? "CUADRA" : "DIFERENCIA",
        note:
          data === 0
            ? "Venta con tarjeta en POS sin transacción en el datafono."
            : pos === 0
              ? "Transacción en datafono sin venta con tarjeta en el POS."
              : undefined,
      });
    }
  }

  return results;
}

/** ───────────────────── Canal QR ─────────────────────
 * Los pagos QR entran a la cuenta del datafono el mismo día, uno a uno, pero
 * el extracto solo trae el nombre del pagador (no la tienda). Se compara el
 * total de ventas QR del POS contra el total de PAGO QR del banco, por día,
 * a nivel de toda la empresa. */
function conciliarQr(
  sales: SaleInvoice[],
  qrBank: QrBankEntry[],
  tolerance: number,
): ConciliationResult[] {
  if (qrBank.length === 0) return [];
  const results: ConciliationResult[] = [];

  const qrSales = sales.filter((s) => s.method === "TRANSFERENCIA");
  const posByDay = new Map<string, number>();
  for (const s of qrSales) {
    posByDay.set(s.date, (posByDay.get(s.date) ?? 0) + s.amount);
  }
  const bankByDay = new Map<string, number>();
  for (const q of qrBank) {
    bankByDay.set(q.date, (bankByDay.get(q.date) ?? 0) + q.amount);
  }

  // rangos de cobertura de cada fuente
  const bankDates = [...bankByDay.keys()].sort();
  const bMin = bankDates[0];
  const bMax = bankDates[bankDates.length - 1];
  const posDates = [...posByDay.keys()].sort();
  const pMin = posDates[0];
  const pMax = posDates[posDates.length - 1];

  const allDays = new Set<string>([...posByDay.keys(), ...bankByDay.keys()]);
  for (const day of [...allDays].sort()) {
    const pos = posByDay.get(day) ?? 0;
    const bank = bankByDay.get(day) ?? 0;
    if (pos === 0 && bank === 0) continue;

    const base = {
      id: `QR:ALL:${day}`,
      channel: "QR" as const,
      storeCode: null,
      storeName: "Todas las tiendas",
      method: "QR" as const,
      depositDate: day,
      depositAmount: bank,
      salesDates: [day],
      salesAmount: pos,
      difference: bank - pos,
    };

    const outOfBank = !bMin || day < bMin || day > bMax;
    const outOfPos = !pMin || day < pMin || day > pMax;
    if (bank === 0 && outOfBank) {
      results.push({
        ...base,
        status: "SIN_CONCILIAR",
        note: "Día fuera del rango del extracto del datafono (no comparable).",
      });
      continue;
    }
    if (pos === 0 && outOfPos) {
      results.push({
        ...base,
        status: "SIN_CONCILIAR",
        note: "Día fuera del rango del reporte de ventas (no comparable).",
      });
      continue;
    }

    results.push({
      ...base,
      status: within(bank, pos, tolerance) ? "CUADRA" : "DIFERENCIA",
      note:
        bank === 0
          ? "Venta QR en el POS sin pago QR en el banco."
          : pos === 0
            ? "Pago QR en el banco sin venta QR en el POS."
            : undefined,
    });
  }

  return results;
}

/** ───────────── Alerta: efectivo consignado por QR ─────────────
 * Hallazgo real (jun 2026): las vendedoras a veces consignan parte del
 * efectivo del día enviándolo por QR a la cuenta del datafono (error de
 * procedimiento). El faltante de la consignación de efectivo coincide al
 * peso con un PAGO QR de esos días. Aquí se detecta y se alerta — NO se
 * cuadra automáticamente, porque sigue siendo plata en la cuenta equivocada. */
function annotateQrDiversion(
  results: ConciliationResult[],
  sales: SaleInvoice[],
  qrBank: QrBankEntry[],
  tolerance: number,
): void {
  if (qrBank.length === 0) return;

  // Excedente QR por día: lo que entró al banco por QR menos las ventas QR
  // del POS (lo que sobra no viene de ventas — puede ser efectivo desviado).
  const qrPosByDay = new Map<string, number>();
  for (const s of sales) {
    if (s.method !== "TRANSFERENCIA") continue;
    qrPosByDay.set(s.date, (qrPosByDay.get(s.date) ?? 0) + s.amount);
  }
  const qrBankByDay = new Map<string, number>();
  for (const q of qrBank) {
    qrBankByDay.set(q.date, (qrBankByDay.get(q.date) ?? 0) + q.amount);
  }

  for (const r of results) {
    if (r.channel !== "EFECTIVO") continue;
    if (r.status !== "DIFERENCIA") continue;
    const missing = -r.difference; // faltante = ventas - depósito
    if (missing <= tolerance) continue;
    if (r.salesDates.length === 0) continue;

    const from = r.salesDates[0];
    const to = r.depositDate;

    // 1) Un pago QR individual por el valor exacto del faltante (nombra a
    //    quien lo envió — evidencia fuerte)
    const hit = qrBank.find(
      (q) => q.date >= from && q.date <= to && within(q.amount, missing, tolerance),
    );
    if (hit) {
      const hint = `⚠ Posible efectivo consignado por QR: "${hit.payer}" envió ${formatCOP(hit.amount)} el ${hit.date} a la cuenta del datafono.`;
      r.qrAlert = true;
      r.note = r.note ? `${r.note} ${hint}` : hint;
      continue;
    }

    // 2) El faltante coincide con el excedente QR acumulado de esos días
    let surplus = 0;
    for (const d of r.salesDates) {
      surplus += (qrBankByDay.get(d) ?? 0) - (qrPosByDay.get(d) ?? 0);
    }
    if (surplus > 0 && within(surplus, missing, tolerance)) {
      const hint = `⚠ Posible efectivo consignado por QR: el faltante coincide con ${formatCOP(surplus)} de pagos QR de esos días que no corresponden a ventas.`;
      r.qrAlert = true;
      r.note = r.note ? `${r.note} ${hint}` : hint;
    }
  }
}

/** Aplica ajustes manuales sobre los resultados calculados */
function applyAdjustments(
  results: ConciliationResult[],
  adjustments: ManualAdjustment[],
  salesByStoreDay: Map<string, Map<string, number>>,
): ConciliationResult[] {
  if (adjustments.length === 0) return results;
  const adjMap = new Map(adjustments.map((a) => [a.resultId, a]));
  return results.map((r) => {
    const adj = adjMap.get(r.id);
    if (!adj) return r;
    // Solo el EFECTIVO se recalcula por días de venta (el ajuste puede reagrupar
    // días). El mapa salesByStoreDay es de ventas en EFECTIVO: aplicarlo a un
    // resultado de DATÁFONO o QR ponía la venta de caja como venta de tarjeta
    // (B2 8-may-2026: venta 387.000 y "dif" 1.329.600 en vez de −700). Esos
    // canales conservan sus montos y solo quedan marcados MANUAL con la nota.
    if (r.channel !== "EFECTIVO") return { ...r, status: "MANUAL", note: adj.note };
    const store = r.storeCode ?? "?";
    const dayMap = salesByStoreDay.get(store) ?? new Map();
    const sum = adj.salesDates.reduce((a, d) => a + (dayMap.get(d) ?? 0), 0);
    return {
      ...r,
      salesDates: adj.salesDates,
      salesAmount: sum,
      difference: r.depositAmount - sum,
      status: "MANUAL",
      note: adj.note,
    };
  });
}

export interface ConciliationInput {
  sales: SaleInvoice[];
  bank: BankCashEntry[];
  datafono: DataphoneEntry[];
  qrBank?: QrBankEntry[];
  holidays: string[];
  adjustments?: ManualAdjustment[];
  options?: EngineOptions;
}

export interface ConciliationSummary {
  results: ConciliationResult[];
  totals: {
    cuadran: number;
    diferencias: number;
    sinConciliar: number;
    manuales: number;
    tardias: number; // conciliadas pero fuera de tiempo
  };
  alerts: StoreAlert[];
  /** Días de venta en efectivo aún sin consignar, por tienda */
  pendings: PendingDeposit[];
}

/** Mes de conciliación de un resultado: el de las ventas que cubre
 * (última fecha de venta); si no cubre ninguna, el del depósito. */
function monthOf(r: ConciliationResult): string {
  const anchor =
    r.channel === "EFECTIVO" && r.salesDates.length > 0
      ? r.salesDates[r.salesDates.length - 1]
      : r.depositDate;
  return anchor.slice(0, 7);
}

/** Construye alertas por tienda a partir de las consignaciones de efectivo */
function buildStoreAlerts(
  results: ConciliationResult[],
  thresholdPct: number,
  thresholdCount: number,
): StoreAlert[] {
  const byStore = new Map<string, ConciliationResult[]>();
  for (const r of results) {
    if (r.channel !== "EFECTIVO") continue;
    // solo cuenta las que efectivamente se conciliaron (cuadran o manual)
    if (r.status !== "CUADRA" && r.status !== "MANUAL") continue;
    const key = r.storeCode ?? "?";
    if (!byStore.has(key)) byStore.set(key, []);
    byStore.get(key)!.push(r);
  }

  const alerts: StoreAlert[] = [];
  for (const [store, rs] of byStore) {
    const lateOnes = rs.filter((r) => r.late);
    const lateCount = lateOnes.length;
    const totalCount = rs.length;
    if (totalCount === 0) continue;
    const latePct = lateCount / totalCount;
    const maxDaysLate = lateOnes.reduce((m, r) => Math.max(m, r.daysLate ?? 0), 0);
    const avgDaysLate =
      lateCount > 0
        ? lateOnes.reduce((a, r) => a + (r.daysLate ?? 0), 0) / lateCount
        : 0;
    const recurrent =
      lateCount >= thresholdCount && latePct >= thresholdPct;
    alerts.push({
      storeCode: store === "?" ? null : store,
      storeName: storeName(store === "?" ? null : store),
      channel: "EFECTIVO",
      lateCount,
      totalCount,
      latePct,
      maxDaysLate,
      avgDaysLate,
      recurrent,
    });
  }
  // ordenar: reincidentes primero, luego por % tardías
  return alerts.sort(
    (a, b) =>
      Number(b.recurrent) - Number(a.recurrent) || b.latePct - a.latePct,
  );
}

/** Punto de entrada principal del motor */
export function conciliar(input: ConciliationInput): ConciliationSummary {
  const tolerance = input.options?.tolerance ?? DEFAULT_TOLERANCE;
  const maxGroupDays = input.options?.maxGroupDays ?? 6;
  const lateThresholdPct = input.options?.lateThresholdPct ?? 0.34;
  const lateThresholdCount = input.options?.lateThresholdCount ?? 3;
  const holidays = new Set(input.holidays);

  const efectivo = conciliarEfectivo(
    input.sales,
    input.bank,
    holidays,
    tolerance,
    maxGroupDays,
  );
  const datafono = conciliarDatafono(input.sales, input.datafono, tolerance);
  const qr = conciliarQr(input.sales, input.qrBank ?? [], tolerance);

  annotateQrDiversion(efectivo.results, input.sales, input.qrBank ?? [], tolerance);

  let results = [...efectivo.results, ...datafono, ...qr];
  for (const r of results) r.month = monthOf(r);

  // mapa de ventas efectivo por tienda/día para recálculo de ajustes
  const salesByStoreDay = groupByStoreDay(
    input.sales.filter((s) => s.method === "EFECTIVO"),
    (s) => s.storeCode,
    (s) => s.date,
    (s) => s.amount,
  );
  results = applyAdjustments(results, input.adjustments ?? [], salesByStoreDay);

  const totals = {
    cuadran: results.filter((r) => r.status === "CUADRA").length,
    diferencias: results.filter((r) => r.status === "DIFERENCIA").length,
    sinConciliar: results.filter((r) => r.status === "SIN_CONCILIAR").length,
    manuales: results.filter((r) => r.status === "MANUAL").length,
    tardias: results.filter((r) => r.late).length,
  };

  const alerts = buildStoreAlerts(results, lateThresholdPct, lateThresholdCount);

  return { results, totals, alerts, pendings: efectivo.pendings };
}

/** Lista de códigos de tienda conocidos (para UI) */
export function knownStores() {
  return STORES.map((s) => ({ code: s.code, name: s.name }));
}
