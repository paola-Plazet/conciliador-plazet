// Re-sincroniza Mercado Pago por API (ahora guarda origen/detalle de cada cobro)
import { syncMercadoPago } from "../src/lib/sync";
import { prisma } from "../src/lib/db";
syncMercadoPago().then((r) => console.log(r)).finally(() => prisma.$disconnect());
