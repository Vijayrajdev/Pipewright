"use client";

import { useRef, useState } from "react";
import { Button, Card, SectionTitle } from "./ui";

const EXAMPLES: Record<string, string> = {
  CSV: `order_id,customer_email,order_date,amount,is_gift
1001,ana@example.com,2024-01-05,129.99,true
1002,,2024-01-06,45.00,false`,
  JSON: `{"event_id": "e-1", "user": {"id": 42, "country": "IN"}, "ts": "2024-03-01T12:00:00Z", "tags": ["web"]}
{"event_id": "e-2", "user": {"id": 43}, "ts": "2024-03-01T12:00:05Z", "tags": []}`,
  DDL: `CREATE TABLE analytics.customers (
  id BIGINT NOT NULL,
  full_name VARCHAR(200),
  signup_at TIMESTAMPTZ NOT NULL,
  plan TEXT DEFAULT 'free'
);`,
};

/** inference samples 1,000 rows, so ~2 MB of a line-based file is plenty */
const SAMPLE_BYTES = 2 * 1024 * 1024;
/** a JSON array must be read whole to be valid */
const MAX_JSON_ARRAY_BYTES = 50 * 1024 * 1024;
/** above this, the text box shows a read-only preview instead of the full text */
const PREVIEW_CHARS = 100_000;

export function InputPanel({ onSubmit }: { onSubmit: (text: string, fileName?: string) => void }) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string>();
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<string>();
  const large = text.length > PREVIEW_CHARS;

  async function loadFile(file: File) {
    const head = await file.slice(0, 64).text();
    const jsonArray = /^\s*\[/.test(head) && !/\.(ndjson|jsonl)$/i.test(file.name);
    let content: string;
    if (jsonArray) {
      if (file.size > MAX_JSON_ARRAY_BYTES) {
        setNotice(`${file.name} is a ${Math.round(file.size / 1e6)} MB JSON array. Convert it to NDJSON, or load it in the Data Model workspace, which streams files of any size.`);
        return;
      }
      content = await file.text();
    } else {
      // only the head of a line-based file is needed for inference
      content = await file.slice(0, SAMPLE_BYTES).text();
      if (file.size > SAMPLE_BYTES) content = content.slice(0, content.lastIndexOf("\n"));
    }
    setNotice(
      file.size > SAMPLE_BYTES && !jsonArray
        ? `Large file (${Math.round(file.size / 1e6)} MB): inferring from the first rows. Use the Data Model workspace for full-file stats.`
        : undefined,
    );
    setText(content);
    setFileName(file.name);
    onSubmit(content, file.name);
  }

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <SectionTitle index="01">Input</SectionTitle>
        <div className="flex gap-1 text-xs">
          <span className="self-center text-muted">Try:</span>
          {Object.entries(EXAMPLES).map(([label, sample]) => (
            <button
              key={label}
              onClick={() => {
                setText(sample);
                setFileName(undefined);
                onSubmit(sample);
              }}
              className="rounded px-2.5 py-2 text-ink hover:bg-ink-soft sm:px-2 sm:py-1"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) loadFile(file);
        }}
        className={`border-2 border-dashed transition-all duration-300 ${dragging ? "scale-[1.01] border-coral bg-coral-soft/40" : "border-line hover:border-ink/40"}`}
      >
        {large ? (
          <pre className="h-48 overflow-hidden p-3 font-mono text-xs leading-relaxed text-muted">
            {text.slice(0, 4000)}
            {"\n…"}
          </pre>
        ) : (
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setFileName(undefined);
            }}
            placeholder="Paste a CSV or JSON sample, a BigQuery/Avro schema, or a CREATE TABLE statement. Or drop a file here."
            spellCheck={false}
            className="block h-48 w-full resize-y rounded-lg bg-transparent p-3 font-mono text-xs leading-relaxed outline-none"
          />
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button onClick={() => onSubmit(text, fileName)} disabled={!text.trim()}>
          Infer schema
        </Button>
        <Button variant="ghost" onClick={() => fileRef.current?.click()}>
          Upload file
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.tsv,.json,.ndjson,.jsonl,.avsc,.sql,.txt"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) loadFile(file);
            e.target.value = "";
          }}
        />
        {fileName && <span className="truncate text-xs text-muted">{fileName}</span>}
        {large && (
          <button
            onClick={() => {
              setText("");
              setFileName(undefined);
              setNotice(undefined);
            }}
            className="label link-grow text-ink"
          >
            Clear
          </button>
        )}
      </div>
      {notice && <p className="mt-3 animate-fade-in border-l-2 border-coral pl-3 text-xs text-muted">{notice}</p>}
    </Card>
  );
}
