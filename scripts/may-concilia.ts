// CONCILIACIÓN DE MAYO 2026 (mes de transición Linux → Alegra)
// - EFECTIVO: serie combinada de ventas EFE (Linux hasta su fin + Alegra desde
//   su arranque) vs depósitos del banco por referencia de cada tienda,
//   con calce secuencial (1..7 días acumulados, ±$500).
// - DATAFONO: venta con tarjeta esperada (Linux TAR + Alegra tarjetas) por día
//   vs recaudo Plink del día.
// Incluye la cola de abril de Unicentro Norte (ventas 28-29 abr sin consignar
// en el archivo Linux) para ver si entró junto con los primeros días de Alegra.
import fs from "node:fs";
import * as XLSX from "xlsx";
import { parseDatafono } from "../src/lib/parsers/datafono";
import { parseAlegraTrans } from "../src/lib/parsers/alegra-trans";

const PP = "C:/Users/Paola Agreda/OneDrive/Escritorio/PROYECTOS PAO";
const DIR = `${PP}/muestras-conciliacion/sistemas anteriores`;
const MC = `${PP}/muestras-conciliacion`;

const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
const toDate = (v: any): string =>
  typeof v === "number"
    ? new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10)
    : String(v ?? "").trim();

// Tiendas: SUC Linux ↔ código app/Alegra/Plink
const TIENDAS = [
  { suc: "BQ", app: "B3", nombre: "Unicentro Norte", finLinux: "2026-04-29", refs: ["3235896844", "3138845101"], serieIni: "2026-04-25" },
  { suc: "Q9", app: "B2", nombre: "Unioccidente", finLinux: "2026-05-04", refs: ["3105543462"], serieIni: "2026-05-01" },
  { suc: "BD", app: "B1", nombre: "Plaza de las Américas", finLinux: "2026-05-05", refs: ["3102874360", "3015140002"], serieIni: "2026-05-01" },
  { suc: "D0", app: "JP", nombre: "Jardín Plaza", finLinux: "2026-05-27", refs: ["3172560775"], serieIni: "2026-05-16" },
];
const SERIE_FIN = "2026-06-07"; // se incluye inicio de junio para que los depósitos de esa semana calcen

// ── Linux: EFE y TAR por (suc, día) ──────────────────────────────────────
const ventas: any[] = XLSX.utils.sheet_to_json(XLSX.readFile(`${DIR}/ventaSabmyju.xlsx`).Sheets["ventaSabmyju"]);
const linEfe = new Map<string, number>(), linTar = new Map<string, number>();
for (const r of ventas) {
  const suc = String(r.SUC ?? "").trim();
  const d = toDate(r.FECHA);
  if (!suc || !d) continue;
  if (suc === "D0" && d < "2026-05-16") continue;
  const e = Number(r.EFE ?? 0), t = Number(r.TAR ?? 0);
  if (e) linEfe.set(`${suc}|${d}`, (linEfe.get(`${suc}|${d}`) ?? 0) + e);
  if (t) linTar.set(`${suc}|${d}`, (linTar.get(`${suc}|${d}`) ?? 0) + t);
}

// ── Alegra: transacciones de mayo por tienda/día/método ─────────────────
const alegra = parseAlegraTrans(
  fs.readFileSync(`${DIR}/Alegra - Reporte de transacciones - HABBIE SAS -.xlsx`),
);
const alEfe = new Map<string, number>(), alTar = new Map<string, number>();
const alOtro = new Map<string, number>(), alQr = new Map<string, number>();
const alegraIni = new Map<string, string>();
for (const s of alegra.sales) {
  if (!s.storeCode || s.date < "2026-04-25" || s.date > SERIE_FIN) continue;
  const k = `${s.storeCode}|${s.date}`;
  if (s.method === "EFECTIVO") alEfe.set(k, (alEfe.get(k) ?? 0) + s.amount);
  else if (s.method === "TARJETA_CREDITO" || s.method === "TARJETA_DEBITO") alTar.set(k, (alTar.get(k) ?? 0) + s.amount);
  else if (s.method === "TRANSFERENCIA") alQr.set(k, (alQr.get(k) ?? 0) + s.amount);
  else alOtro.set(k, (alOtro.get(k) ?? 0) + s.amount);
  const prev = alegraIni.get(s.storeCode);
  if (!prev || s.date < prev) alegraIni.set(s.storeCode, s.date);
}
console.log("Arranque de Alegra por tienda (primera transacción vista desde 25-abr):");
for (const t of TIENDAS) console.log(`   ${t.nombre.padEnd(24)} ${alegraIni.get(t.app) ?? "(sin datos)"}`);
if (alegra.warnings.length) console.log("   avisos parser:", alegra.warnings.join(" | "));

// ── Banco: depósitos por referencia ──────────────────────────────────────
const bRows: any[] = XLSX.utils.sheet_to_json(
  XLSX.readFile("C:/Users/Paola Agreda/OneDrive/Escritorio/conciliacion.xlsx").Sheets["ALIANZA EFECTIVO"],
);
const bank = bRows
  .map((r) => ({
    date: toDate(r["Fecha Tran"]),
    valor: Number(r["Valor"] ?? 0),
    ref: String(r["Concepto"] ?? "").match(/RECAUDO REFE:\s*(\d+)/)?.[1],
  }))
  .filter((b) => b.ref)
  .map((b) => ({ ...b, ref: String(Number(b.ref)) }));

// ══ CANAL EFECTIVO ═══════════════════════════════════════════════════════
console.log("\n" + "═".repeat(76));
console.log("EFECTIVO — ventas (Linux+Alegra) vs depósitos banco, calce secuencial");
console.log("═".repeat(76));
for (const t of TIENDAS) {
  // serie de ventas EFE combinada
  const dias = new Map<string, number>();
  for (const [k, v] of linEfe) {
    const [s, d] = k.split("|");
    if (s === t.suc && d >= t.serieIni && d <= t.finLinux) dias.set(d, (dias.get(d) ?? 0) + v);
  }
  for (const [k, v] of alEfe) {
    const [s, d] = k.split("|");
    if (s === t.app && d >= t.serieIni && d <= SERIE_FIN) {
      if (dias.has(d) && d <= t.finLinux) console.log(`   ⚠ ${t.nombre} ${d}: EFE en Linux Y Alegra el mismo día (se suman)`);
      dias.set(d, (dias.get(d) ?? 0) + v);
    }
  }
  const serie = [...dias.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, amount]) => ({ date, amount, usado: false }));
  const deps = bank
    .filter((b) => t.refs.includes(b.ref!) && b.date > t.serieIni && b.date <= "2026-06-08")
    .sort((a, b) => a.date.localeCompare(b.date));
  const deps2 = t.suc === "D0" ? deps.filter((d) => d.date >= "2026-05-16") : deps;

  const serieMayo = serie.filter((x) => x.date <= "2026-05-31");
  console.log(`\n${t.nombre} — venta EFE ${serieMayo[0]?.date ?? "-"} → 31-may: ${fmt(serieMayo.reduce((s, x) => s + x.amount, 0))} (${serieMayo.length} días) | ${deps2.length} depósitos hasta 8-jun: ${fmt(deps2.reduce((s, x) => s + x.valor, 0))}`);

  // Calce flexible: para cada depósito, buscar una racha CONSECUTIVA de días
  // no usados (1..7) anteriores al depósito (hasta 10 días atrás) que sume ±$500.
  const depsMalos: typeof deps2 = [];
  for (const dep of deps2) {
    const candidatos = serie
      .map((x, i) => ({ ...x, i }))
      .filter((x) => !x.usado && x.date < dep.date && Date.parse(dep.date) - Date.parse(x.date) <= 12 * 86400000);
    let hallado = false;
    for (let a = 0; a < candidatos.length && !hallado; a++) {
      let cum = 0;
      for (let b = a; b < Math.min(a + 7, candidatos.length); b++) {
        // exigir consecutividad en el arreglo original (sin saltarse días no usados)
        if (b > a && candidatos[b].i !== candidatos[b - 1].i + 1) break;
        cum += candidatos[b].amount;
        if (Math.abs(cum - dep.valor) <= 500) {
          for (let m = a; m <= b; m++) serie[candidatos[m].i].usado = true;
          hallado = true;
          break;
        }
        if (cum > dep.valor + 500) break;
      }
    }
    if (!hallado) depsMalos.push(dep);
  }
  const sinDeposito = serie.filter((x) => !x.usado && x.date <= "2026-05-31");
  const okDias = serieMayo.length - sinDeposito.length;
  console.log(`   ✔ ${okDias}/${serieMayo.length} días de venta calzan con un depósito`);
  for (const d of depsMalos) console.log(`   ✘ depósito ${d.date} ${fmt(d.valor).padStart(12)} sin calce exacto`);
  if (sinDeposito.length)
    console.log(`   ✘ días de venta sin depósito que calce: ${sinDeposito.map((x) => `${x.date.slice(5)} ${fmt(x.amount)}`).join(", ")}`);
  const difNeta = depsMalos.reduce((s, d) => s + d.valor, 0) - sinDeposito.reduce((s, x) => s + x.amount, 0);
  if (depsMalos.length || sinDeposito.length)
    console.log(`   (depósitos sin calce ${fmt(depsMalos.reduce((s, d) => s + d.valor, 0))} vs ventas sin calce ${fmt(sinDeposito.reduce((s, x) => s + x.amount, 0))} → dif neta ${fmt(difNeta)})`);
}

// ══ CANAL DATAFONO ═══════════════════════════════════════════════════════
console.log("\n" + "═".repeat(76));
console.log("DATAFONO — venta tarjetas (Linux TAR + Alegra crédito/débito) vs Plink, por día");
console.log("═".repeat(76));
const plink = new Map<string, number>();
for (const f of [
  `${MC}/901987494_Reporte_Conciliar_20260401_20260430.xlsx`,
  `${MC}/901987494_Reporte_Conciliar_20260501_20260531.xlsx`,
  `${MC}/901987494_Reporte_Conciliar_20260601_20260630 (1).xlsx`,
]) {
  const out = parseDatafono(fs.readFileSync(f));
  for (const e of out.entries)
    if (e.storeCode) plink.set(`${e.storeCode}|${e.txDate}`, (plink.get(`${e.storeCode}|${e.txDate}`) ?? 0) + e.gross);
}
for (const t of TIENDAS) {
  let vTot = 0, pTot = 0, dias = 0, malos = 0;
  const detalles: string[] = [];
  for (let ts = Date.parse("2026-05-01T00:00:00Z"); ts <= Date.parse("2026-05-31T00:00:00Z"); ts += 86400000) {
    const d = new Date(ts).toISOString().slice(0, 10);
    const lin = d <= t.finLinux ? (linTar.get(`${t.suc}|${d}`) ?? 0) : 0;
    const al = alTar.get(`${t.app}|${d}`) ?? 0;
    const esperado = lin + al;
    const p = plink.get(`${t.app}|${d}`) ?? 0;
    if (!esperado && !p) continue;
    dias++;
    vTot += esperado; pTot += p;
    if (Math.abs(esperado - p) > 500) {
      malos++;
      detalles.push(`   ${d}  venta ${fmt(esperado).padStart(11)} (linux ${fmt(lin)}, alegra ${fmt(al)})  plink ${fmt(p).padStart(11)}  dif ${fmt(esperado - p).padStart(11)}`);
    }
  }
  console.log(`\n${t.nombre} — venta tarjetas mayo ${fmt(vTot)} | Plink ${fmt(pTot)} | dif ${fmt(vTot - pTot)} (${dias} días, ${malos} no calzan)`);
  for (const d of detalles) console.log(d);
}

// ── Info: otros medios de pago de mayo en Alegra ─────────────────────────
console.log("\nOtros medios de mayo en Alegra (informativo):");
for (const t of TIENDAS) {
  let qr = 0, otro = 0;
  for (const [k, v] of alQr) if (k.startsWith(t.app + "|") && k.slice(3) >= "2026-05-01") qr += v;
  for (const [k, v] of alOtro) if (k.startsWith(t.app + "|") && k.slice(3) >= "2026-05-01") otro += v;
  console.log(`   ${t.nombre.padEnd(24)} QR ${fmt(qr).padStart(12)} | otros (Rappi/Addi/etc) ${fmt(otro).padStart(12)}`);
}
