// Parser del reporte "allsales" NUEVO de Karrot (XLSX, hoja "Ventas"): una
// fila por PAGO de cada factura ("Nombre Método de Pago" / "Valor Método de
// Pago"). Es el formato definitivo (07-sep-2026) porque:
//  - separa las facturas con pago MIXTO (ej. 7949 del 2-sep: $100.000 por QR
//    + $50.000 en efectivo) → se emite UNA venta por (factura, método),
//  - marca las anuladas ("Cancelado" = Si) → se descartan,
//  - distingue crédito/débito ("TipoCuenta" CR/DB) y la franquicia (AMEX...).
// Tienda por "Código Almacén" (B1/B2/B3, C1 = Jardín Plaza). Las ventas web
// (NL / SHOPIFY) no tienen código: quedan sin tienda física.

import { parse as parseCsv } from "csv-parse/sync";
import { readWorkbook, sheetRows, headerIndex, findCol, parseNumber, fromExcelSerial, fromDDMMYYYY } from "./util";
import type { PaymentMethod, SaleInvoice } from "../types";
import type { AlegraParseResult } from "./alegra";

const CODIGO_TIENDA = new Map<string, string>([
  ["B1", "B1"],
  ["B2", "B2"],
  ["B3", "B3"],
  ["C1", "JP"],
  ["B4", "B6"], // Floresta isla/burbuja: Karrot la codifica B4, para Paola es B6
  ["B5", "B5"], // Floresta local (centro comercial)
  ["B6", "B6"],
]);

function metodo(nombre: string, tipoCuenta: string): PaymentMethod {
  const m = nombre.trim().toUpperCase();
  if (m === "EFECTIVO") return "EFECTIVO";
  if (m.startsWith("DATAFONO")) {
    const t = tipoCuenta.trim().toUpperCase();
    if (t === "CR" || m.includes(" CR ")) return "TARJETA_CREDITO";
    return "TARJETA_DEBITO";
  }
  if (m === "TRANSFERENCIA") return "TRANSFERENCIA"; // QR Bancolombia
  return "OTRO"; // Mercadopago / Rappi / Addi / Pago Online / Bono Regalo / Anticipo
}

/** Plataforma de los pagos OTRO (va dentro de `bodega` como "<tienda> · <plataforma>") */
function plataforma(nombre: string): string {
  const m = nombre.trim().toUpperCase();
  if (m.includes("RAPPI")) return "Rappi";
  if (m.includes("ADDI")) return "Addi";
  if (m.includes("MERCADO")) return "Mercadopago";
  if (m.includes("ONLINE")) return "Pago Online";
  if (m.includes("BONO") || m.includes("REGALO")) return "Bono Regalo";
  if (m.includes("ANTICIPO")) return "Anticipo";
  return nombre.trim() || "Otros";
}

/** Fecha en YYYY-MM-DD venga como texto ISO, dd/mm/yyyy, serial Excel o Date */
function fecha(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  if (raw instanceof Date) {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${raw.getFullYear()}-${p(raw.getMonth() + 1)}-${p(raw.getDate())}`;
  }
  if (typeof raw === "number") return fromExcelSerial(raw);
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(s)) return fromDDMMYYYY(s);
  return null;
}

/** El CONECTOR de Karrot (MCP generate-report ALL_SALES_DETAIL_PAYMENT_METHOD)
 * entrega este mismo reporte como CSV con encabezados en inglés ("Invoice #",
 * "Payment Method Value", "Date", "Hour"...). Claude lo saca directo de Karrot
 * sin que Paola baje el allsales. Se lee con csv-parse para que SheetJS no
 * convierta "2026-09-07" ni "20:52" a números. */
export function esCsvConectorKarrot(buffer: Buffer): boolean {
  const head = buffer.subarray(0, 400).toString("utf8").replace(/^\uFEFF/, "").toUpperCase();
  return head.startsWith("INVOICE #") && head.includes("PAYMENT METHOD VALUE");
}

export function parseKarrotPagos(buffer: Buffer): AlegraParseResult {
  const rows: unknown[][] = esCsvConectorKarrot(buffer)
    ? (parseCsv(buffer.toString("utf8"), { bom: true, relax_column_count: true, skip_empty_lines: true, trim: true }) as unknown[][])
    : sheetRows(readWorkbook(buffer));
  const warnings: string[] = [];
  if (rows.length < 2) {
    return { sales: [], totalInvoices: 0, totalAmount: 0, byMethod: {}, warnings: ["Archivo vacío."] };
  }

  const idx = headerIndex(rows[0]);
  // nombres del XLSX (español) y del CSV del conector (inglés)
  const cFac = findCol(idx, "# FACTURA", "INVOICE #");
  const cCod = findCol(idx, "CÓDIGO ALMACÉN", "CODIGO ALMACEN", "WAREHOUSE CODE");
  const cNom = findCol(idx, "NOMBRE ALMACÉN", "NOMBRE ALMACEN", "WAREHOUSE NAME");
  const cCancel = findCol(idx, "CANCELADO", "CANCELED");
  const cFecha = findCol(idx, "FECHA", "DATE");
  const cMet = findCol(idx, "NOMBRE MÉTODO DE PAGO", "NOMBRE METODO DE PAGO", "PAYMENT METHOD NAME");
  const cVal = findCol(idx, "VALOR MÉTODO DE PAGO", "VALOR METODO DE PAGO", "PAYMENT METHOD VALUE");
  const cTipo = findCol(idx, "TIPOCUENTA", "TIPO CUENTA");
  const cHora = findCol(idx, "HORA", "HOUR");
  const cFranq = findCol(idx, "FRANQUICIA");
  const cAuth = findCol(idx, "CODIGOAUTORIZACION", "CÓDIGO AUTORIZACIÓN", "CODIGO AUTORIZACION");
  const cAuth2 = findCol(idx, "APPROVALCODE");
  const c4 = findCol(idx, "CUATROSDIGITOS", "CUATRO DIGITOS", "ULTIMOS 4");
  if (cFac < 0 || cFecha < 0 || cMet < 0 || cVal < 0) {
    return { sales: [], totalInvoices: 0, totalAmount: 0, byMethod: {}, warnings: ["Karrot (pagos): faltan columnas (# Factura / Fecha / Nombre-Valor Método de Pago)."] };
  }

  // una venta por (almacén, factura, método): las filas del mismo método se suman
  const ventas = new Map<string, SaleInvoice>();
  const facturas = new Set<string>();
  const canceladas = new Set<string>();
  const sinMetodo = new Set<string>();
  let sinFecha = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row[cFac] == null || String(row[cFac]).trim() === "") continue;
    const fac = String(row[cFac]).trim();
    const nombre = String(cNom >= 0 ? (row[cNom] ?? "") : "").trim();
    const codigo = String(cCod >= 0 ? (row[cCod] ?? "") : "").trim();
    const keyFac = `${nombre}|${fac}`; // el número de factura se repite entre almacenes
    // "Si" en el XLSX, "Yes" en el CSV del conector
    if (cCancel >= 0 && /^[SY]/.test(String(row[cCancel] ?? "").trim().toUpperCase())) {
      canceladas.add(keyFac);
      continue;
    }
    const date = fecha(row[cFecha]);
    if (!date) { sinFecha++; continue; }
    const metRaw = String(row[cMet] ?? "").trim();
    if (!metRaw) sinMetodo.add(keyFac);
    const met = metodo(metRaw, String(cTipo >= 0 ? (row[cTipo] ?? "") : ""));
    const bodega = met === "OTRO" ? `${nombre} · ${plataforma(metRaw)}` : nombre;
    const esTarjeta = met === "TARJETA_CREDITO" || met === "TARJETA_DEBITO";
    const col = (c: number) => (c >= 0 ? String(row[c] ?? "").trim() : "");
    const autorizacion = esTarjeta ? col(cAuth) || col(cAuth2) || null : null;
    // cada transacción de tarjeta queda como su propia venta (para cruzarla una a
    // una con el datáfono); los demás métodos de una misma factura se suman
    const key = `${keyFac}|${met}|${bodega}${esTarjeta ? `|${autorizacion ?? `#${i}`}` : ""}`;
    const v = ventas.get(key) ?? {
      invoice: fac,
      date,
      bodega,
      storeCode: CODIGO_TIENDA.get(codigo) ?? null,
      method: met,
      amount: 0,
      hora: col(cHora).slice(0, 5) || null,
      franquicia: esTarjeta ? col(cFranq).toUpperCase() || null : null,
      autorizacion,
      ultimos4: esTarjeta ? col(c4).replace(/\D/g, "").slice(-4) || null : null,
    };
    v.amount += parseNumber(row[cVal]);
    ventas.set(key, v);
    facturas.add(keyFac);
  }

  const sales = [...ventas.values()].filter((s) => s.amount !== 0);
  const mixtas = sales.length - facturas.size;
  if (canceladas.size > 0) warnings.push(`Karrot: ${canceladas.size} factura(s) anulada(s) descartada(s).`);
  if (sinMetodo.size > 0) warnings.push(`Karrot: ${sinMetodo.size} factura(s) sin método de pago (quedaron como OTRO).`);
  if (sinFecha > 0) warnings.push(`Karrot: ${sinFecha} fila(s) sin fecha descartada(s).`);
  if (mixtas > 0) warnings.push(`Karrot: ${mixtas} pago(s) adicionales de facturas con pago mixto (cada método se concilia por su canal).`);

  const byMethod: Record<string, number> = {};
  let totalAmount = 0;
  for (const s of sales) {
    byMethod[s.method] = (byMethod[s.method] ?? 0) + s.amount;
    totalAmount += s.amount;
  }
  return { sales, totalInvoices: facturas.size, totalAmount, byMethod, warnings };
}
