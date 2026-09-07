import { readFileSync } from "fs";
import { parseDatafonoBanco } from "../src/lib/parsers/datafono-banco";
const buf = readFileSync("C:/Users/Paola Agreda/Downloads/CSV_19100003911_000000901987494_20260907_10380319.csv");
const r = parseDatafonoBanco(buf) as unknown as Record<string, unknown>;
for (const [k, v] of Object.entries(r)) {
  if (Array.isArray(v)) {
    const dates = v.map((x) => (x as { date?: string }).date).filter(Boolean).sort();
    console.log(k, ":", v.length, dates.length ? `· ${dates[0]} → ${dates[dates.length - 1]}` : "");
  } else console.log(k, ":", JSON.stringify(v)?.slice(0, 80));
}
