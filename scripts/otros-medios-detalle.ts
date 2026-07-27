// Detalle de "otros medios" (Rappi / Addi / Mercadopago / etc.) registrados en
// Alegra — pago a pago, con tienda y plataforma. Estos recaudos entraron a
// cuentas de Natural Light, así que suman al cruce.
// Genera: PROYECTOS PAO/Otros medios (Rappi-Addi) 2026.xlsx
import fs from "node:fs";
import ExcelJS from "exceljs";
import { parseAlegraTrans } from "../src/lib/parsers/alegra-trans";

const PP = "C:/Users/Paola Agreda/OneDrive/Escritorio/PROYECTOS PAO";
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
const NOMBRE: Record<string, string> = { B3: "Unicentro Norte", B2: "Unioccidente", B1: "Plaza de las Américas", JP: "Jardín Plaza" };

const alegra = parseAlegraTrans(
  fs.readFileSync(`${PP}/muestras-conciliacion/sistemas anteriores/Alegra - Reporte de transacciones - HABBIE SAS -.xlsx`),
);
const esPlataforma = (cuenta: string) => /RAPPI|ADDI|MERCADO/i.test(cuenta);
const otros = alegra.sales
  .filter((s) => s.method === "OTRO" && s.date >= "2026-04-01" && s.date <= "2026-07-07" && esPlataforma(s.bodega))
  .sort((a, b) => a.date.localeCompare(b.date));

function plataforma(cuenta: string): string {
  const c = cuenta.toUpperCase();
  if (c.includes("RAPPI")) return "Rappi";
  if (c.includes("ADDI")) return "Addi";
  if (c.includes("MERCADO")) return "Mercadopago";
  if (c.includes("BONO") || c.includes("REGALO")) return "Bono regalo";
  return cuenta;
}

// Totales por plataforma y mes
const porPlatMes = new Map<string, number>();
const porPlatTienda = new Map<string, number>();
for (const s of otros) {
  const p = plataforma(s.bodega);
  porPlatMes.set(`${p}|${s.date.slice(0, 7)}`, (porPlatMes.get(`${p}|${s.date.slice(0, 7)}`) ?? 0) + s.amount);
  porPlatTienda.set(`${p}|${s.storeCode}`, (porPlatTienda.get(`${p}|${s.storeCode}`) ?? 0) + s.amount);
}
console.log("Totales por plataforma y mes:");
for (const [k, v] of [...porPlatMes.entries()].sort()) console.log(`   ${k.padEnd(28)} ${fmt(v).padStart(13)}`);
console.log(`   TOTAL ${fmt(otros.reduce((s, x) => s + x.amount, 0))} en ${otros.length} pagos`);

// Excel
const VERDE = "FF3BA55D", VERDE_OSCURO = "FF2E7D46", VERDE_CLARO = "FFE6F4EA";
const thin = { style: "thin" as const, color: { argb: "FFDDDDDD" } };
const borde = { top: thin, bottom: thin, left: thin, right: thin };
const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet("Otros medios", { views: [{ showGridLines: false, state: "frozen", ySplit: 4 }] });
ws.columns = [{ width: 12 }, { width: 24 }, { width: 16 }, { width: 12 }, { width: 14 }, { width: 40 }];
ws.mergeCells(1, 1, 1, 6);
const cT = ws.getCell(1, 1);
cT.value = "OTROS MEDIOS DE PAGO REGISTRADOS EN ALEGRA (Rappi / Addi / Mercadopago) — abril a julio 7, 2026";
cT.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
cT.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
ws.getRow(1).height = 24;
ws.mergeCells(2, 1, 2, 6);
ws.getCell(2, 1).value = "Recaudos que entraron a cuentas de Natural Light — insumo para el cruce de cuentas.";
ws.getCell(2, 1).font = { italic: true, size: 9.5 };
["Fecha", "Tienda", "Plataforma", "Factura", "Valor", "Cuenta Alegra"].forEach((h, i) => {
  const c = ws.getCell(4, i + 1);
  c.value = h;
  c.font = { bold: true, size: 9, color: { argb: "FFFFFFFF" } };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE_OSCURO } };
  c.alignment = { horizontal: "center", vertical: "middle" };
  c.border = borde;
});
let r = 5;
let mesActual = "";
let subMes = 0;
const cerrarMes = () => {
  if (!mesActual) return;
  const c1 = ws.getCell(r, 1);
  ws.mergeCells(r, 1, r, 4);
  c1.value = `Subtotal ${mesActual}`;
  c1.font = { bold: true, size: 10 };
  c1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE_CLARO } };
  c1.border = borde;
  const c5 = ws.getCell(r, 5);
  c5.value = subMes;
  c5.numFmt = "#,##0";
  c5.font = { bold: true, size: 10 };
  c5.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE_CLARO } };
  c5.border = borde;
  ws.getCell(r, 6).border = borde;
  r++;
  subMes = 0;
};
for (const s of otros) {
  const mes = s.date.slice(0, 7);
  if (mes !== mesActual) { cerrarMes(); mesActual = mes; }
  const vals = [s.date, NOMBRE[s.storeCode ?? ""] ?? s.storeCode ?? "?", plataforma(s.bodega), s.invoice, s.amount, s.bodega];
  vals.forEach((v, i) => {
    const c = ws.getCell(r, i + 1);
    c.value = v as any;
    if (i === 4) c.numFmt = "#,##0";
    c.font = { size: 9.5 };
    c.alignment = { horizontal: i === 4 ? "right" : i === 0 || i === 3 ? "center" : "left", vertical: "middle" };
    c.border = borde;
  });
  subMes += s.amount;
  r++;
}
cerrarMes();
const cTot = ws.getCell(r, 1);
ws.mergeCells(r, 1, r, 4);
cTot.value = "TOTAL";
cTot.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
cTot.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
const cV = ws.getCell(r, 5);
cV.value = otros.reduce((s, x) => s + x.amount, 0);
cV.numFmt = "#,##0";
cV.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
cV.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };

const out = `${PP}/Otros medios (Rappi-Addi) 2026.xlsx`;
wb.xlsx.writeFile(out).then(() => console.log(`Excel: ${out}`));
