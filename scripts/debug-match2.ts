import fs from "node:fs";
import * as XLSX from "xlsx";
import { processFiles } from "../src/lib/process";

const src = XLSX.readFile("C:/Users/Paola Agreda/OneDrive/Escritorio/conciliacion.xlsx");
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, src.Sheets["ALIANZA EFECTIVO"], "Movimientos");
const bancoBuf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
const transBuf = fs.readFileSync("C:/Users/Paola Agreda/Downloads/Alegra - Reporte de transacciones - HABBIE SAS -.xlsx");

async function main() {
  const out = await processFiles({ alegraTrans: transBuf, banco: bancoBuf });
  const byRef = new Map<string, {min:string,max:string,n:number}>();
  for (const b of out.bank) {
    if (!b.reference) continue;
    const e = byRef.get(b.reference) ?? {min: b.date, max: b.date, n: 0};
    e.min = e.min < b.date ? e.min : b.date;
    e.max = e.max > b.date ? e.max : b.date;
    e.n++;
    byRef.set(b.reference, e);
  }
  for (const [ref, e] of byRef) console.log(ref, e.min, "->", e.max, `(${e.n})`);
  console.log("\nAll bank date range:", out.bank.map(b=>b.date).sort()[0], "->", out.bank.map(b=>b.date).sort().at(-1));
  console.log("\nAlegra sales storeCode nulls sample:");
  const nulls = out.sales.filter(s => s.method === "EFECTIVO" && !s.storeCode);
  console.log("null storeCode efectivo rows:", nulls.length);
  console.log(nulls.slice(0,5));
}
main().then(() => process.exit(0));
