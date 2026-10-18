"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { profileTable } from "@/lib/workspace/profile";
import type { Workspace, WsTable } from "@/lib/workspace/types";
import { useCurrentSchema } from "@/lib/store";
import { Button } from "../ui";

interface Props {
  ws: Workspace;
  pks: Record<string, string | null>;
  update: (ws: Workspace) => void;
}

export function TablesPanel({ ws, pks, update }: Props) {
  const [selectedId, setSelected] = useState<string | null>(null);
  const selected = ws.tables.find((t) => t.id === selectedId) ?? ws.tables[0];
  const [, setSchema] = useCurrentSchema();
  const router = useRouter();

  const patchTable = (id: string, patch: Partial<WsTable>) =>
    update({ ...ws, tables: ws.tables.map((t) => (t.id === id ? { ...t, ...patch } : t)) });

  function remove(id: string) {
    const without = <T,>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== id));
    update({
      ...ws,
      tables: ws.tables.filter((t) => t.id !== id),
      manualRelations: ws.manualRelations.filter((r) => r.from.table !== id && r.to.table !== id),
      pkOverrides: without(ws.pkOverrides),
      positions: without(ws.positions),
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      <ul className="space-y-2">
        {ws.tables.map((t, i) => (
          <li key={t.id} className="animate-row-in" style={{ animationDelay: `${i * 60}ms` }}>
            <button
              onClick={() => setSelected(t.id)}
              className={`flood group w-full border p-3 text-left transition-colors [--flood:var(--color-ink)] ${
                selected?.id === t.id ? "border-ink bg-ink text-ivory" : "border-line bg-paper hover:text-ivory"
              }`}
            >
              <span className="font-wide block text-sm font-extrabold uppercase">{t.name}</span>
              <span className={`label block ${selected?.id === t.id ? "text-ivory/70" : "text-muted group-hover:text-ivory/70"}`}>
                {t.fields.length} cols · {t.rowCount.toLocaleString()} rows · pk {pks[t.id] ?? "none"}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {selected && <TableDetail key={selected.id} table={selected} pk={pks[selected.id]} ws={ws} update={update} patchTable={patchTable} remove={remove} onOpenInBuilder={() => {
        setSchema({ name: selected.name, dataset: ws.dataset, fields: selected.fields });
        router.push("/schema");
      }} />}
    </div>
  );
}

function TableDetail({
  table,
  pk,
  ws,
  update,
  patchTable,
  remove,
  onOpenInBuilder,
}: {
  table: WsTable;
  pk: string | null;
  ws: Workspace;
  update: (ws: Workspace) => void;
  patchTable: (id: string, patch: Partial<WsTable>) => void;
  remove: (id: string) => void;
  onOpenInBuilder: () => void;
}) {
  const profile = useMemo(() => profileTable(table), [table]);

  return (
    <div className="animate-fade-in">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="label text-muted">
          Table name
          <input
            value={table.name}
            onChange={(e) => patchTable(table.id, { name: e.target.value.replace(/\s+/g, "_") })}
            className="mt-1 block border border-line bg-paper px-2.5 py-1.5 font-mono text-sm tracking-normal text-text normal-case focus:border-ink focus:outline-none"
          />
        </label>
        <label className="label text-muted">
          Primary key
          <select
            value={pk ?? ""}
            onChange={(e) => update({ ...ws, pkOverrides: { ...ws.pkOverrides, [table.id]: e.target.value || null } })}
            className="mt-1 block border border-line bg-paper px-2.5 py-1.5 font-mono text-sm tracking-normal text-text normal-case focus:border-ink focus:outline-none"
          >
            <option value="">None</option>
            {table.fields.map((f) => (
              <option key={f.name}>{f.name}</option>
            ))}
          </select>
        </label>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={onOpenInBuilder}>
            Open in Schema Builder
          </Button>
          <Button variant="ghost" onClick={() => remove(table.id)}>
            Remove
          </Button>
        </div>
      </div>

      <p className="label mb-3 text-muted">
        {table.stats
          ? `Counts, nulls and min/max over all ${table.rowCount.toLocaleString()} rows · top values from ${table.rows.length < table.rowCount ? `a ${table.rows.length.toLocaleString()}-row sample` : "every row"}`
          : `Profile of ${table.rows.length.toLocaleString()} rows`}
        {table.source ? ` · ${table.source}` : ""}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="label text-left text-muted">
              {["Column", "Type", "Nulls", "Distinct", "Min", "Max", "Top values"].map((h) => (
                <th key={h} className="border-b border-line px-2 py-2 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {profile.map((c, i) => (
              <tr key={c.name} className="animate-row-in border-b border-line/60 hover:bg-coral-soft/30" style={{ animationDelay: `${Math.min(i, 20) * 35}ms` }}>
                <td className="px-2 py-2 font-mono">
                  {c.name}
                  {pk === c.name && <span className="label ml-2 text-coral-deep">pk</span>}
                  {c.unique && pk !== c.name && <span className="label ml-2 text-ink">unique</span>}
                </td>
                <td className="px-2 py-2 font-mono text-ink">{c.type}</td>
                <td className="w-32 px-2 py-2">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 bg-line/60">
                      <div className="h-full origin-left animate-[progress_1s_var(--ease-out-expo)_both] bg-coral" style={{ width: `${c.nullPct * 100}%` }} />
                    </div>
                    <span className="w-9 text-right font-mono text-xs text-muted">{Math.round(c.nullPct * 100)}%</span>
                  </div>
                </td>
                <td className="px-2 py-2 font-mono text-xs" title={c.distinctExact ? "Exact, whole file" : "In the sample"}>
                  {c.distinctExact ? "" : "≈"}
                  {c.distinct.toLocaleString()}
                </td>
                <td className="max-w-[140px] truncate px-2 py-2 font-mono text-xs text-muted" title={c.min}>
                  {c.min ?? "—"}
                </td>
                <td className="max-w-[140px] truncate px-2 py-2 font-mono text-xs text-muted" title={c.max}>
                  {c.max ?? "—"}
                </td>
                <td className="px-2 py-2">
                  <div className="flex flex-wrap gap-1">
                    {c.top.map((t) => (
                      <span key={t.value} className="max-w-[120px] truncate border border-line bg-paper px-1.5 py-0.5 font-mono text-[11px]" title={`${t.value} (${t.count})`}>
                        {t.value} <span className="text-coral-deep">×{t.count}</span>
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
