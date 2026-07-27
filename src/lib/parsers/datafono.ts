// Parser del reporte "Conciliar" del datafono (CredibanCo/Bancolombia, .xlsx).
// Cada fila es una transacción. Se mapea a tienda por CODIGO ESTABLECIMIENTO.

import { fromYYYYMMDD, parseNumber, headerIndex, findCol, readWorkbook, sheetRows } from "./util";
import { storeFromEstablishment } from "../stores";
import type { DataphoneEntry } from "../types";

export interface DatafonoParseResult {
  entries: DataphoneEntry[];
  totalGross: number;
  totalNet: number;
  warnings: string[];
}

export function parseDatafono(buffer: Buffer): DatafonoParseResult {
  const rows: unknown[][] = sheetRows(readWorkbook(buffer));

  const warnings: string[] = [];
  if (rows.length < 2) {
    return { entries: [], totalGross: 0, totalNet: 0, warnings: ["Archivo vacío."] };
  }

  const idx = headerIndex(rows[0]);
  const cEst = findCol(idx, "CODIGO ESTABLECIMIENTO", "CÓDIGO ESTABLECIMIENTO");
  const cTx = findCol(idx, "FECHA DE TRANSACCION", "FECHA DE TRANSACCIÓN");
  const cCanje = findCol(idx, "FECHA DE CANJE");
  const cFranq = findCol(idx, "FRANQUICIA");
  const cTipo = findCol(idx, "TIPO TARJETA");
  const cTotal = findCol(idx, "VALOR TOTAL");
  const cNeto = findCol(idx, "VALOR NETO");
  const cTerminal = findCol(idx, "NO TERMINAL");

  const entries: DataphoneEntry[] = [];
  let totalGross = 0;
  let totalNet = 0;
  const unmapped = new Set<string>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row[cEst] == null) continue;
    const txDate = fromYYYYMMDD(row[cTx] as string | number);
    const depositDate = fromYYYYMMDD(row[cCanje] as string | number);
    if (!txDate || !depositDate) continue;

    const establishment = String(row[cEst]).trim();
    const storeCode = storeFromEstablishment(establishment);
    if (!storeCode) unmapped.add(establishment);

    const gross = parseNumber(row[cTotal]);
    const net = parseNumber(row[cNeto]);
    totalGross += gross;
    totalNet += net;

    entries.push({
      txDate,
      depositDate,
      establishment,
      storeCode,
      franchise: String(row[cFranq] ?? "").trim(),
      cardType: String(row[cTipo] ?? "").trim(),
      gross,
      net,
      terminal: String(row[cTerminal] ?? "").trim(),
    });
  }

  if (unmapped.size > 0) {
    warnings.push(
      `Establecimientos sin tienda asignada: ${[...unmapped].join(", ")}`,
    );
  }

  return { entries, totalGross, totalNet, warnings };
}
