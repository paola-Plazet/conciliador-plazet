// ¿Las "Bancolombia AH 3911 | Transferencia" y "Alianza | Transferencia" de Alegra son QR del banco?
import * as XLSX from "xlsx";
import { prisma } from "../src/lib/db";
const iso = (d: string) => { const m = String(d).match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : String(d); };
const num = (v: any) => Number(String(v).replace(/[^\d.-]/g, "")) || 0;
async function main() {
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(XLSX.readFile("C:/Users/Paola Agreda/Downloads/Alegra - Reporte de transacciones - HABBIE SAS -.xlsx").Sheets["Worksheet"], { raw: false, defval: "" });
  for (const cuenta of ["Bancolombia AH 3911", "Alianza", "Credibanco"]) {
    const sel = rows.filter((r) => r["Cuenta"] === cuenta && r["Método de pago"] === "Transferencia" && r["Tipo"] === "Ingreso");
    let enQr = 0;
    console.log(`\n== ${cuenta} | Transferencia: ${sel.length} filas`);
    for (const r of sel) {
      const d = iso(r["Fecha"]), m = num(r["Valor"]);
      const d0 = new Date(Date.parse(d + "T00:00:00Z") - 2 * 86400000).toISOString().slice(0, 10);
      const q = await prisma.qrEntry.findFirst({ where: { date: { gte: d0, lte: d }, amount: { gte: m - 1, lte: m + 1 } } });
      if (q) enQr++;
      console.log(`   ${d} $${m.toLocaleString("es-CO").padStart(10)} fac ${String(r["Asociaciones"]).replace("Facturas: ", "").padEnd(8)} ${String(r["Cliente"]).slice(0, 22).padEnd(22)} → ${q ? `QR banco ${q.date} ${q.payer}` : "no hay QR igual en el banco"}`);
    }
    console.log(`   → ${enQr}/${sel.length} tienen QR en el banco`);
  }
  await prisma.$disconnect();
}
main();
