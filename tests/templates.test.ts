import { describe, expect, it } from "vitest";
import type { TableSchema } from "@/lib/schema/types";
import { DIALECTS, guessKeys, guessOrderBy, TEMPLATES } from "@/lib/templates";

const schema: TableSchema = {
  name: "orders",
  dataset: "sales",
  fields: [
    { name: "order_id", type: "int", nullable: false, description: "Primary key" },
    { name: "customer_email", type: "string", nullable: true, pii: true },
    { name: "amount", type: "decimal", nullable: true },
    { name: "tags", type: "string", nullable: true, repeated: true },
    { name: "created_at", type: "timestamp", nullable: false },
    { name: "updated_at", type: "timestamp", nullable: true },
  ],
};

describe("guesses", () => {
  it("picks the key and version column", () => {
    expect(guessKeys(schema)).toEqual(["order_id"]);
    expect(guessOrderBy(schema)).toBe("updated_at");
  });
});

describe("templates", () => {
  const opts = { keys: ["order_id"], orderBy: "updated_at" };
  for (const t of TEMPLATES) {
    for (const d of DIALECTS) {
      it(`${t.id} / ${d.id} matches snapshot`, () => {
        expect(t.render(schema, { ...opts, dialect: d.id })).toMatchSnapshot();
      });
    }
  }

  it("asks for a key when none is chosen", () => {
    expect(TEMPLATES.find((t) => t.id === "dedupe")!.render(schema, { dialect: "bigquery", keys: [] })).toMatch(/Pick at least one key/);
  });

  it("BigQuery QUALIFY has a WHERE clause", () => {
    const sql = TEMPLATES.find((t) => t.id === "dedupe")!.render(schema, { ...opts, dialect: "bigquery" });
    expect(sql).toMatch(/WHERE TRUE\s+QUALIFY/);
  });

  it("BigQuery SCD2 compares arrays as JSON strings", () => {
    const sql = TEMPLATES.find((t) => t.id === "scd2")!.render(schema, { ...opts, dialect: "bigquery" });
    expect(sql).toContain("TO_JSON_STRING(t.tags) IS DISTINCT FROM TO_JSON_STRING(s.tags)");
    expect(sql).not.toContain("t.updated_at IS DISTINCT FROM");
  });

  it("dbt yaml marks PII and tests the key", () => {
    const yml = TEMPLATES.find((t) => t.id === "dbt")!.render(schema, { ...opts, dialect: "bigquery" });
    expect(yml).toContain("contains_pii: true");
    expect(yml).toMatch(/- name: order_id[\s\S]*?- not_null\n\s+- unique/);
  });
});
