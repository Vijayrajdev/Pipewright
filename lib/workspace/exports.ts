import { quoteIdent } from "@/lib/schema/normalize";
import { TYPE_MAP, SPARK_SQL } from "@/lib/schema/typeMap";
import type { Field } from "@/lib/schema/types";
import type { SqlDialect } from "@/lib/templates";
import type { Relation, Workspace, WsTable } from "./types";

const q = (d: SqlDialect) => (d === "bigquery" || d === "databricks" ? "`" : '"');

function colType(f: Field, d: SqlDialect): string {
  if (f.repeated) return d === "bigquery" ? `ARRAY<${TYPE_MAP.bigquery[f.type === "record" ? "json" : f.type]}>` : d === "postgres" ? `${TYPE_MAP.postgres[f.type]}[]` : d === "databricks" ? `ARRAY<${SPARK_SQL[f.type === "record" ? "json" : f.type]}>` : "ARRAY";
  const map = { bigquery: TYPE_MAP.bigquery, snowflake: TYPE_MAP.snowflake, postgres: TYPE_MAP.postgres, databricks: SPARK_SQL }[d];
  return f.type === "record" ? map.json : map[f.type];
}

function ref(t: WsTable, d: SqlDialect, dataset?: string) {
  if (d === "bigquery") return `\`${dataset || "my_dataset"}.${t.name}\``;
  return [dataset, t.name].filter(Boolean).map((p) => quoteIdent(p!, q(d))).join(".");
}

/** CREATE TABLE for every table with PRIMARY KEY and FOREIGN KEY constraints. */
export function modelDdl(ws: Workspace, pks: Record<string, string | null>, relations: Relation[], d: SqlDialect): string {
  const byId = new Map(ws.tables.map((t) => [t.id, t]));
  const id = (n: string) => quoteIdent(n, q(d));
  // BigQuery and Databricks constraints are informational
  const notEnforced = d === "bigquery" ? " NOT ENFORCED" : "";

  // referenced tables first so FKs point at existing tables
  const order: WsTable[] = [];
  const visit = (t: WsTable, stack: Set<string>) => {
    if (order.includes(t) || stack.has(t.id)) return;
    stack.add(t.id);
    relations.filter((r) => r.from.table === t.id && r.to.table !== t.id).forEach((r) => visit(byId.get(r.to.table)!, stack));
    order.push(t);
  };
  ws.tables.forEach((t) => visit(t, new Set()));

  const statements = order.map((t) => {
    const lines = t.fields.map((f) => `  ${id(f.name)} ${colType(f, d)}${!f.nullable && !f.repeated ? " NOT NULL" : ""}`);
    const pk = pks[t.id];
    if (pk) lines.push(`  PRIMARY KEY (${id(pk)})${notEnforced}`);
    for (const r of relations.filter((r) => r.from.table === t.id)) {
      const target = byId.get(r.to.table);
      if (!target) continue;
      lines.push(`  FOREIGN KEY (${id(r.from.column)}) REFERENCES ${ref(target, d, ws.dataset)} (${id(r.to.column)})${notEnforced}`);
    }
    return `CREATE TABLE IF NOT EXISTS ${ref(t, d, ws.dataset)} (\n${lines.join(",\n")}\n);`;
  });
  const note =
    d === "bigquery"
      ? "-- BigQuery key constraints are NOT ENFORCED; they guide the optimiser and BI tools.\n"
      : d === "snowflake" || d === "databricks"
        ? "-- Key constraints are informational on this platform and are not enforced.\n"
        : "";
  return note + statements.join("\n\n");
}

const mermaidType = (f: Field) => (f.repeated ? `${f.type}_array` : f.type);

/** Mermaid erDiagram source (renders on GitHub, Notion, GitLab…). */
export function mermaid(ws: Workspace, pks: Record<string, string | null>, relations: Relation[]): string {
  const byId = new Map(ws.tables.map((t) => [t.id, t]));
  const fks = new Set(relations.map((r) => `${r.from.table}.${r.from.column}`));
  const lines = ["erDiagram"];
  for (const r of relations) {
    const a = byId.get(r.to.table);
    const b = byId.get(r.from.table);
    if (!a || !b) continue;
    const card = r.cardinality === "1:1" ? "||--o|" : "||--o{";
    lines.push(`  ${a.name} ${card} ${b.name} : "${r.from.column}"`);
  }
  for (const t of ws.tables) {
    lines.push(`  ${t.name} {`);
    for (const f of t.fields) {
      const keys = [pks[t.id] === f.name && "PK", fks.has(`${t.id}.${f.name}`) && "FK"].filter(Boolean).join(",");
      lines.push(`    ${mermaidType(f)} ${f.name}${keys ? ` ${keys}` : ""}`);
    }
    lines.push("  }");
  }
  return lines.join("\n");
}

/** DBML for dbdiagram.io / dbdocs. */
export function dbml(ws: Workspace, pks: Record<string, string | null>, relations: Relation[]): string {
  const byId = new Map(ws.tables.map((t) => [t.id, t]));
  const blocks = ws.tables.map((t) => {
    const cols = t.fields.map((f) => {
      const attrs = [pks[t.id] === f.name && "pk", !f.nullable && pks[t.id] !== f.name && "not null", f.description && `note: '${f.description.replaceAll("'", "\\'")}'`].filter(Boolean);
      return `  ${f.name} ${f.repeated ? `${f.type}[]` : f.type}${attrs.length ? ` [${attrs.join(", ")}]` : ""}`;
    });
    return `Table ${t.name} {\n${cols.join("\n")}\n}`;
  });
  const refs = relations
    .map((r) => {
      const a = byId.get(r.from.table);
      const b = byId.get(r.to.table);
      return a && b ? `Ref: ${a.name}.${r.from.column} ${r.cardinality === "1:1" ? "-" : ">"} ${b.name}.${r.to.column}` : "";
    })
    .filter(Boolean);
  return [...blocks, "", ...refs].join("\n");
}
