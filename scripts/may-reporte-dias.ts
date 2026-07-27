// REPORTE DE CONCILIACIÓN DE MAYO 2026 — día por día, tienda por tienda.
// Hoja por tienda: EFECTIVO (venta vs depósito calzado), TARJETAS (venta vs
// Plink) y venta QR/otros del día. Diferencias resaltadas: amarillo $500-$999,
// rojo ≥ $1.000. Hoja QR (empresa) y hoja Resumen.
// Genera: PROYECTOS PAO/Conciliacion mayo 2026.xlsx
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { parseDatafono } from "../src/lib/parsers/datafono";
import { parseAlegraTrans } from "../src/lib/parsers/alegra-trans";
import { parseDatafonoBanco } from "../src/lib/parsers/datafono-banco";

const PP = "C:/Users/Paola Agreda/OneDrive/Escritorio/PROYECTOS PAO";
const DIR = `${PP}/muestras-conciliacion/sistemas anteriores`;
const MC = `${PP}/muestras-conciliacion`;

const toDate = (v: any): string =>
  typeof v === "number"
    ? new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10)
    : String(v ?? "").trim();
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");

const TIENDAS = [
  { suc: "BQ", app: "B3", nombre: "Unicentro Norte", finLinux: "2026-04-29", refs: ["3235896844", "3138845101"], serieIni: "2026-04-25" },
  { suc: "Q9", app: "B2", nombre: "Unioccidente", finLinux: "2026-05-04", refs: ["3105543462"], serieIni: "2026-05-01" },
  { suc: "BD", app: "B1", nombre: "Plaza de las Américas", finLinux: "2026-05-05", refs: ["3102874360", "3015140002"], serieIni: "2026-05-01" },
  { suc: "D0", app: "JP", nombre: "Jardín Plaza", finLinux: "2026-05-27", refs: ["3172560775"], serieIni: "2026-05-16" },
];
const SERIE_FIN = "2026-06-07";

// ── Ventas Linux ─────────────────────────────────────────────────────────
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

// ── Alegra ───────────────────────────────────────────────────────────────
const alegra = parseAlegraTrans(fs.readFileSync(`${DIR}/Alegra - Reporte de transacciones - HABBIE SAS -.xlsx`));
const alEfe = new Map<string, number>(), alTar = new Map<string, number>(), alQr = new Map<string, number>(), alOtro = new Map<string, number>();
for (const s of alegra.sales) {
  if (!s.storeCode || s.date < "2026-04-25" || s.date > SERIE_FIN) continue;
  const k = `${s.storeCode}|${s.date}`;
  if (s.method === "EFECTIVO") alEfe.set(k, (alEfe.get(k) ?? 0) + s.amount);
  else if (s.method === "TARJETA_CREDITO" || s.method === "TARJETA_DEBITO") alTar.set(k, (alTar.get(k) ?? 0) + s.amount);
  else if (s.method === "TRANSFERENCIA") alQr.set(k, (alQr.get(k) ?? 0) + s.amount);
  else alOtro.set(k, (alOtro.get(k) ?? 0) + s.amount);
}

// ── Banco efectivo ───────────────────────────────────────────────────────
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

// ── Plink ────────────────────────────────────────────────────────────────
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

// ── QR banco (unión de todos los CSV 191, con dedupe) ────────────────────
const qrDia = new Map<string, number>();
const qrDiasConExtracto = new Set<string>();
{
  const files: string[] = [];
  const walk = (d: string) => {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) walk(p);
      else if (/^CSV_19100003911_.*\.csv$/i.test(f.name)) files.push(p);
    }
  };
  walk("C:/Users/Paola Agreda/Downloads");
  walk("C:/Users/PAOLAA~1/AppData/Local/Temp/claude/C--Users-Paola-Agreda/7720aa15-7adf-4037-a9b8-80a2e1315e28/scratchpad/csv191");
  const claves = new Set<string>();
  for (const f of files) {
    const out = parseDatafonoBanco(fs.readFileSync(f));
    const vistoLocal = new Map<string, number>();
    for (const q of out.qr) {
      const base = `${q.date}|${q.amount}|${q.payer}`;
      const n = (vistoLocal.get(base) ?? 0) + 1;
      vistoLocal.set(base, n);
      const clave = `${base}|${n}`;
      qrDiasConExtracto.add(q.date);
      if (claves.has(clave)) continue;
      claves.add(clave);
      qrDia.set(q.date, (qrDia.get(q.date) ?? 0) + q.amount);
    }
  }
}

// ── Estilos ──────────────────────────────────────────────────────────────
const VERDE = "FF3BA55D", VERDE_OSCURO = "FF2E7D46", VERDE_CLARO = "FFE6F4EA";
const ROJO = "FFFDE2E2", AMARILLO = "FFFFF4CC", GRIS = "FFF7F7F7";
const moneda = '#,##0;[Red]-#,##0';
const thin = { style: "thin" as const, color: { argb: "FFDDDDDD" } };
const borde = { top: thin, bottom: thin, left: thin, right: thin };
const wb = new ExcelJS.Workbook();

function celda(ws: ExcelJS.Worksheet, r: number, c: number, val: any, o: { money?: boolean; bold?: boolean; fill?: string; center?: boolean; size?: number; white?: boolean } = {}) {
  const cell = ws.getCell(r, c);
  cell.value = val;
  if (o.money) cell.numFmt = moneda;
  cell.font = { bold: !!o.bold, size: o.size ?? 10, color: o.white ? { argb: "FFFFFFFF" } : undefined };
  if (o.fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: o.fill } };
  cell.alignment = { horizontal: o.center ? "center" : o.money ? "right" : "left", vertical: "middle" };
  cell.border = borde;
  return cell;
}
function fillDif(dif: number): string | undefined {
  const a = Math.abs(dif);
  if (a >= 1000) return ROJO;
  if (a >= 500) return AMARILLO;
  return undefined;
}

// ══ Hoja por tienda ══════════════════════════════════════════════════════
const resumen: any[] = [];
for (const t of TIENDAS) {
  // serie EFE combinada con matcher flexible (idéntico a may-concilia.ts)
  const dias = new Map<string, number>();
  for (const [k, v] of linEfe) {
    const [s, d] = k.split("|");
    if (s === t.suc && d >= t.serieIni && d <= t.finLinux) dias.set(d, (dias.get(d) ?? 0) + v);
  }
  for (const [k, v] of alEfe) {
    const [s, d] = k.split("|");
    if (s === t.app && d >= t.serieIni && d <= SERIE_FIN) dias.set(d, (dias.get(d) ?? 0) + v);
  }
  const serie = [...dias.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, amount]) => ({ date, amount, usado: false, depFecha: "", depValor: 0, depDif: 0, cierraGrupo: false, grupo: [] as string[] }));
  const deps = bank
    .filter((b) => t.refs.includes(b.ref!) && b.date > t.serieIni && b.date <= "2026-06-08" && (t.suc !== "D0" || b.date >= "2026-05-16"))
    .sort((a, b) => a.date.localeCompare(b.date));
  const depsSinCalce: typeof deps = [];
  for (const dep of deps) {
    const cands = serie.map((x, i) => ({ ...x, i })).filter((x) => !x.usado && x.date < dep.date && Date.parse(dep.date) - Date.parse(x.date) <= 12 * 86400000);
    let hallado = false;
    for (let a = 0; a < cands.length && !hallado; a++) {
      let cum = 0;
      for (let b = a; b < Math.min(a + 7, cands.length); b++) {
        if (b > a && cands[b].i !== cands[b - 1].i + 1) break;
        cum += cands[b].amount;
        if (Math.abs(cum - dep.valor) <= 500) {
          const idxs = [];
          for (let m = a; m <= b; m++) { serie[cands[m].i].usado = true; idxs.push(cands[m].i); }
          const last = serie[idxs[idxs.length - 1]];
          last.cierraGrupo = true;
          last.depFecha = dep.date;
          last.depValor = dep.valor;
          last.depDif = dep.valor - cum;
          last.grupo = idxs.map((i) => serie[i].date.slice(8));
          hallado = true;
          break;
        }
        if (cum > dep.valor + 500) break;
      }
    }
    if (!hallado) depsSinCalce.push(dep);
  }
  // 2ª pasada: calce APROXIMADO — emparejar depósitos sueltos con la racha de
  // días sueltos que minimice la diferencia (se acepta hasta ±$600.000 y la
  // diferencia queda resaltada). Así cada día queda conciliado y la diferencia
  // visible, en vez de dejar ambos lados huérfanos.
  const depsHuerfanos: typeof deps = [];
  for (const dep of depsSinCalce) {
    const cands = serie.map((x, i) => ({ ...x, i })).filter((x) => !x.usado && x.date < dep.date && Date.parse(dep.date) - Date.parse(x.date) <= 12 * 86400000);
    let mejor: { idxs: number[]; dif: number } | null = null;
    for (let a = 0; a < cands.length; a++) {
      let cum = 0;
      const idxs: number[] = [];
      for (let b = a; b < Math.min(a + 7, cands.length); b++) {
        if (b > a && cands[b].i !== cands[b - 1].i + 1) break;
        cum += cands[b].amount;
        idxs.push(cands[b].i);
        const dif = dep.valor - cum;
        if (!mejor || Math.abs(dif) < Math.abs(mejor.dif)) mejor = { idxs: [...idxs], dif };
      }
    }
    if (mejor && Math.abs(mejor.dif) <= 600000) {
      for (const i of mejor.idxs) serie[i].usado = true;
      const last = serie[mejor.idxs[mejor.idxs.length - 1]];
      last.cierraGrupo = true;
      last.depFecha = dep.date;
      last.depValor = dep.valor;
      last.depDif = mejor.dif;
      last.grupo = mejor.idxs.map((i) => serie[i].date.slice(8));
    } else depsHuerfanos.push(dep);
  }
  depsSinCalce.length = 0;
  depsSinCalce.push(...depsHuerfanos);

  const ws = wb.addWorksheet(t.nombre, { views: [{ showGridLines: false, state: "frozen", ySplit: 4 }] });
  ws.columns = [{ width: 11 }, { width: 13 }, { width: 15 }, { width: 13 }, { width: 12 }, { width: 13 }, { width: 13 }, { width: 12 }, { width: 12 }, { width: 12 }];
  ws.mergeCells(1, 1, 1, 10);
  const cT = ws.getCell(1, 1);
  cT.value = `CONCILIACIÓN MAYO 2026 — ${t.nombre.toUpperCase()}`;
  cT.font = { bold: true, size: 13, color: { argb: "FFFFFFFF" } };
  cT.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
  ws.getRow(1).height = 24;
  ws.mergeCells(2, 1, 2, 10);
  ws.getCell(2, 1).value =
    "El banco consigna agrupando días (findes/festivos): el depósito aparece en la fila del último día que cubre. Amarillo: diferencia $500-$999 · Rojo: ≥ $1.000.";
  ws.getCell(2, 1).font = { italic: true, size: 9 };
  const H = ["Fecha", "Venta efectivo", "Depósito banco", "Días que cubre", "Dif. efectivo", "Venta tarjetas", "Recaudo Plink", "Dif. tarjetas", "Venta QR", "Otros medios"];
  H.forEach((h, i) => {
    const c = ws.getCell(4, i + 1);
    c.value = h;
    c.font = { bold: true, size: 9, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE_OSCURO } };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.border = borde;
  });
  ws.getRow(4).height = 26;

  let r = 5;
  let sumE = 0, sumDep = 0, sumT = 0, sumP = 0, sumQ = 0, sumO = 0;
  for (const x of serie) {
    if (x.date > "2026-05-31") continue; // la cola de junio solo participa del calce
    const esAbril = x.date < "2026-05-01";
    const lin = x.date <= t.finLinux ? (linTar.get(`${t.suc}|${x.date}`) ?? 0) : 0;
    const al = alTar.get(`${t.app}|${x.date}`) ?? 0;
    const vTar = lin + al;
    const p = plink.get(`${t.app}|${x.date}`) ?? 0;
    const difTar = vTar - p;
    const qr = alQr.get(`${t.app}|${x.date}`) ?? 0;
    const otro = alOtro.get(`${t.app}|${x.date}`) ?? 0;
    const difEfe = x.usado ? (x.cierraGrupo ? x.depDif : 0) : -x.amount;
    const base = esAbril ? GRIS : undefined;
    celda(ws, r, 1, x.date.slice(5) + (esAbril ? " (abr)" : ""), { center: true, fill: base });
    celda(ws, r, 2, x.amount, { money: true, fill: base });
    celda(ws, r, 3, x.cierraGrupo ? x.depValor : x.usado ? "↑ agrupado" : "SIN DEPÓSITO", { money: x.cierraGrupo, fill: x.usado ? base : ROJO, center: !x.cierraGrupo });
    celda(ws, r, 4, x.cierraGrupo ? x.grupo.join("+") : "", { center: true, fill: base });
    celda(ws, r, 5, difEfe, { money: true, fill: fillDif(difEfe) ?? base, bold: Math.abs(difEfe) >= 1000 });
    celda(ws, r, 6, vTar, { money: true, fill: base });
    celda(ws, r, 7, p, { money: true, fill: base });
    celda(ws, r, 8, difTar, { money: true, fill: fillDif(difTar) ?? base, bold: Math.abs(difTar) >= 1000 });
    celda(ws, r, 9, qr, { money: true, fill: base });
    celda(ws, r, 10, otro, { money: true, fill: base });
    if (!esAbril) { sumE += x.amount; sumT += vTar; sumP += p; sumQ += qr; sumO += otro; if (x.cierraGrupo) sumDep += x.depValor; }
    else if (x.cierraGrupo) sumDep += x.depValor;
    r++;
  }
  celda(ws, r, 1, "TOTAL MAYO", { bold: true, fill: VERDE_CLARO, center: true });
  celda(ws, r, 2, sumE, { money: true, bold: true, fill: VERDE_CLARO });
  celda(ws, r, 3, "", { fill: VERDE_CLARO });
  celda(ws, r, 4, "", { fill: VERDE_CLARO });
  celda(ws, r, 5, "", { fill: VERDE_CLARO });
  celda(ws, r, 6, sumT, { money: true, bold: true, fill: VERDE_CLARO });
  celda(ws, r, 7, sumP, { money: true, bold: true, fill: VERDE_CLARO });
  celda(ws, r, 8, sumT - sumP, { money: true, bold: true, fill: fillDif(sumT - sumP) ?? VERDE_CLARO });
  celda(ws, r, 9, sumQ, { money: true, bold: true, fill: VERDE_CLARO });
  celda(ws, r, 10, sumO, { money: true, bold: true, fill: VERDE_CLARO });
  r += 2;

  if (depsSinCalce.length) {
    ws.mergeCells(r, 1, r, 10);
    const c = ws.getCell(r, 1);
    c.value = "DEPÓSITOS DEL BANCO SIN CALCE EXACTO CON DÍAS DE VENTA";
    c.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF9CA3AF" } };
    r++;
    for (const d of depsSinCalce) {
      celda(ws, r, 1, d.date.slice(5), { center: true });
      celda(ws, r, 3, d.valor, { money: true, fill: AMARILLO });
      r++;
    }
  }

  const sinDep = serie.filter((x) => !x.usado && x.date <= "2026-05-31");
  resumen.push({
    tienda: t.nombre,
    efeVenta: sumE,
    efeSinDep: sinDep.reduce((s, x) => s + x.amount, 0),
    depsSinCalce: depsSinCalce.reduce((s, d) => s + d.valor, 0),
    tarVenta: sumT,
    plink: sumP,
    qr: sumQ,
    otros: sumO,
  });
}

// ══ Hoja QR empresa ══════════════════════════════════════════════════════
{
  const ws = wb.addWorksheet("QR (empresa)", { views: [{ showGridLines: false, state: "frozen", ySplit: 4 }] });
  ws.columns = [{ width: 11 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 12 }, { width: 14 }, { width: 14 }, { width: 13 }, { width: 22 }];
  ws.mergeCells(1, 1, 1, 9);
  const cT = ws.getCell(1, 1);
  cT.value = "QR BANCOLOMBIA MAYO 2026 — venta Alegra vs pagos QR del banco (cuenta 191, sin tienda)";
  cT.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
  cT.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
  ws.getRow(1).height = 24;
  const H = ["Fecha", "U. Norte", "Unioccidente", "Plaza", "J. Plaza", "Venta QR total", "Banco QR", "Diferencia", "Nota"];
  H.forEach((h, i) => {
    const c = ws.getCell(4, i + 1);
    c.value = h;
    c.font = { bold: true, size: 9, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE_OSCURO } };
    c.alignment = { horizontal: "center", vertical: "middle" };
    c.border = borde;
  });
  let r = 5;
  let sv = 0, sb = 0;
  for (let ts = Date.parse("2026-05-01T00:00:00Z"); ts <= Date.parse("2026-05-31T00:00:00Z"); ts += 86400000) {
    const d = new Date(ts).toISOString().slice(0, 10);
    const porT = TIENDAS.map((t) => alQr.get(`${t.app}|${d}`) ?? 0);
    const venta = porT.reduce((s, v) => s + v, 0);
    const banco = qrDia.get(d) ?? 0;
    // Los CSV 0702 y 0713 cubren 1-may → jul completo: un día de mayo sin filas
    // significa CERO pagos QR ese día, no extracto faltante.
    const sinExtracto = false;
    const dif = venta - banco;
    celda(ws, r, 1, d.slice(5), { center: true });
    porT.forEach((v, i) => celda(ws, r, 2 + i, v, { money: true }));
    celda(ws, r, 6, venta, { money: true });
    celda(ws, r, 7, sinExtracto ? "s/ext" : banco, { money: !sinExtracto, center: sinExtracto, fill: sinExtracto ? AMARILLO : undefined });
    celda(ws, r, 8, sinExtracto ? "" : dif, { money: true, fill: sinExtracto ? undefined : fillDif(dif), bold: Math.abs(dif) >= 1000 });
    celda(ws, r, 9, sinExtracto && venta > 0 ? "hay venta QR pero no hay extracto del día" : "");
    sv += venta;
    if (!sinExtracto) sb += banco;
    r++;
  }
  celda(ws, r, 1, "TOTAL", { bold: true, fill: VERDE_CLARO, center: true });
  celda(ws, r, 6, sv, { money: true, bold: true, fill: VERDE_CLARO });
  celda(ws, r, 7, sb, { money: true, bold: true, fill: VERDE_CLARO });
  celda(ws, r, 8, sv - sb, { money: true, bold: true, fill: fillDif(sv - sb) ?? VERDE_CLARO });
}

// ══ Hoja Resumen ═════════════════════════════════════════════════════════
{
  const ws = wb.addWorksheet("Resumen", { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 24 }, { width: 15 }, { width: 17 }, { width: 17 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 13 }, { width: 13 }];
  ws.mergeCells(1, 1, 1, 9);
  const cT = ws.getCell(1, 1);
  cT.value = "RESUMEN CONCILIACIÓN MAYO 2026 — HABBIE SAS";
  cT.font = { bold: true, size: 13, color: { argb: "FFFFFFFF" } };
  cT.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
  ws.getRow(1).height = 24;
  const H = ["Tienda", "Venta efectivo", "EFE sin depósito", "Depósitos sin calce", "Venta tarjetas", "Recaudo Plink", "Dif. tarjetas", "Venta QR", "Otros"];
  H.forEach((h, i) => {
    const c = ws.getCell(3, i + 1);
    c.value = h;
    c.font = { bold: true, size: 9, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE_OSCURO } };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.border = borde;
  });
  ws.getRow(3).height = 26;
  let r = 4;
  for (const x of resumen) {
    celda(ws, r, 1, x.tienda);
    celda(ws, r, 2, x.efeVenta, { money: true });
    celda(ws, r, 3, x.efeSinDep, { money: true, fill: fillDif(x.efeSinDep) });
    celda(ws, r, 4, x.depsSinCalce, { money: true, fill: x.depsSinCalce ? AMARILLO : undefined });
    celda(ws, r, 5, x.tarVenta, { money: true });
    celda(ws, r, 6, x.plink, { money: true });
    celda(ws, r, 7, x.tarVenta - x.plink, { money: true, fill: fillDif(x.tarVenta - x.plink) });
    celda(ws, r, 8, x.qr, { money: true });
    celda(ws, r, 9, x.otros, { money: true });
    r++;
  }
  r++;
  ws.mergeCells(r, 1, r, 9);
  ws.getCell(r, 1).value =
    "Notas: «EFE sin depósito» = días de venta que no calzaron con ningún depósito. «Depósitos sin calce» = plata que llegó al banco sin día de venta exacto (a favor mientras no se explique). Las diferencias de tarjetas de los primeros días de mayo (época Linux) corresponden al datafono de Natural Light y ya están en el cruce con NL. QR se concilia a nivel empresa porque el banco no indica la tienda.";
  ws.getCell(r, 1).alignment = { wrapText: true, vertical: "top" };
  ws.getCell(r, 1).font = { italic: true, size: 9 };
  ws.getRow(r).height = 56;
}

const out = `${PP}/Conciliacion mayo 2026.xlsx`;
wb.xlsx.writeFile(out).then(() => {
  console.log("Resumen por tienda:");
  for (const x of resumen)
    console.log(
      `   ${x.tienda.padEnd(24)} EFE ${fmt(x.efeVenta)} (sin dep ${fmt(x.efeSinDep)}, deps sin calce ${fmt(x.depsSinCalce)}) | TAR ${fmt(x.tarVenta)} vs Plink ${fmt(x.plink)} (dif ${fmt(x.tarVenta - x.plink)}) | QR ${fmt(x.qr)} | otros ${fmt(x.otros)}`,
    );
  console.log(`Excel: ${out}`);
});
