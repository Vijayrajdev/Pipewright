import type { Field, TableSchema } from "@/lib/schema/types";
import { looksLikePii } from "./pii";

/** "stg_orders" → "order", "categories" → "category" */
export function entityName(tableName: string): string {
  const base = tableName.toLowerCase().replace(/^(stg|dim|fct|fact|raw|src|int|tmp)_/, "");
  if (/ies$/.test(base)) return base.replace(/ies$/, "y");
  if (/(ss|x|ch|sh)es$/.test(base)) return base.replace(/es$/, "");
  if (/[^siu]s$/.test(base)) return base.slice(0, -1);
  return base;
}

const human = (s: string) => s.replace(/_/g, " ").trim();
const owner = (prefix: string, entity: string) => human(prefix) || entity;

type Rule = (name: string, field: Field, entity: string) => string | undefined;

/** Ordered: the first rule that returns a string wins. */
const RULES: Rule[] = [
  (n, _f, e) => (n === "id" ? `Unique identifier for each ${e}.` : undefined),
  (n, _f, e) => {
    const m = /^(.+)_(id|uuid|key|guid)$/.exec(n);
    if (!m) return undefined;
    // orders.order_id is the table's own key, not a reference
    return m[1] === e ? `Unique identifier for each ${e}.` : `Identifier of the related ${human(m[1])}.`;
  },
  (n, f, e) =>
    /^(created|inserted)_(at|on|date|ts|time)$|^creation_(date|time)$/.test(n)
      ? `${f.type === "date" ? "Date" : "Timestamp"} when the ${e} was created.`
      : undefined,
  (n, f, e) =>
    /^(updated|modified|last_modified|last_updated)(_(at|on|date|ts|time))?$/.test(n)
      ? `${f.type === "date" ? "Date" : "Timestamp"} when the ${e} was last updated.`
      : undefined,
  (n, _f, e) => (/^deleted_(at|on)$/.test(n) ? `When the ${e} was soft-deleted; null while active.` : undefined),
  (n, _f, e) => (/^(loaded|ingested|_loaded|etl_loaded)_(at|ts)$/.test(n) ? `When this ${e} row was loaded into the warehouse.` : undefined),
  (n, f, e) => {
    const m = /^(.+)_(at|ts|time|timestamp|date|on)$/.exec(n);
    if (!m || !["date", "timestamp", "string"].includes(f.type)) return undefined;
    const kind = f.type === "date" || /_(date|on)$/.test(n) ? "Date" : "Timestamp";
    if (m[1] === e) return `${kind} of the ${e}.`;
    return /ed$/.test(m[1]) ? `${kind} when the ${e} was ${human(m[1])}.` : `${kind} of the ${e}'s ${human(m[1])}.`;
  },
  (n, f, e) => {
    const m = /^(is|has|was|can|should|did)_(.+)$/.exec(n);
    return m && f.type === "bool" ? `True if the ${e} ${m[1]} ${human(m[2])}.` : undefined;
  },
  (n, _f, e) => {
    const m = /^(.*?)_?e_?mail(_address)?$/.exec(n);
    return m ? `Email address of the ${owner(m[1], e)}.` : undefined;
  },
  (n, _f, e) => {
    const m = /^(.*?)_?(phone|mobile)(_number)?$/.exec(n);
    return m ? `Phone number of the ${owner(m[1], e)}.` : undefined;
  },
  (n, _f, e) => {
    const m = /^(first|last|middle|full)_name$/.exec(n);
    return m ? `${human(m[1])[0].toUpperCase()}${human(m[1]).slice(1)} name of the ${e}.` : undefined;
  },
  (n, _f, e) => {
    const m = /^(.*?)_?name$/.exec(n);
    return m ? `Name of the ${owner(m[1], e)}.` : undefined;
  },
  (n, _f, e) => {
    const m = /^(.*?)_?(amount|total|price|cost|revenue|fee|tax|discount|balance)(_(usd|eur|gbp|inr))?$/.exec(n);
    if (!m) return undefined;
    const what = m[1] ? `${human(m[1])} ${m[2]}` : m[2];
    return `Monetary ${what} for the ${e}${m[4] ? ` in ${m[4].toUpperCase()}` : ""}.`;
  },
  (n, _f, e) => {
    const m = /^(?:num_|n_)(.+)$|^(.+)_(count|qty|quantity|cnt)$|^(quantity|qty)$/.exec(n);
    if (!m) return undefined;
    const what = m[1] ?? m[2];
    return what ? `Number of ${human(what)} for the ${e}.` : `Quantity for the ${e}.`;
  },
  (n, _f, e) => (/^(status|state)$/.test(n) ? `Current status of the ${e}.` : undefined),
  (n, _f, e) => {
    const m = /^(.*?)_?(status|state)$/.exec(n);
    return m ? `Current ${human(m[1])} status of the ${e}.` : undefined;
  },
  (n, _f, e) => (/^(type|category|kind|segment|tier|plan)$/.test(n) ? `${n[0].toUpperCase()}${n.slice(1)} of the ${e}.` : undefined),
  (n, _f, e) => (/^(description|notes?|comments?|remarks?)$/.test(n) ? `Free-text ${human(n)} about the ${e}.` : undefined),
  (n, _f, e) => (/(^|_)(url|link|uri)$/.test(n) ? `URL ${n.includes("_") ? `of the ${human(n.replace(/_(url|link|uri)$/, ""))}` : `for the ${e}`}.` : undefined),
  (n) => (/^(country|country_code)$/.test(n) ? "Country, likely an ISO 3166 code." : undefined),
  (n) => (/^(currency|currency_code)$/.test(n) ? "Currency code, likely ISO 4217." : undefined),
  (n) => (/^(zip|zip_code|postcode|postal_code)$/.test(n) ? "Postal / ZIP code." : undefined),
  (n) => (/^(city|town)$/.test(n) ? "City name." : undefined),
  (n) => (/^(lat|latitude)$/.test(n) ? "Latitude in decimal degrees." : undefined),
  (n) => (/^(lng|lon|longitude)$/.test(n) ? "Longitude in decimal degrees." : undefined),
  (n) => (/^(ip|ip_address)$/.test(n) ? "IP address the request came from." : undefined),
  (_n, f) =>
    f.type === "record" && f.fields?.length
      ? `${f.repeated ? "List of nested records" : "Nested record"} with ${f.fields.map((c) => c.name).slice(0, 4).join(", ")}${f.fields.length > 4 ? ", …" : ""}.`
      : undefined,
  (n, f) => (f.repeated ? `List of ${human(n)}.` : undefined),
];

export function describeColumn(field: Field, entity: string): string | undefined {
  const name = field.name.toLowerCase();
  for (const rule of RULES) {
    const d = rule(name, field, entity);
    if (d) return d;
  }
  return undefined;
}

export interface AutoFillResult {
  schema: TableSchema;
  described: number;
  flagged: number;
}

/** Fill empty descriptions and flag PII. Never overwrites what the user wrote. */
export function autoFill(schema: TableSchema): AutoFillResult {
  let described = 0;
  let flagged = 0;
  const entity = entityName(schema.name);

  const walk = (fields: Field[], parentEntity: string): Field[] =>
    fields.map((f) => {
      const next: Field = { ...f };
      if (!f.description) {
        const d = describeColumn(f, parentEntity);
        if (d) {
          next.description = d;
          described++;
        }
      }
      if (!f.pii && looksLikePii(f.name)) {
        next.pii = true;
        flagged++;
      }
      if (f.fields) next.fields = walk(f.fields, human(f.name));
      return next;
    });

  const fields = walk(schema.fields, entity);
  const description = schema.description || `One row per ${entity}.`;
  return { schema: { ...schema, description, fields }, described, flagged };
}
