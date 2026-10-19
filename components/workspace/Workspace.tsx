"use client";

import { useMemo, useRef, useState } from "react";
import { loadFileInWorker, maxParallel, runLimited, type LoadProgress } from "@/lib/workspace/loader";
import { tableNameFromFile, uniqueName } from "@/lib/workspace/load";
import { markSaved, useWorkspace } from "@/lib/store";
import { loadTable } from "@/lib/workspace/load";
import { DEMO_FILES } from "@/lib/workspace/demo";
import { activeRelations, primaryKeys } from "@/lib/workspace/model";
import { dbml, mermaid, modelDdl } from "@/lib/workspace/exports";
import { dataDictionary, dbtProject } from "@/lib/workspace/docs";
import { EMPTY_WORKSPACE, type WsTable } from "@/lib/workspace/types";
import { DIALECTS, type SqlDialect } from "@/lib/templates";
import { CodeView } from "../CodeView";
import { Button, Card, Notice, Tabs } from "../ui";
import { LogoMark } from "../Logo";
import { TablesPanel } from "./TablesPanel";
import { RelationsPanel } from "./RelationsPanel";
import { ErDiagram } from "./ErDiagram";
import { JoinBuilder } from "./JoinBuilder";

type Tab = "tables" | "relations" | "erd" | "joins" | "export";
type ExportKind = "ddl" | "mermaid" | "dbml" | "dbt" | "dictionary";

interface Pending {
  key: string;
  file: string;
  progress: LoadProgress;
}

const fmtBytes = (n: number) => (n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

export function Workspace() {
  const [ws, setWs] = useWorkspace();
  const [tab, setTab] = useState<Tab>("erd");
  const [errors, setErrors] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [exportKind, setExportKind] = useState<ExportKind>("ddl");
  const [dialect, setDialect] = useState<SqlDialect>("postgres");
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  // key detection only depends on the data and the key settings, not on dataset name or diagram positions
  const { tables, pkOverrides, manualRelations, hiddenRelations } = ws;
  const modelInput = useMemo(
    () => ({ ...ws, tables, pkOverrides, manualRelations, hiddenRelations }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tables, pkOverrides, manualRelations, hiddenRelations],
  );
  const pks = useMemo(() => primaryKeys(modelInput), [modelInput]);
  const relations = useMemo(() => activeRelations(modelInput), [modelInput]);

  function loadDemo() {
    const tables: WsTable[] = [];
    for (const f of DEMO_FILES) tables.push(loadTable(f.text, f.name, tables.map((t) => t.name)));
    setErrors([]);
    setWs({ ...EMPTY_WORKSPACE, dataset: ws.dataset, tables });
  }

  /**
   * Stream files through background workers (a few at a time), adding each
   * table to the model the moment it's ready instead of waiting for the slowest.
   */
  async function readFiles(list: FileList | File[]) {
    const files = [...list];
    const controller = new AbortController();
    abortRef.current = controller;
    const names: string[] = ws.tables.map((t) => t.name);
    const jobs = files.map((file, i) => {
      const name = uniqueName(tableNameFromFile(file.name), names);
      names.push(name);
      return { key: `${Date.now()}-${i}`, file, name };
    });
    setErrors([]);
    setPending(jobs.map((j) => ({ key: j.key, file: j.file.name, progress: { bytes: 0, total: j.file.size, rows: 0 } })));

    const results = await runLimited(jobs, maxParallel(), async (j) => {
      if (controller.signal.aborted) throw new DOMException("Cancelled", "AbortError");
      try {
        const { table, saved } = await loadFileInWorker(
          j.file,
          j.name,
          (progress) => setPending((p) => p.map((x) => (x.key === j.key ? { ...x, progress } : x))),
          controller.signal,
        );
        if (saved) markSaved(table);
        setWs((cur) => ({ ...cur, tables: [...cur.tables, table] }));
      } finally {
        setPending((p) => p.filter((x) => x.key !== j.key));
      }
    });
    setPending([]);
    abortRef.current = null;
    if (controller.signal.aborted) return;
    setErrors(results.flatMap((r) => (r.status === "rejected" ? [(r.reason as Error).message] : [])));
  }

  // generated only while the Export tab is open
  const exportCode = useMemo(() => {
    if (tab !== "export") return "";
    if (exportKind === "ddl") return modelDdl(ws, pks, relations, dialect);
    if (exportKind === "mermaid") return mermaid(ws, pks, relations);
    if (exportKind === "dbml") return dbml(ws, pks, relations);
    if (exportKind === "dbt") return dbtProject(ws, pks, relations);
    return dataDictionary(ws, pks, relations);
  }, [tab, exportKind, ws, pks, relations, dialect]);
  const exportFile = {
    ddl: `data_model.${dialect}.sql`,
    mermaid: "data_model.mmd",
    dbml: "data_model.dbml",
    dbt: "dbt_models.yml",
    dictionary: "data_dictionary.md",
  }[exportKind];

  return (
    <div className="space-y-6">
      {/* drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) readFiles(e.dataTransfer.files);
        }}
        className={`paper relative animate-pop overflow-hidden border-2 border-dashed p-6 transition-all duration-300 md:p-8 ${
          dragging ? "scale-[1.01] border-coral bg-coral-soft/50" : "border-line"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div>
            <p className="font-wide text-2xl font-black text-ink uppercase md:text-3xl">
              Drop your files <span className="text-outline">here</span>
            </p>
            <p className="mt-2 text-sm text-muted">
              Several CSV, TSV, JSON or NDJSON files at once, of any size. They stream in the background and never leave
              your browser.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => fileRef.current?.click()}>Choose files</Button>
            <Button variant="accent" onClick={loadDemo}>
              Load demo shop
            </Button>
            {ws.tables.length > 0 && (
              <Button variant="ghost" onClick={() => setWs({ ...EMPTY_WORKSPACE })}>
                Clear all
              </Button>
            )}
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".csv,.tsv,.json,.ndjson,.jsonl,.txt"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) readFiles(e.target.files);
            e.target.value = "";
          }}
        />
        {ws.tables.length > 0 && (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {ws.tables.map((t, i) => (
              <span key={t.id} className="label animate-pop border border-ink/30 bg-paper px-2.5 py-1 text-ink" style={{ animationDelay: `${i * 60}ms` }}>
                {t.name}
              </span>
            ))}
            <label className="label ml-auto flex items-center gap-2 text-muted">
              Dataset
              <input
                value={ws.dataset ?? ""}
                placeholder="analytics"
                onChange={(e) => setWs({ ...ws, dataset: e.target.value || undefined })}
                className="w-36 border border-line bg-paper px-2 py-1 font-mono text-sm tracking-normal text-text normal-case focus:border-ink focus:outline-none"
              />
            </label>
          </div>
        )}
      </div>

      {pending.length > 0 && (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <p className="label flex items-center gap-3 text-ink">
              <LogoMark size={28} className="animate-spin-slow" />
              Reading {pending.length} file{pending.length > 1 ? "s" : ""} in the background
            </p>
            <Button variant="ghost" onClick={() => abortRef.current?.abort()}>
              Cancel
            </Button>
          </div>
          <ul className="space-y-3">
            {pending.map((p) => {
              const pct = p.progress.total ? Math.min(100, (p.progress.bytes / p.progress.total) * 100) : 0;
              return (
                <li key={p.key}>
                  <div className="mb-1 flex justify-between gap-3 font-mono text-xs">
                    <span className="truncate">{p.file}</span>
                    <span className="shrink-0 text-muted">
                      {fmtBytes(p.progress.bytes)} / {fmtBytes(p.progress.total)}
                      {p.progress.rows > 0 && ` · ${p.progress.rows.toLocaleString()} rows`}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden bg-line/60">
                    <div className="h-full bg-coral transition-[width] duration-300 ease-out" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {errors.map((e) => (
        <Notice key={e} tone="error">
          {e}
        </Notice>
      ))}

      {ws.tables.length > 0 && (
        <Card>
          <div className="mb-2 flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <p className="label text-muted">
              {ws.tables.length} tables · {relations.length} relationships · {Object.values(pks).filter(Boolean).length} primary keys
            </p>
          </div>
          <Tabs<Tab>
            items={[
              { id: "erd", label: "ER Diagram" },
              { id: "tables", label: "Tables & Profile" },
              { id: "relations", label: `Relationships (${relations.length})` },
              { id: "joins", label: "Join Builder" },
              { id: "export", label: "Export" },
            ]}
            value={tab}
            onChange={setTab}
          />
          <div key={tab} className="animate-fade-in">
            {tab === "erd" && <ErDiagram ws={ws} pks={pks} relations={relations} onPositions={(positions) => setWs({ ...ws, positions })} />}
            {tab === "tables" && <TablesPanel ws={ws} pks={pks} update={setWs} />}
            {tab === "relations" && <RelationsPanel ws={ws} relations={relations} update={setWs} />}
            {tab === "joins" && <JoinBuilder ws={ws} relations={relations} />}
            {tab === "export" && (
              <div>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  {(
                    [
                      ["ddl", "Model DDL"],
                      ["mermaid", "Mermaid"],
                      ["dbml", "DBML"],
                      ["dbt", "dbt sources + tests"],
                      ["dictionary", "Data dictionary"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => setExportKind(id)}
                      className={`label border px-3 py-1.5 transition-colors ${exportKind === id ? "border-ink bg-ink text-ivory" : "border-line text-ink hover:border-ink"}`}
                    >
                      {label}
                    </button>
                  ))}
                  {exportKind === "ddl" && (
                    <select
                      value={dialect}
                      onChange={(e) => setDialect(e.target.value as SqlDialect)}
                      className="ml-auto border border-line bg-paper px-2 py-1.5 font-mono text-sm focus:border-ink focus:outline-none"
                      aria-label="Dialect"
                    >
                      {DIALECTS.map((d) => (
                        <option key={d.id} value={d.id}>{d.label}</option>
                      ))}
                    </select>
                  )}
                </div>
                <p className="mb-3 text-sm text-muted">
                  {exportKind === "ddl" && "CREATE TABLE statements for the whole model, with primary and foreign keys, in dependency order."}
                  {exportKind === "mermaid" && "Paste into a GitHub/GitLab markdown ```mermaid block or Notion to render the diagram."}
                  {exportKind === "dbml" && "Paste into dbdiagram.io or dbdocs to get an interactive diagram."}
                  {exportKind === "dbt" && "A dbt sources file with column docs and tests (not_null, unique, relationships, accepted_values) taken from your data, plus a staging model per table."}
                  {exportKind === "dictionary" && "Markdown docs for every table: columns, types, keys, drafted descriptions, PII flags and profile numbers. Paste into Confluence, Notion or a README."}
                </p>
                <CodeView code={exportCode} filename={exportFile} />
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
