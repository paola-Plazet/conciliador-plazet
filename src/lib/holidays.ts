// Festivos colombianos calculados (Ley 51 de 1983 / Ley Emiliani).
// Los festivos "trasladables" se mueven al lunes siguiente.

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function ymd(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Domingo de Pascua (algoritmo de Butcher/Meeus) -> [mes, dia] */
function easterSunday(year: number): [number, number] {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const mth = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * mth + 114) / 31);
  const day = ((h + l - 7 * mth + 114) % 31) + 1;
  return [month, day];
}

function addDays(y: number, m: number, d: number, days: number): Date {
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt;
}

function dateToYmd(dt: Date): string {
  return ymd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** Mueve una fecha al lunes siguiente (o el mismo día si ya es lunes) */
function toNextMonday(dt: Date): Date {
  const dow = dt.getUTCDay(); // 0=domingo, 1=lunes...
  if (dow === 1) return dt;
  const delta = dow === 0 ? 1 : 8 - dow;
  const r = new Date(dt);
  r.setUTCDate(r.getUTCDate() + delta);
  return r;
}

/** Calcula los festivos de Colombia para un año dado (mapa fecha->nombre) */
export function colombianHolidays(year: number): Map<string, string> {
  const out = new Map<string, string>();
  const fixed = (m: number, d: number, name: string) =>
    out.set(ymd(year, m, d), name);
  const movable = (m: number, d: number, name: string) =>
    out.set(dateToYmd(toNextMonday(new Date(Date.UTC(year, m - 1, d)))), name);

  // Fijos
  fixed(1, 1, "Año Nuevo");
  fixed(5, 1, "Día del Trabajo");
  fixed(7, 20, "Día de la Independencia");
  fixed(8, 7, "Batalla de Boyacá");
  fixed(12, 8, "Inmaculada Concepción");
  fixed(12, 25, "Navidad");

  // Trasladables al lunes (Ley Emiliani)
  movable(1, 6, "Reyes Magos");
  movable(3, 19, "San José");
  movable(6, 29, "San Pedro y San Pablo");
  movable(8, 15, "Asunción de la Virgen");
  movable(10, 12, "Día de la Raza");
  movable(11, 1, "Todos los Santos");
  movable(11, 11, "Independencia de Cartagena");

  // Basados en Pascua
  const [em, ed] = easterSunday(year);
  const easterRel = (offset: number, name: string, moveMonday = false) => {
    const dt = addDays(year, em, ed, offset);
    const final = moveMonday ? toNextMonday(dt) : dt;
    out.set(dateToYmd(final), name);
  };
  easterRel(-3, "Jueves Santo"); // jueves antes
  easterRel(-2, "Viernes Santo");
  easterRel(43, "Ascensión del Señor", true); // +39 -> lunes
  easterRel(64, "Corpus Christi", true); // +60 -> lunes
  easterRel(71, "Sagrado Corazón", true); // +68 -> lunes

  return out;
}

/** Genera todos los festivos para un rango de años, como [{date, name}] */
export function holidaysForYears(years: number[]): { date: string; name: string }[] {
  const result: { date: string; name: string }[] = [];
  for (const y of years) {
    for (const [date, name] of colombianHolidays(y)) {
      result.push({ date, name });
    }
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}
