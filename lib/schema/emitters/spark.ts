import type { Field, TableSchema } from "../types";
import { SPARK_SQL, TYPE_MAP } from "../typeMap";
import { quoteIdent } from "../normalize";

const SPARK = TYPE_MAP.spark;
const pyString = (s: string) => JSON.stringify(s);

function pyType(f: Field, indent: string): string {
  const base =
    f.type === "record" && f.fields
      ? `StructType([\n${f.fields.map((c) => pyField(c, indent + "    ")).join(",\n")},\n${indent}])`
      : SPARK[f.type];
  return f.repeated ? `ArrayType(${base}, True)` : base;
}

function pyField(f: Field, indent: string): string {
  const meta = f.description ? `, metadata={"comment": ${pyString(f.description)}}` : "";
  return `${indent}StructField(${pyString(f.name)}, ${pyType(f, indent)}, ${f.nullable ? "True" : "False"}${meta})`;
}

/** PySpark StructType definition. */
export function emitPySpark(schema: TableSchema): string {
  return [
    "from pyspark.sql.types import (",
    "    StructType, StructField, ArrayType, StringType, LongType, DoubleType,",
    "    DecimalType, BooleanType, DateType, TimestampType, BinaryType,",
    ")",
    "",
    `${schema.name}_schema = StructType([`,
    schema.fields.map((f) => pyField(f, "    ")).join(",\n") + ",",
    "])",
  ].join("\n");
}

function sqlType(f: Field): string {
  const base =
    f.type === "record" && f.fields
      ? `STRUCT<${f.fields.map((c) => `${quoteIdent(c.name, "`")}: ${sqlType(c)}`).join(", ")}>`
      : SPARK_SQL[f.type];
  return f.repeated ? `ARRAY<${base}>` : base;
}

const sqlString = (s: string) => `'${s.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;

/** Delta Lake DDL (Databricks / Spark SQL). */
export function emitDeltaDdl(schema: TableSchema): string {
  const table = `${schema.dataset ? `${schema.dataset}.` : ""}${schema.name}`;
  const cols = schema.fields.map((f) => {
    let line = `  ${quoteIdent(f.name, "`")} ${sqlType(f)}`;
    if (!f.nullable && !f.repeated) line += " NOT NULL";
    if (f.description) line += ` COMMENT ${sqlString(f.description)}`;
    return line;
  });
  let sql = `CREATE TABLE IF NOT EXISTS ${table} (\n${cols.join(",\n")}\n)\nUSING DELTA`;
  if (schema.partitionBy) sql += `\nPARTITIONED BY (${quoteIdent(schema.partitionBy, "`")})`;
  if (schema.clusterBy?.length && !schema.partitionBy) {
    sql += `\nCLUSTER BY (${schema.clusterBy.map((c) => quoteIdent(c, "`")).join(", ")})`;
  }
  if (schema.description) sql += `\nCOMMENT ${sqlString(schema.description)}`;
  return sql + ";";
}
