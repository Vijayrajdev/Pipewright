import type { Field, TableSchema } from "../types";
import { TYPE_MAP } from "../typeMap";
import { quoteIdent } from "../normalize";

const SF = TYPE_MAP.snowflake;
const sqlString = (s: string) => `'${s.replaceAll("'", "''")}'`;

function ddlType(f: Field): string {
  // Snowflake arrays and objects are semi-structured and untyped
  if (f.repeated) return "ARRAY";
  return SF[f.type];
}

export function emitSnowflakeDdl(schema: TableSchema): string {
  const table = `${schema.dataset ? `${schema.dataset}.` : ""}${schema.name}`.toUpperCase();
  const cols = schema.fields.map((f) => {
    let line = `  ${quoteIdent(f.name).toUpperCase()} ${ddlType(f)}`;
    if (!f.nullable && !f.repeated) line += " NOT NULL";
    if (f.description) line += ` COMMENT ${sqlString(f.description)}`;
    return line;
  });
  let sql = `CREATE TABLE IF NOT EXISTS ${table} (\n${cols.join(",\n")}\n)`;
  if (schema.clusterBy?.length) sql += `\nCLUSTER BY (${schema.clusterBy.map((c) => c.toUpperCase()).join(", ")})`;
  if (schema.description) sql += `\nCOMMENT = ${sqlString(schema.description)}`;
  return sql + ";";
}
