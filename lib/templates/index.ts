import type { Field, TableSchema } from "@/lib/schema/types";
import { quoteIdent } from "@/lib/schema/normalize";
import { entityName } from "@/lib/rules/describe";

export type SqlDialect = "bigquery" | "snowflake" | "postgres" | "databricks";

export const DIALECTS: { id: SqlDialect; label: string }[] = [
  { id: "bigquery", label: "BigQuery" },
  { id: "snowflake", label: "Snowflake" },
  { id: "postgres", label: "Postgres" },
  { id: "databricks", label: "Databricks / Spark" },
];

export interface TemplateOptions {
  dialect: SqlDialect;
  /** business key column(s) */
  keys: string[];
  /** column that orders versions of a row (e.g. updated_at) */
  orderBy?: string;
}

export interface Template {
  id: string;
  label: string;
  blurb: string;
  language: "sql" | "yaml";
  /** what the template needs from the options */
  needs: { keys?: boolean; orderBy?: boolean };
  filename: (schema: TableSchema, o: TemplateOptions) => string;
  render: (schema: TableSchema, o: TemplateOptions) => string;
}

// ── helpers ──────────────────────────────────────────────────────────────

const q = (d: SqlDialect) => (d === "bigquery" || d === "databricks" ? "`" : '"');
const id = (name: string, d: SqlDialect) => quoteIdent(name, q(d));

/** Fully-qualified table reference, optionally with a suffix (`orders_staging`). */
export function tableRef(schema: TableSchema, d: SqlDialect, suffix = ""): string {
  const name = schema.name + suffix;
  if (d === "bigquery") return `\`${schema.dataset || "my_dataset"}.${name}\``;
  const parts = schema.dataset ? [schema.dataset, name] : [name];
  return parts.map((p) => id(p, d)).join(".");
}

const isComplex = (f: Field) => f.type === "record" || f.type === "json" || !!f.repeated;

/** Null-safe "values differ" check between target t and source s. */
function changed(f: Field, d: SqlDialect): string {
  const c = id(f.name, d);
  if (d === "databricks") return `NOT (t.${c} <=> s.${c})`;
  // BigQuery can't compare STRUCT/ARRAY/JSON directly
  if (d === "bigquery" && isComplex(f)) return `TO_JSON_STRING(t.${c}) IS DISTINCT FROM TO_JSON_STRING(s.${c})`;
  return `t.${c} IS DISTINCT FROM s.${c}`;
}

const keyJoin = (keys: string[], d: SqlDialect, a = "t", b = "s") =>
  keys.map((k) => `${a}.${id(k, d)} = ${b}.${id(k, d)}`).join(" AND ");

const indentList = (items: string[], pad = "  ", sep = ",") => items.map((x, i) => `${pad}${x}${i < items.length - 1 ? sep : ""}`).join("\n");

/** BigQuery only accepts QUALIFY alongside WHERE, GROUP BY or HAVING. */
const whereTrue = (d: SqlDialect) => (d === "bigquery" ? "\nWHERE TRUE" : "");

function requireKeys(o: TemplateOptions): string | null {
  return o.keys.length ? null : "-- Pick at least one key column to generate this template.";
}

// ── templates ────────────────────────────────────────────────────────────

function dedupe(schema: TableSchema, o: TemplateOptions): string {
  const missing = requireKeys(o);
  if (missing) return missing;
  const d = o.dialect;
  const t = tableRef(schema, d);
  const keys = o.keys.map((k) => id(k, d)).join(", ");
  const order = o.orderBy ? `${id(o.orderBy, d)} DESC` : `${keys} -- ⚠ no ordering column: pick one so "latest" is well defined`;
  const header = `-- Keep one row per ${o.keys.join(" + ")}${o.orderBy ? `, the latest by ${o.orderBy}` : ""}.`;

  if (d === "postgres") {
    return `${header}\nSELECT DISTINCT ON (${keys}) *\nFROM ${t}\nORDER BY ${keys}${o.orderBy ? `, ${id(o.orderBy, d)} DESC` : ""};`;
  }
  return `${header}\nSELECT *\nFROM ${t}${whereTrue(d)}\nQUALIFY ROW_NUMBER() OVER (\n  PARTITION BY ${keys}\n  ORDER BY ${order}\n) = 1;`;
}

function upsert(schema: TableSchema, o: TemplateOptions): string {
  const missing = requireKeys(o);
  if (missing) return missing;
  const d = o.dialect;
  const target = tableRef(schema, d);
  const staging = tableRef(schema, d, "_staging");
  const cols = schema.fields.map((f) => id(f.name, d));
  const nonKey = schema.fields.filter((f) => !o.keys.includes(f.name));
  const ob = o.orderBy && id(o.orderBy, d);
  // a target row with a NULL version counts as older
  const newer = ob ? ` AND (t.${ob} IS NULL OR s.${ob} > t.${ob})` : "";
  const keys = o.keys.map((k) => id(k, d)).join(", ");
  const dedupedSource = o.orderBy
    ? `SELECT * FROM ${staging}${whereTrue(d).replace("\n", " ")}\n  QUALIFY ROW_NUMBER() OVER (PARTITION BY ${keys} ORDER BY ${id(o.orderBy, d)} DESC) = 1`
    : `SELECT * FROM ${staging}`;

  if (d === "postgres") {
    return [
      `-- Upsert ${schema.name}_staging into ${schema.name}. Requires a UNIQUE constraint on (${o.keys.join(", ")}).`,
      `INSERT INTO ${target} AS t (${cols.join(", ")})`,
      o.orderBy
        ? `SELECT DISTINCT ON (${keys}) ${cols.join(", ")}\nFROM ${staging}\nORDER BY ${keys}, ${id(o.orderBy, d)} DESC`
        : `SELECT ${cols.join(", ")}\nFROM ${staging}`,
      ...(nonKey.length
        ? [
            `ON CONFLICT (${keys}) DO UPDATE SET`,
            indentList(nonKey.map((f) => `${id(f.name, d)} = EXCLUDED.${id(f.name, d)}`)),
            ob ? `WHERE t.${ob} IS NULL OR t.${ob} < EXCLUDED.${ob};` : ";",
          ]
        : [`ON CONFLICT (${keys}) DO NOTHING;`]),
    ].join("\n");
  }

  return [
    `-- Upsert ${schema.name}_staging into ${schema.name}: update changed rows, insert new ones.`,
    `MERGE INTO ${target} AS t`,
    `USING (\n  ${dedupedSource}\n) AS s`,
    `ON ${keyJoin(o.keys, d)}`,
    ...(nonKey.length
      ? [`WHEN MATCHED${newer} THEN UPDATE SET`, indentList(nonKey.map((f) => `${id(f.name, d)} = s.${id(f.name, d)}`))]
      : []),
    `WHEN NOT MATCHED THEN INSERT (${cols.join(", ")})`,
    `  VALUES (${cols.map((c) => `s.${c}`).join(", ")});`,
  ].join("\n");
}

function scd2(schema: TableSchema, o: TemplateOptions): string {
  const missing = requireKeys(o);
  if (missing) return missing;
  const d = o.dialect;
  const target = tableRef(schema, d, "_history");
  const staging = tableRef(schema, d, "_staging");
  const tracked = schema.fields.filter((f) => !o.keys.includes(f.name) && f.name !== o.orderBy);
  const cols = schema.fields.map((f) => id(f.name, d));
  const now = d === "postgres" ? "NOW()" : "CURRENT_TIMESTAMP()";
  const effective = o.orderBy ? `s.${id(o.orderBy, d)}` : now;
  const changes = tracked.length ? tracked.map((f) => changed(f, d)).join("\n    OR ") : "FALSE";
  const firstKey = id(o.keys[0], d);

  const close =
    d === "postgres"
      ? [
          `UPDATE ${target} AS t`,
          `SET valid_to = ${effective}, is_current = FALSE`,
          `FROM ${staging} AS s`,
          `WHERE ${keyJoin(o.keys, d)}`,
          `  AND t.is_current`,
          `  AND (\n    ${changes}\n  );`,
        ]
      : [
          `MERGE INTO ${target} AS t`,
          `USING ${staging} AS s`,
          `ON ${keyJoin(o.keys, d)} AND t.is_current`,
          `WHEN MATCHED AND (\n    ${changes}\n  ) THEN UPDATE SET`,
          `  valid_to = ${effective},`,
          `  is_current = FALSE;`,
        ];

  return [
    `-- SCD Type 2 load from ${schema.name}_staging into ${schema.name}_history.`,
    `-- ${schema.name}_history has the same columns plus valid_from, valid_to, is_current.`,
    `-- Tracked columns: ${tracked.map((f) => f.name).join(", ") || "(none)"}. Run both steps in one transaction.`,
    `-- Assumes ${schema.name}_staging has one row per key; run the Deduplicate template on it first if not.`,
    "",
    "-- Step 1: close the current version of rows whose tracked columns changed.",
    ...close,
    "",
    "-- Step 2: insert a new current version for new keys and for rows closed in step 1.",
    `INSERT INTO ${target} (${cols.join(", ")}, valid_from, valid_to, is_current)`,
    `SELECT ${cols.map((c) => `s.${c}`).join(", ")}, ${effective}, NULL, TRUE`,
    `FROM ${staging} AS s`,
    `LEFT JOIN ${target} AS t`,
    `  ON ${keyJoin(o.keys, d)} AND t.is_current`,
    `WHERE t.${firstKey} IS NULL;`,
  ].join("\n");
}

function freshness(col: Field, d: SqlDialect): string {
  const c = id(col.name, d);
  if (col.type === "date") {
    return {
      bigquery: `DATE_DIFF(CURRENT_DATE(), MAX(${c}), DAY)`,
      snowflake: `DATEDIFF('day', MAX(${c}), CURRENT_DATE())`,
      postgres: `CURRENT_DATE - MAX(${c})`,
      databricks: `DATEDIFF(CURRENT_DATE(), MAX(${c}))`,
    }[d];
  }
  return {
    bigquery: `TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), MAX(${c}), HOUR)`,
    snowflake: `DATEDIFF('hour', MAX(${c}), CURRENT_TIMESTAMP())`,
    postgres: `FLOOR(EXTRACT(EPOCH FROM (NOW() - MAX(${c}))) / 3600)::BIGINT`,
    databricks: `FLOOR((UNIX_TIMESTAMP(CURRENT_TIMESTAMP()) - UNIX_TIMESTAMP(MAX(${c}))) / 3600)`,
  }[d];
}

function qualityChecks(schema: TableSchema, o: TemplateOptions): string {
  const d = o.dialect;
  const t = tableRef(schema, d);
  const lit = (s: string) => `'${s.replaceAll("'", "''")}'`;
  const checks: { name: string; expr: string; from?: string; expect: string }[] = [
    { name: "row_count", expr: "COUNT(*)", expect: "> 0" },
  ];
  for (const f of schema.fields.filter((f) => !f.nullable && !f.repeated)) {
    checks.push({ name: `nulls_in_${f.name}`, expr: `COUNT(*) - COUNT(${id(f.name, d)})`, expect: "= 0" });
  }
  if (o.keys.length) {
    const keys = o.keys.map((k) => id(k, d)).join(", ");
    checks.push({
      name: `duplicate_${o.keys.join("_")}`,
      expr: "COUNT(*)",
      from: `(SELECT ${keys} FROM ${t} GROUP BY ${keys} HAVING COUNT(*) > 1) AS dupes`,
      expect: "= 0",
    });
  }
  const ts = schema.fields.find((f) => f.name === o.orderBy && (f.type === "timestamp" || f.type === "date"));
  if (ts) {
    checks.push({
      name: `${ts.type === "date" ? "days" : "hours"}_since_latest_${ts.name}`,
      expr: freshness(ts, d),
      expect: ts.type === "date" ? "<= 1" : "<= 24",
    });
  }

  const body = checks
    .map((c) => `SELECT ${lit(c.name)} AS check_name, ${c.expr} AS observed, ${lit(c.expect)} AS expected FROM ${c.from ?? t}`)
    .join("\nUNION ALL\n");
  return `-- Data quality checks for ${schema.name}. Each row is one check; compare observed to expected.\n${body};`;
}

function yamlString(s: string) {
  return JSON.stringify(s);
}

function dbtSchemaYml(schema: TableSchema, o: TemplateOptions): string {
  const lines = ["version: 2", "", "models:", `  - name: ${schema.name}`];
  lines.push(`    description: ${yamlString(schema.description || `One row per ${entityName(schema.name)}.`)}`);
  if (o.keys.length > 1) {
    lines.push("    data_tests:", "      - dbt_utils.unique_combination_of_columns:", "          combination_of_columns:");
    o.keys.forEach((k) => lines.push(`            - ${k}`));
  }
  lines.push("    columns:");
  for (const f of schema.fields) {
    lines.push(`      - name: ${f.name}`);
    if (f.description) lines.push(`        description: ${yamlString(f.description)}`);
    if (f.pii) lines.push("        meta:", "          contains_pii: true");
    const tests: string[] = [];
    if (!f.nullable && !f.repeated) tests.push("not_null");
    if (o.keys.length === 1 && o.keys[0] === f.name) tests.push("unique");
    if (tests.length) {
      lines.push("        data_tests:");
      tests.forEach((t) => lines.push(`          - ${t}`));
    }
  }
  const notes = ["# dbt >= 1.8 uses `data_tests:`; on older versions rename it to `tests:`."];
  if (o.keys.length > 1) notes.push("# The composite-key test needs the dbt_utils package.");
  return `${notes.join("\n")}\n${lines.join("\n")}\n`;
}

export const TEMPLATES: Template[] = [
  {
    id: "dedupe",
    label: "Deduplicate",
    blurb: "Keep the latest row per key.",
    language: "sql",
    needs: { keys: true, orderBy: true },
    filename: (s, o) => `${s.name}_dedupe.${o.dialect}.sql`,
    render: dedupe,
  },
  {
    id: "upsert",
    label: "Upsert (MERGE)",
    blurb: "Load a staging table into the target: update changed rows, insert new ones.",
    language: "sql",
    needs: { keys: true, orderBy: true },
    filename: (s, o) => `${s.name}_upsert.${o.dialect}.sql`,
    render: upsert,
  },
  {
    id: "scd2",
    label: "SCD Type 2",
    blurb: "Keep full history: close changed rows and insert new versions.",
    language: "sql",
    needs: { keys: true, orderBy: true },
    filename: (s, o) => `${s.name}_scd2.${o.dialect}.sql`,
    render: scd2,
  },
  {
    id: "quality",
    label: "Data quality checks",
    blurb: "Row count, NOT NULL violations, duplicate keys and freshness in one query.",
    language: "sql",
    needs: { keys: true, orderBy: true },
    filename: (s, o) => `${s.name}_checks.${o.dialect}.sql`,
    render: qualityChecks,
  },
  {
    id: "dbt",
    label: "dbt schema.yml",
    blurb: "Model docs and tests: not_null, unique and PII tags.",
    language: "yaml",
    needs: { keys: true },
    filename: () => "schema.yml",
    render: dbtSchemaYml,
  },
];

// ── smart defaults ───────────────────────────────────────────────────────

/** Guess the business key: `id`, then `<table>_id`, then the first required *_id column. */
export function guessKeys(schema: TableSchema): string[] {
  const names = schema.fields.map((f) => f.name);
  const entity = entityName(schema.name);
  const pick =
    names.find((n) => n === "id") ??
    names.find((n) => n === `${entity}_id`) ??
    schema.fields.find((f) => !f.nullable && /_id$/.test(f.name))?.name ??
    names.find((n) => /_id$/.test(n));
  return pick ? [pick] : [];
}

/** Guess the version column: updated_at beats created_at beats any timestamp. */
export function guessOrderBy(schema: TableSchema): string | undefined {
  const temporal = schema.fields.filter((f) => (f.type === "timestamp" || f.type === "date") && !f.repeated);
  const prefer = [/^(updated|modified|last_modified|last_updated)/, /^(loaded|ingested|_loaded)/, /^(created|inserted)/, /_(at|ts)$/];
  for (const re of prefer) {
    const hit = temporal.find((f) => re.test(f.name));
    if (hit) return hit.name;
  }
  return temporal[0]?.name;
}
