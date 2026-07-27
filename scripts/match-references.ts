// Intenta identificar a qué tienda pertenece cada referencia bancaria SIN
// ASIGNAR, probando el mismo calce secuencial (1..N días acumulados, ±$500)
// que usa el motor en engine.ts, pero fijando la tienda candidata en vez de
// usar el mapeo real. Si una referencia calza casi al 100% con una sola
// tienda (y no con las demás), es evidencia fuerte de que le pertenece.
import fs from "node:fs";
import * as XLSX from "xlsx";
import { processFiles } from "../src/lib/process";
import { formatCOP } from "../src/lib/money";
import { within, DEFAULT_TOLERANCE } from "../src/lib/money";
import { STORES } from "../src/lib/stores";
import type { SaleInvoice } from "../src/lib/types";

const src = XLSX.readFile(
  "C:/Users/Paola Agreda/OneDrive/Escritorio/conciliacion.xlsx",
);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, src.Sheets["ALIANZA EFECTIVO"], "Movimientos");
const bancoBuf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

const transBuf = fs.readFileSync(
  "C:/Users/Paola Agreda/Downloads/Alegra - Reporte de transacciones - HABBIE SAS -.xlsx",
);

interface DayAmount {
  date: string;
  amount: number;
}

/** Igual al calce secuencial de conciliarEfectivo, pero para un solo par
 * (tienda candidata, referencia candidata) — devuelve cuántos depósitos
 * calzan dentro de tolerancia y cuántos no. */
function scoreMatch(
  salesDays: DayAmount[],
  deposits: DayAmount[],
  tolerance: number,
  maxGroupDays: number,
): { ok: number; total: number; misses: { date: string; amount: number; bestDiff: number }[] } {
  let ptr = 0;
  let ok = 0;
  const misses: { date: string; amount: number; bestDiff: number }[] = [];

  for (const dep of deposits) {
    const available: DayAmount[] = [];
    let j = ptr;
    while (j < salesDays.length && salesDays[j].date < dep.date) {
      available.push(salesDays[j]);
      j++;
    }
    if (available.length === 0) {
      misses.push({ date: dep.date, amount: dep.amount, bestDiff: dep.amount });
      continue;
    }
    let matchEnd = -1;
    let cum = 0;
    let bestCum = 0;
    let bestDiff = Infinity;
    const limit = Math.min(available.length, maxGroupDays);
    for (let k = 0; k < limit; k++) {
      cum += available[k].amount;
      if (Math.abs(cum - dep.amount) < bestDiff) bestDiff = Math.abs(cum - dep.amount);
      if (within(cum, dep.amount, tolerance)) {
        matchEnd = k;
        bestCum = cum;
        break;
      }
    }
    if (matchEnd >= 0) {
      ok++;
      ptr += matchEnd + 1;
    } else {
      misses.push({ date: dep.date, amount: dep.amount, bestDiff });
    }
  }
  return { ok, total: deposits.length, misses };
}

async function main() {
  const out = await processFiles({ alegraTrans: transBuf, banco: bancoBuf });

  const unassigned = out.references.filter((r) => r.storeCode === null);
  if (unassigned.length === 0) {
    console.log("No hay referencias sin asignar.");
    return;
  }

  console.log(`Referencias sin asignar: ${unassigned.length}\n`);

  // Ventas en efectivo por tienda (para probar cada candidata)
  const salesByStore = new Map<string, DayAmount[]>();
  for (const s of out.sales as SaleInvoice[]) {
    if (s.method !== "EFECTIVO" || !s.storeCode) continue;
    const arr = salesByStore.get(s.storeCode) ?? [];
    arr.push({ date: s.date, amount: s.amount });
    salesByStore.set(s.storeCode, arr);
  }
  for (const [store, arr] of salesByStore) {
    arr.sort((a, b) => a.date.localeCompare(b.date));
    // colapsar por día (por si hay varias filas del mismo día)
    const byDay = new Map<string, number>();
    for (const d of arr) byDay.set(d.date, (byDay.get(d.date) ?? 0) + d.amount);
    salesByStore.set(
      store,
      [...byDay.entries()].map(([date, amount]) => ({ date, amount })).sort((a, b) => a.date.localeCompare(b.date)),
    );
  }

  for (const ref of unassigned) {
    const deposits = out.bank
      .filter((b) => b.kind === "RECAUDO_EFECTIVO" && b.reference === ref.reference)
      .map((b) => ({ date: b.date, amount: b.amount }))
      .sort((a, b) => a.date.localeCompare(b.date));

    console.log(
      `── Ref ${ref.reference} (${ref.count}x, total ${formatCOP(ref.total)}) ──`,
    );

    const scores: { store: string; name: string; ok: number; total: number }[] = [];
    for (const s of STORES) {
      const salesDays = salesByStore.get(s.code) ?? [];
      if (salesDays.length === 0) continue;
      const { ok, total } = scoreMatch(salesDays, deposits, DEFAULT_TOLERANCE, 6);
      scores.push({ store: s.code, name: s.name, ok, total });
    }
    scores.sort((a, b) => b.ok / b.total - a.ok / a.total);
    for (const sc of scores) {
      const pct = ((sc.ok / sc.total) * 100).toFixed(0);
      console.log(`   ${sc.name.padEnd(24)} ${sc.ok}/${sc.total} calzan (${pct}%)`);
    }
    const best = scores[0];
    const second = scores[1];
    if (best && best.ok === best.total && (!second || second.ok < second.total)) {
      console.log(`   => CANDIDATA CLARA: ${best.name} (100% de calce, única tienda que ajusta todo)`);
    } else if (best) {
      console.log(`   => sin candidata inequívoca (mejor: ${best.name} ${best.ok}/${best.total})`);
    }
    console.log();
  }
}

main().then(() => process.exit(0));
