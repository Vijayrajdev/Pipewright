import { entityName } from "@/lib/rules/describe";
import type { Field } from "@/lib/schema/types";
import { keyOf } from "./profile";
import { relationId, type Relation, type Workspace, type WsTable } from "./types";

/** Share of `fk` values present in `pk`. Checks at most 50k values so huge columns stay fast. */
function overlapOf(fk: Set<string>, pk: Set<string>): number | null {
  if (!fk.size || !pk.size) return null;
  let hit = 0;
  let seen = 0;
  for (const v of fk) {
    if (pk.has(v)) hit++;
    if (++seen >= 50_000) break;
  }
  return hit / seen;
}

const isBlank = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

/** Full-file distinct values when the loader tracked them, else the sample's. */
function distinctValues(table: WsTable, column: string): Set<string> {
  const full = table.keySets?.[column];
  if (full) return full;
  const s = new Set<string>();
  for (const r of table.rows) {
    const v = r[column];
    if (!isBlank(v)) s.add(keyOf(v));
  }
  return s;
}

/** Non-null and unique: across the whole file when stats exist, else the sample. */
export function isUniqueColumn(table: WsTable, column: string): boolean {
  const stats = table.stats?.[column];
  if (stats?.unique !== undefined) return stats.unique;
  if (!table.rows.length) return false;
  const seen = new Set<string>();
  for (const r of table.rows) {
    const v = r[column];
    if (isBlank(v)) return false;
    const k = keyOf(v);
    if (seen.has(k)) return false;
    seen.add(k);
  }
  return true;
}

const keyable = (f: Field) => !f.repeated && ["int", "string", "decimal"].includes(f.type);

/** Guess the primary key: `id`, `<entity>_id`, then any unique *_id / *_key / *_code column. */
export function detectPrimaryKey(table: WsTable): string | null {
  const entity = entityName(table.name);
  const candidates = table.fields.filter(keyable).map((f) => f.name);
  const ordered = [
    ...candidates.filter((c) => c === "id"),
    ...candidates.filter((c) => c === `${entity}_id` || c === `${entity}_key`),
    ...candidates.filter((c) => /_(id|key|code|uuid)$/.test(c)),
    ...candidates.filter((c) => /^(key|code|uuid|sku)$/.test(c)),
  ];
  // with no data at all we can't check uniqueness, so trust the name
  if (!table.rows.length && !table.stats) return ordered[0] ?? null;
  return ordered.find((c) => isUniqueColumn(table, c)) ?? null;
}

export function primaryKeys(ws: Workspace): Record<string, string | null> {
  return Object.fromEntries(
    ws.tables.map((t) => [t.id, t.id in ws.pkOverrides ? ws.pkOverrides[t.id] : detectPrimaryKey(t)]),
  );
}

/** Does `column` in one table name-match the key `pk` of `target`? */
function nameMatches(column: string, target: WsTable, pk: string): boolean {
  const entity = entityName(target.name);
  if (column === pk && pk !== "id") return true; // customer_id ↔ customer_id
  if (pk === "id" && (column === `${entity}_id` || column === `${target.name}_id`)) return true; // customer_id ↔ customers.id
  if (column === `${entity}_${pk}`) return true; // product_sku ↔ products.sku
  // role-named FKs: buyer_customer_id, parent_category_id
  return column.endsWith(`_${entity}_id`) && pk === "id";
}

const sameFamily = (a: Field, b: Field) => {
  const fam = (t: Field["type"]) => (t === "int" || t === "decimal" || t === "float" ? "num" : t);
  return fam(a.type) === fam(b.type) || a.type === "string" || b.type === "string";
};

/** Detect foreign keys between tables from naming and value overlap. */
export function detectRelations(ws: Workspace): Relation[] {
  const pks = primaryKeys(ws);
  const found: Relation[] = [];

  for (const target of ws.tables) {
    const pk = pks[target.id];
    if (!pk) continue;
    const pkField = target.fields.find((f) => f.name === pk);
    if (!pkField) continue;
    const pkValues = distinctValues(target, pk);

    for (const source of ws.tables) {
      for (const f of source.fields) {
        if (source.id === target.id && f.name === pk) continue;
        if (!keyable(f) || !sameFamily(f, pkField)) continue;
        if (!nameMatches(f.name, target, pk)) continue;

        const overlap = overlapOf(distinctValues(source, f.name), pkValues);
        if (overlap !== null && overlap < 0.3) continue; // names match but values don't: probably a coincidence
        const from = { table: source.id, column: f.name };
        const to = { table: target.id, column: pk };
        found.push({
          id: relationId(from, to),
          from,
          to,
          overlap,
          cardinality: isUniqueColumn(source, f.name) ? "1:1" : "N:1",
          origin: "auto",
        });
      }
    }
  }
  // for 1:1 pairs detected in both directions keep one
  const seen = new Set<string>();
  return found.filter((r) => {
    const pair = [r.from.table + r.from.column, r.to.table + r.to.column].sort().join("|");
    if (r.cardinality === "1:1" && seen.has(pair)) return false;
    seen.add(pair);
    return true;
  });
}

/** Auto-detected minus hidden, plus manual. */
export function activeRelations(ws: Workspace): Relation[] {
  const valid = (r: Relation) => {
    const a = ws.tables.find((t) => t.id === r.from.table);
    const b = ws.tables.find((t) => t.id === r.to.table);
    return !!a?.fields.some((f) => f.name === r.from.column) && !!b?.fields.some((f) => f.name === r.to.column);
  };
  const auto = detectRelations(ws).filter((r) => !ws.hiddenRelations.includes(r.id));
  const manual = ws.manualRelations.filter((m) => !auto.some((a) => a.id === m.id));
  return [...auto, ...manual].filter(valid);
}

/** Measure a manual relation against the data. */
export function measureRelation(ws: Workspace, from: { table: string; column: string }, to: { table: string; column: string }): Relation {
  const a = ws.tables.find((t) => t.id === from.table)!;
  const b = ws.tables.find((t) => t.id === to.table)!;
  const overlap = overlapOf(distinctValues(a, from.column), distinctValues(b, to.column));
  return {
    id: relationId(from, to),
    from,
    to,
    overlap,
    cardinality: isUniqueColumn(a, from.column) ? "1:1" : "N:1",
    origin: "manual",
  };
}
