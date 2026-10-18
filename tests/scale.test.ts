import { describe, expect, it } from "vitest";
import { TableBuilder, SAMPLE_ROWS } from "@/lib/workspace/builder";
import { activeRelations, primaryKeys } from "@/lib/workspace/model";
import { profileTable } from "@/lib/workspace/profile";
import { EMPTY_WORKSPACE, type Workspace } from "@/lib/workspace/types";

describe("large datasets", () => {
  it("streams 350k rows with exact keys, stats and relationships", () => {
    const t0 = performance.now();
    const customers = new TableBuilder("customers");
    for (let i = 1; i <= 50_000; i++) customers.add({ customer_id: String(i), country: ["IN", "US", "DE"][i % 3], score: String(i % 100) });
    const orders = new TableBuilder("orders");
    for (let i = 1; i <= 300_000; i++) {
      orders.add({ order_id: String(i), customer_id: String(((i * 7919) % 50_000) + 1), amount: (i % 500) + ".25", note: i % 10 === 0 ? "" : "ok" });
    }
    const ws: Workspace = { ...EMPTY_WORKSPACE, tables: [customers.finish(), orders.finish()] };
    const elapsed = performance.now() - t0;

    const [c, o] = ws.tables;
    expect(o.rowCount).toBe(300_000);
    // memory stays bounded: only a sample of rows is kept
    expect(o.rows).toHaveLength(SAMPLE_ROWS);

    // keys come from the whole file, not the sample
    expect(primaryKeys(ws)).toEqual({ [c.id]: "customer_id", [o.id]: "order_id" });
    expect(o.stats!.order_id).toMatchObject({ unique: true, distinct: 300_000 });
    expect(o.stats!.customer_id.unique).toBe(false);

    // two independent 20k samples would barely overlap; full key sets give the exact answer
    const rels = activeRelations(ws);
    expect(rels).toHaveLength(1);
    expect(rels[0]).toMatchObject({ from: { table: o.id, column: "customer_id" }, to: { table: c.id, column: "customer_id" }, overlap: 1, cardinality: "N:1" });

    // full-file stats in the profile
    const note = profileTable(o).find((p) => p.name === "note")!;
    expect(note.nulls).toBe(30_000);
    const amount = profileTable(o).find((p) => p.name === "amount")!;
    expect(amount).toMatchObject({ min: "0.25", max: "499.25" });

    // generous bound so CI noise doesn't flake; locally this is well under a second
    expect(elapsed).toBeLessThan(10_000);
  });
});
