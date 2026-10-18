import type { Field } from "../types";
import { toCanonical } from "../typeMap";

export interface BigQueryField {
  name: string;
  type: string;
  mode?: "NULLABLE" | "REQUIRED" | "REPEATED";
  description?: string;
  fields?: BigQueryField[];
}

export function isBigQuerySchema(value: unknown): value is BigQueryField[] | { fields: BigQueryField[] } {
  const list = Array.isArray(value) ? value : (value as { fields?: unknown })?.fields;
  return (
    Array.isArray(list) &&
    list.length > 0 &&
    list.every((f) => typeof f?.name === "string" && typeof f?.type === "string")
  );
}

function fromBigQueryField(f: BigQueryField): Field {
  const mode = f.mode ?? "NULLABLE";
  const field: Field = {
    name: f.name,
    type: toCanonical(f.type),
    nullable: mode !== "REQUIRED",
  };
  if (mode === "REPEATED") field.repeated = true;
  if (f.description) field.description = f.description;
  if (f.fields?.length) field.fields = f.fields.map(fromBigQueryField);
  return field;
}

export function parseBigQuerySchema(value: BigQueryField[] | { fields: BigQueryField[] }): Field[] {
  const list = Array.isArray(value) ? value : value.fields;
  return list.map(fromBigQueryField);
}
