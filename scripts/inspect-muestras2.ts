import * as XLSX from "xlsx";

const DIR = "C:/Users/Paola Agreda/OneDrive/Escritorio/PROYECTOS PAO/muestras-conciliacion";

function serialToISO(n: number): string {
  const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
  return d.toISOString().slice(0, 10);
}

// ── Linux ventas ──
{
  const wb = XLSX.readFile(`${DIR}/sistemas anteriores/ventaSabmyju.xlsx`);
  const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets["ventaSabmyju"], { header: 1, raw: true });
  const header = rows[0].map(String);
  console.log("LINUX VENTAS — columnas completas:", header.join(" | "));
  const iF = header.indexOf("FECHA"), iS = header.indexOf("SUC"), iN = header.indexOf("NET"), iE = header.indexOf("EFE"), iT = header.indexOf("TAR");
  const bySuc = new Map<string, {n:number, min:number, max:number, net:number, efe:number, tar:number}>();
  for (const r of rows.slice(1)) {
    if (r[iS] == null || r[iF] == null) continue;
    const s = String(r[iS]);
    const e = bySuc.get(s) ?? {n:0, min:Infinity, max:-Infinity, net:0, efe:0, tar:0};
    e.n++; e.min = Math.min(e.min, r[iF]); e.max = Math.max(e.max, r[iF]);
    e.net += r[iN] ?? 0; e.efe += r[iE] ?? 0; e.tar += r[iT] ?? 0;
    bySuc.set(s, e);
  }
  console.log("Sucursales:");
  for (const [s, e] of bySuc) console.log(`  ${s}: ${e.n} facturas, ${serialToISO(e.min)} -> ${serialToISO(e.max)}, NET ${Math.round(e.net).toLocaleString()}, EFE ${Math.round(e.efe).toLocaleString()}, TAR ${Math.round(e.tar).toLocaleString()}`);
  // check if EFE+TAR = NET always
  let mismatch = 0;
  for (const r of rows.slice(1)) {
    if (r[iN] == null) continue;
    if (Math.abs((r[iE] ?? 0) + (r[iT] ?? 0) - r[iN]) > 1) mismatch++;
  }
  console.log("Facturas donde EFE+TAR != NET:", mismatch);
}

// ── Linux consignaciones ──
{
  const wb = XLSX.readFile(`${DIR}/sistemas anteriores/consignaciones linux.xlsx`);
  const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets["consign"], { header: 1, raw: true });
  console.log("\nLINUX CONSIGNACIONES — header crudo:", rows[0].map(String).join(" | "));
  // columns: 0=SU 1=NOMBRE 2=FEC.VENTA 3=FEC.CONSIG 4=VLR 5=NRO.DOC 6=CUENTA
  const bySuc = new Map<string, {n:number, min:number, max:number, vlr:number, cuentas:Set<string>}>();
  for (const r of rows.slice(1)) {
    if (r[0] == null || r[2] == null) continue;
    const key = `${r[0]}|${r[1]}`;
    const e = bySuc.get(key) ?? {n:0, min:Infinity, max:-Infinity, vlr:0, cuentas:new Set<string>()};
    e.n++; e.min = Math.min(e.min, r[2]); e.max = Math.max(e.max, r[2]);
    e.vlr += r[4] ?? 0; e.cuentas.add(String(r[6]));
    bySuc.set(key, e);
  }
  for (const [s, e] of bySuc) console.log(`  ${s}: ${e.n} consig, ventas ${serialToISO(e.min)} -> ${serialToISO(e.max)}, total ${Math.round(e.vlr).toLocaleString()}, cuentas: ${[...e.cuentas].join(",")}`);
}

// ── Karrot ──
{
  const wb = XLSX.readFile(`${DIR}/reporte_ventas_2026-07-01_2026-07-13.xlsx`);
  const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets["Ventas"], { header: 1, raw: true });
  console.log("\nKARROT — columnas completas:", rows[0].map(String).join(" | "));
  console.log("Fila ejemplo completa:", rows[1].map((c:any) => String(c)).join(" | "));
  const iUb = rows[0].indexOf("Ubicación");
  const ubic = new Map<string, number>();
  for (const r of rows.slice(1)) { if (r[iUb]) ubic.set(String(r[iUb]), (ubic.get(String(r[iUb])) ?? 0) + 1); }
  console.log("Ubicaciones:", [...ubic.entries()].map(([u,n]) => `${u}(${n})`).join(", "));
  const iF = rows[0].indexOf("Fecha");
  const dates = rows.slice(1).map(r => String(r[iF])).filter(Boolean).sort();
  console.log("Rango fechas:", dates[0], "->", dates.at(-1));
}
