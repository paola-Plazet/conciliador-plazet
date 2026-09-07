import { prisma } from "../src/lib/db";
async function main() {
  const ups = await prisma.upload.findMany({ orderBy: { createdAt: "desc" }, take: 6 });
  for (const u of ups) console.log(u.createdAt.toISOString().slice(0, 16), u.kind.padEnd(16), u.filename.slice(0, 45), u.rows, "filas", u.dateFrom, "→", u.dateTo, u.skipped ? `(omitidas ${u.skipped})` : "");
  const qr = await prisma.qrEntry.groupBy({ by: ["date"], _count: true, where: { date: { gte: "2026-08-20" } }, orderBy: { date: "asc" } });
  console.log("QR por día desde 20-ago:", qr.map((r) => `${r.date.slice(5)}:${r._count}`).join(" "));
  await prisma.$disconnect();
}
main();
