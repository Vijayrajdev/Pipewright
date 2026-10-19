import type { Field } from "@/lib/schema/types";
import type { ColumnStats, Row, WsTable } from "./types";

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

const topOf = (counts: Map<string, number>, k = 3) =>
  [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([value, count]) => ({ value, count }));

/** Top values and distinct count per column of a sample: one pass per column. */
type Summary = Pick<ColumnStats, "top" | "sampleDistinct" | "enumValues">;

/** At most this many distinct values, each seen at least twice on average, counts as an enum. */
const ENUM_MAX = 12;

export function sampleSummary(rows: Row[], fields: Field[]): Record<string, Summary> {
  const out: Record<string, Summary> = {};
  for (const f of fields) {
    const counts = new Map<string, number>();
    for (const r of rows) {
      const v = r[f.name];
      if (isBlank(v)) continue;
      const k = keyOf(v);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    let nonNull = 0;
    for (const c of counts.values()) nonNull += c;
    const summary: Summary = { top: topOf(counts), sampleDistinct: counts.size };
    if (counts.size > 0 && counts.size <= ENUM_MAX && nonNull >= counts.size * 2) summary.enumValues = [...counts.keys()].sort();
    out[f.name] = summary;
  }
  return out;
}

const cache = new WeakMap<WsTable, ColumnProfile[]>();

/** Column profile. Tables loaded through the builder carry everything in `stats`, so this is instant; otherwise the sample rows are scanned once and cached. */
export function profileTable(table: WsTable): ColumnProfile[] {
  const hit = cache.get(table);
  if (hit) return hit;
  const result = table.fields.map((f) => {
    const full = table.stats?.[f.name];
    if (full?.top) return fromStats(f, full);
    return fromRows(table, f);
  });
  cache.set(table, result);
  return result;
}

function fromStats(f: Field, s: ColumnStats): ColumnProfile {
  const total = s.nonNull + s.nulls;
  return {
    name: f.name,
    type: f.type,
    nulls: s.nulls,
    nullPct: total ? s.nulls / total : 0,
    distinct: s.distinct ?? s.sampleDistinct ?? 0,
    distinctExact: s.distinct !== undefined && !s.capped,
    unique: s.unique ?? (s.nulls === 0 && s.nonNull > 0 && s.sampleDistinct === s.nonNull),
    min: s.min,
    max: s.max,
    mean: s.mean,
    top: s.top ?? [],
  };
}

function fromRows(table: WsTable, f: Field): ColumnProfile {
  const n = table.rows.length;
  const counts = new Map<string, number>();
  let nonNull = 0;
  let lo = Infinity;
  let hi = -Infinity;
  let sum = 0;
  let nums = 0;
  const numeric = f.type === "int" || f.type === "float" || f.type === "decimal";
  for (const r of table.rows) {
    const v = r[f.name];
    if (isBlank(v)) continue;
    nonNull++;
    const k = keyOf(v);
    counts.set(k, (counts.get(k) ?? 0) + 1);
    if (numeric) {
      const x = Number(v);
      if (Number.isFinite(x)) {
        nums++;
        sum += x;
        if (x < lo) lo = x;
        if (x > hi) hi = x;
      }
    }
  }
  const full = table.stats?.[f.name];
  const total = full ? full.nonNull + full.nulls : n;
  const nulls = full?.nulls ?? n - nonNull;
  const profile: ColumnProfile = {
    name: f.name,
    type: f.type,
    nulls,
    nullPct: total ? nulls / total : 0,
    distinct: full?.distinct ?? counts.size,
    distinctExact: full?.distinct !== undefined && !full.capped,
    unique: full?.unique ?? (nonNull > 0 && counts.size === nonNull),
    top: topOf(counts),
  };
  if (numeric && nums) {
    profile.min = String(lo);
    profile.max = String(hi);
    profile.mean = sum / nums;
  } else if (f.type === "date" || f.type === "timestamp" || f.type === "string") {
    // ISO dates sort lexically; strings report alphabetical bounds (single pass, no sort)
    let min: string | undefined;
    let max: string | undefined;
    for (const k of counts.keys()) {
      if (min === undefined || k < min) min = k;
      if (max === undefined || k > max) max = k;
    }
    profile.min = min;
    profile.max = max;
  }
  // full-file min/max/mean override the sample's
  if (full?.min !== undefined) {
    profile.min = full.min;
    profile.max = full.max;
    if (full.mean !== undefined) profile.mean = full.mean;
  }
  return profile;
}
