// Migración única: copia los datos de la base local SQLite (dev.db) a la base
// nueva en Neon. Se usa porque algunos archivos fuente (Plink abr-jun, etc.) ya
// no están en la carpeta de muestras, pero sus datos sí viven en dev.db.
// REEMPLAZA por completo cada tabla en Neon.
import Database from "better-sqlite3";
import { prisma } from "../src/lib/db";

const sqlite = new Database("dev.db", { readonly: true });
const leer = <T>(tabla: string): T[] => sqlite.prepare(`SELECT * FROM "${tabla}"`).all() as T[];

async function lote<T>(nombre: string, rows: T[], borrar: () => Promise<unknown>, insertar: (r: T[]) => Promise<unknown>) {
  await borrar();
  for (let i = 0; i < rows.length; i += 500) await insertar(rows.slice(i, i + 500));
  console.log(`${nombre.padEnd(18)} ${rows.length} filas`);
}

async function main() {
  type R = Record<string, unknown>;
  const sales = leer<R>("Sale"), bank = leer<R>("BankEntry"), qr = leer<R>("QrEntry");
  const dat = leer<R>("DataphoneEntry"), mp = leer<R>("MercadopagoEntry");
  const meses = leer<R>("MonthStatus"), ajustes = leer<R>("Adjustment");

  await lote("Sale", sales, () => prisma.sale.deleteMany(), (r) =>
    prisma.sale.createMany({ data: r.map((x) => ({ date: x.date as string, invoice: x.invoice as string, bodega: x.bodega as string, storeCode: x.storeCode as string | null, method: x.method as string, amount: x.amount as number, source: x.source as string })) }));
  await lote("BankEntry", bank, () => prisma.bankEntry.deleteMany(), (r) =>
    prisma.bankEntry.createMany({ data: r.map((x) => ({ date: x.date as string, concept: x.concept as string, amount: x.amount as number, reference: x.reference as string | null, kind: x.kind as string })) }));
  await lote("QrEntry", qr, () => prisma.qrEntry.deleteMany(), (r) =>
    prisma.qrEntry.createMany({ data: r.map((x) => ({ date: x.date as string, concept: x.concept as string, amount: x.amount as number, payer: x.payer as string })) }));
  await lote("DataphoneEntry", dat, () => prisma.dataphoneEntry.deleteMany(), (r) =>
    prisma.dataphoneEntry.createMany({ data: r.map((x) => ({ txDate: x.txDate as string, depositDate: x.depositDate as string, establishment: x.establishment as string, storeCode: x.storeCode as string | null, franchise: x.franchise as string, cardType: x.cardType as string, gross: x.gross as number, net: x.net as number, terminal: x.terminal as string })) }));
  await lote("MercadopagoEntry", mp, () => prisma.mercadopagoEntry.deleteMany(), (r) =>
    prisma.mercadopagoEntry.createMany({ data: r.map((x) => ({ date: x.date as string, opId: x.opId as string, medio: x.medio as string, bruto: x.bruto as number, neto: x.neto as number, release: x.release as string | null })) }));
  await lote("MonthStatus", meses, () => prisma.monthStatus.deleteMany(), (r) =>
    prisma.monthStatus.createMany({ data: r.map((x) => ({ month: x.month as string, closed: Boolean(x.closed), note: x.note as string | null })) }));
  await lote("Adjustment", ajustes, () => prisma.adjustment.deleteMany(), (r) =>
    prisma.adjustment.createMany({ data: r.map((x) => ({ resultId: x.resultId as string, salesDates: x.salesDates as string, note: x.note as string })) }));

  console.log("\nMigración completa.");
  process.exit(0);
}
main();
