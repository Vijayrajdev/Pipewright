import { quoteIdent } from "@/lib/schema/normalize";
import type { SqlDialect } from "@/lib/templates";
import { keyOf } from "./profile";
import type { Relation, Row, Workspace, WsTable } from "./types";

export type JoinType = "INNER" | "LEFT" | "RIGHT" | "FULL";

export interface JoinStep {
  /** table being joined in */
  table: string;
  type: JoinType;
  /** already-joined table + column on the left of ON */
  leftTable: string;
  leftColumn: string;
  rightColumn: string;
}

export interface JoinPlan {
  base: string;
  steps: JoinStep[];
}

/** Short, unique aliases: orders → o, order_items → oi, orders_2 → o2 */
export function aliasesFor(tables: WsTable[]): Record<string, string> {
  const used = new Set<string>();
  const out: Record<string, string> = {};
  for (const t of tables) {
    const base = t.name.split("_").filter(Boolean).map((p) => p[0]).join("").replace(/[^a-z]/g, "") || "t";
    let alias = base;
    for (let n = 2; used.has(alias); n++) alias = `${base}${n}`;
    used.add(alias);
    out[t.id] = alias;
  }
  return out;
}

/** Plan that walks relationships outward from the base table (BFS), joining every reachable table. */
export function autoPlan(base: string, relations: Relation[], type: JoinType = "LEFT"): JoinPlan {
  const joined = new Set([base]);
  const steps: JoinStep[] = [];
  let progress = true;
  while (progress) {
    progress = false;
    for (const r of relations) {
      if (joined.has(r.from.table) && !joined.has(r.to.table)) {
        steps.push({ table: r.to.table, type, leftTable: r.from.table, leftColumn: r.from.column, rightColumn: r.to.column });
        joined.add(r.to.table);
        progress = true;
      } else if (joined.has(r.to.table) && !joined.has(r.from.table)) {
        steps.push({ table: r.from.table, type, leftTable: r.to.table, leftColumn: r.to.column, rightColumn: r.from.column });
        joined.add(r.from.table);
        progress = true;
      }
    }
  }
  return { base, steps };
}

const q = (d: SqlDialect) => (d === "bigquery" || d === "databricks" ? "`" : '"');

function tableRef(t: WsTable, d: SqlDialect, dataset?: string) {
  if (d === "bigquery") return `\`${dataset || "my_dataset"}.${t.name}\``;
  return [dataset, t.name].filter(Boolean).map((p) => quoteIdent(p!, q(d))).join(".");
}

/** SELECT … FROM … JOIN … in the chosen dialect. Duplicate column names get a table prefix. */
export function joinSql(ws: Workspace, plan: JoinPlan, d: SqlDialect): string {
  const byId = new Map(ws.tables.map((t) => [t.id, t]));
  const ordered = [plan.base, ...plan.steps.map((s) => s.table)].map((id) => byId.get(id)).filter(Boolean) as WsTable[];
  if (!ordered.length) return "-- Pick a base table.";
  const alias = aliasesFor(ordered);
  const id = (n: string) => quoteIdent(n, q(d));

  const counts = new Map<string, number>();
  ordered.forEach((t) => t.fields.forEach((f) => counts.set(f.name, (counts.get(f.name) ?? 0) + 1)));
  const select = ordered.flatMap((t) =>
    t.fields.map((f) => {
      const col = `${alias[t.id]}.${id(f.name)}`;
      return (counts.get(f.name) ?? 0) > 1 ? `${col} AS ${id(`${t.name}_${f.name}`)}` : col;
    }),
  );

  const lines = [`SELECT`, select.map((s, i) => `  ${s}${i < select.length - 1 ? "," : ""}`).join("\n")];
  lines.push(`FROM ${tableRef(ordered[0], d, ws.dataset)} AS ${alias[ordered[0].id]}`);
  for (const s of plan.steps) {
    const t = byId.get(s.table);
    if (!t) continue;
    const type = s.type === "FULL" ? "FULL OUTER" : s.type;
    lines.push(
      `${type} JOIN ${tableRef(t, d, ws.dataset)} AS ${alias[t.id]}\n  ON ${alias[s.table]}.${id(s.rightColumn)} = ${alias[s.leftTable]}.${id(s.leftColumn)}`,
    );
  }
  return lines.join("\n") + ";";
}

/** Execute the plan over the sampled rows, in the browser. Columns are keyed "table.column". */
export function runJoin(ws: Workspace, plan: JoinPlan, limit = 5000): { columns: string[]; rows: Row[] } {
  const byId = new Map(ws.tables.map((t) => [t.id, t]));
  const base = byId.get(plan.base);
  if (!base) return { columns: [], rows: [] };

  // "table.column" names built once per table, not once per row
  const names = new Map<string, [string, string][]>();
  const prefix = (t: WsTable, r: Row | undefined) => {
    let cols = names.get(t.id);
    if (!cols) names.set(t.id, (cols = t.fields.map((f) => [`${t.name}.${f.name}`, f.name])));
    const out: Row = {};
    for (const [key, src] of cols) out[key] = r ? r[src] : null;
    return out;
  };

  let result: Row[] = base.rows.map((r) => prefix(base, r));
  const columns = base.fields.map((f) => `${base.name}.${f.name}`);

  for (const s of plan.steps) {
    const right = byId.get(s.table);
    const left = byId.get(s.leftTable);
    if (!right || !left) continue;
    const leftKey = `${left.name}.${s.leftColumn}`;
    const index = new Map<string, Row[]>();
    for (const r of right.rows) {
      const v = r[s.rightColumn];
      if (v === null || v === undefined || v === "") continue;
      const k = keyOf(v);
      // push, not spread: rebuilding the array per row is quadratic on repeated keys
      const bucket = index.get(k);
      if (bucket) bucket.push(r);
      else index.set(k, [r]);
    }
    const matchedRight = new Set<Row>();
    const next: Row[] = [];
    for (const row of result) {
      const v = row[leftKey];
      const matches = v === null || v === undefined || v === "" ? [] : (index.get(keyOf(v)) ?? []);
      if (matches.length) {
        for (const m of matches) {
          matchedRight.add(m);
          next.push({ ...row, ...prefix(right, m) });
          if (next.length >= limit) break;
        }
      } else if (s.type === "LEFT" || s.type === "FULL") {
        next.push({ ...row, ...prefix(right, undefined) });
      }
      if (next.length >= limit) break;
    }
    if (s.type === "RIGHT" || s.type === "FULL") {
      const empty = Object.fromEntries(columns.map((c) => [c, null]));
      for (const r of right.rows) if (!matchedRight.has(r) && next.length < limit) next.push({ ...empty, ...prefix(right, r) });
    }
    columns.push(...right.fields.map((f) => `${right.name}.${f.name}`));
    result = next;
  }
  return { columns, rows: result };
}
