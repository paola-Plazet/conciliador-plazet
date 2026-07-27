// Parser del reporte de ventas del sistema anterior (Linux): "ventaSabmyju.xlsx".
// Una fila por factura, con EFE (efectivo) y TAR (tarjeta) por separado.
// Solo se cargan las 4 tiendas que continúan, y solo desde la fecha en que
// pasaron a ser de Paola (el corte con Natural Light). Antes del corte y las
// tiendas cerradas pertenecen al cruce con NL y NO se cargan aquí.

import { readWorkbook, sheetRows, headerIndex, findCol, parseNumber, fromExcelSerial } from "./util";
import type { SaleInvoice } from "../types";
import type { AlegraParseResult } from "./alegra";

// SUC de Linux → tienda actual, con la fecha desde la que se carga cada canal.
// EFECTIVO de B1/B2/B3 se pide de TODO abril (desde 1-abr) para ver el mes
// completo; la TARJETA solo desde el corte con NL (16-abr), porque antes de esa
// fecha los datáfonos eran de Natural Light. Jardín Plaza entró el 16-may.
const SUC_TIENDA: Record<string, { store: string; desdeEfe: string; desdeTar: string }> = {
  BD: { store: "B1", desdeEfe: "2026-04-01", desdeTar: "2026-04-16" }, // Plaza de las Américas
  Q9: { store: "B2", desdeEfe: "2026-04-01", desdeTar: "2026-04-16" }, // Unioccidente
  BQ: { store: "B3", desdeEfe: "2026-04-01", desdeTar: "2026-04-16" }, // Unicentro Norte
  D0: { store: "JP", desdeEfe: "2026-05-16", desdeTar: "2026-05-16" }, // Jardín Plaza
};

/** Fecha de venta de Linux: FEC-VTA viene como "2026/-04/-01"; si falta, se usa
 * el serial de la columna FECHA. */
function fechaVenta(fecVta: unknown, fechaSerial: unknown): string | null {
  const m = String(fecVta ?? "").match(/(\d{4}).*?(\d{1,2}).*?(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return fromExcelSerial(fechaSerial);
}

export function parseLinux(buffer: Buffer): AlegraParseResult {
  const rows: unknown[][] = sheetRows(readWorkbook(buffer));
  const warnings: string[] = [];
  if (rows.length < 2)
    return { sales: [], totalInvoices: 0, totalAmount: 0, byMethod: {}, warnings: ["Archivo vacío."] };

  const idx = headerIndex(rows[0]);
  const cSuc = findCol(idx, "SUC");
  const cFac = findCol(idx, "FAC");
  const cEfe = findCol(idx, "EFE");
  const cTar = findCol(idx, "TAR");
  const cFecha = findCol(idx, "FECHA");
  const cFecVta = findCol(idx, "FEC-VTA");
  if (cSuc < 0 || cEfe < 0 || cTar < 0)
    return { sales: [], totalInvoices: 0, totalAmount: 0, byMethod: {}, warnings: ["No es el reporte de Linux esperado."] };

  const sales: SaleInvoice[] = [];
  let omitidasTar = 0; // tarjeta antes del corte (fue a NL)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row[cSuc] == null) continue;
    const suc = String(row[cSuc]).trim();
    const map = SUC_TIENDA[suc];
    if (!map) continue; // tienda cerrada / no continúa → es del cruce NL
    const date = fechaVenta(cFecVta >= 0 ? row[cFecVta] : null, cFecha >= 0 ? row[cFecha] : null);
    if (!date) continue;
    const fac = String(row[cFac] ?? i).trim();
    const efe = parseNumber(row[cEfe]);
    const tar = parseNumber(row[cTar]);
    const base = { date, bodega: `${map.store} · Linux`, storeCode: map.store };
    if (efe !== 0 && date >= map.desdeEfe)
      sales.push({ ...base, invoice: `L${fac}-EFE`, method: "EFECTIVO", amount: efe });
    if (tar !== 0) {
      if (date >= map.desdeTar) sales.push({ ...base, invoice: `L${fac}-TAR`, method: "TARJETA_DEBITO", amount: tar });
      else omitidasTar++;
    }
  }

  if (omitidasTar > 0)
    warnings.push(`Linux: ${omitidasTar} pago(s) con tarjeta antes del corte omitidos (datáfono era de NL).`);

  const byMethod: Record<string, number> = {};
  let totalAmount = 0;
  for (const s of sales) {
    byMethod[s.method] = (byMethod[s.method] ?? 0) + s.amount;
    totalAmount += s.amount;
  }
  return { sales, totalInvoices: sales.length, totalAmount, byMethod, warnings };
}
