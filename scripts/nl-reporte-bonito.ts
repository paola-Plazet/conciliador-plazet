// REPORTE FORMAL PARA NATURAL LIGHT — versión con formato (exceljs):
// títulos, tablas con encabezados verdes, bordes, moneda, subtotales en negrita.
// Genera: PROYECTOS PAO/Cruce Habbie - Natural Light.xlsx (reemplaza el plano)
import fs from "node:fs";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { parseDatafono } from "../src/lib/parsers/datafono";
import { parseAlegraTrans } from "../src/lib/parsers/alegra-trans";

const PP = "C:/Users/Paola Agreda/OneDrive/Escritorio/PROYECTOS PAO";
const DIR = `${PP}/muestras-conciliacion/sistemas anteriores`;
const MC = `${PP}/muestras-conciliacion`;
const CTA_HABBIE = "100300399792";

const CORTE: Record<string, string> = { BQ: "2026-04-16", Q9: "2026-04-16", BD: "2026-04-16", D0: "2026-05-16" };
const FIN_LINUX: Record<string, string> = { BQ: "2026-04-29", Q9: "2026-05-04", BD: "2026-05-05", D0: "2026-05-27" };
const NOMBRE: Record<string, string> = {
  BQ: "Unicentro Norte", Q9: "Unioccidente", BD: "Plaza de las Américas", D0: "Jardín Plaza",
  BB: "Éxito Occidente", BC: "Viva Envigado", BF: "Éxito Sabana", BJ: "Éxito San Pedro", BM: "Unicentro Cali",
};
const SUC2PLINK: Record<string, string> = { BD: "B1", Q9: "B2", BQ: "B3", D0: "JP" };

const toDate = (v: any): string =>
  typeof v === "number"
    ? new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10)
    : String(v ?? "").trim();

// ── Datos (idéntico a nl-reporte-excel.ts) ───────────────────────────────
const ventas: any[] = XLSX.utils.sheet_to_json(XLSX.readFile(`${DIR}/ventaSabmyju.xlsx`).Sheets["ventaSabmyju"]);
const tarDia = new Map<string, number>();
for (const r of ventas) {
  const suc = String(r.SUC ?? "").trim();
  const d = toDate(r.FECHA);
  const t = Number(r.TAR ?? 0);
  if (suc && d && t) tarDia.set(`${suc}|${d}`, (tarDia.get(`${suc}|${d}`) ?? 0) + t);
}
// Las ventas facturadas por Alegra durante la transición entraron a datafonos
// PROPIOS (incluido el terminal 31014111 "Principal" el 1-may) — NO se le
// cobran a NL. Lo que sí entra: las ventas Rappi (Alegra, may-jun), que las
// pagó la plataforma a cuentas de Natural Light.
const alegra = parseAlegraTrans(fs.readFileSync(`${DIR}/Alegra - Reporte de transacciones - HABBIE SAS -.xlsx`));
let rappiMay = 0, rappiJun = 0;
for (const s of alegra.sales) {
  if (s.method === "OTRO" && /RAPPI/i.test(s.bodega)) {
    if (s.date >= "2026-05-01" && s.date <= "2026-05-31") rappiMay += s.amount;
    if (s.date >= "2026-06-01" && s.date <= "2026-06-30") rappiJun += s.amount;
  }
}

const consigs: any[] = XLSX.utils.sheet_to_json(XLSX.readFile(`${DIR}/consignaciones linux.xlsx`).Sheets["consign"]);
const cons = consigs
  .map((r) => {
    const keys = Object.keys(r);
    const get = (pat: RegExp) => { const k = keys.find((k) => pat.test(k)); return k ? r[k] : undefined; };
    return {
      suc: String(get(/^SU$/i) ?? "").trim(),
      fecVenta: toDate(get(/VENTA/i)),
      fecConsig: toDate(get(/FEC.?CONSIG/i)),
      vlr: Number(get(/VLR/i) ?? 0),
      cuenta: String(get(/CUENTA/i) ?? "").trim(),
      doc: String(get(/DOC/i) ?? "").trim(),
    };
  })
  .filter((c) => c.suc && c.vlr);
const plink = new Map<string, number>();
for (const f of [
  `${MC}/901987494_Reporte_Conciliar_20260401_20260430.xlsx`,
  `${MC}/901987494_Reporte_Conciliar_20260501_20260531.xlsx`,
]) {
  const out = parseDatafono(fs.readFileSync(f));
  for (const e of out.entries) {
    if (!e.storeCode) continue;
    const k = `${e.storeCode}|${e.txDate}`;
    plink.set(k, (plink.get(k) ?? 0) + e.gross);
  }
}
const bRows: any[] = XLSX.utils.sheet_to_json(
  XLSX.readFile("C:/Users/Paola Agreda/OneDrive/Escritorio/conciliacion.xlsx").Sheets["ALIANZA EFECTIVO"],
);
const bank = bRows.map((r) => ({
  date: toDate(r["Fecha Tran"]),
  valor: Number(r["Valor"] ?? 0),
  ref: String(r["Concepto"] ?? "").match(/RECAUDO REFE:\s*(\d+)/)?.[1],
}));
const bankByRef = (ref: string, hasta?: string) =>
  bank.filter((b) => b.ref && String(Number(b.ref)) === ref && (!hasta || b.date < hasta)).reduce((s, b) => s + b.valor, 0);

// ── Estilos ──────────────────────────────────────────────────────────────
const VERDE = "FF3BA55D";
const VERDE_OSCURO = "FF2E7D46";
const VERDE_CLARO = "FFE6F4EA";
const GRIS = "FFF3F4F6";
const moneda = '#,##0;[Red]-#,##0';
const thin = { style: "thin" as const, color: { argb: "FFCCCCCC" } };
const borde = { top: thin, bottom: thin, left: thin, right: thin };

const wb = new ExcelJS.Workbook();
wb.creator = "HABBIE SAS";

function titulo(ws: ExcelJS.Worksheet, row: number, texto: string, cols: number, argb = VERDE, size = 12) {
  ws.mergeCells(row, 1, row, cols);
  const c = ws.getCell(row, 1);
  c.value = texto;
  c.font = { bold: true, size, color: { argb: "FFFFFFFF" } };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
  c.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(row).height = size >= 14 ? 26 : 20;
}
function encabezado(ws: ExcelJS.Worksheet, row: number, headers: string[]) {
  headers.forEach((h, i) => {
    const c = ws.getCell(row, i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE_OSCURO } };
    c.alignment = { horizontal: i === 0 ? "left" : "center", vertical: "middle", wrapText: true };
    c.border = borde;
  });
  ws.getRow(row).height = 24;
}
function celda(ws: ExcelJS.Worksheet, row: number, col: number, val: any, opts: { money?: boolean; bold?: boolean; fill?: string; align?: "left" | "right" | "center" } = {}) {
  const c = ws.getCell(row, col);
  c.value = val;
  if (opts.money) c.numFmt = moneda;
  c.font = { bold: !!opts.bold, size: 10 };
  if (opts.fill) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: opts.fill } };
  c.alignment = { horizontal: opts.align ?? (opts.money ? "right" : "left"), vertical: "middle" };
  c.border = borde;
  return c;
}

// ══ Cálculos ═════════════════════════════════════════════════════════════
interface DiaTar { suc: string; d: string; t: number; p: number; nl: number }
const diasTar: DiaTar[] = [];
const bPorTienda: Record<string, number> = {};
for (const suc of Object.keys(CORTE)) {
  let sub = 0;
  for (let ts = Date.parse(CORTE[suc] + "T00:00:00Z"); ; ts += 86400000) {
    const d = new Date(ts).toISOString().slice(0, 10);
    if (d > FIN_LINUX[suc]) break;
    const t = tarDia.get(`${suc}|${d}`) ?? 0;
    if (!t) continue;
    const p = Math.min(t, plink.get(`${SUC2PLINK[suc]}|${d}`) ?? 0);
    diasTar.push({ suc, d, t, p, nl: t - p });
    sub += t - p;
  }
  bPorTienda[suc] = sub;
}
const B = Object.values(bPorTienda).reduce((s, v) => s + v, 0);

const preCorte = Object.keys(CORTE).flatMap((suc) =>
  cons
    .filter((c) => c.suc === suc && c.cuenta === CTA_HABBIE && c.fecVenta < CORTE[suc])
    .sort((a, b) => a.fecVenta.localeCompare(b.fecVenta)),
);
const a1PorTienda: Record<string, number> = {};
for (const c of preCorte) a1PorTienda[c.suc] = (a1PorTienda[c.suc] ?? 0) + c.vlr;
const a1 = Object.values(a1PorTienda).reduce((s, v) => s + v, 0);

const cerradas: [string, string, number][] = [
  ["BJ", "Depósitos en banco con referencia de recaudo 3111234598 (11 movimientos, abril)", bankByRef("3111234598")],
  ["BF", "Depósitos en banco con referencia de recaudo 3203518392 (12 movimientos, abril)", bankByRef("3203518392")],
  ["BM", "Depósitos en banco, referencias 3165476343 y 3172560775 hasta el 15-may (20 movimientos)", bankByRef("3165476343") + bankByRef("3172560775", "2026-05-16")],
  ["BB", "Devolución de la cuenta de recaudo propia de Éxito Occidente (20-abr-2026)", 3842765],
  ["BC", "10 aportes Bancolombia al encargo, ventas del 6 al 16 de abril (verificados en extracto)", 1010065],
];
const a2 = cerradas.reduce((s, [, , v]) => s + v, 0);
const A = a1 + a2;
const RAPPI = rappiMay + rappiJun;
const Btotal = B + RAPPI;
const R1 = 22000000, R2 = 10976384, R = R1 + R2;
const neto = Btotal - A - R;

// ══ HOJA 1: RESUMEN ══════════════════════════════════════════════════════
{
  const ws = wb.addWorksheet("Resumen", { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 66 }, { width: 18 }];
  titulo(ws, 1, "CRUCE DE CUENTAS", 2, VERDE, 16);
  titulo(ws, 2, "HABBIE SAS (NIT 901614877-1)  ↔  COMERCIALIZADORA NATURAL LIGHT SA", 2, VERDE, 12);
  ws.mergeCells(3, 1, 3, 2);
  ws.getCell(3, 1).value = "Período: abril – mayo de 2026 (facturación por sistema Linux)   ·   Fecha del reporte: 14 de julio de 2026";
  ws.getCell(3, 1).font = { italic: true, size: 10 };
  ws.mergeCells(5, 1, 5, 2);
  ws.getCell(5, 1).value =
    "Regla del cruce: las ventas de Unicentro Norte, Unioccidente y Plaza de las Américas pertenecen a HABBIE desde el 16-abr-2026 y las de Jardín Plaza desde el 16-may-2026. Las ventas anteriores a esas fechas y todas las de las tiendas cerradas (Éxito Occidente, Viva Envigado, Éxito Sabana, Éxito San Pedro y Unicentro Cali) pertenecen a NATURAL LIGHT.";
  ws.getCell(5, 1).alignment = { wrapText: true, vertical: "top" };
  ws.getCell(5, 1).font = { size: 10 };
  ws.getRow(5).height = 44;

  let r = 7;
  titulo(ws, r++, "1. VENTAS DE TIENDAS HABBIE RECAUDADAS POR NATURAL LIGHT (a favor de Habbie)", 2, VERDE_OSCURO, 11);
  const filasB: [string, number][] = [
    ["Tarjetas Unicentro Norte (16 → 29 abril)", bPorTienda.BQ],
    ["Tarjetas Unioccidente (16 abril → 4 mayo)", bPorTienda.Q9],
    ["Tarjetas Plaza de las Américas (16 abril → 5 mayo)", bPorTienda.BD],
    ["Tarjetas Jardín Plaza (18 y 19 de mayo)", bPorTienda.D0],
    ["Ventas Rappi de mayo (pagadas a Natural Light)", rappiMay],
    ["Ventas Rappi de junio (pagadas a Natural Light)", rappiJun],
  ];
  for (const [t, v] of filasB) { celda(ws, r, 1, t); celda(ws, r, 2, v, { money: true }); r++; }
  celda(ws, r, 1, "Subtotal a favor de Habbie", { bold: true, fill: VERDE_CLARO });
  celda(ws, r, 2, Btotal, { money: true, bold: true, fill: VERDE_CLARO }); r += 2;

  titulo(ws, r++, "2. EFECTIVO DE NATURAL LIGHT RECIBIDO EN LA CUENTA DE HABBIE (a favor de Natural Light)", 2, VERDE_OSCURO, 11);
  const filasA: [string, number][] = [
    ["Ventas anteriores al corte — Unicentro Norte", a1PorTienda.BQ ?? 0],
    ["Ventas anteriores al corte — Unioccidente", a1PorTienda.Q9 ?? 0],
    ["Ventas anteriores al corte — Plaza de las Américas", a1PorTienda.BD ?? 0],
    ["Éxito San Pedro", cerradas[0][2]],
    ["Éxito Sabana", cerradas[1][2]],
    ["Unicentro Cali", cerradas[2][2]],
    ["Éxito Occidente (devolución de su cuenta de recaudo)", cerradas[3][2]],
    ["Viva Envigado (ventas 6 → 16 de abril)", cerradas[4][2]],
  ];
  for (const [t, v] of filasA) { celda(ws, r, 1, t); celda(ws, r, 2, v, { money: true }); r++; }
  celda(ws, r, 1, "Subtotal a favor de Natural Light", { bold: true, fill: VERDE_CLARO });
  celda(ws, r, 2, A, { money: true, bold: true, fill: VERDE_CLARO }); r += 2;

  titulo(ws, r++, "3. GIROS YA REALIZADOS POR NATURAL LIGHT A HABBIE", 2, VERDE_OSCURO, 11);
  celda(ws, r, 1, "Transferencia del 16-abr-2026"); celda(ws, r, 2, R1, { money: true }); r++;
  celda(ws, r, 1, "Transferencia del 24-abr-2026"); celda(ws, r, 2, R2, { money: true }); r++;
  celda(ws, r, 1, "Subtotal girado", { bold: true, fill: VERDE_CLARO });
  celda(ws, r, 2, R, { money: true, bold: true, fill: VERDE_CLARO }); r += 2;

  ws.mergeCells(r, 1, r, 1);
  const cSaldo = celda(ws, r, 1, "SALDO NETO DEL CRUCE  =  (1) − (2) − (3)", { bold: true, fill: VERDE });
  cSaldo.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
  const cVal = celda(ws, r, 2, neto, { money: true, bold: true, fill: VERDE });
  cVal.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
  ws.getRow(r).height = 24; r++;
  ws.mergeCells(r, 1, r, 2);
  ws.getCell(r, 1).value =
    neto < 0
      ? `RESULTADO: saldo a favor de NATURAL LIGHT por $${Math.abs(neto).toLocaleString("es-CO")}`
      : `RESULTADO: saldo a favor de HABBIE por $${neto.toLocaleString("es-CO")}`;
  ws.getCell(r, 1).font = { bold: true, size: 11 };
  r += 2;

  titulo(ws, r++, "MOVIMIENTOS QUE NO HACEN PARTE DE ESTE CRUCE", 2, "FF9CA3AF", 10);
  for (const nota of [
    "Transferencias de Natural Light del 21-abr ($31.000.000) y 24-abr ($10.000.000): otro concepto.",
    "Transferencia del 23-jun ($2.904.813): pago de factura de producto vendido por Habbie a Natural Light.",
    "Ventas de Viva Envigado del 1 al 5 de abril ($1.215.000): consignadas a la cuenta de Natural Light.",
    "Efectivo de Viva Envigado del 17-18 abril ($73.150) y de Éxito Sabana del 9-abril ($64.450): no recibidos por Habbie.",
  ]) {
    ws.mergeCells(r, 1, r, 2);
    ws.getCell(r, 1).value = "• " + nota;
    ws.getCell(r, 1).font = { size: 9.5 };
    r++;
  }
  r++;
  ws.mergeCells(r, 1, r, 2);
  ws.getCell(r, 1).value =
    "Soportes: hoja «Detalle tarjetas» (venta diaria con tarjeta vs recaudo de cada datafono, verificada contra los reportes de la pasarela Plink de Habbie) y hoja «Detalle efectivo» (consignación por consignación, verificadas contra el extracto del encargo fiduciario de Habbie en Alianza).";
  ws.getCell(r, 1).alignment = { wrapText: true, vertical: "top" };
  ws.getCell(r, 1).font = { italic: true, size: 9.5 };
  ws.getRow(r).height = 40;
}

// ══ HOJA 2: DETALLE TARJETAS ═════════════════════════════════════════════
{
  const ws = wb.addWorksheet("Detalle tarjetas", { views: [{ showGridLines: false, state: "frozen", ySplit: 4 }] });
  ws.columns = [{ width: 26 }, { width: 13 }, { width: 19 }, { width: 21 }, { width: 24 }];
  titulo(ws, 1, "DETALLE TARJETAS — ventas con tarjeta facturadas por Linux desde la fecha de corte de cada tienda", 5, VERDE, 12);
  ws.mergeCells(2, 1, 2, 5);
  ws.getCell(2, 1).value =
    "«Recaudó datafono Habbie» = verificado en los reportes Plink de Habbie SAS. La diferencia la recaudó el datafono de Natural Light.";
  ws.getCell(2, 1).font = { italic: true, size: 9.5 };
  encabezado(ws, 4, ["Tienda", "Fecha", "Venta tarjetas (Linux)", "Recaudó datafono Habbie", "Recaudó datafono Natural Light"]);
  let r = 5;
  for (const suc of Object.keys(CORTE)) {
    const dias = diasTar.filter((x) => x.suc === suc);
    let alt = false;
    for (const x of dias) {
      const fill = alt ? GRIS : undefined;
      celda(ws, r, 1, NOMBRE[suc], { fill });
      celda(ws, r, 2, x.d, { fill, align: "center" });
      celda(ws, r, 3, x.t, { money: true, fill });
      celda(ws, r, 4, x.p, { money: true, fill });
      celda(ws, r, 5, x.nl, { money: true, fill });
      alt = !alt;
      r++;
    }
    celda(ws, r, 1, `Subtotal ${NOMBRE[suc]}`, { bold: true, fill: VERDE_CLARO });
    celda(ws, r, 2, "", { fill: VERDE_CLARO });
    celda(ws, r, 3, dias.reduce((s, x) => s + x.t, 0), { money: true, bold: true, fill: VERDE_CLARO });
    celda(ws, r, 4, dias.reduce((s, x) => s + x.p, 0), { money: true, bold: true, fill: VERDE_CLARO });
    celda(ws, r, 5, dias.reduce((s, x) => s + x.nl, 0), { money: true, bold: true, fill: VERDE_CLARO });
    r += 2;
  }
  const cT = celda(ws, r, 1, "TOTAL RECAUDADO POR DATAFONO NATURAL LIGHT", { bold: true, fill: VERDE });
  cT.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
  ws.mergeCells(r, 1, r, 4);
  const cV = celda(ws, r, 5, B, { money: true, bold: true, fill: VERDE });
  cV.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
}

// ══ HOJA 3: DETALLE EFECTIVO ═════════════════════════════════════════════
{
  const ws = wb.addWorksheet("Detalle efectivo", { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 26 }, { width: 14 }, { width: 16 }, { width: 12 }, { width: 15 }];
  titulo(ws, 1, "DETALLE EFECTIVO — dinero en efectivo que entró a la cuenta de Habbie y corresponde a Natural Light", 5, VERDE, 12);
  let r = 3;
  titulo(ws, r++, "1. VENTAS ANTERIORES AL CORTE (consignaciones a la cuenta de Habbie 100300399792)", 5, VERDE_OSCURO, 10.5);
  encabezado(ws, r++, ["Tienda", "Fecha venta", "Fecha consignación", "Documento", "Valor"]);
  for (const suc of Object.keys(CORTE)) {
    const rows = preCorte.filter((c) => c.suc === suc);
    if (!rows.length) continue;
    let alt = false;
    for (const c of rows) {
      const fill = alt ? GRIS : undefined;
      celda(ws, r, 1, NOMBRE[suc], { fill });
      celda(ws, r, 2, c.fecVenta, { fill, align: "center" });
      celda(ws, r, 3, c.fecConsig, { fill, align: "center" });
      celda(ws, r, 4, c.doc, { fill, align: "center" });
      celda(ws, r, 5, c.vlr, { money: true, fill });
      alt = !alt;
      r++;
    }
    celda(ws, r, 1, `Subtotal ${NOMBRE[suc]}`, { bold: true, fill: VERDE_CLARO });
    for (let i = 2; i <= 4; i++) celda(ws, r, i, "", { fill: VERDE_CLARO });
    celda(ws, r, 5, a1PorTienda[suc], { money: true, bold: true, fill: VERDE_CLARO });
    r++;
  }
  celda(ws, r, 1, "SUBTOTAL VENTAS ANTERIORES AL CORTE", { bold: true, fill: VERDE_CLARO });
  ws.mergeCells(r, 1, r, 4);
  celda(ws, r, 5, a1, { money: true, bold: true, fill: VERDE_CLARO });
  r += 2;

  titulo(ws, r++, "2. EFECTIVO DE TIENDAS CERRADAS RECIBIDO POR HABBIE", 5, VERDE_OSCURO, 10.5);
  encabezado(ws, r++, ["Tienda", "Detalle", "", "", "Valor"]);
  let alt = false;
  for (const [suc, det, v] of cerradas) {
    const fill = alt ? GRIS : undefined;
    celda(ws, r, 1, NOMBRE[suc], { fill });
    ws.mergeCells(r, 2, r, 4);
    const cd = celda(ws, r, 2, det, { fill });
    cd.alignment = { wrapText: true, vertical: "middle" };
    celda(ws, r, 5, v, { money: true, fill });
    ws.getRow(r).height = 26;
    alt = !alt;
    r++;
  }
  celda(ws, r, 1, "SUBTOTAL TIENDAS CERRADAS", { bold: true, fill: VERDE_CLARO });
  ws.mergeCells(r, 1, r, 4);
  celda(ws, r, 5, a2, { money: true, bold: true, fill: VERDE_CLARO });
  r += 2;

  const cT = celda(ws, r, 1, "TOTAL EFECTIVO A FAVOR DE NATURAL LIGHT", { bold: true, fill: VERDE });
  cT.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
  ws.mergeCells(r, 1, r, 4);
  const cV = celda(ws, r, 5, A, { money: true, bold: true, fill: VERDE });
  cV.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
}

// ══ Guardar ══════════════════════════════════════════════════════════════
const out = `${PP}/Cruce Habbie - Natural Light.xlsx`;
wb.xlsx.writeFile(out).then(() => {
  const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
  console.log(`B ${fmt(Btotal)} (tarjetas ${fmt(B)} + Rappi ${fmt(RAPPI)}) | A ${fmt(A)} | R ${fmt(R)} | NETO ${fmt(neto)}`);
  console.log(`Excel con formato: ${out}`);
});
