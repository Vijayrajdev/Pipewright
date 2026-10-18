import type { TableSchema } from "../types";
import { emitBigQueryDdl, emitBigQueryJson } from "./bigquery";
import { emitSnowflakeDdl } from "./snowflake";
import { emitPostgresDdl } from "./postgres";
import { emitDeltaDdl, emitPySpark } from "./spark";
import { emitAvro } from "./avro";
import { emitJsonSchema } from "./jsonschema";

export interface OutputFormat {
  id: string;
  label: string;
  group: "BigQuery" | "Snowflake" | "Postgres" | "Spark / Delta" | "Avro" | "JSON Schema";
  language: "json" | "sql" | "python";
  filename: (schema: TableSchema) => string;
  emit: (schema: TableSchema) => string;
}

export const OUTPUT_FORMATS: OutputFormat[] = [
  { id: "bq-json", label: "BigQuery schema.json", group: "BigQuery", language: "json", filename: (s) => `${s.name}.schema.json`, emit: emitBigQueryJson },
  { id: "bq-ddl", label: "BigQuery DDL", group: "BigQuery", language: "sql", filename: (s) => `${s.name}.bigquery.sql`, emit: emitBigQueryDdl },
  { id: "sf-ddl", label: "Snowflake DDL", group: "Snowflake", language: "sql", filename: (s) => `${s.name}.snowflake.sql`, emit: emitSnowflakeDdl },
  { id: "pg-ddl", label: "Postgres DDL", group: "Postgres", language: "sql", filename: (s) => `${s.name}.postgres.sql`, emit: emitPostgresDdl },
  { id: "pyspark", label: "PySpark StructType", group: "Spark / Delta", language: "python", filename: (s) => `${s.name}_schema.py`, emit: emitPySpark },
  { id: "delta-ddl", label: "Delta DDL", group: "Spark / Delta", language: "sql", filename: (s) => `${s.name}.delta.sql`, emit: emitDeltaDdl },
  { id: "avro", label: "Avro .avsc", group: "Avro", language: "json", filename: (s) => `${s.name}.avsc`, emit: emitAvro },
  { id: "jsonschema", label: "JSON Schema", group: "JSON Schema", language: "json", filename: (s) => `${s.name}.jsonschema.json`, emit: emitJsonSchema },
];
