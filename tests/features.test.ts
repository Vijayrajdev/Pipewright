import { describe, expect, it } from "vitest";
import { hash53, overlapSorted, sortedHashes } from "@/lib/workspace/keys";
import { loadTable } from "@/lib/workspace/load";
import { DEMO_FILES } from "@/lib/workspace/demo";
import { activeRelations, primaryKeys } from "@/lib/workspace/model";
import { dataDictionary, dbtProject } from "@/lib/workspace/docs";
import { runJoin } from "@/lib/workspace/joins";
import { TableBuilder } from "@/lib/workspace/builder";
import { deriveChecks, toGreatExpectations, toSoda, toSqlAssertions } from "@/lib/quality";
import { airflowDag, dagsterAssets, explainCron, nextRuns, parseCron, type PipelineSpec } from "@/lib/pipelines";
import { EMPTY_WORKSPACE, type Workspace } from "@/lib/workspace/types";

function demo(): Workspace {
  const tables = DEMO_FILES.reduce<ReturnType<typeof loadTable>[]>((acc, f) => [...acc, loadTable(f.text, f.name, acc.map((t) => t.name))], []);
  return { ...EMPTY_WORKSPACE, dataset: "shop", tables };
}
const byName = (ws: Workspace, n: string) => ws.tables.find((t) => t.name === n)!;

describe("key hashes", () => {
  it("hashes deterministically within 53 bits", () => {
    expect(hash53("customer-1")).toBe(hash53("customer-1"));
    expect(hash53("a")).not.toBe(hash53("b"));
    expect(Number.isSafeInteger(hash53("x".repeat(500)))).toBe(true);
  });

  it("measures overlap of sorted sets in one pass", () => {
    const pk = sortedHashes(["1", "2", "3", "4"].map(hash53));
    const fk = sortedHashes(["2", "4", "9"].map(hash53));
    expect(overlapSorted(fk, pk)).toBeCloseTo(2 / 3);
    expect(overlapSorted(new Float64Array(), pk)).toBeNull();
  });

  it("tables carry transferable key hashes and a load-time profile", () => {
    const orders = byName(demo(), "orders");
    expect(orders.keyHashes?.order_id).toBeInstanceOf(Float64Array);
    expect(orders.sampleCount).toBe(orders.rows.length);
    expect(orders.stats!.status.top!.length).toBeGreaterThan(0);
    expect(orders.stats!.status.enumValues).toEqual(["cancelled", "processing", "shipped"]);
  });

  it("detects relationships from hashes alone, without sample rows", () => {
    const ws = demo();
    const stripped: Workspace = { ...ws, tables: ws.tables.map((t) => ({ ...t, rows: [] })) };
    const desc = (w: Workspace) => activeRelations(w).map((r) => `${r.id}:${r.overlap}`).sort();
    expect(desc(stripped)).toEqual(desc(ws));
  });
});

describe("join preview", () => {
  it("stays linear on heavily repeated keys", () => {
    const a = new TableBuilder("facts", undefined, 20_000);
    const b = new TableBuilder("dims", undefined, 20_000);
    for (let i = 0; i < 20_000; i++) a.add({ fact_id: String(i), dim_id: String(i % 3) });
    for (let i = 0; i < 20_000; i++) b.add({ row_id: String(i), dim_id: String(i % 3) });
    const ws: Workspace = { ...EMPTY_WORKSPACE, tables: [a.finish(), b.finish()] };
    const t0 = performance.now();
    const res = runJoin(ws, { base: ws.tables[0].id, steps: [{ table: ws.tables[1].id, type: "INNER", leftTable: ws.tables[0].id, leftColumn: "dim_id", rightColumn: "dim_id" }] });
    expect(res.rows).toHaveLength(5000);
    expect(performance.now() - t0).toBeLessThan(2000);
  });
});

describe("model docs", () => {
  const ws = demo();
  const pks = primaryKeys(ws);
  const rels = activeRelations(ws);

  it("writes dbt sources with data-backed tests and staging models", () => {
    const out = dbtProject(ws, pks, rels);
    expect(out).toContain("  - name: shop");
    expect(out).toMatch(/- name: customer_id\n(.|\n)*?- unique/);
    expect(out).toContain("to: source('shop', 'customers')");
    // customer 9 is an orphan, so that relationship starts as a warning
    expect(out).toMatch(/severity: warn {2}# 20% orphan keys today/);
    expect(out).toContain('values: ["cancelled", "processing", "shipped"]');
    expect(out).toContain("-- ── models/staging/stg_shop__orders.sql");
    expect(out).toContain("cast(order_id as {{ dbt.type_int() }})");
    expect(out).toContain("contains_pii: true");
  });

  it("writes a Markdown data dictionary that hides PII examples", () => {
    const out = dataDictionary(ws, pks, rels);
    expect(out).toContain("# Data dictionary: `shop`");
    expect(out).toContain("- **Primary key:** `customer_id`");
    expect(out).toContain("[customers](#customers).`customer_id`");
    const emailRow = out.split("\n").find((l) => l.startsWith("| `email`"))!;
    expect(emailRow).toContain("_hidden (PII)_");
    expect(emailRow).not.toContain("@example.com");
  });
});

describe("quality checks", () => {
  const ws = demo();
  const orders = byName(ws, "orders");
  const input = { schema: { name: "orders", dataset: "shop", fields: orders.fields }, stats: orders.stats, pk: "order_id", rowCount: orders.rowCount };
  const checks = deriveChecks(input);

  it("derives checks from the data", () => {
    const kinds = checks.map((c) => `${c.kind}:${"column" in c ? c.column : "columns" in c ? c.columns.join("+") : ""}`);
    expect(kinds).toContain("unique:order_id");
    expect(kinds).toContain("not_null:order_id");
    expect(kinds).toContain("accepted_values:status");
    expect(kinds).toContain("not_future:order_date");
    // ids are numbers but not quantities
    expect(kinds.filter((k) => k.startsWith("between:"))).toEqual([]);
    const items = byName(ws, "order_items");
    const itemChecks = deriveChecks({ schema: { name: "order_items", fields: items.fields }, stats: items.stats });
    expect(itemChecks.filter((c) => c.kind === "between").map((c) => "column" in c && c.column)).toEqual(["quantity", "line_total"]);
  });

  it("emits GX, Soda and SQL", () => {
    const gx = JSON.parse(toGreatExpectations(input.schema, checks));
    expect(gx.expectations.map((e: { type: string }) => e.type)).toContain("expect_column_values_to_be_in_set");
    const soda = toSoda(input.schema, checks);
    expect(soda).toContain("checks for orders:");
    expect(soda).toContain("duplicate_count(order_id) = 0");
    expect(soda).toMatch(/invalid_count\(status\) = 0:\n\s+valid values: \["cancelled", "processing", "shipped"\]/);
    const sql = toSqlAssertions(input.schema, checks, "bigquery");
    expect(sql).toContain("FROM `shop.orders` GROUP BY order_id HAVING COUNT(*) > 1");
    expect(toSqlAssertions(input.schema, checks, "postgres")).toContain('WHERE order_date > NOW()');
  });
});

describe("pipelines", () => {
  const spec: PipelineSpec = {
    name: "orders",
    dataset: "shop",
    source: "files",
    sourcePath: "gs://landing/orders/{ds}/*.csv",
    target: "bigquery",
    mode: "merge",
    keys: ["order_id"],
    schedule: "30 7 * * 1-5",
    owner: "data-eng",
    retries: 2,
    dbt: true,
    checks: true,
  };

  it("explains cron and finds the next runs", () => {
    expect(explainCron("0 6 * * *")).toBe("At 06:00 (UTC)");
    expect(explainCron("30 7 * * 1-5")).toBe("At 07:30 on weekdays (UTC)");
    expect(explainCron("*/15 * * * *")).toBe("Every 15 minutes (UTC)");
    expect(parseCron("61 * * * *")).toBeNull();
    // Saturday 2026-10-24 → next weekday run is Monday
    expect(nextRuns("30 7 * * 1-5", new Date("2026-10-24T12:00:00Z"), 2).map((d) => d.toISOString())).toEqual(["2026-10-26T07:30:00.000Z", "2026-10-27T07:30:00.000Z"]);
    expect(nextRuns("0 0 29 2 *", new Date("2026-10-19T00:00:00Z"), 1)[0].toISOString()).toBe("2028-02-29T00:00:00.000Z");
  });

  it("drafts an Airflow 3 DAG", () => {
    const dag = airflowDag(spec);
    expect(dag).toContain("from airflow.sdk import dag, task");
    expect(dag).toContain('schedule="30 7 * * 1-5",  # At 07:30 on weekdays (UTC)');
    expect(dag).toContain("uris = ['gs://landing/orders/{{ ds }}/*.csv']");
    expect(dag).toContain("SQLTableCheckOperator");
    expect(dag).toContain("dbt build --select orders+");
    expect(dag.trim().endsWith("orders_pipeline()")).toBe(true);
  });

  it("drafts Dagster assets with checks and a schedule", () => {
    const code = dagsterAssets({ ...spec, target: "snowflake", source: "api", sourcePath: "" });
    expect(code).toContain("@dg.asset_check(asset=orders)");
    expect(code).toContain('cron_schedule="30 7 * * 1-5"');
    expect(code).toContain("COPY INTO shop.orders_staging");
  });
});
