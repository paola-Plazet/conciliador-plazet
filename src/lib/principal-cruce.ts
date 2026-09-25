// Conciliación de la bodega PRINCIPAL (Karrot, desde sep-2026): Elba factura
// ahí la web de NL y Plazet, Mercado Libre, las empresas y alguna venta en
// efectivo. Cada factura se cruza con el cobro que le corresponde:
//   - método Mercadopago → operación de Mercado Pago (web o Mercado Libre),
//     mismo valor (±$300) cobrado entre 7 días antes y 1 día después;
//   - transferencia / efectivo (o Mercadopago que no apareció en MP) →
//     entrada del banco: Bancolombia (transferencias y "PAGO LLAVE" del CSV
//     191) o Alianza (consignaciones sin tienda), ±$1.000, de 7 días antes a
//     60 días después (las empresas pagan a crédito).
// Y al revés: cobros de MP de la web / Mercado Libre que ninguna factura usó
// = ventas sin facturar en Karrot.
import { prisma } from "@/lib/db";

export const PRINCIPAL_DESDE = "2026-09-01";

const TOL_MP = 300;
const TOL_BANCO = 1000;

const dias = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
const addDias = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);

export type Canal = "web-nl" | "web-plazet" | "mercadolibre" | "empresa" | "efectivo" | "otro";

export interface CobroMp {
  tipo: "mp";
  opId: string;
  date: string;
  bruto: number;
  neto: number;
  medio: string;
  origen: string | null;
  detalle: string | null;
  pedido: string | null; // pedido Shopify que calza con este cobro
  reciente?: boolean; // posterior a la última factura cargada de Karrot (aún puede facturarse)
}
export interface CobroBanco {
  tipo: "banco";
  cuenta: "Bancolombia" | "Alianza";
  date: string;
  amount: number;
  concepto: string;
}
export type Cobro = CobroMp | CobroBanco;

export interface FacturaPrincipal {
  id: number;
  invoice: string;
  date: string;
  metodo: string; // Mercadopago | Efectivo | Transferencia | ...
  amount: number;
  cliente: string | null;
  orderType: string | null;
  canal: Canal;
  cobro: Cobro | null;
  dif: number; // cobro − factura
  aviso: string | null;
  nc: string | null; // nota crédito que la anula (toda o en parte)
  anulada: boolean;
  grupo: string[] | null; // otras facturas del mismo cliente y día pagadas con el mismo cobro
  posible: CobroMp | null; // cobro MP parecido (no exacto) para revisar a mano
  manual: string | null; // nota del vínculo manual (PrincipalVinculo)
  bodega: string; // PRINCIPAL | SHOPIFY
  fe: string | null;
}

export interface PrincipalOut {
  months: string[];
  month: string;
  facturas: FacturaPrincipal[];
  sinFactura: CobroMp[];
  mpHasta: string | null;
  bancoHasta: string | null;
  karrotHasta: string | null;
}

function canalDe(metodo: string, orderType: string | null, cobro: Cobro | null, cliente: string | null): Canal {
  if (cobro?.tipo === "mp") {
    if (cobro.origen === "mercadolibre") return "mercadolibre";
    if (cobro.origen === "web-nl") return "web-nl";
    if (cobro.origen === "web-plazet") return "web-plazet";
  }
  if (metodo === "Efectivo" && !cobro) return "efectivo";
  if (metodo === "Transferencia" || cobro?.tipo === "banco") return "empresa";
  if (orderType === "NL") return "web-nl";
  if (cliente && /S\.?A\.?S?|LTDA|S\.A/i.test(cliente)) return "empresa";
  return "otro";
}

/** Penaliza cruzar una factura con un cobro de otro canal: Order Type "NL" es
 * la web de Natural Light; sin Order Type suele ser Plazet o Mercado Libre. */
function penalOrigen(orderType: string | null, origen: string | null): number {
  if (!origen) return 0;
  if (orderType === "NL") return origen === "web-nl" ? 0 : 5000;
  return origen === "web-nl" ? 5000 : 0;
}

export async function conciliarPrincipal(monthParam?: string | null): Promise<PrincipalOut> {
  const [ventas, mpRows, orders, qr, bank, refs, ncs, vinculos] = await Promise.all([
    prisma.sale.findMany({
      where: { OR: [{ bodega: { startsWith: "PRINCIPAL" } }, { bodega: { startsWith: "SHOPIFY" } }], date: { gte: PRINCIPAL_DESDE } },
      orderBy: [{ date: "asc" }, { id: "asc" }],
    }),
    prisma.mercadopagoEntry.findMany({ where: { date: { gte: addDias(PRINCIPAL_DESDE, -10) } }, orderBy: { date: "asc" } }),
    prisma.shopifyOrder.findMany({ where: { date: { gte: addDias(PRINCIPAL_DESDE, -10) } } }),
    prisma.qrEntry.findMany({ where: { date: { gte: addDias(PRINCIPAL_DESDE, -10) } } }),
    prisma.bankEntry.findMany({ where: { date: { gte: addDias(PRINCIPAL_DESDE, -10) }, amount: { gt: 0 } } }),
    prisma.cashReference.findMany(),
    prisma.creditNote.findMany({ where: { storeCode: null, date: { gte: PRINCIPAL_DESDE } } }),
    prisma.principalVinculo.findMany(),
  ]);

  // notas crédito de PRINCIPAL por # de factura (recibo de la venta)
  const ncDe = new Map<string, { num: string; net: number }>();
  for (const n of ncs) {
    const p = ncDe.get(n.orderReceipt);
    ncDe.set(n.orderReceipt, { num: p ? `${p.num}, ${n.ncNumber}` : n.ncNumber, net: (p?.net ?? 0) + n.net });
  }
  const aCobrar = (s: { invoice: string; amount: number }) => s.amount - (ncDe.get(s.invoice)?.net ?? 0);

  // pedido Shopify de cada cobro MP (mismo cruce de /web: ±$100, ≤4 días)
  const pedidoDe = new Map<string, string>();
  {
    const usados = new Set<number>();
    for (const m of mpRows) {
      let best = -1;
      let bestScore = Infinity;
      orders.forEach((o, i) => {
        if (usados.has(i) || !/mercado\s*pago/i.test(o.gateway)) return;
        const da = Math.abs(o.amount - m.bruto);
        const dd = Math.abs(dias(o.date, m.date));
        if (da > 100 || dd > 4) return;
        const s = dd * 1000 + da;
        if (s < bestScore) { bestScore = s; best = i; }
      });
      if (best >= 0) { usados.add(best); pedidoDe.set(m.opId, orders[best].name); }
    }
  }

  const toMp = (m: (typeof mpRows)[number]): CobroMp => ({
    tipo: "mp", opId: m.opId, date: m.date, bruto: m.bruto, neto: m.neto, medio: m.medio,
    origen: m.origen, detalle: m.detalle, pedido: pedidoDe.get(m.opId) ?? null,
  });

  // entradas de banco candidatas: Bancolombia que no son PAGO QR de tiendas
  // (transferencias, PAGO LLAVE) y consignaciones de Alianza sin tienda
  const conocidas = new Set(refs.map((r) => r.reference));
  const banco: CobroBanco[] = [
    ...qr.filter((q) => !/PAGO\s+QR/i.test(q.concept)).map((q) => ({
      tipo: "banco" as const, cuenta: "Bancolombia" as const, date: q.date, amount: q.amount, concepto: q.payer || q.concept,
    })),
    ...bank.filter((b) => !(b.kind === "RECAUDO_EFECTIVO" && b.reference && conocidas.has(b.reference))).map((b) => ({
      tipo: "banco" as const, cuenta: "Alianza" as const, date: b.date, amount: b.amount, concepto: b.concept,
    })),
  ];

  // "Pago Online" = pedido web Plazet que entró solo por la integración Shopify → Karrot (se cobra por MP)
  const esMpVenta = (s: (typeof ventas)[number]) => /mercado\s*pago|pago online/i.test(metodoDe(s));
  const metodoDe = (s: (typeof ventas)[number]) =>
    s.bodega.includes("·") ? s.bodega.split("·")[1].trim() : s.method === "EFECTIVO" ? "Efectivo" : s.method === "TRANSFERENCIA" ? "Transferencia" : s.method;

  const mpUsado = new Set<number>();
  const bancoUsado = new Set<number>();
  const cobroDe = new Map<number, Cobro>();

  // pase 0: vínculos manuales (factura ↔ cobro MP), antes que todo
  const grupoDe = new Map<number, string[]>();
  const manualDe = new Map<number, string>();
  {
    const idxOp = new Map(mpRows.map((m, i) => [m.opId, i]));
    const porOp = new Map<string, typeof ventas>();
    for (const v of vinculos) {
      const s = ventas.find((x) => x.invoice === v.invoice);
      const i = idxOp.get(v.opId);
      if (!s || i == null) continue;
      mpUsado.add(i);
      cobroDe.set(s.id, toMp(mpRows[i]));
      manualDe.set(s.id, v.nota ?? "vinculado a mano");
      porOp.set(v.opId, [...(porOp.get(v.opId) ?? []), s]);
    }
    for (const g of porOp.values()) {
      if (g.length > 1) for (const s of g) grupoDe.set(s.id, g.filter((x) => x.id !== s.id).map((x) => x.invoice));
    }
  }
  // pase 1: Mercadopago ↔ MP. Asignación GLOBAL por puntaje (fecha, valor y
  // canal) para que una factura de Mercado Libre no le quite el cobro a una web
  {
    const pares: { sid: number; mi: number; sc: number }[] = [];
    for (const s of ventas) {
      if (!esMpVenta(s) || aCobrar(s) <= 1) continue;
      mpRows.forEach((m, i) => {
        const da = Math.abs(m.bruto - aCobrar(s));
        const dd = dias(m.date, s.date); // + = factura después del cobro
        if (da > TOL_MP || dd < -1 || dd > 7) return;
        pares.push({ sid: s.id, mi: i, sc: Math.abs(dd) * 1000 + da + penalOrigen(s.orderType, m.origen) });
      });
    }
    pares.sort((x, y) => x.sc - y.sc);
    for (const p of pares) {
      if (cobroDe.has(p.sid) || mpUsado.has(p.mi)) continue;
      mpUsado.add(p.mi);
      cobroDe.set(p.sid, toMp(mpRows[p.mi]));
    }
  }
  // pase 1b: varias facturas del mismo cliente y día pagadas con UN cobro MP
  {
    const grupos = new Map<string, typeof ventas>();
    for (const s of ventas) {
      if (cobroDe.has(s.id) || aCobrar(s) <= 1 || !esMpVenta(s)) continue;
      if (!s.cliente || /an[oó]nimo/i.test(s.cliente)) continue;
      const k = `${s.date}|${s.cliente.toLowerCase()}`;
      grupos.set(k, [...(grupos.get(k) ?? []), s]);
    }
    for (const g of grupos.values()) {
      if (g.length < 2) continue;
      const total = g.reduce((a, s) => a + aCobrar(s), 0);
      const i = mpRows.findIndex((m, j) => !mpUsado.has(j) && Math.abs(m.bruto - total) <= TOL_MP &&
        dias(m.date, g[0].date) >= -1 && dias(m.date, g[0].date) <= 7);
      if (i < 0) continue;
      mpUsado.add(i);
      for (const s of g) {
        cobroDe.set(s.id, toMp(mpRows[i]));
        grupoDe.set(s.id, g.filter((x) => x.id !== s.id).map((x) => x.invoice));
      }
    }
  }
  // pase 2: lo que falta ↔ banco
  for (const s of ventas) {
    if (cobroDe.has(s.id) || aCobrar(s) <= 1) continue;
    let best = -1;
    let bestScore = Infinity;
    banco.forEach((b, i) => {
      if (bancoUsado.has(i)) return;
      const da = Math.abs(b.amount - aCobrar(s));
      const dd = dias(s.date, b.date); // + = pago después de la factura
      if (da > TOL_BANCO || dd < -7 || dd > 60) return;
      const sc = Math.abs(dd) * 1000 + da;
      if (sc < bestScore) { bestScore = sc; best = i; }
    });
    if (best >= 0) { bancoUsado.add(best); cobroDe.set(s.id, banco[best]); }
  }

  const facturasAll: FacturaPrincipal[] = ventas.map((s) => {
    const metodo = metodoDe(s);
    const cobro = cobroDe.get(s.id) ?? null;
    const monto = cobro ? (cobro.tipo === "mp" ? cobro.bruto : cobro.amount) : 0;
    const nc = ncDe.get(s.invoice) ?? null;
    const anulada = aCobrar(s) <= 1;
    let aviso: string | null = null;
    if (anulada) aviso = null;
    else if (s.bodega.startsWith("SHOPIFY") && !s.fe) aviso = cobro ? "Entró de Shopify pero SIN factura electrónica" : "Entró de Shopify sin factura electrónica ni cobro encontrado";
    else if (cobro?.tipo === "banco" && /mercado\s*pago/i.test(metodo)) aviso = `Karrot dice Mercadopago pero llegó por ${cobro.cuenta}: corregir el método`;
    else if (cobro?.tipo === "banco" && metodo === "Efectivo") aviso = `Registrada como efectivo pero llegó por ${cobro.cuenta} (transferencia)`;
    else if (!cobro && /mercado\s*pago|pago online/i.test(metodo)) aviso = "No aparece el cobro en Mercado Pago ni en el banco";
    else if (!cobro && metodo === "Efectivo") aviso = "Efectivo sin consignación encontrada";
    else if (!cobro) aviso = "Pago no encontrado en el banco";
    return {
      id: s.id, invoice: s.invoice, date: s.date, metodo, amount: s.amount,
      cliente: s.cliente, orderType: s.orderType,
      canal: canalDe(metodo, s.orderType, cobro, s.cliente),
      cobro, dif: cobro && !grupoDe.has(s.id) ? Math.round(monto - aCobrar(s)) : 0, aviso,
      nc: nc?.num ?? null, anulada,
      grupo: grupoDe.get(s.id) ?? null,
      posible: null,
      manual: manualDe.get(s.id) ?? null,
      bodega: s.bodega.split("·")[0].trim(),
      fe: s.fe,
    };
  });

  // cobros de la web / Mercado Libre sin factura (desde que existe PRINCIPAL;
  // los cobros de hasta 1 día antes del arranque se facturaron en NL/SHOPIFY)
  const sinFacturaAll = mpRows
    .map((m, i) => ({ m, i }))
    .filter(({ m, i }) => !mpUsado.has(i) && m.date >= PRINCIPAL_DESDE &&
      (m.origen === "mercadolibre" || m.origen === "web-nl" || m.origen === "web-plazet"))
    .map(({ m }) => toMp(m));

  // sugerencia para las que quedaron sin cobro: cobro MP libre de valor
  // parecido (±2 % o ±$5.000) hasta 10 días antes / 2 después
  const sugerido = new Set<number>();
  for (const f of facturasAll) {
    if (f.cobro || f.anulada || !/mercado\s*pago|pago online/i.test(f.metodo)) continue;
    const obj = f.amount - (ncDe.get(f.invoice)?.net ?? 0);
    let best = -1;
    let bestScore = Infinity;
    mpRows.forEach((m, i) => {
      if (mpUsado.has(i) || sugerido.has(i) || penalOrigen(f.orderType, m.origen) > 0) return;
      const da = Math.abs(m.bruto - obj);
      const dd = dias(m.date, f.date);
      if (da > Math.max(5000, obj * 0.02) || dd < -2 || dd > 10) return;
      const sc = da + Math.abs(dd) * 500;
      if (sc < bestScore) { bestScore = sc; best = i; }
    });
    if (best >= 0) { sugerido.add(best); f.posible = toMp(mpRows[best]); }
  }
  const karrotHasta = ventas.length ? ventas[ventas.length - 1].date : null;
  for (const c of sinFacturaAll) c.reciente = !!karrotHasta && c.date >= karrotHasta;

  const months = [...new Set([...ventas.map((v) => v.date.slice(0, 7)), ...sinFacturaAll.map((c) => c.date.slice(0, 7))])].sort().reverse();
  const month = monthParam && months.includes(monthParam) ? monthParam : months[0] ?? PRINCIPAL_DESDE.slice(0, 7);

  const max = (xs: string[]) => (xs.length ? xs.reduce((a, b) => (a > b ? a : b)) : null);
  return {
    months,
    month,
    facturas: facturasAll.filter((f) => f.date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date) || b.invoice.localeCompare(a.invoice)),
    sinFactura: sinFacturaAll.filter((c) => c.date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date)),
    mpHasta: max(mpRows.map((m) => m.date)),
    bancoHasta: max([...qr.map((q) => q.date), ...bank.map((b) => b.date)]),
    karrotHasta,
  };
}
