"use client";

import { useState } from "react";
import { measureRelation } from "@/lib/workspace/model";
import type { Relation, Workspace } from "@/lib/workspace/types";
import { Button } from "../ui";

interface Props {
  ws: Workspace;
  relations: Relation[];
  update: (ws: Workspace) => void;
}

const select = "border border-line bg-paper px-2 py-1.5 font-mono text-sm focus:border-ink focus:outline-none";

export function RelationsPanel({ ws, relations, update }: Props) {
  const name = (id: string) => ws.tables.find((t) => t.id === id)?.name ?? "?";
  const [fromTable, setFromTable] = useState(ws.tables[0]?.id ?? "");
  const [fromCol, setFromCol] = useState("");
  const [toTable, setToTable] = useState(ws.tables[1]?.id ?? ws.tables[0]?.id ?? "");
  const [toCol, setToCol] = useState("");
  const cols = (id: string) => ws.tables.find((t) => t.id === id)?.fields.map((f) => f.name) ?? [];

  function remove(r: Relation) {
    if (r.origin === "manual") update({ ...ws, manualRelations: ws.manualRelations.filter((m) => m.id !== r.id) });
    else update({ ...ws, hiddenRelations: [...ws.hiddenRelations, r.id] });
  }

  function add() {
    const fc = fromCol || cols(fromTable)[0];
    const tc = toCol || cols(toTable)[0];
    if (!fc || !tc) return;
    const rel = measureRelation(ws, { table: fromTable, column: fc }, { table: toTable, column: tc });
    update({ ...ws, manualRelations: [...ws.manualRelations.filter((m) => m.id !== rel.id), rel], hiddenRelations: ws.hiddenRelations.filter((h) => h !== rel.id) });
  }

  return (
    <div className="space-y-6">
      {relations.length === 0 ? (
        <p className="text-sm text-muted">
          No relationships found. Pipewright matches columns like <code className="font-mono">customer_id</code> to a
          table&apos;s key and checks that the values overlap. Add one by hand below.
        </p>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {relations.map((r, i) => {
            const pct = r.overlap === null ? null : Math.round(r.overlap * 100);
            return (
              <li key={r.id} className="grid animate-row-in items-center gap-3 py-3 md:grid-cols-[1fr_auto_1fr_180px_auto]" style={{ animationDelay: `${i * 60}ms` }}>
                <span className="font-mono text-sm">
                  <span className="font-semibold text-ink">{name(r.from.table)}</span>.{r.from.column}
                </span>
                <span className="label text-coral-deep">{r.cardinality === "1:1" ? "1 ── 1" : "N ──▶ 1"}</span>
                <span className="font-mono text-sm">
                  <span className="font-semibold text-ink">{name(r.to.table)}</span>.{r.to.column}
                </span>
                <div title="Share of foreign-key values found in the referenced key">
                  {pct === null ? (
                    <span className="label text-muted">no values to check</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 bg-line/60">
                        <div className={`h-full origin-left animate-[progress_1s_var(--ease-out-expo)_both] ${pct === 100 ? "bg-ink" : "bg-coral"}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-10 text-right font-mono text-xs">{pct}%</span>
                    </div>
                  )}
                  {pct !== null && pct < 100 && <span className="label text-coral-deep">orphan keys found</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="label text-muted">{r.origin}</span>
                  <button onClick={() => remove(r)} className="tap px-1.5 text-muted transition-colors hover:text-coral-deep" aria-label="Remove relationship">
                    ×
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {ws.tables.length > 0 && (
        <div className="border border-dashed border-line p-4">
          <p className="label mb-3 text-ink">Add a relationship</p>
          <div className="flex flex-wrap items-center gap-2">
            <select value={fromTable} onChange={(e) => (setFromTable(e.target.value), setFromCol(""))} className={select} aria-label="Foreign key table">
              {ws.tables.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <select value={fromCol} onChange={(e) => setFromCol(e.target.value)} className={select} aria-label="Foreign key column">
              {cols(fromTable).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <span className="label text-coral-deep">references</span>
            <select value={toTable} onChange={(e) => (setToTable(e.target.value), setToCol(""))} className={select} aria-label="Referenced table">
              {ws.tables.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <select value={toCol} onChange={(e) => setToCol(e.target.value)} className={select} aria-label="Referenced column">
              {cols(toTable).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <Button onClick={add}>Add</Button>
          </div>
          {ws.hiddenRelations.length > 0 && (
            <button onClick={() => update({ ...ws, hiddenRelations: [] })} className="label link-grow mt-3 text-ink">
              Restore {ws.hiddenRelations.length} hidden auto-detected relationship{ws.hiddenRelations.length > 1 ? "s" : ""}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
