import { describe, expect, it } from "vitest";
import { loadTable } from "@/lib/workspace/load";
import { DEMO_FILES } from "@/lib/workspace/demo";
import { activeRelations, detectPrimaryKey, primaryKeys } from "@/lib/workspace/model";
import { autoPlan, joinSql, runJoin } from "@/lib/workspace/joins";
import { dbml, mermaid, modelDdl } from "@/lib/workspace/exports";
import { profileTable } from "@/lib/workspace/profile";
import { EMPTY_WORKSPACE, type Workspace } from "@/lib/workspace/types";

function demo(): Workspace {
  const tables = DEMO_FILES.reduce<ReturnType<typeof loadTable>[]>(
    (acc, f) => [...acc, loadTable(f.text, f.name, acc.map((t) => t.name))],
    [],
  );
  return { ...EMPTY_WORKSPACE, tables };
}
const byName = (ws: Workspace, n: string) => ws.tables.find((t) => t.name === n)!;

describe("workspace", () => {
  const ws = demo();
  const rels = activeRelations(ws);
  const pks = primaryKeys(ws);

  it("loads files into tables with typed columns", () => {
    expect(ws.tables.map((t) => t.name)).toEqual(["customers", "products", "orders", "order_items"]);
    const orders = byName(ws, "orders");
    expect(orders.fields.find((f) => f.name === "shipped_at")).toMatchObject({ type: "timestamp", nullable: true });
  });

  it("detects primary keys", () => {
    expect(detectPrimaryKey(byName(ws, "customers"))).toBe("customer_id");
    expect(detectPrimaryKey(byName(ws, "products"))).toBe("product_id");
    expect(detectPrimaryKey(byName(ws, "order_items"))).toBe("order_item_id");
  });

  it("detects foreign keys and measures orphans", () => {
    const desc = rels.map((r) => {
      const a = ws.tables.find((t) => t.id === r.from.table)!.name;
      const b = ws.tables.find((t) => t.id === r.to.table)!.name;
      return `${a}.${r.from.column} -> ${b}.${r.to.column}`;
    });
    expect(desc.sort()).toEqual([
      "order_items.order_id -> orders.order_id",
      "order_items.product_id -> products.product_id",
      "orders.customer_id -> customers.customer_id",
    ]);
    const custRel = rels.find((r) => r.from.column === "customer_id")!;
    // customer 9 doesn't exist
    expect(custRel.overlap).toBeCloseTo(4 / 5);
    expect(custRel.cardinality).toBe("N:1");
  });

  it("plans and runs joins", () => {
    const plan = autoPlan(byName(ws, "order_items").id, rels, "LEFT");
    expect(plan.steps).toHaveLength(3);
    const { rows, columns } = runJoin(ws, plan);
    expect(rows).toHaveLength(7);
    expect(columns).toContain("customers.full_name");
    expect(rows[0]["products.name"]).toBe("Espresso Beans 1kg");
    expect(rows[0]["customers.full_name"]).toBe("Ana Silva");

    const inner = runJoin(ws, { base: byName(ws, "orders").id, steps: [{ ...autoPlan(byName(ws, "orders").id, rels).steps.find((s) => s.table === byName(ws, "customers").id)!, type: "INNER" }] });
    expect(inner.rows).toHaveLength(5); // order 1006 drops out

    const sql = joinSql(ws, plan, "bigquery");
    expect(sql).toContain("FROM `my_dataset.order_items` AS oi");
    expect(sql).toContain("LEFT JOIN `my_dataset.customers` AS c\n  ON c.customer_id = o.customer_id");
    expect(sql).toContain("o.order_id AS orders_order_id");
  });

  it("profiles columns", () => {
    const p = profileTable(byName(ws, "orders"));
    const status = p.find((c) => c.name === "status")!;
    expect(status.distinct).toBe(3);
    expect(status.top[0]).toEqual({ value: "shipped", count: 3 });
    expect(p.find((c) => c.name === "shipped_at")!.nulls).toBe(3);
    expect(p.find((c) => c.name === "order_id")!.unique).toBe(true);
  });

  it("exports DDL, Mermaid and DBML", () => {
    const ddl = modelDdl(ws, pks, rels, "postgres");
    expect(ddl.indexOf("CREATE TABLE IF NOT EXISTS customers")).toBeLessThan(ddl.indexOf("CREATE TABLE IF NOT EXISTS orders"));
    expect(ddl).toContain("FOREIGN KEY (customer_id) REFERENCES customers (customer_id)");
    expect(mermaid(ws, pks, rels)).toContain('customers ||--o{ orders : "customer_id"');
    expect(dbml(ws, pks, rels)).toContain("Ref: orders.customer_id > customers.customer_id");
  });
});
