// Para cada día/tienda con DIFERENCIA de datáfono (desde jul-2026), corre el
// detalle transacción por transacción (/api/datafono-dia) y muestra cuál es la
// que no cuadra.   npx tsx scripts/datafono-revisar.ts [YYYY-MM]
import { NextRequest } from "next/server";
import { prisma } from "../src/lib/db";
import { computeLedger } from "../src/lib/ledger";
import { GET } from "../src/app/api/datafono-dia/route";
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
async function main() {
  const mes = process.argv[2] ?? "";
  const led = await computeLedger();
  const casos = led.summary.results
    .filter((r) => r.channel === "DATAFONO" && r.status === "DIFERENCIA" && r.storeCode && (r.month ?? r.depositDate.slice(0, 7)) >= "2026-07")
    .filter((r) => !mes || (r.month ?? r.depositDate.slice(0, 7)) === mes);
  console.log("días con DIFERENCIA de datáfono:", casos.length);
  for (const c of casos) {
    for (const date of c.salesDates) {
      const d = (await (await GET(new NextRequest(`http://localhost/api/datafono-dia?date=${date}&store=${c.storeCode}`))).json()) as any;
      const malos = d.pos.filter((p: any) => !p.match || p.match.difValor !== 0);
      console.log(`\n${c.storeCode} ${date}: POS ${fmt(d.totales.pos)} · datáfono ${fmt(d.totales.datafono)} · dif ${fmt(d.totales.dif)} · aut=${d.tieneAutorizacion} · ${d.pos.length} pagos POS / ${d.pos.length - malos.length} cruzan`);
      for (const p of malos)
        console.log(`   POS fac ${p.invoice} ${p.hora ?? ""} ${p.franquicia ?? ""} ${p.tipo} ····${p.ultimos4 ?? "?"} aut ${p.autorizacion ?? "—"} ${fmt(p.amount)} → ${p.match ? `datáfono ${fmt(p.match.gross)} (aut ${p.match.autorizacion}) dif ${fmt(p.match.difValor)}` : "NO ESTÁ EN EL DATÁFONO"}`);
      for (const t of d.sueltas) console.log(`   DATÁFONO sin POS: ${t.franchise} ${t.cardType} ····${t.ultimos4 ?? "?"} aut ${t.autorizacion ?? "—"} ${fmt(t.gross)}`);
    }
  }
  await prisma.$disconnect();
}
main();
