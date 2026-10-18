import type { Field, TableSchema } from "../types";
import { TYPE_MAP } from "../typeMap";
import { quoteIdent } from "../normalize";

const PG = TYPE_MAP.postgres;
const sqlString = (s: string) => `'${s.replaceAll("'", "''")}'`;

function ddlType(f: Field): string {
  const base = PG[f.type];
  // arrays of records are just JSONB; scalar arrays are native
  if (f.repeated) return f.type === "record" || f.type === "json" ? "JSONB" : `${base}[]`;
  return base;
}

export function emitPostgresDdl(schema: TableSchema): string {
  const table = `${schema.dataset ? `${quoteIdent(schema.dataset)}.` : ""}${quoteIdent(schema.name)}`;
  const cols = schema.fields.map((f) => {
    let line = `  ${quoteIdent(f.name)} ${ddlType(f)}`;
    if (!f.nullable && !f.repeated) line += " NOT NULL";
    return line;
  });
  const statements = [`CREATE TABLE IF NOT EXISTS ${table} (\n${cols.join(",\n")}\n);`];
  if (schema.description) statements.push(`COMMENT ON TABLE ${table} IS ${sqlString(schema.description)};`);
  for (const f of schema.fields) {
    if (f.description) statements.push(`COMMENT ON COLUMN ${table}.${quoteIdent(f.name)} IS ${sqlString(f.description)};`);
  }
  if (schema.partitionBy) {
    statements.push(`-- To partition, add: PARTITION BY RANGE (${quoteIdent(schema.partitionBy)}) to the CREATE TABLE`);
  }
  for (const c of schema.clusterBy ?? []) {
    statements.push(`CREATE INDEX IF NOT EXISTS ${quoteIdent(`idx_${schema.name}_${c}`)} ON ${table} (${quoteIdent(c)});`);
  }
  return statements.join("\n");
}
