// Prueba de solo lectura del canal web: token + pedidos de las dos tiendas.
//   npx tsx scripts/test-shopify.ts
import "dotenv/config";
import { shopConfigs, fetchWebOrders } from "../src/lib/shopify";

const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");

async function main() {
  const cfgs = shopConfigs();
  console.log("Tiendas con credenciales:", cfgs.map((c) => c.key).join(", ") || "NINGUNA");
  for (const cfg of cfgs) {
    const orders = await fetchWebOrders(cfg);
    const total = orders.reduce((s, o) => s + o.amount, 0);
    const refunds = orders.reduce((s, o) => s + o.refund, 0);
    console.log(`\n=== ${cfg.label}: ${orders.length} pedidos pagados desde abr-2026 · ${fmt(total)} · reembolsos ${fmt(refunds)}`);
    for (const o of orders.slice(-5)) {
      console.log("  ", o.date, o.name.padEnd(14), fmt(o.amount).padStart(11), o.refund ? `reembolso ${fmt(o.refund)} (${o.refundDate})` : "", o.financial);
    }
  }
}
main();
