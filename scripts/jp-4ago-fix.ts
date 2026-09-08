// JP 4-ago-2026: (1) referencia de banco 31483657 → Jardín Plaza (depósito 105.050 del 5-ago);
// (2) factura 3774: el "Bono Regalo" de 87.550 fue efectivo (la factura 3748 en efectivo se anuló
// y se rehízo con bono, pero la plata se consignó) → reclasificar a Efectivo.
import { prisma } from "../src/lib/db";
import { reclasificarVenta } from "../src/lib/overrides";
import { computeLedger } from "../src/lib/ledger";
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
async function main() {
  const jp = await prisma.store.findFirst({ where: { code: "JP" } });
  if (!jp) throw new Error("no hay tienda JP");
  const ref = await prisma.cashReference.findFirst({ where: { reference: "31483657" } });
  if (!ref) { await prisma.cashReference.create({ data: { reference: "31483657", storeId: jp.id } }); console.log("referencia 31483657 → JP creada"); }
  else { await prisma.cashReference.update({ where: { id: ref.id }, data: { storeId: jp.id } }); console.log("referencia 31483657 → JP actualizada"); }
  const f = await reclasificarVenta({ date: "2026-08-04", storeCode: "JP", invoice: "3774", amount: 87550, plataforma: "Efectivo", nota: "Factura 3748 en efectivo anulada y rehecha como Bono Regalo; la plata sí se consignó (105.050 el 5-ago, ref 31483657)", autor: "Claude (revisión Paola 07-sep)" });
  console.log("override #" + f.id, "→ Efectivo");
  const led = await computeLedger();
  for (const r of led.summary.results) if (r.storeCode === "JP" && r.channel === "EFECTIVO" && r.salesDates.some((s) => s >= "2026-08-03" && s <= "2026-08-06")) console.log("JP", r.status, r.salesDates.join("+"), "venta", fmt(r.salesAmount), "dep", r.depositDate, fmt(r.depositAmount), "dif", fmt(r.difference), r.note ?? "");
  await prisma.$disconnect();
}
main();
