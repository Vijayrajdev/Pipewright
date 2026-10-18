import type { Field } from "@/lib/schema/types";
import type { WsTable } from "./types";

export interface ColumnProfile {
  name: string;
  type: Field["type"];
  nulls: number;
  nullPct: number;
  distinct: number;
  unique: boolean;
  min?: string;
  max?: string;
  mean?: number;
  top: { value: string; count: number }[];
  /** distinct counted over the whole file (key columns) rather than the sample */
  distinctExact?: boolean;
}

const isBlank = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

/** Stable string form for comparing and counting values. */
export function keyOf(v: unknown): string {
  if (typeof v === "object" && v !== null) return JSON.stringify(v);
  return String(v).trim();
}

export function profileTable(table: WsTable): ColumnProfile[] {
  const n = table.rows.length;
  return table.fields.map((f) => {
    const values = table.rows.map((r) => r[f.name]).filter((v) => !isBlank(v));
    const counts = new Map<string, number>();
    for (const v of values) {
      const k = keyOf(v);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const nulls = n - values.length;
    const full = table.stats?.[f.name];
    const total = full ? full.nonNull + full.nulls : n;
    const profile: ColumnProfile = {
      name: f.name,
      type: f.type,
      nulls: full?.nulls ?? nulls,
      nullPct: full ? (total ? full.nulls / total : 0) : n ? nulls / n : 0,
      distinct: full?.distinct ?? counts.size,
      distinctExact: full?.distinct !== undefined && !full.capped,
      unique: full?.unique ?? (values.length > 0 && counts.size === values.length),
      top: [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([value, count]) => ({ value, count })),
    };

    if (f.type === "int" || f.type === "float" || f.type === "decimal") {
      const nums = values.map(Number).filter((x) => Number.isFinite(x));
      if (nums.length) {
        // loop instead of Math.min(...nums): spreading 20k+ args can overflow the stack
        let lo = Infinity;
        let hi = -Infinity;
        for (const x of nums) {
          if (x < lo) lo = x;
          if (x > hi) hi = x;
        }
        profile.min = String(lo);
        profile.max = String(hi);
        profile.mean = nums.reduce((a, b) => a + b, 0) / nums.length;
      }
    } else if (f.type === "date" || f.type === "timestamp" || f.type === "string") {
      // ISO dates sort lexically; strings report alphabetical bounds
      const sorted = [...counts.keys()].sort();
      if (sorted.length) {
        profile.min = sorted[0];
        profile.max = sorted[sorted.length - 1];
      }
    }
    // full-file min/max/mean override the sample's
    if (full?.min !== undefined) {
      profile.min = full.min;
      profile.max = full.max;
      if (full.mean !== undefined) profile.mean = full.mean;
    }
    return profile;
  });
}
