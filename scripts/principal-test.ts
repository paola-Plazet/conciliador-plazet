import { conciliarPrincipal } from "../src/lib/principal-cruce";
import { prisma } from "../src/lib/db";
async function main() {
  const o = await conciliarPrincipal("2026-09");
  const g: Record<string, number> = {};
  for (const f of o.facturas) { const k = `${f.canal}|${f.cobro ? f.cobro.tipo : "NADA"}`; g[k] = (g[k] ?? 0) + 1; }
  console.log(g, { mpHasta: o.mpHasta, bancoHasta: o.bancoHasta, karrotHasta: o.karrotHasta });
  for (const f of o.facturas.filter((f) => f.aviso || f.dif)) console.log(f.invoice, f.date, f.metodo, f.amount, f.cliente, "|", f.aviso, f.dif, f.cobro?.tipo === "banco" ? f.cobro.concepto : "");
  console.log("SIN FACTURA", o.sinFactura.map((c) => [c.date, c.bruto, c.origen, c.pedido, c.reciente ? "reciente" : ""].join(" "))); for (const f of o.facturas.filter(f=>f.posible||f.grupo)) console.log("POS/GRUPO", f.invoice, f.amount, f.grupo, f.posible && [f.posible.date, f.posible.bruto, f.posible.origen, f.posible.pedido]);
}
main().finally(() => prisma.$disconnect());
