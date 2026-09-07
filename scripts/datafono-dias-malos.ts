// ¿Qué compone la diferencia banco vs Conciliar en los días que no cuadran?
import * as XLSX from "xlsx";
import { readFileSync } from "fs";
import { prisma } from "../src/lib/db";
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
const ymd = (s: number) => new Date(Math.round((s - 25569) * 86400000)).toISOString().slice(0, 10);
async function main() {
  const wb = XLSX.read(readFileSync("C:/Users/Paola Agreda/OneDrive/Escritorio/HABBIE/PLAZET/MOVIMIENTOS BANCOS/movimientos bancos.xlsx"), { type: "buffer" });
  const rows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets["mov bancolombia"], { header: 1, raw: true, defval: null });
  const abonos = new Map<string, number>();
  for (const r of rows.slice(1)) if (typeof r[1] === "number" && typeof r[2] === "number" && /^ABONO NETO (MASTER|VISA)/i.test(String(r[4] ?? "")))
    { const d = ymd(r[1]); abonos.set(d, (abonos.get(d) ?? 0) + (r[2] as number)); }
  const dataf = await prisma.dataphoneEntry.findMany();
  const porDia = new Map<string, Map<string, number>>(); // date -> per store/cardType net
  const netoDia = new Map<string, number>();
  for (const t of dataf) {
    netoDia.set(t.depositDate, (netoDia.get(t.depositDate) ?? 0) + t.net);
    const m = porDia.get(t.depositDate) ?? new Map<string, number>();
    m.set(`${t.storeCode ?? t.establishment}·${t.franchise}·${t.cardType}`, (m.get(`${t.storeCode ?? t.establishment}·${t.franchise}·${t.cardType}`) ?? 0) + t.net);
    porDia.set(t.depositDate, m);
  }
  let n = 0;
  for (const [d, v] of [...abonos.entries()].sort()) {
    const c = netoDia.get(d) ?? 0; const dif = v - c;
    if (Math.abs(dif) <= 1500 || c === 0) continue;
    n++;
    // ¿la diferencia calza con algún grupo (tienda·franquicia·tipo) exacto?
    const grupos = [...(porDia.get(d) ?? new Map())].filter(([, g]) => Math.abs(g + dif) < 2000);
    console.log(`${d}: dif ${fmt(dif)}${grupos.length ? "  ← calza con " + grupos.map(([k, g]) => `${k} (${fmt(g)})`).join(" | ") : ""}`);
    if (n >= 45) break;
  }
  await prisma.$disconnect();
}
main();
