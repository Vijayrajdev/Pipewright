"use client";

import { useMemo, useState } from "react";
import { parseInput } from "@/lib/schema/parsers";
import { emitBigQueryJson } from "@/lib/schema/emitters/bigquery";
import { alterStatements, diffSchemas, possibleRenames } from "@/lib/diff";
import type { TableSchema } from "@/lib/schema/types";
import { DIALECTS, type SqlDialect } from "@/lib/templates";
import { useCurrentSchema } from "@/lib/store";
import { CodeView } from "./CodeView";
import { Button, Card, Notice, SectionTitle } from "./ui";

const BEFORE = `CREATE TABLE analytics.orders (
  order_id BIGINT NOT NULL,
  amount BIGINT,
  status TEXT,
  note TEXT,
  placed_on DATE
);`;
const AFTER = `CREATE TABLE analytics.orders (
  order_id BIGINT NOT NULL,
  amount NUMERIC(12,2),
  status TEXT NOT NULL,
  comment TEXT,
  placed_on TIMESTAMP,
  channel TEXT NOT NULL
);`;

function tryParse(text: string): { schema?: TableSchema; error?: string } {
  if (!text.trim()) return {};
  try {
    const r = parseInput(text);
    return { schema: { name: r.name ?? "my_table", fields: r.fields } };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export function SchemaDiff() {
  const [current] = useCurrentSchema();
  const [before, setBefore] = useState("");
  const [after, setAfter] = useState("");
  const [dialect, setDialect] = useState<SqlDialect>("postgres");

  const a = useMemo(() => tryParse(before), [before]);
  const b = useMemo(() => tryParse(after), [after]);
  const changes = useMemo(() => (a.schema && b.schema ? diffSchemas(a.schema, b.schema) : null), [a.schema, b.schema]);
  const renames = changes ? possibleRenames(changes) : [];
  const breaking = changes?.filter((c) => c.breaking).length ?? 0;

  const editor = (label: string, index: string, value: string, set: (v: string) => void, error?: string) => (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <SectionTitle index={index}>{label}</SectionTitle>
        {current && (
          <button onClick={() => set(emitBigQueryJson(current))} className="label link-grow text-ink">
            Use current schema ({current.name})
          </button>
        )}
      </div>
      <textarea
        value={value}
        onChange={(e) => set(e.target.value)}
        spellCheck={false}
        placeholder="Paste DDL, a BigQuery/Avro schema, or a CSV/JSON sample"
        className="block h-56 w-full resize-y border-2 border-dashed border-line bg-transparent p-3 font-mono text-xs leading-relaxed outline-none focus:border-ink/50"
      />
      {error && <p className="mt-2 text-sm text-coral-deep">{error}</p>}
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="accent"
          onClick={() => {
            setBefore(BEFORE);
            setAfter(AFTER);
          }}
        >
          Load an example
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setBefore(after);
            setAfter(before);
          }}
        >
          Swap ⇄
        </Button>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        {editor("Before", "01", before, setBefore, a.error)}
        {editor("After", "02", after, setAfter, b.error)}
      </div>

      {changes && (
        <Card>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <SectionTitle index="03">Changes</SectionTitle>
            <span className={`label px-2.5 py-1 ${breaking ? "bg-coral text-night" : "bg-ink text-ivory"}`}>
              {breaking ? `${breaking} breaking` : "No breaking changes"}
            </span>
            <span className="label text-muted">{changes.length} total</span>
          </div>
          {changes.length === 0 ? (
            <p className="text-sm text-muted">The schemas are identical.</p>
          ) : (
            <ul className="divide-y divide-line border-y border-line">
              {changes.map((c, i) => (
                <li key={`${c.path}-${c.kind}`} className="flex animate-row-in flex-wrap items-center gap-3 py-2.5" style={{ animationDelay: `${i * 50}ms` }}>
                  <span className={`label w-20 shrink-0 ${c.breaking ? "text-coral-deep" : "text-ink"}`}>{c.breaking ? "● breaking" : "○ safe"}</span>
                  <span className="label w-24 shrink-0 text-muted">{c.kind}</span>
                  <span className="font-mono text-sm font-semibold">{c.path}</span>
                  <span className="text-sm text-muted">{c.summary}</span>
                </li>
              ))}
            </ul>
          )}
          {renames.length > 0 && (
            <div className="mt-4">
              <Notice>
                Possible renames: {renames.map(([o, n]) => `${o} → ${n}`).join(", ")}. If so, use RENAME COLUMN instead
                of drop + add to keep the data.
              </Notice>
            </div>
          )}
          <div className="mt-6 mb-3 flex items-center gap-3">
            <p className="label text-ink">Migration</p>
            <select
              value={dialect}
              onChange={(e) => setDialect(e.target.value as SqlDialect)}
              className="border border-line bg-paper px-2 py-1.5 font-mono text-sm focus:border-ink focus:outline-none"
              aria-label="Dialect"
            >
              {DIALECTS.map((d) => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </select>
          </div>
          <CodeView code={alterStatements(b.schema!, changes, dialect)} filename={`${b.schema!.name}_migration.${dialect}.sql`} />
        </Card>
      )}
    </div>
  );
}
