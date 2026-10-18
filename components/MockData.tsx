"use client";

import { useDeferredValue, useMemo, useState } from "react";
import Link from "next/link";
import { generateRows, toCsv, toInserts, toJson, toNdjson } from "@/lib/mock";
import { useCurrentSchema } from "@/lib/store";
import { CodeView } from "./CodeView";
import { Card, SectionTitle, Tabs } from "./ui";

type Format = "csv" | "json" | "ndjson" | "sql";

export function MockData() {
  const [schema] = useCurrentSchema();
  const [count, setCount] = useState(25);
  const [seed, setSeed] = useState(42);
  const [format, setFormat] = useState<Format>("csv");

  // defer so dragging the slider stays smooth while rows regenerate
  const deferredCount = useDeferredValue(count);
  const rows = useMemo(() => (schema ? generateRows(schema, deferredCount, seed) : []), [schema, deferredCount, seed]);

  if (!schema) {
    return (
      <Card>
        <p className="text-sm text-muted">
          Mock data is generated from a table schema.{" "}
          <Link href="/schema" className="link-grow text-ink">
            Build or load one in the Schema Builder
          </Link>{" "}
          first.
        </p>
      </Card>
    );
  }

  const output =
    format === "csv" ? toCsv(schema, rows) : format === "json" ? toJson(rows) : format === "ndjson" ? toNdjson(rows) : toInserts(schema, rows);
  const ext = { csv: "csv", json: "json", ndjson: "ndjson", sql: "sql" }[format];
  const cols = schema.fields.map((f) => f.name);

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      <Card className="h-fit">
        <SectionTitle index="01">Settings</SectionTitle>
        <p className="mb-4 text-sm">
          Table <span className="font-mono text-ink">{schema.name}</span> · {schema.fields.length} columns
        </p>
        <label className="label block text-muted">
          Rows: <span className="font-mono text-ink">{count}</span>
          <input
            type="range"
            min={1}
            max={100000}
            step={count < 1000 ? 1 : 100}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="mt-2 block w-full accent-coral"
          />
        </label>
        <label className="label mt-4 block text-muted">
          Seed
          <div className="mt-1 flex gap-2">
            <input
              type="number"
              value={seed}
              onChange={(e) => setSeed(Number(e.target.value) || 0)}
              className="w-full border border-line bg-paper px-2.5 py-1.5 font-mono text-sm tracking-normal text-text focus:border-ink focus:outline-none"
            />
            <button
              onClick={() => setSeed(Math.floor(Math.random() * 100000))}
              className="label border border-line px-3 text-ink transition-all duration-300 hover:rotate-180 hover:border-ink"
              aria-label="Random seed"
              title="Random seed"
            >
              ⟳
            </button>
          </div>
        </label>
        <p className="mt-4 text-xs leading-relaxed text-muted">
          Values follow column names and types: emails look like emails, keys count up, dates fall in the last two
          years, and about 8% of nullable values are null. The same seed always gives the same rows.
        </p>
      </Card>

      <div className="space-y-6">
        <Card>
          <SectionTitle index="02">Preview</SectionTitle>
          <div className="max-h-[340px] overflow-auto border border-line bg-paper">
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 bg-ink text-ivory">
                <tr>
                  {cols.map((c) => (
                    <th key={c} className="px-2 py-2 text-left font-mono font-medium whitespace-nowrap">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody key={`${seed}-${count}`}>
                {rows.slice(0, 20).map((r, i) => (
                  <tr key={i} className="animate-row-in border-b border-line/60 odd:bg-ivory/40" style={{ animationDelay: `${i * 25}ms` }}>
                    {cols.map((c) => {
                      const v = r[c];
                      return (
                        <td key={c} className={`px-2 py-1.5 font-mono whitespace-nowrap ${v === null ? "text-coral-deep/70 italic" : ""}`}>
                          {v === null ? "null" : typeof v === "object" ? JSON.stringify(v) : String(v)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card>
          <SectionTitle index="03">Export</SectionTitle>
          <Tabs<Format>
            items={[
              { id: "csv", label: "CSV" },
              { id: "json", label: "JSON" },
              { id: "ndjson", label: "NDJSON" },
              { id: "sql", label: "SQL INSERT" },
            ]}
            value={format}
            onChange={setFormat}
          />
          <CodeView code={output} filename={`${schema.name}_mock.${ext}`} />
        </Card>
      </div>
    </div>
  );
}
