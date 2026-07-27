import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const stores = await prisma.store.findMany({
    orderBy: { code: "asc" },
    include: { cashRefs: true },
  });
  return Response.json({ stores });
}
