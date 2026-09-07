// ¿El descuento total bruto→banco corresponde a la comisión pactada 1,89%?
import * as XLSX from "xlsx";
import { readFileSync } from "fs";
import { prisma } from "../src/lib/db";
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
const ymd = (s: number) => new Date(Math.round((s - 25569) * 86400000)).toISOString().slice(0, 10);
async function main() {
  const wb = XLSX.read(readFileSync("C:/Users/Paola Agreda/OneDrive/Escritorio/HABBIE/PLAZET/MOVIMIENTOS BANCOS/movimientos bancos.xlsx"), { type: "buffer" });
  const rows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets["mov bancolombia"], { header: 1, raw: true, defval: null });
  const abonos = new Map<string, number>();
  for (const r of rows.slice(1)) if (typeof r[1] === "number" && typeof r[2] === "number" && /^ABONO NETO (MASTER|VISA)/i.test(String(r[4] ?? ""))) {
    const d = ymd(r[1]); abonos.set(d.slice(0, 7), (abonos.get(d.slice(0, 7)) ?? 0) + (r[2] as number));
  }
  const dataf = await prisma.dataphoneEntry.findMany();
  const bruto = new Map<string, number>(), neto = new Map<string, number>();
  let cut = ""; for (const t of dataf) { if (t.depositDate > cut) cut = t.depositDate; }
  for (const t of dataf) { const m = t.depositDate.slice(0, 7); bruto.set(m, (bruto.get(m) ?? 0) + t.gross); neto.set(m, (neto.get(m) ?? 0) + t.net); }
  console.log("corte Conciliar (canje):", cut, "— comparación por mes (solo hasta el corte):");
  let B = 0, N = 0, A = 0;
  for (const m of [...bruto.keys()].sort()) {
    const b = bruto.get(m) ?? 0, n = neto.get(m) ?? 0, a = abonos.get(m) ?? 0;
    if (!a) continue;
    B += b; N += n; A += a;
    console.log(`  ${m}: bruto ${fmt(b)} · Conciliar neto ${fmt(n)} (${(((b - n) / b) * 100).toFixed(2)}%) · banco ${fmt(a)} (desc total ${(((b - a) / b) * 100).toFixed(2)}%)`);
  }
  console.log(`TOTAL: bruto ${fmt(B)} · desc Conciliar ${(((B - N) / B) * 100).toFixed(2)}% · desc real a banco ${(((B - A) / B) * 100).toFixed(2)}%`);
  console.log(`Referencias: 1,89% pactado · 1,89%+IVA19% = ${(1.89 * 1.19).toFixed(2)}% · brecha banco vs Conciliar ${(((N - A) / B) * 100).toFixed(2)}% del bruto`);
  await prisma.$disconnect();
}
main();
