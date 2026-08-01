// Detección automática del tipo de archivo subido, por contenido (no por nombre).

import { readWorkbook, sheetRows } from "./util";

export type FileKind =
  | "alegra"
  | "alegra_trans"
  | "karrot"
  | "karrot_ventas"
  | "banco"
  | "datafono"
  | "datafono_banco"
  | "mercadopago"
  | "linux"
  | "unknown";

export interface DetectionResult {
  kind: FileKind;
  reason: string;
}

export function detectFileType(filename: string, buffer: Buffer): DetectionResult {
  // 1) Intento como texto (CSV)
  const head = buffer.subarray(0, 4096).toString("latin1").toUpperCase();

  if (head.includes("MEDIO DE PAGO") && head.includes("TOTAL - FACTURA")) {
    return { kind: "alegra", reason: "Reporte de facturas Alegra (CSV)" };
  }
  if (/ABONO\s+NETO|PAGO\s+QR/.test(head) && /^\s*\d{3}-\d{6}-\d{2}/m.test(buffer.subarray(0, 4096).toString("latin1"))) {
    return { kind: "datafono_banco", reason: "Extracto banco datafono (CSV 191)" };
  }
  if (head.includes("TRANSACTION_DATE;") && head.includes("SETTLEMENT_DATE")) {
    return { kind: "mercadopago", reason: "Liquidaciones Mercado Pago (settlement CSV)" };
  }

  // 2) Intento como libro (xls / xlsx)
  try {
    const rows: unknown[][] = sheetRows(readWorkbook(buffer));
    const sample = rows
      .slice(0, 12)
      .map((r) => (r ?? []).map((c) => (c == null ? "" : String(c))).join("|"))
      .join("\n")
      .toUpperCase();

    if (sample.includes("CODIGO ESTABLECIMIENTO") || sample.includes("CÓDIGO ESTABLECIMIENTO")) {
      return { kind: "datafono", reason: "Reporte Conciliar de datafono (XLSX)" };
    }
    if (sample.includes("SUC") && sample.includes("NOMTAR") && sample.includes("VLRCSG")) {
      return { kind: "linux", reason: "Reporte de ventas del sistema anterior (Linux)" };
    }
    if (sample.includes("MERCADO PAGO") && sample.includes("VALOR DE LA COMPRA")) {
      return { kind: "mercadopago", reason: "Reporte de liquidaciones Mercado Pago (settlement)" };
    }
    if (
      sample.includes("# FACTURA") &&
      (sample.includes("MÉTODO DE PAGO PRINCIPAL") || sample.includes("METODO DE PAGO PRINCIPAL"))
    ) {
      return { kind: "karrot", reason: "Reporte de ventas Karrot (allsales XLSX)" };
    }
    if (sample.includes("ID ORDEN") && sample.includes("CANAL VENTA") && sample.includes("PAGO ")) {
      return { kind: "karrot_ventas", reason: "Reporte de ventas Karrot (XLSX, pagos por columna)" };
    }
    if (
      sample.includes("CUENTA") &&
      (sample.includes("MÉTODO DE PAGO") || sample.includes("METODO DE PAGO")) &&
      sample.includes("ASOCIACIONES")
    ) {
      return { kind: "alegra_trans", reason: "Reporte de transacciones Alegra (XLSX)" };
    }
    if (
      sample.includes("MOVIMIENTOS FONDOS") ||
      (sample.includes("CONCEPTO") && sample.includes("VALOR") && sample.includes("FECHA"))
    ) {
      return { kind: "banco", reason: "Extracto cuenta efectivo (XLS)" };
    }
    if (sample.includes("MEDIO DE PAGO") && sample.includes("TOTAL")) {
      return { kind: "alegra", reason: "Reporte de facturas Alegra" };
    }
  } catch {
    // no es un libro válido
  }

  return { kind: "unknown", reason: "No se pudo identificar el tipo de archivo" };
}
