import type { Field } from "./types";

/** Index path into a nested field tree: [2, 0] = fields[2].fields[0] */
export type FieldPath = number[];

export function updateAt(fields: Field[], path: FieldPath, fn: (f: Field) => Field | null): Field[] {
  const [head, ...rest] = path;
  return fields.flatMap((f, i) => {
    if (i !== head) return [f];
    if (rest.length === 0) {
      const next = fn(f);
      return next ? [next] : [];
    }
    return [{ ...f, fields: updateAt(f.fields ?? [], rest, fn) }];
  });
}

/** Apply AI descriptions keyed by dotted path ("shipping.city"). */
export function applyDescriptions(
  fields: Field[],
  byPath: Map<string, { description: string; pii: boolean }>,
  prefix = "",
): Field[] {
  return fields.map((f) => {
    const p = prefix + f.name;
    const hit = byPath.get(p);
    const next: Field = hit ? { ...f, description: f.description || hit.description, pii: hit.pii } : f;
    return f.fields ? { ...next, fields: applyDescriptions(f.fields, byPath, `${p}.`) } : next;
  });
}
