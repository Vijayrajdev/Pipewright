"use client";

import { useCallback, useSyncExternalStore } from "react";
import { TableSchemaSchema, type TableSchema } from "@/lib/schema/types";
import { EMPTY_WORKSPACE, type Workspace, type WsTable } from "@/lib/workspace/types";
import { idbDelete, idbGet, idbSet } from "@/lib/idb";

/**
 * Tiny localStorage-backed store. Storage can be unavailable (private mode,
 * blocked site data), so every access is guarded and the app works without it.
 */
function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: state lives in memory for this tab only */
  }
}

const listeners = new Set<() => void>();
const memory = new Map<string, unknown>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function useStored<T>(key: string, fallback: T, validate: (v: unknown) => T = (v) => v as T) {
  const getSnapshot = () => {
    if (!memory.has(key)) memory.set(key, validate(read(key, fallback)));
    return memory.get(key) as T;
  };
  const value = useSyncExternalStore(subscribe, getSnapshot, () => fallback);
  const set = useCallback(
    (next: T) => {
      memory.set(key, next);
      write(key, next);
      listeners.forEach((l) => l());
    },
    [key],
  );
  return [value, set] as const;
}

const SCHEMA_KEY = "pipewright:schema";
const RECENT_KEY = "pipewright:recent";
const MAX_RECENT = 6;

export interface RecentItem {
  name: string;
  columns: number;
  savedAt: string;
  schema: TableSchema;
}

const validSchema = (v: unknown) => {
  const r = TableSchemaSchema.safeParse(v);
  return r.success ? r.data : null;
};

/** The table currently being worked on, shared by the Schema Builder and the assistant. */
export function useCurrentSchema() {
  return useStored<TableSchema | null>(SCHEMA_KEY, null, validSchema);
}

export function useRecent() {
  const [items, setItems] = useStored<RecentItem[]>(RECENT_KEY, [], (v) =>
    Array.isArray(v) ? (v as RecentItem[]).filter((i) => validSchema(i?.schema)) : [],
  );
  const remember = useCallback(
    (schema: TableSchema) => {
      const item: RecentItem = {
        name: schema.name,
        columns: schema.fields.length,
        savedAt: new Date().toISOString(),
        schema,
      };
      setItems([item, ...items.filter((i) => i.name !== schema.name)].slice(0, MAX_RECENT));
    },
    [items, setItems],
  );
  const forget = useCallback((name: string) => setItems(items.filter((i) => i.name !== name)), [items, setItems]);
  const clear = useCallback(() => setItems([]), [setItems]);
  return [items, remember, forget, clear] as const;
}

const WORKSPACE_KEY = "pipewright:workspace";

/*
 * Workspace persistence is split: metadata (names, fields, stats, keys,
 * diagram positions) goes to localStorage; the heavy part of each table
 * (sample rows + key sets) goes to IndexedDB, written once per table.
 */
let wsMemory: Workspace | null = null;
const savedData = new WeakSet<object>();

function validWorkspace(v: unknown): Workspace {
  const w = v as Partial<Workspace> | null;
  if (!w || !Array.isArray(w.tables)) return EMPTY_WORKSPACE;
  return { ...EMPTY_WORKSPACE, ...w, tables: w.tables.map((t) => ({ ...t, rows: t.rows ?? [] })) } as Workspace;
}

async function hydrateTables() {
  const start = wsMemory;
  if (!start) return;
  const loaded = await Promise.all(
    start.tables.map(async (t) => {
      if (t.rows.length || !t.rowCount) return t;
      const data = await idbGet<{ rows: WsTable["rows"]; keySets?: WsTable["keySets"] }>(`table:${t.id}`);
      if (!data) return t;
      savedData.add(data.rows);
      return { ...t, rows: data.rows, keySets: data.keySets };
    }),
  );
  // only apply if nothing changed while we were reading
  if (wsMemory !== start) return;
  wsMemory = { ...start, tables: loaded };
  listeners.forEach((l) => l());
}

function wsSnapshot(): Workspace {
  if (!wsMemory) {
    wsMemory = validWorkspace(read(WORKSPACE_KEY, EMPTY_WORKSPACE));
    void hydrateTables();
  }
  return wsMemory;
}

function persistWorkspace(prev: Workspace | null, next: Workspace) {
  write(WORKSPACE_KEY, { ...next, tables: next.tables.map((t) => ({ ...t, rows: [], keySets: undefined })) });
  for (const t of next.tables) {
    if (t.rows.length && !savedData.has(t.rows)) {
      savedData.add(t.rows);
      void idbSet(`table:${t.id}`, { rows: t.rows, keySets: t.keySets });
    }
  }
  for (const t of prev?.tables ?? []) {
    if (!next.tables.some((n) => n.id === t.id)) void idbDelete(`table:${t.id}`);
  }
}

/** Multi-table data model: files, keys, relationships and diagram positions. */
export function useWorkspace() {
  const value = useSyncExternalStore(subscribe, wsSnapshot, () => EMPTY_WORKSPACE);
  const set = useCallback((next: Workspace) => {
    const prev = wsMemory;
    wsMemory = next;
    persistWorkspace(prev, next);
    listeners.forEach((l) => l());
  }, []);
  return [value, set] as const;
}

export interface AiStatus {
  enabled: boolean;
  provider?: "anthropic" | "ollama";
  model?: string;
}

/** Which AI backend the server can use, if any. */
export async function fetchAiStatus(): Promise<AiStatus> {
  try {
    const res = await fetch("/api/ai/status", { cache: "no-store" });
    return res.ok ? await res.json() : { enabled: false };
  } catch {
    return { enabled: false };
  }
}
