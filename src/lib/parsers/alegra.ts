// Parser del reporte "Facturas" de Alegra (CSV, separador ;, codificación Latin1).
// IMPORTANTE: el CSV trae UNA FILA POR ÍTEM, con el total de la factura repetido.
// Se deduplica por número de comprobante (CÓDIGO) para no inflar las ventas.

import { parse } from "csv-parse/sync";
import { fromDDMMYYYY, parseNumber } from "./util";
import { storeFromBodega, normalize } from "../stores";
import type { PaymentMethod, SaleInvoice } from "../types";

function mapMethod(raw: string): PaymentMethod {
  const n = normalize(raw);
  if (n.includes("EFECTIVO")) return "EFECTIVO";
  if (n.includes("CREDITO")) return "TARJETA_CREDITO";
  if (n.includes("DEBITO") && n.includes("TARJETA")) return "TARJETA_DEBITO";
  if (n.includes("TRANSFERENCIA")) return "TRANSFERENCIA";
  // "Transferencia débito" cae arriba; débito solo sin "tarjeta" -> transferencia
  if (n.includes("DEBITO")) return "TRANSFERENCIA";
  return "OTRO";
}

export interface AlegraParseResult {
  sales: SaleInvoice[];
  totalInvoices: number;
  totalAmount: number;
  byMethod: Record<string, number>;
  warnings: string[];
}

/** Parsea el contenido (Buffer) del CSV de facturas de Alegra */
export function parseAlegra(buffer: Buffer): AlegraParseResult {
  // Alegra exporta en Latin1 (Windows-1252)
  let text = buffer.toString("latin1");
  // La primera línea suele ser "sep=;" — eliminarla
  text = text.replace(/^sep=.*\r?\n/i, "");

  const rows: Record<string, string>[] = parse(text, {
    delimiter: ";",
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
    trim: true,
  });

  const warnings: string[] = [];
  // Deduplica por número de comprobante (columna CÓDIGO)
  const byInvoice = new Map<string, SaleInvoice>();
  const methodConflicts = new Set<string>();

  for (const row of rows) {
    // Las claves vienen con acentos Latin1; buscamos de forma flexible
    const get = (...names: string[]): string => {
      for (const key of Object.keys(row)) {
        const nk = normalize(key);
        for (const name of names) {
          if (nk === normalize(name)) return row[key] ?? "";
        }
      }
      return "";
    };

    const invoice = get("CODIGO", "CÓDIGO").trim();
    const estado = normalize(get("ESTADO"));
    if (!invoice) continue;
    // Excluir facturas anuladas
    if (estado.includes("ANULAD")) continue;

    const dateRaw = get("FECHA DE EMISION", "FECHA DE EMISIÓN");
    const date = fromDDMMYYYY(dateRaw);
    if (!date) continue;

    const bodega = get("BODEGA");
    const method = mapMethod(get("MEDIO DE PAGO"));
    const amount = parseNumber(get("TOTAL - FACTURA", "TOTAL FACTURA"));

    const existing = byInvoice.get(invoice);
    if (existing) {
      // misma factura (otra línea de ítem): validar coherencia
      if (existing.method !== method) methodConflicts.add(invoice);
      continue;
    }
    byInvoice.set(invoice, {
      invoice,
      date,
      bodega,
      storeCode: storeFromBodega(bodega),
      method,
      amount,
    });
  }

  if (methodConflicts.size > 0) {
    warnings.push(
      `${methodConflicts.size} factura(s) con múltiples medios de pago (pago dividido): ${[...methodConflicts].slice(0, 5).join(", ")}${methodConflicts.size > 5 ? "…" : ""}`,
    );
  }

  const sales = [...byInvoice.values()];
  const byMethod: Record<string, number> = {};
  let totalAmount = 0;
  for (const s of sales) {
    byMethod[s.method] = (byMethod[s.method] ?? 0) + s.amount;
    totalAmount += s.amount;
  }

  // Advertir si hay bodegas sin mapear
  const unmapped = new Set(
    sales.filter((s) => !s.storeCode).map((s) => s.bodega),
  );
  if (unmapped.size > 0) {
    warnings.push(`Bodegas sin tienda asignada: ${[...unmapped].join(", ")}`);
  }

  return {
    sales,
    totalInvoices: sales.length,
    totalAmount,
    byMethod,
    warnings,
  };
}
