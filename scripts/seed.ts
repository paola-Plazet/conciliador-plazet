import { prisma } from "../src/lib/db";
import { STORES } from "../src/lib/stores";
import { holidaysForYears } from "../src/lib/holidays";

async function main() {
  // Tiendas
  for (const s of STORES) {
    await prisma.store.upsert({
      where: { code: s.code },
      update: {
        name: s.name,
        alegraBodega: s.alegraBodega,
        establishment: s.establishment,
        terminalVisa: s.terminalVisa,
        terminalMaster: s.terminalMaster,
      },
      create: {
        code: s.code,
        name: s.name,
        alegraBodega: s.alegraBodega,
        establishment: s.establishment,
        terminalVisa: s.terminalVisa,
        terminalMaster: s.terminalMaster,
      },
    });
  }
  console.log(`Tiendas: ${STORES.length} sembradas`);

  // Festivos 2025-2027
  const holidays = holidaysForYears([2025, 2026, 2027]);
  for (const h of holidays) {
    await prisma.holiday.upsert({
      where: { date: h.date },
      update: { name: h.name },
      create: { date: h.date, name: h.name },
    });
  }
  console.log(`Festivos: ${holidays.length} sembrados (2025-2027)`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
