import { readFileSync } from "fs";
import { expandZips } from "../src/lib/ledger";
import { detectFileType } from "../src/lib/parsers/detect";
const zip = readFileSync("C:/Users/Paola Agreda/Downloads/CSV_19100003911_000000901987494_20260907_10380319.zip");
const r = expandZips([{ filename: "CSV_19100003911_000000901987494_20260907_10380319.zip", buffer: zip }]);
console.log("warnings:", r.warnings);
for (const f of r.files) console.log(f.filename, f.buffer.length, "bytes →", JSON.stringify(detectFileType(f.filename, f.buffer)));
