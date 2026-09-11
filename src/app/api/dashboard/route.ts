// Datos del tablero por tienda: para un mes dado devuelve, por tienda y por
// día, la venta y el recaudo de cada canal (efectivo / datafono / QR / otros)
// con su diferencia y estado. El QR del banco no trae tienda: se entrega la
// serie a nivel empresa.

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { computeLedger } from "@/lib/ledger";
import { loadHolidays } from "@/lib/process";
import { nextBusinessDay } from "@/lib/dates";
import { STORES, storeName, esCentroComercial } from "@/lib/stores";
import { CUENTAS_NO_QR, ALEGRA_CONFIABLE_HASTA } from "@/lib/alegra-api";
import { QR_DIAS_ANTES } from "@/lib/qr-reglas";
import { cruzarDatafono } from "@/lib/datafono-cruce";

export const runtime = "nodejs";

interface DiaEfe {
  venta: number;
  deposito: number | null; // monto del depósito que CIERRA en este día
  depositoFecha: string | null;
  grupo: string[]; // días de venta que cubre ese depósito
  dif: number; // dif del grupo (en el día de cierre) o -venta si pendiente
  estado: "CUADRA" | "DIFERENCIA" | "SIN_CONCILIAR" | "MANUAL" | "AGRUPADO" | "PENDIENTE" | "SIN_VENTA" | "CENTRO_COMERCIAL";
  late?: boolean;
  qrAlert?: boolean;
  nota?: string;
  /** pendiente pero AÚN en plazo (se consigna el día hábil siguiente) */
  enPlazo?: boolean;
}

export async function GET(request: NextRequest) {
  const month = request.nextUrl.searchParams.get("month");
  // rango libre de fechas (opcional): ?from=YYYY-MM-DD&to=YYYY-MM-DD → diferencias totales de varios meses
  const fromParam = request.nextUrl.searchParams.get("from");
  const toParam = request.nextUrl.searchParams.get("to");
  const esFecha = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

  const [salesRows, dataRows, qrRowsAll, mpRows, manualQr, alegraTransfers, ledger, holidaysArr] = await Promise.all([
    prisma.sale.findMany(),
    prisma.dataphoneEntry.findMany(),
    prisma.qrEntry.findMany(),
    prisma.mercadopagoEntry.findMany(),
    prisma.qrAssignment.findMany(),
    prisma.alegraPago.findMany({ where: { metodo: "transfer" } }),
    computeLedger(),
    loadHolidays(),
  ]);
  const holidays = new Set(holidaysArr);
  // Abonos de Bancolombia que resultaron ser pagos del CENTRO COMERCIAL
  // (Floresta): no son QR de clientes, se sacan del cruce QR
  const usadoCC = new Set(
    ledger.summary.pagosCC.filter((p) => p.cuenta === "BANCOLOMBIA").map((p) => `${p.date}|${Math.round(p.amount)}|${p.concept}`),
  );
  const qrRows = qrRowsAll.filter((q) => !usadoCC.has(`${q.date}|${Math.round(q.amount)}|${q.concept}`));

  const monthsSet = new Set<string>(salesRows.map((s) => s.date.slice(0, 7)));
  const months = [...monthsSet].sort().reverse();
  const rango = esFecha(fromParam) && esFecha(toParam) && fromParam <= toParam ? { from: fromParam, to: toParam } : null;
  const m = rango ? rango.from.slice(0, 7) : month && monthsSet.has(month) ? month : months[0];
  if (!m) return Response.json({ months: [], stores: [], data: {} });

  // "inMonth" = dentro del período visible: el mes elegido o el rango libre
  const inMonth = (d: string) => (rango ? d >= rango.from && d <= rango.to : d.startsWith(m));
  const add = (map: Map<string, number>, k: string, v: number) => map.set(k, (map.get(k) ?? 0) + v);

  // clasifica un pago OTRO por plataforma según el texto de la bodega/cuenta
  const plataforma = (bodega: string): "mercadopago" | "rappi" | "addi" | "otros" => {
    const b = bodega.toUpperCase();
    if (b.includes("RAPPI")) return "rappi";
    if (b.includes("ADDI")) return "addi";
    if (b.includes("MERCADO")) return "mercadopago";
    return "otros";
  };

  // Según ALEGRA, algunas ventas registradas como "transferencia/QR" en
  // realidad entraron por otra plataforma (Rappi/Addi, Mercadopago, Nequi):
  // el pago de Alegra con el mismo valor y fecha lo delata. Esas ventas se
  // sacan del canal QR (no hay que esperarlas en los PAGO QR del banco) y se
  // muestran en su plataforma real.
  const otraPlatPorClave = new Map<string, string[]>(); // `${date}|${monto}` -> cuentas
  for (const a of alegraTransfers) {
    if (a.date > ALEGRA_CONFIABLE_HASTA) continue; // Alegra sin detalle real después del 8-jul
    if (!inMonth(a.date) || !CUENTAS_NO_QR.includes(a.cuenta)) continue;
    const k = `${a.date}|${Math.round(a.amount)}`;
    const arr = otraPlatPorClave.get(k) ?? [];
    arr.push(a.cuenta);
    otraPlatPorClave.set(k, arr);
  }
  const otraPlat = new Map<number, string>(); // Sale.id -> cuenta Alegra
  for (const s of salesRows) {
    if (s.method !== "TRANSFERENCIA" || !inMonth(s.date)) continue;
    const arr = otraPlatPorClave.get(`${s.date}|${Math.round(s.amount)}`);
    if (arr?.length) otraPlat.set(s.id, arr.shift()!);
  }

  // ventas por (tienda, día, canal)
  const efeV = new Map<string, number>(), tarV = new Map<string, number>(), qrV = new Map<string, number>();
  const mpV = new Map<string, number>(), rappiV = new Map<string, number>(), addiV = new Map<string, number>(), otroV = new Map<string, number>();
  for (const s of salesRows) {
    if (!s.storeCode || !inMonth(s.date)) continue;
    const k = `${s.storeCode}|${s.date}`;
    if (s.method === "EFECTIVO") add(efeV, k, s.amount);
    else if (s.method === "TARJETA_CREDITO" || s.method === "TARJETA_DEBITO") add(tarV, k, s.amount);
    else if (s.method === "TRANSFERENCIA") {
      const cuenta = otraPlat.get(s.id);
      if (!cuenta) add(qrV, k, s.amount);
      else if (cuenta === "Rappi / Addi") add(rappiV, k, s.amount);
      else if (cuenta === "Mercadopago") add(mpV, k, s.amount);
      else add(otroV, k, s.amount);
    }
    else {
      const p = plataforma(s.bodega);
      add(p === "mercadopago" ? mpV : p === "rappi" ? rappiV : p === "addi" ? addiV : otroV, k, s.amount);
    }
  }
  // plink por (tienda, día)
  const plink = new Map<string, number>();
  for (const d of dataRows) if (d.storeCode && inMonth(d.txDate)) add(plink, `${d.storeCode}|${d.txDate}`, d.gross);
  // filas individuales para el cruce EXACTO del datáfono (falta / sobra sin netear)
  const tarFilas = new Map<string, { id: number; amount: number; autorizacion: string | null; ultimos4: string | null }[]>();
  for (const s of salesRows) {
    if (!s.storeCode || !inMonth(s.date) || (s.method !== "TARJETA_CREDITO" && s.method !== "TARJETA_DEBITO")) continue;
    const k = `${s.storeCode}|${s.date}`;
    tarFilas.set(k, [...(tarFilas.get(k) ?? []), { id: s.id, amount: s.amount, autorizacion: s.autorizacion, ultimos4: s.ultimos4 }]);
  }
  const datFilas = new Map<string, { id: number; gross: number; autorizacion: string | null; ultimos4: string | null }[]>();
  for (const d of dataRows) {
    if (!d.storeCode || !inMonth(d.txDate)) continue;
    const k = `${d.storeCode}|${d.txDate}`;
    datFilas.set(k, [...(datFilas.get(k) ?? []), { id: d.id, gross: d.gross, autorizacion: d.autorizacion, ultimos4: d.ultimos4 }]);
  }
  // QR banco por día (empresa)
  const qrBanco = new Map<string, number>();
  for (const q of qrRows) if (inMonth(q.date)) add(qrBanco, q.date, q.amount);
  // Mercado Pago: recaudo (settlement) por día — a nivel empresa, sin tienda
  const mpBrutoDia = new Map<string, number>(), mpNetoDia = new Map<string, number>();
  for (const e of mpRows) if (inMonth(e.date)) { add(mpBrutoDia, e.date, e.bruto); add(mpNetoDia, e.date, e.neto); }
  // venta Mercadopago a nivel empresa (incluye ventas web sin tienda física)
  const mpVentaDia = new Map<string, number>();
  for (const s of salesRows)
    if (inMonth(s.date) && s.bodega.toUpperCase().includes("MERCADO")) add(mpVentaDia, s.date, s.amount);

  // ── QR por tienda (heurística temporal) ──────────────────────────────────
  // El banco no separa el QR por tienda. Se asigna cada pago QR del banco a la
  // tienda cuya venta QR (Karrot) tiene el MISMO valor exacto (fecha cercana).
  // Regla (Paola, 07-sep): el pago QR entra al banco el MISMO día de la venta o
  // a lo sumo un par de días ANTES (venta registrada tarde / web facturada a la
  // mañana siguiente), NUNCA después de la fecha facturada. Antes se admitían
  // ±6 días y un pago de 74.600 del 5-may se "comía" una venta de 74.450 del 8.
  // Devuelve los días de rezago venta−pago (0..QR_DIAS_ANTES) o −1 si no aplica.
  const distQr = (pagoDate: string, ventaDate: string): number => {
    const d = Math.round((Date.parse(ventaDate + "T00:00:00Z") - Date.parse(pagoDate + "T00:00:00Z")) / 86400000);
    return d >= 0 && d <= QR_DIAS_ANTES ? d : -1;
  };
  const qrSalesList = salesRows
    .filter((s) => s.method === "TRANSFERENCIA" && s.storeCode && inMonth(s.date) && !otraPlat.has(s.id))
    .map((s) => ({ date: s.date, store: s.storeCode as string, amount: Math.round(s.amount), used: false }));
  const qrByAmount = new Map<number, typeof qrSalesList>();
  for (const s of qrSalesList) {
    const arr = qrByAmount.get(s.amount) ?? [];
    arr.push(s);
    qrByAmount.set(s.amount, arr);
  }
  const qrBancoTienda = new Map<string, number>(); // storeCode -> banco asignado
  const qrBancoDia = new Map<string, number>(); // `${store}|${saleDate}` -> banco asignado
  let qrAsignado = 0;
  // Regla (Paola): si un valor está en 2+ tiendas PERO al banco entran tantos
  // pagos idénticos como ventas, cada tienda tiene el suyo → se asignan. Si
  // entran menos pagos que ventas (p.ej. una sola tienda recibió), queda para
  // revisar y asignar a mano (no adivinamos a cuál pertenece).
  const qrRevisar: { date: string; amount: number; payer: string; stores: string[] }[] = [];
  // pagos del banco agrupados por valor
  const bankByAmount = new Map<number, { date: string; payer: string; used: boolean }[]>();
  for (const q of qrRows) {
    if (!inMonth(q.date)) continue;
    const a = Math.round(q.amount);
    const arr = bankByAmount.get(a) ?? [];
    arr.push({ date: q.date, payer: q.payer, used: false });
    bankByAmount.set(a, arr);
  }

  // PASE 0 — asignaciones MANUALES: empates que el usuario ya resolvió en la
  // UI ("¿de quién es?"). Se aplican primero y sobreviven recargas del
  // extracto porque se guardan por (fecha, valor, pagador).
  for (const a of manualQr) {
    if (!inMonth(a.date)) continue;
    const monto = Math.round(a.amount);
    const pago = bankByAmount.get(monto)?.find((p) => !p.used && p.date === a.date && p.payer === a.payer);
    if (!pago) continue;
    let mejorVenta: (typeof qrSalesList)[number] | null = null;
    let mejorDist = 99;
    for (const v of qrSalesList) {
      if (v.used || v.store !== a.storeCode || Math.abs(v.amount - monto) > 500) continue;
      const dd = distQr(a.date, v.date);
      if (dd >= 0 && dd < mejorDist) { mejorVenta = v; mejorDist = dd; }
    }
    pago.used = true;
    add(qrBancoTienda, a.storeCode, monto);
    if (mejorVenta) { mejorVenta.used = true; add(qrBancoDia, `${a.storeCode}|${mejorVenta.date}`, monto); }
    else add(qrBancoDia, `${a.storeCode}|${a.date}`, monto);
    qrAsignado += monto;
  }
  // PASE 1 — valor EXACTO. Regla de conteo: si el valor está en 2+ tiendas pero
  // entraron MENOS pagos que ventas, se difiere al pase 2 (no se adivina aquí).
  for (const [amount, ventas] of qrByAmount) {
    const pagos = bankByAmount.get(amount);
    if (!pagos || pagos.length === 0) continue; // hay venta pero no entró al banco → falta
    const tiendas = new Set(ventas.map((v) => v.store));
    if (tiendas.size >= 2 && pagos.length < ventas.length) continue; // ambiguo → pase 2
    // suficientes pagos (o una sola tienda): a cada venta su pago más cercano
    for (const v of ventas) {
      let best = -1, bestD = 99;
      pagos.forEach((p, i) => {
        if (p.used) return;
        const dd = distQr(p.date, v.date);
        if (dd >= 0 && dd < bestD) { best = i; bestD = dd; }
      });
      if (best >= 0) {
        pagos[best].used = true;
        v.used = true;
        add(qrBancoTienda, v.store, amount);
        add(qrBancoDia, `${v.store}|${v.date}`, amount);
        qrAsignado += amount;
      }
    }
  }

  // PASE 2 — CASI exacto (±$500, ej. cliente que paga $35.600 por una venta de
  // $35.650) y desempate de los ambiguos del pase 1 por FECHA más cercana.
  // Se asigna solo si hay una única mejor candidata (menor distancia de fecha,
  // luego menor diferencia de valor); si dos tiendas empatan igual → revisar.
  const pagosLibres = [...bankByAmount]
    .flatMap(([amount, arr]) => arr.filter((p) => !p.used).map((p) => ({ ref: p, amount })))
    .sort((a, b) => a.ref.date.localeCompare(b.ref.date));
  for (const { ref, amount } of pagosLibres) {
    const cands = qrSalesList.filter(
      (v) => !v.used && Math.abs(v.amount - amount) <= 500 && distQr(ref.date, v.date) >= 0,
    );
    if (cands.length === 0) continue; // pago sin venta que cruce → queda a nivel empresa
    const clave = (c: (typeof cands)[number]) => distQr(ref.date, c.date) * 1000 + Math.abs(c.amount - amount);
    let best = cands[0];
    for (const c of cands) if (clave(c) < clave(best)) best = c;
    const empatadas = cands.filter((c) => clave(c) === clave(best));
    if (new Set(empatadas.map((c) => c.store)).size > 1) {
      // empate real entre tiendas → no adivinar, revisar a mano
      qrRevisar.push({ date: ref.date, amount, payer: ref.payer, stores: [...new Set(cands.map((c) => c.store))] });
      continue;
    }
    ref.used = true;
    best.used = true;
    add(qrBancoTienda, best.store, amount);
    add(qrBancoDia, `${best.store}|${best.date}`, amount); // el residuo (ej. $50) queda visible como dif del día
    qrAsignado += amount;
  }

  // PASE 3 — una factura pagada con DOS QR del mismo cliente (caso real: Michel
  // Castro 47.100 + 35.500 = 82.600 en Plaza el 8-may, verificado por Jerónimo):
  // par de pagos libres del MISMO pagador, dentro de la ventana, cuya suma calza
  // ±$500 con una venta que quedó sin pago.
  for (const v of qrSalesList) {
    if (v.used) continue;
    const libres = [...bankByAmount].flatMap(([amount, arr]) =>
      arr.filter((p) => !p.used && distQr(p.date, v.date) >= 0).map((p) => ({ p, amount })),
    );
    let par: [(typeof libres)[number], (typeof libres)[number]] | null = null;
    for (let i = 0; i < libres.length && !par; i++) {
      for (let j = i + 1; j < libres.length; j++) {
        const a = libres[i], b = libres[j];
        if (a.p.payer === b.p.payer && Math.abs(a.amount + b.amount - v.amount) <= 500) { par = [a, b]; break; }
      }
    }
    if (!par) continue;
    for (const x of par) {
      x.p.used = true;
      add(qrBancoTienda, v.store, x.amount);
      add(qrBancoDia, `${v.store}|${v.date}`, x.amount);
      qrAsignado += x.amount;
    }
    v.used = true;
  }

  // PASE 3b — UN solo pago QR que cubre DOS o TRES facturas de la misma tienda
  // (caso real: Nini Johana $224.600 = $224.000 + $600 en Plaza el 17-ago).
  for (const [amount, arr] of bankByAmount) {
    for (const p of arr) {
      if (p.used) continue;
      const porTienda = new Map<string, typeof qrSalesList>();
      for (const v of qrSalesList) if (!v.used && distQr(p.date, v.date) >= 0) porTienda.set(v.store, [...(porTienda.get(v.store) ?? []), v]);
      let combo: typeof qrSalesList | null = null;
      for (const vs of porTienda.values()) {
        for (let i = 0; i < vs.length && !combo; i++) {
          for (let j = i + 1; j < vs.length && !combo; j++) {
            if (Math.abs(vs[i].amount + vs[j].amount - amount) <= 500) { combo = [vs[i], vs[j]]; break; }
            for (let k = j + 1; k < vs.length; k++) if (Math.abs(vs[i].amount + vs[j].amount + vs[k].amount - amount) <= 500) { combo = [vs[i], vs[j], vs[k]]; break; }
          }
        }
        if (combo) break;
      }
      if (!combo) continue;
      p.used = true;
      for (const v of combo) {
        v.used = true;
        add(qrBancoTienda, v.store, v.amount);
        add(qrBancoDia, `${v.store}|${v.date}`, v.amount);
        qrAsignado += v.amount;
      }
    }
  }

  // resultados EFECTIVO del mes → mapear al último día de venta que cubren.
  // Se incluye cualquier resultado cuyo depósito CUBRA días del mes visible,
  // aunque el depósito cierre en otro mes (efectivo de fin de mes que se
  // consigna a comienzos del siguiente: así el 31 no sale como "falta").
  const efeRes = new Map<string, DiaEfe>(); // `${store}|${fecha}`
  for (const r of ledger.summary.results) {
    if (r.channel !== "EFECTIVO" || !r.storeCode) continue;
    const tocaMes = rango
      ? r.salesDates.some(inMonth) || inMonth(r.depositDate)
      : (r.month ?? r.depositDate.slice(0, 7)) === m || r.salesDates.some((d) => d.startsWith(m));
    if (!tocaMes) continue;
    const dias = [...r.salesDates].sort();
    const cierre = dias[dias.length - 1] ?? r.depositDate;
    for (const d of dias) {
      const k = `${r.storeCode}|${d}`;
      if (d === cierre) {
        efeRes.set(k, {
          venta: 0,
          deposito: r.depositAmount,
          depositoFecha: r.depositDate,
          grupo: dias,
          dif: r.difference,
          estado: r.status,
          late: r.late,
          qrAlert: r.qrAlert,
          nota: r.note,
        });
      } else if (!efeRes.has(k)) {
        efeRes.set(k, { venta: 0, deposito: null, depositoFecha: r.depositDate, grupo: dias, dif: 0, estado: "AGRUPADO" });
      }
    }
  }

  // armar días por tienda
  const stores = STORES.filter((s) => s.code !== "PRIN").map((s) => ({ code: s.code, name: s.name, recaudo: s.recaudo ?? null }));
  const data: Record<string, unknown> = {};
  for (const st of stores) {
    const fechas = new Set<string>();
    for (const map of [efeV, tarV, qrV, mpV, rappiV, addiV, otroV, plink]) for (const k of map.keys()) if (k.startsWith(st.code + "|")) fechas.add(k.split("|")[1]);
    for (const k of efeRes.keys()) if (k.startsWith(st.code + "|")) fechas.add(k.split("|")[1]);

    const days = [...fechas].sort().map((date) => {
      const k = `${st.code}|${date}`;
      const venta = efeV.get(k) ?? 0;
      const res = efeRes.get(k);
      let efe: DiaEfe;
      if (res) efe = { ...res, venta };
      else if (venta > 0) efe = { venta, deposito: null, depositoFecha: null, grupo: [], dif: -venta, estado: "PENDIENTE" };
      else efe = { venta: 0, deposito: null, depositoFecha: null, grupo: [], dif: 0, estado: "SIN_VENTA" };
      // centro comercial: ni consignación diaria ni datáfono propio → el día
      // solo informa la venta; el cuadre está en los cortes de 10 días
      const cc = esCentroComercial(st.code);
      if (cc) efe = { venta, deposito: null, depositoFecha: null, grupo: [], dif: 0, estado: "CENTRO_COMERCIAL" };
      const tarVenta = tarV.get(k) ?? 0;
      const tarPlink = plink.get(k) ?? 0;
      const tarCruce = cruzarDatafono(tarFilas.get(k) ?? [], datFilas.get(k) ?? []);
      const qrVentaDia = qrV.get(k) ?? 0;
      const qrBancoDiaVal = qrBancoDia.get(k) ?? 0;
      // "EN PLAZO" (solo efectivo): la consignación se hace el día hábil
      // siguiente, así que ese día no tenía por qué haber llegado todavía →
      // no es faltante, es normal. Distinto de datáfono/QR: esos entran el
      // MISMO día; si no aparecen es porque falta cargar el extracto, no
      // porque estén "en plazo" (se etiqueta "sin cargar").
      const efeEnPlazo =
        efe.estado === "PENDIENTE" &&
        ledger.cut.bank != null &&
        nextBusinessDay(date, holidays) > ledger.cut.bank;
      if (efeEnPlazo) efe = { ...efe, enPlazo: true };
      const tarSinCargar = tarVenta > 0 && ledger.cut.datafono != null && date > ledger.cut.datafono;
      const qrSinCargar = qrVentaDia > 0 && ledger.cut.qr != null && date > ledger.cut.qr;
      return {
        date,
        efe,
        // dif = neto (referencia); falta/sobra = cruce exacto sin netear (lo que se muestra)
        tar: cc
          ? { venta: tarVenta, plink: 0, dif: 0, falta: 0, sobra: 0, sinCargar: false, cc: true }
          : { venta: tarVenta, plink: tarPlink, dif: tarVenta - tarPlink, falta: tarCruce.falta, sobra: tarCruce.sobra, sinCargar: tarSinCargar, cc: false },
        qrVenta: qrVentaDia,
        qrBanco: qrBancoDiaVal,
        qrDif: qrVentaDia - qrBancoDiaVal, // + = falta en banco, − = sobra
        qrSinCargar,
        mercadopago: mpV.get(k) ?? 0,
        rappi: rappiV.get(k) ?? 0,
        addi: addiV.get(k) ?? 0,
        otros: otroV.get(k) ?? 0,
      };
    });

    const sum = (f: (d: (typeof days)[number]) => number) => days.reduce((a, d) => a + f(d), 0);
    // Totalizado del mes: además del NETO (que puede compensarse entre días),
    // se separa cuánto faltó y cuánto sobró en total, para ver de un vistazo
    // si al cierre ya está al día o si hay días con problemas reales debajo
    // de un neto que parece cuadrado. Convención unificada: faltante > 0 =
    // falta, faltante < 0 = sobra (efe: dif viene invertido -dif; tar/qr: dif
    // ya viene en ese sentido).
    const faltanteEfeDia = (d: (typeof days)[number]) =>
      d.efe.estado === "AGRUPADO" || (d.efe.estado === "PENDIENTE" && d.efe.enPlazo) ? 0 : -d.efe.dif;
    const faltanteQrDia = (d: (typeof days)[number]) => (d.qrSinCargar ? 0 : d.qrDif);
    const totalFalta = (f: (d: (typeof days)[number]) => number) => days.reduce((a, d) => a + Math.max(0, f(d)), 0);
    const totalSobra = (f: (d: (typeof days)[number]) => number) => days.reduce((a, d) => a + Math.max(0, -f(d)), 0);

    // cortes del CENTRO COMERCIAL de la tienda que tocan el período visible
    const esCC = esCentroComercial(st.code);
    const cortes = esCC ? ledger.summary.cortesCC.filter((c) => c.storeCode === st.code && (inMonth(c.desde) || inMonth(c.hasta))) : [];
    const ccTot = esCC
      ? {
          venta: cortes.reduce((a, c) => a + c.total, 0),
          efectivo: cortes.reduce((a, c) => a + c.ventaEfectivo, 0),
          datafono: cortes.reduce((a, c) => a + c.ventaDatafono, 0),
          pagado: cortes.reduce((a, c) => a + (c.pago?.amount ?? 0), 0),
          enPlazo: cortes.filter((c) => c.estado === "EN_PLAZO").reduce((a, c) => a + c.total, 0),
          vencido: cortes.filter((c) => c.estado === "VENCIDO").reduce((a, c) => a + c.total, 0),
          dif: cortes.filter((c) => c.pago).reduce((a, c) => a + c.dif, 0),
        }
      : null;
    data[st.code] = {
      days,
      cortes: esCC ? cortes : undefined,
      totales: {
        cc: ccTot,
        efeVenta: sum((d) => d.efe.venta),
        efeDepositado: sum((d) => d.efe.deposito ?? 0),
        // dif real: excluye lo pendiente EN PLAZO (aún no tenía que llegar)
        efeDif: sum((d) => (d.efe.estado === "AGRUPADO" || (d.efe.estado === "PENDIENTE" && d.efe.enPlazo) ? 0 : d.efe.dif)),
        efePendiente: sum((d) => (d.efe.estado === "PENDIENTE" && d.efe.enPlazo ? d.efe.venta : 0)),
        efeVencido: sum((d) => (d.efe.estado === "PENDIENTE" && !d.efe.enPlazo ? d.efe.venta : 0)),
        efeFaltaTotal: totalFalta(faltanteEfeDia),
        efeSobraTotal: totalSobra(faltanteEfeDia),
        tarVenta: sum((d) => d.tar.venta),
        tarPlink: sum((d) => d.tar.plink),
        tarDif: sum((d) => (d.tar.sinCargar ? 0 : d.tar.dif)),
        tarSinCargar: sum((d) => (d.tar.sinCargar ? d.tar.venta : 0)),
        // datáfono: falta y sobra del cruce exacto, sin netear entre sí
        tarFaltaTotal: sum((d) => (d.tar.sinCargar ? 0 : d.tar.falta)),
        tarSobraTotal: sum((d) => (d.tar.sinCargar ? 0 : d.tar.sobra)),
        qrVenta: sum((d) => d.qrVenta),
        qrBanco: qrBancoTienda.get(st.code) ?? 0, // banco QR asignado por valor
        qrSinCargar: sum((d) => (d.qrSinCargar ? d.qrVenta : 0)),
        qrFaltaTotal: totalFalta(faltanteQrDia),
        qrSobraTotal: totalSobra(faltanteQrDia),
        mercadopago: sum((d) => d.mercadopago),
        rappi: sum((d) => d.rappi),
        addi: sum((d) => d.addi),
        otros: sum((d) => d.otros),
      },
    };
  }

  // QR empresa por día
  const qrDias = new Set<string>([...qrBanco.keys()]);
  for (const k of qrV.keys()) qrDias.add(k.split("|")[1]);
  const qrEmpresa = [...qrDias].sort().map((date) => {
    let venta = 0;
    for (const st of stores) venta += qrV.get(`${st.code}|${date}`) ?? 0;
    const banco = qrBanco.get(date) ?? 0;
    return { date, venta, banco, dif: venta - banco };
  });
  const qrBancoTotal = [...qrBanco.values()].reduce((a, b) => a + b, 0);
  const qrResumen = {
    asignado: qrAsignado,
    sinAsignar: qrBancoTotal - qrAsignado,
    revisar: qrRevisar.map((r) => ({ ...r, stores: r.stores.map((c) => storeName(c)) })),
  };

  // Mercado Pago empresa por día (venta vs recaudo del settlement)
  const mpDias = new Set<string>([...mpBrutoDia.keys(), ...mpVentaDia.keys()]);
  const mpEmpresa = [...mpDias].sort().map((date) => {
    const venta = mpVentaDia.get(date) ?? 0;
    const bruto = mpBrutoDia.get(date) ?? 0;
    const neto = mpNetoDia.get(date) ?? 0;
    return { date, venta, bruto, neto, dif: venta - bruto };
  });
  const mpResumen = {
    venta: [...mpVentaDia.values()].reduce((a, b) => a + b, 0),
    bruto: [...mpBrutoDia.values()].reduce((a, b) => a + b, 0),
    neto: [...mpNetoDia.values()].reduce((a, b) => a + b, 0),
    tieneRecaudo: mpRows.some((e) => inMonth(e.date)),
  };

  return Response.json({
    months,
    month: m,
    rango,
    stores: stores.map((s) => ({ ...s, name: storeName(s.code) })),
    data,
    qrEmpresa,
    qrResumen,
    mpEmpresa,
    mpResumen,
    cut: ledger.cut,
  });
}
