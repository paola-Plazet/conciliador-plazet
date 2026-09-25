// Carga un CSV ALL_SALES (ubicación SHOPIFY) del conector de Karrot.
// Uso: npx tsx scripts/cargar-karrot-shopify.ts <archivo.csv>
import fs from "fs";
import { cargarKarrotShopify } from "../src/lib/karrot-shopify-carga";
import { prisma } from "../src/lib/db";
cargarKarrotShopify(fs.readFileSync(process.argv[2], "utf8")).then((r) => console.log(r)).finally(() => prisma.$disconnect());
