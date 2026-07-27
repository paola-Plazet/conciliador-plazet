// Cruce tienda online NL: pedidos Shopify (transactions_export, Mercado Pago,
// desde #NL11623) vs ventas de la tienda "NL" en Karrot (allsales).
import fs from "node:fs";
import * as XLSX from "xlsx";

const MC = "C:/Users/Paola Agreda/OneDrive/Escritorio/PROYECTOS PAO/muestras-conciliacion";
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");

// ── Shopify ──────────────────────────────────────────────────────────────
interface Tx { name: string; num: number; kind: string; gateway: string; date: string; status: string; amount: number }
const txs: Tx[] = [];
{
  const lines = fs.readFileSync(`${MC}/transactions_export_1.csv`, "utf8").split(/\r?\n/);
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const p = line.split(";");
    const name = p[1] ?? "";
    const m = name.match(/#NL(\d+)/);
    if (!m) continue;
    const dm = String(p[4] ?? "").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    txs.push({
      name,
      num: Number(m[1]),
      kind: p[2],
      gateway: p[3],
      date: dm ? `${dm[3]}-${dm[2].padStart(2, "0")}-${dm[1].padStart(2, "0")}` : "",
      status: p[5],
      amount: Number(p[6] ?? 0),
    });
  }
}
const gateways = new Map<string, number>();
for (const t of txs) gateways.set(`${t.gateway}|${t.kind}|${t.status}`, (gateways.get(`${t.gateway}|${t.kind}|${t.status}`) ?? 0) + 1);
console.log("Shopify — gateway|kind|status:", [...gateways.entries()].map(([k, v]) => `${k}(${v})`).join(" · "));
// Ventas reales: Mercado Pago (sale) + Addi (sale o capture; se toma UNA por
// pedido para no duplicar la autorización y la captura del mismo pedido).
const porPedido = new Map<string, Tx>();
for (const t of txs) {
  if (t.status !== "success" || t.num < 11623) continue;
  if (!(t.kind === "sale" || t.kind === "capture")) continue;
  const prev = porPedido.get(t.name);
  if (!prev || (prev.kind === "capture" && t.kind === "sale")) porPedido.set(t.name, t);
}
const ventasShop = [...porPedido.values()];
const rango = ventasShop.map((t) => t.num).sort((a, b) => a - b);
console.log(`Pedidos desde #NL11623: ${ventasShop.length} (del ${rango[0]} al ${rango[rango.length - 1]}), total ${fmt(ventasShop.reduce((s, t) => s + t.amount, 0))}`);

// ── Karrot: tienda NL, venta por factura ─────────────────────────────────
const wbk = XLSX.read(fs.readFileSync(`${MC}/allsales-a2b47fd9-3c80-4506-8700-49c3de1b8966-20260716T234911269Z.xlsx`));
const rows: any[][] = XLSX.utils.sheet_to_json(wbk.Sheets[wbk.SheetNames[0]], { header: 1 });
const H = rows[0].map((c: any) => String(c ?? ""));
const i = (n: string) => H.findIndex((h) => h === n);
const iAlm = i("Nombre Almacén"), iFac = i("# Factura"), iMet = i("Método de Pago Principal"), iFecha = i("Fecha"), iVenta = i("Venta");
const facturas = new Map<string, { fecha: string; met: string; total: number }>();
for (let r = 1; r < rows.length; r++) {
  const row = rows[r];
  if (!row || String(row[iAlm]) !== "NL") continue;
  const fac = String(row[iFac]);
  const f = facturas.get(fac) ?? { fecha: String(row[iFecha]), met: String(row[iMet]), total: 0 };
  f.total += Number(row[iVenta] ?? 0);
  facturas.set(fac, f);
}
console.log(`\nKarrot tienda NL: ${facturas.size} facturas, total ${fmt([...facturas.values()].reduce((s, f) => s + f.total, 0))}`);
const porMet = new Map<string, { n: number; v: number }>();
for (const f of facturas.values()) {
  const x = porMet.get(f.met) ?? { n: 0, v: 0 };
  x.n++; x.v += f.total;
  porMet.set(f.met, x);
}
for (const [m, x] of porMet) console.log(`   ${m.padEnd(14)} ${x.n} fact  ${fmt(x.v)}`);

// ── Calce: por número (factura Karrot = pedido Shopify?) o por monto+fecha ─
console.log("\nCalce pedido Shopify ↔ factura Karrot:");
const usadas = new Set<string>();
let ok = 0, okV = 0;
const sinCalce: Tx[] = [];
for (const t of ventasShop.sort((a, b) => a.num - b.num)) {
  // 1º por número exacto
  let key: string | null = facturas.has(String(t.num)) && !usadas.has(String(t.num)) ? String(t.num) : null;
  // 2º por monto (±100) y fecha ±2 días
  if (!key) {
    for (const [fac, f] of facturas) {
      if (usadas.has(fac)) continue;
      if (Math.abs(f.total - t.amount) <= 100 && Math.abs(Date.parse(f.fecha) - Date.parse(t.date)) <= 8 * 86400000) { key = fac; break; }
    }
  }
  if (key) { usadas.add(key); ok++; okV += t.amount; }
  else sinCalce.push(t);
}
console.log(`   ✔ ${ok}/${ventasShop.length} pedidos calzan (${fmt(okV)})`);
if (sinCalce.length) {
  console.log("   ✘ pedidos Shopify SIN factura en Karrot:");
  for (const t of sinCalce) console.log(`      ${t.name}  ${t.date}  ${fmt(t.amount)}  ${t.gateway}`);
}
const sobrantes = [...facturas.entries()].filter(([k]) => !usadas.has(k));
if (sobrantes.length) {
  console.log("   ✘ facturas Karrot NL sin pedido Shopify que calce:");
  for (const [fac, f] of sobrantes) console.log(`      fact ${fac}  ${f.fecha}  ${f.met}  ${fmt(f.total)}`);
}
