// Detalle del 23-may en Unicentro Norte (B3): transacciones Plink una a una
// vs pagos con tarjeta en Alegra ese día, para ubicar el posible "0 de más".
import fs from "node:fs";
import { parseDatafono } from "../src/lib/parsers/datafono";
import { parseAlegraTrans } from "../src/lib/parsers/alegra-trans";

const PP = "C:/Users/Paola Agreda/OneDrive/Escritorio/PROYECTOS PAO";
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");

const plink = parseDatafono(
  fs.readFileSync(`${PP}/muestras-conciliacion/901987494_Reporte_Conciliar_20260501_20260531.xlsx`),
);
const txs = plink.entries
  .filter((e) => e.storeCode === "B3" && e.txDate === "2026-05-23")
  .sort((a, b) => b.gross - a.gross);
console.log(`Plink B3 23-may: ${txs.length} transacciones, total ${fmt(txs.reduce((s, t) => s + t.gross, 0))}`);
for (const t of txs) console.log(`   ${fmt(t.gross).padStart(11)}  ${t.franchise} ${t.cardType}  term ${t.terminal}`);

const alegra = parseAlegraTrans(
  fs.readFileSync(`${PP}/muestras-conciliacion/sistemas anteriores/Alegra - Reporte de transacciones - HABBIE SAS -.xlsx`),
);
const ventas = alegra.sales
  .filter((s) => s.storeCode === "B3" && s.date === "2026-05-23" && (s.method === "TARJETA_CREDITO" || s.method === "TARJETA_DEBITO"))
  .sort((a, b) => b.amount - a.amount);
console.log(`\nAlegra B3 23-may tarjetas: ${ventas.length} pagos, total ${fmt(ventas.reduce((s, v) => s + v.amount, 0))}`);
for (const v of ventas) console.log(`   ${fmt(v.amount).padStart(11)}  ${v.invoice}  ${v.method}`);

// buscar pares 10x: plink = 10 * venta (o dif 9*venta = 630.000 → venta = 70.000)
console.log("\nPosibles '0 de más' (transacción Plink ≈ 10 × pago Alegra):");
for (const t of txs)
  for (const v of ventas)
    if (Math.abs(t.gross - v.amount * 10) <= 100)
      console.log(`   Plink ${fmt(t.gross)} = 10 × Alegra ${fmt(v.amount)} (factura ${v.invoice}) ← AQUÍ`);
