// SOLO LECTURA: pagos del POS (Karrot, con código de autorización) vs transacción de
// Conciliar con la misma autorización: ¿cuántos días después aparece en el datáfono?
import { prisma } from "../src/lib/db";
async function main() {
  const pos = await prisma.sale.findMany({ where: { date: { gte: "2026-07-09", lte: "2026-09-09" }, autorizacion: { not: null } } });
  const tx = await prisma.dataphoneEntry.findMany({ where: { txDate: { gte: "2026-07-09", lte: "2026-09-12" }, autorizacion: { not: null } } });
  const byAut = new Map<string, typeof tx>();
  for (const t of tx) { const k = String(t.autorizacion).replace(/^0+/, ""); byAut.set(k, [...(byAut.get(k) ?? []), t]); }
  const hist = new Map<number, number>(); let sinTx = 0, n = 0; const tarde: string[] = [];
  for (const p of pos) {
    const k = String(p.autorizacion).replace(/^0+/, "");
    const cands = (byAut.get(k) ?? []).filter(t => Math.abs(t.gross - Math.abs(p.amount)) <= 50);
    if (!cands.length) { sinTx++; continue; }
    n++;
    const t = cands.sort((a, b) => a.txDate.localeCompare(b.txDate))[0];
    const d = Math.round((Date.parse(t.txDate) - Date.parse(p.date)) / 86400000);
    hist.set(d, (hist.get(d) ?? 0) + 1);
    if (Math.abs(d) >= 2 && tarde.length < 25) tarde.push(`${p.date} ${p.storeCode ?? p.bodega} ${p.invoice} $${p.amount} ${p.method} ${p.franquicia ?? ""} aut ${p.autorizacion} -> datáfono ${t.txDate} ${t.franchise} ${t.cardType} (${d} días)`);
  }
  console.log(`Pagos POS con autorización: ${pos.length}; con transacción Conciliar igual: ${n}; sin encontrar: ${sinTx}`);
  console.log("Días entre fecha POS y FECHA DE TRANSACCION del datáfono:", [...hist].sort((a, b) => a[0] - b[0]).map(([d, c]) => `${d}: ${c}`).join(" | "));
  console.log("Ejemplos con 2+ días:"); for (const s of tarde) console.log("  " + s);
}
main().catch(e => { console.error(e.message); process.exit(1); }).finally(() => prisma.$disconnect());
