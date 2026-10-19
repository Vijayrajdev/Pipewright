"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useCurrentSchema } from "@/lib/store";
import { airflowDag, dagsterAssets, explainCron, nextRuns, parseCron, SCHEDULE_PRESETS, type LoadMode, type PipelineSpec, type SourceKind } from "@/lib/pipelines";
import { DIALECTS, guessKeys, type SqlDialect } from "@/lib/templates";
import { CodeView } from "./CodeView";
import { Card, Tabs } from "./ui";

type Output = "airflow" | "dagster";

const input =
  "mt-1 block w-full border border-line bg-paper px-2.5 py-1.5 font-mono text-sm text-text focus:border-ink focus:outline-none";

const SOURCES: { id: SourceKind; label: string; placeholder: string; hint: string }[] = [
  { id: "files", label: "Files in cloud storage", placeholder: "gs://bucket/orders/{ds}/*.csv", hint: "{ds} becomes the run date" },
  { id: "database", label: "A database table", placeholder: "public.orders", hint: "pulled incrementally by updated_at" },
  { id: "api", label: "A REST API", placeholder: "https://api.example.com/v1/orders", hint: "paged, filtered by updated_since" },
];

const MODES: { id: LoadMode; label: string; hint: string }[] = [
  { id: "merge", label: "Merge (upsert)", hint: "update changed rows, insert new ones" },
  { id: "append", label: "Append", hint: "insert every new row" },
  { id: "replace", label: "Replace", hint: "rebuild the table each run" },
];

const noop = () => () => {};

export function PipelineDrafts() {
  const [schema] = useCurrentSchema();
  const [output, setOutput] = useState<Output>("airflow");
  const [spec, setSpec] = useState<Omit<PipelineSpec, "schema" | "keys"> & { keys: string | null; useSchema: boolean }>({
    name: "",
    dataset: "",
    source: "files",
    sourcePath: "",
    target: "bigquery",
    mode: "merge",
    keys: null,
    schedule: "0 6 * * *",
    owner: "data-eng",
    retries: 2,
    alertEmail: "",
    dbt: true,
    checks: true,
    useSchema: true,
  });
  const set = <K extends keyof typeof spec>(k: K, v: (typeof spec)[K]) => setSpec((s) => ({ ...s, [k]: v }));

  // the current Schema Builder table fills in name, dataset, keys and the MERGE columns
  const linked = spec.useSchema ? schema : null;
  const full: PipelineSpec = useMemo(() => {
    const name = spec.name || linked?.name || "orders";
    const keys = spec.keys !== null ? spec.keys.split(",").map((k) => k.trim()).filter(Boolean) : linked ? guessKeys(linked) : ["id"];
    return {
      ...spec,
      name,
      dataset: spec.dataset || linked?.dataset || "analytics",
      keys,
      sourcePath: spec.sourcePath || SOURCES.find((s) => s.id === spec.source)!.placeholder.replace("orders", name),
      alertEmail: spec.alertEmail || undefined,
      schema: linked ? { ...linked, name } : undefined,
    };
  }, [spec, linked]);

  const valid = !!parseCron(spec.schedule);
  const code = useMemo(() => (valid ? (output === "airflow" ? airflowDag(full) : dagsterAssets(full)) : ""), [full, output, valid]);

  // next runs depend on the clock: only on the client, so server and client HTML match
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const runs = useMemo(() => (mounted && valid ? nextRuns(spec.schedule, new Date(), 5) : []), [mounted, valid, spec.schedule]);

  const source = SOURCES.find((s) => s.id === spec.source)!;

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <Card className="h-fit space-y-4">
        {schema && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="accent-coral" checked={spec.useSchema} onChange={(e) => set("useSchema", e.target.checked)} />
            Use <span className="font-mono text-ink">{schema.name}</span> from the Schema Builder
          </label>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs text-muted">
            Target table
            <input value={spec.name} placeholder={linked?.name ?? "orders"} onChange={(e) => set("name", e.target.value.replace(/\s+/g, "_"))} className={input} />
          </label>
          <label className="block text-xs text-muted">
            Dataset / schema
            <input value={spec.dataset} placeholder={linked?.dataset ?? "analytics"} onChange={(e) => set("dataset", e.target.value)} className={input} />
          </label>
        </div>

        <fieldset>
          <legend className="text-xs text-muted">Source</legend>
          <div className="mt-1 grid gap-1">
            {SOURCES.map((s) => (
              <label key={s.id} className={`flex cursor-pointer items-center gap-2 border px-2.5 py-1.5 text-sm transition-colors ${spec.source === s.id ? "border-ink bg-ink-soft/50" : "border-line"}`}>
                <input type="radio" name="source" className="accent-coral" checked={spec.source === s.id} onChange={() => set("source", s.id)} />
                {s.label}
              </label>
            ))}
          </div>
          <input value={spec.sourcePath} placeholder={source.placeholder} onChange={(e) => set("sourcePath", e.target.value)} className={input} aria-label="Source location" />
          <p className="mt-1 text-xs text-muted">{source.hint}</p>
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs text-muted">
            Warehouse
            <select value={spec.target} onChange={(e) => set("target", e.target.value as SqlDialect)} className={input}>
              {DIALECTS.map((d) => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-muted">
            Load mode
            <select value={spec.mode} onChange={(e) => set("mode", e.target.value as LoadMode)} className={input}>
              {MODES.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="-mt-2 text-xs text-muted">{MODES.find((m) => m.id === spec.mode)!.hint}</p>

        {spec.mode === "merge" && (
          <label className="block text-xs text-muted">
            Key column(s), comma-separated
            <input value={spec.keys ?? full.keys.join(", ")} onChange={(e) => set("keys", e.target.value)} className={input} />
          </label>
        )}

        <div>
          <label className="block text-xs text-muted">
            Schedule (cron, UTC)
            <input value={spec.schedule} onChange={(e) => set("schedule", e.target.value)} className={`${input} ${valid ? "" : "border-coral-deep"}`} />
          </label>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {SCHEDULE_PRESETS.map((p) => (
              <button
                key={p.cron}
                onClick={() => set("schedule", p.cron)}
                className={`label border px-2.5 py-2 transition-colors sm:px-2 sm:py-1 ${spec.schedule === p.cron ? "border-ink bg-ink text-ivory" : "border-line text-ink hover:border-ink"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs text-muted">
            Owner
            <input value={spec.owner} onChange={(e) => set("owner", e.target.value)} className={input} />
          </label>
          <label className="block text-xs text-muted">
            Retries
            <input type="number" min={0} max={10} value={spec.retries} onChange={(e) => set("retries", Math.max(0, Math.min(10, Number(e.target.value) || 0)))} className={input} />
          </label>
        </div>
        <label className="block text-xs text-muted">
          Alert email on failure (optional)
          <input value={spec.alertEmail} placeholder="team@company.com" onChange={(e) => set("alertEmail", e.target.value)} className={input} />
        </label>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" className="accent-coral" checked={spec.checks} onChange={(e) => set("checks", e.target.checked)} />
            Quality checks
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="accent-coral" checked={spec.dbt} onChange={(e) => set("dbt", e.target.checked)} />
            Run dbt after
          </label>
        </div>
      </Card>

      <div className="min-w-0 space-y-6">
        <div className="paper-blue relative overflow-hidden p-5 md:p-6">
          <p className="label text-cream/70">Schedule</p>
          <p className="font-wide mt-1 text-xl font-black text-cream uppercase md:text-2xl">{explainCron(spec.schedule)}</p>
          {runs.length > 0 && (
            <ol className="mt-4 flex flex-wrap gap-2">
              {runs.map((d, i) => (
                <li key={d.toISOString()} className="animate-pop border border-cream/30 px-2.5 py-1 font-mono text-xs text-cream" style={{ animationDelay: `${i * 70}ms` }}>
                  {d.toISOString().slice(0, 16).replace("T", " ")}
                </li>
              ))}
            </ol>
          )}
        </div>

        <Card>
          <Tabs<Output>
            items={[
              { id: "airflow", label: "Airflow 3 DAG" },
              { id: "dagster", label: "Dagster assets" },
            ]}
            value={output}
            onChange={setOutput}
          />
          <p className="mb-3 text-sm text-muted">
            {output === "airflow"
              ? "TaskFlow DAG: extract → load staging → publish → checks → dbt. Uses the common SQL provider, so the same shape works on every warehouse."
              : "Software-defined assets with asset checks, a job and a schedule. Plug your warehouse client into the Warehouse resource."}
          </p>
          {valid ? (
            <CodeView code={code} filename={output === "airflow" ? `${full.name}_pipeline.py` : `${full.name}_assets.py`} />
          ) : (
            <p className="text-sm text-coral-deep">Fix the cron expression to see the draft: five fields, minute hour day month weekday.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
