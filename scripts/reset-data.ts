// Limpia corridas y asignaciones de referencias (deja tiendas y festivos)
import { prisma } from "../src/lib/db";

async function main() {
  const r = await prisma.run.deleteMany();
  const c = await prisma.cashReference.deleteMany();
  console.log("Eliminadas corridas:", r.count, "| referencias:", c.count);
  console.log("Tiendas:", await prisma.store.count(), "| Festivos:", await prisma.holiday.count());
}

main().then(() => process.exit(0));
