// SOLO LECTURA. ¿Credibanco descuenta exacto por transacción?
//   1) tasa (1 - neto/bruto) por transacción, por franquicia y tipo de tarjeta
//   2) descomposición: comisión 1,89 % (+IVA 19 %?) + retefuente 1,5 % + ICA
//   3) lotes (fecha de canje + franquicia + terminal) vs "ABONO NETO" del banco
//   npx tsx scripts/datafono-tasa.ts [desde] [hasta]
import * as XLSX from "xlsx";
import { prisma } from "../src/lib/db";

const DESDE = process.argv[2] ?? "2026-08-18";
const HASTA = process.argv[3] ?? "2026-09-09";
const BANCOS = "C:/Users/Paola Agreda/AppData/Local/Temp/claude/C--Users-Paola-Agreda/34eba1a8-da0b-434b-aa7d-caa0f1b75c2f/scratchpad/bancos.xlsx";
const fmt = (n: number) => Math.round(n).toLocaleString("es-CO");
const pct = (x: number) => (x * 100).toFixed(4) + " %";
const ymd = (serial: number) => new Date(Math.round((serial - 25569) * 86400000)).toISOString().slice(0, 10);

async function main() {
  const rango = await prisma.dataphoneEntry.aggregate({ _min: { txDate: true }, _max: { txDate: true }, _count: true });
  console.log("DataphoneEntry cargado:", rango._count, "filas,", rango._min.txDate, "→", rango._max.txDate);

  const tx = await prisma.dataphoneEntry.findMany({
    where: { txDate: { gte: DESDE, lte: HASTA } },
    orderBy: [{ txDate: "asc" }, { terminal: "asc" }],
  });
  console.log(`\nTransacciones ${DESDE}..${HASTA}: ${tx.length}`);
  if (!tx.length) return;

  // 1) tasas por franquicia / tipo
  const grupos = new Map<string, { n: number; bruto: number; neto: number; tasas: Map<string, number> }>();
  for (const t of tx) {
    if (!t.gross) continue;
    const k = `${t.franchise} | ${t.cardType}`;
    const g = grupos.get(k) ?? { n: 0, bruto: 0, neto: 0, tasas: new Map() };
    g.n++; g.bruto += t.gross; g.neto += t.net;
    const tasa = (1 - t.net / t.gross).toFixed(4);
    g.tasas.set(tasa, (g.tasas.get(tasa) ?? 0) + 1);
    grupos.set(k, g);
  }
  console.log("\n== Tasa de descuento por franquicia / tipo (1 - neto/bruto) ==");
  for (const [k, g] of [...grupos].sort()) {
    const tasas = [...g.tasas].sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([t, n]) => `${(Number(t) * 100).toFixed(2)}%×${n}`).join(", ");
    console.log(`${k.padEnd(28)} n=${String(g.n).padStart(4)}  bruto ${fmt(g.bruto).padStart(13)}  neto ${fmt(g.neto).padStart(13)}  promedio ${pct(1 - g.neto / g.bruto)}  | tasas: ${tasas}`);
  }

  // 2) descomposición: ¿qué fórmula reproduce el neto al peso?
  const COM = 0.0189, IVA = 0.19, RTE = 0.015;
  const candidatos: Record<string, (g: number) => number> = {
    "1,89%": g => g * (1 - COM),
    "1,89% + IVA": g => g * (1 - COM * (1 + IVA)),
    "1,89% + IVA + rtefte 1,5%": g => g * (1 - COM * (1 + IVA) - RTE),
    "1,89% + IVA + rtefte 1,5% + ICA 0,414%": g => g * (1 - COM * (1 + IVA) - RTE - 0.00414),
    "1,89% + IVA + rtefte 1,5% + ICA 0,966%": g => g * (1 - COM * (1 + IVA) - RTE - 0.00966),
    "1,89% + IVA + 4x1000": g => g * (1 - COM * (1 + IVA) - 0.004),
    "1,89% + 4x1000": g => g * (1 - COM - 0.004),
    "1,89% + IVA + rtefte 1,5% + 4x1000": g => g * (1 - COM * (1 + IVA) - RTE - 0.004),
  };
  console.log("\n== ¿Qué fórmula da el neto exacto (±$1)? ==");
  for (const [nombre, f] of Object.entries(candidatos)) {
    let ok = 0;
    for (const t of tx) if (Math.abs(f(t.gross) - t.net) <= 1) ok++;
    console.log(`${nombre.padEnd(42)} ${ok}/${tx.length}`);
  }
  // residuo tras comisión+IVA: ¿qué porcentaje queda?
  console.log("\n== Muestra: bruto, neto, descuento total, y descuento restante tras 1,89%+IVA ==");
  for (const t of tx.filter(x => x.gross > 0).slice(0, 12)) {
    const desc = t.gross - t.net;
    const comIva = t.gross * COM * (1 + IVA);
    const resto = desc - comIva;
    console.log(`${t.txDate} ${t.franchise.padEnd(10)} ${t.cardType.padEnd(8)} bruto ${fmt(t.gross).padStart(9)} neto ${fmt(t.net).padStart(9)} desc ${pct(desc / t.gross)}  resto ${pct(resto / t.gross)}`);
  }
  // distribución de la tasa en toda la muestra
  const hist = new Map<string, number>();
  for (const t of tx) if (t.gross) { const k = ((1 - t.net / t.gross) * 100).toFixed(2); hist.set(k, (hist.get(k) ?? 0) + 1); }
  console.log("\n== Distribución de la tasa (todas las transacciones) ==");
  for (const [k, n] of [...hist].sort((a, b) => Number(a[0]) - Number(b[0]))) console.log(`  ${k}% → ${n}`);

  // 3) lotes vs banco
  const lotes = new Map<string, { neto: number; bruto: number; n: number }>();
  for (const t of tx) {
    const k = `${t.depositDate}|${t.franchise.toUpperCase()}|${t.terminal}`;
    const l = lotes.get(k) ?? { neto: 0, bruto: 0, n: 0 };
    l.neto += t.net; l.bruto += t.gross; l.n++;
    lotes.set(k, l);
  }
  const wb = XLSX.readFile(BANCOS);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets["mov bancolombia"], { header: 1, raw: true, defval: null }) as unknown[][];
  const abonos: { fecha: string; franq: string; valor: number; usado: boolean }[] = [];
  for (const r of rows.slice(1)) {
    const concepto = String(r[4] ?? "");
    const m = concepto.match(/ABONO NETO (VISA|MASTER|AMEX)/);
    if (!m || typeof r[1] !== "number") continue;
    const fecha = ymd(r[1] as number);
    if (fecha < DESDE || fecha > "2026-09-12") continue;
    abonos.push({ fecha, franq: m[1], valor: Number(r[2]), usado: false });
  }
  console.log(`\n== Lotes Conciliar (fecha canje + franquicia + terminal) vs ABONO NETO Bancolombia ==`);
  console.log(`Lotes: ${lotes.size}; abonos en banco ${DESDE}..: ${abonos.length}`);
  let exactos = 0, sinAbono = 0, difTotal = 0;
  const franqMap = (f: string) => f.includes("MASTER") ? "MASTER" : f.includes("VISA") ? "VISA" : f.includes("AMEX") ? "AMEX" : f;
  for (const [k, l] of [...lotes].sort()) {
    const [fecha, franq, term] = k.split("|");
    const fq = franqMap(franq);
    // busca abono igual (±$2) en fecha de canje o hasta 3 días después
    let ab = abonos.find(a => !a.usado && a.franq === fq && a.fecha >= fecha && a.fecha <= addDays(fecha, 3) && Math.abs(a.valor - l.neto) <= 2);
    if (ab) { ab.usado = true; exactos++; continue; }
    sinAbono++;
    const cerca = abonos.filter(a => !a.usado && a.franq === fq && a.fecha >= fecha && a.fecha <= addDays(fecha, 3))
      .map(a => `${a.fecha} ${fmt(a.valor)}`).join(" / ");
    console.log(`  SIN ABONO EXACTO: canje ${fecha} ${fq} term ${term} n=${l.n} bruto ${fmt(l.bruto)} neto ${fmt(l.neto)} | abonos libres cerca: ${cerca || "ninguno"}`);
    difTotal += l.neto;
  }
  console.log(`Lotes con abono exacto en banco: ${exactos}/${lotes.size}; sin abono exacto: ${sinAbono} (neto ${fmt(difTotal)})`);
  const sobran = abonos.filter(a => !a.usado && a.fecha <= HASTA);
  console.log(`Abonos del banco sin lote Conciliar (hasta ${HASTA}): ${sobran.length}`);
  for (const a of sobran.slice(0, 25)) console.log(`  ${a.fecha} ${a.franq} ${fmt(a.valor)}`);
}
function addDays(ymdStr: string, n: number) { const d = new Date(ymdStr + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
