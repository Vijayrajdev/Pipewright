"use client";

import { loadTable } from "./load";
import type { WorkerResponse } from "./worker";
import type { WsTable } from "./types";

export interface LoadProgress {
  bytes: number;
  total: number;
  rows: number;
}

/**
 * Load a file in a Web Worker so parsing never blocks the page.
 * Falls back to the main thread where workers aren't available.
 */
export function loadFileInWorker(
  file: File,
  name: string,
  onProgress: (p: LoadProgress) => void,
  signal?: AbortSignal,
): Promise<{ table: WsTable; saved: boolean }> {
  if (typeof Worker === "undefined") {
    return file.text().then((text) => ({ table: { ...loadTable(text, file.name), name }, saved: false }));
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    const stop = () => {
      worker.terminate();
      reject(new DOMException("Cancelled", "AbortError"));
    };
    signal?.addEventListener("abort", stop, { once: true });
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      if (msg.type === "progress") onProgress({ bytes: msg.bytes, total: msg.total, rows: msg.rows });
      else {
        signal?.removeEventListener("abort", stop);
        worker.terminate();
        if (msg.type === "done") resolve({ table: msg.table, saved: msg.saved });
        else reject(new Error(msg.message));
      }
    };
    worker.onerror = (e) => {
      signal?.removeEventListener("abort", stop);
      worker.terminate();
      reject(new Error(e.message || `Could not read ${file.name}.`));
    };
    worker.postMessage({ file, name });
  });
}

/** Workers to run at once: enough to use the cores, few enough not to exhaust memory with many big files. */
export const maxParallel = () => Math.min(4, Math.max(1, (navigator.hardwareConcurrency || 2) - 1));

/** Run async jobs with at most `limit` in flight, in order. */
export async function runLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { status: "fulfilled", value: await fn(items[i]) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return results;
}
