import { inferFields } from "@/lib/schema/infer";
import { dedupeNames, toSnakeCase } from "@/lib/schema/normalize";
import { rng } from "@/lib/mock";
import { keyOf, sampleSummary } from "./profile";
import { hash53, sortedHashes } from "./keys";
import type { ColumnStats, Row, WsTable } from "./types";

/** rows kept in memory per table: every row for small files, a uniform sample beyond that */
export const SAMPLE_ROWS = 20_000;
/** distinct values tracked per key-like column before giving up on exactness (hashes are 8 bytes each) */
export const KEY_CAP = 1_000_000;

const KEY_LIKE = /(^id$|_id$|_key$|_code$|_uuid$|^uuid$|^sku$|^code$|^key$)/;
const isBlank = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

interface Acc {
  nonNull: number;
  numCount: number;
  numMin: number;
  numMax: number;
  numSum: number;
  strMin?: string;
  strMax?: string;
  keys?: Set<number>;
  dup: boolean;
  capped: boolean;
}

/** Normalises raw column names to unique snake_case, remembering the mapping. */
export class ColumnNamer {
  private map = new Map<string, string>();
  private used: string[] = [];
  name(raw: string): string {
    let n = this.map.get(raw);
    if (n === undefined) {
      n = dedupeNames([...this.used, toSnakeCase(raw)]).at(-1)!;
      this.used.push(n);
      this.map.set(raw, n);
    }
    return n;
  }
  renameRow(raw: Row): Row {
    const out: Row = {};
    for (const k in raw) out[this.name(k)] = raw[k];
    return out;
  }
}

/**
 * Streams rows into a table in O(1) memory per row: exact counts, min/max and
 * key sets over the whole file, plus a reservoir sample for type inference,
 * profiling and previews. Used by the Web Worker and by the synchronous loader.
 */
export class TableBuilder {
  private acc = new Map<string, Acc>();
  private sample: Row[] = [];
  private count = 0;
  private random = rng(1234);

  constructor(
    private name: string,
    private source?: string,
    private sampleSize = SAMPLE_ROWS,
    private keyCap = KEY_CAP,
  ) {}

  get rowCount() {
    return this.count;
  }

  add(row: Row) {
    this.count++;
    // reservoir sampling (Algorithm R) keeps a uniform sample of any size of file
    if (this.sample.length < this.sampleSize) this.sample.push(row);
    else {
      const j = Math.floor(this.random() * this.count);
      if (j < this.sampleSize) this.sample[j] = row;
    }

    for (const col in row) {
      let a = this.acc.get(col);
      if (!a) {
        a = { nonNull: 0, numCount: 0, numMin: Infinity, numMax: -Infinity, numSum: 0, dup: false, capped: false };
        if (KEY_LIKE.test(col) || this.acc.size === 0) a.keys = new Set();
        this.acc.set(col, a);
      }
      const v = row[col];
      if (isBlank(v)) continue;
      a.nonNull++;

      const num = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
      if (Number.isFinite(num)) {
        a.numCount++;
        if (num < a.numMin) a.numMin = num;
        if (num > a.numMax) a.numMax = num;
        a.numSum += num;
      }
      if (typeof v === "string" && v.length <= 64) {
        const s = v.trim();
        if (a.strMin === undefined || s < a.strMin) a.strMin = s;
        if (a.strMax === undefined || s > a.strMax) a.strMax = s;
      }
      if (a.keys && !a.capped) {
        const k = hash53(keyOf(v));
        if (a.keys.has(k)) a.dup = true;
        else if (a.keys.size >= this.keyCap) a.capped = true;
        else a.keys.add(k);
      }
    }
  }

  finish(): WsTable {
    const fields = inferFields(this.sample, { snakeCase: false });
    const stats: Record<string, ColumnStats> = {};
    const keyHashes: Record<string, Float64Array> = {};
    // top values and sample distinct counts, so the profile never rescans rows on the page
    const summary = sampleSummary(this.sample, fields);
    for (const f of fields) {
      const a = this.acc.get(f.name);
      if (!a) continue;
      const numeric = f.type === "int" || f.type === "float" || f.type === "decimal";
      const s: ColumnStats = { nonNull: a.nonNull, nulls: this.count - a.nonNull, ...summary[f.name] };
      if (numeric && a.numCount) {
        s.min = String(a.numMin);
        s.max = String(a.numMax);
        s.mean = a.numSum / a.numCount;
      } else if (a.strMin !== undefined) {
        s.min = a.strMin;
        s.max = a.strMax;
      }
      if (a.keys) {
        s.distinct = a.keys.size;
        s.unique = !a.dup && s.nulls === 0 && a.nonNull > 0;
        if (a.capped) s.capped = true;
        // only keep sets that could be keys or point at keys
        if (KEY_LIKE.test(f.name) || s.unique) keyHashes[f.name] = sortedHashes(a.keys);
      }
      stats[f.name] = s;
    }
    return {
      id: `${this.name}-${Math.random().toString(36).slice(2, 8)}`,
      name: this.name,
      fields,
      rows: this.sample,
      rowCount: this.count,
      sampleCount: this.sample.length,
      source: this.source,
      stats,
      keyHashes,
    };
  }
}
