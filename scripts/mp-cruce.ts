// Cruce del settlement de Mercado Pago contra las ventas registradas como
// Mercadopago. Se empareja por MONTO (valor de la compra) con tolerancia de
// fecha, porque la fecha de la venta en el POS y la del pago en MP no siempre
// coinciden (pedidos web aprobados al día siguiente, etc.).
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { prisma } from "../src/lib/db";

const MC = "C:/Users/Paola Agreda/OneDrive/Escritorio/PROYECTOS PAO/muestras-conciliacion";
// Los pedidos de la web se facturan en el POS varios días después del cobro:
// se observó desfase de hasta 5 días (cobro 10-jul → factura 14-jul).
const VENTANA_DIAS = 8;
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
const dif = (a: string, b: string) =>
  Math.round((Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / 86400000);

interface OpMP {
  id: string;
  fecha: string;
  medio: string;
  bruto: number;
  neto: number;
  liberacion: string;
}

function leerSettlements(): OpMP[] {
  const ops: OpMP[] = [];
  for (const f of fs.readdirSync(MC)) {
    if (!/^settlement.*\.xlsx$/i.test(f)) continue;
    const wb = XLSX.readFile(path.join(MC, f));
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
      header: 1, raw: true, defval: null,
    }) as unknown[][];
    const H = rows[0].map(String);
    const c = (n: string) => H.findIndex((h) => h.toUpperCase().includes(n));
    const cId = c("ID DE OPERACI"), cMedio = c("TIPO DE MEDIO"), cTipo = c("TIPO DE OPERACI"),
      cBruto = c("VALOR DE LA COMPRA"), cOrigen = c("FECHA DE ORIGEN"),
      cNeto = c("MONTO NETO"), cLib = c("FECHA DE LIBERACI");
    for (const r of rows.slice(1)) {
      if (!r || r[cOrigen] == null) continue;
      if (!String(r[cTipo] ?? "").toUpperCase().includes("APROBADO")) continue;
      ops.push({
        id: String(r[cId]),
        fecha: String(r[cOrigen]).slice(0, 10),
        medio: String(r[cMedio]),
        bruto: Number(r[cBruto]) || 0,
        neto: Number(r[cNeto]) || 0,
        liberacion: String(r[cLib] ?? "").slice(0, 10),
      });
    }
  }
  return ops.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

async function main() {
  const ops = leerSettlements();
  if (ops.length === 0) return console.log("No hay archivos settlement de Mercado Pago.");
  const desde = ops[0].fecha, hasta = ops[ops.length - 1].fecha;

  // ventas marcadas como Mercadopago (Karrot) dentro del rango + ventana
  const ventas = (
    await prisma.sale.findMany({ where: { date: { gte: desde, lte: hasta } } })
  ).filter((v) => v.bodega.toUpperCase().includes("MERCADO"));

  // corte de cobertura: hasta dónde llegan las ventas cargadas
  const corte = (await prisma.sale.aggregate({ _max: { date: true } }))._max.date ?? hasta;

  const usada = new Set<number>();
  const casadas: { op: OpMP; venta: (typeof ventas)[number]; desfase: number }[] = [];
  const sinVenta: OpMP[] = [];

  for (const op of ops) {
    let mejor = -1, mejorDesfase = 99;
    ventas.forEach((v, i) => {
      if (usada.has(i)) return;
      if (Math.abs(v.amount - op.bruto) > 1) return;
      const d = Math.abs(dif(v.date, op.fecha));
      if (d <= VENTANA_DIAS && d < mejorDesfase) { mejor = i; mejorDesfase = d; }
    });
    if (mejor >= 0) {
      usada.add(mejor);
      casadas.push({ op, venta: ventas[mejor], desfase: dif(ventas[mejor].date, op.fecha) });
    } else sinVenta.push(op);
  }
  const sinOperacion = ventas.filter((_, i) => !usada.has(i));

  const suma = <T>(a: T[], f: (x: T) => number) => a.reduce((s, x) => s + f(x), 0);
  console.log(`MERCADO PAGO — settlement ${desde} → ${hasta}   (${ops.length} operaciones)`);
  console.log(`Ventas cargadas hasta: ${corte}\n`);
  console.log(`Bruto MP            ${fmt(suma(ops, (o) => o.bruto)).padStart(14)}`);
  console.log(`Neto recibido       ${fmt(suma(ops, (o) => o.neto)).padStart(14)}`);
  console.log(`Comisiones + rete   ${fmt(suma(ops, (o) => o.bruto - o.neto)).padStart(14)}\n`);
  console.log(`✓ Casadas con venta          ${String(casadas.length).padStart(3)}   ${fmt(suma(casadas, (x) => x.op.bruto))}`);
  console.log(`✗ Cobro MP sin venta         ${String(sinVenta.length).padStart(3)}   ${fmt(suma(sinVenta, (o) => o.bruto))}`);
  console.log(`✗ Venta sin cobro en MP      ${String(sinOperacion.length).padStart(3)}   ${fmt(suma(sinOperacion, (v) => v.amount))}`);

  const fuera = sinVenta.filter((o) => o.fecha > corte);
  const dentro = sinVenta.filter((o) => o.fecha <= corte);
  if (fuera.length)
    console.log(`\n   (de esas, ${fuera.length} por ${fmt(suma(fuera, (o) => o.bruto))} son posteriores al corte de ventas — falta cargar Karrot)`);

  if (dentro.length) {
    console.log("\n── Cobros en Mercado Pago SIN venta registrada ─────────────");
    for (const o of dentro)
      console.log(`   ${o.fecha}  ${fmt(o.bruto).padStart(12)}  ${o.medio.padEnd(22)} op ${o.id}`);
  }
  if (sinOperacion.length) {
    console.log("\n── Ventas marcadas Mercadopago SIN cobro en MP ─────────────");
    for (const v of sinOperacion)
      console.log(`   ${v.date}  ${fmt(v.amount).padStart(12)}  ${v.bodega}  fac ${v.invoice}`);
  }
  const desfasadas = casadas.filter((c) => c.desfase !== 0);
  if (desfasadas.length)
    console.log(`\n(${desfasadas.length} casadas con desfase de fecha entre venta y cobro, dentro de ±${VENTANA_DIAS} días)`);
  process.exit(0);
}
main();
