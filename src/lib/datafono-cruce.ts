// Cruce EXACTO del datáfono, transacción por transacción, para un día y una
// tienda. Regla de Paola (07-sep-2026): en el datáfono no se netea nada —
// lo que el POS registró con tarjeta y NO está en el datáfono es FALTA, y lo
// que entró al datáfono sin factura en el POS es SOBRA. Un pago del POS y una
// transacción del datáfono son "la misma" solo si el valor es exacto (se
// admiten hasta IGUAL pesos de redondeo: Conciliar trae 874.198 por 874.200),
// o si una factura se pagó con DOS tarjetas / dos facturas en UN solo cobro
// (la suma calza exacta). Si comparten autorización o tarjeta pero el valor
// difiere, o si hay una transacción "parecida" (≤ APROX pesos), se emparejan
// solo para EXPLICAR, pero cuentan como falta + sobra. Las DEVOLUCIONES
// (montos negativos) se cruzan entre sí: devolución del POS sin reversión en
// el datáfono = SOBRA (el datáfono se quedó con la plata); reversión sin
// devolución en el POS = FALTA.

export interface PosPago {
  id: number | string;
  amount: number;
  autorizacion?: string | null;
  ultimos4?: string | null;
}
export interface TxDatafono {
  id: number | string;
  gross: number;
  autorizacion?: string | null;
  ultimos4?: string | null;
}
export type ViaCruce = "autorizacion" | "valor+tarjeta" | "valor" | "suma" | "aprox";
export interface ParCruce<P extends PosPago, T extends TxDatafono> {
  pos: P;
  tx: T;
  /** segunda transacción cuando la factura se pagó con dos tarjetas (via "suma") */
  tx2?: T;
  via: ViaCruce;
  /** (|tx| + |tx2|) − |pos|; 0 = exacto (≤ IGUAL se considera exacto) */
  difValor: number;
  /** la transacción cubre dos facturas (dos pagos del POS comparten este cobro) */
  compartida?: boolean;
}
export interface CruceDatafono<P extends PosPago, T extends TxDatafono> {
  pares: ParCruce<P, T>[];
  posSueltos: P[];
  txSueltas: T[];
  /** plata registrada en el POS que NO entró al datáfono (sin netear) */
  falta: number;
  /** plata que entró al datáfono sin factura exacta en el POS (sin netear) */
  sobra: number;
}

/** diferencia de redondeo que se considera "el mismo valor" */
export const IGUAL = 50;
/** hasta cuánto se empareja una transacción "parecida" del MISMO día. Regla de Paola: si la
 * diferencia es mínima cuenta solo la DIFERENCIA NETA (falta 700 por 23.800 vs 23.100), no las dos
 * transacciones enteras; si son transacciones distintas, falta y sobra van completas por separado. */
export const APROX = 1000;

const r = (n: number) => Math.round(Math.abs(n));
const auth = (a: string | null | undefined) => {
  const s = (a ?? "").trim();
  if (!s) return "";
  return /^\d+$/.test(s) ? String(Number(s)) : s.toUpperCase(); // "012345" ≡ "12345"
};
/** ¿es una diferencia de redondeo? */
export const esIgual = (dif: number) => Math.abs(dif) <= IGUAL;

/** Empareja por valor ABSOLUTO (se llama una vez para cobros y otra para devoluciones) */
function emparejar<P extends PosPago, T extends TxDatafono>(pos: P[], tx: T[]): { pares: ParCruce<P, T>[]; posSueltos: P[]; txSueltas: T[] } {
  const usadas = new Set<T>();
  const emparejado = new Set<P>();
  const pares: ParCruce<P, T>[] = [];
  const asignar = (p: P, t: T, via: ViaCruce, extra: Partial<ParCruce<P, T>> = {}) => {
    usadas.add(t);
    if (extra.tx2) usadas.add(extra.tx2);
    emparejado.add(p);
    pares.push({ pos: p, tx: t, via, difValor: r(t.gross) + (extra.tx2 ? r(extra.tx2.gross) : 0) - r(p.amount), ...extra });
  };
  const libres = () => tx.filter((x) => !usadas.has(x));
  // pase 1: mismo código de autorización
  for (const p of pos) {
    const a = auth(p.autorizacion);
    if (!a) continue;
    const t = libres().find((x) => auth(x.autorizacion) === a);
    if (t) asignar(p, t, "autorizacion");
  }
  // pase 1b: misma tarjeta (últimos 4) y autorización prefijo (digitada incompleta en el POS)
  for (const p of pos) {
    const a = auth(p.autorizacion);
    if (emparejado.has(p) || !a || a.length < 4 || !p.ultimos4) continue;
    const t = libres().find((x) => {
      if (x.ultimos4 !== p.ultimos4) return false;
      const b = auth(x.autorizacion);
      return b.length >= 4 && (b.startsWith(a) || a.startsWith(b));
    });
    if (t) asignar(p, t, "autorizacion");
  }
  // pase 2: valor exacto + últimos 4
  for (const p of pos) {
    if (emparejado.has(p) || !p.ultimos4) continue;
    const t = libres().find((x) => esIgual(r(x.gross) - r(p.amount)) && x.ultimos4 === p.ultimos4);
    if (t) asignar(p, t, "valor+tarjeta");
  }
  // pase 3: valor exacto (el candidato MÁS cercano dentro del redondeo)
  for (const p of pos) {
    if (emparejado.has(p)) continue;
    const cands = libres().filter((x) => esIgual(r(x.gross) - r(p.amount)));
    if (!cands.length) continue;
    let t = cands[0];
    for (const c of cands) if (Math.abs(r(c.gross) - r(p.amount)) < Math.abs(r(t.gross) - r(p.amount))) t = c;
    asignar(p, t, "valor");
  }
  // pase 3b: una factura pagada con DOS tarjetas (dos transacciones suman el pago)
  for (const p of pos) {
    if (emparejado.has(p)) continue;
    const l = libres();
    let hecho = false;
    for (let i = 0; i < l.length && !hecho; i++) for (let j = i + 1; j < l.length; j++) {
      if (esIgual(r(l[i].gross) + r(l[j].gross) - r(p.amount))) { asignar(p, l[i], "suma", { tx2: l[j] }); hecho = true; break; }
    }
  }
  // pase 3c: dos facturas cobradas en UNA sola transacción (dos pagos del POS suman la transacción)
  for (const t of libres()) {
    const ps = pos.filter((p) => !emparejado.has(p));
    let hecho = false;
    for (let i = 0; i < ps.length && !hecho; i++) for (let j = i + 1; j < ps.length; j++) {
      if (esIgual(r(ps[i].amount) + r(ps[j].amount) - r(t.gross))) {
        usadas.add(t); emparejado.add(ps[i]); emparejado.add(ps[j]);
        pares.push({ pos: ps[i], tx: t, via: "suma", difValor: 0, compartida: true });
        pares.push({ pos: ps[j], tx: t, via: "suma", difValor: 0, compartida: true });
        hecho = true; break;
      }
    }
  }
  // pase 4: "parecida" (≤ APROX) solo para explicar — cuenta como falta + sobra
  for (const p of pos) {
    if (emparejado.has(p)) continue;
    const cands = libres().filter((x) => Math.abs(r(x.gross) - r(p.amount)) <= APROX);
    if (!cands.length) continue;
    let t = cands[0];
    for (const c of cands) if (Math.abs(r(c.gross) - r(p.amount)) < Math.abs(r(t.gross) - r(p.amount))) t = c;
    asignar(p, t, "aprox");
  }
  return { pares, posSueltos: pos.filter((p) => !emparejado.has(p)), txSueltas: tx.filter((t) => !usadas.has(t)) };
}

export function cruzarDatafono<P extends PosPago, T extends TxDatafono>(pos: P[], tx: T[]): CruceDatafono<P, T> {
  const cobros = emparejar(pos.filter((p) => p.amount >= 0), tx.filter((t) => t.gross >= 0));
  const devol = emparejar(pos.filter((p) => p.amount < 0), tx.filter((t) => t.gross < 0));
  let falta = 0, sobra = 0;
  const distinto = (par: ParCruce<P, T>) => !esIgual(par.difValor);
  const montoTx = (par: ParCruce<P, T>) => r(par.tx.gross) + (par.tx2 ? r(par.tx2.gross) : 0);
  // cobros: POS sin datáfono = falta; datáfono sin POS = sobra.
  // Pares con valor distinto: si la diferencia es mínima (≤ APROX, mismo día) cuenta solo la
  // diferencia NETA; si es grande (mismo código de autorización pero otro monto) van ambos lados.
  for (const p of cobros.posSueltos) falta += p.amount;
  for (const t of cobros.txSueltas) sobra += t.gross;
  for (const par of cobros.pares) {
    if (!distinto(par)) continue;
    if (Math.abs(par.difValor) <= APROX) { if (par.difValor > 0) sobra += par.difValor; else falta += -par.difValor; }
    else { falta += par.pos.amount; sobra += montoTx(par); }
  }
  // devoluciones: POS devolvió sin reversión en el datáfono = sobra; reversión sin POS = falta
  for (const p of devol.posSueltos) sobra += -p.amount;
  for (const t of devol.txSueltas) falta += -t.gross;
  for (const par of devol.pares) {
    if (!distinto(par)) continue;
    if (Math.abs(par.difValor) <= APROX) { if (par.difValor > 0) falta += par.difValor; else sobra += -par.difValor; }
    else { sobra += r(par.pos.amount); falta += montoTx(par); }
  }
  return {
    pares: [...cobros.pares, ...devol.pares],
    posSueltos: [...cobros.posSueltos, ...devol.posSueltos],
    txSueltas: [...cobros.txSueltas, ...devol.txSueltas],
    falta: Math.round(falta),
    sobra: Math.round(sobra),
  };
}

/** Texto corto del resultado del día ("Falta $X: 2 pago(s)… · Sobra $Y: 1 transacción…") */
export function resumenCruce(c: CruceDatafono<PosPago, TxDatafono>, cop: (n: number) => string): string | undefined {
  const parecidas = c.pares.filter((p) => !esIgual(p.difValor) && Math.abs(p.difValor) <= APROX);
  const distintos = c.pares.filter((p) => Math.abs(p.difValor) > APROX).length;
  const partes: string[] = [];
  const nFalta = c.posSueltos.filter((p) => p.amount >= 0).length + distintos + c.txSueltas.filter((t) => t.gross < 0).length;
  const nSobra = c.txSueltas.filter((t) => t.gross >= 0).length + distintos + c.posSueltos.filter((p) => p.amount < 0).length;
  if (c.falta > 0) partes.push(`Falta ${cop(c.falta)}${nFalta ? `: ${nFalta} pago(s) del POS sin transacción en el datáfono` : ""}`);
  if (c.sobra > 0) partes.push(`Sobra ${cop(c.sobra)}${nSobra ? `: ${nSobra} transacción(es) del datáfono sin factura en el POS` : ""}`);
  if (parecidas.length) partes.push(`${parecidas.length} cobro(s) por un valor distinto al facturado (${parecidas.map((p) => `${cop(Math.abs(p.pos.amount))} vs ${cop(Math.abs(p.tx.gross) + (p.tx2 ? Math.abs(p.tx2.gross) : 0))}`).join(", ")})`);
  return partes.length ? partes.join(" · ") : undefined;
}
