// REPORTE FORMAL PARA NATURAL LIGHT — Excel de 3 hojas:
//   1. Resumen del cruce (saldo neto con la regla del 16-abr / JP 16-may)
//   2. Detalle tarjetas (día a día: venta TAR Linux vs datafono Habbie vs datafono NL)
//   3. Detalle efectivo (consignaciones pre-corte + efectivo de tiendas cerradas)
// Genera: PROYECTOS PAO/Cruce Habbie - Natural Light.xlsx
import fs from "node:fs";
import * as XLSX from "xlsx";
import { parseDatafono } from "../src/lib/parsers/datafono";

const PP = "C:/Users/Paola Agreda/OneDrive/Escritorio/PROYECTOS PAO";
const DIR = `${PP}/muestras-conciliacion/sistemas anteriores`;
const MC = `${PP}/muestras-conciliacion`;
const CTA_HABBIE = "100300399792";

const CORTE: Record<string, string> = {
  BQ: "2026-04-16",
  Q9: "2026-04-16",
  BD: "2026-04-16",
  D0: "2026-05-16",
};
const FIN_LINUX: Record<string, string> = {
  BQ: "2026-04-29",
  Q9: "2026-05-04",
  BD: "2026-05-05",
  D0: "2026-05-27",
};
const NOMBRE: Record<string, string> = {
  BQ: "Unicentro Norte",
  Q9: "Unioccidente",
  BD: "Plaza de las Américas",
  D0: "Jardín Plaza",
  BB: "Éxito Occidente",
  BC: "Viva Envigado",
  BF: "Éxito Sabana",
  BJ: "Éxito San Pedro",
  BM: "Unicentro Cali",
};
const SUC2PLINK: Record<string, string> = { BD: "B1", Q9: "B2", BQ: "B3", D0: "JP" };

const toDate = (v: any): string =>
  typeof v === "number"
    ? new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10)
    : String(v ?? "").trim();

// ── Datos ────────────────────────────────────────────────────────────────
const ventas: any[] = XLSX.utils.sheet_to_json(
  XLSX.readFile(`${DIR}/ventaSabmyju.xlsx`).Sheets["ventaSabmyju"],
);
const tarDia = new Map<string, number>(); // `${suc}|${d}`
for (const r of ventas) {
  const suc = String(r.SUC ?? "").trim();
  const d = toDate(r.FECHA);
  const t = Number(r.TAR ?? 0);
  if (!suc || !d || !t) continue;
  tarDia.set(`${suc}|${d}`, (tarDia.get(`${suc}|${d}`) ?? 0) + t);
}

const consigs: any[] = XLSX.utils.sheet_to_json(
  XLSX.readFile(`${DIR}/consignaciones linux.xlsx`).Sheets["consign"],
);
interface Consig { suc: string; fecVenta: string; fecConsig: string; vlr: number; cuenta: string; doc: string }
const cons: Consig[] = consigs
  .map((r) => {
    const keys = Object.keys(r);
    const get = (pat: RegExp) => { const k = keys.find((k) => pat.test(k)); return k ? r[k] : undefined; };
    return {
      suc: String(get(/^SU$/i) ?? "").trim(),
      fecVenta: toDate(get(/VENTA/i)),
      fecConsig: toDate(get(/CONSIG$/i) ?? get(/FEC.?CONSIG/i)),
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
  bank.filter((b) => b.ref && String(Number(b.ref)) === ref && (!hasta || b.date < hasta));

// ══ Hoja 2: Detalle tarjetas ═════════════════════════════════════════════
const tarjRows: any[][] = [
  ["DETALLE TARJETAS — Ventas con tarjeta facturadas por Linux desde la fecha de corte de cada tienda"],
  ["La columna 'Datafono Habbie' es el recaudo verificado en los reportes Plink de Habbie SAS. La diferencia fue recaudada por el datafono de Natural Light."],
  [],
  ["Tienda", "Fecha", "Venta tarjetas (Linux)", "Recaudó datafono Habbie", "Recaudó datafono Natural Light"],
];
let Btot = 0;
const bPorTienda: Record<string, number> = {};
for (const suc of Object.keys(CORTE)) {
  let sub = 0, subH = 0, subT = 0;
  const pk = SUC2PLINK[suc];
  for (let ts = Date.parse(CORTE[suc] + "T00:00:00Z"); ; ts += 86400000) {
    const d = new Date(ts).toISOString().slice(0, 10);
    if (d > FIN_LINUX[suc]) break;
    const t = tarDia.get(`${suc}|${d}`) ?? 0;
    if (!t) continue;
    const p = Math.min(t, plink.get(`${pk}|${d}`) ?? 0);
    const nl = t - p;
    tarjRows.push([NOMBRE[suc], d, t, p, nl]);
    sub += nl; subH += p; subT += t;
  }
  tarjRows.push([`SUBTOTAL ${NOMBRE[suc]}`, "", subT, subH, sub], []);
  Btot += sub;
  bPorTienda[suc] = sub;
}
tarjRows.push(["TOTAL RECAUDADO POR DATAFONO NATURAL LIGHT (tiendas de Habbie, desde el corte)", "", "", "", Btot]);

// ══ Hoja 3: Detalle efectivo ═════════════════════════════════════════════
const efeRows: any[][] = [
  ["DETALLE EFECTIVO — Dinero en efectivo que entró a la cuenta de Habbie SAS y corresponde a Natural Light"],
  [],
  ["1. VENTAS ANTERIORES AL CORTE de las tiendas que continuaron con Habbie (consignaciones a cuenta Habbie 100300399792)"],
  ["Tienda", "Fecha venta", "Fecha consignación", "Documento", "Valor"],
];
let a1 = 0;
const a1PorTienda: Record<string, number> = {};
for (const suc of Object.keys(CORTE)) {
  const rows = cons
    .filter((c) => c.suc === suc && c.cuenta === CTA_HABBIE && c.fecVenta < CORTE[suc])
    .sort((a, b) => a.fecVenta.localeCompare(b.fecVenta));
  if (!rows.length) continue;
  let sub = 0;
  for (const c of rows) {
    efeRows.push([NOMBRE[suc], c.fecVenta, c.fecConsig, c.doc, c.vlr]);
    sub += c.vlr;
  }
  efeRows.push([`SUBTOTAL ${NOMBRE[suc]}`, "", "", "", sub], []);
  a1 += sub;
  a1PorTienda[suc] = sub;
}
efeRows.push(["SUBTOTAL ventas pre-corte", "", "", "", a1], []);

efeRows.push(
  ["2. EFECTIVO DE TIENDAS CERRADAS recibido por Habbie"],
  ["Tienda", "Detalle", "", "", "Valor"],
);
const cerradasDet: [string, string, number][] = [
  ["BJ", "Depósitos en banco, referencia de recaudo 3111234598 (11 movimientos, abril)", bankByRef("3111234598").reduce((s, b) => s + b.valor, 0)],
  ["BF", "Depósitos en banco, referencia de recaudo 3203518392 (12 movimientos, abril)", bankByRef("3203518392").reduce((s, b) => s + b.valor, 0)],
  ["BM", "Depósitos en banco, referencias 3165476343 y 3172560775 hasta el 15-may (20 movimientos)", bankByRef("3165476343").reduce((s, b) => s + b.valor, 0) + bankByRef("3172560775", "2026-05-16").reduce((s, b) => s + b.valor, 0)],
  ["BB", "Devolución de la cuenta de recaudo propia de Éxito Occidente (20-abr, ref 10030039979)", 3842765],
  ["BC", "Efectivo recaudado por Habbie: ventas del 6 al 16 de abril (según registros de consignación)", 1010065],
];
let a2 = 0;
for (const [suc, det, v] of cerradasDet) {
  efeRows.push([NOMBRE[suc], det, "", "", v]);
  a2 += v;
}
efeRows.push(
  ["SUBTOTAL tiendas cerradas", "", "", "", a2],
  [],
  ["Notas sobre Viva Envigado:"],
  ["- Las ventas del 1 al 5 de abril ($1.215.000) fueron consignadas a la cuenta de Natural Light, no a Habbie."],
  ["- El efectivo de los días 17 y 18 de abril ($73.150) no fue recibido por Habbie."],
  ["Nota sobre Éxito Sabana: la consignación reportada del 9-abr por $64.450 nunca ingresó a la cuenta de Habbie."],
);
const Atot = a1 + a2;

// ══ Hoja 1: Resumen ══════════════════════════════════════════════════════
const R1 = 22000000, R2 = 10976384, R = R1 + R2;
const neto = Btot - Atot - R;
const resumen: any[][] = [
  ["CRUCE DE CUENTAS — HABBIE SAS (NIT 901614877-1) y COMERCIALIZADORA NATURAL LIGHT SA"],
  ["Período: abril – mayo de 2026 (facturación por sistema Linux)"],
  ["Fecha del reporte: 14 de julio de 2026"],
  [],
  ["Regla del cruce: las ventas de Unicentro Norte, Unioccidente y Plaza de las Américas pertenecen a Habbie desde el 16 de abril de 2026, y las de Jardín Plaza desde el 16 de mayo de 2026. Las ventas anteriores a esas fechas y todas las de las tiendas cerradas (Éxito Occidente, Viva Envigado, Éxito Sabana, Éxito San Pedro y Unicentro Cali) pertenecen a Natural Light."],
  [],
  ["1. TARJETAS DE TIENDAS HABBIE RECAUDADAS POR EL DATAFONO DE NATURAL LIGHT (a favor de Habbie)", ""],
  ["   Unicentro Norte (16 → 29 abr)", bPorTienda.BQ],
  ["   Unioccidente (16 abr → 4 may)", bPorTienda.Q9],
  ["   Plaza de las Américas (16 abr → 5 may)", bPorTienda.BD],
  ["   Jardín Plaza (18 y 19 may)", bPorTienda.D0],
  ["   SUBTOTAL a favor de Habbie", Btot],
  [],
  ["2. EFECTIVO DE NATURAL LIGHT RECIBIDO EN LA CUENTA DE HABBIE (a favor de Natural Light)", ""],
  ["   Ventas pre-corte Unicentro Norte", a1PorTienda.BQ ?? 0],
  ["   Ventas pre-corte Unioccidente", a1PorTienda.Q9 ?? 0],
  ["   Ventas pre-corte Plaza de las Américas", a1PorTienda.BD ?? 0],
  ["   Éxito San Pedro", cerradasDet[0][2]],
  ["   Éxito Sabana", cerradasDet[1][2]],
  ["   Unicentro Cali", cerradasDet[2][2]],
  ["   Éxito Occidente (devolución cuenta propia)", 3842765],
  ["   Viva Envigado (ventas 6 → 16 abr)", 1010065],
  ["   SUBTOTAL a favor de Natural Light", Atot],
  [],
  ["3. GIROS YA REALIZADOS POR NATURAL LIGHT A HABBIE", ""],
  ["   Transferencia 16-abr-2026", R1],
  ["   Transferencia 24-abr-2026", R2],
  ["   SUBTOTAL girado", R],
  [],
  ["SALDO NETO DEL CRUCE  =  (1) − (2) − (3)", neto],
  [neto < 0 ? `RESULTADO: saldo a favor de NATURAL LIGHT por ${Math.abs(neto).toLocaleString("es-CO")}` : `RESULTADO: saldo a favor de HABBIE por ${neto.toLocaleString("es-CO")}`, ""],
  [],
  ["Movimientos que NO hacen parte de este cruce:"],
  ["   - Transferencias de Natural Light del 21-abr ($31.000.000) y 24-abr ($10.000.000): corresponden a otro concepto."],
  ["   - Transferencia del 23-jun ($2.904.813): pago de factura de producto (pan) vendido por Habbie a Natural Light."],
  [],
  ["Soportes: hoja 'Detalle tarjetas' (venta diaria con tarjeta vs recaudo de cada datafono, verificada contra"],
  ["los reportes de la pasarela Plink de Habbie) y hoja 'Detalle efectivo' (consignación por consignación,"],
  ["verificadas contra el extracto del encargo fiduciario de Habbie en Alianza)."],
];

// ══ Escribir ═════════════════════════════════════════════════════════════
const wb = XLSX.utils.book_new();
const wsR = XLSX.utils.aoa_to_sheet(resumen);
wsR["!cols"] = [{ wch: 100 }, { wch: 16 }];
XLSX.utils.book_append_sheet(wb, wsR, "Resumen");
const wsT = XLSX.utils.aoa_to_sheet(tarjRows);
wsT["!cols"] = [{ wch: 28 }, { wch: 12 }, { wch: 20 }, { wch: 22 }, { wch: 26 }];
XLSX.utils.book_append_sheet(wb, wsT, "Detalle tarjetas");
const wsE = XLSX.utils.aoa_to_sheet(efeRows);
wsE["!cols"] = [{ wch: 30 }, { wch: 60 }, { wch: 16 }, { wch: 14 }, { wch: 14 }];
XLSX.utils.book_append_sheet(wb, wsE, "Detalle efectivo");
const out = `${PP}/Cruce Habbie - Natural Light.xlsx`;
XLSX.writeFile(wb, out);

const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
console.log(`B tarjetas NL debe: ${fmt(Btot)}`);
console.log(`A efectivo Habbie debe: ${fmt(Atot)} (pre-corte ${fmt(a1)} + cerradas ${fmt(a2)})`);
console.log(`R girado: ${fmt(R)}`);
console.log(`NETO: ${fmt(neto)}`);
console.log(`Excel: ${out}`);
