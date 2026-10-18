import Papa from "papaparse";
import { toSnakeCase } from "@/lib/schema/normalize";
import { ColumnNamer, TableBuilder } from "./builder";
import type { Row, WsTable } from "./types";

/** Table name from a file name: "Order Items (2024).csv" → "order_items_2024" */
export function tableNameFromFile(fileName: string): string {
  return toSnakeCase(fileName.replace(/\.[^.]+$/, ""));
}

export function uniqueName(base: string, existing: string[]): string {
  let name = base || "table";
  for (let n = 2; existing.includes(name); n++) name = `${base}_${n}`;
  return name;
}

export const isJsonFile = (fileName: string, head: string) =>
  /\.(json|ndjson|jsonl)$/i.test(fileName) || /^\s*[[{]/.test(head);

/**
 * Parse a whole file held in memory, synchronously. Used for the demo data and
 * as a fallback; uploads go through the streaming Web Worker in `loader.ts`.
 */
export function loadTable(text: string, fileName: string, existingNames: string[] = []): WsTable {
  const trimmed = text.trim();
  if (!trimmed) throw new Error(`${fileName} is empty.`);
  const builder = new TableBuilder(uniqueName(tableNameFromFile(fileName), existingNames), fileName);
  const namer = new ColumnNamer();

  if (isJsonFile(fileName, trimmed)) {
    let records: unknown[];
    try {
      const parsed = JSON.parse(trimmed);
      records = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      records = trimmed
        .split(/\r?\n/)
        .filter((l) => l.trim())
        .map((l, i) => {
          try {
            return JSON.parse(l);
          } catch {
            throw new Error(`${fileName}: line ${i + 1} is not valid JSON.`);
          }
        });
    }
    let any = false;
    for (const r of records) {
      if (typeof r === "object" && r !== null && !Array.isArray(r)) {
        builder.add(namer.renameRow(r as Row));
        any = true;
      }
    }
    if (!any) throw new Error(`${fileName}: expected JSON objects.`);
    return builder.finish();
  }

  const result = Papa.parse<Row>(trimmed, {
    header: true,
    skipEmptyLines: true,
    delimiter: /\.tsv$/i.test(fileName) ? "\t" : "",
    transformHeader: (h) => namer.name(h),
  });
  if (!result.meta.fields?.length) throw new Error(`${fileName}: no header row found.`);
  for (const r of result.data) builder.add(r);
  return builder.finish();
}
