"use client";

import { useState } from "react";
import Link from "next/link";
import type { Field, TableSchema } from "@/lib/schema/types";
import { INPUT_LABELS, parseInput, type InputKind } from "@/lib/schema/parsers";
import { applyDescriptions } from "@/lib/schema/edit";
import { toSnakeCase } from "@/lib/schema/normalize";
import { autoFill } from "@/lib/rules/describe";
import { useCurrentSchema, useRecent } from "@/lib/store";
import { useAi } from "@/lib/ai/useAi";
import { openAiSettings } from "@/lib/ai/settings";
import { describeCopyPrompt, parseDescriptions, type DescribeResponse } from "@/lib/ai/shared";
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
  const { engine } = useAi();
  // copy-a-prompt flow for people without AI set up: null = closed
  const [pasteBack, setPasteBack] = useState<string | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
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

  function applyAnswer(data: DescribeResponse) {
    if (!schema) return;
    const byPath = new Map(data.columns.map((c) => [c.path, c]));
    setSchema({ ...schema, fields: applyDescriptions(schema.fields, byPath) });
  }

  async function suggestDescriptions() {
    if (!schema) return;
    if (!engine) {
      setPasteBack("");
      return;
    }
    setDescribing(true);
    setError(undefined);
    try {
      applyAnswer(await engine.describe(schema));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDescribing(false);
    }
  }

  async function copyDescribePrompt() {
    if (!schema) return;
    await navigator.clipboard.writeText(describeCopyPrompt(schema));
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 1800);
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
                <Button
                  variant="ghost"
                  onClick={suggestDescriptions}
                  disabled={describing}
                  title={engine ? `${engine.model} writes descriptions and flags PII` : "Use any AI chat you already have: copy a prompt, paste the answer back"}
                >
                  {describing ? "Writing…" : engine ? `✨ Ask ${engine.kind === "browser" || engine.kind === "ollama" ? "local AI" : engine.kind === "server" ? "AI" : (engine.vendor ?? "AI")}` : "✨ Describe with any AI"}
                </Button>
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
            {pasteBack !== null && (
              <div className="mb-5 animate-fade-in border border-dashed border-coral p-4">
                <p className="label mb-2 text-coral-deep">Describe with any AI, no key needed</p>
                <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm text-muted">
                  <li>
                    <button onClick={copyDescribePrompt} className="font-semibold text-ink underline">{copiedPrompt ? "Copied ✓" : "Copy the prompt"}</button> and paste it into
                    any AI chat you use (Claude, ChatGPT, Gemini, Copilot). Only column names and types are in it, no rows.
                  </li>
                  <li>Paste its answer below and click Apply.</li>
                </ol>
                <textarea
                  value={pasteBack}
                  onChange={(e) => setPasteBack(e.target.value)}
                  rows={4}
                  placeholder='{"columns":[{"path":"…","description":"…","pii":false}]}'
                  className="w-full border border-line bg-paper px-3 py-2 font-mono text-xs focus:border-ink focus:outline-none"
                />
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <Button
                    disabled={!pasteBack.trim()}
                    onClick={() => {
                      const data = parseDescriptions(pasteBack);
                      if (!data) return setError("Couldn't read that answer. Paste the AI's JSON reply as-is.");
                      setError(undefined);
                      applyAnswer(data);
                      setPasteBack(null);
                    }}
                  >
                    Apply descriptions
                  </Button>
                  <button onClick={() => setPasteBack(null)} className="label link-grow text-muted">Cancel</button>
                  <button onClick={openAiSettings} className="label link-grow ml-auto text-ink">Or set up AI →</button>
                </div>
              </div>
            )}

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
