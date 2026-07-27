// Datos del tablero por tienda: para un mes dado devuelve, por tienda y por
// día, la venta y el recaudo de cada canal (efectivo / datafono / QR / otros)
// con su diferencia y estado. El QR del banco no trae tienda: se entrega la
// serie a nivel empresa.

import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { computeLedger } from "@/lib/ledger";
import { STORES, storeName } from "@/lib/stores";

export const runtime = "nodejs";

interface DiaEfe {
  venta: number;
  deposito: number | null; // monto del depósito que CIERRA en este día
  depositoFecha: string | null;
  grupo: string[]; // días de venta que cubre ese depósito
  dif: number; // dif del grupo (en el día de cierre) o -venta si pendiente
  estado: "CUADRA" | "DIFERENCIA" | "SIN_CONCILIAR" | "MANUAL" | "AGRUPADO" | "PENDIENTE" | "SIN_VENTA";
  late?: boolean;
  qrAlert?: boolean;
  nota?: string;
}

export async function GET(request: NextRequest) {
  const month = request.nextUrl.searchParams.get("month");

  const [salesRows, dataRows, qrRows, mpRows, ledger] = await Promise.all([
    prisma.sale.findMany(),
    prisma.dataphoneEntry.findMany(),
    prisma.qrEntry.findMany(),
    prisma.mercadopagoEntry.findMany(),
    computeLedger(),
  ]);

  const monthsSet = new Set<string>(salesRows.map((s) => s.date.slice(0, 7)));
  const months = [...monthsSet].sort().reverse();
  const m = month && monthsSet.has(month) ? month : months[0];
  if (!m) return Response.json({ months: [], stores: [], data: {} });

  const inMonth = (d: string) => d.startsWith(m);
  const add = (map: Map<string, number>, k: string, v: number) => map.set(k, (map.get(k) ?? 0) + v);

  // clasifica un pago OTRO por plataforma según el texto de la bodega/cuenta
  const plataforma = (bodega: string): "mercadopago" | "rappi" | "addi" | "otros" => {
    const b = bodega.toUpperCase();
    if (b.includes("RAPPI")) return "rappi";
    if (b.includes("ADDI")) return "addi";
    if (b.includes("MERCADO")) return "mercadopago";
    return "otros";
  };

  // ventas por (tienda, día, canal)
  const efeV = new Map<string, number>(), tarV = new Map<string, number>(), qrV = new Map<string, number>();
  const mpV = new Map<string, number>(), rappiV = new Map<string, number>(), addiV = new Map<string, number>(), otroV = new Map<string, number>();
  for (const s of salesRows) {
    if (!s.storeCode || !inMonth(s.date)) continue;
    const k = `${s.storeCode}|${s.date}`;
    if (s.method === "EFECTIVO") add(efeV, k, s.amount);
    else if (s.method === "TARJETA_CREDITO" || s.method === "TARJETA_DEBITO") add(tarV, k, s.amount);
    else if (s.method === "TRANSFERENCIA") add(qrV, k, s.amount);
    else {
      const p = plataforma(s.bodega);
      add(p === "mercadopago" ? mpV : p === "rappi" ? rappiV : p === "addi" ? addiV : otroV, k, s.amount);
    }
  }
  // plink por (tienda, día)
  const plink = new Map<string, number>();
  for (const d of dataRows) if (d.storeCode && inMonth(d.txDate)) add(plink, `${d.storeCode}|${d.txDate}`, d.gross);
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
  const diaDif = (a: string, b: string) =>
    Math.abs(Math.round((Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / 86400000));
  const qrSalesList = salesRows
    .filter((s) => s.method === "TRANSFERENCIA" && s.storeCode && inMonth(s.date))
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
  const qrRevisar: { date: string; amount: number; stores: string[] }[] = [];
  // pagos del banco agrupados por valor
  const bankByAmount = new Map<number, { date: string; used: boolean }[]>();
  for (const q of qrRows) {
    if (!inMonth(q.date)) continue;
    const a = Math.round(q.amount);
    const arr = bankByAmount.get(a) ?? [];
    arr.push({ date: q.date, used: false });
    bankByAmount.set(a, arr);
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
        const dd = diaDif(p.date, v.date);
        if (dd <= 6 && dd < bestD) { best = i; bestD = dd; }
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
      (v) => !v.used && Math.abs(v.amount - amount) <= 500 && diaDif(v.date, ref.date) <= 6,
    );
    if (cands.length === 0) continue; // pago sin venta que cruce → queda a nivel empresa
    const clave = (c: (typeof cands)[number]) => diaDif(c.date, ref.date) * 1000 + Math.abs(c.amount - amount);
    let best = cands[0];
    for (const c of cands) if (clave(c) < clave(best)) best = c;
    const empatadas = cands.filter((c) => clave(c) === clave(best));
    if (new Set(empatadas.map((c) => c.store)).size > 1) {
      // empate real entre tiendas → no adivinar, revisar a mano
      qrRevisar.push({ date: ref.date, amount, stores: [...new Set(cands.map((c) => c.store))] });
      continue;
    }
    ref.used = true;
    best.used = true;
    add(qrBancoTienda, best.store, amount);
    add(qrBancoDia, `${best.store}|${best.date}`, amount); // el residuo (ej. $50) queda visible como dif del día
    qrAsignado += amount;
  }

  // resultados EFECTIVO del mes → mapear al último día de venta que cubren
  const efeRes = new Map<string, DiaEfe>(); // `${store}|${fecha}`
  for (const r of ledger.summary.results) {
    if (r.channel !== "EFECTIVO" || !r.storeCode) continue;
    if ((r.month ?? r.depositDate.slice(0, 7)) !== m) continue;
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
  const stores = STORES.filter((s) => s.code !== "PRIN").map((s) => ({ code: s.code, name: s.name }));
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
      const tarVenta = tarV.get(k) ?? 0;
      const tarPlink = plink.get(k) ?? 0;
      const qrVentaDia = qrV.get(k) ?? 0;
      const qrBancoDiaVal = qrBancoDia.get(k) ?? 0;
      return {
        date,
        efe,
        tar: { venta: tarVenta, plink: tarPlink, dif: tarVenta - tarPlink },
        qrVenta: qrVentaDia,
        qrBanco: qrBancoDiaVal,
        qrDif: qrVentaDia - qrBancoDiaVal, // + = falta en banco, − = sobra
        mercadopago: mpV.get(k) ?? 0,
        rappi: rappiV.get(k) ?? 0,
        addi: addiV.get(k) ?? 0,
        otros: otroV.get(k) ?? 0,
      };
    });

    const sum = (f: (d: (typeof days)[number]) => number) => days.reduce((a, d) => a + f(d), 0);
    data[st.code] = {
      days,
      totales: {
        efeVenta: sum((d) => d.efe.venta),
        efeDepositado: sum((d) => d.efe.deposito ?? 0),
        efeDif: sum((d) => (d.efe.estado === "AGRUPADO" ? 0 : d.efe.dif)),
        efePendiente: sum((d) => (d.efe.estado === "PENDIENTE" ? d.efe.venta : 0)),
        tarVenta: sum((d) => d.tar.venta),
        tarPlink: sum((d) => d.tar.plink),
        tarDif: sum((d) => d.tar.dif),
        qrVenta: sum((d) => d.qrVenta),
        qrBanco: qrBancoTienda.get(st.code) ?? 0, // banco QR asignado por valor
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
    stores: stores.map((s) => ({ ...s, name: storeName(s.code) })),
    data,
    qrEmpresa,
    qrResumen,
    mpEmpresa,
    mpResumen,
    cut: ledger.cut,
  });
}
