// Utilidades compartidas de parseo

import * as XLSX from "xlsx";

/** Lee un libro xls/xlsx silenciando los avisos no fatales de SheetJS
 * (p.ej. "Bad uncompressed size") que ensucian la consola pero no afectan
 * los datos. */
export function readWorkbook(buffer: Buffer): XLSX.WorkBook {
  const origError = console.error;
  const origWarn = console.warn;
  console.error = () => {};
  console.warn = () => {};
  try {
    return XLSX.read(buffer, { type: "buffer" });
  } finally {
    console.error = origError;
    console.warn = origWarn;
  }
}

/** Devuelve las filas de la primera hoja como matriz (header:1) */
export function sheetRows(wb: XLSX.WorkBook): unknown[][] {
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
}

/** Convierte un número en formato Alegra/banco a float.
 * Maneja coma decimal y punto de miles ("1.234.567,89" o "16850" o "12300,29").
 */
export function parseNumber(raw: unknown): number {
  if (typeof raw === "number") return raw;
  if (raw == null) return 0;
  let s = String(raw).trim();
  if (!s) return 0;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    // punto = miles, coma = decimal
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    // solo coma = decimal
    s = s.replace(",", ".");
  }
  // solo punto: se asume decimal (los exports numéricos no usan miles con punto)
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/** Convierte fecha dd/mm/yyyy a YYYY-MM-DD */
export function fromDDMMYYYY(raw: string): string | null {
  const m = String(raw).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/** Convierte fecha "YYYY-MM-DD 00:00:00.0" o "YYYY-MM-DD" a YYYY-MM-DD */
export function fromISODateTime(raw: string): string | null {
  const m = String(raw).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** Convierte un serial de fecha de Excel (días desde 1899-12-30) a YYYY-MM-DD */
export function fromExcelSerial(raw: unknown): string | null {
  const n = typeof raw === "number" ? raw : parseFloat(String(raw));
  if (!Number.isFinite(n) || n < 1) return null;
  // 25569 = serial de 1970-01-01
  const d = new Date(Math.round((n - 25569) * 86400000));
  return d.toISOString().slice(0, 10);
}

/** Convierte fecha compacta YYYYMMDD a YYYY-MM-DD */
export function fromYYYYMMDD(raw: string | number): string | null {
  const s = String(raw).trim();
  const m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** Construye un índice nombre-de-columna -> índice a partir de la fila de encabezado */
export function headerIndex(header: unknown[]): Map<string, number> {
  const idx = new Map<string, number>();
  header.forEach((h, i) => {
    if (h != null) idx.set(String(h).trim().toUpperCase(), i);
  });
  return idx;
}

/** Busca el índice de una columna por varios nombres posibles */
export function findCol(idx: Map<string, number>, ...names: string[]): number {
  for (const n of names) {
    const v = idx.get(n.toUpperCase());
    if (v != null) return v;
  }
  return -1;
}
