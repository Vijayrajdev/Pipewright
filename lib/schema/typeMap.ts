import type { CanonicalType } from "./types";

export type Dialect = "bigquery" | "snowflake" | "postgres" | "spark" | "avro" | "jsonschema";

/** Scalar type names per dialect. `record` is handled by each emitter. */
export const TYPE_MAP: Record<Exclude<Dialect, "jsonschema">, Record<CanonicalType, string>> = {
  bigquery: {
    string: "STRING",
    int: "INT64",
    float: "FLOAT64",
    decimal: "NUMERIC",
    bool: "BOOL",
    date: "DATE",
    timestamp: "TIMESTAMP",
    json: "JSON",
    bytes: "BYTES",
    record: "STRUCT",
  },
  snowflake: {
    string: "VARCHAR",
    int: "NUMBER(38,0)",
    float: "FLOAT",
    decimal: "NUMBER(38,9)",
    bool: "BOOLEAN",
    date: "DATE",
    timestamp: "TIMESTAMP_TZ",
    json: "VARIANT",
    bytes: "BINARY",
    record: "OBJECT",
  },
  postgres: {
    string: "TEXT",
    int: "BIGINT",
    float: "DOUBLE PRECISION",
    decimal: "NUMERIC(38,9)",
    bool: "BOOLEAN",
    date: "DATE",
    timestamp: "TIMESTAMPTZ",
    json: "JSONB",
    bytes: "BYTEA",
    record: "JSONB",
  },
  spark: {
    string: "StringType()",
    int: "LongType()",
    float: "DoubleType()",
    decimal: "DecimalType(38, 9)",
    bool: "BooleanType()",
    date: "DateType()",
    timestamp: "TimestampType()",
    json: "StringType()",
    bytes: "BinaryType()",
    record: "StructType",
  },
  avro: {
    string: "string",
    int: "long",
    float: "double",
    decimal: "bytes",
    bool: "boolean",
    date: "int",
    timestamp: "long",
    json: "string",
    bytes: "bytes",
    record: "record",
  },
};

/** Delta / Spark SQL DDL type names. */
export const SPARK_SQL: Record<CanonicalType, string> = {
  string: "STRING",
  int: "BIGINT",
  float: "DOUBLE",
  decimal: "DECIMAL(38,9)",
  bool: "BOOLEAN",
  date: "DATE",
  timestamp: "TIMESTAMP",
  json: "STRING",
  bytes: "BINARY",
  record: "STRUCT",
};

/** Map a foreign type name (from BigQuery JSON, Avro, or SQL DDL) back to canonical. */
export function toCanonical(raw: string): CanonicalType {
  const t = raw.trim().toUpperCase().replace(/\(.*\)$/, "");
  switch (t) {
    case "STRING": case "VARCHAR": case "CHAR": case "TEXT": case "NVARCHAR": case "CHARACTER VARYING":
    case "UUID": case "ENUM":
      return "string";
    case "INT": case "INT64": case "INTEGER": case "BIGINT": case "SMALLINT": case "TINYINT": case "LONG":
    case "BYTEINT": case "SERIAL": case "BIGSERIAL":
      return "int";
    case "FLOAT": case "FLOAT64": case "DOUBLE": case "DOUBLE PRECISION": case "REAL": case "FLOAT4": case "FLOAT8":
      return "float";
    case "NUMERIC": case "BIGNUMERIC": case "DECIMAL": case "NUMBER":
      // NUMBER(38,0) is Snowflake's integer
      return /\(\s*\d+\s*,\s*0\s*\)/.test(raw) ? "int" : "decimal";
    case "BOOL": case "BOOLEAN":
      return "bool";
    case "DATE":
      return "date";
    case "TIMESTAMP": case "DATETIME": case "TIMESTAMPTZ": case "TIMESTAMP_TZ": case "TIMESTAMP_NTZ":
    case "TIMESTAMP_LTZ": case "TIMESTAMP WITH TIME ZONE": case "TIMESTAMP WITHOUT TIME ZONE":
      return "timestamp";
    case "JSON": case "JSONB": case "VARIANT": case "OBJECT": case "MAP":
      return "json";
    case "BYTES": case "BINARY": case "BYTEA": case "BLOB": case "VARBINARY":
      return "bytes";
    case "RECORD": case "STRUCT":
      return "record";
    default:
      return "string";
  }
}
