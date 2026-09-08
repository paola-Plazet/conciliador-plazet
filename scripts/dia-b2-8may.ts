import { NextRequest } from "next/server";
import { GET as dash } from "../src/app/api/dashboard/route";
import { GET as datDia } from "../src/app/api/datafono-dia/route";
import { GET as qrDia } from "../src/app/api/qr-dia/route";
import { prisma } from "../src/lib/db";
import { computeLedger } from "../src/lib/ledger";
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
async function main() {
  const d = (await (await dash(new NextRequest("http://localhost/api/dashboard?month=2026-05"))).json()) as any;
  for (const x of d.data.B2.days) if (x.date >= "2026-05-06" && x.date <= "2026-05-11") console.log(x.date, JSON.stringify({ efe: x.efe, tar: x.tar, qrVenta: x.qrVenta, qrBanco: x.qrBanco, qrDif: x.qrDif, mp: x.mercadopago, rappi: x.rappi, addi: x.addi, otros: x.otros }));
  const led = await computeLedger();
  for (const r of led.summary.results) if (r.storeCode === "B2" && r.salesDates.some((s) => s >= "2026-05-06" && s <= "2026-05-11")) console.log("LEDGER", r.channel, r.status, "ventas", r.salesDates.join("+"), "dep", r.depositDate, "dif", r.difference, r.note ?? "", (r as any).manualNote ?? "");
  const t = (await (await datDia(new NextRequest("http://localhost/api/datafono-dia?date=2026-05-08&store=B2"))).json()) as any;
  console.log("\nDATÁFONO 8-may B2:", JSON.stringify(t.totales), "devuelto", t.devueltoDatafono);
  for (const p of t.pos) if (!p.match || p.match.difValor !== 0) console.log("   POS", p.invoice, fmt(p.amount), p.match ? `↔ datáfono ${fmt(p.match.gross)}` : "SIN datáfono");
  for (const s of t.sueltas) console.log("   DATÁFONO sin POS", fmt(s.gross), s.franchise, s.cardType);
  const q = (await (await qrDia(new NextRequest("http://localhost/api/qr-dia?date=2026-05-08&store=B2"))).json()) as any;
  console.log("\nQR 8-may B2 facturas:", q.facturas.map((f: any) => `${f.invoice} ${fmt(f.amount)} → ${f.pago ? f.pago.payer + " " + fmt(f.pago.amount) + " " + f.pago.date : "sin pago"}`).join(" | "));
  const ventas = await prisma.sale.findMany({ where: { storeCode: "B2", date: "2026-05-08" }, orderBy: { amount: "desc" } });
  const porMet: Record<string, number> = {}; for (const v of ventas) porMet[v.method + (v.method === "OTRO" ? "(" + v.bodega.split(" · ").pop() + ")" : "")] = (porMet[v.method + (v.method === "OTRO" ? "(" + v.bodega.split(" · ").pop() + ")" : "")] ?? 0) + v.amount;
  console.log("\nVENTAS 8-may B2 por método:", JSON.stringify(porMet), "| ventas de 23.800 o 700:", ventas.filter((v) => [23800, 700].includes(Math.round(v.amount))).map((v) => `${v.method} fac ${v.invoice} ${v.bodega}`).join(" ; ") || "ninguna");
  const bank = await prisma.bankEntry.findMany({ where: { date: { gte: "2026-05-08", lte: "2026-05-12" }, storeCode: "B2" } as any });
  console.log("BANCO efectivo B2 8–12 may:", bank.map((b) => `${b.date} ${fmt(b.amount)} ref ${b.reference}`).join(" | "));
  await prisma.$disconnect();
}
main();
