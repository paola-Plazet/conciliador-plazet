// SOLO LECTURA. Afina: factor neto/bruto exacto por terminal/tienda, rezago
// canje vs venta por franquicia, y lote (día de venta + terminal + franquicia)
// vs ABONO NETO del banco.   npx tsx scripts/datafono-tasa2.ts
import * as XLSX from "xlsx";
import { prisma } from "../src/lib/db";

const DESDE = "2026-08-18", HASTA = "2026-09-08";
const BANCOS = "C:/Users/Paola Agreda/AppData/Local/Temp/claude/C--Users-Paola-Agreda/34eba1a8-da0b-434b-aa7d-caa0f1b75c2f/scratchpad/bancos.xlsx";
const fmt = (n: number) => Math.round(n).toLocaleString("es-CO");
const ymd = (serial: number) => new Date(Math.round((serial - 25569) * 86400000)).toISOString().slice(0, 10);
const addDays = (s: string, n: number) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dias = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

async function main() {
  const tx = await prisma.dataphoneEntry.findMany({ where: { txDate: { gte: DESDE, lte: HASTA } } });
  console.log(`Transacciones ${DESDE}..${HASTA}: ${tx.length}`);

  // factor por terminal / establecimiento
  const porTerm = new Map<string, { n: number; bruto: number; neto: number; f: Map<string, number>; store: string }>();
  for (const t of tx) {
    if (!t.gross) continue;
    const k = `${t.terminal}`;
    const g = porTerm.get(k) ?? { n: 0, bruto: 0, neto: 0, f: new Map(), store: `${t.establishment}/${t.storeCode ?? "?"}` };
    g.n++; g.bruto += t.gross; g.neto += t.net;
    const fac = (t.net / t.gross).toFixed(5);
    g.f.set(fac, (g.f.get(fac) ?? 0) + 1);
    porTerm.set(k, g);
  }
  console.log("\n== Factor neto/bruto por terminal (5 decimales) ==");
  for (const [k, g] of [...porTerm].sort()) {
    const f = [...g.f].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([x, n]) => `${x}×${n}`).join(", ");
    console.log(`${k.padEnd(10)} ${g.store.padEnd(24)} n=${String(g.n).padStart(4)} promedio ${(g.neto / g.bruto).toFixed(5)} | ${f}`);
  }
  // transacciones grandes: descuento con muchos decimales
  console.log("\n== Transacciones grandes (descuento %, 5 decimales) ==");
  for (const t of [...tx].sort((a, b) => b.gross - a.gross).slice(0, 10)) {
    console.log(`${t.txDate} ${t.terminal.padEnd(9)} ${t.franchise.padEnd(10)} ${t.cardType.padEnd(22)} bruto ${fmt(t.gross).padStart(9)} neto ${fmt(t.net).padStart(9)} desc ${((1 - t.net / t.gross) * 100).toFixed(5)} %  (desc $${fmt(t.gross - t.net)})`);
  }
  // ¿los descuentos 4,19% son de una tienda o de un tipo?
  const alto = tx.filter(t => t.gross && 1 - t.net / t.gross > 0.041);
  const cnt = (arr: typeof tx, key: (t: (typeof tx)[0]) => string) => { const m = new Map<string, number>(); for (const t of arr) m.set(key(t), (m.get(key(t)) ?? 0) + 1); return [...m].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}:${n}`).join(", "); };
  console.log(`\n== Las de ~4,19% (${alto.length}) ==\n por terminal: ${cnt(alto, t => t.terminal)}\n por franquicia/tipo: ${cnt(alto, t => t.franchise + " " + t.cardType)}\n por fecha: ${cnt(alto, t => t.txDate)}`);
  console.log(` ejemplos: ` + alto.slice(0, 5).map(t => `${t.txDate} ${t.terminal} ${t.franchise} ${t.cardType} ${fmt(t.gross)}→${fmt(t.net)} (${((1 - t.net / t.gross) * 100).toFixed(4)}%)`).join(" | "));

  // rezago canje - venta por franquicia
  const lag = new Map<string, Map<number, number>>();
  for (const t of tx) {
    const k = t.franchise.includes("AMEX") ? "AMEX" : t.franchise;
    const m = lag.get(k) ?? new Map();
    const d = dias(t.txDate, t.depositDate);
    m.set(d, (m.get(d) ?? 0) + 1);
    lag.set(k, m);
  }
  console.log("\n== Días entre venta y fecha de canje (Conciliar) ==");
  for (const [k, m] of lag) console.log(`  ${k.padEnd(11)} ` + [...m].sort((a, b) => a[0] - b[0]).map(([d, n]) => `${d} día(s): ${n}`).join(" | "));

  // lote = día de venta + terminal + franquicia  vs abonos del banco
  const lotes = new Map<string, { neto: number; bruto: number; n: number; canje: string }>();
  for (const t of tx) {
    const fq = t.franchise.includes("MASTER") ? "MASTER" : t.franchise.includes("VISA") ? "VISA" : t.franchise.includes("AMEX") ? "AMEX" : t.franchise;
    const k = `${t.txDate}|${fq}|${t.terminal}`;
    const l = lotes.get(k) ?? { neto: 0, bruto: 0, n: 0, canje: t.depositDate };
    l.neto += t.net; l.bruto += t.gross; l.n++;
    lotes.set(k, l);
  }
  const wb = XLSX.readFile(BANCOS);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets["mov bancolombia"], { header: 1, raw: true, defval: null }) as unknown[][];
  const abonos: { fecha: string; franq: string; valor: number; usado: boolean }[] = [];
  for (const r of rows.slice(1)) {
    const m = String(r[4] ?? "").match(/ABONO NETO (VISA|MASTER|AMEX)/);
    if (!m || typeof r[1] !== "number") continue;
    const fecha = ymd(r[1] as number);
    if (fecha < DESDE) continue;
    abonos.push({ fecha, franq: m[1], valor: Number(r[2]), usado: false });
  }
  const ultimaBanco = abonos.map(a => a.fecha).sort().at(-1)!;
  console.log(`\n== Lote (día de venta + terminal + franquicia) vs ABONO NETO Bancolombia (banco cargado hasta ${ultimaBanco}) ==`);
  let ok = 0, sin = 0, pend = 0; const lagsBanco = new Map<string, Map<number, number>>();
  for (const [k, l] of [...lotes].sort()) {
    const [fecha, fq, term] = k.split("|");
    const ab = abonos.find(a => !a.usado && a.franq === fq && a.fecha > fecha && a.fecha <= addDays(fecha, 6) && Math.abs(a.valor - l.neto) <= 2);
    if (ab) {
      ab.usado = true; ok++;
      const m = lagsBanco.get(fq) ?? new Map(); const d = dias(fecha, ab.fecha); m.set(d, (m.get(d) ?? 0) + 1); lagsBanco.set(fq, m);
      continue;
    }
    if (addDays(fecha, 4) > ultimaBanco) { pend++; continue; }
    sin++;
    const cerca = abonos.filter(a => !a.usado && a.franq === fq && a.fecha > fecha && a.fecha <= addDays(fecha, 6)).map(a => `${a.fecha} ${fmt(a.valor)}`).join(" / ");
    console.log(`  SIN ABONO: venta ${fecha} ${fq} term ${term} n=${l.n} bruto ${fmt(l.bruto)} neto ${fmt(l.neto)} (canje ${l.canje}) | libres cerca: ${cerca || "ninguno"}`);
  }
  console.log(`Lotes con abono exacto (±$2): ${ok}; sin abono: ${sin}; aún sin banco cargado: ${pend}; total lotes ${lotes.size}`);
  console.log("Días entre venta y abono en banco:");
  for (const [k, m] of lagsBanco) console.log(`  ${k.padEnd(7)} ` + [...m].sort((a, b) => a[0] - b[0]).map(([d, n]) => `${d} día(s): ${n}`).join(" | "));
  const sobran = abonos.filter(a => !a.usado && a.fecha >= addDays(DESDE, 5));
  console.log(`Abonos del banco (desde ${addDays(DESDE, 5)}) sin lote Conciliar: ${sobran.length}`);
  for (const a of sobran) console.log(`  ${a.fecha} ${a.franq} ${fmt(a.valor)}`);
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
