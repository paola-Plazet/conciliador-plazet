import { NextRequest } from "next/server";
import { GET } from "../src/app/api/dashboard/route";
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
async function main() {
  const d = (await (await GET(new NextRequest("http://localhost/api/dashboard?from=2026-05-01&to=2026-07-31"))).json()) as any;
  console.log("rango", JSON.stringify(d.rango), "month", d.month);
  for (const [st, v] of Object.entries(d.data as Record<string, any>)) console.log(`${st}: días ${v.days.length} | efectivo falta ${fmt(v.totales.efeFaltaTotal)} sobra ${fmt(v.totales.efeSobraTotal)} | datáfono falta ${fmt(v.totales.tarFaltaTotal)} sobra ${fmt(v.totales.tarSobraTotal)} | QR falta ${fmt(v.totales.qrFaltaTotal)} sobra ${fmt(v.totales.qrSobraTotal)}`);
  const b3 = (d.data.B3.days as any[]).find((x) => x.date === "2026-06-28");
  console.log("B3 28-jun:", JSON.stringify(b3.tar));
}
main();
