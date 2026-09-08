import * as XLSX from "xlsx";
import { prisma } from "../src/lib/db";
async function main() {
  const v = await prisma.sale.findMany({ where: { storeCode: "B1", method: "OTRO", amount: { gte: 124349, lte: 124351 } } });
  for (const x of v) console.log("SALE:", JSON.stringify(x));
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(XLSX.readFile("C:/Users/Paola Agreda/Downloads/Alegra - Reporte de transacciones - HABBIE SAS -.xlsx").Sheets["Worksheet"], { raw: false, defval: "" });
  for (const r of rows) if (String(r["Valor"]).replace(/[^\d]/g, "") === "124350") console.log("ALEGRA:", JSON.stringify(r));
  for (const x of v) {
    const d0 = new Date(Date.parse(x.date + "T00:00:00Z") - 3 * 86400000).toISOString().slice(0, 10);
    const d1 = new Date(Date.parse(x.date + "T00:00:00Z") + 3 * 86400000).toISOString().slice(0, 10);
    const q = await prisma.qrEntry.findMany({ where: { date: { gte: d0, lte: d1 }, amount: { gte: 124000, lte: 124700 } } });
    console.log("QR banco ±3 días:", JSON.stringify(q.map((z) => ({ date: z.date, amount: z.amount, payer: z.payer }))));
    const b = await prisma.bankEntry.findMany({ where: { date: { gte: d0, lte: d1 }, amount: { gte: 124000, lte: 124700 } } });
    console.log("Banco efectivo ±3 días:", JSON.stringify(b.map((z) => ({ date: z.date, amount: z.amount, ref: z.reference, concept: (z as any).concept ?? "" }))));
    const otras = await prisma.sale.findMany({ where: { storeCode: "B1", date: x.date, invoice: x.invoice } });
    console.log("misma factura:", JSON.stringify(otras.map((z) => ({ method: z.method, amount: z.amount, bodega: z.bodega }))));
  }
  await prisma.$disconnect();
}
main();
