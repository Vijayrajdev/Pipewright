"use client";

import { Typewriter } from "../motion";

const LINES = [
  { text: "$ pipewright infer orders.csv --to bigquery", className: "text-coral" },
  { text: "✓ 9 columns · 4 rows sampled · 2 PII flagged", className: "text-cream/60" },
  { text: "[" },
  { text: '  { "name": "order_id",  "type": "INT64",     "mode": "REQUIRED" },' },
  { text: '  { "name": "email",     "type": "STRING",    "mode": "NULLABLE" },' },
  { text: '  { "name": "created_at","type": "TIMESTAMP", "mode": "REQUIRED" },' },
  { text: '  { "name": "amount",    "type": "FLOAT64",   "mode": "NULLABLE" }' },
  { text: "]" },
];

/** A terminal window that "types" a schema inference run on loop. */
export function LiveDemo() {
  return (
    <div className="ring-animated rounded-2xl shadow-[0_30px_60px_-30px_var(--color-ink)]">
      <div className="overflow-hidden rounded-[calc(1rem-1.5px)] bg-code">
        <div className="flex items-center gap-1.5 border-b border-cream/10 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-coral" />
          <span className="h-2.5 w-2.5 rounded-full bg-coral-soft" />
          <span className="h-2.5 w-2.5 rounded-full bg-ink-soft" />
          <span className="ml-3 font-label text-[11px] tracking-wide text-cream/50">orders.schema.json</span>
        </div>
        <div className="h-[230px] overflow-x-auto overflow-y-hidden overscroll-x-contain p-4 font-mono text-[10.5px] leading-relaxed whitespace-pre text-cream [scrollbar-width:thin] sm:text-xs">
          <Typewriter lines={LINES} speed={18} pause={3200} />
        </div>
      </div>
    </div>
  );
}
