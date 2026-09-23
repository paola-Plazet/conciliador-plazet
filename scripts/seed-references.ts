// Siembra el mapeo referencia de consignación -> tienda, confirmado por Paola
// en su cruce manual (conciliacion.xlsx, hoja "REF TIENDAS", jul 2026).
// Cada tienda consigna efectivo con la(s) referencia(s) fija(s) indicadas.

import { prisma } from "../src/lib/db";

const REFS: [string, string][] = [
  // Referencias FIJAS por tienda (23-sep-2026): una por tienda, para que nadie consigne con su celular.
  // Elegidas para que un error de un dígito no caiga en otra tienda válida.
  ["1001", "B1"], // Plaza de las Américas
  ["2002", "B2"], // Unioccidente
  ["3003", "B3"], // Unicentro Norte
  ["4004", "JP"], // Jardín Plaza
  // Celulares usados antes (se conservan para el histórico)
  ["3235896844", "B3"], // Unicentro
  ["3138845101", "B3"], // Unicentro
  ["3105543462", "B2"], // Unioccidente
  ["3015140002", "B1"], // Plaza de las Américas
  ["3102874360", "B1"], // Plaza de las Américas
  ["3172560775", "JP"], // Jardín Plaza
];

async function main() {
  for (const [reference, code] of REFS) {
    const store = await prisma.store.findUnique({ where: { code } });
    if (!store) {
      console.error(`Tienda ${code} no existe — ¿corriste db:seed?`);
      process.exit(1);
    }
    await prisma.cashReference.upsert({
      where: { reference },
      create: { reference, storeId: store.id },
      update: { storeId: store.id },
    });
    console.log(`${reference} -> ${code} (${store.name})`);
  }
  console.log("Listo: referencias sembradas.");
}

main().finally(() => prisma.$disconnect());
