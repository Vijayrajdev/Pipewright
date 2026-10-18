import { describe, expect, it } from "vitest";
import type { TableSchema } from "@/lib/schema/types";
import { alterStatements, diffSchemas, possibleRenames } from "@/lib/diff";
import { generateRows, toCsv, toInserts } from "@/lib/mock";

const before: TableSchema = {
  name: "orders",
  fields: [
    { name: "order_id", type: "int", nullable: false },
    { name: "amount", type: "int", nullable: true },
    { name: "status", type: "string", nullable: true },
    { name: "note", type: "string", nullable: true },
    { name: "placed_on", type: "date", nullable: true },
  ],
};
const after: TableSchema = {
  name: "orders",
  fields: [
    { name: "order_id", type: "int", nullable: false },
    { name: "amount", type: "decimal", nullable: true },
    { name: "status", type: "string", nullable: false },
    { name: "comment", type: "string", nullable: true },
    { name: "placed_on", type: "bool", nullable: true },
    { name: "channel", type: "string", nullable: false },
  ],
};

describe("diffSchemas", () => {
  const changes = diffSchemas(before, after);
  const find = (path: string, kind: string) => changes.find((c) => c.path === path && c.kind === kind);

  it("classifies changes", () => {
    expect(find("amount", "type")).toMatchObject({ breaking: false });
    expect(find("placed_on", "type")).toMatchObject({ breaking: true });
    expect(find("status", "nullability")).toMatchObject({ breaking: true });
    expect(find("note", "removed")).toMatchObject({ breaking: true });
    expect(find("comment", "added")).toMatchObject({ breaking: false });
    expect(find("channel", "added")).toMatchObject({ breaking: true });
  });

  it("spots likely renames", () => {
    expect(possibleRenames(changes)).toContainEqual(["note", "comment"]);
  });

  it("writes ALTERs per dialect", () => {
    const pg = alterStatements(after, changes, "postgres");
    expect(pg).toContain("ALTER TABLE orders ALTER COLUMN amount TYPE NUMERIC(38,9) USING amount::NUMERIC(38,9);");
    expect(pg).toContain("ALTER TABLE orders DROP COLUMN note;");
    expect(pg).toContain("ALTER TABLE orders ALTER COLUMN status SET NOT NULL;");
    const bq = alterStatements(after, changes, "bigquery");
    expect(bq).toContain("ALTER TABLE `my_dataset.orders` ALTER COLUMN amount SET DATA TYPE NUMERIC;");
    expect(bq).toContain("BigQuery can't make an existing column REQUIRED");
  });
});

describe("generateRows", () => {
  const schema: TableSchema = {
    name: "customers",
    fields: [
      { name: "customer_id", type: "int", nullable: false },
      { name: "full_name", type: "string", nullable: false },
      { name: "email", type: "string", nullable: true },
      { name: "signup_date", type: "date", nullable: false },
      { name: "lifetime_value", type: "decimal", nullable: true },
      { name: "tags", type: "string", nullable: true, repeated: true },
    ],
  };

  it("is deterministic per seed and matches types", () => {
    const a = generateRows(schema, 20, 7);
    expect(generateRows(schema, 20, 7)).toEqual(a);
    expect(a.map((r) => r.customer_id)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(a[0].full_name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
    expect(a.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(String(r.signup_date)))).toBe(true);
    expect(a.every((r) => r.email === null || /@example\.com$/.test(String(r.email)))).toBe(true);
    expect(a.every((r) => r.tags === null || Array.isArray(r.tags))).toBe(true);
  });

  it("serialises to CSV and INSERTs", () => {
    const rows = generateRows(schema, 3, 1);
    expect(toCsv(schema, rows).split("\n")[0]).toBe("customer_id,full_name,email,signup_date,lifetime_value,tags");
    expect(toInserts(schema, rows)).toMatch(/^INSERT INTO customers \(customer_id, full_name/);
  });
});
