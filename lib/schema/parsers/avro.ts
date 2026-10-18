import type { CanonicalType, Field } from "../types";

type AvroType = string | AvroComplex | AvroType[];
interface AvroComplex {
  type: string;
  items?: AvroType;
  fields?: AvroField[];
  logicalType?: string;
}
interface AvroField {
  name: string;
  type: AvroType;
  doc?: string;
}

export function isAvroSchema(value: unknown): value is { type: "record"; name: string; fields: AvroField[] } {
  const v = value as { type?: unknown; fields?: unknown };
  return v?.type === "record" && Array.isArray(v.fields);
}

const PRIMITIVES: Record<string, CanonicalType> = {
  string: "string",
  int: "int",
  long: "int",
  float: "float",
  double: "float",
  boolean: "bool",
  bytes: "bytes",
  fixed: "bytes",
  enum: "string",
  map: "json",
};

const LOGICAL: Record<string, CanonicalType> = {
  date: "date",
  "timestamp-millis": "timestamp",
  "timestamp-micros": "timestamp",
  "local-timestamp-millis": "timestamp",
  "local-timestamp-micros": "timestamp",
  decimal: "decimal",
  uuid: "string",
};

function fromAvroType(name: string, t: AvroType, nullable: boolean): Field {
  if (Array.isArray(t)) {
    const nonNull = t.filter((x) => x !== "null");
    const hasNull = nonNull.length < t.length;
    return fromAvroType(name, nonNull.length === 1 ? nonNull[0] : "string", nullable || hasNull);
  }
  if (typeof t === "string") return { name, type: PRIMITIVES[t] ?? "string", nullable };
  if (t.logicalType && LOGICAL[t.logicalType]) return { name, type: LOGICAL[t.logicalType], nullable };
  if (t.type === "array" && t.items !== undefined) {
    return { ...fromAvroType(name, t.items, false), nullable: true, repeated: true };
  }
  if (t.type === "record" && t.fields) {
    return { name, type: "record", nullable, fields: t.fields.map(fromAvroField) };
  }
  return { name, type: PRIMITIVES[t.type] ?? "string", nullable };
}

function fromAvroField(f: AvroField): Field {
  const field = fromAvroType(f.name, f.type, false);
  if (f.doc) field.description = f.doc;
  return field;
}

export function parseAvroSchema(value: { fields: AvroField[] }): Field[] {
  return value.fields.map(fromAvroField);
}
