// Parser del extracto de la cuenta de EFECTIVO. Soporta dos formatos:
// - .xls de movimientos ("Fecha Transacción", fechas como texto ISO)
// - export de Alianza ("Fecha Tran", fechas como serial de Excel)
// Encabezados no están siempre en la primera fila; se localizan dinámicamente.

import { fromISODateTime, fromExcelSerial, parseNumber, headerIndex, findCol, readWorkbook, sheetRows } from "./util";
import type { BankCashEntry } from "../types";

const RE_RECAUDO = /RECAUDO\s+REFE:?\s*0*(\d+)\s*-\s*EFECTIVO/i;
const RE_CONSIG = /^CONSIG\.|TRANSFERENCIA|PAGO\s+POR\s+PSE/i;

export interface BancoParseResult {
  entries: BankCashEntry[];
  totalIngresos: number;
  totalRecaudoEfectivo: number;
  references: { reference: string; count: number; total: number }[];
  warnings: string[];
}

/**
 * @param buffer contenido del .xls
 * @param refMap mapa referencia -> código de tienda (opcional)
 */
export function parseBanco(
  buffer: Buffer,
  refMap?: Map<string, string>,
): BancoParseResult {
  const rows: unknown[][] = sheetRows(readWorkbook(buffer));

  // Localizar la fila de encabezado (contiene "Concepto" y "Valor")
  let headerRow = -1;
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const joined = (rows[i] ?? [])
      .map((c) => (c == null ? "" : String(c).toUpperCase()))
      .join("|");
    if (joined.includes("CONCEPTO") && joined.includes("VALOR")) {
      headerRow = i;
      break;
    }
  }
  const warnings: string[] = [];
  if (headerRow === -1) {
    return {
      entries: [],
      totalIngresos: 0,
      totalRecaudoEfectivo: 0,
      references: [],
      warnings: ["No se encontró la fila de encabezados en el extracto."],
    };
  }

  const idx = headerIndex(rows[headerRow]);
  const cFecha = findCol(idx, "FECHA TRANSACCIÓN", "FECHA TRANSACCION", "FECHA TRAN", "FECHA");
  const cConcepto = findCol(idx, "CONCEPTO");
  const cValor = findCol(idx, "VALOR");

  const entries: BankCashEntry[] = [];
  const refAgg = new Map<string, { count: number; total: number }>();
  let totalIngresos = 0;
  let totalRecaudoEfectivo = 0;

  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const concept = cConcepto >= 0 ? row[cConcepto] : null;
    const valorRaw = cValor >= 0 ? row[cValor] : null;
    if (concept == null || valorRaw == null) continue;
    const rawDate = cFecha >= 0 ? row[cFecha] : null;
    const date =
      typeof rawDate === "number"
        ? fromExcelSerial(rawDate)
        : fromISODateTime(String(rawDate ?? ""));
    if (!date) continue;

    const amount = parseNumber(valorRaw);
    const conceptStr = String(concept);

    let kind: BankCashEntry["kind"] = "OTRO";
    let reference: string | null = null;

    const mRec = conceptStr.match(RE_RECAUDO);
    if (mRec) {
      kind = "RECAUDO_EFECTIVO";
      reference = mRec[1];
    } else if (RE_CONSIG.test(conceptStr)) {
      kind = "CONSIG_TRANSFER";
    }

    if (amount > 0) totalIngresos += amount;
    if (kind === "RECAUDO_EFECTIVO") {
      totalRecaudoEfectivo += amount;
      const agg = refAgg.get(reference!) ?? { count: 0, total: 0 };
      agg.count++;
      agg.total += amount;
      refAgg.set(reference!, agg);
    }

    entries.push({
      date,
      concept: conceptStr,
      amount,
      reference,
      storeCode: reference ? (refMap?.get(reference) ?? null) : null,
      kind,
    });
  }

  const references = [...refAgg.entries()]
    .map(([reference, d]) => ({ reference, count: d.count, total: d.total }))
    .sort((a, b) => b.total - a.total);

  return {
    entries,
    totalIngresos,
    totalRecaudoEfectivo,
    references,
    warnings,
  };
}
