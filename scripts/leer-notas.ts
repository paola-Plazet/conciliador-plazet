import { prisma } from "../src/lib/db";
async function main() {
  const notas = await prisma.dayNote.findMany({ orderBy: [{ date: "asc" }] });
  console.log("NOTAS:", notas.length);
  for (const n of notas) console.log(JSON.stringify(n));
  const qa = await prisma.qrAssignment.findMany();
  console.log("QR ASIGNACIONES:", qa.length);
  for (const a of qa) console.log(JSON.stringify(a));
}
main().finally(() => prisma.$disconnect());
