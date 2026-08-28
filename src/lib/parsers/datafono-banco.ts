// Parser del extracto de la cuenta del DATAFONO (CSV "191", sin encabezados).
// Formato por línea: referencia, oficina, ?, fecha YYYYMMDD, ?, valor, código,
// concepto, 0. Interesa el detalle de "PAGO QR ..." (una línea por pago, con
// el nombre del pagador — el banco no indica la tienda) para conciliar contra
// las ventas QR del POS. Los ABONO NETO de tarjetas llegan netos de comisión,
// así que las tarjetas se concilian con el reporte Conciliar, no con esto.

import { fromYYYYMMDD, parseNumber } from "./util";
import type { QrBankEntry } from "../types";

export interface DatafonoBancoParseResult {
  qr: QrBankEntry[];
  totalQr: number;
  totalAbonosTarjeta: number; // neto (informativo)
  warnings: string[];
}

export function parseDatafonoBanco(buffer: Buffer): DatafonoBancoParseResult {
  const text = buffer.toString("latin1");
  const qr: QrBankEntry[] = [];
  let totalQr = 0;
  let totalAbonosTarjeta = 0;
  const warnings: string[] = [];

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parts = line.split(",").map((p) => p.trim());
    if (parts.length < 8) continue;
    const date = fromYYYYMMDD(parts[3]);
    if (!date) continue;
    const amount = parseNumber(parts[5]);
    const concept = parts[7] ?? "";
    const cUpper = concept.toUpperCase();

    // El canal "QR" recibe también transferencias por LLAVE (Bre-B): mismo
    // destino, distinto rótulo. Caso real 22-jul-2026: PAGO LLAVE RUBEN LOP.
    // Y transferencias/consignaciones de clientes que el POS registra como
    // "QR Bancolombia" (verificado 27-ago-2026: TRANSFERENCIA CTA SUC VIRTUAL
    // $99.800 del 20-ago, CONSIGNACION CORRESPONSAL $790.500 del 19-ago, PAGO DE
    // PROV PAVLOVE $820.353 = fac 989). Solo montos ≥ $20.000 (los chicos suelen
    // ser movimientos propios) y nunca CREDICORP (liquidación de otra plataforma).
    const esTransferenciaCliente =
      amount >= 20000 &&
      !cUpper.includes("CREDICORP") &&
      (cUpper.startsWith("TRANSFERENCIA CTA SUC VIRTUAL") ||
        cUpper.startsWith("CONSIGNACION CORRESPONSAL") ||
        cUpper.startsWith("PAGO DE PROV"));
    if (cUpper.startsWith("PAGO QR") || cUpper.startsWith("PAGO LLAVE") || esTransferenciaCliente) {
      if (amount <= 0) continue; // reversos/ajustes no suman
      qr.push({
        date,
        concept,
        amount,
        payer: concept.replace(/^PAGO (QR|LLAVE)\s*/i, "").trim(),
      });
      totalQr += amount;
    } else if (cUpper.startsWith("ABONO NETO")) {
      if (amount > 0) totalAbonosTarjeta += amount;
    }
  }

  if (qr.length === 0) {
    warnings.push("El extracto del datafono no contiene pagos QR.");
  }

  return { qr, totalQr, totalAbonosTarjeta, warnings };
}
