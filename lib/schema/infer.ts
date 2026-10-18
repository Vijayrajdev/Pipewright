import type { CanonicalType, Field } from "./types";
import { dedupeNames, toSnakeCase } from "./normalize";

const INT_RE = /^[-+]?\d+$/;
const FLOAT_RE = /^[-+]?(\d+\.\d*|\.\d+|\d+)([eE][-+]?\d+)?$/;
const BOOL_RE = /^(true|false|yes|no|t|f|y|n)$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;

export interface InferOptions {
  /** normalise column names to snake_case (default true) */
  snakeCase?: boolean;
}

/** Order matters: a column is the narrowest type that fits every non-null sample. */
const WIDENING: Record<CanonicalType, CanonicalType[]> = {
  bool: ["bool"],
  int: ["int", "float", "decimal"],
  float: ["float", "decimal"],
  decimal: ["decimal"],
  date: ["date", "timestamp"],
  timestamp: ["timestamp"],
  string: ["string"],
  json: ["json"],
  bytes: ["bytes"],
  record: ["record"],
};

function isNullish(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && /^(|null|none|nan|n\/a)$/i.test(v.trim()));
}

/** Type of a single scalar value. Strings are sniffed (CSV values are always strings). */
function scalarType(v: unknown): CanonicalType {
  if (typeof v === "boolean") return "bool";
  if (typeof v === "number") return Number.isInteger(v) ? "int" : "float";
  if (typeof v === "bigint") return "int";
  if (typeof v === "object") return "json";
  const s = String(v).trim();
  if (INT_RE.test(s)) {
    // leading zeros (zip codes, ids) should stay strings; huge ints overflow INT64
    if (/^[-+]?0\d/.test(s) || s.replace(/^[-+]/, "").length > 18) return "string";
    return "int";
  }
  if (FLOAT_RE.test(s)) return "float";
  if (BOOL_RE.test(s)) return "bool";
  if (DATE_RE.test(s)) return "date";
  if (TIMESTAMP_RE.test(s)) return "timestamp";
  if ((s.startsWith("{") && s.endsWith("}")) || (s.startsWith("[") && s.endsWith("]"))) {
    try {
      JSON.parse(s);
      return "json";
    } catch {
      /* fall through */
    }
  }
  return "string";
}

/** Merge two observed types into the narrowest type that holds both. */
export function unify(a: CanonicalType, b: CanonicalType): CanonicalType {
  if (a === b) return a;
  if (WIDENING[a].includes(b)) return b;
  if (WIDENING[b].includes(a)) return a;
  // int + bool from "1"/"0" columns etc. → string is the safe answer
  return "string";
}

function inferField(name: string, values: unknown[], opts: InferOptions): Field {
  const nonNull = values.filter((v) => !isNullish(v));
  const nullable = nonNull.length < values.length || values.length === 0;

  // Arrays → repeated field of the element type
  if (nonNull.length > 0 && nonNull.every(Array.isArray)) {
    const elements = (nonNull as unknown[][]).flat();
    const inner = inferField(name, elements, opts);
    return { ...inner, nullable: true, repeated: true };
  }

  // Plain objects → nested record
  if (nonNull.length > 0 && nonNull.every((v) => typeof v === "object" && v !== null && !Array.isArray(v))) {
    const fields = inferFields(nonNull as Record<string, unknown>[], opts);
    return { name, type: "record", nullable, fields };
  }

  let type: CanonicalType | null = null;
  for (const v of nonNull) {
    const t = scalarType(v);
    type = type === null ? t : unify(type, t);
    if (type === "string") break;
  }
  return { name, type: type ?? "string", nullable };
}

/** Infer fields from an array of row objects (CSV rows or parsed JSON records). */
export function inferFields(rows: Record<string, unknown>[], opts: InferOptions = {}): Field[] {
  const snake = opts.snakeCase ?? true;
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const k of Object.keys(row)) {
      if (!seen.has(k)) {
        seen.add(k);
        keys.push(k);
      }
    }
  }
  const names = dedupeNames(keys.map((k) => (snake ? toSnakeCase(k) : k)));
  return keys.map((key, i) => {
    // a key missing from a row counts as null for that row
    const values = rows.map((r) => (key in r ? r[key] : null));
    return inferField(names[i], values, opts);
  });
}
