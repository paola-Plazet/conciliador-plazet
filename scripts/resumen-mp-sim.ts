// ¿Cuánta falta/sobra artificial genera el cruce MP por DÍA vs por MES?
import { prisma } from "../src/lib/db";
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
async function main() {
  const [salesRows, mpRows] = await Promise.all([
    prisma.sale.findMany({ where: { bodega: { contains: "MERCADO", mode: "insensitive" } } }),
    prisma.mercadopagoEntry.findMany(),
  ]);
  const vDia = new Map<string, number>(), rDia = new Map<string, number>();
  for (const s of salesRows) vDia.set(s.date, (vDia.get(s.date) ?? 0) + s.amount);
  for (const e of mpRows) rDia.set(e.date, (rDia.get(e.date) ?? 0) + e.bruto);
  let faltaD = 0, sobraD = 0;
  for (const d of new Set([...vDia.keys(), ...rDia.keys()])) {
    const f = (vDia.get(d) ?? 0) - (rDia.get(d) ?? 0);
    if (f > 0) faltaD += f; else sobraD += -f;
  }
  console.log("Cruce por DÍA (como está hoy):    falta", fmt(faltaD), "· sobra", fmt(sobraD));
  const vMes = new Map<string, number>(), rMes = new Map<string, number>();
  for (const [d, v] of vDia) vMes.set(d.slice(0, 7), (vMes.get(d.slice(0, 7)) ?? 0) + v);
  for (const [d, v] of rDia) rMes.set(d.slice(0, 7), (rMes.get(d.slice(0, 7)) ?? 0) + v);
  let faltaM = 0, sobraM = 0;
  for (const m of new Set([...vMes.keys(), ...rMes.keys()])) {
    const f = (vMes.get(m) ?? 0) - (rMes.get(m) ?? 0);
    if (f > 0) faltaM += f; else sobraM += -f;
  }
  console.log("Cruce por MES (propuesto):        falta", fmt(faltaM), "· sobra", fmt(sobraM));
  await prisma.$disconnect();
}
main();
