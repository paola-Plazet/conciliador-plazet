// Reasigna a B1 (ref 3102874360) las dos consignaciones de Mariana que
// entraron con la ref vieja de B3 (3138845101) tras su traslado a Plaza.
import { prisma } from "../src/lib/db";
async function main() {
  const r = await prisma.bankEntry.updateMany({
    where: { id: { in: [6352, 6344] }, reference: "3138845101" },
    data: { reference: "3102874360" },
  });
  console.log("Filas actualizadas:", r.count);
  process.exit(0);
}
main();
