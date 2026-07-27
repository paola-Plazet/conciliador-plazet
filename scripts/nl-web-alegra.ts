// Pedidos Shopify NL del 1→7 jul (era pre-Karrot) vs registros Mercadopago/Addi
// en Alegra de esas fechas.
import fs from "node:fs";
import { parseAlegraTrans } from "../src/lib/parsers/alegra-trans";

const MC = "C:/Users/Paola Agreda/OneDrive/Escritorio/PROYECTOS PAO/muestras-conciliacion";
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");

// pedidos Shopify pre-Karrot (de la corrida anterior)
const pedidos: [string, string, number][] = [
  ["#NL11623", "2026-07-02", 72350], ["#NL11624", "2026-07-03", 93150], ["#NL11625", "2026-07-03", 55900],
  ["#NL11626", "2026-07-03", 518650], ["#NL11627", "2026-07-03", 56900], ["#NL11628", "2026-07-03", 132400],
  ["#NL11629", "2026-07-03", 126600], ["#NL11630", "2026-07-04", 31400], ["#NL11631", "2026-07-04", 79300],
  ["#NL11632", "2026-07-04", 68850], ["#NL11633", "2026-07-04", 84300], ["#NL11634", "2026-07-05", 73900],
  ["#NL11635", "2026-07-06", 228900], ["#NL11636", "2026-07-06", 158200], ["#NL11637", "2026-07-06", 186250],
  ["#NL11638", "2026-07-06", 227900], ["#NL11640", "2026-07-07", 174300], ["#NL11641", "2026-07-07", 542350],
  ["#NL11642", "2026-07-07", 55900], ["#NL11643", "2026-07-07", 62600], ["#NL11644", "2026-07-07", 189750],
];
console.log(`Pedidos Shopify 2→7 jul: ${pedidos.length}, total ${fmt(pedidos.reduce((s, p) => s + p[2], 0))}`);

const alegra = parseAlegraTrans(fs.readFileSync(`${MC}/sistemas anteriores/Alegra - Reporte de transacciones - HABBIE SAS -.xlsx`));
const al = alegra.sales
  .filter((s) => s.date >= "2026-07-01" && s.date <= "2026-07-10" && /MERCADO|ADDI/i.test(s.bodega))
  .sort((a, b) => a.date.localeCompare(b.date));
console.log(`Alegra Mercadopago/Addi 1→10 jul: ${al.length} registros, total ${fmt(al.reduce((s, x) => s + x.amount, 0))}`);

const usados = new Set<number>();
let ok = 0, okV = 0;
for (const [name, date, amount] of pedidos) {
  const i = al.findIndex((x, idx) => !usados.has(idx) && Math.abs(x.amount - amount) <= 100);
  if (i >= 0) { usados.add(i); ok++; okV += amount; }
  else console.log(`   ✘ ${name} ${date} ${fmt(amount)} sin registro en Alegra`);
}
console.log(`✔ ${ok}/${pedidos.length} pedidos pre-Karrot están en Alegra (${fmt(okV)})`);
const sobr = al.filter((_, i) => !usados.has(i));
if (sobr.length) {
  console.log("Registros Alegra MP/Addi sin pedido (¿de la web Plazet u otro?):");
  for (const x of sobr) console.log(`   ${x.date}  ${fmt(x.amount).padStart(11)}  ${x.invoice}  ${x.bodega}`);
}
