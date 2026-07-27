// Utilidades de fechas hábiles (considera fines de semana + festivos)

/** Suma días a una fecha YYYY-MM-DD (UTC) y devuelve YYYY-MM-DD */
export function addDaysStr(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Día de la semana: 0=domingo ... 6=sábado */
export function dayOfWeek(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function isWeekend(date: string): boolean {
  const dow = dayOfWeek(date);
  return dow === 0 || dow === 6;
}

/** ¿Es día hábil? (no fin de semana y no festivo) */
export function isBusinessDay(date: string, holidays: Set<string>): boolean {
  return !isWeekend(date) && !holidays.has(date);
}

/** Devuelve el siguiente día hábil estrictamente posterior a `date` */
export function nextBusinessDay(date: string, holidays: Set<string>): string {
  let cur = addDaysStr(date, 1);
  while (!isBusinessDay(cur, holidays)) cur = addDaysStr(cur, 1);
  return cur;
}

/** Devuelve el día hábil anterior estrictamente previo a `date` */
export function prevBusinessDay(date: string, holidays: Set<string>): string {
  let cur = addDaysStr(date, -1);
  while (!isBusinessDay(cur, holidays)) cur = addDaysStr(cur, -1);
  return cur;
}

/**
 * Dado un día de consignación (que debe ser hábil), devuelve los días de venta
 * que se esperarían acumulados en ese depósito, en orden cronológico.
 * Regla Habbie: se consigna lo del día anterior; si el día anterior es fin de
 * semana/festivo, se acumulan todos los días no hábiles previos + el último hábil.
 *
 * Ej: consigna lunes -> cubre viernes, sábado, domingo (si vie es hábil).
 * Ej: consigna martes (lunes festivo) -> cubre viernes..lunes.
 */
export function expectedSalesDays(
  depositDate: string,
  holidays: Set<string>,
): string[] {
  const days: string[] = [];
  let cur = addDaysStr(depositDate, -1);
  // retrocede mientras sea día no hábil (fin de semana / festivo)
  while (!isBusinessDay(cur, holidays)) {
    days.push(cur);
    cur = addDaysStr(cur, -1);
  }
  // agrega el último día hábil (la venta principal que se consigna)
  days.push(cur);
  return days.sort((a, b) => a.localeCompare(b));
}

/** Cuenta los días hábiles estrictamente posteriores a `from` y hasta `to`
 * inclusive. Devuelve 0 si `to` <= `from`. Mide cuántos "turnos" hábiles de
 * atraso hay entre la fecha esperada y la real. */
export function businessDaysBetween(
  from: string,
  to: string,
  holidays: Set<string>,
): number {
  if (to <= from) return 0;
  let count = 0;
  let cur = addDaysStr(from, 1);
  while (cur <= to) {
    if (isBusinessDay(cur, holidays)) count++;
    cur = addDaysStr(cur, 1);
  }
  return count;
}

/** Formatea YYYY-MM-DD a dd/mm/yyyy */
export function formatDate(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}
