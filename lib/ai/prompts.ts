import type { Field, TableSchema } from "@/lib/schema/types";

const typeLabel = (f: Field) => `${f.type}${f.repeated ? "[]" : ""}${f.nullable ? "" : " NOT NULL"}`;

function describeFields(fields: Field[], indent = ""): string {
  return fields
    .map((f) => {
      const line = `${indent}- ${f.name}: ${typeLabel(f)}${f.description ? ` — ${f.description}` : ""}${f.pii ? " [PII]" : ""}`;
      return f.fields?.length ? `${line}\n${describeFields(f.fields, indent + "  ")}` : line;
    })
    .join("\n");
}

/** Compact, human-readable rendering of a schema for prompts. */
export function schemaToPrompt(schema: TableSchema): string {
  const header = `Table: ${schema.dataset ? `${schema.dataset}.` : ""}${schema.name}`;
  const extras = [
    schema.description && `Description: ${schema.description}`,
    schema.partitionBy && `Partitioned by: ${schema.partitionBy}`,
    schema.clusterBy?.length && `Clustered by: ${schema.clusterBy.join(", ")}`,
  ].filter(Boolean);
  return [header, ...extras, "Columns:", describeFields(schema.fields)].join("\n");
}

export const DESCRIBE_SYSTEM = `You document data warehouse tables for a data engineering team.
For each column you are given, write a one-sentence description (under 20 words) that a new analyst could rely on: what the value represents, its unit or format when that is evident, and how it relates to the table. Do not restate the type. If the meaning is genuinely ambiguous from the name and table context, say what it most likely holds and keep it hedged ("Likely ...").
Flag pii=true for values that identify or contact a person: names, emails, phone numbers, street addresses, postcodes, IPs, device IDs, government IDs, dates of birth, precise geolocation. Opaque internal surrogate keys are not PII.
Return one entry per column path exactly as given, including nested paths written with dots.`;

export const CHAT_SYSTEM = `You are Pipewright, a junior data engineer who helps a senior data engineer get work done. You are practical, precise and brief.
- Prefer working artifacts over explanation: SQL, PySpark, dbt models and YAML, Airflow/Dagster code, data-quality checks.
- Put code in fenced blocks tagged with the language. Use the column names from the table context exactly; never invent columns. If something you need is missing, say so and state the assumption you made.
- Match the SQL dialect the user names; if they don't name one, ask once or default to BigQuery and say so.
- Call out risks a senior would want flagged: full table scans, non-idempotent writes, timezone handling, late-arriving data, PII exposure.
- Keep prose short. A one-line summary before the code and a few bullets after it is usually right.`;
