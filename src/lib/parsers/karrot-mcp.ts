// Parsers de los reportes CSV que entrega el CONECTOR de Karrot (MCP
// `generate-report`, encabezados en inglés). Claude los saca directo de Karrot
// y los carga con `scripts/cargar-karrot-mcp.ts`; Paola no tiene que bajarlos.
//  - CUSTOMER_CREDIT_NOTES → notas crédito (qué se devolvió y de qué venta)
//  - CASHIER_BALANCE → cierres de caja por método: devoluciones por método
//    (Returns) y saldo del sistema vs contado por la asesora.

import { parse } from "csv-parse/sync";
import { normalize } from "../stores";

const UBICACION_TIENDA = new Map<string, string>([
  ["PLAZA DE LAS AMERICAS", "B1"],
  ["UNICENTRO DE OCCIDENTE", "B2"],
  ["UNIOCCIDENTE", "B2"],
  ["UNICENTRO NORTE", "B3"],
  ["JARDIN PLAZA", "JP"],
]);

export function tiendaDeUbicacion(location: string): string | null {
  return UBICACION_TIENDA.get(normalize(location)) ?? null;
}

const num = (v: unknown) => {
  const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
/** "2026-09-02T21:08:48.240Z" → "2026-09-02" (los timestamps del MCP vienen con Z pero son hora Colombia) */
const dia = (v: unknown) => String(v ?? "").slice(0, 10);

function rows(text: string): Record<string, string>[] {
  return parse(text, { columns: true, skip_empty_lines: true, bom: true, trim: true, relax_column_count: true });
}

export type KarrotMcpKind = "credit_notes" | "cashier_balance" | "unknown";

export function detectKarrotMcp(text: string): KarrotMcpKind {
  const head = text.slice(0, 600);
  if (head.includes("Credit note short ID") && head.includes("Credit Note ID")) return "credit_notes";
  if (head.includes("Batch ID") && head.includes("Counted Balance")) return "cashier_balance";
  return "unknown";
}

export interface CreditNoteRow {
  ncId: string;
  ncNumber: string;
  date: string;
  storeCode: string | null;
  location: string;
  invoice: string;
  orderReceipt: string;
  gross: number;
  discount: number;
  net: number;
  customer: string;
}

/** CUSTOMER_CREDIT_NOTES. No trae la ubicación: se resuelve después con la
 * venta (orderReceipt) o con ORDER_CREDIT_NOTE_VARIANTS; aquí queda null. */
export function parseCreditNotesCsv(text: string): CreditNoteRow[] {
  return rows(text)
    .filter((r) => r["Credit Note ID"])
    .map((r) => {
      const gross = num(r["Gross"]);
      const discount = num(r["Discount"]);
      return {
        ncId: r["Credit Note ID"],
        ncNumber: r["Credit note short ID"] ?? "",
        date: dia(r["Credit note date"]),
        storeCode: r["Location"] ? tiendaDeUbicacion(r["Location"]) : null,
        location: r["Location"] ?? "",
        invoice: r["Invoice number"] ?? "",
        orderReceipt: r["Sales order receipt"] ?? "",
        gross,
        discount,
        net: gross - discount,
        customer: r["Customer"] ?? "",
      };
    });
}

export interface CashierCloseRow {
  batchId: string;
  date: string;
  storeCode: string | null;
  location: string;
  user: string;
  method: string;
  saleIncome: number;
  returns: number;
  systemBalance: number;
  countedBalance: number;
  withdrawal: number;
  manualExpenses: number;
  manualIncome: number;
}

/** CASHIER_BALANCE: solo los cierres ("Cash drawer close"); aperturas y arqueos se ignoran. */
export function parseCashierBalanceCsv(text: string): CashierCloseRow[] {
  return rows(text)
    .filter((r) => r["Batch ID"] && /close/i.test(r["Balance Type"] ?? ""))
    .map((r) => ({
      batchId: r["Batch ID"],
      date: dia(r["Date"]),
      storeCode: tiendaDeUbicacion(r["Location"] ?? ""),
      location: r["Location"] ?? "",
      user: (r["User"] ?? "").trim(),
      method: (r["Payment Method"] ?? "").trim(),
      saleIncome: num(r["Sale Income"]),
      returns: num(r["Returns"]),
      systemBalance: num(r["System Balance"]),
      countedBalance: num(r["Counted Balance"]),
      withdrawal: num(r["Withdrawal"]),
      manualExpenses: num(r["Manual Expenses"]),
      manualIncome: num(r["Manual Income"]),
    }));
}

/** Método de pago del cierre de caja → método de la venta en la app */
export function metodoCierre(method: string): "EFECTIVO" | "TARJETA_DEBITO" | "TRANSFERENCIA" | "OTRO" {
  const m = method.toUpperCase();
  if (m.includes("EFECTIVO")) return "EFECTIVO";
  if (m.includes("DATAFONO") || m.includes("DATÁFONO")) return "TARJETA_DEBITO";
  if (m.includes("TRANSFERENCIA")) return "TRANSFERENCIA";
  return "OTRO";
}

/** Fuente de las ventas sintéticas negativas que representan devoluciones */
export const SOURCE_DEVOLUCION = "karrot_devolucion";
