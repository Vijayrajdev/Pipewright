import type { Field, TableSchema } from "../types";
import { TYPE_MAP } from "../typeMap";

const AVRO = TYPE_MAP.avro;

const LOGICAL: Partial<Record<Field["type"], object>> = {
  date: { type: "int", logicalType: "date" },
  timestamp: { type: "long", logicalType: "timestamp-micros" },
  decimal: { type: "bytes", logicalType: "decimal", precision: 38, scale: 9 },
};

function avroType(f: Field, namespace: string): unknown {
  let t: unknown =
    f.type === "record" && f.fields
      ? {
          type: "record",
          // nested record names must be unique within the schema
          name: `${namespace}_${f.name}`,
          fields: f.fields.map((c) => avroField(c, `${namespace}_${f.name}`)),
        }
      : (LOGICAL[f.type] ?? AVRO[f.type]);
  if (f.repeated) t = { type: "array", items: t };
  return f.nullable ? ["null", t] : t;
}

function avroField(f: Field, namespace: string): Record<string, unknown> {
  const out: Record<string, unknown> = { name: f.name, type: avroType(f, namespace) };
  if (f.description) out.doc = f.description;
  if (f.nullable) out.default = null;
  return out;
}

/** Avro `.avsc` record schema. */
export function emitAvro(schema: TableSchema): string {
  const record: Record<string, unknown> = {
    type: "record",
    name: schema.name,
    namespace: schema.dataset || "com.pipewright",
  };
  if (schema.description) record.doc = schema.description;
  record.fields = schema.fields.map((f) => avroField(f, schema.name));
  return JSON.stringify(record, null, 2);
}
