import * as XLSX from "xlsx";
import { readFileSync } from "fs";
import { prisma } from "../src/lib/db";
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
async function main() {
  const wb = XLSX.read(readFileSync("C:/Users/Paola Agreda/OneDrive/Escritorio/HABBIE/PLAZET/MOVIMIENTOS BANCOS/movimientos bancos.xlsx"), { type: "buffer" });
  const rows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets["mov bancolombia"], { header: 1, raw: true, defval: null });
  const conceptos = new Map<string, { n: number; sum: number }>();
  for (const r of rows.slice(1)) {
    if (typeof r[2] !== "number" || String(r[5]) !== "ingresos") continue;
    const c = String(r[4] ?? "").replace(/\d{4,}/g, "#");
    const a = conceptos.get(c) ?? { n: 0, sum: 0 };
    a.n++; a.sum += r[2] as number; conceptos.set(c, a);
  }
  console.log("Conceptos de INGRESO en cuenta datafono (Bancolombia):");
  for (const [c, a] of [...conceptos.entries()].sort((x, y) => y[1].sum - x[1].sum)) console.log(`  ${c.padEnd(40)} ${String(a.n).padStart(4)} movs  ${fmt(a.sum)}`);
  const dataf = await prisma.dataphoneEntry.findMany();
  let amexN = 0, amexNet = 0, otras = 0;
  for (const t of dataf) { if (t.franchise.toUpperCase().includes("AMEX")) { amexN++; amexNet += t.net; } else if (!/VISA|MASTER/i.test(t.franchise)) otras += t.net; }
  console.log(`\nConciliar: AMEX ${amexN} transacciones, neto ${fmt(amexNet)} · otras franquicias no VISA/MC: ${fmt(otras)}`);
  console.log("Diferencia total banco vs Conciliar (abr–ago) era: -$6.487.145");
  await prisma.$disconnect();
}
main();
