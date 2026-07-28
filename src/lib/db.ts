import "dotenv/config"; // los scripts de /scripts no cargan .env solos (Next sí)
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// PostgreSQL en Neon (base "conciliador"), mismo patrón que la nómina.
// max amplio: computeLedger + el tablero disparan ~12 consultas en paralelo.
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  max: 20,
});

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
