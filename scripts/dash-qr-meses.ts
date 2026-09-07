import { NextRequest } from "next/server";
import { GET } from "../src/app/api/dashboard/route";
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
async function main() {
  for (const m of ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]) {
    const d = (await (await GET(new NextRequest(`http://localhost/api/dashboard?month=${m}`))).json()) as any;
    const r = d.qrResumen;
    const tiendas = Object.entries(d.data as Record<string, any>).map(([st, v]) => {
      const t = v.totales ?? {};
      const dias = (v.days as any[]).filter((x) => (x.qrDif ?? 0) > 500 || (x.qrDif ?? 0) < -500);
      return `${st} dif ${fmt(t.qrDif ?? dias.reduce((s, x) => s + x.qrDif, 0))} (${dias.length} días)`;
    });
    console.log(`${m}: asignado ${fmt(r.asignado)} · sin asignar ${fmt(r.sinAsignar)} · por revisar ${r.revisar.length} | ${tiendas.join(" · ")}`);
    if (m === "2026-05") for (const x of d.data.B1.days) if (["2026-05-07", "2026-05-08"].includes(x.date)) console.log("   B1", x.date, JSON.stringify({ qrVenta: x.qrVenta, qrBanco: x.qrBanco, qrDif: x.qrDif }));
  }
}
main();
