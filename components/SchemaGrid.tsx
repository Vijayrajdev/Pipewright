"use client";

import { CANONICAL_TYPES, type Field } from "@/lib/schema/types";
import { updateAt, type FieldPath } from "@/lib/schema/edit";

interface Props {
  fields: Field[];
  onChange: (fields: Field[]) => void;
}

const cell = "border-b border-line px-2 py-1.5 align-middle";
const input = "w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-sm hover:border-line focus:border-ink focus:bg-paper focus:outline-none";

export function SchemaGrid({ fields, onChange }: Props) {
  const patch = (path: FieldPath, p: Partial<Field>) => onChange(updateAt(fields, path, (f) => ({ ...f, ...p })));
  const remove = (path: FieldPath) => onChange(updateAt(fields, path, () => null));

  const rows: { field: Field; path: FieldPath; depth: number }[] = [];
  const walk = (list: Field[], prefix: FieldPath, depth: number) =>
    list.forEach((field, i) => {
      rows.push({ field, path: [...prefix, i], depth });
      if (field.fields) walk(field.fields, [...prefix, i], depth + 1);
    });
  walk(fields, [], 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="text-left text-xs tracking-wide text-muted uppercase">
            <th className={`${cell} w-[24%]`}>Column</th>
            <th className={`${cell} w-[13%]`}>Type</th>
            <th className={`${cell} w-[7%] text-center`}>Null</th>
            <th className={`${cell} w-[7%] text-center`}>Array</th>
            <th className={cell}>Description</th>
            <th className={`${cell} w-[6%] text-center`}>PII</th>
            <th className={`${cell} w-[4%]`} />
          </tr>
        </thead>
        <tbody>
          {rows.map(({ field, path, depth }, i) => (
            <tr key={path.join(".")} className="animate-row-in transition-colors hover:bg-coral-soft/40" style={{ animationDelay: `${Math.min(i, 20) * 35}ms` }}>
              <td className={cell}>
                <div className="flex items-center" style={{ paddingLeft: depth * 16 }}>
                  {depth > 0 && <span className="mr-1 text-line">└</span>}
                  <input
                    aria-label="Column name"
                    value={field.name}
                    onChange={(e) => patch(path, { name: e.target.value })}
                    className={`${input} font-mono`}
                  />
                </div>
              </td>
              <td className={cell}>
                <select
                  aria-label="Type"
                  value={field.type}
                  onChange={(e) => {
                    const type = e.target.value as Field["type"];
                    patch(path, { type, fields: type === "record" ? (field.fields ?? []) : undefined });
                  }}
                  className={`${input} font-mono text-ink`}
                >
                  {CANONICAL_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </td>
              <td className={`${cell} text-center`}>
                <input
                  type="checkbox"
                  aria-label="Nullable"
                  checked={field.nullable}
                  onChange={(e) => patch(path, { nullable: e.target.checked })}
                  className="accent-ink"
                />
              </td>
              <td className={`${cell} text-center`}>
                <input
                  type="checkbox"
                  aria-label="Repeated"
                  checked={!!field.repeated}
                  onChange={(e) => patch(path, { repeated: e.target.checked || undefined })}
                  className="accent-ink"
                />
              </td>
              <td className={cell}>
                <input
                  aria-label="Description"
                  value={field.description ?? ""}
                  placeholder="—"
                  onChange={(e) => patch(path, { description: e.target.value || undefined })}
                  className={input}
                />
              </td>
              <td className={`${cell} text-center`}>
                <input
                  type="checkbox"
                  aria-label="Contains PII"
                  checked={!!field.pii}
                  onChange={(e) => patch(path, { pii: e.target.checked || undefined })}
                  className="accent-coral"
                />
              </td>
              <td className={`${cell} text-center`}>
                <button
                  onClick={() => remove(path)}
                  aria-label={`Remove ${field.name}`}
                  className="rounded px-1.5 text-muted hover:bg-coral-soft hover:text-coral-deep"
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
