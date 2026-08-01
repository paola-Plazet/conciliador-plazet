// Actualización de la deuda con Natural Light: al saldo del cruce Linux
// (Habbie debe $33.883.565, corte ~5-may con Rappi de abril incluido) se le
// restan los recaudos que NL siguió recibiendo por cuenta de Habbie:
// Rappi y Addi de mayo en adelante (van a cuentas/plataformas de NL).
import { prisma } from "../src/lib/db";
import { storeName } from "../src/lib/stores";

const SALDO_CRUCE = -33_883_565; // negativo = Habbie le debe a NL
const fmt = (n: number) => "$" + Math.round(Math.abs(n)).toLocaleString("es-CO");

async function main() {
  const ventas = await prisma.sale.findMany({ where: { date: { gte: "2026-05-01" } } });
  const esNL = (b: string) => /RAPPI|ADDI/i.test(b);
  const plataforma = (b: string) => (/RAPPI/i.test(b) ? "Rappi" : "Addi");

  const porMes = new Map<string, { rappi: number; addi: number }>();
  const detalle: { date: string; plat: string; tienda: string; amount: number; invoice: string }[] = [];
  for (const v of ventas) {
    if (!esNL(v.bodega)) continue;
    const mes = v.date.slice(0, 7);
    const e = porMes.get(mes) ?? { rappi: 0, addi: 0 };
    if (plataforma(v.bodega) === "Rappi") e.rappi += v.amount;
    else e.addi += v.amount;
    porMes.set(mes, e);
    detalle.push({ date: v.date, plat: plataforma(v.bodega), tienda: storeName(v.storeCode), amount: v.amount, invoice: v.invoice });
  }

  console.log("RECAUDOS DE NL POR CUENTA DE HABBIE desde el 1-may (Rappi/Addi):\n");
  let total = 0;
  for (const [mes, e] of [...porMes].sort()) {
    console.log(`   ${mes}   Rappi ${fmt(e.rappi).padStart(12)}   Addi ${fmt(e.addi).padStart(12)}`);
    total += e.rappi + e.addi;
  }
  console.log(`   TOTAL  ${fmt(total)}`);

  console.log("\nDetalle (ventas individuales):");
  for (const d of detalle.sort((a, b) => a.date.localeCompare(b.date)))
    console.log(`   ${d.date}  ${d.plat.padEnd(6)} ${d.tienda.padEnd(22)} ${fmt(d.amount).padStart(11)}  fac ${d.invoice}`);

  console.log("\n──────── SALDO ────────");
  console.log(`Saldo del cruce Linux (Habbie debe a NL)   ${fmt(SALDO_CRUCE)}`);
  console.log(`− Rappi/Addi recaudados por NL desde mayo  ${fmt(total)}`);
  const saldo = SALDO_CRUCE + total;
  console.log(`= SALDO ACTUALIZADO: ${saldo < 0 ? "HABBIE LE DEBE A NL" : "NL LE DEBE A HABBIE"} ${fmt(saldo)}`);
  console.log("\n(OJO: sin contar pagos/abonos entre cuentas después del cruce — confirmar con Paola)");
  process.exit(0);
}
main();
