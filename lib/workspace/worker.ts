/// <reference lib="webworker" />
/**
 * Parses an uploaded file off the main thread. CSV/TSV and NDJSON are streamed
 * in chunks, so files of any size load with constant memory and the page stays
 * responsive. Posts progress, then the finished table (sample + stats + key sets).
 */
import Papa from "papaparse";
import { ColumnNamer, TableBuilder } from "./builder";
import { isJsonFile } from "./load";
import type { Row } from "./types";

export type WorkerRequest = { file: File; name: string };
export type WorkerResponse =
  | { type: "progress"; bytes: number; total: number; rows: number }
  | { type: "done"; table: ReturnType<TableBuilder["finish"]> }
  | { type: "error"; message: string };

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const post = (msg: WorkerResponse) => ctx.postMessage(msg);

/** JSON arrays can't be streamed with the platform parser, so cap them. */
const MAX_JSON_ARRAY_BYTES = 300 * 1024 * 1024;

async function streamLines(file: File, onLine: (line: string) => void, onProgress: (bytes: number) => void) {
  const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let bytes = 0;
  let lastPost = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const l of lines) if (l.trim()) onLine(l);
    if (bytes - lastPost > 2_000_000) {
      lastPost = bytes;
      onProgress(Math.min(bytes, file.size));
    }
  }
  if (buffer.trim()) onLine(buffer);
}

ctx.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { file, name } = e.data;
  const builder = new TableBuilder(name, file.name);
  const namer = new ColumnNamer();
  const progress = (bytes: number) => post({ type: "progress", bytes, total: file.size, rows: builder.rowCount });

  try {
    const head = await file.slice(0, 256).text();
    if (isJsonFile(file.name, head)) {
      if (/^\s*\[/.test(head)) {
        if (file.size > MAX_JSON_ARRAY_BYTES) throw new Error(`${file.name} is a JSON array over 300 MB. Convert it to NDJSON (one object per line) to stream it.`);
        const parsed = JSON.parse(await file.text());
        for (const r of Array.isArray(parsed) ? parsed : [parsed]) {
          if (typeof r === "object" && r !== null && !Array.isArray(r)) builder.add(namer.renameRow(r as Row));
        }
      } else {
        let lineNo = 0;
        await streamLines(file, (line) => {
          lineNo++;
          let obj: unknown;
          try {
            obj = JSON.parse(line);
          } catch {
            throw new Error(`${file.name}: line ${lineNo} is not valid JSON.`);
          }
          if (typeof obj === "object" && obj !== null && !Array.isArray(obj)) builder.add(namer.renameRow(obj as Row));
        }, progress);
      }
      if (!builder.rowCount) throw new Error(`${file.name}: expected JSON objects.`);
      post({ type: "done", table: builder.finish() });
      return;
    }

    await new Promise<void>((resolve, reject) => {
      Papa.parse<Row>(file, {
        header: true,
        skipEmptyLines: true,
        delimiter: /\.tsv$/i.test(file.name) ? "\t" : "",
        transformHeader: (h) => namer.name(h),
        chunkSize: 4 * 1024 * 1024,
        chunk: (results) => {
          for (const r of results.data) builder.add(r);
          progress(results.meta.cursor);
        },
        complete: () => resolve(),
        error: (err) => reject(err),
      });
    });
    if (!builder.rowCount) throw new Error(`${file.name}: no rows found.`);
    progress(file.size);
    post({ type: "done", table: builder.finish() });
  } catch (err) {
    post({ type: "error", message: (err as Error).message });
  }
};
