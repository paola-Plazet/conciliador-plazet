import { prisma } from "../src/lib/db";

async function main() {
  console.log("Corridas:", await prisma.run.count());
  console.log("Referencias asignadas:", await prisma.cashReference.count());
  console.log("Tiendas:", await prisma.store.count());
  console.log("Festivos:", await prisma.holiday.count());
}

main().then(() => process.exit(0));
