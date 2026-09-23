// Carga los CSV que entrega el conector de Karrot (MCP generate-report):
//   CUSTOMER_CREDIT_NOTES  → tabla CreditNote
//   CASHIER_BALANCE        → tabla CashierClose (solo cierres) + ventas NEGATIVAS
//                            sintéticas (source karrot_devolucion), una por NC,
//                            en el método por donde salió la plata, para que el
//                            motor y el tablero las descuenten del canal correcto.
//   npx tsx scripts/cargar-karrot-mcp.ts <archivo.csv> [...]
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/db";
import type { Prisma } from "../src/generated/prisma/client";
import {
  detectKarrotMcp, parseCreditNotesCsv, parseCashierBalanceCsv, metodoCierre, SOURCE_DEVOLUCION,
} from "../src/lib/parsers/karrot-mcp";

const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");

async function main() {
  const rutas = process.argv.slice(2).filter((p) => fs.existsSync(p));
  if (!rutas.length) { console.log("Uso: npx tsx scripts/cargar-karrot-mcp.ts <csv> [...]"); process.exit(1); }
  const fechasCierre = new Set<string>();
  for (const p of rutas) {
    const text = fs.readFileSync(p, "utf8");
    const kind = detectKarrotMcp(text);
    console.log(path.basename(p), "→", kind);
    if (kind === "credit_notes") {
      const nc = parseCreditNotesCsv(text);
      // la ubicación no viene en este reporte: se toma de la venta (orderReceipt) si está cargada
      for (const n of nc) {
        if (!n.storeCode && n.orderReceipt) {
          const venta = await prisma.sale.findFirst({ where: { invoice: n.orderReceipt, source: "karrot", storeCode: { not: null } }, orderBy: { id: "desc" } });
          if (venta) { n.storeCode = venta.storeCode; n.location = venta.bodega.split(" · ")[0]; }
        }
        await prisma.creditNote.upsert({ where: { ncId: n.ncId }, create: n, update: n });
        console.log(`   NC ${n.ncNumber} ${n.date} ${n.storeCode ?? "?"} venta ${n.orderReceipt} bruto ${fmt(n.gross)} dcto ${fmt(n.discount)} neto ${fmt(n.net)} · ${n.customer}`);
      }
    } else if (kind === "cashier_balance") {
      const cierres = parseCashierBalanceCsv(text);
      for (const c of cierres) {
        await prisma.cashierClose.upsert({ where: { batchId_method: { batchId: c.batchId, method: c.method } }, create: c, update: c });
        fechasCierre.add(c.date);
      }
      console.log(`   ${cierres.length} filas de cierre en ${fechasCierre.size} día(s)`);
    } else {
      console.log("   ⚠ formato no reconocido, se omite");
    }
  }

  // Reconstruir las devoluciones sintéticas de los días cargados: UNA por nota crédito, con el
  // método de la venta original (Sale del POS) y el método por donde salió la plata (Returns del
  // cierre de caja). Lo que el cierre devolvió y no se explica con una NC queda como DEV-<batch>.
  if (fechasCierre.size) {
    const fechas = [...fechasCierre].sort();
    await prisma.sale.deleteMany({ where: { source: SOURCE_DEVOLUCION, date: { in: fechas } } });
    const cierres = await prisma.cashierClose.findMany({ where: { date: { in: fechas }, returns: { not: 0 }, storeCode: { not: null } } });
    const exacta = (n: { net: number; date: string }, c: (typeof cierres)[number]) => c.date === n.date && Math.abs(-c.returns - n.net) <= 50;
    const notas = (await prisma.creditNote.findMany({ where: { date: { in: fechas } } }))
      // sin tienda (la venta original no está cargada): si UN solo cierre del día devolvió exacto ese valor, es de esa tienda
      .map((n) => {
        if (n.storeCode) return n;
        const cs = cierres.filter((c) => exacta(n, c));
        return cs.length === 1 ? { ...n, storeCode: cs[0].storeCode, location: cs[0].location } : n;
      })
      // primero las que calzan exacto con un cierre (para que otra no les tome la devolución), luego por número
      .sort((a, b) => Number(cierres.some((c) => c.storeCode === b.storeCode && exacta(b, c))) - Number(cierres.some((c) => c.storeCode === a.storeCode && exacta(a, c))) || Number(a.ncNumber) - Number(b.ncNumber));
    const filas: Prisma.SaleCreateManyInput[] = [];
    for (const n of notas) {
      const orig = n.orderReceipt
        ? await prisma.sale.findMany({ where: { invoice: n.orderReceipt, source: { notIn: ["linux", SOURCE_DEVOLUCION] } }, orderBy: { amount: "desc" } })
        : [];
      // método de la venta original ("OTRO" de la web: el bodega trae la plataforma, ej. "PRINCIPAL · Mercadopago")
      const metodoOriginal = [...new Set(orig.map((v) => (v.method === "OTRO" && v.bodega.includes(" · ") ? v.bodega.split(" · ").pop()! : v.method)))].join(" + ") || null;
      if (!n.storeCode) {
        await prisma.creditNote.update({ where: { id: n.id }, data: { metodoOriginal, metodoDevolucion: null } });
        if (Math.abs(n.net) >= 5_000_000) continue; // traslados de inventario NL facturados (jul), no son ventas
        console.log(`   NC ${n.ncNumber} ${n.date} fac ${n.orderReceipt} ${fmt(n.net)} · venta ${metodoOriginal ?? "?"} fuera de las tiendas (web) — no toca el cuadre de tiendas`);
        continue;
      }
      // cierres de la misma tienda y día con devoluciones por explicar; primero el del mismo método de la venta
      const mismoMetodo = (x: (typeof cierres)[number]) => orig.some((v) => metodoCierre(x.method) === metodoCierre(v.method) || (metodoCierre(x.method) === "TARJETA_DEBITO" && v.method.startsWith("TARJETA")));
      const libres = cierres
        .filter((c) => c.storeCode === n.storeCode && c.date === n.date && c.returns < 0)
        .sort((x, y) => Number(mismoMetodo(y)) - Number(mismoMetodo(x)) || x.returns - y.returns);
      const una = libres.find((c) => exacta(n, c) && mismoMetodo(c)) ?? libres.find((c) => exacta(n, c))
        ?? libres.find((c) => -c.returns >= n.net - 50 && mismoMetodo(c)) ?? libres.find((c) => -c.returns >= n.net - 50);
      // si ningún método solo alcanza, la devolución se partió (ej. $56.000 datáfono + $100 efectivo)
      const partes: { c: (typeof cierres)[number]; monto: number }[] = [];
      if (una) partes.push({ c: una, monto: Math.min(n.net, -una.returns) });
      else if (libres.reduce((t, c) => t - c.returns, 0) >= n.net - 50) {
        let resta = n.net;
        for (const c of libres) { if (resta <= 0) break; const m = Math.min(resta, -c.returns); partes.push({ c, monto: m }); resta -= m; }
      }
      const metodoDevolucion = partes.map((x) => x.c.method).join(" + ") || null;
      await prisma.creditNote.update({ where: { id: n.id }, data: { metodoOriginal, metodoDevolucion, storeCode: n.storeCode, location: n.location } });
      if (!partes.length) { console.log(`   ⚠ NC ${n.ncNumber} ${n.date} ${n.storeCode} fac ${n.orderReceipt} ${fmt(n.net)} (pagada con ${metodoOriginal ?? "?"}): el cierre de caja no muestra devolución — ¿se anuló sin devolver plata?`); continue; }
      const tarjeta = orig.find((v) => v.method.startsWith("TARJETA"));
      if (!orig.length) {
        // la factura anulada no está entre las ventas cargadas (Karrot no trae las anuladas): no hay nada
        // que cancelar, así que la devolución tampoco se descuenta (si no, saldría como sobra)
        for (const { c, monto } of partes) c.returns += monto;
        console.log(`   NC ${n.ncNumber} ${n.date} ${n.storeCode} fac ${n.orderReceipt} ${fmt(n.net)} · factura anulada (no está en las ventas) → devuelta por ${metodoDevolucion}; no se descuenta`);
        continue;
      }
      for (const { c, monto } of partes) {
        c.returns += monto; // lo que queda del cierre sin explicar
        const metodo = metodoCierre(c.method) === "TARJETA_DEBITO" && tarjeta ? tarjeta.method : metodoCierre(c.method);
        filas.push({
          date: n.date,
          invoice: partes.length > 1 ? `NC${n.ncNumber}-${c.method.slice(0, 3).toUpperCase()}` : `NC${n.ncNumber}`,
          bodega: `${c.location} · NC ${n.ncNumber} de la fac ${n.orderReceipt} (pagada con ${metodoOriginal ?? "?"}, devuelta por ${metodoDevolucion})`,
          storeCode: n.storeCode,
          method: metodo,
          amount: -monto,
          source: SOURCE_DEVOLUCION,
          ...(metodo.startsWith("TARJETA") && tarjeta ? { franquicia: tarjeta.franquicia, autorizacion: tarjeta.autorizacion, ultimos4: tarjeta.ultimos4 } : {}),
        });
      }
      console.log(`   NC ${n.ncNumber} ${n.date} ${n.storeCode} fac ${n.orderReceipt} ${fmt(n.net)} · pagada con ${metodoOriginal ?? "?"} → devuelta por ${partes.map((x) => `${x.c.method} ${fmt(x.monto)}`).join(" + ")}`);
    }
    for (const c of cierres) if (Math.abs(c.returns) >= 50) {
      filas.push({ date: c.date, invoice: `DEV-${c.batchId}`, bodega: `${c.location} · devolución sin NC`, storeCode: c.storeCode, method: metodoCierre(c.method), amount: c.returns, source: SOURCE_DEVOLUCION });
      console.log(`   ⚠ DEVOLUCIÓN SIN NC ${c.date} ${c.storeCode} ${c.method} ${fmt(c.returns)} (${c.user})`);
    }
    if (filas.length) await prisma.sale.createMany({ data: filas });
    // faltantes contados por la asesora (efectivo): sistema vs contado
    const efe = await prisma.cashierClose.findMany({ where: { date: { in: fechas }, method: { contains: "fectivo" } } });
    for (const c of efe) if (Math.abs(c.systemBalance - c.countedBalance) >= 500)
      console.log(`   ⚠ CAJA ${c.date} ${c.storeCode} contado ${fmt(c.countedBalance)} vs sistema ${fmt(c.systemBalance)} → ${fmt(c.countedBalance - c.systemBalance)} (${c.user})`);
  }
  await prisma.$disconnect();
}
main();
