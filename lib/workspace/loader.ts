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
): Promise<WsTable> {
  if (typeof Worker === "undefined") {
    return file.text().then((text) => ({ ...loadTable(text, file.name), name }));
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
        if (msg.type === "done") resolve(msg.table);
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
