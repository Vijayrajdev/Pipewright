import { keyOf } from "./profile";
import type { Row } from "./types";

/**
 * Key columns are tracked as sorted 53-bit hashes in a Float64Array instead of
 * a Set of strings. A typed array moves between the worker, the page and
 * IndexedDB as one block of memory (no per-value copying), takes a fraction
 * of the memory, and two sorted arrays compare in a single linear pass.
 * With 53 bits, a false match needs ~10^8 values before it's even likely.
 */

/** cyrb53: fast, well-distributed 53-bit string hash (public domain). */
export function hash53(str: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** Sorted array of distinct hashes. */
export function sortedHashes(values: Iterable<number>): Float64Array {
  const arr = Float64Array.from(values);
  arr.sort();
  return arr;
}

/** Share of `fk` hashes present in `pk`, both sorted and distinct; null when either is empty. */
export function overlapSorted(fk: Float64Array, pk: Float64Array): number | null {
  if (!fk.length || !pk.length) return null;
  let i = 0;
  let j = 0;
  let hit = 0;
  while (i < fk.length && j < pk.length) {
    if (fk[i] === pk[j]) {
      hit++;
      i++;
      j++;
    } else if (fk[i] < pk[j]) i++;
    else j++;
  }
  return hit / fk.length;
}

const isBlank = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

/** Distinct value hashes of one column of sample rows, cached per rows array. */
const fromRowsCache = new WeakMap<Row[], Map<string, Float64Array>>();
export function hashesFromRows(rows: Row[], column: string): Float64Array {
  let byCol = fromRowsCache.get(rows);
  if (!byCol) fromRowsCache.set(rows, (byCol = new Map()));
  let out = byCol.get(column);
  if (!out) {
    const set = new Set<number>();
    for (const r of rows) {
      const v = r[column];
      if (!isBlank(v)) set.add(hash53(keyOf(v)));
    }
    byCol.set(column, (out = sortedHashes(set)));
  }
  return out;
}
