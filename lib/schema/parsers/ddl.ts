import type { Field } from "../types";
import { toCanonical } from "../typeMap";

const CREATE_RE = /create\s+(?:or\s+replace\s+)?(?:temp(?:orary)?\s+|transient\s+|external\s+)?table\s+(?:if\s+not\s+exists\s+)?([^\s(]+)\s*\(/i;

export function looksLikeDdl(text: string): boolean {
  return CREATE_RE.test(text);
}

/** Split on commas that are not inside parentheses or angle brackets. */
function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of body) {
    if (ch === "(" || ch === "<") depth++;
    if (ch === ")" || ch === ">") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

const CONSTRAINT_RE = /^(primary\s+key|foreign\s+key|unique|constraint|check|index|key)\b/i;
const TYPE_STOP_RE = /\s+(not\s+null|null|default|primary|references|unique|check|collate|comment|options|generated|identity|autoincrement)\b/i;

/** Parse a single CREATE TABLE statement (flat columns; nested STRUCTs become json). */
export function parseDdl(text: string): { name: string; fields: Field[] } {
  const match = CREATE_RE.exec(text);
  if (!match) throw new Error("No CREATE TABLE statement found.");
  const name = match[1].replace(/[`"[\]]/g, "").split(".").pop() ?? "table";

  // find the matching close paren for the column list
  const start = match.index + match[0].length;
  let depth = 1;
  let end = start;
  for (; end < text.length && depth > 0; end++) {
    if (text[end] === "(") depth++;
    if (text[end] === ")") depth--;
  }
  const body = text.slice(start, end - 1);

  const fields: Field[] = [];
  for (const def of splitTopLevel(body)) {
    if (CONSTRAINT_RE.test(def)) continue;
    const colMatch = /^([`"[]?)([^`"\]\s]+)\1\]?\s+([\s\S]+)$/.exec(def);
    if (!colMatch) continue;
    const colName = colMatch[2];
    const rest = colMatch[3];
    const stop = TYPE_STOP_RE.exec(rest);
    let rawType = (stop ? rest.slice(0, stop.index) : rest).trim();

    const field: Field = { name: colName, type: "string", nullable: !/not\s+null|primary\s+key/i.test(rest) };
    const arrayMatch = /^array\s*<(.+)>$/i.exec(rawType) ?? /^(.+)\[\]$/.exec(rawType);
    if (arrayMatch) {
      field.repeated = true;
      field.nullable = true;
      rawType = arrayMatch[1];
    }
    field.type = /^(struct|record)\b/i.test(rawType) ? "json" : toCanonical(rawType);
    const comment = /comment\s+'((?:[^']|'')*)'/i.exec(rest) ?? /description\s*=\s*"([^"]*)"/i.exec(rest);
    if (comment) field.description = comment[1].replace(/''/g, "'");
    fields.push(field);
  }
  if (fields.length === 0) throw new Error("No columns found in the CREATE TABLE statement.");
  return { name, fields };
}
