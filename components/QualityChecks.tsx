"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useCurrentSchema, useWorkspace } from "@/lib/store";
import { deriveChecks, toGreatExpectations, toSoda, toSqlAssertions, type Check, type QualityInput } from "@/lib/quality";
import { primaryKeys } from "@/lib/workspace/model";
import { DIALECTS, type SqlDialect } from "@/lib/templates";
import { CodeView } from "./CodeView";
import { Card, Tabs } from "./ui";

type Format = "gx" | "soda" | "sql";

const select =
  "mt-1 block w-full border border-line bg-paper px-2.5 py-1.5 font-mono text-sm text-text focus:border-ink focus:outline-none";

const KIND_LABEL: Record<Check["kind"], string> = {
  row_count: "rows",
  not_null: "not null",
  unique: "unique",
  between: "range",
  accepted_values: "values",
  regex: "format",
  not_future: "not future",
  freshness: "fresh",
};

function describeCheck(c: Check): string {
  switch (c.kind) {
    case "row_count":
      return `at least ${c.min} row`;
    case "unique":
      return c.columns.join(" + ");
    case "between":
      return `${c.column} ${c.min !== undefined ? `≥ ${c.min}` : ""}${c.min !== undefined && c.max !== undefined ? " and " : ""}${c.max !== undefined ? `≤ ${c.max}` : ""}`;
    case "accepted_values":
      return `${c.column} in ${c.values.length} values`;
    case "regex":
      return `${c.column} is an ${c.label}`;
    case "freshness":
      return `${c.column} within ${c.hours}h`;
    default:
      return c.column;
  }
}

export function QualityChecks() {
  const [schema] = useCurrentSchema();
  const [ws] = useWorkspace();
  const pks = useMemo(() => primaryKeys(ws), [ws]);

  // sources: the Schema Builder's table, then every table in the Data Model (those come with real stats)
  const sources = useMemo(() => {
    const list: { id: string; label: string; input: QualityInput }[] = [];
    if (schema) list.push({ id: "schema", label: `${schema.name} (Schema Builder)`, input: { schema } });
    for (const t of ws.tables) {
      list.push({
        id: t.id,
        label: `${t.name} (Data Model, profiled)`,
        input: { schema: { name: t.name, dataset: ws.dataset, fields: t.fields }, stats: t.stats, pk: pks[t.id], rowCount: t.rowCount },
      });
    }
    return list;
  }, [schema, ws.tables, ws.dataset, pks]);

  const [sourceId, setSourceId] = useState<string | null>(null);
  const source = sources.find((s) => s.id === sourceId) ?? sources[0];
  const [format, setFormat] = useState<Format>("sql");
  const [dialect, setDialect] = useState<SqlDialect>("bigquery");
  const [off, setOff] = useState<Set<string>>(new Set());

  const checks = useMemo(() => (source ? deriveChecks(source.input) : []), [source]);
  const enabled = useMemo(() => checks.filter((c) => !off.has(c.id)), [checks, off]);
  const code = useMemo(() => {
    if (!source) return "";
    const s = source.input.schema;
    return format === "gx" ? toGreatExpectations(s, enabled) : format === "soda" ? toSoda(s, enabled) : toSqlAssertions(s, enabled, dialect);
  }, [source, format, dialect, enabled]);

  if (!source) {
    return (
      <Card>
        <p className="text-sm text-muted">
          Checks are generated from a table.{" "}
          <Link href="/schema" className="text-ink underline">Build one in the Schema Builder</Link> or{" "}
          <Link href="/workspace" className="text-ink underline">load files into the Data Model</Link> (those give the best checks, because
          they use the real value ranges).
        </p>
      </Card>
    );
  }

  const file = {
    gx: `${source.input.schema.name}_suite.json`,
    soda: `checks_${source.input.schema.name}.yml`,
    sql: `${source.input.schema.name}_assertions.${dialect}.sql`,
  }[format];

  return (
    <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
      <Card className="h-fit">
        <label className="block text-xs text-muted">
          Table
          <select
            value={source.id}
            onChange={(e) => {
              setSourceId(e.target.value);
              setOff(new Set());
            }}
            className={select}
          >
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <p className="label mt-5 mb-2 flex justify-between text-ink">
          <span>Checks</span>
          <span className="text-muted">
            {enabled.length} / {checks.length} on
          </span>
        </p>
        <ul className="max-h-[480px] space-y-1 overflow-y-auto pr-1">
          {checks.map((c, i) => {
            const on = !off.has(c.id);
            return (
              <li key={c.id} className="animate-row-in" style={{ animationDelay: `${Math.min(i, 20) * 30}ms` }}>
                <label className={`flex cursor-pointer gap-2.5 border p-2 transition-colors ${on ? "border-line bg-paper" : "border-transparent opacity-50"}`}>
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-coral"
                    checked={on}
                    onChange={() => setOff((o) => {
                      const n = new Set(o);
                      if (n.has(c.id)) n.delete(c.id);
                      else n.add(c.id);
                      return n;
                    })}
                  />
                  <span className="min-w-0">
                    <span className="flex items-baseline gap-2">
                      <span className="label shrink-0 text-coral-deep">{KIND_LABEL[c.kind]}</span>
                      <span className="truncate font-mono text-sm">{describeCheck(c)}</span>
                    </span>
                    <span className="block text-xs text-muted">{c.reason}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <Tabs<Format>
          items={[
            { id: "sql", label: "SQL assertions" },
            { id: "gx", label: "Great Expectations" },
            { id: "soda", label: "Soda checks" },
          ]}
          value={format}
          onChange={setFormat}
        />
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">
            {format === "sql" && "One query per check. Each returns rows only when the check fails, so any output means a problem."}
            {format === "gx" && "A Great Expectations 1.x suite. Time-based checks aren't included; GX can't compare to “now”. Use SQL or Soda for those."}
            {format === "soda" && "SodaCL checks for soda scan. Drop the file into your checks folder."}
          </p>
          {format === "sql" && (
            <select value={dialect} onChange={(e) => setDialect(e.target.value as SqlDialect)} aria-label="Dialect" className="border border-line bg-paper px-2 py-1.5 font-mono text-sm focus:border-ink focus:outline-none">
              {DIALECTS.map((d) => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </select>
          )}
        </div>
        <CodeView code={code} filename={file} />
      </Card>
    </div>
  );
}
