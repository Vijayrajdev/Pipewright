import type { Field, TableSchema } from "../types";
import type { BigQueryField } from "../parsers/bigquery";
import { TYPE_MAP } from "../typeMap";
import { quoteIdent } from "../normalize";

const BQ = TYPE_MAP.bigquery;

function toBigQueryField(f: Field): BigQueryField {
  const out: BigQueryField = {
    name: f.name,
    type: f.type === "record" ? "RECORD" : BQ[f.type],
    mode: f.repeated ? "REPEATED" : f.nullable ? "NULLABLE" : "REQUIRED",
  };
  if (f.description) out.description = f.description;
  if (f.type === "record" && f.fields) out.fields = f.fields.map(toBigQueryField);
  return out;
}

/** The `schema.json` file accepted by `bq mk --schema` / `bq load --schema`. */
export function emitBigQueryJson(schema: TableSchema): string {
  return JSON.stringify(schema.fields.map(toBigQueryField), null, 2);
}

function ddlType(f: Field): string {
  const base =
    f.type === "record" && f.fields
      ? `STRUCT<${f.fields.map((c) => `${quoteIdent(c.name, "`")} ${ddlType(c)}`).join(", ")}>`
      : BQ[f.type];
  return f.repeated ? `ARRAY<${base}>` : base;
}

const escape = (s: string) => s.replaceAll("\\", "\\\\").replaceAll('"', '\\"');

export function emitBigQueryDdl(schema: TableSchema): string {
  const table = `\`${schema.dataset || "my_dataset"}.${schema.name}\``;
  const cols = schema.fields.map((f) => {
    let line = `  ${quoteIdent(f.name, "`")} ${ddlType(f)}`;
    if (!f.nullable && !f.repeated) line += " NOT NULL";
    if (f.description) line += ` OPTIONS(description="${escape(f.description)}")`;
    return line;
  });
  let sql = `CREATE TABLE IF NOT EXISTS ${table} (\n${cols.join(",\n")}\n)`;
  const part = schema.fields.find((f) => f.name === schema.partitionBy);
  if (part) sql += `\nPARTITION BY ${part.type === "timestamp" ? `DATE(${quoteIdent(part.name, "`")})` : quoteIdent(part.name, "`")}`;
  if (schema.clusterBy?.length) sql += `\nCLUSTER BY ${schema.clusterBy.map((c) => quoteIdent(c, "`")).join(", ")}`;
  if (schema.description) sql += `\nOPTIONS(description="${escape(schema.description)}")`;
  return sql + ";";
}
