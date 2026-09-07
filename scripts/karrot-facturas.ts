import * as XLSX from "xlsx";
const f = "C:/Users/Paola Agreda/Downloads/allsales-a2b47fd9-3c80-4506-8700-49c3de1b8966-20260907T221555963Z.xlsx";
const rows = XLSX.utils.sheet_to_json<Record<string, any>>(XLSX.readFile(f).Sheets["Ventas"], { raw: false, defval: "" });
const facs = process.argv.slice(2);
for (const r of rows) if (facs.includes(String(r["# Factura"])) && r["Código Almacén"] === "B3") console.log(`${r["# Factura"]} ${r["Fecha"]} ${r["Hora"]} ${r["Nombre Método de Pago"]} $${r["Valor Método de Pago"]} cancel=${r["Cancelado"]} aut=${r["CodigoAutorizacion"]}/${r["approvalCode"]} 4d=${r["CuatrosDigitos"]} cliente=${r["Nombre Cliente"]} prepago=${r["Prepago"]} #fac=${r["# Facturas"]}`);
