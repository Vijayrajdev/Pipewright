import type { Metadata } from "next";
import { SchemaBuilder } from "@/components/SchemaBuilder";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Schema Builder" };

export default function SchemaPage() {
  return (
    <>
      <PageHeader eyebrow="From sample to schema in one pass" title="Schema" accent="Builder">
        Paste sample data or an existing schema. Pipewright infers types and nullability, then writes BigQuery
        schema JSON, DDL for Snowflake, Postgres and Delta, PySpark, Avro and JSON Schema.
      </PageHeader>
      <SchemaBuilder />
    </>
  );
}
