// Revisión integral 07-sep-2026 (SOLO LECTURA):
// "movimientos bancos.xlsx" (consolidado de Paola, al 4-sep) vs la BD del
// conciliador, canal por canal, + resumen del motor con alertas repetitivas.
//   npx tsx scripts/revision-7sep.ts
import * as XLSX from "xlsx";
import { readFileSync } from "fs";
import { prisma } from "../src/lib/db";
import { computeLedger } from "../src/lib/ledger";

const XLSX_PATH = "C:/Users/Paola Agreda/OneDrive/Escritorio/HABBIE/PLAZET/MOVIMIENTOS BANCOS/movimientos bancos.xlsx";
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
const ymd = (serial: number) => new Date(Math.round((serial - 25569) * 86400000)).toISOString().slice(0, 10);

type Row = unknown[];
function sheet(wb: XLSX.WorkBook, name: string): Row[] {
  return XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null });
}
function addMulti(m: Map<string, number>, k: string) { m.set(k, (m.get(k) ?? 0) + 1); }
function diffMulti(a: Map<string, number>, b: Map<string, number>): string[] {
  const out: string[] = [];
  for (const [k, n] of a) { const d = n - (b.get(k) ?? 0); for (let i = 0; i < d; i++) out.push(k); }
  return out.sort();
}

async function main() {
  const wb = XLSX.read(readFileSync(XLSX_PATH), { type: "buffer" });
  const [bank, dataf, qr, mp] = await Promise.all([
    prisma.bankEntry.findMany(), prisma.dataphoneEntry.findMany(), prisma.qrEntry.findMany(), prisma.mercadopagoEntry.findMany(),
  ]);

  // ── A) ALIANZA (efectivo): recaudos del Excel vs BankEntry ──
  console.log("═══ A) ALIANZA — recaudos de efectivo");
  const exA = new Map<string, number>(); let exAn = 0; let exAsum = 0; let exAcut = "";
  for (const r of sheet(wb, "mov alianza").slice(1)) {
    if (typeof r[0] !== "number" || typeof r[2] !== "number") continue;
    const d = ymd(r[0]); if (d > exAcut) exAcut = d;
    if (!/RECAUDO\s+REFE/i.test(String(r[1] ?? ""))) continue;
    addMulti(exA, `${d}|${Math.round(r[2] as number)}`); exAn++; exAsum += r[2] as number;
  }
  const dbA = new Map<string, number>(); let dbAn = 0; let dbAsum = 0; let dbAcut = "";
  for (const b of bank) { if (b.date > dbAcut) dbAcut = b.date; if (b.kind !== "RECAUDO_EFECTIVO") continue; addMulti(dbA, `${b.date}|${Math.round(b.amount)}`); dbAn++; dbAsum += b.amount; }
  console.log(`Excel: ${exAn} recaudos ${fmt(exAsum)} (extracto al ${exAcut}) · BD: ${dbAn} recaudos ${fmt(dbAsum)} (al ${dbAcut})`);
  const soloExcelA = diffMulti(exA, dbA);
  const desdeCorte = soloExcelA.filter((k) => k.slice(0, 10) > dbAcut);
  const antesCorte = soloExcelA.filter((k) => k.slice(0, 10) <= dbAcut);
  console.log(`Solo en Excel DESPUÉS del corte BD (${dbAcut}) → falta cargar extracto: ${desdeCorte.length} recaudos ${fmt(desdeCorte.reduce((s, k) => s + Number(k.split("|")[1]), 0))}`);
  if (antesCorte.length) { console.log(`⚠ Solo en Excel ANTES del corte (deberían estar en BD): ${antesCorte.length}`); for (const k of antesCorte.slice(0, 10)) console.log("   ", k); }
  const soloDbA = diffMulti(dbA, exA).filter((k) => k.slice(0, 10) <= exAcut);
  if (soloDbA.length) { console.log(`⚠ Solo en BD (no están en el Excel): ${soloDbA.length}`); for (const k of soloDbA.slice(0, 10)) console.log("   ", k); }
  if (!antesCorte.length && !soloDbA.length) console.log("✓ Excel y BD idénticos hasta el corte de la BD");

  // ── B) BANCOLOMBIA: abonos netos datáfono por día vs reporte Conciliar; PAGO QR vs QrEntry ──
  console.log("\n═══ B) BANCOLOMBIA — abonos datáfono y pagos QR");
  const abonos = new Map<string, number>(); const exQr = new Map<string, number>(); let exBcut = ""; let exQrN = 0;
  for (const r of sheet(wb, "mov bancolombia").slice(1)) {
    if (typeof r[1] !== "number" || typeof r[2] !== "number") continue;
    const d = ymd(r[1]); const con = String(r[4] ?? ""); if (d > exBcut) exBcut = d;
    if (/^ABONO NETO (MASTER|VISA)/i.test(con)) abonos.set(d, (abonos.get(d) ?? 0) + (r[2] as number));
    else if (/PAGO QR/i.test(con) && !/REV PAGO QR/i.test(con)) { addMulti(exQr, `${d}|${Math.round(r[2] as number)}`); exQrN++; }
  }
  const netoDia = new Map<string, number>(); let cutDataf = "";
  for (const t of dataf) { netoDia.set(t.depositDate, (netoDia.get(t.depositDate) ?? 0) + t.net); if (t.txDate > cutDataf) cutDataf = t.txDate; }
  let okDias = 0; const malDias: string[] = [];
  for (const [d, v] of [...abonos.entries()].sort()) {
    const n = netoDia.get(d) ?? 0;
    if (d > cutDataf && n === 0) continue; // aún sin reporte Conciliar
    if (Math.abs(v - n) <= 1500) okDias++; else malDias.push(`${d}: banco ${fmt(v)} vs Conciliar ${fmt(n)} (dif ${fmt(v - n)})`);
  }
  console.log(`Abonos netos por día: ${okDias} días cuadran · ${malDias.length} con diferencia · reporte Conciliar al ${cutDataf} · extracto Excel al ${exBcut}`);
  for (const m of malDias.slice(0, 12)) console.log("  ⚠", m);
  const dbQr = new Map<string, number>(); let dbQrCut = "";
  for (const q of qr) { addMulti(dbQr, `${q.date}|${Math.round(q.amount)}`); if (q.date > dbQrCut) dbQrCut = q.date; }
  const soloExQr = diffMulti(exQr, dbQr); const faltanQr = soloExQr.filter((k) => k.slice(0, 10) > dbQrCut); const rarosQr = soloExQr.filter((k) => k.slice(0, 10) <= dbQrCut);
  console.log(`PAGO QR: Excel ${exQrN} · BD ${qr.length} (al ${dbQrCut}) · después del corte (por cargar): ${faltanQr.length}`);
  if (rarosQr.length) { console.log(`⚠ QR solo en Excel antes del corte: ${rarosQr.length}`); for (const k of rarosQr.slice(0, 8)) console.log("   ", k); }

  // ── C) MERCADO PAGO: Excel (IDs) vs BD por API ──
  console.log("\n═══ C) MERCADO PAGO — Excel vs API");
  const exMp = new Map<string, number>(); let exMpCut = ""; let exMpN = 0;
  for (const r of sheet(wb, "mov mercadopago").slice(1)) {
    if (typeof r[0] !== "number") continue;
    const d = ymd(r[0]); const con = String(r[1] ?? ""); const m = con.match(/ID (\d+)/);
    if (d > exMpCut) exMpCut = d;
    if (m && /PAGO APROBADO/i.test(con)) { exMp.set(m[1], Math.round((r[2] as number) ?? 0)); exMpN++; }
  }
  const dbMp = new Map(mp.map((e) => [e.opId, Math.round(e.bruto)]));
  const soloEx = [...exMp.keys()].filter((id) => !dbMp.has(id));
  const soloDb = mp.filter((e) => e.date <= exMpCut && !exMp.has(e.opId));
  const brutoDif = [...exMp.entries()].filter(([id, v]) => dbMp.has(id) && Math.abs((dbMp.get(id) ?? 0) - v) > 1);
  console.log(`Excel: ${exMpN} pagos (al ${exMpCut}) · BD API: ${mp.length} (al ${mp.map((e) => e.date).sort().pop()})`);
  console.log(`Solo en Excel: ${soloEx.length} · Solo en BD (≤${exMpCut}): ${soloDb.length} · brutos distintos: ${brutoDif.length}`);
  for (const id of soloEx.slice(0, 8)) console.log("  ⚠ solo Excel ID", id, fmt(exMp.get(id) ?? 0));
  for (const e of soloDb.slice(0, 8)) console.log("  ⚠ solo BD", e.date, "ID", e.opId, fmt(e.bruto), e.medio);

  // ── D) MOTOR: meses y alertas repetitivas ──
  console.log("\n═══ D) MOTOR — conciliación viva y alertas repetitivas");
  const ledger = await computeLedger();
  for (const m of ledger.months) console.log(`  ${m.month}: cuadran ${m.totals.cuadran} · manuales ${m.totals.manuales} · dif ${m.totals.diferencias} · sin conciliar ${m.totals.sinConciliar} · tardías ${m.totals.tardias}${m.closed ? " [CERRADO]" : ""}`);
  const pend = ledger.summary.results.filter((r) => r.status === "DIFERENCIA" || r.status === "SIN_CONCILIAR");
  const porTienda = new Map<string, { n: number; falta: number; sobra: number; meses: Set<string> }>();
  for (const r of pend) {
    const k = `${r.channel}:${r.storeName}`;
    const a = porTienda.get(k) ?? { n: 0, falta: 0, sobra: 0, meses: new Set<string>() };
    a.n++; a.meses.add(r.month ?? r.depositDate.slice(0, 7));
    if (r.difference < 0) a.falta += -r.difference; else a.sobra += r.difference;
    porTienda.set(k, a);
  }
  console.log("Pendientes por tienda/canal (⚠ = repetitivo, 3+ casos):");
  for (const [k, a] of [...porTienda.entries()].sort((x, y) => y[1].n - x[1].n))
    console.log(`  ${a.n >= 3 ? "⚠" : " "} ${k}: ${a.n} casos en ${a.meses.size} mes(es) · falta ${fmt(a.falta)} · sobra ${fmt(a.sobra)}`);
  const alertas = ledger.summary.alerts?.filter((a) => a.recurrent) ?? [];
  for (const a of alertas) console.log(`  ⚠ TARDÍAS recurrentes: ${a.storeName} (${a.lateCount}/${a.totalCount}, máx ${a.maxDaysLate} días)`);
  await prisma.$disconnect();
}
main();
