import * as XLSX from "xlsx";
import { prisma } from "../src/lib/db";
async function main() {
  const f = "C:/Users/Paola Agreda/Downloads/allsales-a2b47fd9-3c80-4506-8700-49c3de1b8966-20260907T221555963Z.xlsx";
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(XLSX.readFile(f).Sheets["Ventas"], { raw: false, defval: "" });
  for (const x of rows.filter((r) => r["Código Almacén"] === "C1" && r["Fecha"] === "2026-08-04")) console.log(`${x["# Factura"]} ${x["Hora"]} ${x["Nombre Método de Pago"].padEnd(24)} ${String(x["Valor Método de Pago"]).padStart(8)} cancel=${x["Cancelado"]} cliente=${x["Nombre Cliente"]} aut=${x["CodigoAutorizacion"]}`);
  const otro = await prisma.sale.findMany({ where: { storeCode: "JP", date: "2026-08-04", method: "OTRO" } });
  console.log("OTRO en BD:", JSON.stringify(otro.map((o) => ({ invoice: o.invoice, bodega: o.bodega, amount: o.amount }))));
  const refs = await prisma.cashReference.findMany();
  console.log("REFERENCIAS:", refs.map((r: any) => `${r.reference}→${r.storeCode}`).join(" | "));
  const model = await prisma.$queryRawUnsafe<any[]>(`select column_name from information_schema.columns where table_name='CashReference'`);
  console.log("columnas CashReference:", model.map((m) => m.column_name).join(", "));
  await prisma.$disconnect();
}
main();
