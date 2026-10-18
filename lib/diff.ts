import type { Field, TableSchema } from "@/lib/schema/types";
import { quoteIdent } from "@/lib/schema/normalize";
import { SPARK_SQL, TYPE_MAP } from "@/lib/schema/typeMap";
import type { SqlDialect } from "@/lib/templates";

export type ChangeKind = "added" | "removed" | "type" | "nullability" | "mode" | "description";

export interface Change {
  path: string;
  kind: ChangeKind;
  breaking: boolean;
  summary: string;
  before?: Field;
  after?: Field;
}

/** Type changes that existing data and readers survive. */
const WIDENING: Record<string, string[]> = {
  int: ["float", "decimal", "string"],
  float: ["string"],
  decimal: ["float", "string"],
  date: ["timestamp", "string"],
  timestamp: ["string"],
  bool: ["string"],
};

const label = (f: Field) => `${f.type}${f.repeated ? "[]" : ""}`;

function diffFields(before: Field[], after: Field[], prefix = ""): Change[] {
  const changes: Change[] = [];
  const old = new Map(before.map((f) => [f.name, f]));
  const neu = new Map(after.map((f) => [f.name, f]));

  for (const f of before) {
    if (!neu.has(f.name)) {
      changes.push({ path: prefix + f.name, kind: "removed", breaking: true, summary: `Column removed (was ${label(f)})`, before: f });
    }
  }
  for (const f of after) {
    const path = prefix + f.name;
    const o = old.get(f.name);
    if (!o) {
      const required = !f.nullable && !f.repeated;
      changes.push({
        path,
        kind: "added",
        breaking: required,
        summary: required ? `Required column added (${label(f)}); existing rows have no value` : `Nullable column added (${label(f)})`,
        after: f,
      });
      continue;
    }
    if (o.type !== f.type) {
      const safe = WIDENING[o.type]?.includes(f.type) ?? false;
      changes.push({ path, kind: "type", breaking: !safe, summary: `Type ${o.type} → ${f.type}${safe ? " (widening)" : " (narrowing or incompatible)"}`, before: o, after: f });
    }
    if (!!o.repeated !== !!f.repeated) {
      changes.push({ path, kind: "mode", breaking: true, summary: f.repeated ? "Became an array" : "No longer an array", before: o, after: f });
    }
    if (o.nullable !== f.nullable && !f.repeated) {
      changes.push({
        path,
        kind: "nullability",
        breaking: !f.nullable,
        summary: f.nullable ? "NOT NULL dropped (now nullable)" : "Now NOT NULL; existing nulls will fail",
        before: o,
        after: f,
      });
    }
    if ((o.description ?? "") !== (f.description ?? "")) {
      changes.push({ path, kind: "description", breaking: false, summary: "Description changed", before: o, after: f });
    }
    if (o.type === "record" && f.type === "record") {
      changes.push(...diffFields(o.fields ?? [], f.fields ?? [], `${path}.`));
    }
  }
  return changes;
}

export function diffSchemas(before: TableSchema, after: TableSchema): Change[] {
  return diffFields(before.fields, after.fields);
}

/** Pairs of removed + added columns with the same type, which are often renames. */
export function possibleRenames(changes: Change[]): [string, string][] {
  const removed = changes.filter((c) => c.kind === "removed" && !c.path.includes("."));
  const added = changes.filter((c) => c.kind === "added" && !c.path.includes("."));
  const pairs: [string, string][] = [];
  for (const r of removed) {
    const a = added.find((x) => x.after!.type === r.before!.type && !pairs.some((p) => p[1] === x.path));
    if (a) pairs.push([r.path, a.path]);
  }
  return pairs;
}

const q = (d: SqlDialect) => (d === "bigquery" || d === "databricks" ? "`" : '"');

function colType(f: Field, d: SqlDialect): string {
  const base = f.type === "record" ? "json" : f.type;
  if (d === "databricks") return f.repeated ? `ARRAY<${SPARK_SQL[base]}>` : SPARK_SQL[base];
  if (d === "postgres") return f.repeated ? `${TYPE_MAP.postgres[base]}[]` : TYPE_MAP.postgres[base];
  if (d === "snowflake") return f.repeated ? "ARRAY" : TYPE_MAP.snowflake[base];
  return f.repeated ? `ARRAY<${TYPE_MAP.bigquery[base]}>` : TYPE_MAP.bigquery[base];
}

/** ALTER TABLE statements that move `before` to `after`. Nested changes get a comment. */
export function alterStatements(table: TableSchema, changes: Change[], d: SqlDialect): string {
  const t =
    d === "bigquery"
      ? `\`${table.dataset || "my_dataset"}.${table.name}\``
      : [table.dataset, table.name].filter(Boolean).map((p) => quoteIdent(p!, q(d))).join(".");
  const id = (n: string) => quoteIdent(n, q(d));
  const out: string[] = [];

  for (const c of changes) {
    if (c.path.includes(".")) {
      out.push(`-- ${c.path}: ${c.summary}. Nested fields change with the parent column's type.`);
      continue;
    }
    const col = id(c.path);
    switch (c.kind) {
      case "added": {
        const f = c.after!;
        const required = !f.nullable && !f.repeated;
        if (d === "databricks") out.push(`ALTER TABLE ${t} ADD COLUMNS (${col} ${colType(f, d)});`);
        else out.push(`ALTER TABLE ${t} ADD COLUMN ${col} ${colType(f, d)};`);
        if (required) {
          out.push(`-- Backfill ${c.path}, then make it required:`);
          out.push(d === "bigquery" ? `-- BigQuery can't add NOT NULL to an existing column; recreate the table if it must be REQUIRED.` : `ALTER TABLE ${t} ALTER COLUMN ${col} SET NOT NULL;`);
        }
        break;
      }
      case "removed":
        if (d === "databricks") out.push(`-- Delta needs column mapping: ALTER TABLE ${t} SET TBLPROPERTIES ('delta.columnMapping.mode' = 'name')`);
        out.push(`ALTER TABLE ${t} DROP COLUMN ${col};`);
        break;
      case "type": {
        const f = c.after!;
        if (d === "postgres") out.push(`ALTER TABLE ${t} ALTER COLUMN ${col} TYPE ${colType(f, d)} USING ${col}::${colType(f, d)};`);
        else if (d === "databricks") out.push(`ALTER TABLE ${t} ALTER COLUMN ${col} TYPE ${colType(f, d)};`);
        else out.push(`ALTER TABLE ${t} ALTER COLUMN ${col} SET DATA TYPE ${colType(f, d)};`);
        if (c.breaking) out.push(`-- ⚠ ${c.summary}: most warehouses reject this in place; you may need to add a new column, backfill and swap.`);
        break;
      }
      case "nullability":
        if (c.after!.nullable) out.push(`ALTER TABLE ${t} ALTER COLUMN ${col} DROP NOT NULL;`);
        else if (d === "bigquery") out.push(`-- BigQuery can't make an existing column REQUIRED; recreate the table to enforce NOT NULL on ${c.path}.`);
        else out.push(`ALTER TABLE ${t} ALTER COLUMN ${col} SET NOT NULL;`);
        break;
      case "mode":
        out.push(`-- ${c.path}: ${c.summary}. Add a new column with the new shape, backfill, then drop the old one.`);
        break;
      case "description": {
        const text = (c.after!.description ?? "").replaceAll("'", "''");
        if (d === "bigquery") out.push(`ALTER TABLE ${t} ALTER COLUMN ${col} SET OPTIONS (description = "${(c.after!.description ?? "").replaceAll('"', '\\"')}");`);
        else if (d === "postgres") out.push(`COMMENT ON COLUMN ${t}.${col} IS '${text}';`);
        else out.push(`ALTER TABLE ${t} ALTER COLUMN ${col} COMMENT '${text}';`);
        break;
      }
    }
  }
  return out.length ? out.join("\n") : "-- No changes.";
}
