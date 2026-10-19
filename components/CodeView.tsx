"use client";

import { useState } from "react";
import { Button } from "./ui";

function download(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Rendering megabytes of text in the DOM is slow; show a slice, copy/download the whole thing. */
const MAX_DISPLAY_CHARS = 120_000;

/** Dark code block with copy and download buttons. */
export function CodeView({ code, filename }: { code: string; filename: string }) {
  const truncated = code.length > MAX_DISPLAY_CHARS;
  const shown = truncated ? `${code.slice(0, code.lastIndexOf("\n", MAX_DISPLAY_CHARS))}\n\n… preview truncated (${Math.round(code.length / 1000)} KB total). Download or copy for the full file.` : code;
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked; the user can still select the text */
    }
  }

  return (
    <>
      <div className="relative">
        <pre key={filename} className="max-h-[520px] animate-fade-in overflow-auto bg-code p-4 pt-12 font-mono text-xs leading-relaxed text-cream sm:pt-4">
          <code>{shown}</code>
        </pre>
        <div className="absolute top-2 right-2 flex gap-1.5">
          <button
            onClick={copy}
            className="label border border-cream/30 px-3 py-2 text-[10px] text-cream sm:px-2.5 sm:py-1 transition-colors hover:border-cream hover:bg-cream hover:text-night"
          >
            {copied ? "Copied" : "Copy"}
          </button>
          <Button variant="accent" className="px-3! py-2! text-[10px] sm:px-2.5! sm:py-1!" onClick={() => download(filename, code)}>
            Download
          </Button>
        </div>
      </div>
      <p className="mt-2 font-mono text-xs text-muted">{filename}</p>
    </>
  );
}
