import { prisma } from "../src/lib/db";
async function main() {
  const notas = await prisma.dayNote.findMany({ orderBy: { id: "asc" }, include: { adjuntos: { select: { id: true, name: true, mime: true, size: true } } } });
  for (const n of notas) console.log(`#${n.id} ${n.date} ${n.storeCode} [${n.autor}] resuelta=${n.resolved}\n   "${n.note}"\n   adjuntos: ${JSON.stringify(n.adjuntos)}`);
  await prisma.$disconnect();
}
main();
