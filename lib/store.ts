"use client";

import { useCallback, useSyncExternalStore } from "react";
import { TableSchemaSchema, type TableSchema } from "@/lib/schema/types";
import { EMPTY_WORKSPACE, type Workspace, type WsTable } from "@/lib/workspace/types";
import { idbDelete, idbGet, idbSet, keysKey, legacyKey, rowsKey } from "@/lib/idb";
import { hash53, sortedHashes } from "@/lib/workspace/keys";

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
      localChanged(key);
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
 * diagram positions) goes to localStorage; the heavy part of each table goes
 * to IndexedDB as two records, key hashes and sample rows. Files loaded
 * through the worker are saved by the worker itself, off the page.
 */
let wsMemory: Workspace | null = null;
/** rows arrays already in IndexedDB, so they're never written twice */
const savedData = new WeakSet<object>();

/** The worker already stored this table's rows and key hashes. */
export function markSaved(table: WsTable) {
  savedData.add(table.rows);
}

function validWorkspace(v: unknown): Workspace {
  const w = v as Partial<Workspace> | null;
  if (!w || !Array.isArray(w.tables)) return EMPTY_WORKSPACE;
  return { ...EMPTY_WORKSPACE, ...w, tables: w.tables.map((t) => ({ ...t, rows: t.rows ?? [], keyHashes: undefined })) } as Workspace;
}

/** Merge restored data into whatever the workspace is now (the user may have changed it meanwhile). */
function patchTables(patch: Map<string, Partial<WsTable>>) {
  if (!wsMemory || !patch.size) return;
  wsMemory = { ...wsMemory, tables: wsMemory.tables.map((t) => (patch.has(t.id) ? { ...t, ...patch.get(t.id) } : t)) };
  listeners.forEach((l) => l());
}

const idle = (fn: () => void) =>
  typeof requestIdleCallback === "function" ? requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 50);

/** Old saves kept key values as Sets of strings; hash them once and re-save in the new layout. */
async function migrateLegacy(id: string) {
  const old = await idbGet<{ rows: WsTable["rows"]; keySets?: Record<string, Set<string>> }>(legacyKey(id));
  if (!old) return null;
  const keyHashes = Object.fromEntries(
    Object.entries(old.keySets ?? {}).map(([col, set]) => [col, sortedHashes([...set].map(hash53))]),
  );
  await Promise.all([idbSet(rowsKey(id), old.rows), idbSet(keysKey(id), keyHashes)]);
  void idbDelete(legacyKey(id));
  return { rows: old.rows, keyHashes };
}

/**
 * Restore in two steps so the page is usable quickly: key hashes first (small
 * typed arrays; enough for keys, relationships and the diagram), then the
 * sample rows one table at a time when the browser is idle.
 */
async function hydrateTables() {
  const todo = (wsMemory?.tables ?? []).filter((t) => !t.rows.length && t.rowCount);
  if (!todo.length) return;
  const keys = new Map<string, Partial<WsTable>>();
  const legacyRows = new Map<string, WsTable["rows"]>();
  await Promise.all(
    todo.map(async (t) => {
      const keyHashes = await idbGet<WsTable["keyHashes"]>(keysKey(t.id));
      if (keyHashes) return void keys.set(t.id, { keyHashes });
      const migrated = await migrateLegacy(t.id);
      if (migrated) {
        keys.set(t.id, { keyHashes: migrated.keyHashes });
        legacyRows.set(t.id, migrated.rows);
      }
    }),
  );
  patchTables(keys);

  for (const t of todo) {
    await new Promise<void>((resolve) => idle(() => resolve()));
    const rows = legacyRows.get(t.id) ?? (await idbGet<WsTable["rows"]>(rowsKey(t.id)));
    if (!rows) continue;
    savedData.add(rows);
    patchTables(new Map([[t.id, { rows }]]));
  }
}

function wsSnapshot(): Workspace {
  if (!wsMemory) {
    wsMemory = validWorkspace(read(WORKSPACE_KEY, EMPTY_WORKSPACE));
    void hydrateTables();
  }
  return wsMemory;
}

// metadata writes are debounced: dragging tables or typing a name doesn't stringify the model on every event
let metaTimer: ReturnType<typeof setTimeout> | undefined;
function flushMeta() {
  clearTimeout(metaTimer);
  metaTimer = undefined;
  if (wsMemory) write(WORKSPACE_KEY, { ...wsMemory, tables: wsMemory.tables.map((t) => ({ ...t, rows: [], keyHashes: undefined })) });
}
if (typeof window !== "undefined") window.addEventListener("pagehide", () => metaTimer && flushMeta());

function persistWorkspace(prev: Workspace | null, next: Workspace) {
  clearTimeout(metaTimer);
  metaTimer = setTimeout(flushMeta, 250);
  for (const t of next.tables) {
    if (t.rows.length && !savedData.has(t.rows)) {
      savedData.add(t.rows);
      void idbSet(rowsKey(t.id), t.rows);
      void idbSet(keysKey(t.id), t.keyHashes ?? {});
    }
  }
  for (const t of prev?.tables ?? []) {
    if (!next.tables.some((n) => n.id === t.id)) {
      void idbDelete(rowsKey(t.id));
      void idbDelete(keysKey(t.id));
      void idbDelete(legacyKey(t.id));
    }
  }
}

type WorkspaceUpdate = Workspace | ((current: Workspace) => Workspace);

/** Multi-table data model: files, keys, relationships and diagram positions. Accepts a value or an updater. */
export function useWorkspace() {
  const value = useSyncExternalStore(subscribe, wsSnapshot, () => EMPTY_WORKSPACE);
  const set = useCallback((update: WorkspaceUpdate) => {
    const prev = wsMemory;
    const next = typeof update === "function" ? update(prev ?? wsSnapshot()) : update;
    wsMemory = next;
    persistWorkspace(prev, next);
    listeners.forEach((l) => l());
    localChanged(WORKSPACE_KEY);
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

// ── cloud sync hooks ─────────────────────────────────────────────────────
/*
 * What signed-in users can sync: the current schema, recent work and the
 * data model's structure. Raw rows and key hashes never leave the browser.
 * Each local change is time-stamped so sync can tell which copy is newer.
 */
export type SyncName = "schema" | "recent" | "workspace";
const SYNC_KEYS: Record<SyncName, string> = { schema: SCHEMA_KEY, recent: RECENT_KEY, workspace: WORKSPACE_KEY };
const UPDATED_KEY = "pipewright:updated";

const changeListeners = new Set<(name: SyncName) => void>();
function localChanged(storageKey: string) {
  const name = (Object.keys(SYNC_KEYS) as SyncName[]).find((n) => SYNC_KEYS[n] === storageKey);
  if (!name) return;
  setUpdatedAt(name, Date.now());
  changeListeners.forEach((l) => l(name));
}

/** Called after a local change to something that syncs (not for cloud-applied changes). */
export function onLocalChange(cb: (name: SyncName) => void) {
  changeListeners.add(cb);
  return () => changeListeners.delete(cb);
}

export function getUpdatedAt(name: SyncName): number {
  return read<Partial<Record<SyncName, number>>>(UPDATED_KEY, {})[name] ?? 0;
}
function setUpdatedAt(name: SyncName, at: number) {
  write(UPDATED_KEY, { ...read<Partial<Record<SyncName, number>>>(UPDATED_KEY, {}), [name]: at });
}

/** Local value in its cloud form: the workspace without rows or key hashes. */
export function readForSync(name: SyncName): unknown {
  if (name === "workspace") {
    const ws = wsSnapshot();
    return { ...ws, tables: ws.tables.map((t) => ({ ...t, rows: [], keyHashes: undefined })) };
  }
  if (name === "schema") return memory.has(SCHEMA_KEY) ? memory.get(SCHEMA_KEY) : validSchema(read(SCHEMA_KEY, null));
  return memory.has(RECENT_KEY) ? memory.get(RECENT_KEY) : read<RecentItem[]>(RECENT_KEY, []).filter((i) => validSchema(i?.schema));
}

/** Apply a value that came from the cloud, keeping its timestamp so it isn't pushed straight back. */
export function writeFromSync(name: SyncName, value: unknown, at: number) {
  if (name === "workspace") {
    const incoming = validWorkspace(value);
    const prev = wsMemory;
    // keep this browser's rows and key hashes for tables it already has
    const local = new Map((prev?.tables ?? []).map((t) => [t.id, t]));
    wsMemory = { ...incoming, tables: incoming.tables.map((t) => (local.has(t.id) ? { ...t, rows: local.get(t.id)!.rows, keyHashes: local.get(t.id)!.keyHashes } : t)) };
    persistWorkspace(prev, wsMemory);
    void hydrateTables();
  } else {
    const key = SYNC_KEYS[name];
    const clean = name === "schema" ? validSchema(value) : Array.isArray(value) ? (value as RecentItem[]).filter((i) => validSchema(i?.schema)) : [];
    memory.set(key, clean);
    write(key, clean);
  }
  setUpdatedAt(name, at);
  listeners.forEach((l) => l());
}
