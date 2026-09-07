// Reporte de transacciones Alegra: filas donde la CUENTA (col A) y el MÉTODO DE PAGO (col M) no concuerdan.
import * as XLSX from "xlsx";
const f = "C:/Users/Paola Agreda/Downloads/Alegra - Reporte de transacciones - HABBIE SAS -.xlsx";
const rows = XLSX.utils.sheet_to_json<Record<string, any>>(XLSX.readFile(f).Sheets["Worksheet"], { raw: false, defval: "" });
const iso = (d: string) => { const m = String(d).match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : String(d); };
const num = (v: any) => Number(String(v).replace(/[^\d.-]/g, "")) || 0;
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
const cuentaTipo = (c: string) => c.startsWith("Efectivo POS") ? "EFECTIVO" : c === "QR Bancolombia" ? "TRANSFERENCIA" : c === "Credibanco" ? "TARJETA" : c;
const metodoTipo = (m: string) => m === "Efectivo" ? "EFECTIVO" : m === "Transferencia" ? "TRANSFERENCIA" : m.startsWith("Tarjeta") ? "TARJETA" : m;
const ingresos = rows.filter((r) => r["Tipo"] === "Ingreso");
const fechas = ingresos.map((r) => iso(r["Fecha"])).sort();
console.log("filas Ingreso:", ingresos.length, "rango", fechas[0], "→", fechas[fechas.length - 1]);
const combos: Record<string, { n: number; v: number }> = {};
const casos: any[] = [];
for (const r of ingresos) {
  const c = String(r["Cuenta"]), m = String(r["Método de pago"]);
  const ct = cuentaTipo(c), mt = metodoTipo(m);
  const k = `${c.startsWith("Efectivo POS") ? "Efectivo POS - *" : c} | ${m}`;
  combos[k] = combos[k] ?? { n: 0, v: 0 }; combos[k].n++; combos[k].v += num(r["Valor"]);
  if (ct !== mt && (ct === "EFECTIVO" || mt === "EFECTIVO")) casos.push({ fecha: iso(r["Fecha"]), cuenta: c, metodo: m, valor: num(r["Valor"]), fac: String(r["Asociaciones"]).replace("Facturas: ", ""), num: r["Número"] });
}
console.log("\nCUENTA | MÉTODO (todas las combinaciones):");
for (const [k, x] of Object.entries(combos).sort((a, b) => b[1].n - a[1].n)) console.log(`   ${k.padEnd(55)} ${String(x.n).padStart(5)}  ${fmt(x.v)}`);
console.log(`\nCASOS cuenta EFECTIVO vs método distinto (o al revés): ${casos.length} · ${fmt(casos.reduce((s, c) => s + c.valor, 0))}`);
const porDia: Record<string, { n: number; v: number }> = {};
for (const c of casos) { const k = `${c.fecha} ${c.cuenta.replace("Efectivo POS - ", "")} [${c.metodo}]`; porDia[k] = porDia[k] ?? { n: 0, v: 0 }; porDia[k].n++; porDia[k].v += c.valor; }
for (const [k, x] of Object.entries(porDia).sort()) console.log(`   ${k.padEnd(70)} ${x.n} · ${fmt(x.v)}`);
console.log("\nDETALLE días 16 y 17:");
for (const c of casos.filter((c) => /-(16|17)$/.test(c.fecha)).sort((a, b) => a.fecha.localeCompare(b.fecha))) console.log(`   ${c.fecha} ${c.cuenta.padEnd(42)} método ${c.metodo.padEnd(14)} ${fmt(c.valor).padStart(10)} fac ${c.fac} (#${c.num})`);
// suma de efectivo por día 16/17 según CUENTA vs según MÉTODO
console.log("\nEFECTIVO días 16 y 17 — por CUENTA (col A) vs por MÉTODO (col M):");
const sum: Record<string, { cuenta: number; metodo: number }> = {};
for (const r of ingresos) {
  const d = iso(r["Fecha"]); if (!/-(16|17)$/.test(d)) continue;
  const c = String(r["Cuenta"]); const tienda = c.startsWith("Efectivo POS") ? c.replace("Efectivo POS - ", "") : (String(r["Asociaciones"]).match(/B(\d)/)?.[0] ?? "?");
  const k = `${d} ${tienda}`; sum[k] = sum[k] ?? { cuenta: 0, metodo: 0 };
  if (c.startsWith("Efectivo POS")) sum[k].cuenta += num(r["Valor"]);
  if (String(r["Método de pago"]) === "Efectivo") sum[k].metodo += num(r["Valor"]);
}
for (const [k, x] of Object.entries(sum).sort()) if (x.cuenta || x.metodo) console.log(`   ${k.padEnd(45)} por cuenta ${fmt(x.cuenta).padStart(12)}   por método ${fmt(x.metodo).padStart(12)}   dif ${fmt(x.metodo - x.cuenta)}`);
