// Orquestación: parsea los archivos subidos, carga configuración (mapeo de
// referencias + festivos) y ejecuta el motor de conciliación.

import { prisma } from "./db";
import { parseAlegra } from "./parsers/alegra";
import { parseAlegraTrans } from "./parsers/alegra-trans";
import { parseBanco } from "./parsers/banco";
import { parseDatafono } from "./parsers/datafono";
import { parseDatafonoBanco } from "./parsers/datafono-banco";
import { conciliar } from "./engine";
import type {
  SaleInvoice,
  BankCashEntry,
  DataphoneEntry,
  QrBankEntry,
  ManualAdjustment,
} from "./types";

export interface ProcessInput {
  alegra?: Buffer; // reporte de Facturas (CSV)
  alegraTrans?: Buffer; // reporte de Transacciones (XLSX)
  banco?: Buffer;
  datafono?: Buffer;
  datafonoBanco?: Buffer; // extracto CSV 191 (pagos QR)
  adjustments?: ManualAdjustment[];
}

export interface ProcessOutput {
  sales: SaleInvoice[];
  bank: BankCashEntry[];
  datafono: DataphoneEntry[];
  qrBank: QrBankEntry[];
  references: { reference: string; count: number; total: number; storeCode: string | null }[];
  summary: ReturnType<typeof conciliar>;
  warnings: string[];
  periodStart?: string;
  periodEnd?: string;
}

/** Carga el mapa referencia -> código de tienda desde la BD */
export async function loadRefMap(): Promise<Map<string, string>> {
  const refs = await prisma.cashReference.findMany({
    include: { store: true },
  });
  return new Map(refs.map((r) => [r.reference, r.store.code]));
}

/** Carga las fechas de festivos desde la BD */
export async function loadHolidays(): Promise<string[]> {
  const hs = await prisma.holiday.findMany({ select: { date: true } });
  return hs.map((h) => h.date);
}

/** Re-mapea el código de tienda de los movimientos de banco según un refMap */
export function remapBankStores(
  bank: BankCashEntry[],
  refMap: Map<string, string>,
): BankCashEntry[] {
  return bank.map((b) => ({
    ...b,
    storeCode: b.reference ? (refMap.get(b.reference) ?? null) : b.storeCode,
  }));
}

/** Recalcula la conciliación a partir de arreglos ya parseados (sin re-subir).
 * Reaplica el mapeo de referencias y los festivos actuales. */
export async function recompute(
  sales: SaleInvoice[],
  bank: BankCashEntry[],
  datafono: DataphoneEntry[],
  qrBank: QrBankEntry[],
  adjustments: ManualAdjustment[],
) {
  const refMap = await loadRefMap();
  const holidays = await loadHolidays();
  const remappedBank = remapBankStores(bank, refMap);
  return conciliar({
    sales,
    bank: remappedBank,
    datafono,
    qrBank,
    holidays,
    adjustments,
  });
}

export async function processFiles(input: ProcessInput): Promise<ProcessOutput> {
  const warnings: string[] = [];
  const refMap = await loadRefMap();
  const holidays = await loadHolidays();

  // Ventas: reporte de Transacciones (preferido) o reporte de Facturas
  const sales = input.alegraTrans
    ? parseAlegraTrans(input.alegraTrans)
    : input.alegra
      ? parseAlegra(input.alegra)
      : null;
  const banco = input.banco ? parseBanco(input.banco, refMap) : null;
  const data = input.datafono ? parseDatafono(input.datafono) : null;
  const dataBanco = input.datafonoBanco
    ? parseDatafonoBanco(input.datafonoBanco)
    : null;

  if (sales) warnings.push(...sales.warnings);
  if (banco) warnings.push(...banco.warnings);
  if (data) warnings.push(...data.warnings);
  if (dataBanco) warnings.push(...dataBanco.warnings);

  const salesArr = sales?.sales ?? [];
  const bankArr = banco?.entries ?? [];
  const dataArr = data?.entries ?? [];
  const qrArr = dataBanco?.qr ?? [];

  const summary = conciliar({
    sales: salesArr,
    bank: bankArr,
    datafono: dataArr,
    qrBank: qrArr,
    holidays,
    adjustments: input.adjustments ?? [],
  });

  // referencias del banco con su tienda asignada (para la UI de configuración)
  const references = (banco?.references ?? []).map((r) => ({
    ...r,
    storeCode: refMap.get(r.reference) ?? null,
  }));

  // periodo: rango global de fechas de ventas
  const allDates = salesArr.map((s) => s.date).sort();
  const periodStart = allDates[0];
  const periodEnd = allDates[allDates.length - 1];

  return {
    sales: salesArr,
    bank: bankArr,
    datafono: dataArr,
    qrBank: qrArr,
    references,
    summary,
    warnings,
    periodStart,
    periodEnd,
  };
}
