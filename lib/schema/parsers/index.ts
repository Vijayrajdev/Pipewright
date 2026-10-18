import type { Field } from "../types";
import type { InferOptions } from "../infer";
import { parseCsv } from "./csv";
import { parseJsonSample } from "./json";
import { isBigQuerySchema, parseBigQuerySchema } from "./bigquery";
import { isAvroSchema, parseAvroSchema } from "./avro";
import { looksLikeDdl, parseDdl } from "./ddl";

export type InputKind = "csv" | "json" | "bigquery" | "avro" | "ddl";

export interface ParseResult {
  kind: InputKind;
  fields: Field[];
  /** table name, when the input carries one */
  name?: string;
}

/** Detect the input format and parse it into canonical fields. */
export function parseInput(text: string, opts?: InferOptions): ParseResult {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Paste or upload something first.");

  if (looksLikeDdl(trimmed)) {
    const { name, fields } = parseDdl(trimmed);
    return { kind: "ddl", fields, name };
  }

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      // probably NDJSON, handled below
    }
    if (parsed !== undefined) {
      if (isAvroSchema(parsed)) return { kind: "avro", fields: parseAvroSchema(parsed), name: parsed.name };
      if (isBigQuerySchema(parsed)) return { kind: "bigquery", fields: parseBigQuerySchema(parsed) };
    }
    return { kind: "json", fields: parseJsonSample(trimmed, opts) };
  }

  return { kind: "csv", fields: parseCsv(trimmed, opts) };
}

export const INPUT_LABELS: Record<InputKind, string> = {
  csv: "CSV sample",
  json: "JSON / NDJSON sample",
  bigquery: "BigQuery schema",
  avro: "Avro schema",
  ddl: "SQL DDL",
};
