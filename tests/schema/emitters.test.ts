import { describe, expect, it } from "vitest";
import type { TableSchema } from "@/lib/schema/types";
import { OUTPUT_FORMATS } from "@/lib/schema/emitters";
import { emitBigQueryJson } from "@/lib/schema/emitters/bigquery";
import { parseInput } from "@/lib/schema/parsers";

const schema: TableSchema = {
  name: "orders",
  dataset: "sales",
  description: "One row per order",
  partitionBy: "created_at",
  clusterBy: ["customer_id"],
  fields: [
    { name: "order_id", type: "int", nullable: false, description: "Primary key" },
    { name: "customer_id", type: "string", nullable: false },
    { name: "amount", type: "decimal", nullable: true, description: "Order total in USD, incl. 'tax'" },
    { name: "created_at", type: "timestamp", nullable: false },
    { name: "tags", type: "string", nullable: true, repeated: true },
    {
      name: "shipping",
      type: "record",
      nullable: true,
      fields: [
        { name: "city", type: "string", nullable: true },
        { name: "shipped_on", type: "date", nullable: true },
      ],
    },
  ],
};

describe("emitters", () => {
  it.each(OUTPUT_FORMATS.map((f) => [f.id, f] as const))("%s matches snapshot", (_id, format) => {
    expect(format.emit(schema)).toMatchSnapshot();
  });

  it("JSON outputs are valid JSON", () => {
    for (const f of OUTPUT_FORMATS.filter((f) => f.language === "json")) {
      expect(() => JSON.parse(f.emit(schema))).not.toThrow();
    }
  });

  it("BigQuery schema.json round-trips through the parser", () => {
    const { fields } = parseInput(emitBigQueryJson(schema));
    expect(fields).toEqual(schema.fields);
  });
});
