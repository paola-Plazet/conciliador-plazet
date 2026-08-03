// Libro acumulado: los archivos cargados alimentan tablas normalizadas y la
// conciliación se calcula sobre TODO el histórico, dividida por mes.
//
// Reglas:
// - Cada carga REEMPLAZA su rango de fechas (el archivo es la fuente de verdad
//   del periodo que cubre). Así se puede re-subir sin duplicar.
// - Las fechas que caen en un MES CERRADO se omiten (con aviso): un mes
//   cerrado no cambia salvo que se reabra.

import { prisma } from "./db";
import { parseAlegra } from "./parsers/alegra";
import { parseAlegraTrans } from "./parsers/alegra-trans";
import { parseBanco } from "./parsers/banco";
import { parseDatafono } from "./parsers/datafono";
import { parseDatafonoBanco } from "./parsers/datafono-banco";
import { parseMercadopago } from "./parsers/mercadopago";
import { parseLinux } from "./parsers/linux";
import { parseKarrot, KARROT_CUTOVER } from "./parsers/karrot";
import { parseKarrotVentas } from "./parsers/karrot-ventas";
import { detectFileType, type FileKind } from "./parsers/detect";
import { conciliar, type ConciliationSummary } from "./engine";
import { loadRefMap, loadHolidays } from "./process";
import type {
  SaleInvoice,
  BankCashEntry,
  DataphoneEntry,
  QrBankEntry,
  ManualAdjustment,
} from "./types";

/** Meses cerrados como Set("YYYY-MM") */
export async function loadClosedMonths(): Promise<Set<string>> {
  const ms = await prisma.monthStatus.findMany({ where: { closed: true } });
  return new Set(ms.map((m) => m.month));
}

function monthOfDate(date: string): string {
  return date.slice(0, 7);
}

/** Divide filas en permitidas / omitidas según meses cerrados */
function splitClosed<T>(
  rows: T[],
  dateOf: (r: T) => string,
  closed: Set<string>,
): { ok: T[]; skipped: number } {
  if (closed.size === 0) return { ok: rows, skipped: 0 };
  const ok: T[] = [];
  let skipped = 0;
  for (const r of rows) {
    if (closed.has(monthOfDate(dateOf(r)))) skipped++;
    else ok.push(r);
  }
  return { ok, skipped };
}

/** Borra el rango [from,to] de una tabla (solo meses abiertos) e inserta */
async function replaceRange<T>(opts: {
  rows: T[];
  dateOf: (r: T) => string;
  closed: Set<string>;
  deleteRange: (from: string, to: string, openMonths: string[]) => Promise<void>;
  insert: (rows: T[]) => Promise<void>;
}): Promise<{ from: string | null; to: string | null; inserted: number; skipped: number }> {
  const { ok, skipped } = splitClosed(opts.rows, opts.dateOf, opts.closed);
  if (ok.length === 0) return { from: null, to: null, inserted: 0, skipped };
  const dates = ok.map(opts.dateOf).sort();
  const from = dates[0];
  const to = dates[dates.length - 1];
  // meses abiertos dentro del rango (para no borrar meses cerrados)
  const months = new Set<string>();
  for (const d of dates) months.add(monthOfDate(d));
  const openMonths = [...months].filter((m) => !opts.closed.has(m));
  await opts.deleteRange(from, to, openMonths);
  await opts.insert(ok);
  return { from, to, inserted: ok.length, skipped };
}

export interface IngestFileResult {
  filename: string;
  kind: FileKind | "historico";
  inserted: number;
  skipped: number;
  from: string | null;
  to: string | null;
}

export interface IngestOutput {
  files: IngestFileResult[];
  warnings: string[];
}

/** Ingesta ventas ya parseadas (Alegra o histórico) */
export async function ingestSales(
  sales: SaleInvoice[],
  source: string,
  closed: Set<string>,
): Promise<{ from: string | null; to: string | null; inserted: number; skipped: number }> {
  return replaceRange({
    rows: sales,
    dateOf: (s) => s.date,
    closed,
    deleteRange: (from, to, openMonths) =>
      prisma.sale
        .deleteMany({
          where: {
            date: { gte: from, lte: to },
            source,
            OR: openMonths.map((m) => ({ date: { startsWith: m } })),
          },
        })
        .then(() => {}),
    insert: (rows) =>
      prisma.sale
        .createMany({
          data: rows.map((s) => ({
            date: s.date,
            invoice: s.invoice,
            bodega: s.bodega,
            storeCode: s.storeCode,
            method: s.method,
            amount: s.amount,
            source,
          })),
        })
        .then(() => {}),
  });
}

/** Procesa y guarda un archivo detectado; devuelve el resumen de la ingesta */
export async function ingestFiles(
  files: { filename: string; buffer: Buffer }[],
): Promise<IngestOutput> {
  const closed = await loadClosedMonths();
  const out: IngestFileResult[] = [];
  const warnings: string[] = [];

  for (const f of files) {
    const { kind } = detectFileType(f.filename, f.buffer);
    let res = { from: null as string | null, to: null as string | null, inserted: 0, skipped: 0 };

    const esKarrot = kind === "karrot" || kind === "karrot_ventas";
    if (kind === "alegra" || kind === "alegra_trans" || esKarrot) {
      const parsed =
        kind === "karrot_ventas"
          ? parseKarrotVentas(f.buffer)
          : kind === "karrot"
            ? parseKarrot(f.buffer)
            : kind === "alegra_trans"
              ? parseAlegraTrans(f.buffer)
              : parseAlegra(f.buffer);
      warnings.push(...parsed.warnings);
      // Desde el corte a Karrot (8-jul-2026) la fuente de ventas es Karrot:
      // las filas de Alegra de esas fechas se descartan para no duplicar.
      let rows = parsed.sales;
      const before = rows.length;
      rows = esKarrot
        ? rows.filter((s) => s.date >= KARROT_CUTOVER)
        : rows.filter((s) => s.date < KARROT_CUTOVER);
      if (rows.length < before)
        warnings.push(
          esKarrot
            ? `"${f.filename}": ${before - rows.length} venta(s) de Karrot anteriores al ${KARROT_CUTOVER} descartada(s) (hasta esa fecha la fuente es Alegra).`
            : `"${f.filename}": ${before - rows.length} venta(s) de Alegra desde el ${KARROT_CUTOVER} descartada(s) (desde esa fecha la fuente es Karrot).`,
        );
      res = await replaceRange({
        rows,
        dateOf: (s) => s.date,
        closed,
        // OJO: no borrar las ventas de Linux (source "linux"). Alegra/Karrot y
        // Linux son fuentes complementarias en el borde de la transición de
        // sistema; el corte por tienda en el parser de Linux evita duplicados.
        deleteRange: (from, to, openMonths) =>
          prisma.sale
            .deleteMany({
              where: {
                date: { gte: from, lte: to },
                source: { not: "linux" },
                OR: openMonths.map((m) => ({ date: { startsWith: m } })),
              },
            })
            .then(() => {}),
        insert: (rows) =>
          prisma.sale
            .createMany({
              data: rows.map((s) => ({
                date: s.date,
                invoice: s.invoice,
                bodega: s.bodega,
                storeCode: s.storeCode,
                method: s.method,
                amount: s.amount,
                source: esKarrot ? "karrot" : "alegra",
              })),
            })
            .then(() => {}),
      });
    } else if (kind === "banco") {
      const refMap = await loadRefMap();
      const parsed = parseBanco(f.buffer, refMap);
      warnings.push(...parsed.warnings);
      res = await replaceRange({
        rows: parsed.entries,
        dateOf: (b) => b.date,
        closed,
        deleteRange: (from, to, openMonths) =>
          prisma.bankEntry
            .deleteMany({
              where: { date: { gte: from, lte: to }, OR: openMonths.map((m) => ({ date: { startsWith: m } })) },
            })
            .then(() => {}),
        insert: (rows) =>
          prisma.bankEntry
            .createMany({
              data: rows.map((b) => ({
                date: b.date,
                concept: b.concept,
                amount: b.amount,
                reference: b.reference,
                kind: b.kind,
              })),
            })
            .then(() => {}),
      });
    } else if (kind === "datafono") {
      const parsed = parseDatafono(f.buffer);
      warnings.push(...parsed.warnings);
      res = await replaceRange({
        rows: parsed.entries,
        dateOf: (d) => d.txDate,
        closed,
        deleteRange: (from, to, openMonths) =>
          prisma.dataphoneEntry
            .deleteMany({
              where: { txDate: { gte: from, lte: to }, OR: openMonths.map((m) => ({ txDate: { startsWith: m } })) },
            })
            .then(() => {}),
        insert: (rows) =>
          prisma.dataphoneEntry
            .createMany({
              data: rows.map((d) => ({
                txDate: d.txDate,
                depositDate: d.depositDate,
                establishment: d.establishment,
                storeCode: d.storeCode,
                franchise: d.franchise,
                cardType: d.cardType,
                gross: d.gross,
                net: d.net,
                terminal: d.terminal,
              })),
            })
            .then(() => {}),
      });
    } else if (kind === "datafono_banco") {
      const parsed = parseDatafonoBanco(f.buffer);
      warnings.push(...parsed.warnings);
      res = await replaceRange({
        rows: parsed.qr,
        dateOf: (q) => q.date,
        closed,
        deleteRange: (from, to, openMonths) =>
          prisma.qrEntry
            .deleteMany({
              where: { date: { gte: from, lte: to }, OR: openMonths.map((m) => ({ date: { startsWith: m } })) },
            })
            .then(() => {}),
        insert: (rows) =>
          prisma.qrEntry
            .createMany({
              data: rows.map((q) => ({
                date: q.date,
                concept: q.concept,
                amount: q.amount,
                payer: q.payer,
              })),
            })
            .then(() => {}),
      });
    } else if (kind === "linux") {
      const parsed = parseLinux(f.buffer);
      warnings.push(...parsed.warnings);
      // fuente propia "linux": el borrado se limita a source=linux (no toca Alegra/Karrot)
      res = await ingestSales(parsed.sales, "linux", closed);
    } else if (kind === "mercadopago") {
      const parsed = parseMercadopago(f.buffer);
      warnings.push(...parsed.warnings);
      res = await replaceRange({
        rows: parsed.entries,
        dateOf: (e) => e.date,
        closed,
        deleteRange: (from, to, openMonths) =>
          prisma.mercadopagoEntry
            .deleteMany({
              where: { date: { gte: from, lte: to }, OR: openMonths.map((m) => ({ date: { startsWith: m } })) },
            })
            .then(() => {}),
        insert: (rows) =>
          prisma.mercadopagoEntry
            .createMany({
              data: rows.map((e) => ({
                date: e.date,
                opId: e.opId,
                medio: e.medio,
                bruto: e.bruto,
                neto: e.neto,
                release: e.release,
              })),
            })
            .then(() => {}),
      });
    } else {
      warnings.push(`"${f.filename}": tipo de archivo no reconocido — no se cargó.`);
      out.push({ filename: f.filename, kind, inserted: 0, skipped: 0, from: null, to: null });
      continue;
    }

    if (res.skipped > 0) {
      warnings.push(
        `"${f.filename}": ${res.skipped} fila(s) omitida(s) por pertenecer a meses cerrados.`,
      );
    }

    await prisma.upload.create({
      data: {
        filename: f.filename,
        kind,
        dateFrom: res.from,
        dateTo: res.to,
        rows: res.inserted,
        skipped: res.skipped,
      },
    });
    out.push({ filename: f.filename, kind, ...res });
  }

  return { files: out, warnings };
}

// ───────────────────── Cálculo sobre el acumulado ─────────────────────

export interface LedgerStatus {
  summary: ConciliationSummary;
  /** última fecha con datos por fuente (corte) */
  cut: { sales: string | null; bank: string | null; qr: string | null; datafono: string | null };
  months: MonthOverview[];
}

export interface MonthOverview {
  month: string; // YYYY-MM
  closed: boolean;
  totals: { cuadran: number; diferencias: number; sinConciliar: number; manuales: number; tardias: number };
  /** listo para cerrar: sin diferencias ni sin-conciliar pendientes */
  clean: boolean;
}

async function loadAdjustments(): Promise<ManualAdjustment[]> {
  const adj = await prisma.adjustment.findMany();
  return adj.map((a) => ({
    resultId: a.resultId,
    salesDates: JSON.parse(a.salesDates) as string[],
    note: a.note,
  }));
}

/** Recalcula la conciliación completa a partir de las tablas acumuladas */
export async function computeLedger(): Promise<LedgerStatus> {
  const [salesRows, bankRows, qrRows, dataRows, holidays, adjustments, statuses, refMap] =
    await Promise.all([
      prisma.sale.findMany(),
      prisma.bankEntry.findMany(),
      prisma.qrEntry.findMany(),
      prisma.dataphoneEntry.findMany(),
      loadHolidays(),
      loadAdjustments(),
      prisma.monthStatus.findMany(),
      loadRefMap(),
    ]);

  const sales: SaleInvoice[] = salesRows.map((s) => ({
    invoice: s.invoice,
    date: s.date,
    bodega: s.bodega,
    storeCode: s.storeCode,
    method: s.method as SaleInvoice["method"],
    amount: s.amount,
  }));
  const bank: BankCashEntry[] = bankRows.map((b) => ({
    date: b.date,
    concept: b.concept,
    amount: b.amount,
    reference: b.reference,
    storeCode: b.reference ? (refMap.get(b.reference) ?? null) : null,
    kind: b.kind as BankCashEntry["kind"],
  }));
  const qrBank: QrBankEntry[] = qrRows.map((q) => ({
    date: q.date,
    concept: q.concept,
    amount: q.amount,
    payer: q.payer,
  }));
  const datafono: DataphoneEntry[] = dataRows.map((d) => ({
    txDate: d.txDate,
    depositDate: d.depositDate,
    establishment: d.establishment,
    storeCode: d.storeCode,
    franchise: d.franchise,
    cardType: d.cardType,
    gross: d.gross,
    net: d.net,
    terminal: d.terminal,
  }));

  const summary = conciliar({ sales, bank, datafono, qrBank, holidays, adjustments });

  const maxDate = (dates: string[]): string | null =>
    dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : null;
  const cut = {
    sales: maxDate(sales.map((s) => s.date)),
    bank: maxDate(bank.map((b) => b.date)),
    qr: maxDate(qrBank.map((q) => q.date)),
    datafono: maxDate(datafono.map((d) => d.txDate)),
  };

  // resumen por mes
  const closedSet = new Set(statuses.filter((m) => m.closed).map((m) => m.month));
  const byMonth = new Map<string, MonthOverview>();
  for (const r of summary.results) {
    const m = r.month ?? r.depositDate.slice(0, 7);
    if (!byMonth.has(m)) {
      byMonth.set(m, {
        month: m,
        closed: closedSet.has(m),
        totals: { cuadran: 0, diferencias: 0, sinConciliar: 0, manuales: 0, tardias: 0 },
        clean: true,
      });
    }
    const o = byMonth.get(m)!;
    if (r.status === "CUADRA") o.totals.cuadran++;
    else if (r.status === "DIFERENCIA") o.totals.diferencias++;
    else if (r.status === "SIN_CONCILIAR") o.totals.sinConciliar++;
    else if (r.status === "MANUAL") o.totals.manuales++;
    if (r.late) o.totals.tardias++;
    if (r.status === "DIFERENCIA" || r.status === "SIN_CONCILIAR") o.clean = false;
  }
  // meses con estado en BD pero sin resultados (p.ej. cerrados antiguos)
  for (const st of statuses) {
    if (!byMonth.has(st.month)) {
      byMonth.set(st.month, {
        month: st.month,
        closed: st.closed,
        totals: { cuadran: 0, diferencias: 0, sinConciliar: 0, manuales: 0, tardias: 0 },
        clean: true,
      });
    }
  }

  const months = [...byMonth.values()].sort((a, b) => b.month.localeCompare(a.month));
  return { summary, cut, months };
}
