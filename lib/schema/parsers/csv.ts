import Papa from "papaparse";
import type { Field } from "../types";
import { inferFields, type InferOptions } from "../infer";

const SAMPLE_ROWS = 1000;

export function parseCsv(text: string, opts?: InferOptions): Field[] {
  const result = Papa.parse<Record<string, string>>(text.trim(), {
    header: true,
    skipEmptyLines: true,
    preview: SAMPLE_ROWS,
    dynamicTyping: false,
  });
  if (result.meta.fields === undefined || result.meta.fields.length === 0) {
    throw new Error("Could not find a header row in the CSV.");
  }
  // keep columns that appear only in the header (all-empty) by seeding a row with every field
  const rows = result.data.length > 0 ? result.data : [Object.fromEntries(result.meta.fields.map((f) => [f, ""]))];
  return inferFields(rows, opts);
}
