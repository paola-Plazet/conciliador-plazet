// CONCILIACIÓN JUNIO + JULIO (1→16) 2026 — día por día, tienda por tienda.
// Ventas: Alegra (jun 1 → jul 7) + Karrot allsales (jul 8 → 16).
// Banco EFE: hoja ALIANZA EFECTIVO (hasta 30-jun) + movimientos (42).xls (jul 1-16).
// Datafono: Plink jun + jul (0601-0630 y 0701-0716, máx entre archivos por día).
// QR: unión de todos los CSV 191. Genera 2 Excel (junio y julio) con el mismo
// formato del de mayo + hoja de tiendas online (NL / Shopify) en julio.
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { parseDatafono } from "../src/lib/parsers/datafono";
import { parseAlegraTrans } from "../src/lib/parsers/alegra-trans";
import { parseDatafonoBanco } from "../src/lib/parsers/datafono-banco";

const PP = "C:/Users/Paola Agreda/OneDrive/Escritorio/PROYECTOS PAO";
const MC = `${PP}/muestras-conciliacion`;
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
const toDate = (v: any): string => {
  if (typeof v === "number") return new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10);
  const s = String(v ?? "").trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : s;
};

const TIENDAS = [
  { app: "B3", karrot: "Unicentro Norte", nombre: "Unicentro Norte", refs: ["3235896844", "3138845101"] },
  { app: "B2", karrot: "Unicentro de Occidente", nombre: "Unioccidente", refs: ["3105543462"] },
  { app: "B1", karrot: "Plaza de las Americas", nombre: "Plaza de las Américas", refs: ["3102874360", "3015140002"] },
  { app: "JP", karrot: "Jardín Plaza", nombre: "Jardín Plaza", refs: ["3172560775"] },
];
const SERIE_INI = "2026-05-28"; // cola de mayo para que los depósitos de inicios de junio calcen
const SERIE_FIN = "2026-07-16";

// ── Ventas: Alegra (≤ 7-jul) ─────────────────────────────────────────────
const efe = new Map<string, number>(), tar = new Map<string, number>(), qrV = new Map<string, number>(), otro = new Map<string, number>();
const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
{
  const alegra = parseAlegraTrans(fs.readFileSync(`${MC}/sistemas anteriores/Alegra - Reporte de transacciones - HABBIE SAS -.xlsx`));
  for (const s of alegra.sales) {
    if (!s.storeCode || s.date < SERIE_INI || s.date > "2026-07-07") continue;
    const k = `${s.storeCode}|${s.date}`;
    if (s.method === "EFECTIVO") add(efe, k, s.amount);
    else if (s.method === "TARJETA_CREDITO" || s.method === "TARJETA_DEBITO") add(tar, k, s.amount);
    else if (s.method === "TRANSFERENCIA") add(qrV, k, s.amount);
    else if (!/ALIANZA|CREDIBANCO|CAJA MENOR/i.test(s.bodega)) add(otro, k, s.amount);
  }
}
// ── Ventas: Karrot allsales (≥ 8-jul), por Nombre Almacén ────────────────
const online = new Map<string, Map<string, number>>(); // `${tienda}|${fecha}` no aplica: usar `${tienda}|${fecha}|${metodo}`
const onlineVentas = new Map<string, number>(); // `${almacen}|${fecha}|${metodo}` -> venta
{
  const wbk = XLSX.read(fs.readFileSync(`${MC}/allsales-a2b47fd9-3c80-4506-8700-49c3de1b8966-20260716T234911269Z.xlsx`));
  const rows: any[][] = XLSX.utils.sheet_to_json(wbk.Sheets[wbk.SheetNames[0]], { header: 1 });
  const H = rows[0].map((c: any) => String(c ?? ""));
  const i = (n: string) => H.findIndex((h) => h === n);
  const iAlm = i("Nombre Almacén"), iMet = i("Método de Pago Principal"), iFecha = i("Fecha"), iVenta = i("Venta");
  const k2app = new Map(TIENDAS.map((t) => [t.karrot, t.app]));
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row[iFecha] == null) continue;
    const d = toDate(row[iFecha]);
    if (d < "2026-07-08" || d > SERIE_FIN) continue;
    const almacen = String(row[iAlm] ?? "").trim();
    const met = String(row[iMet] ?? "").trim();
    const v = Number(row[iVenta] ?? 0);
    if (!v) continue;
    const app = k2app.get(almacen);
    if (app) {
      const k = `${app}|${d}`;
      if (met === "Efectivo") add(efe, k, v);
      else if (met === "Datafono") add(tar, k, v);
      else if (met === "Transferencia") add(qrV, k, v);
      else add(otro, k, v); // Mercadopago / Pago Online / Bono / sin método
    } else {
      add(onlineVentas, `${almacen}|${d}|${met || "(sin método)"}`, v);
    }
  }
}

// ── Banco EFE: hoja ALIANZA + extracto julio ─────────────────────────────
interface Dep { date: string; valor: number; ref: string }
const bank: Dep[] = [];
{
  const sh = XLSX.readFile("C:/Users/Paola Agreda/OneDrive/Escritorio/conciliacion.xlsx").Sheets["ALIANZA EFECTIVO"];
  for (const r of XLSX.utils.sheet_to_json<any>(sh)) {
    const m = String(r["Concepto"] ?? "").match(/RECAUDO REFE:\s*(\d+)/);
    if (m) bank.push({ date: toDate(r["Fecha Tran"]), valor: Number(r["Valor"] ?? 0), ref: String(Number(m[1])) });
  }
  const rows: any[][] = XLSX.utils.sheet_to_json(XLSX.read(fs.readFileSync(`${MC}/movimientos_10030039979 (42).xls`)).Sheets["Page 1"], { header: 1 });
  for (const r of rows) {
    if (!r) continue;
    const concepto = String(r[2] ?? "");
    const m = concepto.match(/RECAUDO REFE:\s*(\d+)/);
    if (m) bank.push({ date: toDate(r[1]), valor: Number(r[4] ?? 0), ref: String(Number(m[1])) });
  }
}

// ── Plink jun+jul (máx entre archivos por tienda/día) ────────────────────
const plink = new Map<string, number>();
for (const f of [
  `${MC}/901987494_Reporte_Conciliar_20260601_20260630 (1).xlsx`,
  `${MC}/901987494_Reporte_Conciliar_20260701_20260716.xlsx`,
]) {
  const out = parseDatafono(fs.readFileSync(f));
  const perFile = new Map<string, number>();
  for (const e of out.entries) if (e.storeCode) add(perFile, `${e.storeCode}|${e.txDate}`, e.gross);
  for (const [k, v] of perFile) plink.set(k, Math.max(plink.get(k) ?? 0, v));
}

// ── QR banco (unión CSVs, dedupe) ────────────────────────────────────────
const qrDia = new Map<string, number>();
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
  walk(MC);
  const claves = new Set<string>();
  for (const f of files) {
    const out = parseDatafonoBanco(fs.readFileSync(f));
    const local = new Map<string, number>();
    for (const q of out.qr) {
      const base = `${q.date}|${q.amount}|${q.payer}`;
      const n = (local.get(base) ?? 0) + 1;
      local.set(base, n);
      const clave = `${base}|${n}`;
      if (claves.has(clave)) continue;
      claves.add(clave);
      add(qrDia, q.date, q.amount);
    }
  }
}

// ── Estilos ──────────────────────────────────────────────────────────────
const VERDE = "FF3BA55D", VERDE_OSCURO = "FF2E7D46", VERDE_CLARO = "FFE6F4EA";
const ROJO = "FFFDE2E2", AMARILLO = "FFFFF4CC", GRIS = "FFF7F7F7";
const moneda = '#,##0;[Red]-#,##0';
const thin = { style: "thin" as const, color: { argb: "FFDDDDDD" } };
const borde = { top: thin, bottom: thin, left: thin, right: thin };
function celda(ws: ExcelJS.Worksheet, r: number, c: number, val: any, o: { money?: boolean; bold?: boolean; fill?: string; center?: boolean } = {}) {
  const cell = ws.getCell(r, c);
  cell.value = val;
  if (o.money) cell.numFmt = moneda;
  cell.font = { bold: !!o.bold, size: 10 };
  if (o.fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: o.fill } };
  cell.alignment = { horizontal: o.center ? "center" : o.money ? "right" : "left", vertical: "middle" };
  cell.border = borde;
  return cell;
}
const fillDif = (d: number) => (Math.abs(d) >= 1000 ? ROJO : Math.abs(d) >= 500 ? AMARILLO : undefined);

// ── Matcher EFE continuo por tienda ──────────────────────────────────────
interface DiaEfe { date: string; amount: number; usado: boolean; cierraGrupo: boolean; depValor: number; depDif: number; grupo: string[] }
const seriePorTienda = new Map<string, DiaEfe[]>();
const huerfanosPorTienda = new Map<string, Dep[]>();
for (const t of TIENDAS) {
  const dias = new Map<string, number>();
  for (const [k, v] of efe) {
    const [s, d] = k.split("|");
    if (s === t.app) dias.set(d, (dias.get(d) ?? 0) + v);
  }
  const serie: DiaEfe[] = [...dias.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, amount]) => ({ date, amount, usado: false, cierraGrupo: false, depValor: 0, depDif: 0, grupo: [] }));
  const deps = bank.filter((b) => t.refs.includes(b.ref) && b.date > "2026-06-01" && b.date <= "2026-07-16").sort((a, b) => a.date.localeCompare(b.date));
  const intento = (dep: Dep, tolExacta: boolean): boolean => {
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
        if (tolExacta) {
          if (Math.abs(dif) <= 500) { mejor = { idxs: [...idxs], dif }; break; }
        } else if (!mejor || Math.abs(dif) < Math.abs(mejor.dif)) mejor = { idxs: [...idxs], dif };
      }
      if (tolExacta && mejor) break;
    }
    if (!mejor) return false;
    if (tolExacta && Math.abs(mejor.dif) > 500) return false;
    if (!tolExacta && Math.abs(mejor.dif) > 600000) return false;
    for (const i of mejor.idxs) serie[i].usado = true;
    const last = serie[mejor.idxs[mejor.idxs.length - 1]];
    last.cierraGrupo = true;
    last.depValor = dep.valor;
    last.depDif = mejor.dif;
    last.grupo = mejor.idxs.map((i) => serie[i].date.slice(8));
    return true;
  };
  const pend: Dep[] = [];
  for (const dep of deps) if (!intento(dep, true)) pend.push(dep);
  const huer: Dep[] = [];
  for (const dep of pend) if (!intento(dep, false)) huer.push(dep);
  seriePorTienda.set(t.app, serie);
  huerfanosPorTienda.set(t.app, huer);
}

// ── Generar Excel por mes ────────────────────────────────────────────────
async function generarMes(mesIni: string, mesFin: string, titulo: string, archivo: string, notaExtra: string) {
  const wb = new ExcelJS.Workbook();
  for (const t of TIENDAS) {
    const serie = seriePorTienda.get(t.app)!;
    const ws = wb.addWorksheet(t.nombre, { views: [{ showGridLines: false, state: "frozen", ySplit: 4 }] });
    ws.columns = [{ width: 12 }, { width: 13 }, { width: 15 }, { width: 14 }, { width: 12 }, { width: 13 }, { width: 13 }, { width: 12 }, { width: 12 }, { width: 13 }];
    ws.mergeCells(1, 1, 1, 10);
    const cT = ws.getCell(1, 1);
    cT.value = `${titulo} — ${t.nombre.toUpperCase()}`;
    cT.font = { bold: true, size: 13, color: { argb: "FFFFFFFF" } };
    cT.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
    ws.getRow(1).height = 24;
    ws.mergeCells(2, 1, 2, 10);
    ws.getCell(2, 1).value = `El depósito aparece en la fila del último día que cubre. Amarillo: dif $500-$999 · Rojo: ≥ $1.000. ${notaExtra}`;
    ws.getCell(2, 1).font = { italic: true, size: 9 };
    const H = ["Fecha", "Venta efectivo", "Depósito banco", "Días que cubre", "Dif. efectivo", "Venta tarjetas", "Recaudo Plink", "Dif. tarjetas", "Venta QR", "Otros (MP/online)"];
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
    let sumE = 0, sumT = 0, sumP = 0, sumQ = 0, sumO = 0;
    // filas: días del mes con venta o Plink; más días de cola previa que cierren grupo dentro del mes
    const fechasFila = new Set<string>();
    for (const x of serie) if (x.date >= mesIni && x.date <= mesFin) fechasFila.add(x.date);
    for (const [k] of tar) { const [s, d] = k.split("|"); if (s === t.app && d >= mesIni && d <= mesFin) fechasFila.add(d); }
    for (let ts = Date.parse(mesIni + "T00:00:00Z"); ts <= Date.parse(mesFin + "T00:00:00Z"); ts += 86400000) {
      const d = new Date(ts).toISOString().slice(0, 10);
      if (plink.get(`${t.app}|${d}`)) fechasFila.add(d);
    }
    for (const d of [...fechasFila].sort()) {
      const x = serie.find((s) => s.date === d);
      const vE = x?.amount ?? 0;
      const vT = tar.get(`${t.app}|${d}`) ?? 0;
      const p = plink.get(`${t.app}|${d}`) ?? 0;
      const difT = vT - p;
      const q = qrV.get(`${t.app}|${d}`) ?? 0;
      const o = otro.get(`${t.app}|${d}`) ?? 0;
      const difE = x ? (x.usado ? (x.cierraGrupo ? x.depDif : 0) : -x.amount) : 0;
      celda(ws, r, 1, d.slice(5), { center: true });
      celda(ws, r, 2, vE, { money: true });
      celda(ws, r, 3, x ? (x.cierraGrupo ? x.depValor : x.usado ? "↑ agrupado" : "SIN DEPÓSITO") : "", { money: !!x?.cierraGrupo, center: !x?.cierraGrupo, fill: x && !x.usado ? ROJO : undefined });
      celda(ws, r, 4, x?.cierraGrupo ? x.grupo.join("+") : "", { center: true });
      celda(ws, r, 5, difE, { money: true, fill: fillDif(difE), bold: Math.abs(difE) >= 1000 });
      celda(ws, r, 6, vT, { money: true });
      celda(ws, r, 7, p, { money: true });
      celda(ws, r, 8, difT, { money: true, fill: fillDif(difT), bold: Math.abs(difT) >= 1000 });
      celda(ws, r, 9, q, { money: true });
      celda(ws, r, 10, o, { money: true });
      sumE += vE; sumT += vT; sumP += p; sumQ += q; sumO += o;
      r++;
    }
    celda(ws, r, 1, "TOTAL", { bold: true, fill: VERDE_CLARO, center: true });
    celda(ws, r, 2, sumE, { money: true, bold: true, fill: VERDE_CLARO });
    for (let c = 3; c <= 5; c++) celda(ws, r, c, "", { fill: VERDE_CLARO });
    celda(ws, r, 6, sumT, { money: true, bold: true, fill: VERDE_CLARO });
    celda(ws, r, 7, sumP, { money: true, bold: true, fill: VERDE_CLARO });
    celda(ws, r, 8, sumT - sumP, { money: true, bold: true, fill: fillDif(sumT - sumP) ?? VERDE_CLARO });
    celda(ws, r, 9, sumQ, { money: true, bold: true, fill: VERDE_CLARO });
    celda(ws, r, 10, sumO, { money: true, bold: true, fill: VERDE_CLARO });
    r += 2;
    const huer = (huerfanosPorTienda.get(t.app) ?? []).filter((d) => d.date >= mesIni && d.date <= mesFin);
    if (huer.length) {
      ws.mergeCells(r, 1, r, 10);
      const c = ws.getCell(r, 1);
      c.value = "DEPÓSITOS DEL BANCO SIN CALCE";
      c.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF9CA3AF" } };
      r++;
      for (const d of huer) { celda(ws, r, 1, d.date.slice(5), { center: true }); celda(ws, r, 3, d.valor, { money: true, fill: AMARILLO }); r++; }
    }
  }
  // hoja QR empresa
  {
    const ws = wb.addWorksheet("QR (empresa)", { views: [{ showGridLines: false, state: "frozen", ySplit: 4 }] });
    ws.columns = [{ width: 11 }, { width: 14 }, { width: 14 }, { width: 13 }];
    ws.mergeCells(1, 1, 1, 4);
    const cT = ws.getCell(1, 1);
    cT.value = `QR BANCOLOMBIA — venta vs banco (${titulo.toLowerCase()})`;
    cT.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
    cT.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
    ["Fecha", "Venta QR total", "Banco QR", "Diferencia"].forEach((h, i) => {
      const c = ws.getCell(4, i + 1);
      c.value = h;
      c.font = { bold: true, size: 9, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE_OSCURO } };
      c.alignment = { horizontal: "center" };
      c.border = borde;
    });
    let r = 5, sv = 0, sb = 0;
    for (let ts = Date.parse(mesIni + "T00:00:00Z"); ts <= Date.parse(mesFin + "T00:00:00Z"); ts += 86400000) {
      const d = new Date(ts).toISOString().slice(0, 10);
      let venta = 0;
      for (const t of TIENDAS) venta += qrV.get(`${t.app}|${d}`) ?? 0;
      const banco = qrDia.get(d) ?? 0;
      const dif = venta - banco;
      celda(ws, r, 1, d.slice(5), { center: true });
      celda(ws, r, 2, venta, { money: true });
      celda(ws, r, 3, banco, { money: true });
      celda(ws, r, 4, dif, { money: true, fill: fillDif(dif), bold: Math.abs(dif) >= 1000 });
      sv += venta; sb += banco;
      r++;
    }
    celda(ws, r, 1, "TOTAL", { bold: true, fill: VERDE_CLARO, center: true });
    celda(ws, r, 2, sv, { money: true, bold: true, fill: VERDE_CLARO });
    celda(ws, r, 3, sb, { money: true, bold: true, fill: VERDE_CLARO });
    celda(ws, r, 4, sv - sb, { money: true, bold: true, fill: fillDif(sv - sb) ?? VERDE_CLARO });
  }
  // hoja tiendas online (solo si hay datos en el rango)
  const onlineRows = [...onlineVentas.entries()].filter(([k]) => { const d = k.split("|")[1]; return d >= mesIni && d <= mesFin; }).sort();
  if (onlineRows.length) {
    const ws = wb.addWorksheet("Tiendas online", { views: [{ showGridLines: false }] });
    ws.columns = [{ width: 16 }, { width: 11 }, { width: 16 }, { width: 13 }];
    ws.mergeCells(1, 1, 1, 4);
    const cT = ws.getCell(1, 1);
    cT.value = "TIENDAS ONLINE (Karrot): NL y Tienda Shopify — ventas por día y método (pendiente cruzar vs Mercadopago/Addi)";
    cT.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
    cT.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
    ["Tienda", "Fecha", "Método", "Venta"].forEach((h, i) => {
      const c = ws.getCell(3, i + 1);
      c.value = h;
      c.font = { bold: true, size: 9, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE_OSCURO } };
      c.border = borde;
    });
    let r = 4, tot = 0;
    for (const [k, v] of onlineRows) {
      const [alm, d, met] = k.split("|");
      celda(ws, r, 1, alm);
      celda(ws, r, 2, d.slice(5), { center: true });
      celda(ws, r, 3, met);
      celda(ws, r, 4, v, { money: true });
      tot += v;
      r++;
    }
    celda(ws, r, 1, "TOTAL", { bold: true, fill: VERDE_CLARO });
    celda(ws, r, 4, tot, { money: true, bold: true, fill: VERDE_CLARO });
  }
  const out = `${PP}/${archivo}`;
  await wb.xlsx.writeFile(out);
  console.log(`Excel: ${out}`);
}

async function main() {
  await generarMes("2026-06-01", "2026-06-30", "CONCILIACIÓN JUNIO 2026", "Conciliacion junio 2026.xlsx", "");
  await generarMes("2026-07-01", "2026-07-16", "CONCILIACIÓN JULIO 2026 (1 → 16)", "Conciliacion julio 2026.xlsx", "Ventas: Alegra hasta 7-jul y Karrot desde 8-jul. Plink llega al 15-jul.");
  // resumen consola
  for (const t of TIENDAS) {
    const serie = seriePorTienda.get(t.app)!;
    const sinDep = serie.filter((x) => !x.usado && x.date >= "2026-06-01");
    const huer = huerfanosPorTienda.get(t.app) ?? [];
    console.log(`${t.nombre.padEnd(24)} días sin depósito: ${sinDep.length ? sinDep.map((x) => `${x.date.slice(5)} ${fmt(x.amount)}`).join(", ") : "ninguno"} | deps huérfanos: ${huer.length ? huer.map((d) => `${d.date.slice(5)} ${fmt(d.valor)}`).join(", ") : "ninguno"}`);
  }
}
main();
