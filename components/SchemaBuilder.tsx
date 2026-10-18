"use client";

import { useState } from "react";
import Link from "next/link";
import type { Field, TableSchema } from "@/lib/schema/types";
import { INPUT_LABELS, parseInput, type InputKind } from "@/lib/schema/parsers";
import { applyDescriptions } from "@/lib/schema/edit";
import { toSnakeCase } from "@/lib/schema/normalize";
import { autoFill } from "@/lib/rules/describe";
import { useCurrentSchema, useRecent } from "@/lib/store";
import { useAiStatus } from "@/lib/useAiStatus";
import { InputPanel } from "./InputPanel";
import { SchemaGrid } from "./SchemaGrid";
import { OutputPanel } from "./OutputPanel";
import { Button, Card, Notice, SectionTitle } from "./ui";

const PARTITIONABLE: Field["type"][] = ["date", "timestamp", "int"];

function tableNameFromFile(fileName?: string) {
  return fileName ? toSnakeCase(fileName.replace(/\.[^.]+$/, "")) : undefined;
}

export function SchemaBuilder() {
  const [schema, setSchema] = useCurrentSchema();
  const [, remember] = useRecent();
  const ai = useAiStatus();
  const [error, setError] = useState<string>();
  const [detected, setDetected] = useState<InputKind>();
  const [describing, setDescribing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [filled, setFilled] = useState<string>();

  const update = (patch: Partial<TableSchema>) => schema && setSchema({ ...schema, ...patch });

  function handleInput(text: string, fileName?: string) {
    try {
      const result = parseInput(text);
      setError(undefined);
      setDetected(result.kind);
      setFilled(undefined);
      setSchema({
        name: result.name ?? tableNameFromFile(fileName) ?? schema?.name ?? "my_table",
        dataset: schema?.dataset,
        fields: result.fields,
      });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function autoFillDescriptions() {
    if (!schema) return;
    const result = autoFill(schema);
    setSchema(result.schema);
    setFilled(
      result.described + result.flagged === 0
        ? "Nothing to add: no empty descriptions matched a known naming pattern."
        : `Drafted ${result.described} description${result.described === 1 ? "" : "s"} and flagged ${result.flagged} PII column${result.flagged === 1 ? "" : "s"} from naming patterns. Review them before you ship.`,
    );
  }

  async function suggestDescriptions() {
    if (!schema) return;
    setDescribing(true);
    setError(undefined);
    try {
      const res = await fetch("/api/ai/describe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schema }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      const byPath = new Map<string, { description: string; pii: boolean }>(
        (data.columns as { path: string; description: string; pii: boolean }[]).map((c) => [c.path, c]),
      );
      setSchema({ ...schema, fields: applyDescriptions(schema.fields, byPath) });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDescribing(false);
    }
  }

  function save() {
    if (!schema) return;
    remember(schema);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  const partitionOptions = schema?.fields.filter((f) => PARTITIONABLE.includes(f.type) && !f.repeated) ?? [];

  return (
    <div className="grid gap-6">
      <InputPanel onSubmit={handleInput} />
      {error && <Notice tone="error">{error}</Notice>}

      {schema && (
        <>
          <Card>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <SectionTitle index="02">Review the schema</SectionTitle>
                <p className="text-sm text-muted">
                  {detected ? `Detected ${INPUT_LABELS[detected]}. ` : ""}
                  {schema.fields.length} columns. Check the types, then fill in descriptions.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="accent" onClick={autoFillDescriptions} title="Free: drafts descriptions and flags PII from column names">
                  Auto-fill descriptions
                </Button>
                {ai.enabled && (
                  <Button variant="ghost" onClick={suggestDescriptions} disabled={describing} title={`${ai.model} writes descriptions and flags PII`}>
                    {describing ? "Writing…" : ai.provider === "ollama" ? "✨ Ask local AI" : "✨ Ask Claude"}
                  </Button>
                )}
                <Button variant="ghost" onClick={save}>
                  {saved ? "Saved" : "Save to recent"}
                </Button>
                <Link
                  href="/templates"
                  className="inline-flex items-center rounded-md px-3.5 py-2 text-sm font-medium text-ink hover:bg-ink-soft"
                >
                  SQL templates →
                </Link>
                <Link
                  href="/assistant"
                  className="inline-flex items-center rounded-md px-3.5 py-2 text-sm font-medium text-ink hover:bg-ink-soft"
                >
                  Ask about this table →
                </Link>
              </div>
            </div>

            {filled && (
              <div className="mb-4">
                <Notice>{filled}</Notice>
              </div>
            )}

            <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs text-muted">
                Table name
                <input
                  value={schema.name}
                  onChange={(e) => update({ name: e.target.value })}
                  className="mt-1 block w-full rounded-md border border-line bg-paper px-2.5 py-1.5 font-mono text-sm text-text focus:border-ink focus:outline-none"
                />
              </label>
              <label className="text-xs text-muted">
                Dataset / schema
                <input
                  value={schema.dataset ?? ""}
                  placeholder="analytics"
                  onChange={(e) => update({ dataset: e.target.value || undefined })}
                  className="mt-1 block w-full rounded-md border border-line bg-paper px-2.5 py-1.5 font-mono text-sm text-text focus:border-ink focus:outline-none"
                />
              </label>
              <label className="text-xs text-muted">
                Partition by
                <select
                  value={schema.partitionBy ?? ""}
                  onChange={(e) => update({ partitionBy: e.target.value || undefined })}
                  className="mt-1 block w-full rounded-md border border-line bg-paper px-2.5 py-1.5 font-mono text-sm text-text focus:border-ink focus:outline-none"
                >
                  <option value="">None</option>
                  {partitionOptions.map((f) => (
                    <option key={f.name}>{f.name}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-muted">
                Cluster by (comma separated)
                <input
                  value={schema.clusterBy?.join(", ") ?? ""}
                  placeholder="customer_id"
                  onChange={(e) => {
                    const cols = e.target.value.split(",").map((c) => c.trim()).filter(Boolean);
                    update({ clusterBy: cols.length ? cols : undefined });
                  }}
                  className="mt-1 block w-full rounded-md border border-line bg-paper px-2.5 py-1.5 font-mono text-sm text-text focus:border-ink focus:outline-none"
                />
              </label>
              <label className="text-xs text-muted sm:col-span-2 lg:col-span-4">
                Table description
                <input
                  value={schema.description ?? ""}
                  placeholder="One row per…"
                  onChange={(e) => update({ description: e.target.value || undefined })}
                  className="mt-1 block w-full rounded-md border border-line bg-paper px-2.5 py-1.5 text-sm text-text focus:border-ink focus:outline-none"
                />
              </label>
            </div>

            <SchemaGrid fields={schema.fields} onChange={(fields) => update({ fields })} />
            <Button
              variant="ghost"
              className="mt-3"
              onClick={() => update({ fields: [...schema.fields, { name: `column_${schema.fields.length + 1}`, type: "string", nullable: true }] })}
            >
              + Add column
            </Button>
          </Card>

          <OutputPanel schema={schema} />
        </>
      )}
    </div>
  );
}
