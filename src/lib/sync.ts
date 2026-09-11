// Sincronizaciones por API (Shopify, Mercado Pago, Alegra) en un solo lugar:
// las usan el botón de /web (con sesión) y el cron diario de Vercel
// (/api/cron/sync, con CRON_SECRET). Karrot no tiene API abierta: entra por el
// CSV del conector que empuja la rutina de Claude a /api/cron/karrot.

import { prisma } from "@/lib/db";
import { shopConfigs, fetchWebOrders } from "@/lib/shopify";
import { fetchMpPayments, MP_SINCE } from "@/lib/mercadopago-api";
import { fetchAlegraPagosMes } from "@/lib/alegra-api";
import { loadClosedMonths } from "@/lib/ledger";

export interface ShopifySyncOut {
  shops: { shop: string; label: string; orders: number; from: string | null; to: string | null }[];
  errors: string[];
}

/** Reemplaza por completo los pedidos web guardados de cada tienda (Shopify es
 * la fuente de verdad y el volumen es bajo). */
export async function syncShopify(): Promise<ShopifySyncOut> {
  const cfgs = shopConfigs();
  if (cfgs.length === 0) {
    throw new Error("Faltan las credenciales de Shopify (variables SHOPIFY_… en el entorno).");
  }
  const out: ShopifySyncOut = { shops: [], errors: [] };
  for (const cfg of cfgs) {
    try {
      const orders = await fetchWebOrders(cfg);
      await prisma.shopifyOrder.deleteMany({ where: { shop: cfg.key } });
      if (orders.length > 0) {
        await prisma.shopifyOrder.createMany({
          data: orders.map((o) => ({
            shop: o.shop,
            name: o.name,
            orderId: o.orderId,
            date: o.date,
            amount: o.amount,
            refund: o.refund,
            refundDate: o.refundDate,
            gateway: o.gateway,
            financial: o.financial,
          })),
        });
      }
      const dates = orders.map((o) => o.date).sort();
      await prisma.upload.create({
        data: {
          filename: `Shopify ${cfg.label} (API)`,
          kind: "shopify",
          dateFrom: dates[0] ?? null,
          dateTo: dates[dates.length - 1] ?? null,
          rows: orders.length,
        },
      });
      out.shops.push({ shop: cfg.key, label: cfg.label, orders: orders.length, from: dates[0] ?? null, to: dates[dates.length - 1] ?? null });
    } catch (e) {
      out.errors.push(`${cfg.label}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (out.shops.length === 0) throw new Error(out.errors.join(" · ") || "No se pudo sincronizar Shopify.");
  return out;
}

export interface MpSyncOut {
  ops: number;
  from: string;
  to: string;
  omitidasMesCerrado: number;
}

/** Reemplaza las operaciones de Mercado Pago desde MP_SINCE, respetando los
 * meses cerrados (no se borran ni se insertan). */
export async function syncMercadoPago(): Promise<MpSyncOut> {
  const closed = await loadClosedMonths();
  const all = await fetchMpPayments();
  const rows = all.filter((r) => !closed.has(r.date.slice(0, 7)));
  const dates = rows.map((r) => r.date).sort();
  const from = dates[0] ?? MP_SINCE;
  const to = dates[dates.length - 1] ?? MP_SINCE;
  const months = [...new Set(rows.map((r) => r.date.slice(0, 7)))].filter((m) => !closed.has(m));
  if (months.length > 0) {
    await prisma.mercadopagoEntry.deleteMany({
      where: { date: { gte: from, lte: to }, OR: months.map((m) => ({ date: { startsWith: m } })) },
    });
    await prisma.mercadopagoEntry.createMany({ data: rows });
  }
  await prisma.upload.create({
    data: {
      filename: "Mercado Pago (API)",
      kind: "mercadopago_api",
      dateFrom: from,
      dateTo: to,
      rows: rows.length,
      skipped: all.length - rows.length,
    },
  });
  return { ops: rows.length, from, to, omitidasMesCerrado: all.length - rows.length };
}

/** Reemplaza los pagos de Alegra de un mes (YYYY-MM) con su cuenta destino. */
export async function syncAlegra(month: string): Promise<{ month: string; pagos: number }> {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Mes inválido (YYYY-MM).");
  const pagos = await fetchAlegraPagosMes(month);
  await prisma.alegraPago.deleteMany({ where: { date: { startsWith: month } } });
  if (pagos.length > 0) {
    await prisma.alegraPago.createMany({ data: pagos, skipDuplicates: true });
  }
  await prisma.upload.create({
    data: {
      filename: `Alegra pagos ${month} (API)`,
      kind: "alegra_pagos",
      dateFrom: `${month}-01`,
      dateTo: pagos.map((p) => p.date).sort().pop() ?? `${month}-01`,
      rows: pagos.length,
    },
  });
  return { month, pagos: pagos.length };
}

/** Fecha de hoy en Colombia (UTC-5), YYYY-MM-DD */
export function hoyColombia(): string {
  return new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
}

/** Mes en Colombia con desplazamiento (0 = actual, -1 = anterior), YYYY-MM */
export function mesColombia(offset = 0): string {
  const hoy = hoyColombia();
  const [y, m] = hoy.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + offset, 1));
  return d.toISOString().slice(0, 7);
}

export interface SyncTodoOut {
  fecha: string;
  shopify: ShopifySyncOut | null;
  mercadopago: MpSyncOut | null;
  alegra: { month: string; pagos: number }[];
  errores: string[];
}

/** Corre las tres sincronizaciones en paralelo (para caber en el tiempo de
 * una función de Vercel). Alegra: el mes en curso y, los primeros días del
 * mes, también el anterior (para cerrar bien el mes vencido). */
export async function syncTodo(): Promise<SyncTodoOut> {
  const hoy = hoyColombia();
  const meses = Number(hoy.slice(8, 10)) <= 5 ? [mesColombia(0), mesColombia(-1)] : [mesColombia(0)];
  const out: SyncTodoOut = { fecha: hoy, shopify: null, mercadopago: null, alegra: [], errores: [] };
  const [sh, mp, ...al] = await Promise.allSettled([
    syncShopify(),
    syncMercadoPago(),
    ...meses.map((m) => syncAlegra(m)),
  ]);
  if (sh.status === "fulfilled") {
    out.shopify = sh.value;
    out.errores.push(...sh.value.errors.map((e) => `Shopify · ${e}`));
  } else out.errores.push(`Shopify: ${sh.reason instanceof Error ? sh.reason.message : String(sh.reason)}`);
  if (mp.status === "fulfilled") out.mercadopago = mp.value;
  else out.errores.push(`Mercado Pago: ${mp.reason instanceof Error ? mp.reason.message : String(mp.reason)}`);
  al.forEach((r, i) => {
    if (r.status === "fulfilled") out.alegra.push(r.value);
    else out.errores.push(`Alegra ${meses[i]}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
  });
  return out;
}
