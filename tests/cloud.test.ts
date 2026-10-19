import { describe, expect, it } from "vitest";
import { mergeRecent, sanitizeWorkspace, serialize } from "@/lib/cloud/account";
import { loadTable } from "@/lib/workspace/load";
import { DEMO_FILES } from "@/lib/workspace/demo";
import { EMPTY_WORKSPACE, type Workspace } from "@/lib/workspace/types";
import type { RecentItem } from "@/lib/store";

function demo(): Workspace {
  const tables = DEMO_FILES.reduce<ReturnType<typeof loadTable>[]>((acc, f) => [...acc, loadTable(f.text, f.name, acc.map((t) => t.name))], []);
  return { ...EMPTY_WORKSPACE, tables };
}

describe("cloud sync privacy", () => {
  it("never uploads rows, key hashes or example values of personal-data columns", () => {
    const ws = demo();
    const json = serialize("workspace", ws)!;
    expect(json).not.toContain("ana@example.com");
    expect(json).not.toContain("Ana Silva");
    const up = JSON.parse(json) as Workspace;
    for (const t of up.tables) {
      expect(t.rows).toEqual([]);
      expect(t.keyHashes).toBeUndefined();
    }
    const customers = up.tables.find((t) => t.name === "customers")!;
    // counts are kept, values are not
    expect(customers.stats!.email.nonNull).toBe(5);
    expect(customers.stats!.email.top).toBeUndefined();
    expect(customers.stats!.email.min).toBeUndefined();
    // non-personal columns keep their profile
    expect(customers.stats!.country.top!.length).toBeGreaterThan(0);
  });

  it("keeps the model's structure", () => {
    const clean = sanitizeWorkspace(demo());
    expect(clean.tables.map((t) => t.name)).toEqual(["customers", "products", "orders", "order_items"]);
    expect(clean.tables[2].fields.map((f) => f.name)).toContain("customer_id");
  });

  it("refuses models over Firestore's document limit", () => {
    const ws = demo();
    const huge = { ...ws, tables: ws.tables.map((t) => ({ ...t, fields: [...t.fields, ...Array.from({ length: 20_000 }, (_, i) => ({ name: `col_${i}_${"x".repeat(40)}`, type: "string" as const, nullable: true }))] })) };
    expect(serialize("workspace", huge)).toBeNull();
  });

  it("merges recent work from two devices, newest first", () => {
    const item = (name: string, savedAt: string): RecentItem => ({ name, savedAt, columns: 1, schema: { name, fields: [] } });
    const laptop = [item("orders", "2026-10-02T00:00:00Z"), item("users", "2026-10-01T00:00:00Z")];
    const desktop = [item("orders", "2026-10-03T00:00:00Z"), item("events", "2026-09-30T00:00:00Z")];
    expect(mergeRecent(laptop, desktop).map((i) => `${i.name}@${i.savedAt.slice(8, 10)}`)).toEqual(["orders@03", "users@01", "events@30"]);
  });
});
