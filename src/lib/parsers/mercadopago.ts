// Parser del reporte de liquidaciones (settlement) de Mercado Pago (XLSX).
// Una fila por operación. Nos quedamos con los pagos APROBADOS y guardamos el
// bruto (valor de la compra) y el neto (lo que efectivamente entra tras
// comisiones y retenciones). Es el "recaudo" del canal Mercadopago.

import { readWorkbook, parseNumber } from "./util";
import * as XLSX from "xlsx";

export interface MercadopagoEntry {
  date: string; // YYYY-MM-DD (fecha de origen)
  opId: string;
  medio: string;
  bruto: number;
  neto: number;
  release: string | null;
}

export interface MercadopagoParseResult {
  entries: MercadopagoEntry[];
  warnings: string[];
}

/** Formato NUEVO (jul-2026): CSV separado por ';' con encabezados en inglés
 * (TRANSACTION_DATE;SETTLEMENT_DATE;...;SOURCE_ID;PAYMENT_METHOD_TYPE;
 * TRANSACTION_TYPE;TRANSACTION_AMOUNT;FEE_AMOUNT;REAL_AMOUNT;TAXES_AMOUNT;...).
 * REAL_AMOUNT ya viene neto de comisión e impuestos. */
const MEDIO_CSV: Record<string, string> = {
  credit_card: "Tarjeta de crédito",
  debit_card: "Tarjeta de débito",
  bank_transfer: "Transferencia bancaria",
  ticket: "Cupón de pago",
  account_money: "Dinero en cuenta",
};

function parseMercadopagoCsv(text: string): MercadopagoParseResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const H = lines[0].split(";").map((h) => h.trim().toUpperCase());
  const col = (n: string) => H.indexOf(n);
  const cFecha = col("TRANSACTION_DATE");
  const cId = col("SOURCE_ID");
  const cTipoMedio = col("PAYMENT_METHOD_TYPE");
  const cTipoOp = col("TRANSACTION_TYPE");
  const cBruto = col("TRANSACTION_AMOUNT");
  const cNeto = col("REAL_AMOUNT");
  const cRelease = col("MONEY_RELEASE_DATE");

  const entries: MercadopagoEntry[] = [];
  const warnings: string[] = [];
  let omitidas = 0;
  for (const line of lines.slice(1)) {
    const p = line.split(";");
    if (!p[cFecha]) continue;
    // solo liquidaciones (SETTLEMENT); devoluciones/contracargos se omiten
    if (String(p[cTipoOp] ?? "").toUpperCase() !== "SETTLEMENT") {
      omitidas++;
      continue;
    }
    const tipoMedio = String(p[cTipoMedio] ?? "").trim();
    entries.push({
      date: String(p[cFecha]).slice(0, 10),
      opId: String(p[cId] ?? "").trim(),
      medio: MEDIO_CSV[tipoMedio] ?? tipoMedio,
      bruto: parseNumber(p[cBruto]),
      neto: parseNumber(p[cNeto]),
      release: p[cRelease] ? String(p[cRelease]).slice(0, 10) : null,
    });
  }
  if (omitidas > 0)
    warnings.push(`Mercado Pago: ${omitidas} operación(es) que no son liquidación omitida(s).`);
  return { entries, warnings };
}

export function parseMercadopago(buffer: Buffer): MercadopagoParseResult {
  // ¿es el CSV nuevo?
  const head = buffer.subarray(0, 200).toString("utf8").toUpperCase();
  if (head.includes("TRANSACTION_DATE;")) {
    return parseMercadopagoCsv(buffer.toString("utf8"));
  }

  const wb = readWorkbook(buffer);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
    header: 1,
    raw: true,
    defval: null,
  }) as unknown[][];
  const warnings: string[] = [];
  if (rows.length < 2) return { entries: [], warnings: ["Archivo vacío."] };

  const H = rows[0].map((h) => String(h ?? "").toUpperCase());
  const col = (frag: string) => H.findIndex((h) => h.includes(frag));
  const cId = col("ID DE OPERACI");
  const cMedio = col("TIPO DE MEDIO");
  const cTipo = col("TIPO DE OPERACI");
  const cBruto = col("VALOR DE LA COMPRA");
  const cFecha = col("FECHA DE ORIGEN");
  const cNeto = col("MONTO NETO");
  const cRelease = col("FECHA DE LIBERACI");

  if (cFecha < 0 || cBruto < 0) {
    return { entries: [], warnings: ["No se reconocieron las columnas del settlement de Mercado Pago."] };
  }

  const entries: MercadopagoEntry[] = [];
  let noAprobadas = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r[cFecha] == null) continue;
    const tipo = String(r[cTipo] ?? "").toUpperCase();
    // solo pagos aprobados suman recaudo; devoluciones/contracargos se omiten
    if (cTipo >= 0 && !tipo.includes("APROBADO")) {
      noAprobadas++;
      continue;
    }
    entries.push({
      date: String(r[cFecha]).slice(0, 10),
      opId: String(r[cId] ?? `${i}`),
      medio: String(r[cMedio] ?? "").trim(),
      bruto: parseNumber(r[cBruto]),
      neto: cNeto >= 0 ? parseNumber(r[cNeto]) : parseNumber(r[cBruto]),
      release: cRelease >= 0 && r[cRelease] != null ? String(r[cRelease]).slice(0, 10) : null,
    });
  }
  if (noAprobadas > 0)
    warnings.push(`Mercado Pago: ${noAprobadas} operación(es) no aprobada(s) omitida(s).`);

  return { entries, warnings };
}
