// Ventas de la ubicación SHOPIFY de Karrot (web Plazet, entran solas por la
// integración Shopify → Karrot). Llegan SIN método de pago, así que el reporte
// de métodos de pago (el que carga la rutina diaria) no las trae: se cargan
// aparte desde el reporte ALL_SALES del conector (locationID de SHOPIFY) con
// source "karrot_shopify" y bodega "SHOPIFY · Pago Online".
import { parse as parseCsv } from "csv-parse/sync";

export const SHOPIFY_LOCATION_ID = "6320986b-8b4e-4341-9c3b-f002dc5a5f6a";

export interface VentaShopifyKarrot {
  invoice: string;
  date: string;
  hora: string | null;
  amount: number;
  cliente: string | null;
  fe: string | null; // factura electrónica (P281) o null si no se emitió
}

export function parseKarrotShopify(text: string): VentaShopifyKarrot[] {
  const limpio = text.replace(/^﻿/, "").replace(/^\[Resource from [^\]]*\]\s*/, "").trim();
  const rows = parseCsv(limpio, { columns: true, relax_column_count: true, skip_empty_lines: true, trim: true }) as Record<string, string>[];
  const out: VentaShopifyKarrot[] = [];
  for (const r of rows) {
    if (!r["Invoice #"] || /^[SY]/i.test(r["Canceled"] ?? "")) continue;
    if ((r["Warehouse Name"] ?? "").toUpperCase() !== "SHOPIFY") continue;
    const date = (r["Date"] ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const fe = /^(y|s)/i.test(r["Electronically invoiced"] ?? "") ? `${r["Electronic invoice prefix"] ?? ""}${r["Electronic invoice consecutive"] ?? ""}` : null;
    out.push({
      invoice: r["Invoice #"],
      date,
      hora: (r["Time"] ?? "").slice(0, 5) || null,
      amount: Number(r["Sale with Tip"] ?? r["Sale"] ?? 0),
      cliente: (r["Customer Name"] ?? "").replace(/\s+/g, " ") || null,
      fe: fe || null,
    });
  }
  return out;
}
