import type { Field, TableSchema } from "@/lib/schema/types";
import { entityName } from "@/lib/rules/describe";

/** Small seeded PRNG so the same seed gives the same data. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ["Ana", "Ben", "Chen", "Divya", "Eli", "Fatima", "Gabriel", "Hana", "Ivan", "Jia", "Kofi", "Lena", "Mateo", "Nora", "Omar", "Priya", "Quinn", "Ravi", "Sofia", "Tariq"];
const LAST = ["Silva", "Okafor", "Wei", "Rao", "Cohen", "Haddad", "Rossi", "Sato", "Petrov", "Nguyen", "Mensah", "Fischer", "Garcia", "Kim", "Aziz", "Iyer", "Murphy", "Kumar", "Lopez", "Khan"];
const CITIES = ["Bengaluru", "Lisbon", "Lagos", "Toronto", "Berlin", "Austin", "Singapore", "Nairobi", "Melbourne", "São Paulo"];
const COUNTRIES = ["IN", "PT", "NG", "CA", "DE", "US", "SG", "KE", "AU", "BR"];
const STATUSES = ["active", "pending", "completed", "cancelled", "on_hold"];
const CATEGORIES = ["standard", "premium", "basic", "enterprise", "trial"];
const WORDS = ["pipeline", "batch", "stream", "warehouse", "lake", "model", "metric", "event", "snapshot", "partition", "schema", "query", "report", "ledger"];

type Rand = () => number;
const pick = <T,>(r: Rand, list: T[]) => list[Math.floor(r() * list.length)];
const int = (r: Rand, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
const pad = (n: number, w = 2) => String(n).padStart(w, "0");

function dateIn(r: Rand, daysBack = 730): Date {
  const base = Date.UTC(2026, 0, 1);
  return new Date(base - Math.floor(r() * daysBack * 86400000));
}

interface Ctx {
  r: Rand;
  row: number;
  entity: string;
  pk?: string;
  person: { first: string; last: string };
  rows: number;
}

function value(f: Field, c: Ctx): unknown {
  const n = f.name.toLowerCase();
  const { r } = c;

  if (f.type === "record") {
    return Object.fromEntries((f.fields ?? []).map((sub) => [sub.name, value(sub, c)]));
  }
  if (f.type === "json") return { source: pick(r, WORDS), score: int(r, 1, 100) };
  if (f.type === "bool") return r() < 0.5;
  if (f.type === "bytes") return btoaSafe(`${pick(r, WORDS)}-${int(r, 0, 9999)}`);

  if (f.type === "date") {
    const d = dateIn(r);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  if (f.type === "timestamp") return dateIn(r).toISOString().replace(/\.\d+Z$/, "Z");

  if (f.type === "int") {
    if (n === c.pk) return c.row + 1;
    if (/_id$|^id$/.test(n)) return int(r, 1, Math.max(5, Math.ceil(c.rows / 3)));
    if (/(qty|quantity|count|num_|items)/.test(n)) return int(r, 1, 10);
    if (/(age)$/.test(n)) return int(r, 18, 80);
    if (/(year)$/.test(n)) return int(r, 2015, 2026);
    return int(r, 0, 1000);
  }
  if (f.type === "float" || f.type === "decimal") {
    if (/(lat|latitude)$/.test(n)) return +(r() * 180 - 90).toFixed(5);
    if (/(lng|lon|longitude)$/.test(n)) return +(r() * 360 - 180).toFixed(5);
    if (/(rate|pct|percent|ratio|score)/.test(n)) return +r().toFixed(4);
    return +(r() * 500 + 1).toFixed(2);
  }

  // strings
  const { first, last } = c.person;
  if (n === c.pk || /(uuid|guid)$/.test(n)) {
    return /(uuid|guid)$/.test(n) ? uuid(r) : `${c.entity.slice(0, 3).toUpperCase()}-${pad(c.row + 1, 5)}`;
  }
  if (/_id$/.test(n)) return `${n.replace(/_id$/, "").slice(0, 3).toUpperCase()}-${pad(int(r, 1, Math.max(5, c.rows)), 5)}`;
  if (/e_?mail/.test(n)) return `${first}.${last}${int(r, 1, 99)}@example.com`.toLowerCase();
  if (/(phone|mobile)/.test(n)) return `+1-555-${pad(int(r, 0, 999), 3)}-${pad(int(r, 0, 9999), 4)}`;
  if (/^first_?name$/.test(n)) return first;
  if (/^last_?name$|surname/.test(n)) return last;
  if (/(full_?name|^name$|customer_name|user_name|contact_name)/.test(n)) {
    return /^(customer|user|person|employee|contact|member|author)/.test(c.entity) || n !== "name" ? `${first} ${last}` : `${capital(pick(r, WORDS))} ${capital(pick(r, WORDS))}`;
  }
  if (/country/.test(n)) return pick(r, COUNTRIES);
  if (/city/.test(n)) return pick(r, CITIES);
  if (/(zip|postal|postcode)/.test(n)) return pad(int(r, 1000, 99999), 5);
  if (/(address|street)/.test(n)) return `${int(r, 1, 999)} ${capital(pick(r, WORDS))} Street`;
  if (/(status|state)$/.test(n)) return pick(r, STATUSES);
  if (/(type|category|tier|plan|segment|kind)$/.test(n)) return pick(r, CATEGORIES);
  if (/(currency)/.test(n)) return pick(r, ["USD", "EUR", "INR", "GBP"]);
  if (/(url|link|website)/.test(n)) return `https://example.com/${pick(r, WORDS)}/${int(r, 1, 999)}`;
  if (/(^ip|ip_address)/.test(n)) return `${int(r, 1, 223)}.${int(r, 0, 255)}.${int(r, 0, 255)}.${int(r, 1, 254)}`;
  if (/(description|notes?|comments?|summary|message)/.test(n)) {
    return capital(Array.from({ length: int(r, 4, 9) }, () => pick(r, WORDS)).join(" ")) + ".";
  }
  if (/(code|sku)$/.test(n)) return `${pick(r, WORDS).slice(0, 3).toUpperCase()}-${int(r, 100, 999)}`;
  return `${pick(r, WORDS)}_${int(r, 1, 999)}`;
}

const capital = (s: string) => s[0].toUpperCase() + s.slice(1);
const hex = (r: Rand, len: number) => Array.from({ length: len }, () => Math.floor(r() * 16).toString(16)).join("");
const uuid = (r: Rand) => `${hex(r, 8)}-${hex(r, 4)}-4${hex(r, 3)}-${pick(r, ["8", "9", "a", "b"])}${hex(r, 3)}-${hex(r, 12)}`;
const btoaSafe = (s: string) => (typeof btoa === "function" ? btoa(s) : Buffer.from(s).toString("base64"));

/** Generate `count` rows that match the schema. */
export function generateRows(schema: TableSchema, count: number, seed = 42): Record<string, unknown>[] {
  const r = rng(seed);
  const entity = entityName(schema.name);
  const pk =
    schema.fields.find((f) => f.name === "id")?.name ??
    schema.fields.find((f) => f.name === `${entity}_id`)?.name ??
    schema.fields.find((f) => !f.nullable && /_id$/.test(f.name))?.name;

  return Array.from({ length: count }, (_, row) => {
    const ctx: Ctx = { r, row, entity, pk, rows: count, person: { first: pick(r, FIRST), last: pick(r, LAST) } };
    return Object.fromEntries(
      schema.fields.map((f) => {
        if (f.nullable && f.name !== pk && r() < 0.08) return [f.name, null];
        if (f.repeated) return [f.name, Array.from({ length: int(r, 0, 3) }, () => value({ ...f, repeated: false }, ctx))];
        return [f.name, value(f, ctx)];
      }),
    );
  });
}

// ── serialisers ────────────────────────────────────────────────────────

const csvCell = (v: unknown) => {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

export function toCsv(schema: TableSchema, rows: Record<string, unknown>[]): string {
  const cols = schema.fields.map((f) => f.name);
  return [cols.join(","), ...rows.map((row) => cols.map((c) => csvCell(row[c])).join(","))].join("\n");
}

export const toJson = (rows: Record<string, unknown>[]) => JSON.stringify(rows, null, 2);
export const toNdjson = (rows: Record<string, unknown>[]) => rows.map((row) => JSON.stringify(row)).join("\n");

export function toInserts(schema: TableSchema, rows: Record<string, unknown>[]): string {
  const cols = schema.fields.map((f) => f.name);
  const lit = (v: unknown) => {
    if (v === null || v === undefined) return "NULL";
    if (typeof v === "number") return String(v);
    if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return `'${s.replaceAll("'", "''")}'`;
  };
  const table = schema.dataset ? `${schema.dataset}.${schema.name}` : schema.name;
  const values = rows.map((row) => `  (${cols.map((c) => lit(row[c])).join(", ")})`);
  return `INSERT INTO ${table} (${cols.join(", ")}) VALUES\n${values.join(",\n")};`;
}
