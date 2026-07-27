// Parser del reporte "reporte_ventas" de Karrot (XLSX, hoja "Ventas"):
// una fila por venta, con el pago DESGLOSADO en columnas "Pago <método>".
//
// Es el formato preferido frente al allsales porque:
//  - separa correctamente las ventas con pago MIXTO (efectivo + datáfono),
//  - marca las ventas anuladas (columna "Cancelado"),
//  - las columnas de pago aparecen según los métodos realmente usados
//    (Efectivo, Datafono, Transferencia, Mercadopago, Rappi, Addi, Bono...),
//    por eso se leen dinámicamente.
//
// Tienda por la columna "Ubicación" (texto). "nl" y "tienda shopify" son
// ventas web: quedan sin tienda física y se excluyen de la conciliación de
// tiendas.

import { readWorkbook, parseNumber } from "./util";
import { normalize } from "../stores";
import type { PaymentMethod, SaleInvoice } from "../types";
import type { AlegraParseResult } from "./alegra";
import * as XLSX from "xlsx";

/** Ubicación de Karrot -> código de tienda (null = venta web) */
const UBICACION_TIENDA = new Map<string, string | null>([
  ["PLAZA DE LAS AMERICAS", "B1"],
  ["UNICENTRO DE OCCIDENTE", "B2"],
  ["UNIOCCIDENTE", "B2"],
  ["UNICENTRO NORTE", "B3"],
  ["JARDIN PLAZA", "JP"],
  ["NL", null],
  ["TIENDA SHOPIFY", null],
]);

/** Según cómo se exporte, Karrot entrega los textos con los acentos rotos
 * (UTF-8 leído como latin1: "UbicaciÃ³n", "jardÃ­n plaza"). Se repara. */
function arregla(texto: string): string {
  if (!/[ÃÂ]/.test(texto)) return texto;
  const reparado = Buffer.from(texto, "latin1").toString("utf8");
  return reparado.includes("�") ? texto : reparado;
}

/** Encabezado comparable: sin acentos ni caracteres no ASCII */
function limpiaEncabezado(h: unknown): string {
  return normalize(arregla(String(h ?? "")))
    .replace(/[^A-Z0-9 #]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function metodoDePago(etiqueta: string): PaymentMethod {
  const m = etiqueta.toUpperCase();
  if (m.includes("EFECTIVO")) return "EFECTIVO";
  if (m.includes("DATAFONO")) return "TARJETA_DEBITO"; // Karrot no separa crédito/débito
  if (m.includes("TRANSFERENCIA")) return "TRANSFERENCIA"; // QR Bancolombia
  return "OTRO"; // Mercadopago / Rappi / Addi / Pago Online / Bono Regalo
}

/** Nombre bonito de la plataforma para los pagos OTRO (va dentro de `bodega`
 * como "<ubicación> · <plataforma>" para poder desglosarlo en el tablero). */
function plataforma(etiqueta: string): string {
  const m = etiqueta.toUpperCase();
  if (m.includes("RAPPI")) return "Rappi";
  if (m.includes("ADDI")) return "Addi";
  if (m.includes("MERCADO")) return "Mercadopago";
  if (m.includes("ONLINE")) return "Pago Online";
  if (m.includes("BONO") || m.includes("REGALO")) return "Bono Regalo";
  return etiqueta.trim() || "Otros";
}

export function parseKarrotVentas(buffer: Buffer): AlegraParseResult {
  const wb = readWorkbook(buffer);
  const hoja = wb.SheetNames.find((n) => limpiaEncabezado(n) === "VENTAS") ?? wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[hoja], {
    header: 1,
    raw: true,
    defval: null,
  }) as unknown[][];
  const warnings: string[] = [];
  if (rows.length < 2) {
    return { sales: [], totalInvoices: 0, totalAmount: 0, byMethod: {}, warnings: ["Archivo vacío."] };
  }

  const head = rows[0].map(limpiaEncabezado);
  const col = (...nombres: string[]) => {
    for (const n of nombres) {
      const i = head.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };
  const cRecibo = col("NUMERO RECIBO", "ID ORDEN");
  const cUbi = col("UBICACION");
  const cFecha = col("FECHA");
  const cTotal = col("TOTAL");
  const cCanc = col("CANCELADO");
  // columnas de pago: todas las que empiezan por "PAGO "
  const colsPago = head
    .map((h, i) => ({ etiqueta: h.replace(/^PAGO /, ""), i }))
    .filter((c) => head[c.i].startsWith("PAGO "));

  if (cUbi < 0 || cFecha < 0 || colsPago.length === 0) {
    return {
      sales: [],
      totalInvoices: 0,
      totalAmount: 0,
      byMethod: {},
      warnings: ["No se reconocieron las columnas del reporte de ventas de Karrot."],
    };
  }

  const sales: SaleInvoice[] = [];
  const ubicacionesDesconocidas = new Set<string>();
  let anuladas = 0;
  let sinPago = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row[cFecha] == null) continue;
    if (row[cCanc] === true || String(row[cCanc]).toUpperCase() === "TRUE") {
      anuladas++;
      continue;
    }

    const date = String(row[cFecha]).trim().slice(0, 10);
    const ubicacion = arregla(String(row[cUbi] ?? "")).trim();
    const clave = normalize(ubicacion);
    const storeCode = UBICACION_TIENDA.has(clave) ? (UBICACION_TIENDA.get(clave) ?? null) : null;
    if (!UBICACION_TIENDA.has(clave) && ubicacion) ubicacionesDesconocidas.add(ubicacion);
    const recibo = String(row[cRecibo] ?? i).trim();

    // una venta puede pagarse con varios métodos: se emite una fila por método
    let pagado = 0;
    for (const c of colsPago) {
      const monto = parseNumber(row[c.i]);
      if (!monto) continue;
      pagado += monto;
      const method = metodoDePago(c.etiqueta);
      sales.push({
        invoice: colsPago.length > 1 ? `${recibo}-${c.etiqueta.slice(0, 4)}` : recibo,
        date,
        bodega: method === "OTRO" ? `${ubicacion} · ${plataforma(c.etiqueta)}` : ubicacion,
        storeCode,
        method,
        amount: monto,
      });
    }
    if (pagado === 0 && parseNumber(row[cTotal]) > 0) sinPago++;
  }

  if (anuladas > 0) warnings.push(`Karrot: ${anuladas} venta(s) anulada(s) excluida(s).`);
  if (sinPago > 0)
    warnings.push(`Karrot: ${sinPago} venta(s) con total pero sin método de pago registrado.`);
  if (ubicacionesDesconocidas.size > 0)
    warnings.push(
      `Karrot: ubicación sin tienda asignada: ${[...ubicacionesDesconocidas].join(", ")}.`,
    );

  const byMethod: Record<string, number> = {};
  let totalAmount = 0;
  for (const s of sales) {
    byMethod[s.method] = (byMethod[s.method] ?? 0) + s.amount;
    totalAmount += s.amount;
  }
  return { sales, totalInvoices: sales.length, totalAmount, byMethod, warnings };
}
