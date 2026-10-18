import type { Field, TableSchema } from "../types";

const SCALAR: Record<Field["type"], object> = {
  string: { type: "string" },
  int: { type: "integer" },
  float: { type: "number" },
  decimal: { type: "string", pattern: "^-?\\d+(\\.\\d+)?$" },
  bool: { type: "boolean" },
  date: { type: "string", format: "date" },
  timestamp: { type: "string", format: "date-time" },
  json: {},
  bytes: { type: "string", contentEncoding: "base64" },
  record: { type: "object" },
};

function objectSchema(fields: Field[]): Record<string, unknown> {
  return {
    type: "object",
    properties: Object.fromEntries(fields.map((f) => [f.name, fieldSchema(f)])),
    required: fields.filter((f) => !f.nullable).map((f) => f.name),
    additionalProperties: false,
  };
}

function fieldSchema(f: Field): Record<string, unknown> {
  let s: Record<string, unknown> =
    f.type === "record" && f.fields ? objectSchema(f.fields) : { ...SCALAR[f.type] };
  if (f.repeated) s = { type: "array", items: s };
  // nullable scalars accept null as well
  if (f.nullable && typeof s.type === "string") s.type = [s.type, "null"];
  if (f.description) s.description = f.description;
  return s;
}

/** JSON Schema (draft 2020-12) describing one row. */
export function emitJsonSchema(schema: TableSchema): string {
  return JSON.stringify(
    {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      title: schema.name,
      ...(schema.description ? { description: schema.description } : {}),
      ...objectSchema(schema.fields),
    },
    null,
    2,
  );
}
