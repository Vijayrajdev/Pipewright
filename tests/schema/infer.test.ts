import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { inferFields, unify } from "@/lib/schema/infer";
import { toSnakeCase } from "@/lib/schema/normalize";
import { parseInput } from "@/lib/schema/parsers";

const byName = <T extends { name: string }>(list: T[]) => Object.fromEntries(list.map((f) => [f.name, f]));

describe("toSnakeCase", () => {
  it.each([
    ["Order ID", "order_id"],
    ["orderDate", "order_date"],
    ["HTTPStatus", "http_status"],
    ["zip-code", "zip_code"],
    ["2fa enabled", "_2fa_enabled"],
  ])("%s → %s", (input, expected) => expect(toSnakeCase(input)).toBe(expected));
});

describe("unify", () => {
  it("widens int to float and date to timestamp", () => {
    expect(unify("int", "float")).toBe("float");
    expect(unify("date", "timestamp")).toBe("timestamp");
    expect(unify("bool", "date")).toBe("string");
  });
});

describe("inferFields", () => {
  it("detects scalar types from string values", () => {
    const f = byName(
      inferFields([
        { a: "1", b: "1.5", c: "true", d: "2024-01-05", e: "2024-01-05T10:00:00Z", g: "hello", z: "02139" },
        { a: "2", b: "2", c: "false", d: "2024-02-01", e: "2024-01-05 10:00", g: "", z: "10001" },
      ]),
    );
    expect(f.a.type).toBe("int");
    expect(f.b.type).toBe("float");
    expect(f.c.type).toBe("bool");
    expect(f.d.type).toBe("date");
    expect(f.e.type).toBe("timestamp");
    expect(f.g).toMatchObject({ type: "string", nullable: true });
    expect(f.a.nullable).toBe(false);
    // leading zeros are preserved as strings
    expect(f.z.type).toBe("string");
  });

  it("builds nested records and repeated fields from JSON", () => {
    const f = byName(
      inferFields([
        { user: { id: 1, name: "a" }, tags: ["x", "y"], items: [{ sku: "s1", qty: 2 }] },
        { user: { id: 2 }, tags: [], items: [] },
      ]),
    );
    expect(f.user.type).toBe("record");
    expect(byName(f.user.fields!).name.nullable).toBe(true);
    expect(f.tags).toMatchObject({ type: "string", repeated: true });
    expect(f.items).toMatchObject({ type: "record", repeated: true });
  });
});

describe("parseInput", () => {
  it("parses the orders CSV sample", () => {
    const { kind, fields } = parseInput(readFileSync("samples/orders.csv", "utf8"));
    expect(kind).toBe("csv");
    const f = byName(fields);
    expect(f.order_id.type).toBe("int");
    expect(f.customer_email.nullable).toBe(true);
    expect(f.order_date.type).toBe("date");
    expect(f.created_at.type).toBe("timestamp");
    expect(f.amount.type).toBe("float");
    expect(f.is_gift.type).toBe("bool");
    expect(f.zip_code.type).toBe("string");
  });

  it("parses the events NDJSON sample", () => {
    const { kind, fields } = parseInput(readFileSync("samples/events.ndjson", "utf8"));
    expect(kind).toBe("json");
    const f = byName(fields);
    expect(f.user_id).toMatchObject({ type: "int", nullable: true });
    expect(f.props.type).toBe("record");
    expect(byName(f.props.fields!).duration_ms.type).toBe("float");
    expect(f.tags.repeated).toBe(true);
  });

  it("round-trips a BigQuery schema", () => {
    const { kind, fields } = parseInput(
      JSON.stringify([
        { name: "id", type: "INTEGER", mode: "REQUIRED" },
        { name: "addr", type: "RECORD", fields: [{ name: "city", type: "STRING" }] },
      ]),
    );
    expect(kind).toBe("bigquery");
    expect(fields[0]).toMatchObject({ name: "id", type: "int", nullable: false });
    expect(fields[1].fields![0]).toMatchObject({ name: "city", type: "string" });
  });

  it("parses Avro", () => {
    const { kind, name, fields } = parseInput(
      JSON.stringify({
        type: "record",
        name: "user",
        fields: [
          { name: "id", type: "long" },
          { name: "born", type: ["null", { type: "int", logicalType: "date" }] },
        ],
      }),
    );
    expect(kind).toBe("avro");
    expect(name).toBe("user");
    expect(fields[1]).toMatchObject({ type: "date", nullable: true });
  });

  it("parses SQL DDL", () => {
    const { kind, name, fields } = parseInput(`
      CREATE TABLE IF NOT EXISTS analytics.orders (
        id BIGINT NOT NULL,
        amount NUMERIC(12, 2),
        status VARCHAR(20) DEFAULT 'new',
        tags TEXT[],
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        PRIMARY KEY (id)
      );`);
    expect(kind).toBe("ddl");
    expect(name).toBe("orders");
    expect(fields.map((f) => [f.name, f.type, f.nullable])).toEqual([
      ["id", "int", false],
      ["amount", "decimal", true],
      ["status", "string", true],
      ["tags", "string", true],
      ["created_at", "timestamp", false],
    ]);
    expect(fields[3].repeated).toBe(true);
  });
});
