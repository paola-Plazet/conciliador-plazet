// Parser del reporte "allsales" de Karrot (XLSX, hoja "Ventas detalle por
// artículo"): una fila por artículo vendido. Se agrupa por factura para emitir
// una venta por factura con su método de pago principal.
// Tienda por "Código Almacén" (B1/B2/B3, C1 = Jardín Plaza). Las tiendas
// online (NL, Tienda Shopify) no tienen código: quedan sin tienda física y se
// excluyen de la conciliación de tiendas (se listan aparte en la bodega).

import { readWorkbook, sheetRows, headerIndex, findCol, parseNumber } from "./util";
import type { PaymentMethod, SaleInvoice } from "../types";
import type { AlegraParseResult } from "./alegra";

/** Desde esta fecha las ventas se toman de Karrot; las de Alegra se ignoran. */
export const KARROT_CUTOVER = "2026-07-08";

const CODIGO_TIENDA = new Map<string, string>([
  ["B1", "B1"],
  ["B2", "B2"],
  ["B3", "B3"],
  ["C1", "JP"],
]);

function metodo(met: string): PaymentMethod {
  const m = met.trim().toUpperCase();
  if (m === "EFECTIVO") return "EFECTIVO";
  if (m === "DATAFONO") return "TARJETA_DEBITO"; // Karrot no separa crédito/débito
  if (m === "TRANSFERENCIA") return "TRANSFERENCIA"; // QR Bancolombia
  return "OTRO"; // Mercadopago / Pago Online / Bono Regalo / vacío
}

/** Etiqueta de plataforma para los pagos OTRO (Mercadopago / Rappi / Addi /
 * Pago Online / Bono), para poder desglosarlos en el tablero. Se guarda dentro
 * de `bodega` como "<tienda> · <plataforma>" cuando el método no es estándar. */
function plataforma(met: string): string {
  const m = met.trim().toUpperCase();
  if (m.includes("RAPPI")) return "Rappi";
  if (m.includes("ADDI")) return "Addi";
  if (m.includes("MERCADO")) return "Mercadopago";
  if (m.includes("ONLINE")) return "Pago Online";
  if (m.includes("BONO") || m.includes("REGALO")) return "Bono Regalo";
  return met.trim() || "Otros";
}

export function parseKarrot(buffer: Buffer): AlegraParseResult {
  const rows: unknown[][] = sheetRows(readWorkbook(buffer));
  const warnings: string[] = [];
  if (rows.length < 2) {
    return { sales: [], totalInvoices: 0, totalAmount: 0, byMethod: {}, warnings: ["Archivo vacío."] };
  }

  const idx = headerIndex(rows[0]);
  const cFac = findCol(idx, "# FACTURA");
  const cCod = findCol(idx, "CÓDIGO ALMACÉN", "CODIGO ALMACEN");
  const cNom = findCol(idx, "NOMBRE ALMACÉN", "NOMBRE ALMACEN");
  const cMet = findCol(idx, "MÉTODO DE PAGO PRINCIPAL", "METODO DE PAGO PRINCIPAL");
  const cFecha = findCol(idx, "FECHA");
  const cVenta = findCol(idx, "VENTA");

  // agrupar por factura (una factura puede tener muchas filas de artículo)
  const facturas = new Map<
    string,
    { date: string; bodega: string; storeCode: string | null; method: PaymentMethod; amount: number }
  >();
  const sinMetodo = new Set<string>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row[cFac] == null || row[cFecha] == null) continue;
    const fac = String(row[cFac]).trim();
    const nombre = String(cNom >= 0 ? (row[cNom] ?? "") : "").trim();
    const codigo = String(cCod >= 0 ? (row[cCod] ?? "") : "").trim();
    const key = `${nombre}|${fac}`; // el número de factura se repite entre almacenes
    const metRaw = String(row[cMet] ?? "");
    const met = metodo(metRaw);
    const f =
      facturas.get(key) ??
      {
        date: String(row[cFecha]).trim().slice(0, 10),
        // para OTRO guardamos la plataforma en bodega ("tienda · Mercadopago")
        bodega: met === "OTRO" ? `${nombre} · ${plataforma(metRaw)}` : nombre,
        storeCode: CODIGO_TIENDA.get(codigo) ?? null,
        method: met,
        amount: 0,
      };
    if (!String(row[cMet] ?? "").trim()) sinMetodo.add(key);
    f.amount += parseNumber(row[cVenta]);
    facturas.set(key, f);
  }

  const sales: SaleInvoice[] = [...facturas.entries()].map(([key, f]) => ({
    invoice: key.split("|")[1],
    date: f.date,
    bodega: f.bodega,
    storeCode: f.storeCode,
    method: f.method,
    amount: f.amount,
  }));

  if (sinMetodo.size > 0)
    warnings.push(`Karrot: ${sinMetodo.size} factura(s) sin método de pago (quedaron como OTRO).`);

  const byMethod: Record<string, number> = {};
  let totalAmount = 0;
  for (const s of sales) {
    byMethod[s.method] = (byMethod[s.method] ?? 0) + s.amount;
    totalAmount += s.amount;
  }
  return { sales, totalInvoices: sales.length, totalAmount, byMethod, warnings };
}
