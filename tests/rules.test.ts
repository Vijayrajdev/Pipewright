import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { looksLikePii } from "@/lib/rules/pii";
import { autoFill, describeColumn, entityName } from "@/lib/rules/describe";
import { parseInput } from "@/lib/schema/parsers";
import type { TableSchema } from "@/lib/schema/types";

describe("looksLikePii", () => {
  it.each(["email", "customer_email", "phone_number", "first_name", "zip_code", "date_of_birth", "ip_address", "ssn", "billing_address"])(
    "flags %s",
    (n) => expect(looksLikePii(n)).toBe(true),
  );
  it.each(["order_id", "amount", "unzipped", "product_name", "created_at", "status", "city"])("does not flag %s", (n) =>
    expect(looksLikePii(n)).toBe(false),
  );
});

describe("entityName", () => {
  it.each([
    ["orders", "order"],
    ["stg_categories", "category"],
    ["addresses", "address"],
    ["fct_sales", "sale"],
    ["user_status", "user_status"],
  ])("%s → %s", (t, e) => expect(entityName(t)).toBe(e));
});

describe("describeColumn", () => {
  const d = (name: string, type: "string" | "int" | "bool" | "timestamp" | "date" | "float" = "string") =>
    describeColumn({ name, type, nullable: true }, "order");
  it("covers common patterns", () => {
    expect(d("id", "int")).toBe("Unique identifier for each order.");
    expect(d("customer_id", "int")).toBe("Identifier of the related customer.");
    expect(d("order_id", "int")).toBe("Unique identifier for each order.");
    expect(d("order_date", "date")).toBe("Date of the order.");
    expect(d("created_at", "timestamp")).toBe("Timestamp when the order was created.");
    expect(d("shipped_at", "timestamp")).toBe("Timestamp when the order was shipped.");
    expect(d("is_gift", "bool")).toBe("True if the order is gift.");
    expect(d("customer_email")).toBe("Email address of the customer.");
    expect(d("total_amount_usd", "float")).toBe("Monetary total amount for the order in USD.");
    expect(d("item_count", "int")).toBe("Number of item for the order.");
    expect(d("status")).toBe("Current status of the order.");
    expect(d("mystery_col")).toBeUndefined();
  });
});

describe("autoFill", () => {
  it("fills blanks, flags PII, and keeps user descriptions", () => {
    const schema: TableSchema = {
      name: "orders",
      fields: [
        { name: "order_id", type: "int", nullable: false, description: "Mine" },
        { name: "customer_email", type: "string", nullable: true },
        { name: "notes", type: "string", nullable: true },
      ],
    };
    const { schema: out, described, flagged } = autoFill(schema);
    expect(out.fields[0].description).toBe("Mine");
    expect(out.fields[1]).toMatchObject({ description: "Email address of the customer.", pii: true });
    expect(out.fields[2].description).toBe("Free-text notes about the order.");
    expect(out.description).toBe("One row per order.");
    expect([described, flagged]).toEqual([2, 1]);
  });

  it("describes most columns of the orders sample", () => {
    const { fields } = parseInput(readFileSync("samples/orders.csv", "utf8"));
    const { schema } = autoFill({ name: "orders", fields });
    const blank = schema.fields.filter((f) => !f.description).map((f) => f.name);
    expect(blank).toEqual([]);
  });
});
