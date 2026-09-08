import fs from "node:fs";
import { parse } from "csv-parse/sync";
import { prisma } from "../src/lib/db";
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
async function main() {
  const text = fs.readFileSync("C:/Users/Paola Agreda/Downloads/Alegra - devoluciones desde 01_04_2026 - hasta 08_07_2026.csv", "utf8").replace(/^sep=;\r?\n/, "");
  const rows: Record<string, string>[] = parse(text, { columns: true, delimiter: ";", skip_empty_lines: true, bom: true, relax_column_count: true, relax_quotes: true });
  const keys = Object.keys(rows[0]);
  const kTotal = keys.find((k) => k.includes("TOTAL - NOTA"))!, kNum = keys[0], kFecha = keys[1], kVenta = keys.find((k) => k.includes("VENTA ASOCIADA"))!, kItemTotal = keys.find((k) => k.includes("TEM - TOTAL"))!, kSub = keys.find((k) => k.includes("SUBTOTAL"))!, kTipo = keys.find((k) => k === "TIPO")!, kCC = keys.find((k) => k.includes("CENTRO"))!;
  const vistos = new Set<string>();
  for (const r of rows) {
    if (vistos.has(r[kNum])) continue; vistos.add(r[kNum]);
    console.log(`NC${r[kNum].padStart(3)} ${r[kFecha]} ${String(r[kCC]).padEnd(22)} total="${r[kTotal]}" subtotal="${r[kSub]}" item="${r[kItemTotal]}" tipo=${String(r[kTipo]).slice(0, 25)} fac=${(r[kVenta].match(/:\s*([A-Z]+\d+)/) ?? [])[1] ?? "?"}`);
  }
  // B2 29-may: ¿alguna venta de 32.700? ¿QR/datáfono?
  const v = await prisma.sale.findMany({ where: { storeCode: "B2", date: "2026-05-29" }, orderBy: { amount: "desc" } });
  console.log("\nB2 29-may ventas efectivo:", v.filter((x) => x.method === "EFECTIVO").map((x) => `${x.invoice} ${fmt(x.amount)}`).join(" | "));
  console.log("suma efectivo:", fmt(v.filter((x) => x.method === "EFECTIVO").reduce((s, x) => s + x.amount, 0)), "| 716.975 − 684.275 =", fmt(716975 - 684275));
  const q = await prisma.qrEntry.findMany({ where: { date: { gte: "2026-05-27", lte: "2026-05-30" }, amount: { gte: 32000, lte: 33500 } } });
  console.log("QR banco ~32.700:", q.map((x) => `${x.date} ${fmt(x.amount)} ${x.payer}`).join(" | ") || "ninguno");
  // ¿algún subconjunto de ventas efectivo del 29 suma 32.700?
  const efe = v.filter((x) => x.method === "EFECTIVO").map((x) => ({ i: x.invoice, a: Math.round(x.amount) }));
  const hits: string[] = [];
  for (let i = 0; i < efe.length; i++) { if (efe[i].a === 32700) hits.push(efe[i].i); for (let j = i + 1; j < efe.length; j++) if (efe[i].a + efe[j].a === 32700) hits.push(`${efe[i].i}+${efe[j].i}`); }
  console.log("ventas que suman 32.700:", hits.join(" ; ") || "ninguna");
  await prisma.$disconnect();
}
main();
