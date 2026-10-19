"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { autoPlan, joinSql, runJoin, type JoinPlan, type JoinType } from "@/lib/workspace/joins";
import type { Relation, Workspace } from "@/lib/workspace/types";
import { DIALECTS, type SqlDialect } from "@/lib/templates";
import { CodeView } from "../CodeView";
import { Button } from "../ui";

const JOIN_TYPES: JoinType[] = ["LEFT", "INNER", "RIGHT", "FULL"];
const select = "border border-line bg-paper px-2 py-1.5 font-mono text-sm focus:border-ink focus:outline-none";

function toCsv(columns: string[], rows: Record<string, unknown>[]) {
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  return [columns.join(","), ...rows.map((r) => columns.map((c) => cell(r[c])).join(","))].join("\n");
}

export function JoinBuilder({ ws, relations }: { ws: Workspace; relations: Relation[] }) {
  // default base: the table with the most outgoing FKs (usually the fact table)
  const defaultBase = useMemo(() => {
    const score = (id: string) => relations.filter((r) => r.from.table === id).length;
    return [...ws.tables].sort((a, b) => score(b.id) - score(a.id))[0]?.id ?? "";
  }, [ws.tables, relations]);

  const [plan, setPlan] = useState<JoinPlan | null>(null);
  const [dialect, setDialect] = useState<SqlDialect>("bigquery");
  // memoised so the (potentially large) join isn't recomputed on every render
  const active: JoinPlan = useMemo(
    () => (plan && ws.tables.some((t) => t.id === plan.base) ? plan : autoPlan(defaultBase, relations)),
    [plan, ws.tables, defaultBase, relations],
  );

  const name = (id: string) => ws.tables.find((t) => t.id === id)?.name ?? "?";
  const cols = (id: string) => ws.tables.find((t) => t.id === id)?.fields.map((f) => f.name) ?? [];
  const joined = [active.base, ...active.steps.map((s) => s.table)];
  const available = ws.tables.filter((t) => !joined.includes(t.id));

  // the preview joins sample rows; deferring keeps the controls responsive while it computes
  const deferredPlan = useDeferredValue(active);
  const result = useMemo(() => runJoin(ws, deferredPlan), [ws.tables, deferredPlan]); // eslint-disable-line react-hooks/exhaustive-deps
  const sql = useMemo(() => joinSql(ws, active, dialect), [ws, active, dialect]);

  const setStep = (i: number, patch: Partial<JoinPlan["steps"][number]>) =>
    setPlan({ ...active, steps: active.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  function addTable(id: string) {
    // prefer a known relationship to an already-joined table
    const rel = relations.find(
      (r) => (r.from.table === id && joined.includes(r.to.table)) || (r.to.table === id && joined.includes(r.from.table)),
    );
    const step = rel
      ? rel.from.table === id
        ? { table: id, type: "LEFT" as const, leftTable: rel.to.table, leftColumn: rel.to.column, rightColumn: rel.from.column }
        : { table: id, type: "LEFT" as const, leftTable: rel.from.table, leftColumn: rel.from.column, rightColumn: rel.to.column }
      : { table: id, type: "LEFT" as const, leftTable: active.base, leftColumn: cols(active.base)[0], rightColumn: cols(id)[0] };
    setPlan({ ...active, steps: [...active.steps, step] });
  }

  if (!ws.tables.length) return <p className="text-sm text-muted">Load some files to build joins.</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="label text-muted">
          Base table
          <select value={active.base} onChange={(e) => setPlan({ base: e.target.value, steps: [] })} className={`${select} mt-1 block tracking-normal normal-case`}>
            {ws.tables.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>
        <label className="label text-muted">
          Dialect
          <select value={dialect} onChange={(e) => setDialect(e.target.value as SqlDialect)} className={`${select} mt-1 block tracking-normal normal-case`}>
            {DIALECTS.map((d) => (
              <option key={d.id} value={d.id}>{d.label}</option>
            ))}
          </select>
        </label>
        <Button variant="accent" onClick={() => setPlan(autoPlan(active.base, relations))}>
          Auto-join related tables
        </Button>
        <Button variant="ghost" onClick={() => setPlan({ base: active.base, steps: [] })}>
          Clear joins
        </Button>
      </div>

      <ol className="space-y-2">
        <li className="flex items-center gap-3 font-mono text-sm">
          <span className="label w-20 text-coral-deep">FROM</span>
          <span className="font-semibold text-ink">{name(active.base)}</span>
        </li>
        {active.steps.map((s, i) => (
          <li key={`${s.table}-${i}`} className="flex animate-row-in flex-wrap items-center gap-2 font-mono text-sm" style={{ animationDelay: `${i * 70}ms` }}>
            <select value={s.type} onChange={(e) => setStep(i, { type: e.target.value as JoinType })} className={`${select} w-24`} aria-label="Join type">
              {JOIN_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            <span className="label text-muted">join</span>
            <span className="font-semibold text-ink">{name(s.table)}</span>
            <span className="label text-muted">on</span>
            <select value={s.rightColumn} onChange={(e) => setStep(i, { rightColumn: e.target.value })} className={select} aria-label="Joined column">
              {cols(s.table).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <span>=</span>
            <select
              value={`${s.leftTable}::${s.leftColumn}`}
              onChange={(e) => {
                const [leftTable, leftColumn] = e.target.value.split("::");
                setStep(i, { leftTable, leftColumn });
              }}
              className={select}
              aria-label="Matching column"
            >
              {joined.slice(0, i + 1).flatMap((tid) =>
                cols(tid).map((c) => (
                  <option key={`${tid}::${c}`} value={`${tid}::${c}`}>
                    {name(tid)}.{c}
                  </option>
                )),
              )}
            </select>
            <button onClick={() => setPlan({ ...active, steps: active.steps.filter((_, j) => j !== i) })} className="tap px-1.5 text-muted hover:text-coral-deep" aria-label="Remove join">
              ×
            </button>
          </li>
        ))}
        {available.length > 0 && (
          <li className="flex items-center gap-2 pt-1">
            <span className="label w-20 text-muted">+ join</span>
            {available.map((t) => (
              <button key={t.id} onClick={() => addTable(t.id)} className="label border border-line px-2.5 py-1 text-ink transition-colors hover:border-ink hover:bg-ink hover:text-ivory">
                {t.name}
              </button>
            ))}
          </li>
        )}
      </ol>

      <CodeView code={sql} filename={`${name(active.base)}_joined.${dialect}.sql`} />

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="label text-ink">
            Preview · {result.rows.length.toLocaleString()} rows
            {ws.tables.some((t) => t.rows.length < t.rowCount) && " from sampled data (large tables are sampled, so some matches may be missing)"}
          </p>
          <Button
            variant="ghost"
            onClick={() => {
              const url = URL.createObjectURL(new Blob([toCsv(result.columns, result.rows)], { type: "text/csv" }));
              const a = document.createElement("a");
              a.href = url;
              a.download = `${name(active.base)}_joined.csv`;
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Download CSV
          </Button>
        </div>
        <div className="max-h-[420px] overflow-auto border border-line bg-paper">
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 bg-ink text-ivory">
              <tr>
                {result.columns.map((c) => (
                  <th key={c} className="px-2 py-2 text-left font-mono font-medium whitespace-nowrap">
                    <span className="text-coral">{c.split(".")[0]}.</span>
                    {c.split(".").slice(1).join(".")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.slice(0, 50).map((r, i) => (
                <tr key={i} className="animate-row-in border-b border-line/60 odd:bg-ivory/40" style={{ animationDelay: `${Math.min(i, 15) * 25}ms` }}>
                  {result.columns.map((c) => {
                    const v = r[c];
                    const empty = v === null || v === undefined || v === "";
                    return (
                      <td key={c} className={`px-2 py-1.5 font-mono whitespace-nowrap ${empty ? "text-coral-deep/70 italic" : ""}`}>
                        {empty ? "null" : typeof v === "object" ? JSON.stringify(v) : String(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {result.rows.length > 50 && <p className="label mt-2 text-muted">Showing the first 50 rows. Download the CSV for all of them.</p>}
      </div>
    </div>
  );
}
