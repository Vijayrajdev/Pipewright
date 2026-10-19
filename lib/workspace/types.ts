import type { Field } from "@/lib/schema/types";

export type Row = Record<string, unknown>;

/** Exact, full-file statistics for one column (computed while streaming). */
export interface ColumnStats {
  nonNull: number;
  nulls: number;
  min?: string;
  max?: string;
  mean?: number;
  /** exact distinct count; only for key-like columns, and only while under the cap */
  distinct?: number;
  /** key-like columns: no nulls and no duplicates across the whole file */
  unique?: boolean;
  /** distinct tracking stopped at the cap, so `unique`/`distinct` cover only the values seen before it */
  capped?: boolean;
  /** most common values in the sample, computed once at load time */
  top?: { value: string; count: number }[];
  /** distinct values in the sample (for columns without an exact count) */
  sampleDistinct?: number;
  /** every value of a low-cardinality column (status, country…), sorted; feeds accepted_values tests */
  enumValues?: string[];
}

export interface WsTable {
  id: string;
  name: string;
  fields: Field[];
  /** sample rows (all rows for small files, a uniform random sample for large ones) used for profiling and join previews */
  rows: Row[];
  /** total rows in the source file */
  rowCount: number;
  /** size of the sample; known before the rows themselves are restored from storage */
  sampleCount?: number;
  source?: string;
  /** full-file stats per column */
  stats?: Record<string, ColumnStats>;
  /** full-file distinct values of key-like columns as sorted 53-bit hashes (see keys.ts), for exact key and relationship detection */
  keyHashes?: Record<string, Float64Array>;
}

export interface ColumnRef {
  table: string; // table id
  column: string;
}

export interface Relation {
  id: string;
  /** many side (foreign key) */
  from: ColumnRef;
  /** one side (referenced key) */
  to: ColumnRef;
  /** share of distinct FK values found in the referenced key, 0–1; null when there are no values to compare */
  overlap: number | null;
  cardinality: "N:1" | "1:1";
  origin: "auto" | "manual";
}

export interface Workspace {
  dataset?: string;
  tables: WsTable[];
  manualRelations: Relation[];
  hiddenRelations: string[];
  /** table id → chosen primary key column (null = none) */
  pkOverrides: Record<string, string | null>;
  positions: Record<string, { x: number; y: number }>;
}

export const EMPTY_WORKSPACE: Workspace = {
  tables: [],
  manualRelations: [],
  hiddenRelations: [],
  pkOverrides: {},
  positions: {},
};

export const relationId = (from: ColumnRef, to: ColumnRef) => `${from.table}.${from.column}->${to.table}.${to.column}`;
