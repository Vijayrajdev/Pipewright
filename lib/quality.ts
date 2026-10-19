import type { Field, TableSchema } from "@/lib/schema/types";
import { quoteIdent } from "@/lib/schema/normalize";
import { guessKeys, guessOrderBy, tableRef, type SqlDialect } from "@/lib/templates";
import type { ColumnStats } from "@/lib/workspace/types";

/*
 * Data quality checks, derived once into a neutral list and then written out
 * as a Great Expectations suite, SodaCL checks or plain SQL assertions.
 * With profile stats (tables from the Data Model workspace) the checks use
 * real ranges and value lists; with a bare schema they fall back to names and types.
 */

export type Check =
  | { id: string; kind: "row_count"; min: number; reason: string }
  | { id: string; kind: "not_null"; column: string; reason: string }
  | { id: string; kind: "unique"; columns: string[]; reason: string }
  | { id: string; kind: "between"; column: string; min?: number; max?: number; reason: string }
  | { id: string; kind: "accepted_values"; column: string; values: string[]; reason: string }
  | { id: string; kind: "regex"; column: string; pattern: string; label: string; reason: string }
  | { id: string; kind: "not_future"; column: string; reason: string }
  | { id: string; kind: "freshness"; column: string; hours: number; reason: string };

export interface QualityInput {
  schema: TableSchema;
  /** full-file profile per column, when known */
  stats?: Record<string, ColumnStats>;
  /** primary key, when known */
  pk?: string | null;
  rowCount?: number;
}

const NON_NEGATIVE = /(^|_)(amount|price|cost|qty|quantity|count|total|fee|revenue|balance|age|units|weight|duration)(_|$)/;
const EMAIL = /(^|_)e_?mail(_|$)/;
const PERCENT = /(^|_)(pct|percent|percentage|rate|ratio|share)(_|$)/;
const numeric = (f: Field) => f.type === "int" || f.type === "float" || f.type === "decimal";
const plain = (f: Field) => !f.repeated && f.type !== "record" && f.type !== "json";

export function deriveChecks({ schema, stats, pk, rowCount }: QualityInput): Check[] {
  const checks: Check[] = [{ id: "rows", kind: "row_count", min: 1, reason: "The table should never land empty." }];
  const keys = pk ? [pk] : guessKeys(schema);
  if (keys.length) {
    checks.push({ id: `unique:${keys.join(",")}`, kind: "unique", columns: keys, reason: pk ? "Primary key." : "Looks like the business key." });
  }

  for (const f of schema.fields.filter(plain)) {
    const s = stats?.[f.name];
    const name = f.name;
    if (keys.includes(name) || !f.nullable || (s && s.nulls === 0 && s.nonNull > 0)) {
      checks.push({
        id: `nn:${name}`,
        kind: "not_null",
        column: name,
        reason: keys.includes(name) ? "Key columns can't be null." : !f.nullable ? "Declared NOT NULL." : `No nulls in ${(rowCount ?? s!.nonNull).toLocaleString("en-US")} rows today.`,
      });
    }
    if (s?.unique && !keys.includes(name)) checks.push({ id: `uq:${name}`, kind: "unique", columns: [name], reason: "Every value is unique today." });

    // identifiers are numbers but not quantities: no range checks on them
    if (numeric(f) && !/(^id$|_id$|_key$)/.test(name)) {
      const lo = s?.min !== undefined ? Number(s.min) : undefined;
      const hi = s?.max !== undefined ? Number(s.max) : undefined;
      if (PERCENT.test(name) && (hi === undefined || hi <= 1)) {
        checks.push({ id: `rng:${name}`, kind: "between", column: name, min: 0, max: 1, reason: "Rates and shares sit between 0 and 1." });
      } else if (NON_NEGATIVE.test(name) || (lo !== undefined && lo >= 0)) {
        checks.push({
          id: `rng:${name}`,
          kind: "between",
          column: name,
          min: 0,
          reason: NON_NEGATIVE.test(name) ? "Amounts and counts can't be negative." : `Never negative today (min ${lo}).`,
        });
      }
    }
    if (s?.enumValues?.length && f.type === "string" && !keys.includes(name)) {
      checks.push({ id: `av:${name}`, kind: "accepted_values", column: name, values: s.enumValues, reason: `Only ${s.enumValues.length} distinct values seen.` });
    }
    if (EMAIL.test(name) && f.type === "string") {
      checks.push({ id: `rx:${name}`, kind: "regex", column: name, pattern: "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", label: "email", reason: "Should look like an email address." });
    }
    if (f.type === "date" || f.type === "timestamp") {
      if (!/(expir|due|valid_to|end|until|scheduled|planned)/.test(name)) {
        checks.push({ id: `nf:${name}`, kind: "not_future", column: name, reason: "Event times shouldn't be in the future." });
      }
    }
  }

  const fresh = guessOrderBy(schema);
  const freshField = schema.fields.find((f) => f.name === fresh);
  if (freshField && (freshField.type === "timestamp" || freshField.type === "date")) {
    checks.push({ id: `fr:${fresh}`, kind: "freshness", column: fresh!, hours: 24, reason: "A daily load should have landed new rows within a day." });
  }
  return checks;
}

// ── Great Expectations (GX 1.x suite JSON) ───────────────────────────────

export function toGreatExpectations(schema: TableSchema, checks: Check[]): string {
  const expectations = checks.flatMap((c) => {
    const e = (type: string, kwargs: Record<string, unknown>) => ({ type, kwargs, meta: { notes: c.reason } });
    switch (c.kind) {
      case "row_count":
        return [e("expect_table_row_count_to_be_between", { min_value: c.min })];
      case "not_null":
        return [e("expect_column_values_to_not_be_null", { column: c.column })];
      case "unique":
        return [c.columns.length === 1 ? e("expect_column_values_to_be_unique", { column: c.columns[0] }) : e("expect_compound_columns_to_be_unique", { column_list: c.columns })];
      case "between":
        return [e("expect_column_values_to_be_between", { column: c.column, ...(c.min !== undefined && { min_value: c.min }), ...(c.max !== undefined && { max_value: c.max }) })];
      case "accepted_values":
        return [e("expect_column_values_to_be_in_set", { column: c.column, value_set: c.values })];
      case "regex":
        return [e("expect_column_values_to_match_regex", { column: c.column, regex: c.pattern })];
      case "not_future":
        // GX has no "now" for row values; the freshness/not-future rule is best checked in SQL or Soda
        return [];
      case "freshness":
        return [];
    }
  });
  return JSON.stringify({ name: `${schema.name}_suite`, expectations, meta: { generated_by: "Pipewright" } }, null, 2);
}

// ── SodaCL ───────────────────────────────────────────────────────────────

export function toSoda(schema: TableSchema, checks: Check[]): string {
  const lines = [`checks for ${schema.name}:`];
  const add = (check: string, reason: string, body: string[] = []) => {
    lines.push(`  # ${reason}`, `  - ${check}${body.length ? ":" : ""}`, ...body.map((b) => `      ${b}`));
  };
  for (const c of checks) {
    switch (c.kind) {
      case "row_count":
        add(`row_count >= ${c.min}`, c.reason);
        break;
      case "not_null":
        add(`missing_count(${c.column}) = 0`, c.reason);
        break;
      case "unique":
        add(`duplicate_count(${c.columns.join(", ")}) = 0`, c.reason);
        break;
      case "between": {
        const body = [c.min !== undefined && `valid min: ${c.min}`, c.max !== undefined && `valid max: ${c.max}`].filter(Boolean) as string[];
        add(`invalid_count(${c.column}) = 0`, c.reason, body);
        break;
      }
      case "accepted_values":
        add(`invalid_count(${c.column}) = 0`, c.reason, [`valid values: [${c.values.map((v) => JSON.stringify(v)).join(", ")}]`]);
        break;
      case "regex":
        add(`invalid_count(${c.column}) = 0`, c.reason, [`valid format: ${c.label}`]);
        break;
      case "not_future":
        add(`failed rows`, c.reason, [`name: ${c.column} not in the future`, `fail condition: ${c.column} > CURRENT_TIMESTAMP`]);
        break;
      case "freshness":
        add(`freshness(${c.column}) < ${c.hours}h`, c.reason);
        break;
    }
  }
  return lines.join("\n");
}

// ── SQL assertions: each query returns rows only when the check fails ───

export function toSqlAssertions(schema: TableSchema, checks: Check[], d: SqlDialect): string {
  const t = tableRef(schema, d);
  const id = (n: string) => quoteIdent(n, d === "bigquery" || d === "databricks" ? "`" : '"');
  const now = d === "postgres" ? "NOW()" : "CURRENT_TIMESTAMP()";
  const hoursAgo = (h: number) =>
    d === "bigquery"
      ? `TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${h} HOUR)`
      : d === "snowflake"
        ? `DATEADD(hour, -${h}, CURRENT_TIMESTAMP())`
        : d === "postgres"
          ? `NOW() - INTERVAL '${h} hours'`
          : `CURRENT_TIMESTAMP() - INTERVAL ${h} HOURS`;
  const regex = (col: string, p: string) =>
    d === "bigquery" ? `NOT REGEXP_CONTAINS(${col}, r'${p}')` : d === "postgres" ? `${col} !~ '${p}'` : d === "snowflake" ? `NOT REGEXP_LIKE(${col}, '${p}')` : `NOT ${col} RLIKE '${p}'`;

  const blocks = checks.map((c) => {
    let sql: string;
    switch (c.kind) {
      case "row_count":
        sql = `SELECT COUNT(*) AS row_count FROM ${t} HAVING COUNT(*) < ${c.min}`;
        break;
      case "not_null":
        sql = `SELECT COUNT(*) AS null_rows FROM ${t} WHERE ${id(c.column)} IS NULL HAVING COUNT(*) > 0`;
        break;
      case "unique": {
        const cols = c.columns.map(id).join(", ");
        sql = `SELECT ${cols}, COUNT(*) AS copies FROM ${t} GROUP BY ${cols} HAVING COUNT(*) > 1`;
        break;
      }
      case "between": {
        const conds = [c.min !== undefined && `${id(c.column)} < ${c.min}`, c.max !== undefined && `${id(c.column)} > ${c.max}`].filter(Boolean);
        sql = `SELECT * FROM ${t} WHERE ${conds.join(" OR ")}`;
        break;
      }
      case "accepted_values":
        sql = `SELECT ${id(c.column)}, COUNT(*) AS n FROM ${t}\nWHERE ${id(c.column)} NOT IN (${c.values.map((v) => `'${v.replaceAll("'", "''")}'`).join(", ")})\nGROUP BY ${id(c.column)}`;
        break;
      case "regex":
        sql = `SELECT ${id(c.column)} FROM ${t} WHERE ${id(c.column)} IS NOT NULL AND ${regex(id(c.column), c.pattern)}`;
        break;
      case "not_future":
        sql = `SELECT * FROM ${t} WHERE ${id(c.column)} > ${now}`;
        break;
      case "freshness":
        sql = `SELECT MAX(${id(c.column)}) AS latest FROM ${t} HAVING MAX(${id(c.column)}) < ${hoursAgo(c.hours)}`;
        break;
    }
    return `-- ${c.reason}\n${sql};`;
  });
  return [`-- Data quality assertions for ${schema.name}. Each query returns rows only when its check FAILS.`, ...blocks].join("\n\n");
}
