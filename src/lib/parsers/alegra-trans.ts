// Parser del reporte "Transacciones" de Alegra (XLSX, una fila por pago).
// A diferencia del reporte de Facturas, aquí NO hay columna BODEGA: la tienda
// se resuelve por la cuenta contable ("Efectivo POS - PLAZET UNICENTRO") y,
// para tarjetas/QR, por el prefijo del número de factura en Asociaciones
// (B1/B2/B3/C1; P#### = página web).

import {
  readWorkbook,
  sheetRows,
  headerIndex,
  findCol,
  parseNumber,
  fromExcelSerial,
  fromDDMMYYYY,
} from "./util";
import { storeFromCuenta, storeFromInvoicePrefix, normalize } from "../stores";
import type { PaymentMethod, SaleInvoice } from "../types";
import type { AlegraParseResult } from "./alegra";

/** Clasifica el medio de pago combinando la cuenta contable y la columna
 * "Método de pago". La cuenta manda: así los QR quedan separados de otras
 * transferencias (Rappi/Addi/Mercadopago -> OTRO). */
function classify(cuenta: string, metodo: string): PaymentMethod {
  const c = normalize(cuenta);
  if (c.startsWith("EFECTIVO POS")) return "EFECTIVO";
  if (c.includes("QR")) return "TRANSFERENCIA";
  const m = normalize(metodo);
  if (m.includes("CREDITO")) return "TARJETA_CREDITO";
  if (m.includes("DEBITO")) return "TARJETA_DEBITO";
  return "OTRO";
}

function parseDate(raw: unknown): string | null {
  if (typeof raw === "number") return fromExcelSerial(raw);
  return fromDDMMYYYY(String(raw ?? ""));
}

/** Parsea el contenido (Buffer) del reporte de transacciones de Alegra */
export function parseAlegraTrans(buffer: Buffer): AlegraParseResult {
  const rows: unknown[][] = sheetRows(readWorkbook(buffer));
  const warnings: string[] = [];

  // Localizar encabezado (contiene "Cuenta" y "Método de pago")
  let headerRow = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const joined = (rows[i] ?? [])
      .map((c) => normalize(String(c ?? "")))
      .join("|");
    if (joined.includes("CUENTA") && joined.includes("METODO DE PAGO")) {
      headerRow = i;
      break;
    }
  }
  if (headerRow === -1) {
    return {
      sales: [],
      totalInvoices: 0,
      totalAmount: 0,
      byMethod: {},
      warnings: ["No se encontró la fila de encabezados en el reporte de transacciones."],
    };
  }

  const idx = headerIndex(rows[headerRow]);
  const cCuenta = findCol(idx, "CUENTA");
  const cFecha = findCol(idx, "FECHA");
  const cNumero = findCol(idx, "NÚMERO", "NUMERO");
  const cValor = findCol(idx, "VALOR");
  const cAsoc = findCol(idx, "ASOCIACIONES");
  const cTipo = findCol(idx, "TIPO");
  const cEstado = findCol(idx, "ESTADO");
  const cMetodo = findCol(idx, "MÉTODO DE PAGO", "METODO DE PAGO");

  const sales: SaleInvoice[] = [];
  let skippedAnuladas = 0;
  let skippedNoIngreso = 0;

  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const cuenta = String(row[cCuenta] ?? "").trim();
    if (!cuenta) continue;

    const estado = normalize(String(cEstado >= 0 ? (row[cEstado] ?? "") : ""));
    if (estado.includes("ANULAD")) {
      skippedAnuladas++;
      continue;
    }
    const tipo = normalize(String(cTipo >= 0 ? (row[cTipo] ?? "") : "INGRESO"));
    if (tipo && !tipo.includes("INGRESO")) {
      skippedNoIngreso++;
      continue;
    }

    const date = parseDate(row[cFecha]);
    if (!date) continue;

    const amount = parseNumber(row[cValor]);
    const metodo = String(cMetodo >= 0 ? (row[cMetodo] ?? "") : "");
    const method = classify(cuenta, metodo);

    // Factura asociada: "Facturas: B33048" -> B33048 (da la tienda por prefijo)
    const asoc = String(cAsoc >= 0 ? (row[cAsoc] ?? "") : "");
    const mFact = asoc.match(/Facturas:\s*([A-Z]+\d+)/i);
    const factura = mFact ? mFact[1].toUpperCase() : "";

    // Tienda: la cuenta de efectivo la trae explícita; si no, el prefijo
    const storeCode =
      storeFromCuenta(cuenta) ??
      (factura ? storeFromInvoicePrefix(factura) : null);

    sales.push({
      invoice: String(row[cNumero] ?? factura ?? "").trim(),
      date,
      bodega: cuenta, // texto crudo de la cuenta (se muestra como origen)
      storeCode,
      method,
      amount,
    });
  }

  if (skippedAnuladas > 0)
    warnings.push(`${skippedAnuladas} transacción(es) anulada(s) excluida(s).`);
  if (skippedNoIngreso > 0)
    warnings.push(`${skippedNoIngreso} movimiento(s) que no son ingresos, excluidos.`);

  const byMethod: Record<string, number> = {};
  let totalAmount = 0;
  for (const s of sales) {
    byMethod[s.method] = (byMethod[s.method] ?? 0) + s.amount;
    totalAmount += s.amount;
  }

  // Cuentas de efectivo sin tienda reconocida (no debería pasar)
  const unmapped = new Set(
    sales
      .filter((s) => s.method === "EFECTIVO" && !s.storeCode)
      .map((s) => s.bodega),
  );
  if (unmapped.size > 0) {
    warnings.push(`Cuentas de efectivo sin tienda asignada: ${[...unmapped].join(", ")}`);
  }

  return {
    sales,
    totalInvoices: sales.length,
    totalAmount,
    byMethod,
    warnings,
  };
}
