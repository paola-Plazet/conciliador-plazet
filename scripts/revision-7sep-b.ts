import * as XLSX from "xlsx";
import { readFileSync } from "fs";
import { prisma } from "../src/lib/db";
import { computeLedger } from "../src/lib/ledger";
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
const ymd = (s: number) => new Date(Math.round((s - 25569) * 86400000)).toISOString().slice(0, 10);
async function main() {
  const wb = XLSX.read(readFileSync("C:/Users/Paola Agreda/OneDrive/Escritorio/HABBIE/PLAZET/MOVIMIENTOS BANCOS/movimientos bancos.xlsx"), { type: "buffer" });
  const rows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets["mov bancolombia"], { header: 1, raw: true, defval: null });
  const abonos = new Map<string, number>();
  for (const r of rows.slice(1)) {
    if (typeof r[1] !== "number" || typeof r[2] !== "number") continue;
    if (/^ABONO NETO (MASTER|VISA)/i.test(String(r[4] ?? ""))) { const d = ymd(r[1]); abonos.set(d, (abonos.get(d) ?? 0) + (r[2] as number)); }
  }
  const dataf = await prisma.dataphoneEntry.findMany();
  const netoDia = new Map<string, number>();
  let cutD = ""; for (const t of dataf) { netoDia.set(t.depositDate, (netoDia.get(t.depositDate) ?? 0) + t.net); if (t.depositDate > cutD) cutD = t.depositDate; }
  const desde = [...abonos.keys()].sort()[0]; const hasta = cutD;
  let sumB = 0, sumC = 0;
  for (const [d, v] of abonos) if (d >= desde && d <= hasta) sumB += v;
  for (const [d, v] of netoDia) if (d >= desde && d <= hasta) sumC += v;
  console.log(`ABONOS acumulados ${desde}…${hasta}: banco ${fmt(sumB)} vs Conciliar ${fmt(sumC)} → dif TOTAL ${fmt(sumB - sumC)} (${(((sumB - sumC) / sumC) * 100).toFixed(2)}%)`);
  // diferencia por mes
  const porMesB = new Map<string, number>(), porMesC = new Map<string, number>();
  for (const [d, v] of abonos) if (d <= hasta) porMesB.set(d.slice(0, 7), (porMesB.get(d.slice(0, 7)) ?? 0) + v);
  for (const [d, v] of netoDia) if (d >= desde) porMesC.set(d.slice(0, 7), (porMesC.get(d.slice(0, 7)) ?? 0) + v);
  for (const m of [...new Set([...porMesB.keys(), ...porMesC.keys()])].sort())
    console.log(`  ${m}: banco ${fmt(porMesB.get(m) ?? 0)} vs Conciliar ${fmt(porMesC.get(m) ?? 0)} → dif ${fmt((porMesB.get(m) ?? 0) - (porMesC.get(m) ?? 0))}`);

  // Pendientes REALES del motor (sin bordes de archivo)
  const ledger = await computeLedger();
  const esBorde = (n?: string) => !!n && /fuera del rango|no comparable|faltan ventas previas|sin cargar/i.test(n);
  const pend = ledger.summary.results.filter((r) => (r.status === "DIFERENCIA" || r.status === "SIN_CONCILIAR") && !esBorde(r.note));
  console.log(`\nPENDIENTES REALES (sin bordes de archivo): ${pend.length}`);
  const por = new Map<string, { n: number; falta: number; sobra: number }>();
  for (const r of pend) { const k = `${r.channel}:${r.storeName}`; const a = por.get(k) ?? { n: 0, falta: 0, sobra: 0 }; a.n++; if (r.difference < 0) a.falta -= r.difference; else a.sobra += r.difference; por.set(k, a); }
  for (const [k, a] of [...por.entries()].sort((x, y) => y[1].n - x[1].n)) console.log(`  ${a.n >= 3 ? "⚠" : " "} ${k}: ${a.n} casos · falta ${fmt(a.falta)} · sobra ${fmt(a.sobra)}`);
  const top = pend.filter((r) => Math.abs(r.difference) >= 100000).sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));
  console.log(`Top diferencias ≥ $100.000: ${top.length}`);
  for (const r of top.slice(0, 15)) console.log(`   ${r.channel} ${r.storeName} ${r.depositDate} dif ${fmt(r.difference)} ${r.note ? "· " + r.note.slice(0, 60) : ""}`);
  await prisma.$disconnect();
}
main();
