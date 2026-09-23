// Cruce del datáfono en los días con devolución por datáfono (verificación de NC)
import { prisma } from "../src/lib/db";
import { cruzarDatafono } from "../src/lib/datafono-cruce";
async function main() {
  const devs = await prisma.sale.findMany({ where: { source: "karrot_devolucion", method: { startsWith: "TARJETA" }, date: { gte: process.argv[2] ?? "2026-09-01" } } });
  const dias = [...new Set(devs.map((d) => `${d.storeCode}|${d.date}`))].sort();
  for (const k of dias) {
    const [S, D] = k.split("|");
    const v = await prisma.sale.findMany({ where: { storeCode: S, date: D, method: { in: ["TARJETA_DEBITO", "TARJETA_CREDITO"] } } });
    const t = await prisma.dataphoneEntry.findMany({ where: { storeCode: S, txDate: D } });
    const c = cruzarDatafono(v.map((x) => ({ id: x.invoice, amount: x.amount, autorizacion: x.autorizacion, ultimos4: x.ultimos4 })), t.map((x) => ({ id: x.id, gross: x.gross, autorizacion: x.autorizacion, ultimos4: x.ultimos4 })));
    console.log(S, D, "falta", c.falta, "sobra", c.sobra, c.posSueltos.map((p) => `${p.id} ${p.amount}`).join(", "), c.txSueltas.map((x) => `tx ${x.gross}`).join(", "));
  }
  process.exit(0);
}
main();
