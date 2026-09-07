import * as XLSX from "xlsx";
import { readFileSync } from "fs";
const wb = XLSX.read(readFileSync("C:/Users/Paola Agreda/OneDrive/Escritorio/HABBIE/PLAZET/MOVIMIENTOS BANCOS/movimientos bancos.xlsx"), { type: "buffer" });
for (const name of ["mov alianza", "mov bancolombia", "mov mercadopago", "mov rappi", "ingresos", "egresos", "Saldo bancos"]) {
  const rows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null });
  console.log("===", name);
  for (const r of rows.slice(0, 4)) console.log(JSON.stringify(r).slice(0, 260));
}
