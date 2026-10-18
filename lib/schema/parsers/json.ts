import type { Field } from "../types";
import { inferFields, type InferOptions } from "../infer";

const SAMPLE_ROWS = 1000;

function asRecords(value: unknown): Record<string, unknown>[] {
  const isRecord = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v);
  if (Array.isArray(value) && value.every(isRecord)) return value;
  if (isRecord(value)) return [value];
  throw new Error("Expected a JSON object, an array of objects, or newline-delimited JSON.");
}

/** Parse a JSON sample (object, array of objects) or NDJSON. */
export function parseJsonSample(text: string, opts?: InferOptions): Field[] {
  const trimmed = text.trim();
  let rows: Record<string, unknown>[];
  try {
    rows = asRecords(JSON.parse(trimmed));
  } catch (err) {
    const lines = trimmed.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) throw err;
    rows = lines.slice(0, SAMPLE_ROWS).map((line, i) => {
      try {
        return asRecords(JSON.parse(line))[0];
      } catch {
        throw new Error(`Line ${i + 1} is not valid JSON.`);
      }
    });
  }
  return inferFields(rows.slice(0, SAMPLE_ROWS), opts);
}
