// ¿El código de la col 7 del CSV 191 (4027/4065) distingue tiendas?
import { readFileSync } from "fs";
import { prisma } from "../src/lib/db";
const ymd = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
async function main() {
  const text = readFileSync("C:/Users/Paola Agreda/Downloads/CSV_19100003911_000000901987494_20260907_10380319.csv", "latin1");
  const pagos: { date: string; amount: number; code: string }[] = [];
  for (const line of text.split(/\r?\n/)) {
    const p = line.split(",").map((x) => x.trim());
    if (p.length < 8 || !p[7]?.toUpperCase().startsWith("PAGO QR")) continue;
    pagos.push({ date: ymd(p[3]), amount: Math.round(parseFloat(p[5])), code: p[6] });
  }
  const ventas = await prisma.sale.findMany({ where: { method: "TRANSFERENCIA", date: { gte: "2026-08-19" } } });
  const porCodigo = new Map<string, Map<string, number>>();
  for (const pg of pagos) {
    const cands = ventas.filter((v) => Math.abs(Math.round(v.amount) - pg.amount) <= 100 && Math.abs(Date.parse(v.date) - Date.parse(pg.date)) <= 2 * 86400000);
    const tiendas = [...new Set(cands.map((c) => c.storeCode ?? "?"))];
    const key = tiendas.length === 1 ? tiendas[0] : tiendas.length === 0 ? "(sin venta que calce)" : "(ambiguo)";
    const m = porCodigo.get(pg.code) ?? new Map();
    m.set(key, (m.get(key) ?? 0) + 1);
    porCodigo.set(pg.code, m);
  }
  for (const [code, m] of porCodigo) console.log("código", code, "→", [...m.entries()].map(([t, n]) => `${t}:${n}`).join("  "));
  await prisma.$disconnect();
}
main();
